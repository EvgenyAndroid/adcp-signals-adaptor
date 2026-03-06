// src/mcp/server.ts
// MCP server implementing the Streamable HTTP transport (JSON-RPC 2.0).
// Exposes AdCP Signals tools to any MCP-compatible AI agent (Claude, etc.).
// All tool handlers delegate to the same domain services used by the HTTP routes.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { ADCP_TOOLS, getToolByName } from "./tools";
import { getCapabilities } from "../domain/capabilityService";
import { searchSignalsService, generateSignalService } from "../domain/signalService";
import { activateSignalService, getOperationService, NotFoundError, ValidationError } from "../domain/activationService";
import { getDb } from "../storage/db";
import {
  validateSearchRequest,
  validateActivateRequest,
  validateGenerateRequest,
} from "../utils/validation";

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
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// JSON-RPC error codes
const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;

// MCP-specific error codes
const MCP_TOOL_ERROR = -32000;

// ── MCP message types ─────────────────────────────────────────────────────────

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
  // MCP Streamable HTTP: POST only for JSON-RPC messages
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcErrorResponse(null, RPC_PARSE_ERROR, "Parse error: invalid JSON");
  }

  // Support both single requests and batches
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((msg) => handleSingleMessage(msg, env, logger))
    );
    // Filter out notifications (null responses)
    const filtered = responses.filter(Boolean);
    return jsonResponse(filtered);
  }

  const response = await handleSingleMessage(body, env, logger);
  if (response === null) {
    // Notification - no response body
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

  // Notifications (no id) - process but don't respond
  const isNotification = id === undefined || id === null;

  logger.info("mcp_request", { method, id });

  try {
    switch (method) {
      case "initialize":
        return rpcSuccess(id, await handleInitialize(params as McpInitializeParams, env));

      case "notifications/initialized":
        // Client signals ready - no response needed
        return null;

      case "ping":
        return rpcSuccess(id, {});

      case "tools/list":
        return rpcSuccess(id, { tools: ADCP_TOOLS });

      case "tools/call":
        return rpcSuccess(id, await handleToolCall(params as McpCallToolParams, env, logger));

      default:
        if (isNotification) return null;
        return rpcError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (err) {
    if (isNotification) return null;

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
  const clientVersion = params?.protocolVersion ?? "unknown";
  const clientName = params?.clientInfo?.name ?? "unknown";

  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    serverInfo: {
      name: "adcp-signals-adaptor",
      version: env.API_VERSION ?? "3.0-rc",
      description:
        "AdCP Signals Provider — IAB Audience Taxonomy 1.1 aligned signal discovery, " +
        "dynamic segment generation, and mock activation for agentic advertising workflows.",
    },
  };
}

async function handleToolCall(
  params: McpCallToolParams,
  env: Env,
  logger: Logger
): Promise<unknown> {
  const { name, arguments: args = {} } = params;

  const toolDef = getToolByName(name);
  if (!toolDef) {
    throw new McpToolError(`Unknown tool: ${name}`);
  }

  logger.info("mcp_tool_call", { tool: name, args });

  switch (name) {
    case "get_adcp_capabilities":
      return callGetCapabilities(env);

    case "get_signals":
      return callGetSignals(args, env);

    case "activate_signal":
      return callActivateSignal(args, env, logger);

    case "generate_custom_signal":
      return callGenerateSignal(args, env);

    case "get_operation_status":
      return callGetOperation(args, env);

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
  const req = {
    query: args["query"] as string | undefined,
    categoryType: args["categoryType"] as string | undefined,
    generationMode: args["generationMode"] as string | undefined,
    destination: args["destination"] as string | undefined,
    taxonomyId: args["taxonomyId"] as string | undefined,
    limit: args["limit"] ? Number(args["limit"]) : 20,
    offset: args["offset"] ? Number(args["offset"]) : 0,
    destinations: args["destinations"] as Array<{type: string; platform?: string; agent_url?: string}> | undefined,
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
  // Normalize all destination variants the spec or test runners may send:
  //   destinations: [{ type, platform, account_id }]  — spec array (plural)
  //   deployments:  [{ type, platform }]               — our MCP schema
  //   destination:  { platform, account_id }           — singular object (test runner)
  //   destination:  "mock_dsp"                         — legacy string
  let destination: string | undefined;
  let accountId: string | undefined;

  const raw = args["destinations"] ?? args["deployments"] ?? args["destination"];

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

  // Map any external platform names to our internal destination IDs
  const PLATFORM_MAP: Record<string, string> = {
    "mock_dsp": "mock_dsp", "mock_cleanroom": "mock_cleanroom",
    "mock_cdp": "mock_cdp", "mock_measurement": "mock_measurement",
    "trade-desk": "mock_dsp", "the-trade-desk": "mock_dsp", "ttd": "mock_dsp",
    "dv360": "mock_dsp", "xandr": "mock_dsp", "pubmatic": "mock_dsp",
    "index-exchange": "mock_dsp", "liveramp": "mock_cleanroom",
  };
  const resolvedDestination = PLATFORM_MAP[destination.toLowerCase()] ?? "mock_dsp";

  const signalId = (args["signal_agent_segment_id"] ?? args["signalId"]) as string;
  const pricingOptionId = args["pricing_option_id"] as string | undefined;

  const req = {
    signalId,
    destination: resolvedDestination,
    accountId: (args["accountId"] ?? accountId) as string | undefined,
    campaignId: args["campaignId"] as string | undefined,
    notes: args["notes"] as string | undefined,
  };

  const validation = validateActivateRequest(req);
  if (!validation.ok) {
    throw new McpToolError(validation.error!.message, { code: validation.error!.code });
  }

  try {
    const db = getDb(env);
    const result = await activateSignalService(db, req, logger);
    // Build response deployments preserving type: "agent" vs "platform"
    const inputDeployments = Array.isArray(args["destinations"] ?? args["deployments"])
      ? (args["destinations"] ?? args["deployments"]) as Array<Record<string, unknown>>
      : [{ type: "platform", platform: destination }];

    const responseDeployments = inputDeployments.map((dep) => {
      const depType = dep["type"] as string;
      if (depType === "agent") {
        const agentUrl = dep["agent_url"] as string;
        return {
          type: "agent",
          agent_url: agentUrl,
          is_live: true,
          activation_key: {
            type: "segment_id",
            segment_id: `adcp_${signalId}`,
          },
          estimated_activation_duration_minutes: 0,
          deployment_status: "active",
        };
      } else {
        const platform = (dep["platform"] as string) ?? resolvedDestination;
        const platformSegmentId = `mock_${platform}_${signalId}`;
        return {
          type: "platform",
          platform,
          is_live: true,
          ...(req.accountId ? { account: req.accountId } : {}),
          activation_key: {
            type: "segment_id",
            segment_id: platformSegmentId,
          },
          estimated_activation_duration_minutes: 0,
          deployment_status: "active",
          decisioning_platform_segment_id: platformSegmentId,
        };
      }
    });

    const specResponse = {
      signal_agent_segment_id: signalId,
      status: result.status,
      deployments: responseDeployments,
      operationId: result.operationId,
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

async function callGenerateSignal(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  const req = {
    name: args["name"] as string | undefined,
    description: args["description"] as string | undefined,
    rules: args["rules"] as Array<{ dimension: string; operator: string; value: unknown }>,
  };

  const validation = validateGenerateRequest(req);
  if (!validation.ok) {
    throw new McpToolError(validation.error!.message, { code: validation.error!.code });
  }

  const db = getDb(env);
  const result = await generateSignalService(db, req as Parameters<typeof generateSignalService>[1]);
  return toolResult(JSON.stringify(result, null, 2));
}

async function callGetOperation(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  const operationId = args["operationId"] as string;
  if (!operationId) {
    throw new McpToolError("operationId is required");
  }

  try {
    const db = getDb(env);
    const result = await getOperationService(db, operationId);
    return toolResult(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new McpToolError(err.message);
    }
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a string result in the MCP tool result envelope.
 * Using text/plain content type - most compatible with all MCP clients.
 */
function toolResult(text: string): unknown {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    isError: false,
  };
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

function rpcErrorResponse(
  id: string | number | null,
  code: number,
  message: string
): Response {
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
