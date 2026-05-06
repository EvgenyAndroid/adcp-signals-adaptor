// src/domain/signalTrace.ts
//
// Centralized recorder for the AdCP Signals protocol handshake.
//
// Captures every get_signals + activate_signal interaction across:
//   - inbound MCP tools/call (src/mcp/server.ts)
//   - inbound REST /signals/* (src/routes/searchSignals.ts, activateSignal.ts)
//   - outbound federation (src/federation/genericMcpClient.ts)
//
// Each trace records the full request + response payloads, validates
// them against the canonical AdCP schemas (@adcp/sdk@3.0.1), and
// keeps the result in an in-memory ring buffer (last 500 traces).
//
// Demo surfaces (Recent Activations, Orchestrator, Race Canvas,
// Federation, Brand Canvas) read traces via GET /api/signal-traces
// and render them through a shared viewer that explains each field
// in marketing terms (the "Glossary" — see signals-glossary.ts).
//
// Storage posture: in-memory only. Survives request-to-request within
// an isolate but not across deploys. Matches the rest of the demo's
// stateless posture. KV/D1 layering is a future PR if you want a
// permanent audit log.

import Ajv from "ajv";
import addFormats from "ajv-formats";

// Vendored AdCP schema corpus. Imported as a single TS module to
// sidestep @adcp/sdk's package.json `exports` field that doesn't
// expose the schemas-data path. Regenerate via:
//   node scripts/vendor-adcp-schemas.mjs
import { loadAdcpCorpus } from "../schemas/adcp";

// ── Types ────────────────────────────────────────────────────────────────────

export type SignalToolName = "get_signals" | "activate_signal";
export type TraceDirection = "inbound" | "outbound";

export interface SchemaValidationResult {
  valid: boolean;
  schema_url: string;
  errors: Array<{ path: string; message: string; keyword: string }>;
}

export interface SignalTrace {
  trace_id: string;
  correlation_id: string | null;
  ts: string;
  duration_ms: number;
  direction: TraceDirection;
  tool_name: SignalToolName;
  /** Source of this trace:
   *    "mcp_external"        — inbound MCP tools/call from a remote agent
   *    "rest_demo"           — inbound REST call from the demo UI
   *    "federation:<id>"     — outbound call to a peer agent (id = our agentRegistry id)
   */
  source: string;
  /** For outbound calls, the agent we called. Null for inbound. */
  caller_agent: string | null;
  request: {
    payload: unknown;
    validation: SchemaValidationResult;
  };
  response: {
    payload: unknown;
    validation: SchemaValidationResult;
    status: "ok" | "error";
    /** When status === "error", this carries the human-readable error message. */
    error_message?: string;
  };
}

// ── Schema URLs (canonical AdCP) ─────────────────────────────────────────────
//
// Surfaced in each trace so consumers know what the payload SHOULD
// match. Same canonical URLs the spec publishes; we run AJV against
// the locally-installed @adcp/sdk schemas which mirror them.

export const SCHEMA_URL = {
  get_signals_request:    "https://adcontextprotocol.org/schemas/v3/signals/get-signals-request.json",
  get_signals_response:   "https://adcontextprotocol.org/schemas/v3/signals/get-signals-response.json",
  activate_signal_request:  "https://adcontextprotocol.org/schemas/v3/signals/activate-signal-request.json",
  activate_signal_response: "https://adcontextprotocol.org/schemas/v3/signals/activate-signal-response.json",
} as const;

// Internal $id values @adcp/sdk uses to register schemas. We resolve
// validators against these, then surface the public URL to consumers.
const SCHEMA_ID = {
  get_signals_request:      "/schemas/3.0.1/signals/get-signals-request.json",
  get_signals_response:     "/schemas/3.0.1/signals/get-signals-response.json",
  activate_signal_request:  "/schemas/3.0.1/signals/activate-signal-request.json",
  activate_signal_response: "/schemas/3.0.1/signals/activate-signal-response.json",
} as const;

// ── AJV setup ────────────────────────────────────────────────────────────────
//
// Lazy-init: the schema corpus is sizeable. Built on first record() call
// so cold isolates don't pay the cost up-front. After init the validators
// are cached for the lifetime of the isolate.

let _ajv: Ajv | null = null;
let _ajvInitFailed = false;

function getAjv(): Ajv | null {
  if (_ajv !== null) return _ajv;
  if (_ajvInitFailed) return null;
  try {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    // Load every schema in @adcp/sdk's 3.0 directory so cross-file $ref
    // resolution works (signal-id, deployment, vendor-pricing-option,
    // etc. are all referenced from the request/response schemas).
    // We import a flat manifest of schemas, registering each by $id.
    // NOTE: Workers bundlers can statically resolve a JSON manifest;
    // we generate it via a small build helper at module load.
    const corpus = loadAdcpCorpus();
    for (const s of corpus) {
      try { ajv.addSchema(s); } catch { /* duplicate / partial — skip */ }
    }
    _ajv = ajv;
    return _ajv;
  } catch {
    _ajvInitFailed = true;
    return null;
  }
}

