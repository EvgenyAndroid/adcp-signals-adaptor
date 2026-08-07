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
// them against the canonical AdCP schemas (vendored at the spec
// version pinned in scripts/vendor-adcp-schemas.mjs — currently
// 3.0.8), and keeps the result in an in-memory ring buffer
// (last 500 traces).
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

// JSON-Schema validator that works inside Cloudflare Workers' V8
// isolate. AJV (the obvious choice) compiles validators via
// `new Function()`, which Workers blocks with "Code generation from
// strings disallowed for this context" — so traces validated against
// a real-shape schema all returned `[skipped]`. @cfworker/json-schema
// is a Workers-native interpreter (no eval/Function), drop-in for the
// fields we need. See: https://github.com/cfworker/cfworker
import { Validator } from "@cfworker/json-schema";

// Vendored AdCP schema corpus. Imported as a single TS module to
// sidestep @adcp/sdk's package.json `exports` field that doesn't
// expose the schemas-data path. Regenerate via:
//   node scripts/vendor-adcp-schemas.mjs
import { loadAdcpCorpus } from "../schemas/adcp";

import type { Env } from "../types/env";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * AdCP tools the trace recorder validates request/response payloads
 * against. Started as Signals-only (get_signals + activate_signal);
 * expanded to cover the workflow's other stages (Creative + Media-Buy
 * domains) so Brand Canvas + Multi-Agent Orchestrator surfaces show
 * full request/response JSON + validation across every fanout call,
 * not just the signals leg.
 *
 * Adding a new tool: vendor its request + response schemas via
 * scripts/vendor-adcp-schemas.mjs, then add an entry to SCHEMA_URL
 * + SCHEMA_ID + getValidators() below.
 */
export type AdcpToolName =
  // Standardized in AdCP 3.0.x — schema-validated against the vendored corpus
  | "get_signals"
  | "activate_signal"
  | "list_creative_formats"
  | "get_products"
  | "create_media_buy"
  | "check_governance"
  // Extension tools — implemented in our worker but not yet in the
  // published AdCP spec. Recorded with an "extension" badge instead of
  // ✓/✗ schema valid; lets the workshop trace inspector still show
  // request/response JSON + correlation_id chains for these calls.
  | "query_signals_nl"
  | "get_operation_status";

/**
 * Tools that are recorded but not validated (extensions / not yet in the
 * published spec). Surfaces an "extension" badge in the trace viewer
 * instead of ✓/✗ schema valid.
 */
const EXTENSION_TOOLS: ReadonlySet<string> = new Set<string>([
  "query_signals_nl",
  "get_operation_status",
]);

export function isExtensionTool(toolName: string): boolean {
  return EXTENSION_TOOLS.has(toolName);
}

