// tests/mcp-error-codes-canonical.test.ts
//
// Every tool-level error must carry a code from the AdCP error-code enum
// (schemas/3.1.20/enums/error-code.json — 92 values). "INTERNAL_ERROR" is
// NOT one of them.
//
// Before this was fixed, twelve `throw new McpToolError(msg)` call sites in
// src/mcp/server.ts passed no `details`, so the tools/call catch fell through
// to a hardcoded "INTERNAL_ERROR" — a code no conformant consumer can parse.
//
// The hosted grader caught exactly one of them: error_compliance_signals step
// `reject_activation_missing_signal_agent_segment_id` on the 2026-09-13 card —
//   "Error code is INVALID_REQUEST or VALIDATION_ERROR:
//    Expected one of [INVALID_REQUEST, VALIDATION_ERROR], got INTERNAL_ERROR"
// — which kept that storyboard at 6/7. The other eleven sat on paths no
// storyboard happens to exercise, so they were invisible but equally wrong.
//
// These tests pin the contract for the argument-validation guards, which are
// the ones a buyer hits first and the ones the suite grades.

import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-error-code-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("test-req");

// The subset of enums/error-code.json this file asserts against. Kept as a
// literal rather than fetched so the suite stays offline and deterministic.
const CANONICAL = new Set([
  "INVALID_REQUEST",
  "VALIDATION_ERROR",
  "REFERENCE_NOT_FOUND",
  "AUTH_REQUIRED",
  "AUTHORIZATION_REQUIRED",
  "UNSUPPORTED_FEATURE",
  "SERVICE_UNAVAILABLE",
  "VERSION_UNSUPPORTED",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
]);

type McpResultBody = {
  result?: {
    isError?: boolean;
    structuredContent?: {
      adcp_error?: { code?: string; message?: string; recovery?: string; field?: string };
      [k: string]: unknown;
    };
  };
  error?: { code: number; message: string; data?: unknown };
};

function mcpReq(rpc: unknown, authHeader = `Bearer ${KEY}`): Request {
  return new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(rpc),
  });
}

async function callTool(name: string, args: Record<string, unknown>, id = 1) {
  const res = await handleMcpRequest(
    mcpReq({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    env,
    logger,
  );
  const text = await res.text();
  const body: McpResultBody = text ? JSON.parse(text) : {};
  return { body, adcp_error: body.result?.structuredContent?.adcp_error };
}

describe("tool-level errors carry canonical AdCP codes", () => {
  it("activate_signal without signal_agent_segment_id returns INVALID_REQUEST, not INTERNAL_ERROR", async () => {
    // This is the exact assertion the hosted runner makes in
    // error_compliance_signals. Do not relax it to a substring match.
    const { body, adcp_error } = await callTool("activate_signal", { destination: "the-trade-desk" });

    expect(body.error).toBeUndefined(); // AdCP 3.1: tool errors are JSON-RPC SUCCESS
    expect(body.result?.isError).toBe(true);
    expect(adcp_error?.code).not.toBe("INTERNAL_ERROR");
    expect(["INVALID_REQUEST", "VALIDATION_ERROR"]).toContain(adcp_error?.code);
    expect(adcp_error?.recovery).toBe("correctable");
    expect(adcp_error?.field).toBe("/signal_agent_segment_id");
  });

  it("get_task_status without task_id returns INVALID_REQUEST with a field pointer", async () => {
    const { adcp_error } = await callTool("get_task_status", {}, 2);
    expect(adcp_error?.code).toBe("INVALID_REQUEST");
    expect(adcp_error?.field).toBe("/task_id");
  });

  it("an unknown tool name returns UNSUPPORTED_FEATURE, not INTERNAL_ERROR", async () => {
    const { adcp_error } = await callTool("no_such_tool_exists", {}, 3);
    expect(adcp_error?.code).toBe("UNSUPPORTED_FEATURE");
    expect(adcp_error?.recovery).toBe("terminal");
  });

  it("no argument-guard path emits a code outside the canonical enum", async () => {
    // Sweep the guards that take no valid arguments at all. Each must fail
    // with a parseable code; none may fall through to the old default.
    const probes: Array<[string, Record<string, unknown>]> = [
      ["activate_signal", {}],
      ["get_task_status", {}],
      ["get_operation_status", {}],
      ["query_signals_nl", {}],
      ["no_such_tool_exists", {}],
    ];

    for (const [name, args] of probes) {
      const { adcp_error } = await callTool(name, args, 10);
      expect(adcp_error, `${name} should surface an adcp_error`).toBeDefined();
      expect(adcp_error?.code, `${name} emitted a non-canonical code`).toBeDefined();
      expect(
        CANONICAL.has(adcp_error!.code!),
        `${name} emitted "${adcp_error?.code}", which is not in the AdCP error-code enum`,
      ).toBe(true);
    }
  });
});
