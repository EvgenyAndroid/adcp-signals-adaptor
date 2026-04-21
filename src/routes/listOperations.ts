// src/routes/listOperations.ts
// GET /operations — paginated list of activation jobs (newest first).
//
// Auth-gated on DEMO_API_KEY. The activations tab in the dashboard
// polls this every 10s while visible, so it also doubles as the
// "status of in-flight activations" feed.
//
// Query params:
//   limit  — default 50, max 200
//   status — optional filter: submitted | working | completed | failed

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { getDb, queryAll } from "../storage/db";
import { jsonResponse, errorResponse, requireAuth } from "./shared";
import type { OperationRecord, OperationStatus } from "../types/api";

interface JobRow {
  operation_id: string;
  signal_id: string;
  destination: string;
  account_id: string | null;
  campaign_id: string | null;
  status: string;
  webhook_url: string | null;
  webhook_fired: number;
  submitted_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
  signal_name: string | null;
}

export async function handleListOperations(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!requireAuth(request, env.DEMO_API_KEY)) {
    return errorResponse(
      "UNAUTHORIZED",
      "Operations list requires the DEMO_API_KEY bearer token.",
      401,
    );
  }

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const statusFilter = url.searchParams.get("status");

  const db = getDb(env);

  // LEFT JOIN to signals so the client can render "Activated: <signal name>"
  // without a second round-trip. A job whose signal_id was later deleted
  // still renders; signal_name just becomes null.
  const rows = statusFilter
    ? await queryAll<JobRow>(
        db,
        `SELECT j.*, s.name AS signal_name
         FROM activation_jobs j
         LEFT JOIN signals s ON s.signal_id = j.signal_id
         WHERE j.status = ?
         ORDER BY j.submitted_at DESC
         LIMIT ?`,
        [statusFilter, limit],
      )
    : await queryAll<JobRow>(
        db,
        `SELECT j.*, s.name AS signal_name
         FROM activation_jobs j
         LEFT JOIN signals s ON s.signal_id = j.signal_id
         ORDER BY j.submitted_at DESC
         LIMIT ?`,
        [limit],
      );

  const operations = rows.map((r) => ({
    operationId: r.operation_id,
    signalId: r.signal_id,
    signalName: r.signal_name ?? null,
    destination: r.destination,
    ...(r.account_id ? { accountId: r.account_id } : {}),
    ...(r.campaign_id ? { campaignId: r.campaign_id } : {}),
    status: r.status as OperationStatus,
    webhookFired: r.webhook_fired === 1,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
    ...(r.completed_at ? { completedAt: r.completed_at } : {}),
    ...(r.error_message ? { errorMessage: r.error_message } : {}),
  }));

  logger.info("operations_list", { count: operations.length, filter: statusFilter ?? "none" });
  return jsonResponse({ operations, count: operations.length, limit });
}
