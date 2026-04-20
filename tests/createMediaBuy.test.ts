// tests/createMediaBuy.test.ts
// Sec-27a: behavior tests for the create_media_buy stub's error envelope.
// The handler isn't exported directly — exercise it via the MCP JSON-RPC
// boundary so tests mirror what a conformance probe actually sends.

import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-cmb-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("cmb-test");

async function call(args: Record<string, unknown>) {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_media_buy", arguments: args },
    }),
  });
  const res = await handleMcpRequest(req, env, logger);
  const body = await res.json() as {
    result?: { structuredContent?: { errors?: Array<{ code: string; message: string; recovery?: string }>; context?: Record<string, unknown> } };
  };
  return body.result?.structuredContent;
}

describe("create_media_buy stub — error envelope", () => {
  it("Sec-27a: unparseable start_time → INVALID_REQUEST / correctable (not UNSUPPORTED_OPERATION)", async () => {
    // NaN comparisons silently evaluate to false, so without the parse
    // guard `{ start_time: "banana" }` misrouted to the terminal
    // UNSUPPORTED_OPERATION branch. Should now return INVALID_REQUEST /
    // correctable — the caller can fix this by sending a valid ISO-8601
    // string, so "terminal" was the wrong classification.
    const sc = await call({
      start_time: "banana",
      end_time: "2027-12-31T23:59:59Z",
      context: { correlation_id: "banana-start" },
    });
    expect(sc?.errors).toBeDefined();
    expect(sc?.errors?.[0]?.code).toBe("INVALID_REQUEST");
    expect(sc?.errors?.[0]?.recovery).toBe("correctable");
    expect(sc?.errors?.[0]?.message).toMatch(/start_time.*not a valid ISO-8601/i);
    expect(sc?.context?.correlation_id).toBe("banana-start");
  });

  it("Sec-27a: unparseable end_time → INVALID_REQUEST / correctable", async () => {
    const sc = await call({
      start_time: "2027-01-01T00:00:00Z",
      end_time: "not-a-date",
    });
    expect(sc?.errors?.[0]?.code).toBe("INVALID_REQUEST");
    expect(sc?.errors?.[0]?.recovery).toBe("correctable");
    expect(sc?.errors?.[0]?.message).toMatch(/end_time.*not a valid ISO-8601/i);
  });

  it("past start_time → INVALID_REQUEST / correctable (unchanged by Sec-27a)", async () => {
    const sc = await call({
      start_time: "2020-01-01T00:00:00Z",
      end_time: "2026-12-31T23:59:59Z",
    });
    expect(sc?.errors?.[0]?.code).toBe("INVALID_REQUEST");
    expect(sc?.errors?.[0]?.recovery).toBe("correctable");
    expect(sc?.errors?.[0]?.message).toMatch(/start_time.*is in the past/);
  });

  it("reversed dates → INVALID_REQUEST / correctable (unchanged)", async () => {
    const sc = await call({
      start_time: "2027-06-01T00:00:00Z",
      end_time: "2027-01-01T00:00:00Z",
    });
    expect(sc?.errors?.[0]?.code).toBe("INVALID_REQUEST");
    expect(sc?.errors?.[0]?.recovery).toBe("correctable");
    expect(sc?.errors?.[0]?.message).toMatch(/end_time.*must be strictly after start_time/);
  });

  it("valid future request → UNSUPPORTED_OPERATION / terminal (unchanged)", async () => {
    const sc = await call({
      start_time: "2027-01-01T00:00:00Z",
      end_time: "2027-06-01T00:00:00Z",
    });
    expect(sc?.errors?.[0]?.code).toBe("UNSUPPORTED_OPERATION");
    expect(sc?.errors?.[0]?.recovery).toBe("terminal");
  });

  it("no dates supplied at all → UNSUPPORTED_OPERATION / terminal", async () => {
    // Parse guard must only fire when the field was SUPPLIED but unparseable,
    // not when the field is entirely absent. Absent fields fall through to
    // the structural UNSUPPORTED_OPERATION branch — correct, because the
    // request is well-formed, we just don't implement the operation.
    const sc = await call({});
    expect(sc?.errors?.[0]?.code).toBe("UNSUPPORTED_OPERATION");
    expect(sc?.errors?.[0]?.recovery).toBe("terminal");
  });
});
