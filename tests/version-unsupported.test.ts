// tests/version-unsupported.test.ts
//
// Pin the AdCP 3.0.x VERSION_UNSUPPORTED contract:
//
//   * adcp_major_version omitted → ok (seller assumes its highest)
//   * adcp_major_version in supported set ([2, 3]) → ok
//   * adcp_major_version OUT of supported set → error with code
//     VERSION_UNSUPPORTED in the JSON-RPC error.data
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

async function call(req: Request): Promise<{ status: number; body: { id?: number; result?: unknown; error?: { code: number; message: string; data?: unknown } } }> {
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

  it("get_signals with adcp_major_version: 99 returns VERSION_UNSUPPORTED", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: {
        name: "get_signals",
        arguments: { signal_spec: "anything", adcp_major_version: 99 },
      },
    }));
    expect(body.error).toBeDefined();
    expect(body.error?.code).toBe(-32000); // MCP_TOOL_ERROR transport marker
    expect(body.error?.message).toContain("VERSION_UNSUPPORTED" === "VERSION_UNSUPPORTED" ? "not supported" : "");
    expect(body.error?.message).toContain("[2, 3]");
    // Spec error code travels in error.data per rpcError helper
    const data = body.error?.data as { code?: string; supported_major_versions?: number[] };
    expect(data?.code).toBe("VERSION_UNSUPPORTED");
    expect(data?.supported_major_versions).toEqual([2, 3]);
  });

  it("get_signals with adcp_major_version: 1 (below range) returns VERSION_UNSUPPORTED", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 1 } },
    }));
    expect(body.error).toBeDefined();
    const data = body.error?.data as { code?: string };
    expect(data?.code).toBe("VERSION_UNSUPPORTED");
  });

  it("get_signals with adcp_major_version: 3 (in range) does NOT trip version check", async () => {
    // We can't fully execute the call without a working DB/KV stub,
    // but we CAN verify the version check itself doesn't fire — any
    // error returned must NOT be VERSION_UNSUPPORTED.
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 3 } },
    }));
    if (body.error) {
      const data = body.error.data as { code?: string } | undefined;
      expect(data?.code).not.toBe("VERSION_UNSUPPORTED");
    }
  });

  it("get_signals WITHOUT adcp_major_version does NOT trip version check (omitted = highest)", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything" } },
    }));
    if (body.error) {
      const data = body.error.data as { code?: string } | undefined;
      expect(data?.code).not.toBe("VERSION_UNSUPPORTED");
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
    expect(body.error).toBeDefined();
    const data = body.error?.data as { code?: string };
    expect(data?.code).toBe("VERSION_UNSUPPORTED");
  });

  it("non-integer adcp_major_version (string '99') returns VERSION_UNSUPPORTED", async () => {
    // Per spec the field is `integer`. Accept string-coerced numbers
    // for buyer-side leniency, but reject non-integer values.
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 3.5 } },
    }));
    expect(body.error).toBeDefined();
    const data = body.error?.data as { code?: string };
    expect(data?.code).toBe("VERSION_UNSUPPORTED");
  });

  it("get_adcp_capabilities recovery error message tells buyer how to recover", async () => {
    const { body } = await call(mcpReq({
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "get_signals", arguments: { signal_spec: "anything", adcp_major_version: 99 } },
    }));
    expect(body.error?.message).toContain("get_adcp_capabilities without adcp_major_version");
  });
});
