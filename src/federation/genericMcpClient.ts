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
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}

/** Sec-48b: caller-installed hook to short-circuit probes of our own URL.
 * Cloudflare Workers block a Worker from fetching its own public hostname
 * (Cloudflare error 1042 / 522). When we know the URL is us, return the
 * canonical tool list without hitting the network. The hook accepts a URL
 * and returns a synth ProbeResult payload if the URL is self, null otherwise. */
type SelfProbeHook = (url: string) => { server_info?: { name: string; version?: string }; tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> } | null;
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
      result?: { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> };
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
  // When isError is true, MCP spec puts the error narrative in
  // content[0].text. Surface it as out.error so upstream UI shows the
  // diagnostic instead of a bare "err" pill. Without this, a vendor
  // rejecting our payload (e.g. Dstillery's Pydantic validator on
  // unknown `pagination` field) presents identically to a network drop.
  if (body.result.isError) {
    const content = body.result.content;
    if (Array.isArray(content)) {
      const firstText = content.find((c) => c && typeof c === "object" && (c as { type?: string }).type === "text");
      const text = (firstText as { text?: string } | undefined)?.text;
      if (typeof text === "string" && text.trim().length > 0) {
        out.error = text.trim().slice(0, 500);
      }
    }
    if (!out.error) out.error = "tool_error_no_message";
  }
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

// ── Wave 2: per-agent circuit breaker + retry wrapper ───────────────────────
//
// Wraps callAgentTool with:
//   - Per-URL circuit breaker (open after N consecutive failures;
//     half-open after a cooldown window)
//   - Exponential-backoff retry on transient errors (NOT on auth-gates,
//     which are deterministic — retrying just doubles the latency)
//
// Auth-gate detection mirrors the regex used in dspRoutes.ts +
// the Brand Canvas auth-callout. Don't retry on those; they're
// stable rejections.

type CircuitStateName = "closed" | "open" | "half_open";

interface CircuitState {
  state: CircuitStateName;
  failure_count: number;
  last_failure_ts: number;
  // Total successes since last open — exposed for /admin diagnostics.
  success_count: number;
  // Last circuit-event timestamp (any state change).
  last_event_ts: number;
}

const CIRCUIT_BREAKERS = new Map<string, CircuitState>();

const CIRCUIT_FAILURE_THRESHOLD = 3;        // open after 3 consecutive
const CIRCUIT_OPEN_DURATION_MS = 60_000;     // 60s before half-open
const RETRY_MAX_DEFAULT = 1;                // 1 transient retry
const RETRY_BACKOFF_BASE_MS = 250;          // 250ms · 500ms · ...
const AUTH_GATE_PATTERN = /401|unauthorized|tenant policy|principal id|authentication required|auth_token_invalid/i;

function getCircuit(url: string): CircuitState {
  let c = CIRCUIT_BREAKERS.get(url);
  if (!c) {
    c = { state: "closed", failure_count: 0, last_failure_ts: 0, success_count: 0, last_event_ts: Date.now() };
    CIRCUIT_BREAKERS.set(url, c);
  }
  return c;
}

function onCircuitSuccess(url: string): void {
  const c = getCircuit(url);
  c.failure_count = 0;
  c.success_count++;
  if (c.state !== "closed") {
    c.state = "closed";
    c.last_event_ts = Date.now();
  }
}

function onCircuitFailure(url: string): void {
  const c = getCircuit(url);
  c.failure_count++;
  c.last_failure_ts = Date.now();
  if (c.failure_count >= CIRCUIT_FAILURE_THRESHOLD && c.state !== "open") {
    c.state = "open";
    c.last_event_ts = Date.now();
  }
}

function shouldHalfOpen(c: CircuitState): boolean {
  return c.state === "open" && (Date.now() - c.last_failure_ts >= CIRCUIT_OPEN_DURATION_MS);
}

/**
 * Public diagnostic — surface circuit state for /admin endpoints.
 * Mutating state here is intentionally not allowed (read-only view).
 */
export function getCircuitSnapshot(): Array<{ url: string; state: CircuitStateName; failure_count: number; success_count: number; last_failure_ts: number; last_event_ts: number }> {
  const out: ReturnType<typeof getCircuitSnapshot> = [];
  for (const [url, c] of CIRCUIT_BREAKERS) {
    out.push({ url, state: c.state, failure_count: c.failure_count, success_count: c.success_count, last_failure_ts: c.last_failure_ts, last_event_ts: c.last_event_ts });
  }
  return out;
}

/**
 * Reset all circuits (useful after a deploy or via /admin). NOT exposed
 * via HTTP unless explicitly wired.
 */
export function resetAllCircuits(): void {
  CIRCUIT_BREAKERS.clear();
}