/** Backward-compat alias — older imports referenced SignalToolName. */
export type SignalToolName = AdcpToolName;
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
  /** Endpoint URL the request actually hit.
   *
   * - Outbound (federation): the URL we POSTed to (peer's /mcp endpoint).
   * - Inbound REST: our public URL for the matched route, e.g.
   *   "https://adcp.signal-stack.io/signals/search".
   * - Inbound MCP: our public /mcp endpoint URL.
   *
   * Surfacing this in the trace viewer answers "where did this request
   * actually go?" — important for the workshop because the audience
   * asks it on every call (and the source tag alone like
   * "federation:dstillery" doesn't tell them where Dstillery LIVES).
   */
  endpoint_url: string | null;
  /** Peer's advertised serverInfo from the MCP `initialize` handshake.
   *
   * Populated only for outbound federation calls — captured live from
   * the peer's response to `initialize`, NEVER hardcoded. When the peer
   * advertises e.g. `{ name: "dstillery_signals_agent", version: "2.13.1" }`
   * the trace viewer can render that next to OUR schema URL ("validating
   * against /schemas/v3/...") so the audience reads the spec-version
   * mismatch directly from the data — no narration, no inference.
   *
   * Null for inbound traces (we ARE the server) and for any outbound
   * call where the peer's handshake didn't include serverInfo.
   */
  peer_server_info: { name?: string; version?: string } | null;
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
  // Signals domain
  get_signals_request:    "https://adcontextprotocol.org/schemas/v3/signals/get-signals-request.json",
  get_signals_response:   "https://adcontextprotocol.org/schemas/v3/signals/get-signals-response.json",
  activate_signal_request:  "https://adcontextprotocol.org/schemas/v3/signals/activate-signal-request.json",
  activate_signal_response: "https://adcontextprotocol.org/schemas/v3/signals/activate-signal-response.json",
  // Creative domain
  list_creative_formats_request:  "https://adcontextprotocol.org/schemas/v3/creative/list-creative-formats-request.json",
  list_creative_formats_response: "https://adcontextprotocol.org/schemas/v3/creative/list-creative-formats-response.json",
  // Media-Buy domain
  get_products_request:     "https://adcontextprotocol.org/schemas/v3/media-buy/get-products-request.json",
  get_products_response:    "https://adcontextprotocol.org/schemas/v3/media-buy/get-products-response.json",
  create_media_buy_request: "https://adcontextprotocol.org/schemas/v3/media-buy/create-media-buy-request.json",
  create_media_buy_response: "https://adcontextprotocol.org/schemas/v3/media-buy/create-media-buy-response.json",
  // Governance domain
  check_governance_request:  "https://adcontextprotocol.org/schemas/v3/governance/check-governance-request.json",
  check_governance_response: "https://adcontextprotocol.org/schemas/v3/governance/check-governance-response.json",
  // Extension tools — point at the AdCP issue tracker so the audience
  // can see the spec proposal status. These DON'T go through the
  // validator; the recorder marks them as "extension" instead.
  query_signals_nl_request:  "https://github.com/adcontextprotocol/adcp/issues?q=query_signals_nl",
  query_signals_nl_response: "https://github.com/adcontextprotocol/adcp/issues?q=query_signals_nl",
  get_operation_status_request:  "https://adcontextprotocol.org/docs/reference/protocol-envelope#operation-status",
  get_operation_status_response: "https://adcontextprotocol.org/docs/reference/protocol-envelope#operation-status",
} as const;

// Internal $id values the AdCP spec uses to register schemas. We resolve
// validators against these, then surface the public URL to consumers.
// Bumped through 3.0.1 → 3.0.6 → 3.0.8 alongside vendor-adcp-schemas.mjs spec
// pin. The patch line is wire-compatible (no new required fields, no
// removed fields), but the $id prefix changes per release so the
// validator registry has to walk in lockstep with the corpus.
import { ADCP_SPEC_VERSION } from "../schemas/adcp";

const SCHEMA_ID = {
  // Signals domain
  get_signals_request:      `/schemas/${ADCP_SPEC_VERSION}/signals/get-signals-request.json`,
  get_signals_response:     `/schemas/${ADCP_SPEC_VERSION}/signals/get-signals-response.json`,
  activate_signal_request:  `/schemas/${ADCP_SPEC_VERSION}/signals/activate-signal-request.json`,
  activate_signal_response: `/schemas/${ADCP_SPEC_VERSION}/signals/activate-signal-response.json`,
  // Creative domain
  list_creative_formats_request:  `/schemas/${ADCP_SPEC_VERSION}/creative/list-creative-formats-request.json`,
  list_creative_formats_response: `/schemas/${ADCP_SPEC_VERSION}/creative/list-creative-formats-response.json`,
  // Media-Buy domain
  get_products_request:     `/schemas/${ADCP_SPEC_VERSION}/media-buy/get-products-request.json`,
  get_products_response:    `/schemas/${ADCP_SPEC_VERSION}/media-buy/get-products-response.json`,
  create_media_buy_request: `/schemas/${ADCP_SPEC_VERSION}/media-buy/create-media-buy-request.json`,
  create_media_buy_response: `/schemas/${ADCP_SPEC_VERSION}/media-buy/create-media-buy-response.json`,
  // Governance domain
  check_governance_request:  `/schemas/${ADCP_SPEC_VERSION}/governance/check-governance-request.json`,
  check_governance_response: `/schemas/${ADCP_SPEC_VERSION}/governance/check-governance-response.json`,
  // NOTE: Extension tools (query_signals_nl, get_operation_status) have
  // no canonical $id in the published spec corpus. They're intentionally
  // absent here — the recorder routes them through the "extension" path
  // (validator.ts:safeValidate handles the missing-schema case).
} as const;

