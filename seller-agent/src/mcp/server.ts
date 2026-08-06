// MCP Streamable HTTP transport (JSON-RPC 2.0).
// Tools: get_adcp_capabilities, get_products, create_media_buy, list_creative_formats.
//
// Auth model:
//   - tools/call → bearer required, EXCEPT get_adcp_capabilities (public so
//     directory probes / conformance evaluators can discover the agent
//     without prior handshake — same convention as the signals adaptor).
//   - initialize / tools/list / ping / notifications → public.
// On 401 we surface RFC 6750 WWW-Authenticate at the HTTP layer for OAuth/MCP
// clients while keeping the JSON-RPC body well-formed for polyglot callers.

import type { Env } from "../env";
import { isAuthed, type AuthPosture } from "../auth";
import { TOOLS, findToolDef } from "./tools";
import {
    handleCreateMediaBuy,
    handleGetCapabilities,
    handleGetMediaBuyDelivery,
    handleGetProducts,
    handleListCreativeFormats,
    ToolError,
} from "./handlers";

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: unknown;
}
interface JsonRpcSuccess { jsonrpc: "2.0"; id: string | number | null; result: unknown }
interface JsonRpcError {
    jsonrpc: "2.0";
    id: string | number | null;
    error: { code: number; message: string; data?: unknown };
}
type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;
const MCP_TOOL_ERROR = -32000;
const RPC_UNAUTHORIZED = -32001;

const MCP_PROTOCOL_VERSION = "2025-06-18";
const AGENT_NAME = "signal-ledger-media-seller";
const AGENT_VERSION = "0.1.0";
const MAX_BODY_BYTES = 1_000_000;

// Methods that mutate or perform paid work — gated behind the bearer token.
const AUTHENTICATED_METHODS = new Set(["tools/call"]);
// Discovery tool that conformance probes call before the handshake.
const PUBLIC_TOOL_CALL_NAMES = new Set(["get_adcp_capabilities"]);

export async function handleMcp(req: Request, env: Env, posture: AuthPosture): Promise<Response> {
    if (req.method === "OPTIONS") return corsPreflight();
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const lenHeader = req.headers.get("content-length");
    const len = lenHeader ? Number(lenHeader) : 0;
    if (len > MAX_BODY_BYTES) {
        return rpcHttp(rpcErr(null, RPC_INVALID_REQUEST, `Body too large (${len} > ${MAX_BODY_BYTES})`), 413);
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return rpcHttp(rpcErr(null, RPC_PARSE_ERROR, "Parse error: invalid JSON"), 400);
    }

    const authed = isAuthed(req, posture);

    if (Array.isArray(body)) {
        const responses = await Promise.all(body.map((m) => handleSingle(m, env, authed)));
        const filtered = responses.filter((r): r is JsonRpcResponse => r !== null);
        return jsonOk(filtered);
    }

    const single = await handleSingle(body, env, authed);
    if (single === null) return new Response(null, { status: 202, headers: corsHeaders() });
    if (isAuthError(single)) return rpcHttp(single, 401, true);
    return jsonOk(single);
}

async function handleSingle(
    msg: unknown,
    env: Env,
    authed: boolean,
): Promise<JsonRpcResponse | null> {
    if (!isValidRpc(msg)) return rpcErr(null, RPC_INVALID_REQUEST, "Invalid JSON-RPC request");

    const { id = null, method, params } = msg;

    // notifications/* → no response. RFC: id absent ⇒ notification.
    if (method.startsWith("notifications/")) return null;
    if (id === undefined) return null;

    if (AUTHENTICATED_METHODS.has(method) && !authed) {
        // Carve out get_adcp_capabilities — discoverable without auth.
        if (method === "tools/call" && isPublicToolCall(params)) {
            return await dispatch(method, params, env, id);
        }
        return rpcErr(id, RPC_UNAUTHORIZED, "Unauthorized: bearer token required");
    }

    return dispatch(method, params, env, id);
}

function isPublicToolCall(params: unknown): boolean {
    if (!isObject(params)) return false;
    const name = params.name;
    return typeof name === "string" && PUBLIC_TOOL_CALL_NAMES.has(name);
}

