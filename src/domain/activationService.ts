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
import { operationId } from "../utils/ids";
import type { Logger } from "../utils/logger";
import type { CanonicalSignal } from "../types/signal";

export async function activateSignalService(
  db: DB,
  req: ActivateSignalRequest,
  logger: Logger
): Promise<ActivateSignalResponse> {
  // Attempt to find signal — if not found, it may be a custom proposal ID that
  // needs lazy creation. Callers should pass signal metadata in that case.
  let signal = await findSignalById(db, req.signalId);

  if (!signal) {
    // Check if caller passed signal data for lazy creation (custom proposals)
    if (req.proposalData) {
      signal = req.proposalData;
      await upsertSignal(db, signal);
      logger.info("proposal_created_on_activation", { signalId: req.signalId });
    } else {
      throw new NotFoundError(`Signal not found: ${req.signalId}`);
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
          destinations: [
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
    });

    await markWebhookFired(db, opId);
    logger.info("webhook_fired", { operationId: opId, webhookUrl, statusCode: res.status });
  } catch (err) {
    logger.error("webhook_failed", { operationId: opId, webhookUrl, error: String(err) });
    // Non-fatal — caller can re-poll
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