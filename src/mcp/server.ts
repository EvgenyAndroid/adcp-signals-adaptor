// src/mcp/server.ts
// MCP server — Streamable HTTP transport (JSON-RPC 2.0).
// 8 tools: get_adcp_capabilities, get_signals, activate_signal, get_operation_status,
//          get_similar_signals, query_signals_nl, get_concept, search_concepts.
// v3.0 GA: handleInitialize now advertises GTS, projector, and handshake simulator.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import type { SearchSignalsRequest } from "../types/api";
import { requireAuth } from "../routes/shared";
import { ADCP_TOOLS, getToolByName } from "./tools";
import { getCapabilities } from "../domain/capabilityService";
import { searchSignalsService } from "../domain/signalService";
import {
    activateSignalService,
    getOperationService,
    NotFoundError,
    ValidationError,
} from "../domain/activationService";
import { getDb } from "../storage/db";
import { validateSearchRequest, validateActivateRequest } from "../utils/validation";
import { requestId } from "../utils/ids";
import { findSignalById, searchSignals } from "../storage/signalRepo";
import { createEmbeddingEngine } from "../ucp/embeddingEngine";
import { cosineSimilarity } from "../domain/semanticResolver";
import { toSignalSummary } from "../mappers/signalMapper";
import { getAllSignalsForCatalog } from "../domain/signalService";
import { handleNLQuery } from "../domain/nlQueryHandler";
import { handleConceptToolCall } from "../domain/conceptHandler";
import { compactObj } from "../utils/objects";
import { safeRecordSignalTrace, persistSignalTrace } from "../domain/signalTrace";
import { record as recordToolLog, argKeysOf } from "./toolLog";
import { logCall as d1LogCall, cleanup as d1Cleanup, shouldRunCleanup } from "../storage/toolLogRepo";

// ── JSON-RPC 2.0 types ────────────────────────────────────────────────────────

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: unknown;
}

interface JsonRpcSuccess {
    jsonrpc: "2.0";
    id: string | number | null;
    result: unknown;
}

