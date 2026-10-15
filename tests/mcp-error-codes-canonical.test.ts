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
import { expectMatchesOutputSchema } from "./outputSchemaConformance";
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
  if (body.result?.structuredContent) expectMatchesOutputSchema(name, body.result.structuredContent);
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
    // A misspelled tool name is fixed by spelling it right, so this is
    // correctable. "Tool not implemented" (the dispatch default) stays
    // terminal -- no request edit makes us grow the handler.
    expect(adcp_error?.recovery).toBe("correctable");
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

// ── AdCP 3.2: every error carries recovery (SERVE_ADCP_3_2) ─────────────────
//
// 3.2 makes error.recovery a MUST on every error (error-handling.mdx; the
// 3-1-to-3-2 migration's "Emit error.recovery on every 3.2 error"). One MCP
// path built an adcp_error without it: the validateActivateRequest codes
// (MISSING_DESTINATION and friends, reached by activate_signal with an empty
// destination). With the flag ON a missing recovery is filled where the
// adcp_error is assembled — transient for SERVICE_UNAVAILABLE, correctable
// for everything else that reaches there (request-validation codes). With the
// flag OFF the bytes are unchanged (also pinned by tests/flag-off-golden.test.ts).

describe("AdCP 3.2: recovery on every error", () => {
  const envOn = { ...env, SERVE_ADCP_3_2: "true" } as import("../src/types/env").Env;

  async function callToolIn(e: import("../src/types/env").Env, name: string, args: Record<string, unknown>) {
    const res = await handleMcpRequest(
      mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      e,
      logger,
    );
    const body: McpResultBody = JSON.parse(await res.text());
    if (body.result?.structuredContent) expectMatchesOutputSchema(name, body.result.structuredContent);
    return body.result?.structuredContent?.adcp_error;
  }

  const EMPTY_DESTINATION = { signal_agent_segment_id: "sig_x", destinations: [{ type: "platform", platform: "" }] };

  it("flag ON: activate_signal with an empty destination carries recovery: correctable", async () => {
    const adcp_error = await callToolIn(envOn, "activate_signal", EMPTY_DESTINATION);
    expect(adcp_error?.code).toBe("MISSING_DESTINATION");
    expect(adcp_error?.recovery).toBe("correctable");
  });

  it("flag OFF: the same error is unchanged (no recovery)", async () => {
    const adcp_error = await callToolIn(env, "activate_signal", EMPTY_DESTINATION);
    expect(adcp_error?.code).toBe("MISSING_DESTINATION");
    expect(adcp_error).not.toHaveProperty("recovery");
  });

  it("flag ON: every error this file provokes carries a recovery class", async () => {
    const probes: Array<[string, Record<string, unknown>]> = [
      ["activate_signal", {}],
      ["activate_signal", { destination: "the-trade-desk" }],
      ["activate_signal", EMPTY_DESTINATION],
      ["get_task_status", {}],
      ["get_operation_status", {}],
      ["query_signals_nl", {}],
      ["no_such_tool_exists", {}],
      ["get_signals", { signal_spec: "x", adcp_version: "4.0" }],
    ];
    for (const [name, args] of probes) {
      const adcp_error = await callToolIn(envOn, name, args);
      expect(adcp_error, `${name} should surface an adcp_error`).toBeDefined();
      expect(["transient", "correctable", "terminal"], `${name} ${JSON.stringify(args)}`).toContain(adcp_error?.recovery);
    }
  });
});
