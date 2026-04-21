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

export function handleToolLog(request: Request, _env: Env, _logger: Logger): Response {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  return jsonResponse({
    entries: recent(limit),
    limit,
    // Documented limitation — dashboards should display this banner
    // so operators understand what they're seeing.
    scope: "this_isolate_only",
    note: "Isolate-local ring buffer. Last 50 tools/call entries. Does not persist across deploys or isolate recycles.",
  });
}