// ── Validator setup ──────────────────────────────────────────────────────────
//
// One Validator per request/response shape. Lazy-init on first record() call
// so cold isolates don't pay the cost up-front; after init the validators
// are cached for the lifetime of the isolate.
//
// @cfworker/json-schema's Validator constructor takes the root schema
// + draft + a list of additional schemas the root may $ref (for
// cross-file resolution like signal-id, deployment, vendor-pricing-
// option). We pre-register the entire corpus so any $ref resolves.

interface ValidatorBundle {
  // Signals
  get_signals_request: Validator;
  get_signals_response: Validator;
  activate_signal_request: Validator;
  activate_signal_response: Validator;
  // Creative
  list_creative_formats_request: Validator;
  list_creative_formats_response: Validator;
  // Media-Buy
  get_products_request: Validator;
  get_products_response: Validator;
  create_media_buy_request: Validator;
  create_media_buy_response: Validator;
  // Governance
  check_governance_request: Validator;
  check_governance_response: Validator;
}

let _validators: ValidatorBundle | null = null;
let _validatorInitFailed = false;

function findInCorpus(corpus: Array<{ $id?: string }>, id: string): Record<string, unknown> | null {
  return (corpus.find((s) => s.$id === id) as Record<string, unknown> | undefined) ?? null;
}

function getValidators(): ValidatorBundle | null {
  if (_validators !== null) return _validators;
  if (_validatorInitFailed) return null;
  try {
    const corpus = loadAdcpCorpus() as Array<Record<string, unknown> & { $id?: string }>;
    const buildValidator = (rootId: string): Validator => {
      const root = findInCorpus(corpus, rootId);
      if (!root) throw new Error(`schema not in corpus: ${rootId}`);
      // Draft-07 matches @adcp/sdk's $schema pragma. Pass shortCircuit
      // = false so we collect all errors (ajv allErrors equivalent).
      const v = new Validator(root, "7", false);
      // Register every other corpus schema so cross-file $refs resolve.
      for (const s of corpus) {
        if (s.$id && s.$id !== rootId) {
          try { v.addSchema(s); } catch { /* tolerate */ }
        }
      }
      return v;
    };
    _validators = {
      // Signals
      get_signals_request:    buildValidator(SCHEMA_ID.get_signals_request),
      get_signals_response:   buildValidator(SCHEMA_ID.get_signals_response),
      activate_signal_request:  buildValidator(SCHEMA_ID.activate_signal_request),
      activate_signal_response: buildValidator(SCHEMA_ID.activate_signal_response),
      // Creative
      list_creative_formats_request:  buildValidator(SCHEMA_ID.list_creative_formats_request),
      list_creative_formats_response: buildValidator(SCHEMA_ID.list_creative_formats_response),
      // Media-Buy
      get_products_request:     buildValidator(SCHEMA_ID.get_products_request),
      get_products_response:    buildValidator(SCHEMA_ID.get_products_response),
      create_media_buy_request: buildValidator(SCHEMA_ID.create_media_buy_request),
      create_media_buy_response: buildValidator(SCHEMA_ID.create_media_buy_response),
      // Governance
      check_governance_request:  buildValidator(SCHEMA_ID.check_governance_request),
      check_governance_response: buildValidator(SCHEMA_ID.check_governance_response),
    };
    return _validators;
  } catch {
    _validatorInitFailed = true;
    return null;
  }
}

// loadAdcpCorpus() lives in src/schemas/adcp/index.ts — vendored from
// @adcp/sdk by scripts/vendor-adcp-schemas.mjs. Imported above.

function pickValidator(bundle: ValidatorBundle, schemaId: string): Validator | null {
  switch (schemaId) {
    // Signals
    case SCHEMA_ID.get_signals_request: return bundle.get_signals_request;
    case SCHEMA_ID.get_signals_response: return bundle.get_signals_response;
    case SCHEMA_ID.activate_signal_request: return bundle.activate_signal_request;
    case SCHEMA_ID.activate_signal_response: return bundle.activate_signal_response;
    // Creative
    case SCHEMA_ID.list_creative_formats_request: return bundle.list_creative_formats_request;
    case SCHEMA_ID.list_creative_formats_response: return bundle.list_creative_formats_response;
    // Media-Buy
    case SCHEMA_ID.get_products_request: return bundle.get_products_request;
    case SCHEMA_ID.get_products_response: return bundle.get_products_response;
    case SCHEMA_ID.create_media_buy_request: return bundle.create_media_buy_request;
    case SCHEMA_ID.create_media_buy_response: return bundle.create_media_buy_response;
    // Governance
    case SCHEMA_ID.check_governance_request: return bundle.check_governance_request;
    case SCHEMA_ID.check_governance_response: return bundle.check_governance_response;
    default: return null;
  }
}