export interface CircuitToolCallResult extends ToolCallResult {
  /** How many retries this call needed (0 if first-try success). */
  retries?: number;
  /** True if the circuit was open and we short-circuited. */
  circuit_open?: boolean;
  /** Circuit state AFTER this call. */
  circuit_state?: CircuitStateName;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drop-in replacement for callAgentTool that adds circuit + retry.
 * Auth-gated errors short-circuit retry (deterministic), but DO count
 * toward the circuit-failure threshold so a flapping vendor still
 * trips the breaker.
 */
export async function callAgentToolWithCircuit(
  url: string,
  name: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number; retries?: number },
): Promise<CircuitToolCallResult> {
  const circuit = getCircuit(url);

  // Closed-or-half-open path. If open, check cooldown.
  if (circuit.state === "open") {
    if (!shouldHalfOpen(circuit)) {
      return {
        ok: false,
        error: `circuit_open: ${url} (${CIRCUIT_FAILURE_THRESHOLD}+ consecutive failures; cooldown ${Math.max(0, CIRCUIT_OPEN_DURATION_MS - (Date.now() - circuit.last_failure_ts))}ms left)`,
        latency_ms: 0,
        circuit_open: true,
        circuit_state: "open",
      };
    }
    circuit.state = "half_open";
    circuit.last_event_ts = Date.now();
  }

  const maxRetries = Math.max(0, opts?.retries ?? RETRY_MAX_DEFAULT);
  let attempts = 0;
  let lastResult: ToolCallResult = { ok: false, error: "no_attempt", latency_ms: 0 };
  while (attempts <= maxRetries) {
    lastResult = await callAgentTool(url, name, args, opts?.timeoutMs ? { timeoutMs: opts.timeoutMs } : {});
    if (lastResult.ok) {
      onCircuitSuccess(url);
      return { ...lastResult, retries: attempts, circuit_state: "closed" };
    }
    const errText = lastResult.error || "";
    const isAuthGated = AUTH_GATE_PATTERN.test(errText);
    if (isAuthGated) break;  // deterministic; don't retry
    attempts++;
    if (attempts <= maxRetries) {
      await sleep(RETRY_BACKOFF_BASE_MS * attempts);
    }
  }
  onCircuitFailure(url);
  return { ...lastResult, retries: attempts, circuit_state: getCircuit(url).state };
}

// ── Wave 2: async operation polling ────────────────────────────────────────
//
// Some AdCP tools are async — they return { task_id, status: "pending" }
// and the caller is expected to poll get_operation_status until status
// is terminal (completed / failed / canceled). Today our orchestrator
// is one-shot and ignores async; this helper closes the gap.
//
// Bounded by total timeout (default 30s) + max polls (default 20).
// Backoff: 500ms · 1s · 2s · 3s · 3s · 3s · ... (capped at 3s).

export interface AsyncOperationStatus {
  task_id?: string;
  status?: string;        // "pending" | "working" | "completed" | "failed" | "canceled" | etc.
  result?: unknown;
  error?: string;
  // Vendors return arbitrary additional fields.
}

export interface PollResult {
  ok: boolean;
  final_status: string;
  poll_count: number;
  total_latency_ms: number;
  final: AsyncOperationStatus | null;
  /** What happened — "terminal_status" / "timeout" / "max_polls" / "error" */
  reason: string;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "succeeded", "rejected", "expired"]);

export async function pollOperationStatus(
  url: string,
  taskId: string,
  opts?: { totalTimeoutMs?: number; maxPolls?: number; toolName?: string },
): Promise<PollResult> {
  const totalTimeoutMs = opts?.totalTimeoutMs ?? 30_000;
  const maxPolls = opts?.maxPolls ?? 20;
  const toolName = opts?.toolName ?? "get_operation_status";
  const start = Date.now();
  let polls = 0;
  let final: AsyncOperationStatus | null = null;
  let lastStatus = "pending";

  while (polls < maxPolls && (Date.now() - start) < totalTimeoutMs) {
    polls++;
    const r = await callAgentTool(url, toolName, { task_id: taskId }, { timeoutMs: 8_000 });
    if (!r.ok) {
      // Failed poll — surface as the result.
      return {
        ok: false,
        final_status: "poll_error",
        poll_count: polls,
        total_latency_ms: Date.now() - start,
        final: null,
        reason: r.error || "unknown",
      };
    }
    const sc = (r.structured_content as AsyncOperationStatus | undefined) ?? {};
    final = sc;
    lastStatus = sc.status || "pending";
    if (TERMINAL_STATUSES.has(lastStatus)) {
      return {
        ok: lastStatus === "completed" || lastStatus === "succeeded",
        final_status: lastStatus,
        poll_count: polls,
        total_latency_ms: Date.now() - start,
        final,
        reason: "terminal_status",
      };
    }
    // Backoff: 500ms · 1s · 2s · 3s · 3s · ...
    const backoff = Math.min(3_000, 500 * Math.pow(2, Math.min(3, polls - 1)));
    await sleep(backoff);
  }

  return {
    ok: false,
    final_status: lastStatus,
    poll_count: polls,
    total_latency_ms: Date.now() - start,
    final,
    reason: polls >= maxPolls ? "max_polls" : "timeout",
  };
}
