// src/federation/genericMcpClient.ts
// Sec-48: generic MCP Streamable-HTTP client for probing + calling tools
// on ANY AdCP agent. Factored from the Dstillery-specific dstilleryClient.ts
// (which predates this generalization — it stays in place for its existing
// callers; once those migrate, it can collapse to a thin wrapper over this).
//
// What's generic:
//   - session handshake (initialize → extract mcp-session-id → notifications/initialized)
//   - SSE response parsing (last `data:` line)
//   - tools/list and tools/call wrappers with per-URL session cache
//   - session TTL + one-shot retry on session-related errors
//
// What's NOT generic (yet):
//   - protocol version (default 2024-11-05, configurable per call)
//   - authentication (some agents may require bearer; current list doesn't)
//   - SSE streaming beyond last-data-line (good enough for tools/call which
//     returns a single response event; not sufficient if we ever consume
//     streamed intermediate events)
//
// Per-isolate session cache keyed by URL. Cloudflare recycles isolates
// frequently; this is best-effort, we renew on every cold start.

const SESSION_TTL_MS = 9 * 60 * 1000;
/** Sentinel used for agents that negotiate stateless MCP (no mcp-session-id header
 * on initialize). Subsequent calls for these agents don't send the header. */
const STATELESS_SESSION = "__stateless__";
const _sessions = new Map<string, { id: string; atMs: number }>();

/** Parse an SSE response body and return the last `data:` payload as JSON. */
function parseSSELastData(text: string): unknown | null {
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data: "));
  if (dataLines.length === 0) {
    // Fallback: maybe the body is plain JSON (some servers don't SSE-frame).
    try { return JSON.parse(text); } catch { return null; }
  }
  const last = dataLines[dataLines.length - 1]!;
  try { return JSON.parse(last.slice(6)); }
  catch { return null; }
}

interface InitOptions {
  protocolVersion?: string;
  clientInfo?: { name: string; version: string };
  timeoutMs?: number;
}

async function initializeSession(url: string, opts: InitOptions = {}): Promise<{ sessionId: string | null; serverInfo?: { name: string; version?: string }; protocolVersion?: string; error?: string }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const protocolVersion = opts.protocolVersion ?? "2024-11-05";
  const clientInfo = opts.clientInfo ?? { name: "evgeny_signals_probe", version: "48.0" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion, capabilities: {}, clientInfo },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sessionId: null, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const headerSessionId = res.headers.get("mcp-session-id");
    const bodyText = await res.text();
    const parsed = parseSSELastData(bodyText) as {
      result?: {
        serverInfo?: { name: string; version?: string };
        protocolVersion?: string;
      };
      error?: { code: number; message: string };
    } | null;
    // Sec-48b: an initialize response with a successful `result` body means the
    // server is live MCP. If it also returned a session id header, the server
    // is stateful; otherwise it negotiated stateless transport (call each
    // method independently, no session header). Treat both as success.
    let sessionId: string | null = null;
    if (headerSessionId) sessionId = headerSessionId;
    else if (parsed?.result && !parsed.error) sessionId = STATELESS_SESSION;
    const result: {
      sessionId: string | null;
      serverInfo?: { name: string; version?: string };
      protocolVersion?: string;
      error?: string;
    } = { sessionId };
    if (parsed?.result?.serverInfo) result.serverInfo = parsed.result.serverInfo;
    if (parsed?.result?.protocolVersion) result.protocolVersion = parsed.result.protocolVersion;
    if (parsed?.error) result.error = parsed.error.message;
    // Post-initialize notification (best-effort — many stateful servers require
    // it before tool calls; stateless servers accept it as a no-op).
    if (sessionId) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        };
        if (sessionId !== STATELESS_SESSION) headers["mcp-session-id"] = sessionId;
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch { /* non-critical */ }
    }
    return result;
  } catch (e) {
    return { sessionId: null, error: String((e as Error).message || e) };
  }
}

async function ensureSession(url: string, opts?: InitOptions): Promise<string | null> {
  const now = Date.now();
  const cached = _sessions.get(url);
  if (cached && now - cached.atMs < SESSION_TTL_MS) return cached.id;
  const init = await initializeSession(url, opts);
  if (init.sessionId) {
    _sessions.set(url, { id: init.sessionId, atMs: now });
  }
  return init.sessionId;
}

/** Clear a cached session (e.g. on session-related error). */
function invalidateSession(url: string): void {
  _sessions.delete(url);
}

// ── Probe ──────────────────────────────────────────────────────────────────

export interface ProbeResult {
  url: string;
  alive: boolean;
  error?: string;
  latency_ms: number;
  server_info?: { name: string; version?: string };
  protocol_version?: string;
  tools?: Array<{ name: string; description?: string }>;
}

/** Sec-48b: caller-installed hook to short-circuit probes of our own URL.
 * Cloudflare Workers block a Worker from fetching its own public hostname
 * (Cloudflare error 1042 / 522). When we know the URL is us, return the
 * canonical tool list without hitting the network. The hook accepts a URL
 * and returns a synth ProbeResult payload if the URL is self, null otherwise. */
type SelfProbeHook = (url: string) => { server_info?: { name: string; version?: string }; tools?: Array<{ name: string; description?: string }> } | null;
let SELF_PROBE_HOOK: SelfProbeHook | null = null;
export function installSelfProbeHook(hook: SelfProbeHook | null): void { SELF_PROBE_HOOK = hook; }

