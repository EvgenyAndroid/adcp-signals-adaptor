// src/routes/toolLog.ts
// GET /mcp/recent — returns the recent-tool-call ring buffer.
//
// Public by design: this is agent-observability, same spirit as
// /capabilities being readable — a buyer agent shouldn't need a
// credential to see whether the upstream is alive and what kinds
// of calls it's handling. NO arg VALUES leak (see mcp/toolLog.ts)
// so there's no confidentiality surface.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse } from "./shared";
import { recent } from "../mcp/toolLog";
import { getDb } from "../storage/db";
import { recentCalls } from "../storage/toolLogRepo";

export async function handleToolLog(
  request: Request,
  env: Env,
  _logger: Logger,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const toolFilter = url.searchParams.get("tool");

  // Sec-35: D1 is now the canonical store. Fall back to the
  // isolate-local ring buffer only if the D1 read throws (migration
  // not yet applied, binding missing, etc) so the dashboard never
  // shows a hard error on a cold deploy.
  try {
    const db = getDb(env);
    const rows = await recentCalls(db, { limit, toolName: toolFilter });
    const entries = rows.map((r) => ({
      id: r.id,
      ts: new Date(r.createdAt).toISOString(),
      tool: r.toolName,
      argumentsJson: r.argumentsJson,
      latencyMs: r.durationMs,
      responseBytes: r.responseSizeBytes,
      ok: r.status === "ok",
      errorKind: r.errorMessage ?? undefined,
      caller: r.caller,
    }));
    return jsonResponse({
      entries, limit, count: entries.length,
      scope: "d1",
      filter: toolFilter ?? null,
      note: "Persisted in D1 mcp_tool_calls. Cross-isolate visible, 7-day retention.",
    });
  } catch (e) {
    return jsonResponse({
      entries: recent(limit),
      limit,
      scope: "this_isolate_only",
      filter: toolFilter ?? null,
      fallback_reason: e instanceof Error ? e.message : "d1_unavailable",
      note: "D1 unavailable — falling back to isolate-local ring buffer. Apply migration 0006.",
    });
  }
}