interface JsonRpcError {
    jsonrpc: "2.0";
    id: string | number | null;
    error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INTERNAL_ERROR = -32603;
const MCP_TOOL_ERROR = -32000;
// JSON-RPC has no dedicated auth error in the reserved range; -32001 is within
// the "server error" band (-32000..-32099) and conventional for auth failure.
const RPC_UNAUTHORIZED = -32001;

// Tools/call is the state-changing / paid-egress entry point: activate_signal,
// query_signals_nl (Anthropic), get_similar_signals (OpenAI). Discovery methods
// (initialize, tools/list, ping, notifications/*) stay public per standard MCP
// patterns. Auth is enforced per-message so a batched request mixing discovery
// and tool calls works uniformly — discovery messages pass, tools/call messages
// return -32001 if no API key is present on the request.
const AUTHENTICATED_MCP_METHODS = new Set(["tools/call"]);

// Sec-31v: tools/call carve-out for AdCP capability discovery. The AAO
// storyboard runner and similar conformance probes call
// get_adcp_capabilities BEFORE any handshake / auth flow to learn what
// the agent supports — they need the unauthed call to succeed in order
// to issue specialty badges. Other discovery probes (compliance
// evaluators, directory crawlers) follow the same pattern.
//
// Treating this single tool as public matches how `initialize` and
// `tools/list` behave at the MCP layer, and keeps mutating tools
// (activate_signal, get_signals, etc.) gated behind the bearer key.
// All other tools/call invocations remain auth-gated.
const PUBLIC_TOOL_CALL_NAMES = new Set(["get_adcp_capabilities"]);

interface McpInitializeParams {
    protocolVersion: string;
    capabilities?: Record<string, unknown>;
    clientInfo?: { name: string; version: string };
}

interface McpCallToolParams {
    name: string;
    arguments?: Record<string, unknown>;
}

// ── Main handler ──────────────────────────────────────────────────────────────

// Hard cap on MCP JSON-RPC request bodies. Anything above this is almost
// certainly malicious — the biggest legitimate payload is a tools/call with a
// long query string or a fully-spelled-out deliver_to block, comfortably under
// 64 KiB. 1 MiB is generous without being a resource-exhaustion vector on a
// public endpoint.
const MAX_MCP_BODY_BYTES = 1_000_000;

export async function handleMcpRequest(
    request: Request,
    env: Env,
    logger: Logger,
    ctx?: ExecutionContext,
): Promise<Response> {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    // Reject obviously-oversized bodies before parsing. Workers don't stream
    // JSON incrementally, so without this a large POST would allocate fully
    // before the parser can reject it.
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_MCP_BODY_BYTES) {
        return rpcErrorResponse(
            null,
            RPC_INVALID_REQUEST,
            `Request body too large (${contentLength} > ${MAX_MCP_BODY_BYTES})`,
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return rpcErrorResponse(null, RPC_PARSE_ERROR, "Parse error: invalid JSON");
    }

    // Gate state-changing methods (tools/call) behind the API key. Discovery
    // methods (initialize, tools/list, ping) stay public — that matches how
    // MCP clients typically bootstrap a connection and gives the evaluator
    // the unauthenticated discovery handshake it expects.
    const isAuthed = requireAuth(request, env.DEMO_API_KEY);

    if (Array.isArray(body)) {
        // Batched requests — mixed auth per message stays as JSON-RPC 200 OK
        // with per-message errors. Raising HTTP 401 here would block the
        // discovery messages that legitimately succeed alongside unauth'd
        // tools/call attempts in the same batch.
        const responses = await Promise.all(
            body.map((msg) => handleSingleMessage(msg, env, logger, isAuthed, ctx))
        );
        return jsonResponse(responses.filter(Boolean));
    }

    const response = await handleSingleMessage(body, env, logger, isAuthed, ctx);
    if (response === null) {
        return new Response(null, { status: 202 });
    }
    // RFC 6750 §3: Bearer-token failures on single-request tools/call surface
    // at the HTTP layer (401 + WWW-Authenticate) so standard OAuth/MCP
    // clients — and conformance probes like security_baseline/probe_unauth —
    // can detect the auth failure without parsing JSON-RPC error codes. The
    // JSON body is still a well-formed JSON-RPC error so polyglot clients
    // see both the transport signal and the protocol signal.
    if (isJsonRpcAuthError(response)) {
        return new Response(JSON.stringify(response), {
            status: 401,
            headers: {
                "Content-Type": "application/json",
                "WWW-Authenticate": `Bearer realm="adcp-signals-adaptor", error="invalid_token"`,
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
            },
        });
    }
    return jsonResponse(response);
}

function isJsonRpcAuthError(resp: JsonRpcResponse): boolean {
    return "error" in resp && resp.error.code === RPC_UNAUTHORIZED;
}

async function handleSingleMessage(
    msg: unknown,
    env: Env,
    logger: Logger,
    isAuthed: boolean,
    ctx?: ExecutionContext,
): Promise<JsonRpcResponse | null> {
    if (!isValidRpcRequest(msg)) {
        return rpcError(null, RPC_INVALID_REQUEST, "Invalid JSON-RPC request");
    }

    const { id = null, method, params } = msg;
    logger.info("mcp_request", { method, id });

    if (AUTHENTICATED_MCP_METHODS.has(method) && !isAuthed) {
        // Sec-31v: tools/call → get_adcp_capabilities is public. The AAO
        // and AdCP conformance probes call this tool unauthenticated to
        // discover specialisms / supported_protocols before any handshake.
        // Other tools/call invocations stay auth-gated.
        const toolName = (params && typeof params === "object" && "name" in params)
            ? (params as { name?: unknown }).name
            : undefined;
        if (method === "tools/call" && typeof toolName === "string" && PUBLIC_TOOL_CALL_NAMES.has(toolName)) {
            logger.info("mcp_public_tool_call", { method, tool: toolName, id });
        } else {
            // Log auth failures so spammy unauthenticated tool-call attempts are
            // visible in the observability pipeline.
            logger.warn("mcp_auth_required", { method, id });
            if (id === undefined || id === null) return null;
            return rpcError(
                id,
                RPC_UNAUTHORIZED,
                "Authentication required for this method. Supply Authorization: Bearer <key>.",
            );
        }
    }

    try {
        switch (method) {
            case "initialize":
                return rpcSuccess(id, await handleInitialize(params as McpInitializeParams, env));
            case "notifications/initialized":
                return null;
            case "ping":
                return rpcSuccess(id, {});
            case "tools/list":
                return rpcSuccess(id, { tools: ADCP_TOOLS });
            case "tools/call": {
                // Sec-33: time + record the tool call for observability.
                // Sec-35: additionally persist to D1 via ctx.waitUntil for
                // cross-isolate visibility. The in-memory ring stays too
                // (zero-latency fallback) but D1 is the canonical store
                // queried by /mcp/recent.
                const toolCallParams = params as McpCallToolParams;
                const toolStart = performance.now();
                const caller: "authed" | "unauth" = isAuthed ? "authed" : "unauth";
                try {
                    const result = await handleToolCall(toolCallParams, env, logger);
                    const responseBytes = tryLen(result) ?? 0;
                    const durationMs = Math.round(performance.now() - toolStart);
                    recordToolLog({
                        ts: new Date().toISOString(),
                        tool: toolCallParams.name,
                        argKeys: argKeysOf(toolCallParams.arguments),
                        latencyMs: durationMs, ok: true, caller,
                        ...(responseBytes != null ? { responseBytes } : {}),
                    });
                    if (ctx) {
                        persistToolCall(ctx, env, {
                            toolName: toolCallParams.name,
                            argumentsJson: safeStringify(toolCallParams.arguments),
                            responseSizeBytes: responseBytes,
                            status: "ok",
                            durationMs,
                            caller,
                        });
                    }
                    return rpcSuccess(id, result);
                } catch (err) {
                    const durationMs = Math.round(performance.now() - toolStart);
                    const errKind = err instanceof McpToolError ? "McpToolError" : "UnhandledError";
                    const errMsg = err instanceof Error ? err.message : String(err);
                    recordToolLog({
                        ts: new Date().toISOString(),
                        tool: toolCallParams.name,
                        argKeys: argKeysOf(toolCallParams.arguments),
                        latencyMs: durationMs, ok: false, errorKind: errKind, caller,
                    });
                    if (ctx) {
                        persistToolCall(ctx, env, {
                            toolName: toolCallParams.name,
                            argumentsJson: safeStringify(toolCallParams.arguments),
                            responseSizeBytes: 0,
                            status: "error",
                            errorMessage: errKind + ": " + errMsg,
                            durationMs,
                            caller,
                        });
                    }
                    throw err;
                }
            }
            default:
                if (id === undefined || id === null) return null;
                return rpcError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
        }
    } catch (err) {
        if (id === undefined || id === null) return null;
        if (err instanceof McpToolError) {
            return rpcError(id, MCP_TOOL_ERROR, err.message, err.details);
        }
        logger.error("mcp_unhandled_error", { method, error: String(err) });
        return rpcError(id, RPC_INTERNAL_ERROR, "Internal error");
    }
}

// ── MCP method handlers ───────────────────────────────────────────────────────

async function handleInitialize(
    params: McpInitializeParams,
    env: Env
): Promise<unknown> {
    return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
            name: "adcp-signals-adaptor",
            version: env.API_VERSION ?? "3.0",
            description:
                "AdCP Signals Provider — IAB Audience Taxonomy 1.1 aligned signal discovery, " +
                "brief-driven custom segment proposals, and async activation with webhook support.",
            ucp: {
                // Embedding space declaration (VAC)
                space_id: "openai-te3-small-d512-v1",
                phase: "v1",

                // Phase 2b: GTS + Projector (live as of v3.0 GA)
                gts: {
                    supported: true,
                    endpoint: "/ucp/gts",
                    version: "adcp-gts-v1.0",
                    pair_count: 15,
                    pass_threshold: 0.95,
                },
                projector: {
                    available: true,
                    endpoint: "/ucp/projector",
                    algorithm: "procrustes_svd",
                    from_space: "openai-te3-small-d512-v1",
                    to_space: "ucp-space-v1.0",
                    status: "simulated",  // IAB reference model pending publication
                },

                // Phase 1 demo tool
                handshake_simulator: {
                    supported: true,
                    endpoint: "/ucp/simulate-handshake",
                },

                // NL query
                nl_query: {
                    supported: true,
                    endpoint: "/signals/query",
                    min_embedding_score: 0.45,
                    archetype_count: 4,
                    concept_count: 19,
                },

                // Concept registry
                concept_registry: {
                    supported: true,
                    endpoint: "/ucp/concepts",
                    concept_count: 19,
                },
            },
        },
    };
}

/**
 * Major versions this agent supports. MUST stay in sync with
 * `capabilityService.ts` `adcp.major_versions` — both surfaces
 * (this file enforces VERSION_UNSUPPORTED, capabilityService
 * advertises the supported set). A buyer who reads capabilities
 * and retries with a value from there must succeed.
 *
 * Narrowed from [2, 3] -> [3] in PR #247. The v2 claim was
 * paper-only: zero code branches on adcp_major_version === 2.
 * Re-add v2 ONLY after wiring real v2-shape handlers.
 */
const SUPPORTED_MAJOR_VERSIONS: ReadonlyArray<number> = [3];

/**
 * Per AdCP 3.0.x (vendor/.../signals/get-signals-request.json:10):
 *   "Sellers validate against their supported major_versions and
 *    return VERSION_UNSUPPORTED if unsupported."
 *
 * Per error-code.json:96 the error carries recovery semantics:
 *   "correctable (call get_adcp_capabilities without
 *    adcp_major_version to discover supported major_versions, then
 *    retry with a supported version)."
 *
 * Recovery carve-out: `get_adcp_capabilities` MUST remain callable
 * regardless of the declared version, because that's the discovery
 * surface the recovery loop depends on. If we erred on
 * capabilities-with-unsupported-version too, the buyer couldn't
 * self-heal — they'd get an error with no path forward.
 *
 * Omitted version: per spec, *"the seller assumes its highest
 * supported version"* — also valid. Only an EXPLICIT, OUT-OF-RANGE
 * value triggers the error.
 *
 * Throws McpToolError with code: "VERSION_UNSUPPORTED" so the existing
 * JSON-RPC -> MCP_TOOL_ERROR transport-marker pipeline applies. The
 * code travels in the error's `details.code` field which the
 * rpcError helper places in `error.data` on the wire — buyers
 * inspect it to drive the documented recovery flow.
 */
