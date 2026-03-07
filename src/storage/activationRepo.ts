// src/storage/activationRepo.ts

import type { OperationRecord, OperationStatus } from "../types/api";
import { queryFirst, execute, queryAll, type DB } from "./db";

interface JobRow {
  operation_id: string;
  signal_id: string;
  destination: string;
  account_id: string | null;
  campaign_id: string | null;
  notes: string | null;
  status: string;
  webhook_url: string | null;
  webhook_fired: number;
  submitted_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
}

function rowToOperation(row: JobRow): OperationRecord {
  return {
    operationId: row.operation_id,
    signalId: row.signal_id,
    destination: row.destination,
    ...(row.account_id ? { accountId: row.account_id } : {}),
    ...(row.campaign_id ? { campaignId: row.campaign_id } : {}),
    status: row.status as OperationStatus,
    ...(row.webhook_url ? { webhookUrl: row.webhook_url } : {}),
    webhookFired: row.webhook_fired === 1,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
  };
}

export async function createActivationJob(
  db: DB,
  job: {
    operationId: string;
    signalId: string;
    destination: string;
    accountId?: string;
    campaignId?: string;
    notes?: string;
    webhookUrl?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    db,
    `INSERT INTO activation_jobs
      (operation_id, signal_id, destination, account_id, campaign_id, notes, webhook_url, status, submitted_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      job.operationId,
      job.signalId,
      job.destination,
      job.accountId ?? null,
      job.campaignId ?? null,
      job.notes ?? null,
      job.webhookUrl ?? null,
      "submitted",
      now,
      now,
    ]
  );

  await appendEvent(db, job.operationId, "submitted", "Activation job submitted");
}

export async function findOperationById(
  db: DB,
  operationId: string
): Promise<OperationRecord | null> {
  const row = await queryFirst<JobRow>(
    db,
    "SELECT * FROM activation_jobs WHERE operation_id = ?",
    [operationId]
  );
  return row ? rowToOperation(row) : null;
}

export async function updateJobStatus(
  db: DB,
  operationId: string,
  status: OperationStatus,
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();
  const completedAt = status === "completed" || status === "failed" ? now : null;

  await execute(
    db,
    `UPDATE activation_jobs
     SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at), error_message = ?
     WHERE operation_id = ?`,
    [status, now, completedAt, errorMessage ?? null, operationId]
  );

  await appendEvent(db, operationId, status, errorMessage);
}

export async function markWebhookFired(db: DB, operationId: string): Promise<void> {
  await execute(
    db,
    "UPDATE activation_jobs SET webhook_fired = 1 WHERE operation_id = ?",
    [operationId]
  );
}

export async function appendEvent(
  db: DB,
  operationId: string,
  eventType: string,
  message?: string
): Promise<void> {
  await execute(
    db,
    "INSERT INTO activation_events (operation_id, event_type, message) VALUES (?,?,?)",
    [operationId, eventType, message ?? null]
  );
}

export async function listJobsBySignal(
  db: DB,
  signalId: string
): Promise<OperationRecord[]> {
  const rows = await queryAll<JobRow>(
    db,
    "SELECT * FROM activation_jobs WHERE signal_id = ? ORDER BY submitted_at DESC",
    [signalId]
  );
  return rows.map(rowToOperation);
}
