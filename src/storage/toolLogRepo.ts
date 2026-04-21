// src/storage/toolLogRepo.ts
// Sec-35: D1-backed MCP tool-call log.
//
// Replaces the isolate-scoped in-memory ring from Sec-33. D1 writes
// survive isolate recycles + deploys, and the dashboard sees tool calls
// regardless of which isolate handled them.
//
// Hot-path contract:
//   - Writes go through ctx.waitUntil so they never block the MCP
//     response. If the insert throws, we swallow it — a broken log
//     must never turn a working tool call into an error.
//   - Argument JSON is truncated at 4 KB before write. Briefs /
//     signal_specs can be arbitrary user text; capping prevents a
//     single row from ballooning the table and leaking anything the
//     caller wanted kept brief.
//   - Response bodies are NEVER stored — only byte counts. Tool
//     responses can contain activation keys, custom-proposal
//     segment_ids, and other things we don't want in a public log.

import { execute, queryAll, type DB } from "./db";
import { operationId } from "../utils/ids";

export interface ToolLogRow {
  id: string;
  toolName: string;
  argumentsJson: string;
  responseSizeBytes: number;
  status: "ok" | "error";
  errorMessage: string | null;
  durationMs: number;
  caller: "authed" | "unauth";
  createdAt: number;
}

const ARG_BYTES_CAP = 4 * 1024;
const TRUNCATION_MARK = "…[truncated]";

function truncateArgs(argsJson: string): string {
  if (argsJson.length <= ARG_BYTES_CAP) return argsJson;
  return argsJson.slice(0, ARG_BYTES_CAP - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}

export async function logCall(
  db: DB,
  entry: {
    toolName: string;
    argumentsJson: string;
    responseSizeBytes: number;
    status: "ok" | "error";
    errorMessage?: string | undefined;
    durationMs: number;
    caller: "authed" | "unauth";
  },
): Promise<void> {
  const id = operationId().replace(/^op_/, "tlog_");
  const truncated = truncateArgs(entry.argumentsJson);
  try {
    await execute(
      db,
      `INSERT INTO mcp_tool_calls
        (id, tool_name, arguments_json, response_size_bytes, status, error_message, duration_ms, caller, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        entry.toolName,
        truncated,
        entry.responseSizeBytes,
        entry.status,
        entry.errorMessage ?? null,
        entry.durationMs,
        entry.caller,
        Date.now(),
      ],
    );
  } catch {
    // Fail open — never let a logging failure propagate back to the
    // MCP handler. Observability is a nice-to-have; tool correctness
    // is the contract.
  }
}

interface Row {
  id: string;
  tool_name: string;
  arguments_json: string;
  response_size_bytes: number;
  status: string;
  error_message: string | null;
  duration_ms: number;
  caller: string;
  created_at: number;
}

function rowToEntry(r: Row): ToolLogRow {
  return {
    id: r.id,
    toolName: r.tool_name,
    argumentsJson: r.arguments_json,
    responseSizeBytes: r.response_size_bytes,
    status: r.status as "ok" | "error",
    errorMessage: r.error_message,
    durationMs: r.duration_ms,
    caller: r.caller as "authed" | "unauth",
    createdAt: r.created_at,
  };
}

export async function recentCalls(
  db: DB,
  opts: { limit?: number; toolName?: string | null } = {},
): Promise<ToolLogRow[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const rows = opts.toolName
    ? await queryAll<Row>(
        db,
        `SELECT * FROM mcp_tool_calls WHERE tool_name = ? ORDER BY created_at DESC LIMIT ?`,
        [opts.toolName, limit],
      )
    : await queryAll<Row>(
        db,
        `SELECT * FROM mcp_tool_calls ORDER BY created_at DESC LIMIT ?`,
        [limit],
      );
  return rows.map(rowToEntry);
}

// Opportunistic cleanup — called at random on a fraction of writes so we
// don't need a scheduled worker. `olderThanMs` is typically 7 days
// (604_800_000) — the ring buffer is meant to be hot-window, not an
// audit archive.
export async function cleanup(db: DB, olderThanMs: number): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  try {
    await execute(db, `DELETE FROM mcp_tool_calls WHERE created_at < ?`, [cutoff]);
  } catch {
    // Non-critical — if this fails, the table grows slowly. Catch here
    // to keep the caller fire-and-forget.
  }
}

export function shouldRunCleanup(): boolean {
  // 1-in-100 writes trigger a cleanup. Cheap amortized cost, no scheduler
  // needed.
  return Math.random() < 0.01;
}