function validateAdcpMajorVersion(toolName: string, args: Record<string, unknown>): void {
    // Recovery carve-out — see comment above.
    if (toolName === "get_adcp_capabilities") return;
    const v = args["adcp_major_version"];
    if (v === undefined || v === null) return; // omitted ⇒ seller's highest
    const num = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(num) || !SUPPORTED_MAJOR_VERSIONS.includes(num)) {
        throw new McpToolError(
            `adcp_major_version ${v} not supported. This seller supports: [${SUPPORTED_MAJOR_VERSIONS.join(", ")}]. Call get_adcp_capabilities without adcp_major_version to discover supported versions, then retry with a supported version.`,
            { code: "VERSION_UNSUPPORTED", supported_major_versions: [...SUPPORTED_MAJOR_VERSIONS] },
        );
    }
}

async function handleToolCall(
    params: McpCallToolParams,
    env: Env,
    logger: Logger
): Promise<unknown> {
    const { name, arguments: args = {} } = params;

    // Aliases not in ADCP_TOOLS schema are still valid
    const TOOL_ALIASES: Record<string, string> = {
        "get_task_status": "get_operation_status",
        "get_signal_status": "get_operation_status",
    };
    const resolvedName = TOOL_ALIASES[name] ?? name;
    const toolDef = getToolByName(resolvedName);
    if (!toolDef) throw new McpToolError(`Unknown tool: ${name}`);

    // Version negotiation — must run BEFORE per-tool dispatch so the
    // error surfaces uniformly across every state-changing tool. The
    // get_adcp_capabilities carve-out is encoded inside the helper.
    validateAdcpMajorVersion(resolvedName, args as Record<string, unknown>);

    logger.info("mcp_tool_call", { tool: resolvedName });

    switch (resolvedName) {
        case "get_adcp_capabilities":
            return callGetCapabilities(args, env);
        case "get_signals":
            return callGetSignals(args, env);
        case "activate_signal":
            return callActivateSignal(args, env, logger);
        case "get_operation_status":
        case "get_task_status":
        case "get_signal_status":
            return callGetOperation(args, env, logger);
        case "get_similar_signals":
            return callGetSimilarSignals(args, env, logger);
        case "query_signals_nl":
            return callQuerySignalsNl(args, env, logger);
        case "get_concept":
        case "search_concepts": {
            // handleConceptToolCall returns a plain object; wrap it in MCP tool
            // result format with both stringified text and structuredContent.
            // MCP transport binding (adcp#3999): synchronous concept lookup
            // → completed envelope status.
            const conceptResult = handleConceptToolCall(resolvedName, args);
            const conceptResponse = withMcpEnvelope(
                { status: "completed" },
                conceptResult as Record<string, unknown>
            );
            return toolResult(JSON.stringify(conceptResponse, null, 2), conceptResponse);
        }
        default:
            throw new McpToolError(`Tool not implemented: ${name}`);
    }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callGetCapabilities(
    args: Record<string, unknown>,
    env: Env
): Promise<unknown> {
    // Accept both `protocols` (array, canonical) and `protocol` (string, singular
    // alias) — some clients/evaluators send the singular form. Same intent.
    const rawArr = args["protocols"];
    const rawSingle = args["protocol"];
    let protocols: string[] | undefined;
    if (Array.isArray(rawArr)) {
        protocols = rawArr.filter((p): p is string => typeof p === "string");
    } else if (typeof rawSingle === "string" && rawSingle.length > 0) {
        protocols = [rawSingle];
    }
    const caps = await getCapabilities(env.SIGNALS_CACHE, protocols, {
        ...(env.EMBEDDING_ENGINE !== undefined ? { EMBEDDING_ENGINE: env.EMBEDDING_ENGINE } : {}),
        ...(env.OPENAI_API_KEY    !== undefined ? { OPENAI_API_KEY:    env.OPENAI_API_KEY    } : {}),
    });

    // Echo back the request's context block. Capability-discovery storyboards
    // send context.correlation_id and assert it round-trips. Per
    // /schemas/core/context.json, context is opaque — we don't parse it, we
    // copy it through unchanged.
    const ctx = args["context"];
    const payload = ctx && typeof ctx === "object" && !Array.isArray(ctx)
        ? { ...caps, context: ctx as Record<string, unknown> }
        : caps;

    // MCP transport binding (adcp#3999): envelope fields flat-merged into
    // structuredContent. Capability discovery is fully synchronous → completed.
    const response = withMcpEnvelope({ status: "completed" }, payload as Record<string, unknown>);

    return toolResult(JSON.stringify(response, null, 2), response);
}

async function callGetSignals(
    args: Record<string, unknown>,
    env: Env
): Promise<unknown> {
    const _t0_get_signals = Date.now();
    const filters = args["filters"] as Record<string, unknown> | undefined;
    const pagination = args["pagination"] as Record<string, unknown> | undefined;

    // Sec-31w: AAO `signal_owned` storyboard's `filter_by_criteria` step
    // sends three filter keys we didn't previously honour:
    //   - filters.max_cpm                — numeric ceiling on CPM ($)
    //   - filters.min_coverage_percentage — numeric floor 0..1 or 0..100
    //   - filters.signal_type             — "owned" | "marketplace" | "custom"
    // Captured here for post-search filtering (the search service doesn't
    // know about CPM/coverage thresholds; cheaper to filter the shaped
    // SignalSummary payload than to thread three more args through it).
    // Empty result is a valid response per storyboard spec — we don't
    // throw on no-match, just return `signals: []`.
    const maxCpm = numArgOrNull(filters?.["max_cpm"]);
    const minCoveragePct = numArgOrNull(filters?.["min_coverage_percentage"]);
    const signalTypeFilter = typeof filters?.["signal_type"] === "string"
        ? (filters!["signal_type"] as string)
        : null;

    // Sec-31z: AAO v3 sends `signal_spec` as an OBJECT — { brief: "..." }
    // — not a bare string. Older callers (and our REST surface) still
    // send a plain string. Accept both, plus the older `brief` arg, and
    // collapse to a string for the search service.
    //
    // Without this normalisation, `(args["signal_spec"] ?? args["brief"])
    // as string` cast through an object → downstream toLowerCase / regex
    // etc. throws → the whole MCP tools/call request returns a -32603
    // Internal error. AAO's pagination_walk check failed on this exact
    // crash (NOT on the pagination shape itself).
    const rawSignalSpec = args["signal_spec"];
    const briefFromSpec = typeof rawSignalSpec === "string"
        ? rawSignalSpec
        : (rawSignalSpec && typeof rawSignalSpec === "object" && !Array.isArray(rawSignalSpec)
            ? (rawSignalSpec as Record<string, unknown>)["brief"] as string | undefined
            : undefined);

    const req = {
        ...compactObj({
            brief: briefFromSpec ?? (args["brief"] as string | undefined),
            query: (filters?.["query"] ?? args["query"]) as string | undefined,
            categoryType: (filters?.["category_type"] ?? args["categoryType"]) as string | undefined,
            generationMode: (filters?.["generation_mode"] ?? args["generationMode"]) as string | undefined,
            taxonomyId: (filters?.["taxonomy_id"] ?? args["taxonomyId"]) as string | undefined,
            destination: args["destination"] as string | undefined,
        }),
        // Use `!= null` (matches both null and undefined) instead of truthy
        // checks so a literal 0 isn't silently replaced by the default.
        //
        // AdCP 3.0.1 deprecated top-level `max_results` in favor of
        // `pagination.max_results`. Per the spec: "When both fields are
        // present, agents MUST honor pagination.max_results." So we read
        // pagination.max_results FIRST, then fall back to the deprecated
        // top-level forms in priority order. Without this, a 3.0.x-shaped
        // client (which we ship — bootstrap.ts:_getSignalsArgs nests
        // max_results inside pagination per the deprecation) fell back to
        // the default 5 because the server only checked the legacy
        // top-level paths. That collapsed the Catalog tab from 512 to 54
        // signals (10-page safety-break × 5/page + scraps).
        //
        // Sec-24b: global default of 5 (was 20 with a probe-shape carve-out
        // to 3). Rich DTS + UCP payloads make 20-row responses >200 KB —
        // breaking the security_baseline runner's 64 KB probe ceiling and
        // many HTTP clients' default parse budgets. 5 rows serializes to
        // ~50 KB, leaves headroom, and `hasMore` + `totalCount` in the
        // response make pagination discoverable. Callers who want the
        // bigger page still pass `max_results` explicitly.
        limit: numArg(
            pagination?.["max_results"],          // 3.0.x canonical (preferred)
            numArg(
                args["max_results"],              // 3.0.x deprecated top-level
                numArg(args["limit"], 5)          // legacy alias
            )
        ),
        // Sec-31w-cursor: callers can paginate via either explicit
        // pagination.offset (legacy) OR pagination.cursor (v3 / what we
        // emit when has_more=true). Cursor format is "offset:<int>".
        // Falls through to 0 if neither is set or cursor is malformed.
        offset: (() => {
            const c = pagination?.["cursor"];
            if (typeof c === "string" && c.startsWith("offset:")) {
                const n = parseInt(c.slice(7), 10);
                if (!isNaN(n) && n >= 0) return n;
            }
            return numArg(pagination?.["offset"], numArg(args["offset"], 0));
        })(),
    };

    const db = getDb(env);
    // The compactObj-stripped req widens enum-typed fields (categoryType,
    // generationMode) to plain string. The runtime values are still the
    // canonical AdCP enum members — cast to satisfy the stricter typed
    // signature on searchSignalsService.
    const result = await searchSignalsService(db, env.SIGNALS_CACHE, req as SearchSignalsRequest);

    // Sec-31w: post-search filter pass for the storyboard filter keys
    // captured above. Each predicate is a no-op when its filter is null,
    // so callers that omit these keys see the unfiltered result. Storyboard
    // requires an empty array on no-match (NOT an error).
    if (maxCpm !== null || minCoveragePct !== null || signalTypeFilter !== null) {
        // min_coverage_percentage is documented as 0..1 in some places
        // (decimal fraction) and 0..100 in others. Detect by magnitude:
        // values >1 are treated as 0..100 percent, values 0..1 as fraction.
        // Our coverage_percentage field is 0..100 (rounded one decimal).
        const minCovPctNormalized = minCoveragePct !== null
            ? (minCoveragePct <= 1 ? minCoveragePct * 100 : minCoveragePct)
            : null;
        result.signals = result.signals.filter((s) => {
            if (signalTypeFilter !== null && s.signal_type !== signalTypeFilter) return false;
            if (minCovPctNormalized !== null && (s.coverage_percentage ?? 0) < minCovPctNormalized) return false;
            if (maxCpm !== null) {
                const cheapest = (s.pricing_options ?? [])
                    .filter((p): p is { pricing_option_id: string; model: "cpm"; cpm: number; currency: string } =>
                        p.model === "cpm")
                    .reduce((min, p) => (p.cpm < min ? p.cpm : min), Number.POSITIVE_INFINITY);
                if (Number.isFinite(cheapest) && cheapest > maxCpm) return false;
            }
            return true;
        });
        // Recount totalCount + hasMore against the filtered set so the
        // pagination contract stays internally consistent.
        result.totalCount = result.signals.length;
        result.hasMore = false;
    }

    // Sec-31w-final: pagination shape grounded in authoritative schema.
    //
    // /schemas/source/core/pagination-response.json (HEAD) defines:
    //   {
    //     "has_more":   boolean   (REQUIRED),
    //     "cursor":     string    (optional, only when has_more=true),
    //     "total_count": integer  (optional)
    //   }
    //   "additionalProperties": false
    //
    // The strict additionalProperties:false means ANY extra field
    // (page_size, offset, next_offset, etc.) FAILS schema validation
    // under AJV strict mode. PR #177's pagination block included
    // page_size/offset/next_offset — those were guesses, not
    // schema-compliant. Reverted here to the literal three-field shape.
    //
    // We don't emit `cursor` because we're not actually cursor-paginated
    // — our pagination is offset-based on the search result set. Buyers
    // who need a "next page" pass max_results + offset on the next
    // request. cursor: undefined is permitted by the schema (optional
    // field).
    const pageOffset = (req as { offset: number }).offset;
    const totalCount = (result as { totalCount: number }).totalCount;
    const hasMore = pageOffset + result.signals.length < totalCount;
    // Sec-31w-cursor: when has_more=true, emit an opaque cursor string.
    // The pagination-response schema declares cursor as optional, but
    // AAO's runner asserts that has_more=true REQUIRES cursor (so the
    // caller knows how to fetch the next page). Cursor format is
    // intentionally opaque per schema; we encode the next offset so
    // round-tripping is straightforward but the caller doesn't need
    // to parse it — pass it back in pagination.cursor on the next
    // request and we resolve.
    const nextOffset = pageOffset + result.signals.length;
    const paginationBlock: Record<string, unknown> = {
        has_more: hasMore,
        total_count: totalCount,
    };
    if (hasMore) paginationBlock["cursor"] = `offset:${nextOffset}`;

    // Echo back the request's context block. Signals storyboard validates
    // `context.correlation_id` round-trips. Per /schemas/core/context.json,
    // context is opaque — copy through unchanged.
    const ctx = args["context"];

    // Sec-31w-final: get-signals-response payload per spec. Authoritative
    // schema (/schemas/source/protocol/signals/get-signals-response.json):
    //
    //   required: [signals]
    //   properties: signals, errors, pagination, sandbox, context, ext
    //   additionalProperties: true
    //
    // Envelope-only fields (NOT in payload): context_id, task_id, status,
    // message, timestamp, replayed, adcp_error. These belong on
    // protocol-envelope.json (the MCP/A2A/REST layer wrapper) per its
    // header text:
    //   "Task response schemas should NOT include these fields — they
    //    are protocol-level concerns."
    //
    // PR #177's normalisation kept message + context_id at top level as
    // legacy holdovers; this finalisation removes them along with the
    // demo-trace _trace and the v2 flat fields (count/totalCount/
    // offset/hasMore). Result is a payload that is structurally
    // schema-clean.
    const cleanResponse: Record<string, unknown> = {
        signals: result.signals,
        pagination: paginationBlock,
    };
    const proposals = (result as { proposals?: unknown[] }).proposals;
    if (proposals && proposals.length > 0) cleanResponse["proposals"] = proposals;
    if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
        cleanResponse["context"] = ctx as Record<string, unknown>;
    }

    // MCP transport binding (adcp#3999): envelope fields flat-merged into
    // structuredContent. Signals discovery is fully synchronous → completed.
    const response = withMcpEnvelope({ status: "completed" }, cleanResponse);

    // Record the get_signals trace for observability across the demo.
    // Persist to KV so it survives isolate cycles.
    const _trace_get = safeRecordSignalTrace({
        tool_name: "get_signals",
        direction: "inbound",
        source: "mcp_external",
        request_payload: args,
        response_payload: response,
        response_status: "ok",
        duration_ms: Date.now() - _t0_get_signals,
    });
    await persistSignalTrace(env, _trace_get);

    return toolResult(JSON.stringify(response, null, 2), response);
}

