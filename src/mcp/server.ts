// src/mcp/server.ts
// MCP server — Streamable HTTP transport (JSON-RPC 2.0).
// 8 tools: get_adcp_capabilities, get_signals, activate_signal, get_operation_status,
//          get_similar_signals, query_signals_nl, get_concept, search_concepts.
// v3.0-rc: handleInitialize now advertises GTS, projector, and handshake simulator.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
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

export async function handleMcpRequest(
    request: Request,
    env: Env,
    logger: Logger
): Promise<Response> {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return rpcErrorResponse(null, RPC_PARSE_ERROR, "Parse error: invalid JSON");
    }

    if (Array.isArray(body)) {
        const responses = await Promise.all(
            body.map((msg) => handleSingleMessage(msg, env, logger))
        );
        return jsonResponse(responses.filter(Boolean));
    }

    const response = await handleSingleMessage(body, env, logger);
    if (response === null) {
        return new Response(null, { status: 202 });
    }
    return jsonResponse(response);
}

async function handleSingleMessage(
    msg: unknown,
    env: Env,
    logger: Logger
): Promise<JsonRpcResponse | null> {
    if (!isValidRpcRequest(msg)) {
        return rpcError(null, RPC_INVALID_REQUEST, "Invalid JSON-RPC request");
    }

    const { id = null, method, params } = msg;
    logger.info("mcp_request", { method, id });

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
            case "tools/call":
                return rpcSuccess(id, await handleToolCall(params as McpCallToolParams, env, logger));
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
            version: env.API_VERSION ?? "3.0-rc",
            description:
                "AdCP Signals Provider — IAB Audience Taxonomy 1.1 aligned signal discovery, " +
                "brief-driven custom segment proposals, and async activation with webhook support.",
            ucp: {
                // Embedding space declaration (VAC)
                space_id: "openai-te3-small-d512-v1",
                phase: "v1",

                // Phase 2b: GTS + Projector (live as of v3.0-rc)
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
            const conceptResult = handleConceptToolCall(resolvedName, args);
            return toolResult(JSON.stringify(conceptResult, null, 2), conceptResult);
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
    const caps = await getCapabilities(env.SIGNALS_CACHE, protocols);

    // Echo back the request's context block. Capability-discovery storyboards
    // send context.correlation_id and assert it round-trips. Per
    // /schemas/core/context.json, context is opaque — we don't parse it, we
    // copy it through unchanged.
    const ctx = args["context"];
    const response = ctx && typeof ctx === "object" && !Array.isArray(ctx)
        ? { ...caps, context: ctx as Record<string, unknown> }
        : caps;

    return toolResult(JSON.stringify(response, null, 2), response);
}

async function callGetSignals(
    args: Record<string, unknown>,
    env: Env
): Promise<unknown> {
    const filters = args["filters"] as Record<string, unknown> | undefined;
    const deliverTo = args["deliver_to"] as Record<string, unknown> | undefined;
    const pagination = args["pagination"] as Record<string, unknown> | undefined;

    const req = {
        brief: (args["signal_spec"] ?? args["brief"]) as string | undefined,
        query: (filters?.["query"] ?? args["query"]) as string | undefined,
        categoryType: (filters?.["category_type"] ?? args["categoryType"]) as string | undefined,
        generationMode: (filters?.["generation_mode"] ?? args["generationMode"]) as string | undefined,
        taxonomyId: (filters?.["taxonomy_id"] ?? args["taxonomyId"]) as string | undefined,
        destination: args["destination"] as string | undefined,
        // Use `!= null` (matches both null and undefined) instead of truthy
        // checks so a literal 0 isn't silently replaced by the default.
        limit: numArg(args["max_results"], numArg(args["limit"], 20)),
        offset: numArg(pagination?.["offset"], numArg(args["offset"], 0)),
    };

    const db = getDb(env);
    const result = await searchSignalsService(db, env.SIGNALS_CACHE, req);
    return toolResult(JSON.stringify(result, null, 2), result);
}

async function callActivateSignal(
    args: Record<string, unknown>,
    env: Env,
    logger: Logger
): Promise<unknown> {
    const raw = args["deliver_to"] ?? args["deployments"];
    const destination = Array.isArray(raw)
        ? ((raw[0] as Record<string, unknown>)?.["platform"] as string ?? "mock_dsp")
        : (args["destination"] as string ?? "mock_dsp");

    const resolvedDestination = destination;
    const signalId = (args["signal_agent_segment_id"] ?? args["signalId"]) as string;
    const webhookUrl = args["webhook_url"] as string | undefined;
    const pricingOptionId = args["pricing_option_id"] as string | undefined;

    if (!signalId) throw new McpToolError("signal_agent_segment_id is required");

    const req = {
        signalId,
        destination: resolvedDestination,
        accountId: args["accountId"] as string | undefined,
        campaignId: args["campaignId"] as string | undefined,
        notes: args["notes"] as string | undefined,
        webhookUrl,
    };

    const validation = validateActivateRequest(req);
    if (!validation.ok) {
        // ApiError uses `error` (not `message`) for the human-readable string.
        throw new McpToolError(validation.error!.error, { code: validation.error!.code });
    }

    try {
        const db = getDb(env);
        const result = await activateSignalService(db, env.SIGNALS_CACHE, req, logger);

        const inputDeployments = Array.isArray(raw)
            ? (raw as Array<Record<string, unknown>>)
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

        const specResponse = {
            task_id: result.task_id,
            status: "pending",
            signal_agent_segment_id: signalId,
            deployments: responseDeployments,
            ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
            ...(pricingOptionId ? { pricing_option_id: pricingOptionId } : {}),
        };

        return toolResult(JSON.stringify(specResponse, null, 2), specResponse);
    } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError) {
            throw new McpToolError(err.message);
        }
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

    try {
        const db = getDb(env);
        const result = await getOperationService(db, taskId, logger);
        return toolResult(JSON.stringify(result, null, 2), result);
    } catch (err) {
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
        context_id: requestId(),
        count: scored.length,
    };

    return toolResult(JSON.stringify(result, null, 2), result);
}

async function callQuerySignalsNl(
    args: Record<string, unknown>,
    env: Env,
    logger: Logger
): Promise<unknown> {
    const query = args["query"] as string | undefined;
    if (!query) throw new McpToolError("query is required");

    const limit = numArg(args["limit"], 10);

    const db = getDb(env);
    const catalog = await getAllSignalsForCatalog(db);
    const res = await handleNLQuery({ query, limit }, catalog, env);
    const text = await res.text();
    let structured: unknown;
    try { structured = JSON.parse(text); } catch { /* leave undefined — text-only result */ }
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

class McpToolError extends Error {
    details?: unknown;
    constructor(message: string, details?: unknown) {
        super(message);
        this.name = "McpToolError";
        this.details = details;
    }
}