// loadAdcpCorpus() lives in src/schemas/adcp/index.ts — vendored from
// @adcp/sdk by scripts/vendor-adcp-schemas.mjs. Imported above.

function validateAgainst(schemaId: string, schemaUrl: string, payload: unknown): SchemaValidationResult {
  const ajv = getAjv();
  if (!ajv) {
    return {
      valid: true,  // can't validate — don't claim invalid
      schema_url: schemaUrl,
      errors: [{ path: "(meta)", message: "schema validator unavailable in this runtime", keyword: "skipped" }],
    };
  }
  const validator = ajv.getSchema(schemaId);
  if (!validator) {
    return {
      valid: true,
      schema_url: schemaUrl,
      errors: [{ path: "(meta)", message: `schema not registered: ${schemaId}`, keyword: "missing_schema" }],
    };
  }
  const ok = validator(payload);
  if (ok) return { valid: true, schema_url: schemaUrl, errors: [] };
  const errs = (validator.errors || []).slice(0, 12).map((e) => ({
    path: e.instancePath || "(root)",
    message: e.message || "validation failed",
    keyword: e.keyword || "unknown",
  }));
  return { valid: false, schema_url: schemaUrl, errors: errs };
}

// ── Ring buffer ──────────────────────────────────────────────────────────────

const MAX_TRACES = 500;
const traceBuffer: SignalTrace[] = [];
let traceCounter = 0;

// ── Isolate kill switch ──────────────────────────────────────────────────────
//
// If the recorder ever observes a thrown error path that escapes the inner
// try/catch (shouldn't be possible after hotfix #209, but defense in depth
// because PR #209 didn't actually unstick prod), we flip this and become a
// no-op for the remainder of the isolate's lifetime. Cheaper than risking
// a recurrence on every call.
let _recorderDisabled = false;
export function isRecorderDisabled(): boolean { return _recorderDisabled; }
export function disableRecorderForIsolate(): void { _recorderDisabled = true; }

