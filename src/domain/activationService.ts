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
} from "../storage/activationRepo";
import { findSignalById, upsertSignal } from "../storage/signalRepo";
import { getProposal, deleteProposal } from "../storage/proposalCache";
import { operationId } from "../utils/ids";
import type { Logger } from "../utils/logger";
import type { CanonicalSignal } from "../types/signal";

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
  if (!signal.destinations.includes(req.destination)) {
    throw new ValidationError(
      `Signal ${req.signalId} is not available for destination '${req.destination}'`
    );
  }

  const opId = operationId();
  const now = new Date().toISOString();

  await createActivationJob(db, {
    operationId: opId,
    signalId: req.signalId,
    destination: req.destination,
    accountId: req.accountId,
    campaignId: req.campaignId,
    notes: req.notes,
    webhookUrl: req.webhookUrl,
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
 */
export async function getOperationService(
  db: DB,
  opId: string,
  logger: Logger
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

  // Fire webhook if URL provided and not yet fired
  if (
    currentStatus === "completed" &&
    operation.webhookUrl &&
    !operation.webhookFired
  ) {
    await fireWebhook(db, opId, operation.signalId, operation.destination, operation.webhookUrl, logger);
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
 * Non-fatal: logs error but doesn't throw.
 */
async function fireWebhook(
  db: DB,
  opId: string,
  signalId: string,
  destination: string,
  webhookUrl: string,
  logger: Logger
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
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

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "adcp-signals-adaptor/1.0" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    await markWebhookFired(db, opId);
    logger.info("webhook_fired", { operationId: opId, statusCode: res.status });
  } catch (err) {
    logger.error("webhook_failed", { operationId: opId, error: String(err) });
    // Non-fatal — caller can re-poll
  } finally {
    clearTimeout(timeout);
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