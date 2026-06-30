// tests/wholesale-unchanged-context.test.ts
//
// Guards the wholesale `unchanged: true` response against drift from the full
// get_signals response path. The unchanged branch returns EARLY (before the
// normal context-echo + payload-shaping code), so anything the storyboard
// checks on the unchanged_probe step has to be replicated inline. Two real
// bugs have already hidden here (both masked until wholesale_feed_versioning
// was advertised and the grader ran the storyboard for real):
//   1. emitting `signals: []` (schema's unchanged arm forbids the key)
//   2. dropping the `context` echo (unchanged_probe asserts correlation_id
//      round-trips) — caught by the AAO grader marking signals `partial`.
//
// getWholesaleFeedVersion is mocked so the unchanged short-circuit fires
// without a seeded D1 (the early return happens before any DB query).

import { describe, it, expect, vi } from "vitest";

vi.mock("../src/domain/signalService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/domain/signalService")>();
  return { ...actual, getWholesaleFeedVersion: async () => "TESTTOK_unchanged" };
});

import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-mcp-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("test-req");

async function callUnchanged(correlationId: string) {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: {
        name: "get_signals",
        arguments: {
          discovery_mode: "wholesale",
          if_wholesale_feed_version: "TESTTOK_unchanged", // matches the mock -> unchanged path
          context: { correlation_id: correlationId },
        },
      },
    }),
  });
  const res = await handleMcpRequest(req, env, logger);
  const body = JSON.parse(await res.text());
  return body.result?.structuredContent ?? {};
}

describe("wholesale unchanged response — parity with the full path", () => {
  it("short-circuits to unchanged: true without a signals key", async () => {
    const sc = await callUnchanged("c-1");
    expect(sc.unchanged).toBe(true);
    expect("signals" in sc).toBe(false);
    expect(sc.cache_scope).toBe("public");
    expect(sc.wholesale_feed_version).toBe("TESTTOK_unchanged");
  });

  it("echoes context.correlation_id back (the storyboard's unchanged_probe check)", async () => {
    const sc = await callUnchanged("wholesale_feed_signals--unchanged");
    expect(sc.context).toEqual({ correlation_id: "wholesale_feed_signals--unchanged" });
  });
});