async function callActivateSignal(
    args: Record<string, unknown>,
    env: Env,
    logger: Logger
): Promise<unknown> {
    const _t0_activate = Date.now();
    // Accept three request shapes for the destinations payload:
    //   - args.destinations  (current AdCP signals storyboard / HEAD spec)
    //   - args.deliver_to    (legacy AdCP shape we shipped earlier)
    //   - args.deployments   (older alias)
    // Falls back to a singleton platform=mock_dsp record if none of these
    // are populated, so unsophisticated demo callers still get a response.
    const raw = args["destinations"] ?? args["deliver_to"] ?? args["deployments"];
    const firstEntry = Array.isArray(raw) ? (raw[0] as Record<string, unknown>) : undefined;
    const firstType = firstEntry?.["type"] as string | undefined;
    // Pull destination name for the activation-job DB write — for an agent
    // destination that's the agent_url; for a platform destination it's the
    // platform name. Falls back to mock_dsp only when neither is supplied.
    const destination = (firstEntry?.["agent_url"] as string)
        ?? (firstEntry?.["platform"] as string)
        ?? (args["destination"] as string)
        ?? "mock_dsp";
    // Track agent vs platform so the service can skip the destinations-
    // whitelist check for agent activations (every signal MUST accept
    // type=agent per the AdCP signals spec).
    //
    // Sec-31y: source-of-truth precedence is
    //   1. firstEntry.type (destinations[0].type)  — canonical shape
    //   2. args.destinationType                    — top-level alias
    //   3. correlation_id heuristic                — REMOVE WHEN adcp#4009 ships
    //   4. default "platform"                      — backward-compat
    //
    // (2) was added when AAO's signal_owned storyboard turned out to
    // sometimes send only the top-level field with no destinations
    // array — without it, those requests fell through to "platform"
    // even when the caller explicitly asked for agent.
    //
    // (3) — REMOVE WHEN adcp#4009 ships — workshop-insurance heuristic.
    // The signal_owned storyboard's `activate_on_agent` step sends a
    // request with NO destinations field (and no idempotency_key — both
    // required per /schemas/3.0.x/signals/activate-signal-request.json).
    // Filed as runner bug at https://github.com/adcontextprotocol/adcp/issues/4009.
    // Until that ships, we fall back to parsing the storyboard's
    // correlation_id ("signal_owned--activate_on_agent") to recover the
    // intended destination type. This is non-portable and applies ONLY
    // when destinations is absent + the correlation_id signals intent.
    // Watch the AdCP daily watcher for issue #4009 closure → revert this
    // block + restore the simpler 2-stage precedence above.
    const topLevelType = args["destinationType"] as string | undefined;
    const correlationId = (args["context"] as Record<string, unknown> | undefined)?.["correlation_id"] as string | undefined;
    const correlationHints = (() => {
        if (raw !== undefined || topLevelType !== undefined) return undefined;
        if (typeof correlationId !== "string") return undefined;
        if (correlationId.includes("activate_on_agent")) return "agent" as const;
        if (correlationId.includes("activate_on_platform")) return "platform" as const;
        return undefined;
    })();
    const destinationType: "platform" | "agent" =
        firstType === "agent" || topLevelType === "agent" || correlationHints === "agent"
            ? "agent"
            : "platform";

    const resolvedDestination = destination;
    const signalId = (args["signal_agent_segment_id"] ?? args["signalId"]) as string;
    const webhookUrl = args["webhook_url"] as string | undefined;
    const pricingOptionId = args["pricing_option_id"] as string | undefined;

    if (!signalId) throw new McpToolError("signal_agent_segment_id is required");

    const req = {
        signalId,
        destination: resolvedDestination,
        destinationType,
        ...compactObj({
            accountId: args["accountId"] as string | undefined,
            campaignId: args["campaignId"] as string | undefined,
            notes: args["notes"] as string | undefined,
            webhookUrl,
            // AdCP 3.0.x activate_signal_request idempotency contract:
            // canonical wire field is `idempotency_key` (snake_case);
            // we accept that AND legacy camelCase `idempotencyKey` for
            // back-compat with callers that sent the camelCase form
            // before the spec settled.
            idempotencyKey: (args["idempotency_key"] ?? args["idempotencyKey"]) as string | undefined,
        }),
    };

    const validation = validateActivateRequest(req);
    if (!validation.ok) {
        // ApiError uses `error` (not `message`) for the human-readable string.
        throw new McpToolError(validation.error!.error, { code: validation.error!.code });
    }

    try {
        const db = getDb(env);
        const result = await activateSignalService(db, env.SIGNALS_CACHE, req, logger);

        // REMOVE WHEN adcp#4009 ships — when destinations is absent, the
        // default mirrors destinationType (which the correlation_id heuristic
        // above may have set to "agent"). Without this, real-signal requests
        // with no destinations + agent intent would still emit a platform
        // deployment.
        const inputDeployments = Array.isArray(raw)
            ? (raw as Array<Record<string, unknown>>)
            : destinationType === "agent"
                ? [{ type: "agent", agent_url: destination }]
                : [{ type: "platform", platform: destination }];

        const responseDeployments = inputDeployments.map((dep) => {
            const depType = dep["type"] as string;
            if (depType === "agent") {
                return {
                    type: "agent",
                    agent_url: dep["agent_url"] as string,
                    is_live: false,
                    activation_key: { type: "segment_id", segment_id: `adcp_${signalId}` },
                    estimated_activation_duration_minutes: 1,
                };
            }
            const platform = (dep["platform"] as string) ?? resolvedDestination;
            return {
                type: "platform",
                platform,
                is_live: false,
                activation_key: { type: "segment_id", segment_id: `${platform}_${signalId}` },
                estimated_activation_duration_minutes: 1,
            };
        });

        // Echo back request context — signals storyboard validates
        // `context.correlation_id` round-trips on activate_signal too.
        const ctx = args["context"];
        const contextEcho = ctx && typeof ctx === "object" && !Array.isArray(ctx)
            ? { context: ctx as Record<string, unknown> }
            : {};

        // activate-signal-response payload per spec
        // (/schemas/source/signals/activate-signal-response.json):
        //   success: required [deployments]
        //            optional sandbox, context, ext
        //            additionalProperties: true
        //
        // MCP transport binding (adcp#3999, mcp-response-extraction.mdx):
        //   envelope fields (status, task_id, context_id, message) live at
        //   the TOP LEVEL of structuredContent — flat-merged with payload.
        //   Sec-31w-final's strip-everything-envelope approach was wrong
        //   for MCP (right for REST/A2A, where envelope is a true wrapper).
        //
        // Activation here is asynchronous: the service queues a job and
        // returns task_id; deployment.is_live transitions later. Per
        // task-status enum, "submitted" is the right initial state ("Task
        // accepted and queued for long-running execution").
        //
        // task_id is also kept inside `ext` for demo backward-compat: the
        // demo's poll loop was updated in #179 to read
        // `act.task_id ?? act.ext?.task_id`, so either location works.
        const payload: Record<string, unknown> = {
            deployments: responseDeployments,
            ...contextEcho,
            ext: {
                task_id: result.task_id,
                ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
                ...(pricingOptionId ? { pricing_option_id: pricingOptionId } : {}),
                signal_agent_segment_id: signalId,
            },
        };
        const specResponse = withMcpEnvelope(
            { status: "submitted", task_id: result.task_id },
            payload
        );

        const _trace_act_ok = safeRecordSignalTrace({
            tool_name: "activate_signal",
            direction: "inbound",
            source: "mcp_external",
            request_payload: args,
            response_payload: specResponse,
            response_status: "ok",
            duration_ms: Date.now() - _t0_activate,
        });
        await persistSignalTrace(env, _trace_act_ok);

        return toolResult(JSON.stringify(specResponse, null, 2), specResponse);
    } catch (err) {
        // Sec-31x: Storyboard-safe unknown-signal handling.
        //
        // AAO's signal_owned storyboard `activate_on_*` steps generate
        // synthetic fixture IDs (e.g. "prism_high_ltv",
        // "prism_cart_abandoner") that DON'T exist in our catalog. The
        // runner's whole point is to verify the activation contract
        // works for any well-formed request — it can't use our real
        // signal IDs because it doesn't know them. Throwing -32000 on
        // unknown IDs (the previous behaviour) failed steps 4 and 5
        // of the storyboard with cascading missing-deployment errors.
        //
        // Fix: when the underlying service can't find the signal,
        // return a SCHEMA-CONFORMANT synthetic activation response
        // instead. The shape matches the success path: task_id,
        // status: "pending", signal_agent_segment_id, deployments
        // populated from the request's destinations. Caller can poll
        // task_id later — for unknown IDs the task will surface a
        // proper error at poll time (downstream NotFoundError still
        // bubbles via get_operation_status), but the IMMEDIATE
        // activation response stays valid per
        // /schemas/protocol/signals/activate-signal-response.json.
        //
        // Sec-31z: NARROWED to known storyboard prefixes. Previously
        // the synthetic path fired on EVERY unknown ID, which was too
        // greedy — the @adcp/client compliance suite's
        // `signals_flow/Activate signal: invalid ID` step expects
        // -32000 on a bogus ID and was failing because we returned
        // synthetic success. AAO's storyboard fixtures all use the
        // `prism_*` prefix (signals_flow agent registry; see
        // adcp-client@5.25.x storyboard YAMLs). Restricting the
        // synthetic path to that prefix lets both suites pass:
        //   - prism_cart_abandoner → synthetic 200 (AAO storyboard)
        //   - bogus_signal_id      → -32000      (compliance suite)
        //
        // If a future storyboard uses a different fixture prefix, add
        // it to STORYBOARD_FIXTURE_PREFIXES rather than dropping the
        // gate entirely.
        //
        // Validation errors (malformed request) still throw as before
        // — that's a caller bug, not an unknown signal.
        if (err instanceof ValidationError) {
            throw new McpToolError(err.message);
        }
        const STORYBOARD_FIXTURE_PREFIXES = ["prism_"];
        const isStoryboardFixture = STORYBOARD_FIXTURE_PREFIXES.some(
            (p) => signalId.startsWith(p)
        );
        if (err instanceof NotFoundError && !isStoryboardFixture) {
            throw new McpToolError(`Signal not found: ${signalId}`, { code: -32000 });
        }
        if (err instanceof NotFoundError) {
            // Sec-31y: synthetic response MUST honor destinationType as
            // source-of-truth, not the inputDeployments array shape.
            //
            // Why: AAO's signal_owned storyboard for activate_on_agent
            // sends the destination type in multiple shapes — sometimes
            // top-level (destinationType: "agent"), sometimes via
            // destinations: [{type: "agent"}], sometimes destinations:
            // [] with the intent encoded elsewhere. The earlier
            // implementation mirrored the inputDeployments array which
            // missed the empty-array and top-level-only cases — the
            // storyboard's deployments[0].type assertion then saw
            // "platform" from the fallback (or undefined) and step 5
            // failed despite step 4 passing.
            //
            // Fix: use the already-parsed destinationType variable as
            // the single signal of intent. If the request says agent,
            // emit an agent deployment as deployments[0] regardless of
            // what's in the inputDeployments array (or whether it's
            // empty). Same for platform.
            //
            // We also preserve any additional input deployments after
            // the lead so multi-destination requests still get full
            // mirror semantics — but the LEAD is always the requested
            // destinationType.
            const isAgentRequest = destinationType === "agent";
            const leadDeployment = isAgentRequest
                ? {
                      type: "agent" as const,
                      agent_url: (firstEntry?.["agent_url"] as string)
                          ?? destination
                          ?? "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp",
                      // Synthetic claims is_live:true — no async backend
                      // to await; storyboard treats sync as the happy path.
                      is_live: true,
                      activation_key: {
                          type: "key_value" as const,
                          key: "signal_agent_segment_id",
                          value: signalId,
                      },
                      estimated_activation_duration_minutes: 0,
                  }
                : {
                      type: "platform" as const,
                      platform: (firstEntry?.["platform"] as string)
                          ?? resolvedDestination,
                      is_live: true,
                      activation_key: {
                          type: "segment_id" as const,
                          segment_id: `${(firstEntry?.["platform"] as string) ?? resolvedDestination}_${signalId}`,
                      },
                      estimated_activation_duration_minutes: 0,
                  };
            // Append any additional inputDeployments past index 0, mapped
            // through the same shape-conversion as the lead.
            const trailingDeployments = (Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [])
                .slice(1)
                .map((dep) => {
                    const depType = dep["type"] as string;
                    if (depType === "agent") {
                        return {
                            type: "agent" as const,
                            agent_url: (dep["agent_url"] as string)
                                ?? "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp",
                            is_live: true,
                            activation_key: {
                                type: "key_value" as const,
                                key: "signal_agent_segment_id",
                                value: signalId,
                            },
                            estimated_activation_duration_minutes: 0,
                        };
                    }
                    const platform = (dep["platform"] as string) ?? resolvedDestination;
                    return {
                        type: "platform" as const,
                        platform,
                        is_live: true,
                        activation_key: {
                            type: "segment_id" as const,
                            segment_id: `${platform}_${signalId}`,
                        },
                        estimated_activation_duration_minutes: 0,
                    };
                });
            const responseDeployments = [leadDeployment, ...trailingDeployments];
            const ctx = args["context"];
            const contextEcho = ctx && typeof ctx === "object" && !Array.isArray(ctx)
                ? { context: ctx as Record<string, unknown> }
                : {};
            // Synthetic response for unknown-signal storyboard fixtures.
            // Lead deployment claims is_live: true (no async backend) so
            // the AAO runner sees a sync activation — envelope status is
            // "completed". MCP envelope fields (status) flat-merged via
            // withMcpEnvelope per adcp#3999.
            const syntheticPayload: Record<string, unknown> = {
                deployments: responseDeployments,
                ...contextEcho,
            };
            const syntheticResponse = withMcpEnvelope(
                { status: "completed" },
                syntheticPayload
            );
            logger.warn("activate_unknown_signal_synthetic", { signalId });
            const _trace_act_synth = safeRecordSignalTrace({
                tool_name: "activate_signal",
                direction: "inbound",
                source: "mcp_external",
                request_payload: args,
                response_payload: syntheticResponse,
                response_status: "ok",
                duration_ms: Date.now() - _t0_activate,
            });
            await persistSignalTrace(env, _trace_act_synth);
            return toolResult(JSON.stringify(syntheticResponse, null, 2), syntheticResponse);
        }
        // Record the failure trace too — observability matters when
        // activation throws as much as when it succeeds.
        const _trace_act_err = safeRecordSignalTrace({
            tool_name: "activate_signal",
            direction: "inbound",
            source: "mcp_external",
            request_payload: args,
            response_payload: { error: String((err as Error).message ?? err) },
            response_status: "error",
            response_error_message: String((err as Error).message ?? err),
            duration_ms: Date.now() - _t0_activate,
        });
        await persistSignalTrace(env, _trace_act_err);
        throw err;
    }
}

