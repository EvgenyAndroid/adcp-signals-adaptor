// tests/wholesale-conditional-fetch.test.ts
//
// AdCP 3.1 wholesale-feed conditional-fetch capability surface.
//
// Two things this pins:
//   1. We advertise `wholesale_feed_versioning: { supported: true }` so the
//      upstream wholesale-feed-signals conformance storyboard is APPLICABLE
//      (gated on that flag) — and the flag survives a protocols-filtered probe.
//   2. The get_signals handler rejects a standalone `if_pricing_version` (no
//      `if_wholesale_feed_version`) with INVALID_REQUEST — the storyboard's
//      `standalone_pricing_token_rejected` step. We don't separate a pricing
//      layer (the wholesale_feed_version token covers both), so a lone pricing
//      probe is malformed.

import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "../src/mcp/server";
import { getCapabilities } from "../src/domain/capabilityService";
import { createLogger } from "../src/utils/logger";
import { Validator } from "@cfworker/json-schema";
import { signals_GetSignalsResponse, loadAdcpCorpus } from "../src/schemas/adcp";

const KEY = "demo-key-mcp-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("test-req");

function mcpReq(rpc: unknown, authHeader = `Bearer ${KEY}`): Request {
  return new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(rpc),
  });
}

type McpBody = {
  error?: { code: number };
  result?: {
    isError?: boolean;
    structuredContent?: { adcp_error?: { code?: string; field?: string } };
  };
};

async function call(req: Request): Promise<McpBody> {
  const res = await handleMcpRequest(req, env, logger);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function adcpErrorOf(body: McpBody) {
  return body.result?.structuredContent?.adcp_error;
}

// Stub KV: cache always misses → getCapabilities builds the static set fresh.
const stubKv = {
  get: async () => null,
  put: async () => undefined,
} as unknown as Parameters<typeof getCapabilities>[0];

describe("wholesale_feed_versioning capability advertisement", () => {
  it("advertises supported:true in the full capability set", async () => {
    const caps = (await getCapabilities(stubKv)) as Record<string, unknown>;
    const wfv = caps["wholesale_feed_versioning"] as { supported?: boolean } | undefined;
    expect(wfv?.supported).toBe(true);
  });

  it("does NOT claim cache_scope_account (we serve a single public layer)", async () => {
    const caps = (await getCapabilities(stubKv)) as Record<string, unknown>;
    const wfv = caps["wholesale_feed_versioning"] as Record<string, unknown> | undefined;
    expect(wfv?.["cache_scope_account"]).toBeUndefined();
  });

  it("survives a protocols:['signals'] filter (top-level, cross-cutting)", async () => {
    const caps = (await getCapabilities(stubKv, ["signals"])) as Record<string, unknown>;
    const wfv = caps["wholesale_feed_versioning"] as { supported?: boolean } | undefined;
    expect(wfv?.supported).toBe(true);
  });
});

describe("get_signals standalone if_pricing_version rejection", () => {
  it("rejects a standalone if_pricing_version with INVALID_REQUEST", async () => {
    const body = await call(mcpReq({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: {
        name: "get_signals",
        arguments: {
          discovery_mode: "wholesale",
          if_pricing_version: "stale-pricing-token",
          signal_spec: "anything",
        },
      },
    }));
    expect(body.error).toBeUndefined(); // AdCP 3.1: tool errors are JSON-RPC SUCCESS
    expect(body.result?.isError).toBe(true);
    const e = adcpErrorOf(body);
    expect(e?.code).toBe("INVALID_REQUEST");
    expect(e?.field).toBe("/if_pricing_version");
  });

  it("does NOT reject if_pricing_version when if_wholesale_feed_version is also present", async () => {
    // Both tokens present → the guard does not fire; the request proceeds past
    // the guard (and may error later on the absent DB stub, but never with the
    // standalone-pricing rejection).
    const body = await call(mcpReq({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: {
        name: "get_signals",
        arguments: {
          discovery_mode: "wholesale",
          if_wholesale_feed_version: "some-feed-token",
          if_pricing_version: "some-pricing-token",
          signal_spec: "anything",
        },
      },
    }));
    if (body.result?.isError) {
      expect(adcpErrorOf(body)?.field).not.toBe("/if_pricing_version");
    }
  });
});

// Regression guard for the bug the adversarial review caught: the get-signals-
// response schema's `unchanged: true` arm carries `not: { required: [signals] }`,
// which fails on KEY PRESENCE — so emitting `signals: []` (not just non-empty
// signals) violates it. The handler's unchanged branch MUST omit the key.
// Activating wholesale_feed_versioning.supported makes the wholesale-feed-signals
// `unchanged_probe` step run this response_schema check for real.
describe("unchanged-response schema contract", () => {
  function makeValidator(rootSchema: { $id?: string; [k: string]: unknown }) {
    const v = new Validator(rootSchema as { $id: string; [k: string]: unknown }, "7", false);
    for (const s of loadAdcpCorpus()) {
      if (s.$id && s.$id !== rootSchema.$id) {
        try { v.addSchema(s as { $id: string; [k: string]: unknown }); } catch { /* dup ok */ }
      }
    }
    return v;
  }
  const resValidator = makeValidator(signals_GetSignalsResponse);

  // Mirrors the exact shape the get_signals handler emits via withMcpEnvelope on
  // the unchanged path (status + adcp_version + payload, signals key omitted).
  const unchangedResponse = {
    status: "completed",
    adcp_version: "3.1",
    pagination: { has_more: false },
    cache_scope: "public",
    wholesale_feed_version: "wf_123_deadbeef",
    unchanged: true,
  };

  it("omitting the signals key is schema-valid (unchanged arm)", () => {
    const r = resValidator.validate(unchangedResponse);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("emitting signals: [] FAILS the unchanged arm (the regression)", () => {
    const r = resValidator.validate({ ...unchangedResponse, signals: [] });
    expect(r.valid).toBe(false);
  });
});