async function dispatch(
    method: string,
    params: unknown,
    env: Env,
    id: string | number | null,
): Promise<JsonRpcResponse> {
    try {
        switch (method) {
            case "initialize":
                return rpcOk(id, handleInitialize(params));
            case "ping":
                return rpcOk(id, {});
            case "tools/list":
                return rpcOk(id, { tools: TOOLS });
            case "tools/call":
                return rpcOk(id, await handleToolsCall(params, env));
            default:
                return rpcErr(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
        }
    } catch (e) {
        if (e instanceof ToolError) {
            // MCP convention: tool-level errors come back as a successful
            // tools/call result with isError:true so the SDK extractor
            // (validateErrorCode) can read data.errors[0].code.
            return rpcOk(id, toolErrorResult(e));
        }
        const msg = e instanceof Error ? e.message : String(e);
        return rpcErr(id, RPC_INTERNAL_ERROR, `Internal error: ${msg}`);
    }
}

function handleInitialize(params: unknown): unknown {
    const requested = isObject(params) && typeof params.protocolVersion === "string"
        ? params.protocolVersion
        : MCP_PROTOCOL_VERSION;
    return {
        protocolVersion: requested,
        capabilities: {
            tools: { listChanged: false },
            logging: {},
        },
        serverInfo: {
            name: AGENT_NAME,
            version: AGENT_VERSION,
            metadata: {
                adcp: {
                    role: "seller",
                    major_versions: [3],
                    supported_protocols: ["media_buy", "creative"],
                },
            },
        },
    };
}

async function handleToolsCall(params: unknown, env: Env): Promise<unknown> {
    if (!isObject(params)) {
        throw new ToolError("INVALID_PARAMS", "tools/call params must be an object");
    }
    const name = params.name;
    if (typeof name !== "string") {
        throw new ToolError("INVALID_PARAMS", "tools/call requires `name`");
    }
    const def = findToolDef(name);
    if (!def) {
        throw new ToolError("UNKNOWN_TOOL", `Tool not found: ${name}`);
    }
    const argsRaw = params.arguments;
    const args = isObject(argsRaw) ? argsRaw : {};

    let structured: unknown;
    switch (name) {
        case "get_adcp_capabilities":
            structured = handleGetCapabilities(args, env); break;
        case "get_products":
            structured = handleGetProducts(args); break;
        case "create_media_buy":
            structured = handleCreateMediaBuy(args); break;
        case "get_media_buy_delivery":
            structured = handleGetMediaBuyDelivery(args); break;
        case "list_creative_formats":
            structured = handleListCreativeFormats(args); break;
        default:
            throw new ToolError("UNKNOWN_TOOL", `No handler wired for tool: ${name}`);
    }

    return {
        content: [
            { type: "text", text: JSON.stringify(structured) },
        ],
        structuredContent: structured,
        isError: false,
    };
}

function toolErrorResult(e: ToolError): unknown {
    const structured: Record<string, unknown> = {
        errors: [{ code: e.code, message: e.message }],
    };
    // Echo buyer context on errors per AdCP 3.0.1 convention so the runner
    // (and orchestrators) can correlate failures.
    if (e.context) structured.context = e.context;
    return {
        content: [
            { type: "text", text: `Error ${e.code}: ${e.message}` },
        ],
        structuredContent: structured,
        isError: true,
    };
}

// ── helpers ────────────────────────────────────────────────────────────────

function isValidRpc(v: unknown): v is JsonRpcRequest {
    if (!isObject(v)) return false;
    if (v.jsonrpc !== "2.0") return false;
    if (typeof v.method !== "string") return false;
    return true;
}
function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function rpcOk(id: string | number | null, result: unknown): JsonRpcSuccess {
    return { jsonrpc: "2.0", id, result };
}
function rpcErr(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
): JsonRpcError {
    const err: JsonRpcError = { jsonrpc: "2.0", id, error: { code, message } };
    if (data !== undefined) err.error.data = data;
    return err;
}
function isAuthError(r: JsonRpcResponse): r is JsonRpcError {
    return "error" in r && r.error.code === RPC_UNAUTHORIZED;
}
function jsonOk(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
}
function rpcHttp(body: unknown, status: number, withWwwAuth = false): Response {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...corsHeaders(),
    };
    if (withWwwAuth) {
        headers["WWW-Authenticate"] = `Bearer realm="${AGENT_NAME}", error="invalid_token"`;
    }
    return new Response(JSON.stringify(body), { status, headers });
}
function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
    };
}
function corsPreflight(): Response {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

void RPC_INVALID_PARAMS;
void MCP_TOOL_ERROR;