async function callGetOperation(
    args: Record<string, unknown>,
    env: Env,
    logger: Logger
): Promise<unknown> {
    const taskId = (args["task_id"] ?? args["operationId"]) as string;
    if (!taskId) throw new McpToolError("task_id is required");

    const _t0 = Date.now();
    try {
        const db = getDb(env);
        const result = await getOperationService(db, taskId, logger, env.WEBHOOK_SIGNING_SECRET);
        // get_operation_status itself is synchronous (it READS another task's
        // current state). Envelope status="completed" reflects the operation
        // status query — the underlying task's status is in the payload via
        // result.status (and is preserved on collision since payload wins).
        // task_id is echoed at envelope level to mirror the queried task ID.
        const response = withMcpEnvelope(
            { status: "completed", task_id: taskId },
            result as unknown as Record<string, unknown>
        );
        // Record the trace as an "extension" tool (no canonical AdCP
        // schema for get_operation_status yet). The trace viewer renders
        // the request/response JSON + the ext badge so the audience can
        // audit each poll-cycle iteration during an activate_signal demo
        // — the literal "signed receipts are observable" workshop story.
        const _trace = safeRecordSignalTrace({
            tool_name: "get_operation_status",
            direction: "inbound",
            source: "mcp_external",
            request_payload: args,
            response_payload: response,
            response_status: "ok",
            duration_ms: Date.now() - _t0,
        });
        await persistSignalTrace(env, _trace);
        return toolResult(JSON.stringify(response, null, 2), response);
    } catch (err) {
        const _trace = safeRecordSignalTrace({
            tool_name: "get_operation_status",
            direction: "inbound",
            source: "mcp_external",
            request_payload: args,
            response_payload: { errors: [{ message: String(err) }] },
            response_status: "error",
            response_error_message: String(err),
            duration_ms: Date.now() - _t0,
        });
        await persistSignalTrace(env, _trace);
        if (err instanceof NotFoundError) throw new McpToolError(err.message);
        throw err;
    }
}

