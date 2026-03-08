// src/mcp/server.ts
// MCP server — Streamable HTTP transport (JSON-RPC 2.0).
// 4 tools: get_adcp_capabilities, get_signals, activate_signal, get_operation_status.
// generate_custom_signal removed — proposals surface via get_signals brief param.
// activate_signal is now properly async: returns task_id + "pending" immediately.

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
import { createEmbeddingEngine, cosineSimilarity } from "../ucp/embeddingEngine";
import { toSignalSummary } from "../mappers/signalMapper";

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
      version: env.API_VERSION ?? "2.6",
      description:
        "AdCP Signals Provider — IAB Audience Taxonomy 1.1 aligned signal discovery, " +
        "brief-driven custom segment proposals, and async activation with webhook support.",
    },
  };
}

async function handleToolCall(
  params: McpCallToolParams,
  env: Env,
  logger: Logger
): Promise<unknown> {
  const { name, arguments: args = {} } = params;

  // Aliases not in ADCP_TOOLS schema are still valid — check after resolving aliases
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
    case "get_task_status":        // spec alias — both accepted
    case "get_signal_status":      // legacy alias
      return callGetOperation(args, env, logger);
    case "get_similar_signals":
      return callGetSimilarSignals(args, env, logger);
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
  // Normalize spec param names → internal names
  // signal_spec (spec) = brief (internal)
  // max_results (spec) = limit (internal)
  // deliver_to.deployments (spec) = destinations (internal)
  // filters.query / filters.category_type etc (spec) = flat query/categoryType (internal)
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
    limit: args["max_results"] ? Number(args["max_results"]) : args["limit"] ? Number(args["limit"]) : 20,
    offset: (pagination?.["offset"] ? Number(pagination["offset"]) : args["offset"] ? Number(args["offset"]) : 0),
    // deliver_to.deployments takes priority over destinations
    destinations: (
      deliverTo?.["deployments"] as Array<{ type: string; platform?: string; agent_url?: string }> | undefined
    ) ?? (args["destinations"] as Array<{ type: string; platform?: string; agent_url?: string }> | undefined),
  };

  const validation = validateSearchRequest(req);
  if (!validation.ok) {
    throw new McpToolError(validation.error!.message, { code: validation.error!.code });
  }

  const db = getDb(env);
  const result = await searchSignalsService(db, req as Parameters<typeof searchSignalsService>[1]);
  return toolResult(JSON.stringify(result, null, 2));
}

async function callActivateSignal(
  args: Record<string, unknown>,
  env: Env,
  logger: Logger
): Promise<unknown> {
  // Normalize all destination field variants
  // deliver_to.deployments (spec) > destinations > deployments > destination
  let destination: string | undefined;
  let accountId: string | undefined;

  const deliverTo = args["deliver_to"] as Record<string, unknown> | undefined;
  const raw = deliverTo?.["deployments"] ?? args["destinations"] ?? args["deployments"] ?? args["destination"];

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
    // @adcp/client test suite platforms
    meta: "mock_dsp", facebook: "mock_dsp", amazon: "mock_dsp", yahoo: "mock_dsp",
    "amazon-dsp": "mock_dsp", "amazon-ads": "mock_dsp",
  };
  const resolvedDestination = PLATFORM_MAP[destination.toLowerCase()] ?? "mock_dsp";

  // Accept all field name variants: spec (signal_agent_segment_id), SDK test suite (signal_id), legacy (signalId)
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

    // Build input deployments for response echo
    const inputDeployments = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : [{ type: "platform", platform: destination }];

    const responseDeployments = inputDeployments.map((dep) => {
      const depType = dep["type"] as string;
      if (depType === "agent") {
        return {
          type: "agent",
          agent_url: dep["agent_url"] as string,
          is_live: false,    // pending — not live until completed
          activation_key: { type: "segment_id", segment_id: `adcp_${signalId}` },
          estimated_activation_duration_minutes: 1,
        };
      }
      const platform = (dep["platform"] as string) ?? resolvedDestination;
      return {
        type: "platform",
        platform,
        is_live: false,    // pending
        activation_key: { type: "segment_id", segment_id: `${platform}_${signalId}` },
        estimated_activation_duration_minutes: 1,
      };
    });

    // Return pending response immediately — caller polls task_id
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
  if (!taskId) {
    throw new McpToolError("task_id is required");
  }

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

  // Load reference signal
  const refSignal = await findSignalById(db, signalId);
  if (!refSignal) throw new McpToolError(`Signal not found: ${signalId}`);

  // Load all catalog signals
  const { signals: allSignals } = await searchSignals(db, { limit: 200, offset: 0 });

  // Generate embeddings
  const engine = createEmbeddingEngine(env as unknown as Record<string, string>);
  const refVec = await engine.generate(refSignal);
  const candidates = allSignals.filter((s) => s.signalId !== signalId);
  const candidateVecs = await engine.batchGenerate(candidates);

  // Score and rank
  const scored = candidates
    .map((s, i) => ({
      signal: s,
      similarity: cosineSimilarity(refVec, candidateVecs[i]),
    }))
    .filter((x) => x.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const result = {
    reference_signal_id: signalId,
    model_id: engine.modelId,
    space_id: "adcp-bridge-space-v1.0",
    results: scored.map((x) => ({
      ...toSignalSummary(x.signal),
      cosine_similarity: Math.round(x.similarity * 1000) / 1000,
    })),
    context_id: requestId(),
    count: scored.length,
  };

  return toolResult(JSON.stringify(result, null, 2));
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