// signal_spec is a string in every released get-signals-request.json. A value
// of another type is refused with a typed error rather than run as a search
// (3.2.9 error_compliance_signals sends signal_spec: 123).
import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-mcp-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("test-req");

type McpBody = {
  error?: { code: number };
  result?: { isError?: boolean; structuredContent?: { adcp_error?: { code?: string; field?: string; recovery?: string } } };
};

async function getSignals(args: Record<string, unknown>): Promise<McpBody> {
  const res = await handleMcpRequest(new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_signals", arguments: args } }),
  }), env, logger);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

describe("get_signals signal_spec type", () => {
  for (const [label, value] of [["a number", 123], ["a boolean", true], ["an array", ["a", "b"]]] as const) {
    it(`refuses ${label} with INVALID_REQUEST on /signal_spec`, async () => {
      const body = await getSignals({ signal_spec: value, context: { correlation_id: "spec-type" } });
      expect(body.error).toBeUndefined();
      expect(body.result?.isError).toBe(true);
      const e = body.result?.structuredContent?.adcp_error;
      expect(e?.code).toBe("INVALID_REQUEST");
      expect(e?.field).toBe("/signal_spec");
      expect(e?.recovery).toBe("correctable");
    });
  }

  it("does not refuse a string or the { brief } object form", async () => {
    for (const value of ["affluent streamers", { brief: "affluent streamers" }]) {
      const body = await getSignals({ signal_spec: value });
      // Past the guard the request reaches the (absent) DB stub and may error,
      // but never with the signal_spec refusal.
      expect(body.result?.structuredContent?.adcp_error?.field).not.toBe("/signal_spec");
    }
  });
});