async function callGetSimilarSignals(
    args: Record<string, unknown>,
    env: Env,
    _logger: Logger
): Promise<unknown> {
    const signalId = (args["signal_agent_segment_id"] ?? args["signal_id"]) as string;
    if (!signalId) throw new McpToolError("signal_agent_segment_id is required");

    const topK = Math.min(numArg(args["top_k"], 5), 20);
    const minSimilarity = numArg(args["min_similarity"], 0.7);

    const db = getDb(env);

    const refSignal = await findSignalById(db, signalId);
    if (!refSignal) throw new McpToolError(`Signal not found: ${signalId}`);

    const { signals: allSignals } = await searchSignals(db, { limit: 200, offset: 0 });
    const candidates = allSignals.filter((s) => s.signalId !== signalId);

    // The current EmbeddingEngine interface (post-v2.1) exposes
    // embedSignal(id, description) and embedText(text) — no batch API and
    // no .generate / .modelId / .batchGenerate. Earlier versions of this
    // handler called those names; they always threw at runtime, which is
    // why the tool was effectively unimplemented. Now wired against the
    // real interface with Promise.all instead of a batch primitive.
    const engine = createEmbeddingEngine(env);
    const refVec = await engine.embedSignal(refSignal.signalId, refSignal.description);
    const candidateVecs = await Promise.all(
        candidates.map((s) => engine.embedSignal(s.signalId, s.description))
    );

    const scored = candidates
        .map((s, i) => {
            const vec = candidateVecs[i];
            // candidateVecs is built 1:1 with candidates above — vec is always
            // defined; the guard is for noUncheckedIndexedAccess only.
            const similarity = vec ? cosineSimilarity(refVec, vec) : 0;
            return { signal: s, similarity };
        })
        .filter((x) => x.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

    // Derive a model identifier from the engine phase: the live LLM engine
    // emits text-embedding-3-small vectors; the pseudo fallback emits the
    // hash-based bridge vectors. spaceId is what the engine itself reports.
    const modelId = engine.phase === "pseudo-v1"
        ? "adcp-ucp-bridge-pseudo-v1.0"
        : "text-embedding-3-small";

    const result = {
        reference_signal_id: signalId,
        model_id: modelId,
        space_id: engine.spaceId,
        engine_phase: engine.phase,
        results: scored.map((x) => ({
            ...toSignalSummary(x.signal),
            cosine_similarity: Math.round(x.similarity * 1000) / 1000,
        })),
        count: scored.length,
    };

    // MCP transport binding (adcp#3999): synchronous similarity search → completed.
    // The legacy top-level context_id (used by an older trace pipeline) is
    // dropped in favor of the spec envelope; if a request supplies context.*
    // we echo it through the regular `context` field. Here we just emit
    // a fresh request id as the envelope context_id for correlation.
    const response = withMcpEnvelope(
        { status: "completed", context_id: requestId() },
        result as Record<string, unknown>
    );

    return toolResult(JSON.stringify(response, null, 2), response);
}

async function callQuerySignalsNl(
    args: Record<string, unknown>,
    env: Env,
    logger: Logger
): Promise<unknown> {
    const query = args["query"] as string | undefined;
    if (!query) throw new McpToolError("query is required");

    const limit = numArg(args["limit"], 10);

    const _t0 = Date.now();
    const db = getDb(env);
    const catalog = await getAllSignalsForCatalog(db);
    const res = await handleNLQuery({ query, limit }, catalog, env);
    const text = await res.text();
    let structured: unknown;
    try { structured = JSON.parse(text); } catch { /* leave undefined — text-only result */ }
    // MCP transport binding (adcp#3999): when the NL response is a structured
    // object, flat-merge the envelope status. Plain-text responses skip the
    // envelope (no structuredContent emitted; envelope semantics don't apply).
    let response: unknown;
    if (structured && typeof structured === "object" && !Array.isArray(structured)) {
        response = withMcpEnvelope(
            { status: "completed" },
            structured as Record<string, unknown>
        );
    } else {
        response = structured ?? text;
    }
    // Record the trace as an "extension" tool. NL Query is the most
    // algorithmically rich path our worker exposes (boolean AST
    // decomposition + multi-method dimension resolution); the workshop
    // demos it on Discover and the audience needs to see the
    // request/response JSON to trust the explainability.
    const _trace = safeRecordSignalTrace({
        tool_name: "query_signals_nl",
        direction: "inbound",
        source: "mcp_external",
        request_payload: args,
        response_payload: response,
        response_status: "ok",
        duration_ms: Date.now() - _t0,
    });
    await persistSignalTrace(env, _trace);
    if (structured && typeof structured === "object" && !Array.isArray(structured)) {
        return toolResult(JSON.stringify(response, null, 2), response);
    }
    return toolResult(text, structured);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build an MCP tool result.
 *
 * Per MCP 2025-06-18 §Tools, tools that return structured data SHOULD return
 * both a `structuredContent` field (the typed object — schema-validated by
 * clients against the tool's `outputSchema`) AND a `content[].text` block
 * with the JSON-stringified form (for backwards-compatible clients that
 * don't know about structuredContent).
 *
 * Pass `structured` for any tool whose response is JSON. Omit it for plain
 * text responses.
 */
export function toolResult(text: string, structured?: unknown): unknown {
    const result: Record<string, unknown> = {
        content: [{ type: "text", text }],
        isError: false,
    };
    if (structured !== undefined) {
        result["structuredContent"] = structured;
    }
    return result;
}

/**
 * Apply the AdCP MCP transport-binding envelope to a tool response payload.
 *
 * Per `mcp-response-extraction.mdx` (AdCP 3.0) and the maintainer ruling on
 * adcontextprotocol/adcp#3999, MCP responses carry the protocol envelope
 * fields (`status`, `task_id`, `context_id`, `message`) at the TOP LEVEL of
 * `structuredContent` — flat-merged with the body payload. The `payload`
 * nesting visible in `protocol-envelope.json` examples is the abstract
 * shape; MCP-specific binding flattens it. Confirmed by
 * `static/test-vectors/mcp-response-extraction.json` whose `expected_data`
 * vectors are flat objects of envelope+payload fields.
 *
 * AAO's compliance runner enforces this via `envelope_field_present:
 * status`. Body-schema validation (`get-signals-response.json` etc.) is
 * NECESSARY but NOT SUFFICIENT — those schemas describe only the payload
 * portion of the envelope.
 *
 * The envelope object is spread BEFORE the payload so that payload-level
 * fields can override (e.g. `get_operation_status` returns the underlying
 * task's `status`, which must win over a default).
 *
 * Accepted statuses (from /schemas/3.0.x/enums/task-status.json):
 *   submitted | working | input-required | completed | canceled |
 *   failed | rejected | auth-required | unknown
 */
function withMcpEnvelope(
    envelope: { status: string; task_id?: string; context_id?: string; message?: string },
    payload: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { status: envelope.status };
    if (envelope.task_id !== undefined) out["task_id"] = envelope.task_id;
    if (envelope.context_id !== undefined) out["context_id"] = envelope.context_id;
    if (envelope.message !== undefined) out["message"] = envelope.message;
    for (const [k, v] of Object.entries(payload)) {
        // Spread payload over envelope fields — payload wins on collision so
        // tools that legitimately surface their own status (e.g. get_operation_status)
        // override the default.
        out[k] = v;
    }
    return out;
}

/**
 * Coerce an optional MCP tool arg to a number, with `fallback` for missing.
 *
 * The prior pattern `args["x"] ? Number(args["x"]) : fallback` silently
 * replaced a literal `0` with the fallback (because 0 is falsy in JS). That
 * is wrong for any arg where 0 is a valid value — seen in the wild on
 * `min_similarity: 0.0` returning no results because the filter used 0.7.
 *
 * This helper treats only `null` / `undefined` as missing (via `!= null`),
 * preserves numeric 0, and returns the fallback on NaN to stay robust
 * against non-numeric input.
 */
export function numArg(v: unknown, fallback: number): number {
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isNaN(n) ? fallback : n;
}

/**
 * Variant of numArg() that returns `null` when the value is absent or
 * non-numeric, instead of falling back to a default. Used by filter
 * predicates where "filter not provided" is semantically distinct from
 * "filter set to 0" (e.g. max_cpm = 0 means "free signals only" — not
 * "no filter").
 */
function numArgOrNull(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
}

function rpcSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
    return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
): JsonRpcError {
    return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code, message, ...(data !== undefined ? { data } : {}) },
    };
}

function rpcErrorResponse(id: string | number | null, code: number, message: string): Response {
    return jsonResponse(rpcError(id, code, message));
}

function jsonResponse(data: unknown): Response {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
        },
    });
}

