// src/federation/genericMcpClient.ts
// Sec-48 Part 1: generic MCP Streamable-HTTP client.
//
// Factored from src/federation/dstilleryClient.ts. Same three-step
// handshake, same SSE-or-JSON response handling, same session TTL —
// but parameterized so it can talk to any AdCP directory agent
// (Adzymic, Claire, Swivel, Content Ignite, ...).
//
// Session lifecycle (unchanged from Dstillery pattern):
//   1. POST initialize → 200 with `mcp-session-id` header (SSE body)
//   2. POST notifications/initialized with that header
//   3. POST tools/list or tools/call with the same header
//
// Differences from the Dstillery client:
//   - Per-URL session cache (Map keyed by mcp_url)
//   - Protocol-version fallback: try 2025-03-26 first, fall back to
//     2024-11-05 on rejection. Some agents reject unknown versions
//     with a JSON-RPC error rather than negotiating.
//   - Tolerates non-SSE JSON responses. Some servers return plain
//     `application/json` for tools/list even after an SSE initialize.
//   - Returns structured probe data (server_info, protocol_version,
//     tool list) so callers can build a capability matrix.
//
// Non-goals for this module:
//   - OAuth / auth headers. If an agent requires auth (none of the
//     current directory seed do), the caller must pass a bearer token
//     via McpClientOptions.bearerToken — we surface it on the request
//     but don't manage the flow.

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpServerInfo {
  name?: string;
  version?: string;
}

export interface McpInitializeResult {
  protocolVersion?: string;
  serverInfo?: McpServerInfo;
  capabilities?: Record<string, unknown>;
}

export interface McpClientOptions {
  /** Absolute HTTPS URL of the agent's /mcp endpoint. */
  url: string;
  /** Optional bearer token for agents that require auth. */
  bearerToken?: string;
  /** Override the client-identification string sent to the agent. */
  clientName?: string;
  /** Override the client version string. */
  clientVersion?: string;
  /** Per-call timeout in ms (default 15_000). */
  timeoutMs?: number;
}

export interface ProbeResult {
  ok: boolean;
  url: string;
  /** Negotiated protocol version, if the handshake succeeded. */
  protocol_version?: string;
  server_info?: McpServerInfo;
  tools: McpTool[];
  error?: string;
  elapsed_ms: number;
}

export interface ToolCallResult {
  ok: boolean;
  /** JSON-RPC result payload (`result.structuredContent` unwrapped if present, else `result`). */
  data?: unknown;
  /** Raw `result` object from the JSON-RPC response. */
  raw?: unknown;
  error?: string;
  elapsed_ms: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const SESSION_TTL_MS = 9 * 60 * 1000;

// Order matters: try newest first, fall back to the version Dstillery
// and most other 2024-era agents implement.
const PROTOCOL_VERSIONS_TO_TRY = ["2025-03-26", "2024-11-05"] as const;

interface CachedSession {
  id: string;
  atMs: number;
  protocolVersion: string;
  serverInfo?: McpServerInfo;
}

// Per-isolate session cache. Cloudflare recycles isolates frequently;
// this is best-effort — we renew on every cold start.
const _sessionByUrl = new Map<string, CachedSession>();

// ── Transport helpers ────────────────────────────────────────────────────────

/**
 * MCP Streamable-HTTP responses come back as either Server-Sent Events
 * (typical for initialize / tools/call) or plain JSON (sometimes for
 * tools/list). Try JSON first, then fall back to SSE last-data-line.
 * Returns null if nothing parseable was found.
 */
export function parseMcpResponse(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  const lines = trimmed.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data: "));
  if (dataLines.length === 0) return null;
  const last = dataLines[dataLines.length - 1]!;
  try { return JSON.parse(last.slice(6)); }
  catch { return null; }
}

function buildHeaders(opts: McpClientOptions, sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) h["mcp-session-id"] = sessionId;
  if (opts.bearerToken) h["Authorization"] = `Bearer ${opts.bearerToken}`;
  return h;
}

async function postJson(
  opts: McpClientOptions,
  body: unknown,
  sessionId: string | undefined,
): Promise<{ status: number; sessionId: string | null; body: unknown | null }> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: buildHeaders(opts, sessionId),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const text = await res.text();
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    body: parseMcpResponse(text),
  };
}

// ── Handshake ────────────────────────────────────────────────────────────────

