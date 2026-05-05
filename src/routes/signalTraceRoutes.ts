// src/routes/signalTraceRoutes.ts
//
// Retrieval API for the centralized signals-protocol trace store.
// Read-only, public (matches the demo's posture).
//
//   GET /api/signal-traces                             — last 100 traces
//   GET /api/signal-traces?tool=activate_signal        — filter by tool
//   GET /api/signal-traces?correlation_id=…            — all frames in a ceremony
//   GET /api/signal-traces?source_prefix=federation:   — outbound only
//   GET /api/signal-traces?agent_id=dstillery          — outbound to one agent
//   GET /api/signal-traces?since_ms=…&limit=N
//   GET /api/signal-traces/snapshot                    — buffer summary stats
//   GET /api/signal-traces/:trace_id                   — single trace by id
//
// Demo surfaces (Recent Activations, Orchestrator, Race Canvas, Brand
// Canvas, Federation) hit these endpoints to render their trace
// inspectors via the shared viewer component.

import {
  getSignalTraces,
  getSignalTraceById,
  snapshotSignalTraces,
  type SignalToolName,
} from "../domain/signalTrace";

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function jsonNotFound(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function handleSignalTracesList(request: Request): Response {
  const url = new URL(request.url);
  const sp = url.searchParams;
  const toolParam = sp.get("tool");
  const tool: SignalToolName | undefined = toolParam === "get_signals" || toolParam === "activate_signal" ? toolParam : undefined;
  const sourcePrefix = sp.get("source_prefix") ?? undefined;
  const correlationId = sp.get("correlation_id") ?? undefined;
  const agentId = sp.get("agent_id") ?? undefined;
  const sinceMs = parseInt(sp.get("since_ms") ?? "0", 10) || 0;
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "100", 10) || 100));

  const traces = getSignalTraces({
    ...(tool ? { tool } : {}),
    ...(sourcePrefix ? { source_prefix: sourcePrefix } : {}),
    ...(correlationId ? { correlation_id: correlationId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(sinceMs > 0 ? { since_ms: sinceMs } : {}),
    limit,
  });
  return jsonOk({ traces, count: traces.length });
}

export function handleSignalTracesSnapshot(): Response {
  return jsonOk(snapshotSignalTraces());
}

export function handleSignalTraceById(traceId: string): Response {
  const trace = getSignalTraceById(traceId);
  if (!trace) return jsonNotFound(`trace not found: ${traceId}`);
  return jsonOk(trace);
}
