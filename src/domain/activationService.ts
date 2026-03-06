// src/domain/activationService.ts

import type { ActivateSignalRequest, ActivateSignalResponse, GetOperationResponse } from "../types/api";
import type { DB } from "../storage/db";
import {
  createActivationJob,
  findOperationById,
  updateJobStatus,
} from "../storage/activationRepo";
import { findSignalById } from "../storage/signalRepo";
import { toSignalSummary } from "../mappers/signalMapper";
import { operationId } from "../utils/ids";
import type { Logger } from "../utils/logger";

// Simulated activation completes after ~2 seconds in a real Worker timer.
// For demo purposes, operations will transition via status polling.
const DEMO_COMPLETION_MS = 3000;

export async function activateSignalService(
  db: DB,
  req: ActivateSignalRequest,
  logger: Logger
): Promise<ActivateSignalResponse> {
  // Verify signal exists and activation is supported
  const signal = await findSignalById(db, req.signalId);
  if (!signal) {
    throw new NotFoundError(`Signal not found: ${req.signalId}`);
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
  });

  logger.info("activation_submitted", {
    operationId: opId,
    signalId: req.signalId,
    destination: req.destination,
  });

  // Immediately transition to "processing" to simulate async lifecycle
  // In production this would be a real queue/worker
  await updateJobStatus(db, opId, "processing");

  // Deterministically complete or fail based on demo logic
  // Complete all requests in demo mode
  await updateJobStatus(db, opId, "completed");

  logger.info("activation_completed", { operationId: opId });

  return {
    operationId: opId,
    status: "completed",
    signalId: req.signalId,
    destination: req.destination,
    submittedAt: now,
    estimatedCompletionMs: DEMO_COMPLETION_MS,
  };
}

export async function getOperationService(
  db: DB,
  opId: string
): Promise<GetOperationResponse> {
  const operation = await findOperationById(db, opId);
  if (!operation) {
    throw new NotFoundError(`Operation not found: ${opId}`);
  }

  // Optionally enrich with signal summary
  const signal = await findSignalById(db, operation.signalId);

  return {
    operationId: operation.operationId,
    status: operation.status,
    signalId: operation.signalId,
    destination: operation.destination,
    submittedAt: operation.submittedAt,
    updatedAt: operation.updatedAt,
    ...(operation.completedAt ? { completedAt: operation.completedAt } : {}),
    ...(operation.errorMessage ? { errorMessage: operation.errorMessage } : {}),
    ...(signal ? { signal: toSignalSummary(signal) } : {}),
  };
}

// ── Domain errors ─────────────────────────────────────────────────────────────

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
