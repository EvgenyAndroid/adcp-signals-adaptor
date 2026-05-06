// src/routes/signalTraceRoutes.ts
//
// Retrieval API for the centralized signals-protocol trace store.
// Read-only, public (matches the demo's posture).
//
//   GET    /api/signal-traces                             — last 100 traces (in-memory + KV merged)
//   GET    /api/signal-traces?tool=activate_signal        — filter by tool
//   GET    /api/signal-traces?correlation_id=…            — all frames in a ceremony
//   GET    /api/signal-traces?source_prefix=federation:   — outbound only
//   GET    /api/signal-traces?agent_id=dstillery          — outbound to one agent
//   GET    /api/signal-traces?since_ms=…&limit=N
//   GET    /api/signal-traces/snapshot                    — buffer summary stats
//   GET    /api/signal-traces/:trace_id                   — single trace by id
//   DELETE /api/signal-traces                             — wipe in-memory + KV (demo "reset")
//
// Demo surfaces (Recent Activations, Orchestrator, Race Canvas, Brand
// Canvas, Federation) hit these endpoints to render their trace
// inspectors via the shared viewer component.

import {
  getSignalTraceByIdPersisted,
  listSignalTracesPersisted,
  snapshotSignalTracesPersisted,
  clearSignalTraces,
  type SignalToolName,
} from "../domain/signalTrace";
import type { Env } from "../types/env";

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

export async function handleSignalTracesList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sp = url.searchParams;
  const toolParam = sp.get("tool");
  const tool: SignalToolName | undefined = toolParam === "get_signals" || toolParam === "activate_signal" ? toolParam : undefined;
  const sourcePrefix = sp.get("source_prefix") ?? undefined;
  const correlationId = sp.get("correlation_id") ?? undefined;
  const agentId = sp.get("agent_id") ?? undefined;
  const sinceMs = parseInt(sp.get("since_ms") ?? "0", 10) || 0;
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "100", 10) || 100));

  // Read merges in-memory + KV. In-memory wins on conflict (freshest).
  // KV provides cross-isolate continuity — without it the modal is
  // empty when the user reopens it on a fresh isolate (the actual bug
  // the workshop demo hit).
  const traces = await listSignalTracesPersisted(env, {
    ...(tool ? { tool } : {}),
    ...(sourcePrefix ? { source_prefix: sourcePrefix } : {}),
    ...(correlationId ? { correlation_id: correlationId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(sinceMs > 0 ? { since_ms: sinceMs } : {}),
    limit,
  });
  return jsonOk({ traces, count: traces.length });
}

export async function handleSignalTracesSnapshot(env: Env): Promise<Response> {
  return jsonOk(await snapshotSignalTracesPersisted(env));
}

export async function handleSignalTraceById(traceId: string, env: Env): Promise<Response> {
  const trace = await getSignalTraceByIdPersisted(env, traceId);
  if (!trace) return jsonNotFound(`trace not found: ${traceId}`);
  return jsonOk(trace);
}

/**
 * Demo-only "reset" endpoint. Wipes the in-memory ring buffer for
 * THIS isolate AND best-effort clears the KV index so subsequent
 * reads start clean. Per-trace KV entries TTL out at 6h regardless
 * — the index clear just hides them from the listing.
 *
 * Public on purpose (matches the rest of the demo's posture). Not
 * destructive across isolates because in-memory clear only hits
 * this one — but the KV index clear gives a "fresh start" effect
 * to any reader.
 */
export async function handleSignalTracesClear(env: Env): Promise<Response> {
  clearSignalTraces();
  let kvCleared = false;
  try {
    if (env && env.SIGNALS_CACHE) {
      await env.SIGNALS_CACHE.delete("sigtrace:index");
      kvCleared = true;
    }
  } catch { /* best-effort */ }
  return jsonOk({ ok: true, in_memory_cleared: true, kv_index_cleared: kvCleared });
}
