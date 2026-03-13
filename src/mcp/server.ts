// src/mcp/server.ts
// MCP server — Streamable HTTP transport (JSON-RPC 2.0).
// 8 tools: get_adcp_capabilities, get_signals, activate_signal, get_operation_status,
//          get_similar_signals, query_signals_nl, get_concept, search_concepts.

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
import { handleConceptToolCall } from "../domain/conceptHandler";
import { handleNLQuery } from "../domain/nlQueryHandler";
import { getAllSignalsForCatalog } from "../domain/signalService";

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
  // Read phase from live engine so initialize is always consistent with /ucp/gts
  const engine = createEmbeddingEngine(env as unknown as Record<string, string>);
  const enginePhase = engine.phase;    // "llm-v1" or "pseudo-v1"
  const spaceId = engine.spaceId;      // "openai-te3-small-d512-v1" or "adcp-bridge-space-v1.0"

  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: { listChanged: false } },
    serverInfo: {
      name: "adcp-signals-adaptor",
      version: env.API_VERSION ?? "2.6",
      description:
        "AdCP Signals Provider — IAB Audience Taxonomy 1.1 aligned signal discovery, " +
        "brief-driven custom segment proposals, and async activation with webhook support.",
      ucp: {
        space_id: spaceId,
        phase: enginePhase,
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
          from_space: spaceId,
          to_space: "ucp-space-v1.0",
          status: "simulated",
        },
        handshake_simulator: {
          supported: true,
          endpoint: "/ucp/simulate-handshake",
        },
        nl_query: {
          supported: true,
          endpoint: "/signals/query",
          min_embedding_score: 0.45,
          archetype_count: 4,
          concept_count: 19,
        },
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
      return callGetCapabilities(env);
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
    case "search_concepts":
      return toolResult(JSON.stringify(handleConceptToolCall(resolvedName, args), null, 2));
    default:
      throw new McpToolError(`Tool not implemented: ${name}`);
  }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callGetCapabilities(env: Env): Promise<unknown> {
  const caps = await getCapabilities(env.SIGNALS_CACHE);
  return toolResult(JSON.stringify(caps, null, 2));
}

async function callGetSignals(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  const filters = args["filters"] as Record<string, unknown> | undefined;
  const pagination = args["pagination"] as Record<string, unknown> | undefined;

  const req = {
    brief: (args["signal_spec"] ?? args["brief"]) as string | undefined,
    query: (filters?.["query"] ?? args["query"]) as string | undefined,
    categoryType: (filters?.["category_type"] ?? args["categoryType"]) as string | undefined,
    generationMode: (filters?.["generation_mode"] ?? args["generationMode"]) as string | undefined,
    taxonomyId: (filters?.["taxonomy_id"] ?? args["taxonomyId"]) as string | undefined,
    destination: args["destination"] as string | undefined,
    limit: args["max_results"] ? Number(args["max_results"]) : args["limit"] ? Number(args["limit"]) : 20,
    offset: (pagination?.["offset"] ? Number(pagination["offset"]) : args["offset"] ? Number(args["offset"]) : 0),
    signalIds: args["signal_ids"] as string[] | undefined,
  };

  // Extract destination from deliver_to
  const deliverTo = args["deliver_to"] as Record<string, unknown> | undefined;
  const deployments = deliverTo?.["deployments"] as Array<Record<string, unknown>> | undefined;
  if (!req.destination && deployments?.[0]) {
    req.destination = (deployments[0]["platform"] ?? deployments[0]["agent_url"]) as string | undefined;
  }

  const validation = validateSearchRequest(req);
  if (!validation.ok) {
    throw new McpToolError(validation.error!.message, { code: validation.error!.code });
  }

  const db = getDb(env);
  const result = await searchSignalsService(db, env, req);
  return toolResult(JSON.stringify(result, null, 2));
}