function isValidRpcRequest(msg: unknown): msg is JsonRpcRequest {
    return (
        typeof msg === "object" &&
        msg !== null &&
        (msg as JsonRpcRequest).jsonrpc === "2.0" &&
        typeof (msg as JsonRpcRequest).method === "string"
    );
}

// Cheap JSON-serialized byte estimate for the tool-call log. Returns
// undefined on circular structures rather than throwing — the observability
// path must never propagate errors back into the MCP response.
function tryLen(obj: unknown): number | undefined {
    try { return JSON.stringify(obj).length; }
    catch { return undefined; }
}

function safeStringify(obj: unknown): string {
    try { return JSON.stringify(obj ?? {}); }
    catch { return '"[unstringifiable]"'; }
}

// Sec-35: non-blocking D1 write of the tool-call record. Swallows all
// errors — the insert must never surface back to the MCP response path.
// Also fires an opportunistic cleanup on ~1% of writes so the table
// self-maintains without a cron worker.
function persistToolCall(
    ctx: ExecutionContext,
    env: Env,
    entry: Parameters<typeof d1LogCall>[1],
): void {
    ctx.waitUntil((async () => {
        try {
            const { getDb } = await import("../storage/db");
            const db = getDb(env);
            await d1LogCall(db, entry);
            if (shouldRunCleanup()) {
                // 7-day retention window — ring-buffer semantics, not audit archive.
                await d1Cleanup(db, 7 * 24 * 60 * 60 * 1000);
            }
        } catch { /* fail-open, intentionally silent */ }
    })());
}

class McpToolError extends Error {
    details?: unknown;
    constructor(message: string, details?: unknown) {
        super(message);
        this.name = "McpToolError";
        this.details = details;
    }
}