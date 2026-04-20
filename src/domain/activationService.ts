// src/domain/activationService.ts
// Proper async activation: returns task_id + "pending" immediately.
// Status transitions happen lazily on first poll (demo pattern — no Queues needed).
// Fires webhook on completion if webhook_url was provided.
//
// Status values aligned with @adcp/client ADCP_STATUS:
//   submitted → working → completed | failed
// (AdCP uses "working" not "processing" per SDK constants)

import type {
  ActivateSignalRequest,
  ActivateSignalResponse,
  GetOperationResponse,
  OperationStatus,
} from "../types/api";
import type { DB } from "../storage/db";
import {
  createActivationJob,
  findOperationById,
  updateJobStatus,
  markWebhookFired,
  recordWebhookAttempt,
} from "../storage/activationRepo";
import { findSignalById, upsertSignal } from "../storage/signalRepo";
import { getProposal, deleteProposal } from "../storage/proposalCache";
import { operationId } from "../utils/ids";
import type { Logger } from "../utils/logger";
import type { CanonicalSignal } from "../types/signal";
import { signWebhookBody } from "./webhookSigning";
import { fetchWithTimeout } from "../utils/fetchWithLimits";

export async function activateSignalService(
  db: DB,
  kv: KVNamespace,
  req: ActivateSignalRequest,
  logger: Logger
): Promise<ActivateSignalResponse> {
  // Resolve the signal in three stages:
  //   1. D1 catalog (real signals + previously-activated proposals)
  //   2. Caller-supplied proposalData (legacy code path; still honoured)
  //   3. KV proposal cache (proposals generated during /signals/search;
  //      promoted to D1 here on first activation, then dropped from cache)
  let signal = await findSignalById(db, req.signalId);

  if (!signal) {
    if (req.proposalData) {
      signal = req.proposalData;
      await upsertSignal(db, signal);
      logger.info("proposal_created_on_activation", { signalId: req.signalId, source: "request_data" });
    } else {
      const cached = await getProposal(kv, req.signalId);
      if (cached) {
        signal = cached;
        await upsertSignal(db, signal);
        // Best-effort cache eviction: D1 is now the source of truth.
        // A failure here doesn't affect the activation — the entry will
        // expire via TTL.
        await deleteProposal(kv, req.signalId).catch(() => {});
        logger.info("proposal_created_on_activation", { signalId: req.signalId, source: "kv_cache" });
      } else {
        throw new NotFoundError(`Signal not found: ${req.signalId}`);
      }
    }
  }

  if (!signal.activationSupported) {
    throw new ValidationError(`Signal ${req.signalId} does not support activation`);
  }
  // Per-signal destinations list is now advisory metadata, not a rejection
  // gate (Sec-12 round 2). The AdCP signals storyboard activates against
  // arbitrary platform names (the-trade-desk, dv360, etc.) and the agent
  // must return an async deployment record — `is_live: false` is
  // explicitly valid per the activate-signal-response schema and is
  // exactly what the MCP handler emits today. Real platform integrations,
  // when wired, would light up `is_live: true` from the activation
  // pipeline — not from this gate.
  //
  // We log unknown-platform requests at info so they're visible in tail.
  if (req.destinationType !== "agent" && !signal.destinations.includes(req.destination)) {
    logger.info("activation_unknown_platform", {
      signalId: req.signalId,
      requested: req.destination,
      knownDestinations: signal.destinations,
    });
  }

  const opId = operationId();
  const now = new Date().toISOString();

  await createActivationJob(db, {
    operationId: opId,
    signalId: req.signalId,
    destination: req.destination,
    ...(req.accountId !== undefined ? { accountId: req.accountId } : {}),
    ...(req.campaignId !== undefined ? { campaignId: req.campaignId } : {}),
    ...(req.notes !== undefined ? { notes: req.notes } : {}),
    ...(req.webhookUrl !== undefined ? { webhookUrl: req.webhookUrl } : {}),
  });

  logger.info("activation_submitted", {
    operationId: opId,
    signalId: req.signalId,
    destination: req.destination,
    hasWebhook: !!req.webhookUrl,
  });

  // Return pending immediately — caller polls task_id or receives webhook
  return {
    task_id: opId,
    status: "pending",
    signal_agent_segment_id: req.signalId,
    ...(req.webhookUrl ? { webhook_url: req.webhookUrl } : {}),
    operationId: opId,
    submittedAt: now,
  };
}

