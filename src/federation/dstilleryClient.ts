// src/federation/dstilleryClient.ts
// Sec-41 Part 3: live A2A federation client for Dstillery's public
// AdCP Signals Discovery Agent MCP endpoint.
//
// Dstillery exposes:
//   https://adcp-signals-agent.dstillery.com/mcp
//   MCP Streamable HTTP 2024-11-05, one tool: get_signals
//   serverInfo.version 2.13.1
//
// Session lifecycle:
//   1. POST initialize → 200 SSE with `mcp-session-id` header
//   2. POST notifications/initialized with that header (body: one JSON-RPC)
//   3. POST tools/call with the same header
//
// Notes:
//   - Response is SSE (`event: message\ndata: {...}`). Must parse the
//     last `data:` line.
//   - Session id expires after idle period (~10 min observed). Retry
//     once on session error.

import { safeRecordSignalTrace, persistSignalTrace } from "../domain/signalTrace";
import { correlationId } from "../utils/ids";
import type { Env } from "../types/env";

export const DSTILLERY_MCP_URL = "https://adcp-signals-agent.dstillery.com/mcp";

// Per-isolate session cache. Cloudflare recycles isolates frequently;
// this is best-effort, we renew on every cold start.
let _sessionId: string | null = null;
let _sessionAtMs: number = 0;
// Cache the peer's advertised serverInfo from the initialize handshake
// so dstillerySearch can plumb it into the trace record (peer version
// chip in the viewer). Pulled live from Dstillery's response — never
// hardcoded.
let _peerServerInfo: { name?: string; version?: string } | null = null;
const SESSION_TTL_MS = 9 * 60 * 1000;

function parseSSE(text: string): unknown | null {
  // Take the last `data: ...` line
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data: "));
  if (dataLines.length === 0) return null;
  const last = dataLines[dataLines.length - 1]!;
  try { return JSON.parse(last.slice(6)); }
  catch { return null; }
}