function validateAgainst(schemaId: string, schemaUrl: string, payload: unknown): SchemaValidationResult {
  const bundle = getValidators();
  if (!bundle) {
    return {
      valid: true,  // can't validate — don't claim invalid
      schema_url: schemaUrl,
      errors: [{ path: "(meta)", message: "schema validator unavailable in this runtime", keyword: "skipped" }],
    };
  }
  const validator = pickValidator(bundle, schemaId);
  if (!validator) {
    return {
      valid: true,
      schema_url: schemaUrl,
      errors: [{ path: "(meta)", message: `schema not registered: ${schemaId}`, keyword: "missing_schema" }],
    };
  }
  const result = validator.validate(payload);
  if (result.valid) return { valid: true, schema_url: schemaUrl, errors: [] };
  const errs = (result.errors || []).slice(0, 12).map((e: { instanceLocation?: string; error?: string; keyword?: string; keywordLocation?: string }) => ({
    path: e.instanceLocation || "(root)",
    message: e.error || "validation failed",
    keyword: e.keyword || (e.keywordLocation ? e.keywordLocation.split("/").pop() ?? "unknown" : "unknown"),
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
  /**
   * Optional. The endpoint URL this request actually hit. For outbound
   * federation calls, the peer's /mcp URL. For inbound REST/MCP, the
   * full request.url at the worker. When omitted, the recorder leaves
   * the trace's endpoint_url as null.
   */
  endpoint_url?: string | null;
  /**
   * Optional. Peer's serverInfo from the MCP `initialize` handshake
   * (federation outbound only). Captured live — never hardcoded. Lets
   * the trace viewer surface the peer's advertised version next to our
   * schema URL so version-drift is self-evident.
   */
  peer_server_info?: { name?: string; version?: string } | null;
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
    // Tool → schema lookup. Adding a new tool: vendor its schemas via
    // scripts/vendor-adcp-schemas.mjs, add to SCHEMA_ID + SCHEMA_URL +
    // ValidatorBundle + pickValidator, and add an entry here.
    const reqSchemaId = SCHEMA_ID[`${input.tool_name}_request` as keyof typeof SCHEMA_ID];
    const resSchemaId = SCHEMA_ID[`${input.tool_name}_response` as keyof typeof SCHEMA_ID];
    const reqSchemaUrl = SCHEMA_URL[`${input.tool_name}_request` as keyof typeof SCHEMA_URL];
    const resSchemaUrl = SCHEMA_URL[`${input.tool_name}_response` as keyof typeof SCHEMA_URL];

    // Extension tools (query_signals_nl, get_operation_status) aren't
    // standardized in the AdCP corpus yet — short-circuit validation to
    // a clearly-labeled "extension" result so the trace viewer can
    // render a distinct badge ("ext: not in spec") instead of "⊘
    // validation skipped" (which connotes runtime failure). The audience
    // gets to see request/response JSON for these calls without us
    // implying they're spec-broken.
    const reqValidation = isExtensionTool(input.tool_name)
      ? extensionValidationResult(reqSchemaUrl, "request")
      : safeValidate(reqSchemaId, reqSchemaUrl, input.request_payload);
    const resValidation = isExtensionTool(input.tool_name)
      ? extensionValidationResult(resSchemaUrl, "response")
      : safeValidate(resSchemaId, resSchemaUrl, input.response_payload);

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
      endpoint_url: input.endpoint_url ?? null,
      peer_server_info: input.peer_server_info ?? null,
      request: {
        payload: input.request_payload,
        validation: reqValidation,
      },
      response: {
        payload: input.response_payload,
        validation: resValidation,
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

/**
 * Build the validation-result shell for an extension tool (one whose
 * schema isn't in the published AdCP corpus). Surfaces a distinct
 * `extension` keyword so the trace viewer can render an "ext: spec
 * proposal" badge instead of "⊘ validation skipped" (which would
 * imply runtime failure rather than intentional skip).
 *
 * The schema_url points at the spec issue / proposal so the workshop
 * audience can click through to see where the standardization
 * conversation lives.
 */
function extensionValidationResult(schemaUrl: string | undefined, leg: "request" | "response"): SchemaValidationResult {
  return {
    valid: true,  // we don't claim invalid for an unstandardized tool
    schema_url: schemaUrl ?? "",
    errors: [{
      path: "(meta)",
      message: `${leg} not standardized in AdCP yet — recorded for audit, schema link goes to the proposal`,
      keyword: "extension",
    }],
  };
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

// ── KV-backed persistence ────────────────────────────────────────────────────
//
// The in-memory ring buffer above survives request-to-request within an
// isolate but Cloudflare cycles isolates frequently — so a trace recorded
// at T0 may "disappear" at T0+30s when the user reopens the modal on a
// fresh isolate. That's user-visible during a workshop demo (we hit it!).
//
// Layered fix: write each trace to KV with a TTL and maintain a
// fixed-size index of recent trace IDs. Reads merge in-memory + KV
// (in-memory wins for freshest, KV fills the gap when isolate cycled).
//
// Posture:
//   - Writes are fire-and-forget via ctx.waitUntil where available, or
//     plain unawaited Promise otherwise. Failure must never break the
//     calling signal call.
//   - TTL = 6 hours. Long enough for a workshop session, short enough
//     to keep the index file small.
//   - Index key holds [trace_id, ts] tuples capped at 200 newest. List
//     reads fetch the index, fall through to per-id KV gets.
//
// We avoid making recordSignalTrace itself async (would force every
// call site to await) — instead, callers fire persistSignalTrace
// alongside recordSignalTrace.

const KV_KEY_PREFIX = "sigtrace:";
const KV_INDEX_KEY = "sigtrace:index";
const KV_TTL_SECONDS = 6 * 60 * 60; // 6h
const KV_INDEX_CAP = 200;

interface KvIndexEntry {
  id: string;
  ts: string;
  tool: SignalToolName;
  source: string;
  status: "ok" | "error";
}

/**
 * Best-effort: persist one trace + bump the recent-traces index. Never
 * throws — caller's side-effect, must not break the call path. Pass
 * the trace returned by safeRecordSignalTrace; if null, no-op.
 *
 * Awaiting this in the request path adds ~5-30ms (two KV writes). For
 * non-blocking, use ctx.waitUntil(persistSignalTrace(env, trace)).
 */
export async function persistSignalTrace(env: Env, trace: SignalTrace | null): Promise<void> {
  if (!trace) return;
  if (!env || !env.SIGNALS_CACHE) return;
  try {
    const key = KV_KEY_PREFIX + trace.trace_id;
    // Write the full trace under its id key.
    await env.SIGNALS_CACHE.put(key, JSON.stringify(trace), { expirationTtl: KV_TTL_SECONDS });
    // Read-modify-write the index. Eventual consistency — concurrent
    // writes can clobber each other; we accept that for a demo-grade
    // audit log. The next put restores ordering on the next call.
    const existing = await env.SIGNALS_CACHE.get(KV_INDEX_KEY, "json") as KvIndexEntry[] | null;
    const list = existing ?? [];
    // De-dupe by id (in case of retry), prepend newest, cap.
    const filtered = list.filter((e) => e.id !== trace.trace_id);
    const next: KvIndexEntry[] = [
      { id: trace.trace_id, ts: trace.ts, tool: trace.tool_name, source: trace.source, status: trace.response.status },
      ...filtered,
    ].slice(0, KV_INDEX_CAP);
    await env.SIGNALS_CACHE.put(KV_INDEX_KEY, JSON.stringify(next), { expirationTtl: KV_TTL_SECONDS });
  } catch {
    // KV unavailable, quota exhausted, JSON serialise threw on a
    // circular ref — none of these should affect the call path.
  }
}

/**
 * KV-backed read. Returns the union of in-memory + KV traces, dedup'd
 * by trace_id (in-memory wins on conflict — it's freshest), filtered
 * by query, newest first.
 *
 * Used by /api/signal-traces when in-memory is empty (cold isolate).
 */
export async function listSignalTracesPersisted(env: Env, q: SignalTraceQuery = {}): Promise<SignalTrace[]> {
  const inMemory = getSignalTraces({ ...q, limit: 500 });
  if (!env || !env.SIGNALS_CACHE) return inMemory.slice(0, q.limit ?? 100);
  let kvTraces: SignalTrace[] = [];
  try {
    const index = await env.SIGNALS_CACHE.get(KV_INDEX_KEY, "json") as KvIndexEntry[] | null;
    if (!index || index.length === 0) {
      return inMemory.slice(0, q.limit ?? 100);
    }
    // Pre-filter by index metadata (tool, source) before fetching the
    // full payloads — saves KV reads on tool-specific queries.
    const candidates = index.filter((e) => {
      if (q.tool && e.tool !== q.tool) return false;
      if (q.source_prefix && !e.source.startsWith(q.source_prefix)) return false;
      return true;
    });
    // Fetch in parallel. Cap at 100 to keep KV-read fanout bounded.
    const fetchN = Math.min(100, candidates.length);
    const fetched = await Promise.all(
      candidates.slice(0, fetchN).map((e) =>
        env.SIGNALS_CACHE.get(KV_KEY_PREFIX + e.id, "json") as Promise<SignalTrace | null>
      )
    );
    kvTraces = fetched.filter((t): t is SignalTrace => t !== null);
  } catch {
    // Fall back to in-memory only.
  }
  // Merge by trace_id, in-memory wins on conflict.
  const seen = new Set(inMemory.map((t) => t.trace_id));
  const merged = [...inMemory];
  for (const t of kvTraces) {
    if (!seen.has(t.trace_id)) {
      merged.push(t);
      seen.add(t.trace_id);
    }
  }
  // Apply the post-fetch filter that index couldn't pre-filter
  // (correlation_id, agent_id, since_ms — fields not in index).
  const sinceMs = q.since_ms ?? 0;
  const filtered = merged.filter((t) => {
    if (q.tool && t.tool_name !== q.tool) return false;
    if (q.source_prefix && !t.source.startsWith(q.source_prefix)) return false;
    if (q.correlation_id && t.correlation_id !== q.correlation_id) return false;
    if (q.agent_id && t.caller_agent !== q.agent_id) return false;
    if (sinceMs > 0 && new Date(t.ts).getTime() < sinceMs) return false;
    return true;
  });
  // Sort newest first.
  filtered.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return filtered.slice(0, Math.max(1, Math.min(500, q.limit ?? 100)));
}

/** KV-backed single-trace read. Falls back to in-memory if not in KV. */
export async function getSignalTraceByIdPersisted(env: Env, traceId: string): Promise<SignalTrace | null> {
  const inMem = getSignalTraceById(traceId);
  if (inMem) return inMem;
  if (!env || !env.SIGNALS_CACHE) return null;
  try {
    return (await env.SIGNALS_CACHE.get(KV_KEY_PREFIX + traceId, "json")) as SignalTrace | null;
  } catch {
    return null;
  }
}

/** KV-backed snapshot. Reads index size + per-tool counts. */
export async function snapshotSignalTracesPersisted(env: Env): Promise<{
  total_buffered: number;
  total_persisted: number;
  earliest_ts: string | null;
  latest_ts: string | null;
  by_tool: Record<string, number>;
  by_source: Record<string, number>;
  schema_valid_pct: number;
}> {
  const inMem = snapshotSignalTraces();
  if (!env || !env.SIGNALS_CACHE) {
    return { ...inMem, total_persisted: 0 };
  }
  try {
    const index = await env.SIGNALS_CACHE.get(KV_INDEX_KEY, "json") as KvIndexEntry[] | null;
    if (!index) return { ...inMem, total_persisted: 0 };
    const byTool: Record<string, number> = { ...inMem.by_tool };
    const bySource: Record<string, number> = { ...inMem.by_source };
    for (const e of index) {
      byTool[e.tool] = (byTool[e.tool] || 0) + 0; // index just informs presence
    }
    return {
      ...inMem,
      total_persisted: index.length,
      by_tool: byTool,
      by_source: bySource,
    };
  } catch {
    return { ...inMem, total_persisted: 0 };
  }
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