function nextTraceId(): string {
  traceCounter += 1;
  return `st_${Date.now().toString(36)}_${traceCounter.toString(36)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface RecordSignalTraceInput {
  tool_name: SignalToolName;
  direction: TraceDirection;
  source: string;
  caller_agent?: string | null;
  request_payload: unknown;
  response_payload: unknown;
  response_status: "ok" | "error";
  response_error_message?: string;
  duration_ms: number;
  /**
   * If the request's context.correlation_id exists, pass it through.
   * Otherwise we extract from request_payload at record-time as a
   * fallback.
   */
  correlation_id?: string | null;
}

/**
 * Caller-safe wrapper. Use this from every call site instead of
 * recordSignalTrace directly. If anything in the recorder throws —
 * even something we haven't seen yet — we catch it here, flip the
 * isolate kill switch so subsequent calls short-circuit, and return
 * null. The calling code never sees the throw.
 *
 * This is the belt-and-suspenders to the inner try/catch in
 * recordSignalTrace itself. Hotfix #209 wrapped the body but didn't
 * stop /signals/search from 500ing in prod — defense in depth.
 */
export function safeRecordSignalTrace(input: RecordSignalTraceInput): SignalTrace | null {
  if (_recorderDisabled) return null;
  try {
    return recordSignalTrace(input);
  } catch {
    _recorderDisabled = true;
    return null;
  }
}

export function recordSignalTrace(input: RecordSignalTraceInput): SignalTrace | null {
  // Isolate kill switch — once we've seen one throw escape, we stop
  // trying. This is the belt to hotfix #209's suspenders.
  if (_recorderDisabled) return null;
  // Recording must NEVER throw — a failure in the trace path would
  // break the actual signal call, defeating the entire point of
  // observability. Wrap everything (id generation, AJV validation,
  // buffer mutation) in a top-level try/catch and silently no-op on
  // any error.
  try {
    const reqSchemaId = input.tool_name === "get_signals" ? SCHEMA_ID.get_signals_request : SCHEMA_ID.activate_signal_request;
    const resSchemaId = input.tool_name === "get_signals" ? SCHEMA_ID.get_signals_response : SCHEMA_ID.activate_signal_response;
    const reqSchemaUrl = input.tool_name === "get_signals" ? SCHEMA_URL.get_signals_request : SCHEMA_URL.activate_signal_request;
    const resSchemaUrl = input.tool_name === "get_signals" ? SCHEMA_URL.get_signals_response : SCHEMA_URL.activate_signal_response;

    let correlationId = input.correlation_id ?? null;
    if (correlationId === null && typeof input.request_payload === "object" && input.request_payload !== null) {
      const ctx = (input.request_payload as Record<string, unknown>)["context"];
      if (ctx && typeof ctx === "object") {
        const cid = (ctx as Record<string, unknown>)["correlation_id"];
        if (typeof cid === "string") correlationId = cid;
      }
    }

    const trace: SignalTrace = {
      trace_id: nextTraceId(),
      correlation_id: correlationId,
      ts: new Date().toISOString(),
      duration_ms: Math.max(0, input.duration_ms),
      direction: input.direction,
      tool_name: input.tool_name,
      source: input.source,
      caller_agent: input.caller_agent ?? null,
      request: {
        payload: input.request_payload,
        validation: safeValidate(reqSchemaId, reqSchemaUrl, input.request_payload),
      },
      response: {
        payload: input.response_payload,
        validation: safeValidate(resSchemaId, resSchemaUrl, input.response_payload),
        status: input.response_status,
        ...(input.response_error_message ? { error_message: input.response_error_message } : {}),
      },
    };

    traceBuffer.push(trace);
    while (traceBuffer.length > MAX_TRACES) traceBuffer.shift();
    return trace;
  } catch {
    // AJV setup failed, schema registry threw, ring buffer mutation
    // glitched — whatever it is, we don't surface it. Trace is lost
    // for this call; the underlying signal call proceeds unaffected.
    return null;
  }
}

// Defensive wrapper around validateAgainst — even if the validator
// throws (Workers + AJV have historically had compat quirks), we
// return a benign "skipped" result instead of crashing record path.
function safeValidate(schemaId: string, schemaUrl: string, payload: unknown): SchemaValidationResult {
  try {
    return validateAgainst(schemaId, schemaUrl, payload);
  } catch (e) {
    return {
      valid: true,
      schema_url: schemaUrl,
      errors: [{ path: "(meta)", message: "validator threw: " + String((e as Error).message ?? e), keyword: "skipped" }],
    };
  }
}

export interface SignalTraceQuery {
  tool?: SignalToolName;
  source_prefix?: string;       // e.g. "federation:" matches all outbound
  correlation_id?: string;
  agent_id?: string;            // for outbound, matches caller_agent
  since_ms?: number;            // unix ms — only newer traces
  limit?: number;               // max results, default 100
}

export function getSignalTraces(q: SignalTraceQuery = {}): SignalTrace[] {
  const limit = Math.max(1, Math.min(500, q.limit ?? 100));
  const sinceMs = q.since_ms ?? 0;
  let out = traceBuffer.filter((t) => {
    if (q.tool && t.tool_name !== q.tool) return false;
    if (q.source_prefix && !t.source.startsWith(q.source_prefix)) return false;
    if (q.correlation_id && t.correlation_id !== q.correlation_id) return false;
    if (q.agent_id && t.caller_agent !== q.agent_id) return false;
    if (sinceMs > 0 && new Date(t.ts).getTime() < sinceMs) return false;
    return true;
  });
  // Most recent first
  out = out.slice().reverse();
  return out.slice(0, limit);
}

export function getSignalTraceById(traceId: string): SignalTrace | null {
  return traceBuffer.find((t) => t.trace_id === traceId) ?? null;
}

export function clearSignalTraces(): void {
  traceBuffer.length = 0;
}

export function snapshotSignalTraces(): {
  total_buffered: number;
  earliest_ts: string | null;
  latest_ts: string | null;
  by_tool: Record<string, number>;
  by_source: Record<string, number>;
  schema_valid_pct: number;
} {
  const total = traceBuffer.length;
  if (total === 0) {
    return { total_buffered: 0, earliest_ts: null, latest_ts: null, by_tool: {}, by_source: {}, schema_valid_pct: 0 };
  }
  const byTool: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let validCount = 0;
  let validDenom = 0;
  for (const t of traceBuffer) {
    byTool[t.tool_name] = (byTool[t.tool_name] || 0) + 1;
    bySource[t.source] = (bySource[t.source] || 0) + 1;
    // Count req + res as separate validation samples; skip "skipped" markers
    if (!t.request.validation.errors.some((e) => e.keyword === "skipped" || e.keyword === "missing_schema")) {
      validDenom += 1;
      if (t.request.validation.valid) validCount += 1;
    }
    if (!t.response.validation.errors.some((e) => e.keyword === "skipped" || e.keyword === "missing_schema")) {
      validDenom += 1;
      if (t.response.validation.valid) validCount += 1;
    }
  }
  return {
    total_buffered: total,
    earliest_ts: traceBuffer[0]!.ts,
    latest_ts: traceBuffer[traceBuffer.length - 1]!.ts,
    by_tool: byTool,
    by_source: bySource,
    schema_valid_pct: validDenom > 0 ? Math.round((validCount / validDenom) * 1000) / 10 : 0,
  };
}