async function initializeSession(): Promise<string | null> {
  const res = await fetch(DSTILLERY_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "evgeny_signals_fed", version: "41.0" },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const sessionId = res.headers.get("mcp-session-id");
  if (!sessionId) return null;
  // Read the initialize response body and pull peer's serverInfo
  // (e.g. { name: "dstillery_signals_agent", version: "2.13.1" }).
  // Cached for trace plumbing — never hardcoded; reflects whatever
  // Dstillery currently advertises. If the peer migrates to 3.0.1
  // the chip will follow without code changes.
  try {
    const bodyText = await res.text();
    const parsed = parseSSE(bodyText) as { result?: { serverInfo?: { name?: string; version?: string } } } | null;
    if (parsed?.result?.serverInfo) {
      _peerServerInfo = parsed.result.serverInfo;
    }
  } catch { /* non-critical — fall through with serverInfo unset */ }
  // Send initialized notification
  try {
    await fetch(DSTILLERY_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
  return sessionId;
}

async function ensureSession(): Promise<string | null> {
  const now = Date.now();
  if (_sessionId && now - _sessionAtMs < SESSION_TTL_MS) return _sessionId;
  _sessionId = await initializeSession();
  _sessionAtMs = now;
  return _sessionId;
}

export interface DstillerySignal {
  signal_agent_segment_id: string;
  name: string;
  description: string;
  data_provider: string;
  signal_type: string;
  coverage_percentage: number;
  pricing?: { cpm: number; currency: string };
  deployments?: Array<{
    platform: string;
    scope?: string;
    is_live?: boolean;
    decisioning_platform_segment_id?: string;
  }>;
}

export interface DstillerySearchResult {
  ok: boolean;
  signals: DstillerySignal[];
  error?: string;
  elapsed_ms: number;
}

async function callGetSignalsOnce(
  sessionId: string,
  args: Record<string, unknown>,
): Promise<{ signals: DstillerySignal[]; error?: string }> {
  const res = await fetch(DSTILLERY_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      // args carries the canonical request payload — signal_spec,
      // max_results, AND context.correlation_id. Dstillery's get_signals
      // validator (Pydantic 2.12) rejects the `pagination` envelope as an
      // "Unexpected keyword argument", but accepts context per AdCP MUST
      // (the v2.13.1 peer echoes context.correlation_id back on response).
      params: { name: "get_signals", arguments: args },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const body = parseSSE(text) as {
    result?: { structuredContent?: { signals?: DstillerySignal[] }; isError?: boolean };
    error?: { code: number; message: string };
  } | null;
  if (!body) return { signals: [], error: "empty_or_invalid_sse" };
  if (body.error) return { signals: [], error: body.error.message };
  const structured = body.result?.structuredContent;
  return { signals: structured?.signals ?? [] };
}

export async function dstillerySearch(
  brief: string,
  maxResults: number = 10,
  env?: Env,
  inboundCorrelationId?: string,
): Promise<DstillerySearchResult> {
  const start = Date.now();
  // Track the request payload separately so we can record it even when
  // the network call throws. The trace recorder captures both successful
  // and failed federation outbounds — same posture as callAgentTool's
  // recorder in genericMcpClient.ts.
  //
  // Inject context.correlation_id (matches the genericMcpClient
  // propagation pattern). When the caller threads an inbound
  // correlation_id, we reuse it; otherwise we generate one. The
  // peer's get_signals response (Dstillery v2.13.1) currently echoes
  // context per spec MUST, so the buyer-side trace can chain.
  const cid = inboundCorrelationId ?? correlationId();
  const requestPayload: Record<string, unknown> = {
    signal_spec: brief,
    max_results: maxResults,
    context: { correlation_id: cid },
  };
  try {
    let session = await ensureSession();
    if (!session) {
      const failResult: DstillerySearchResult = {
        ok: false, signals: [], error: "session_init_failed",
        elapsed_ms: Date.now() - start,
      };
      await _recordDstilleryTrace(env, requestPayload, failResult);
      return failResult;
    }

    let r = await callGetSignalsOnce(session, requestPayload);

    // If session-related error, retry once with a fresh session
    if (r.error && /session/i.test(r.error)) {
      _sessionId = null;
      session = await ensureSession();
      if (session) r = await callGetSignalsOnce(session, requestPayload);
    }

    const result: DstillerySearchResult = {
      ok: !r.error,
      signals: r.signals,
      elapsed_ms: Date.now() - start,
    };
    if (r.error) result.error = r.error;
    await _recordDstilleryTrace(env, requestPayload, result, r);
    return result;
  } catch (e) {
    const errResult: DstillerySearchResult = {
      ok: false,
      signals: [],
      error: String((e as Error).message || e),
      elapsed_ms: Date.now() - start,
    };
    await _recordDstilleryTrace(env, requestPayload, errResult);
    return errResult;
  }
}

/**
 * Helper: record + persist a Dstillery federation trace using the same
 * shape as callAgentTool's recorder in genericMcpClient.ts. Without
 * this, the Federation page's "Fan out" button produces results but
 * the signal-trace modal stays empty for federation:dstillery — which
 * is exactly the bug the user reported pre-workshop.
 *
 * Failures are silent — the trace is observability, not load-bearing.
 */
async function _recordDstilleryTrace(
  env: Env | undefined,
  requestPayload: Record<string, unknown>,
  result: DstillerySearchResult,
  rawCall?: { signals?: unknown[]; error?: string },
): Promise<void> {
  try {
    // Build a response payload that mirrors what the wire actually
    // returned. When the call succeeded, the structuredContent is
    // { signals: [...] }. When it failed, surface the error string
    // so the trace's response section shows context.
    const responsePayload: Record<string, unknown> = result.ok
      ? { signals: result.signals }
      : { error: result.error ?? "unknown_error" };
    const trace = safeRecordSignalTrace({
      tool_name: "get_signals",
      direction: "outbound",
      source: "federation:dstillery",
      caller_agent: "dstillery",
      endpoint_url: DSTILLERY_MCP_URL,
      // Peer-advertised serverInfo from the live MCP handshake.
      // Surfacing this lets the viewer show "v2.13.1" next to our
      // "validating against /v3/..." banner — version drift is
      // self-evident, no narration required.
      peer_server_info: _peerServerInfo,
      request_payload: requestPayload,
      response_payload: responsePayload,
      response_status: result.ok ? "ok" : "error",
      ...(result.error ? { response_error_message: result.error } : {}),
      duration_ms: result.elapsed_ms,
    });
    if (env && trace) await persistSignalTrace(env, trace);
    void rawCall;
  } catch { /* observability never breaks the call path */ }
}