async function callActivateSignal(
  args: Record<string, unknown>,
  env: Env,
  logger: Logger
): Promise<unknown> {
  const raw = (args["deliver_to"] as Record<string, unknown> | undefined)?.["deployments"]
    ?? args["destinations"] ?? args["deployments"] ?? args["destination"];

  let destination: string | undefined;
  let accountId: string | undefined;

  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown>;
    destination = (first["platform"] ?? first["agent_url"]) as string | undefined;
    accountId = first["account_id"] as string | undefined;
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    destination = (obj["platform"] ?? obj["agent_url"]) as string | undefined;
    accountId = obj["account_id"] as string | undefined;
  } else if (typeof raw === "string") {
    destination = raw;
  }

  if (!destination) {
    throw new McpToolError(
      "Missing required field: destinations (array with { type: \"platform\", platform: \"<id>\" })"
    );
  }

  const PLATFORM_MAP: Record<string, string> = {
    mock_dsp: "mock_dsp", mock_cleanroom: "mock_cleanroom",
    mock_cdp: "mock_cdp", mock_measurement: "mock_measurement",
    "trade-desk": "mock_dsp", "the-trade-desk": "mock_dsp", ttd: "mock_dsp",
    dv360: "mock_dsp", xandr: "mock_dsp", pubmatic: "mock_dsp",
    "index-exchange": "mock_dsp", liveramp: "mock_cleanroom",
    meta: "mock_dsp", facebook: "mock_dsp", amazon: "mock_dsp", yahoo: "mock_dsp",
    "amazon-dsp": "mock_dsp", "amazon-ads": "mock_dsp",
  };
  const resolvedDestination = PLATFORM_MAP[destination.toLowerCase()] ?? "mock_dsp";

  const signalId = (args["signal_agent_segment_id"] ?? args["signal_id"] ?? args["signalId"]) as string;
  const webhookUrl = args["webhook_url"] as string | undefined;
  const pricingOptionId = args["pricing_option_id"] as string | undefined;

  const req = {
    signalId,
    destination: resolvedDestination,
    accountId: (args["accountId"] ?? accountId) as string | undefined,
    campaignId: args["campaignId"] as string | undefined,
    notes: args["notes"] as string | undefined,
    webhookUrl,
  };

  const validation = validateActivateRequest(req);
  if (!validation.ok) {
    throw new McpToolError(validation.error!.message, { code: validation.error!.code });
  }

  try {
    const db = getDb(env);
    const result = await activateSignalService(db, req, logger);

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

    return toolResult(JSON.stringify(specResponse, null, 2));
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
    return toolResult(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new McpToolError(err.message);
    }
    throw err;
  }
}

async function callGetSimilarSignals(
  args: Record<string, unknown>,
  env: Env,
  logger: Logger
): Promise<unknown> {
  const signalId = (args["signal_agent_segment_id"] ?? args["signal_id"]) as string;
  if (!signalId) throw new McpToolError("signal_agent_segment_id is required");

  const topK = Math.min(args["top_k"] ? Number(args["top_k"]) : 5, 20);
  const minSimilarity = args["min_similarity"] ? Number(args["min_similarity"]) : 0.7;

  const db = getDb(env);
  const refSignal = await findSignalById(db, signalId);
  if (!refSignal) throw new McpToolError(`Signal not found: ${signalId}`);

  const { signals: allSignals } = await searchSignals(db, { limit: 200, offset: 0 });
  const engine = createEmbeddingEngine(env as unknown as Record<string, string>);
  const refVec = await engine.embedSignal(refSignal.signalId, refSignal.description ?? refSignal.signalId);
  const candidates = allSignals.filter((s) => s.signalId !== signalId);

  const scored = (
    await Promise.all(
      candidates.map(async (s) => {
        const vec = await engine.embedSignal(s.signalId, s.description ?? s.signalId);
        return { signal: s, similarity: cosineSimilarity(refVec, vec) };
      })
    )
  )
    .filter((x) => x.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const result = {
    reference_signal_id: signalId,
    model_id: engine.phase === "llm-v1" ? "text-embedding-3-small" : "adcp-ucp-bridge-pseudo-v1.0",
    space_id: engine.spaceId,
    results: scored.map((x) => ({
      ...toSignalSummary(x.signal),
      cosine_similarity: Math.round(x.similarity * 1000) / 1000,
    })),
    context_id: requestId(),
    count: scored.length,
  };

  return toolResult(JSON.stringify(result, null, 2));
}

async function callQuerySignalsNl(
  args: Record<string, unknown>,
  env: Env,
  logger: Logger
): Promise<unknown> {
  const query = args["query"] as string | undefined;
  if (!query) throw new McpToolError("query is required");

  const limit = args["limit"] ? Number(args["limit"]) : 10;
  const db = getDb(env);
  const catalog = await getAllSignalsForCatalog(db);

  const response = await handleNLQuery({ query, limit }, catalog, env);
  const body = await response.json() as unknown;
  return toolResult(JSON.stringify(body, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toolResult(text: string): unknown {
  return { content: [{ type: "text", text }], isError: false };
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