export async function probeAgent(url: string, opts?: { timeoutMs?: number }): Promise<ProbeResult> {
  const start = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  // Sec-48b: short-circuit self-probe. Cloudflare Workers block a Worker from
  // calling its own public hostname (returns Cloudflare error 1042). We know
  // our own tools from the self-registry — synthesize a probe result from
  // that instead of hitting the network.
  if (SELF_PROBE_HOOK && SELF_PROBE_HOOK(url)) {
    const synth = SELF_PROBE_HOOK(url);
    return {
      url,
      alive: true,
      latency_ms: Date.now() - start,
      ...(synth?.server_info ? { server_info: synth.server_info } : {}),
      ...(synth?.tools ? { tools: synth.tools } : {}),
    };
  }
  const init = await initializeSession(url, { timeoutMs });
  if (!init.sessionId) {
    return {
      url,
      alive: false,
      ...(init.error ? { error: init.error } : { error: "session_init_failed" }),
      latency_ms: Date.now() - start,
    };
  }
  // Cache the fresh session so follow-up calls can reuse it.
  _sessions.set(url, { id: init.sessionId, atMs: start });
  // tools/list
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    };
    if (init.sessionId !== STATELESS_SESSION) headers["mcp-session-id"] = init.sessionId;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    const body = parseSSELastData(text) as {
      result?: { tools?: Array<{ name: string; description?: string }> };
      error?: { code: number; message: string };
    } | null;
    const result: ProbeResult = {
      url,
      alive: true,
      latency_ms: Date.now() - start,
    };
    if (init.serverInfo) result.server_info = init.serverInfo;
    if (init.protocolVersion) result.protocol_version = init.protocolVersion;
    if (body?.result?.tools) result.tools = body.result.tools;
    if (body?.error) result.error = body.error.message;
    return result;
  } catch (e) {
    return {
      url,
      alive: false,
      error: String((e as Error).message || e),
      latency_ms: Date.now() - start,
      ...(init.serverInfo ? { server_info: init.serverInfo } : {}),
    };
  }
}

/** Probe many agents in parallel with a per-call timeout. */
export async function probeAgents(urls: string[], opts?: { timeoutMs?: number }): Promise<ProbeResult[]> {
  return Promise.all(urls.map((u) => probeAgent(u, opts)));
}

// ── Tool call ──────────────────────────────────────────────────────────────

export interface ToolCallResult {
  ok: boolean;
  error?: string;
  latency_ms: number;
  content?: unknown;
  structured_content?: unknown;
  is_error?: boolean;
}

async function callToolOnce(url: string, sessionId: string, name: string, args: Record<string, unknown>, timeoutMs: number): Promise<ToolCallResult> {
  const start = Date.now();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId !== STATELESS_SESSION) headers["mcp-session-id"] = sessionId;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0", id: Date.now(), method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  const body = parseSSELastData(text) as {
    result?: {
      content?: unknown;
      structuredContent?: unknown;
      isError?: boolean;
    };
    error?: { code: number; message: string };
  } | null;
  const elapsed = Date.now() - start;
  if (body?.error) {
    return { ok: false, error: body.error.message, latency_ms: elapsed };
  }
  if (!body?.result) {
    return { ok: false, error: "empty_or_invalid_sse", latency_ms: elapsed };
  }
  const out: ToolCallResult = {
    ok: !body.result.isError,
    latency_ms: elapsed,
  };
  if (body.result.content !== undefined) out.content = body.result.content;
  if (body.result.structuredContent !== undefined) out.structured_content = body.result.structuredContent;
  if (body.result.isError !== undefined) out.is_error = body.result.isError;
  return out;
}

/** Sec-48b: caller-installed hook for self-tool-calls. When the URL is us,
 * the caller supplies a direct-dispatch function that runs the tool in-process
 * (bypassing the HTTP round-trip that Cloudflare Workers would block anyway). */
type SelfToolHook = (url: string, name: string, args: Record<string, unknown>) => Promise<ToolCallResult> | null;
let SELF_TOOL_HOOK: SelfToolHook | null = null;
export function installSelfToolHook(hook: SelfToolHook | null): void { SELF_TOOL_HOOK = hook; }

export async function callAgentTool(url: string, name: string, args: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<ToolCallResult> {
  const timeoutMs = opts?.timeoutMs ?? 20_000;
  const start = Date.now();
  // Sec-48b: if this is a call against our own URL, use the in-process hook
  // to avoid Cloudflare Workers' self-fetch restriction.
  if (SELF_TOOL_HOOK) {
    const selfResult = SELF_TOOL_HOOK(url, name, args);
    if (selfResult) {
      try { return await selfResult; }
      catch (e) { return { ok: false, error: String((e as Error).message || e), latency_ms: Date.now() - start }; }
    }
  }
  try {
    let session = await ensureSession(url, { timeoutMs });
    if (!session) {
      return { ok: false, error: "session_init_failed", latency_ms: Date.now() - start };
    }
    let r = await callToolOnce(url, session, name, args, timeoutMs);
    if (r.error && /session/i.test(r.error)) {
      invalidateSession(url);
      session = await ensureSession(url, { timeoutMs });
      if (session) r = await callToolOnce(url, session, name, args, timeoutMs);
    }
    return r;
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e), latency_ms: Date.now() - start };
  }
}