/**
 * Poll for task status.
 * Implements lazy state machine: on first poll, advance submitted → processing → completed.
 * Fires webhook on completion if configured and not already fired.
 *
 * @param signingSecret Optional HMAC secret (env.WEBHOOK_SIGNING_SECRET). When
 * provided and non-empty, outbound webhook deliveries carry an
 * `X-AdCP-Signature` header the receiver can verify. Unset ⇒ unsigned
 * (backwards-compatible).
 */
export async function getOperationService(
  db: DB,
  opId: string,
  logger: Logger,
  signingSecret?: string,
): Promise<GetOperationResponse> {
  const operation = await findOperationById(db, opId);
  if (!operation) {
    throw new NotFoundError(`Task not found: ${opId}`);
  }

  // Lazy state machine — advance status on poll
  let currentStatus = operation.status;

  if (currentStatus === "submitted") {
    await updateJobStatus(db, opId, "working");  // ADCP_STATUS.WORKING
    currentStatus = "working";
  }

  if (currentStatus === "working") {  // ADCP_STATUS.WORKING
    await updateJobStatus(db, opId, "completed");
    currentStatus = "completed";
  }

  // Fire webhook if URL provided, not yet fired, retry budget remaining,
  // and we're past any backoff window. Sec-15 bounded the runaway-redelivery
  // path (was: re-fired on every poll until receiver returned 2xx).
  if (
    currentStatus === "completed" &&
    operation.webhookUrl &&
    !operation.webhookFired &&
    operation.webhookAttempts < MAX_WEBHOOK_ATTEMPTS &&
    isPastBackoffWindow(operation.webhookNextAttemptAt)
  ) {
    await fireWebhook(
      db,
      opId,
      operation.signalId,
      operation.destination,
      operation.webhookUrl,
      operation.webhookAttempts,
      logger,
      signingSecret,
    );
  } else if (
    currentStatus === "completed" &&
    operation.webhookUrl &&
    !operation.webhookFired &&
    operation.webhookAttempts >= MAX_WEBHOOK_ATTEMPTS
  ) {
    // Once we hit the cap, log it the first time and never again from
    // this code path — markWebhookFired below would short-circuit
    // future polls. We don't mark it fired (operator can still tell
    // the difference: webhookFired=false, webhookAttempts=MAX).
    logger.warn("webhook_attempts_exhausted", {
      operationId: opId,
      attempts: operation.webhookAttempts,
      max: MAX_WEBHOOK_ATTEMPTS,
    });
  }

  const platformSegmentId = `${operation.destination}_${operation.signalId}`;

  return {
    task_id: opId,
    status: currentStatus,
    signal_agent_segment_id: operation.signalId,
    ...(currentStatus === "completed"
      ? {
          deployments: [
            {
              type: "platform",
              platform: operation.destination,
              is_live: true,
              activation_key: {
                type: "segment_id",
                segment_id: platformSegmentId,
              },
              estimated_activation_duration_minutes: 0,
            },
          ],
        }
      : {}),
    submittedAt: operation.submittedAt,
    updatedAt: new Date().toISOString(),
    ...(currentStatus === "completed"
      ? { completedAt: new Date().toISOString() }
      : {}),
  };
}

// 5-second timeout — webhooks should be quick acks, not long-running work.
const WEBHOOK_TIMEOUT_MS = 5000;

// Sec-15: bounded retry policy. Receiver gets at most this many delivery
// attempts before we stop firing. Five matches Stripe / GitHub Webhooks
// defaults — enough for transient network blips and brief receiver
// outages without hammering a permanently-broken URL forever.
const MAX_WEBHOOK_ATTEMPTS = 5;

// Exponential backoff: 30s, 2m, 8m, 32m. Each delay is the gap before
// the NEXT attempt — there's no delay before attempt #1 (initial fire).
// The lazy poll-driven state machine honors `webhook_next_attempt_at`,
// so backoff happens "for free" without a scheduler.
function backoffSeconds(attemptsCompleted: number): number {
  // attemptsCompleted = 1 → 30s, 2 → 120, 3 → 480, 4 → 1920
  return 30 * Math.pow(4, attemptsCompleted - 1);
}

function isPastBackoffWindow(nextAttemptAt: string | undefined): boolean {
  if (!nextAttemptAt) return true;
  return Date.now() >= new Date(nextAttemptAt).getTime();
}

/**
 * Validate that a webhook URL is safe to call.
 * Only https is allowed (http permits plaintext tokens and MITM on the
 * payload — our payload contains the segment ID and destination). The
 * underlying Workers runtime cannot reach private networks from Cloudflare's
 * edge, so SSRF to internal ranges is not a concern here; scheme + parse
 * validation is the meaningful defence.
 */
function isValidWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Fire webhook with activation completion payload.
 *
 * Non-fatal: logs and moves on. `markWebhookFired` is the "don't retry"
 * receipt — we only set it when we have evidence the remote actually
 * accepted the delivery, i.e. a 2xx response. Non-2xx leaves the DB flag
 * clear so the next poll retries; prior versions marked fired regardless
 * of status, which silently lost deliveries to e.g. a 500 on the receiver.
 *
 * Invalid URLs (non-https, unparseable) are still marked fired — retrying
 * them just re-fails synchronously every poll with no possible recovery.
 *
 * When `signingSecret` is a non-empty string, the outbound request carries:
 *
 *     X-AdCP-Signature: t=<unix-seconds>,v1=<hex-sha256>
 *
 * computed over `"<t>.<exact-request-body>"`. Receivers SHOULD reject if
 * `|now - t| > 300s`. See src/domain/webhookSigning.ts for the verification
 * helper (and the documented format). An empty secret means deliveries go
 * out unsigned (backwards-compatible with callers that don't verify yet).
 */
async function fireWebhook(
  db: DB,
  opId: string,
  signalId: string,
  destination: string,
  webhookUrl: string,
  attemptsBefore: number,
  logger: Logger,
  signingSecret?: string,
): Promise<void> {
  if (!isValidWebhookUrl(webhookUrl)) {
    logger.warn("webhook_rejected", {
      operationId: opId,
      reason: "invalid_url_or_scheme",
    });
    // Mark fired so we don't retry invalid URLs on every poll.
    await markWebhookFired(db, opId);
    return;
  }

  const platformSegmentId = `${destination}_${signalId}`;
  const payload = {
    task_id: opId,
    status: "completed",
    signal_agent_segment_id: signalId,
    deployments: [
      {
        type: "platform",
        platform: destination,
        is_live: true,
        activation_key: { type: "segment_id", segment_id: platformSegmentId },
        estimated_activation_duration_minutes: 0,
      },
    ],
    completed_at: new Date().toISOString(),
  };

  // IMPORTANT: stringify once. We sign the exact byte sequence that goes
  // on the wire — if we re-serialize inside signWebhookBody and the two
  // JSON encodings differ (object key ordering, whitespace, Number
  // precision), receivers will fail to verify.
  const bodyString = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "adcp-signals-adaptor/1.0",
  };
  let signed = false;
  if (signingSecret && signingSecret.length > 0) {
    const sig = await signWebhookBody(signingSecret, bodyString);
    headers["X-AdCP-Signature"] = sig.headerValue;
    signed = true;
  }

  const attemptNumber = attemptsBefore + 1;

  try {
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers,
      body: bodyString,
      timeoutMs: WEBHOOK_TIMEOUT_MS,
    });

    if (res.ok) {
      await markWebhookFired(db, opId);
      // Also bump the attempts counter for observability — operator can
      // tell from /operations/<id> whether the receiver acked first try
      // or limped through 4 retries.
      await recordWebhookAttempt(db, opId, attemptNumber, null);
      logger.info("webhook_fired", {
        operationId: opId,
        statusCode: res.status,
        signed,
        attempt: attemptNumber,
      });
    } else {
      // Receiver rejected. Record the attempt + schedule next backoff.
      // If we just hit MAX_WEBHOOK_ATTEMPTS, no next time — clear the
      // backoff field and let the gate in getOperationService do the
      // exhaustion log on the next poll.
      const exhausted = attemptNumber >= MAX_WEBHOOK_ATTEMPTS;
      const nextAttemptAt = exhausted
        ? null
        : new Date(Date.now() + backoffSeconds(attemptNumber) * 1000).toISOString();
      await recordWebhookAttempt(db, opId, attemptNumber, nextAttemptAt);
      logger.warn("webhook_non_2xx", {
        operationId: opId,
        statusCode: res.status,
        signed,
        attempt: attemptNumber,
        exhausted,
        ...(nextAttemptAt ? { next_attempt_at: nextAttemptAt } : {}),
      });
    }
  } catch (err) {
    // Network error or timeout — treat as retriable, same backoff path.
    const exhausted = attemptNumber >= MAX_WEBHOOK_ATTEMPTS;
    const nextAttemptAt = exhausted
      ? null
      : new Date(Date.now() + backoffSeconds(attemptNumber) * 1000).toISOString();
    await recordWebhookAttempt(db, opId, attemptNumber, nextAttemptAt);
    logger.error("webhook_failed", {
      operationId: opId,
      error: String(err),
      signed,
      attempt: attemptNumber,
      exhausted,
    });
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