async function tryInitialize(
  opts: McpClientOptions,
  protocolVersion: string,
): Promise<CachedSession | null> {
  const res = await postJson(
    opts,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: opts.clientName ?? "evgeny_orchestrator",
          version: opts.clientVersion ?? "48.0",
        },
      },
    },
    undefined,
  );

  if (res.status < 200 || res.status >= 300) return null;
  if (!res.sessionId) return null;

  // Some servers return a JSON-RPC error payload even with 200 status.
  const rpc = res.body as {
    error?: { message?: string };
    result?: McpInitializeResult;
  } | null;
  if (rpc?.error) return null;

  const result = rpc?.result ?? {};
  return {
    id: res.sessionId,
    atMs: Date.now(),
    protocolVersion: result.protocolVersion ?? protocolVersion,
    ...(result.serverInfo ? { serverInfo: result.serverInfo } : {}),
  };
}

async function sendInitialized(opts: McpClientOptions, sessionId: string): Promise<void> {
  try {
    await fetch(opts.url, {
      method: "POST",
      headers: buildHeaders(opts, sessionId),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

async function initializeSession(opts: McpClientOptions): Promise<CachedSession | null> {
  for (const version of PROTOCOL_VERSIONS_TO_TRY) {
    const s = await tryInitialize(opts, version);
    if (s) {
      await sendInitialized(opts, s.id);
      return s;
    }
  }
  return null;
}

async function ensureSession(opts: McpClientOptions): Promise<CachedSession | null> {
  const now = Date.now();
  const cached = _sessionByUrl.get(opts.url);
  if (cached && now - cached.atMs < SESSION_TTL_MS) return cached;
  const fresh = await initializeSession(opts);
  if (fresh) _sessionByUrl.set(opts.url, fresh);
  else _sessionByUrl.delete(opts.url);
  return fresh;
}

function invalidateSession(url: string): void {
  _sessionByUrl.delete(url);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Probe an agent: initialize + tools/list. Safe to call repeatedly —
 * results are cached for SESSION_TTL_MS at the session layer.
 */
export async function probeAgent(opts: McpClientOptions): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const session = await ensureSession(opts);
    if (!session) {
      return {
        ok: false,
        url: opts.url,
        tools: [],
        error: "session_init_failed",
        elapsed_ms: Date.now() - start,
      };
    }

    const res = await postJson(
      opts,
      { jsonrpc: "2.0", id: Date.now(), method: "tools/list" },
      session.id,
    );
    const rpc = res.body as {
      error?: { message?: string };
      result?: { tools?: McpTool[] };
    } | null;

    if (rpc?.error) {
      const msg = rpc.error.message ?? "tools_list_error";
      if (/session/i.test(msg)) invalidateSession(opts.url);
      return {
        ok: false,
        url: opts.url,
        protocol_version: session.protocolVersion,
        ...(session.serverInfo ? { server_info: session.serverInfo } : {}),
        tools: [],
        error: msg,
        elapsed_ms: Date.now() - start,
      };
    }

    return {
      ok: true,
      url: opts.url,
      protocol_version: session.protocolVersion,
      ...(session.serverInfo ? { server_info: session.serverInfo } : {}),
      tools: rpc?.result?.tools ?? [],
      elapsed_ms: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      url: opts.url,
      tools: [],
      error: String((e as Error).message || e),
      elapsed_ms: Date.now() - start,
    };
  }
}

/**
 * Call a tool on an agent. Handles session init + one retry on session
 * errors (isolate cache can outlive the server's idle timeout).
 */
export async function callTool(
  opts: McpClientOptions,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const start = Date.now();
  const once = async (sessionId: string): Promise<ToolCallResult> => {
    const res = await postJson(
      opts,
      {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      sessionId,
    );
    const rpc = res.body as {
      error?: { message?: string };
      result?: { structuredContent?: unknown; content?: unknown; isError?: boolean };
    } | null;
    if (!rpc) {
      return { ok: false, error: "empty_or_invalid_response", elapsed_ms: Date.now() - start };
    }
    if (rpc.error) {
      return {
        ok: false,
        error: rpc.error.message ?? "tool_call_error",
        elapsed_ms: Date.now() - start,
      };
    }
    const result = rpc.result ?? {};
    return {
      ok: !result.isError,
      data: result.structuredContent ?? result.content ?? result,
      raw: result,
      elapsed_ms: Date.now() - start,
    };
  };

  try {
    let session = await ensureSession(opts);
    if (!session) {
      return { ok: false, error: "session_init_failed", elapsed_ms: Date.now() - start };
    }
    let r = await once(session.id);
    if (!r.ok && r.error && /session/i.test(r.error)) {
      invalidateSession(opts.url);
      session = await ensureSession(opts);
      if (session) r = await once(session.id);
    }
    return r;
  } catch (e) {
    return {
      ok: false,
      error: String((e as Error).message || e),
      elapsed_ms: Date.now() - start,
    };
  }
}

// Testing hook — exported so unit tests can reset cache between runs.
export function __clearSessionCacheForTests(): void {
  _sessionByUrl.clear();
}
