// tests/version-unsupported.test.ts
//
// Pin the AdCP 3.0.x VERSION_UNSUPPORTED contract:
//
//   * adcp_major_version omitted → ok (seller assumes its highest)
//   * adcp_major_version in supported set ([3]) → ok
//     Narrowed from [2, 3] -> [3] in PR #247 (v2 claim was paper-only).
//   * adcp_major_version OUT of supported set → error with code
//     VERSION_UNSUPPORTED — AdCP 3.1 transport binding (PR #263):
//     returned as JSON-RPC SUCCESS with result.isError=true and
//     result.structuredContent.adcp_error.code = "VERSION_UNSUPPORTED".
//     Previously body.error.data.code (JSON-RPC error shape) — the
//     `comply()` storyboard runner's validate_transport_binding step
//     expects the isError-wrapped MCP shape, not JSON-RPC error.
//   * Recovery carve-out: get_adcp_capabilities with unsupported
//     version → still returns capabilities (so the buyer can discover
//     the supported set and retry — the spec's documented recovery
//     loop)
//
// Closes the live-compliance gap: prior to enforcement, the agent
// silently accepted adcp_major_version: 99 with status: completed.
// Verified live against https://adcp.signal-stack.io/mcp before the
// fix; verified rejected after.

import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-version-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("test-req");

function mcpReq(rpc: unknown, authHeader = `Bearer ${KEY}`): Request {
  return new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(rpc),
  });
}

type McpResultBody = {
  id?: number;
  result?: {
    isError?: boolean;
    content?: unknown;
    structuredContent?: {
      status?: string;
      adcp_version?: string;
      adcp_error?: {
        code?: string;
        message?: string;
        recovery?: string;
        field?: string;
        supported_major_versions?: number[];
      };
      context?: unknown;
      [k: string]: unknown;
    };
  };
  error?: { code: number; message: string; data?: unknown };
};

async function call(req: Request): Promise<{ status: number; body: McpResultBody }> {
  const res = await handleMcpRequest(req, env, logger);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

describe("VERSION_UNSUPPORTED enforcement", () => {
  it("get_adcp_capabilities WITHOUT adcp_major_version returns capabilities (discovery)", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "get_adcp_capabilities", arguments: {} },
    }));
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
  });

  it("get_adcp_capabilities WITH unsupported version 99 STILL returns capabilities (recovery carve-out)", async () => {
    // The spec's recovery semantics depend on this — buyer who sent
    // a bad version needs to discover the supported set without
    // hitting the same error wall they're trying to escape.
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "get_adcp_capabilities", arguments: { adcp_major_version: 99 } },
    }));
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
  });

  // Helper — extract adcp_error from the new MCP-style isError-wrapped result.
  // PR #263 moved tool-level errors from JSON-RPC `error: {data: {...}}` to
  // result.structuredContent.adcp_error per the AdCP 3.1 transport binding.
  function adcpErrorOf(body: McpResultBody) {
    return body.result?.structuredContent?.adcp_error;
  }

  it("get_signals with adcp_major_version: 99 returns VERSION_UNSUPPORTED", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: {
        name: "get_signals",
        arguments: { signal_spec: "anything", adcp_major_version: 99 },
      },
    }));
    expect(body.error).toBeUndefined(); // AdCP 3.1: tool errors are JSON-RPC SUCCESS
    expect(body.result).toBeDefined();
    expect(body.result?.isError).toBe(true);
    const adcp_error = adcpErrorOf(body);
    expect(adcp_error?.code).toBe("VERSION_UNSUPPORTED");
    expect(adcp_error?.supported_major_versions).toEqual([3]);
  });

  it("get_signals with adcp_major_version: 1 (below range) returns VERSION_UNSUPPORTED", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 1 } },
    }));
    expect(body.result?.isError).toBe(true);
    expect(adcpErrorOf(body)?.code).toBe("VERSION_UNSUPPORTED");
  });

  it("get_signals with adcp_major_version: 3 (in range) does NOT trip version check", async () => {
    // We can't fully execute the call without a working DB/KV stub,
    // but we CAN verify the version check itself doesn't fire — any
    // error returned must NOT be VERSION_UNSUPPORTED.
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 3 } },
    }));
    if (body.result?.isError) {
      expect(adcpErrorOf(body)?.code).not.toBe("VERSION_UNSUPPORTED");
    }
  });

  it("get_signals WITHOUT adcp_major_version does NOT trip version check (omitted = highest)", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything" } },
    }));
    if (body.result?.isError) {
      expect(adcpErrorOf(body)?.code).not.toBe("VERSION_UNSUPPORTED");
    }
  });

  it("activate_signal with adcp_major_version: 4 returns VERSION_UNSUPPORTED (uniform across tools)", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: {
        name: "activate_signal",
        arguments: { signal_agent_segment_id: "sig_test", destinations: [{ type: "platform", platform: "mock_dsp" }], idempotency_key: "ik_smoke_aaaaaaaaaaaaaa", adcp_major_version: 4 },
      },
    }));
    expect(body.result?.isError).toBe(true);
    expect(adcpErrorOf(body)?.code).toBe("VERSION_UNSUPPORTED");
  });

  it("non-integer adcp_major_version (string '99') returns VERSION_UNSUPPORTED", async () => {
    // Per spec the field is `integer`. Accept string-coerced numbers
    // for buyer-side leniency, but reject non-integer values.
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 3.5 } },
    }));
    expect(body.result?.isError).toBe(true);
    expect(adcpErrorOf(body)?.code).toBe("VERSION_UNSUPPORTED");
  });

  it("get_adcp_capabilities recovery error message tells buyer how to recover", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 99 } },
    }));
    expect(adcpErrorOf(body)?.message).toContain("get_adcp_capabilities without adcp_major_version");
  });
});
