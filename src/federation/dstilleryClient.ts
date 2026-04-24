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

export const DSTILLERY_MCP_URL = "https://adcp-signals-agent.dstillery.com/mcp";

// Per-isolate session cache. Cloudflare recycles isolates frequently;
// this is best-effort, we renew on every cold start.
let _sessionId: string | null = null;
let _sessionAtMs: number = 0;
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
  // Read (and discard) the initialize response body so the stream closes
  await res.text();
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
  brief: string,
  maxResults: number,
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
      params: {
        name: "get_signals",
        arguments: { signal_spec: brief, max_results: maxResults },
      },
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
): Promise<DstillerySearchResult> {
  const start = Date.now();
  try {
    let session = await ensureSession();
    if (!session) return { ok: false, signals: [], error: "session_init_failed", elapsed_ms: Date.now() - start };

    let r = await callGetSignalsOnce(session, brief, maxResults);

    // If session-related error, retry once with a fresh session
    if (r.error && /session/i.test(r.error)) {
      _sessionId = null;
      session = await ensureSession();
      if (session) r = await callGetSignalsOnce(session, brief, maxResults);
    }

    const result: DstillerySearchResult = {
      ok: !r.error,
      signals: r.signals,
      elapsed_ms: Date.now() - start,
    };
    if (r.error) result.error = r.error;
    return result;
  } catch (e) {
    return {
      ok: false,
      signals: [],
      error: String((e as Error).message || e),
      elapsed_ms: Date.now() - start,
    };
  }
}
