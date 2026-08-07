// tests/get-signals-exact-lookup.test.ts
//
// AdCP 3.1 exact lookup on get_signals: `signal_refs` ("Returns exact matches
// for the requested SignalRef values") and deprecated `signal_ids`. Before
// this surface existed, both fields were silently ignored and a by-id lookup
// fell through to the default 5-row catalog page — unrelated rows a buyer
// could mistake for matches (found by the 2026-07 full-compliance audit).
//
// Resolution contract (each clause below traces to an adversarial-review
// finding on the first draft of this change):
//   - per-id via findSignalById (D1) — NOT a catalog page, which
//     searchSignalsService clamps to 100 rows vs the ~512-row catalog
//     (a paged fetch false-empties lookups past the page)
//   - D1 rows only count when status === "available" (search-surface parity)
//   - KV proposal fallback via getProposal so brief-minted proposal ids
//     (which live only in KV until first activation) are confirmable by ref
//   - branch gates on FIELD PRESENCE: present-but-malformed lookup arrays
//     return signals: [], never the browse page
//   - extractor unwraps object-form signal_id ({source, agent_url, id}) so
//     round-tripping our own response rows works
//   - wholesale mode ignores lookup fields entirely (SDK fallback compat)
//
// findSignalById / getProposal / getWholesaleFeedVersion / searchSignalsService
// are mocked so the handler runs without D1/KV; toSignalSummaries runs REAL
// over canonical fixtures, so the response shape is the production shape.

import { describe, it, expect, vi } from "vitest";
import type { CanonicalSignal } from "../src/types/signal";

function fixture(id: string, status: CanonicalSignal["status"] = "available"): CanonicalSignal {
  return {
    signalId: id,
    taxonomySystem: "iab_audience_1_1",
    name: `Fixture ${id}`,
    description: `Fixture signal ${id}`,
    categoryType: "interest",
    sourceSystems: ["nielsen_acr"],
    destinations: ["mock_dsp"],
    activationSupported: true,
    estimatedAudienceSize: 1_000_000,
    accessPolicy: "public_demo",
    generationMode: "seeded",
    status,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const D1: Record<string, CanonicalSignal> = {
  sig_alpha: fixture("sig_alpha"),
  sig_beta: fixture("sig_beta"),
  sig_gamma: fixture("sig_gamma"),
  sig_hidden: fixture("sig_hidden", "inactive"),
};
const KV_PROPOSALS: Record<string, CanonicalSignal> = {
  prop_minted_123: fixture("prop_minted_123"),
};

vi.mock("../src/storage/signalRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/storage/signalRepo")>();
  return {
    ...actual,
    findSignalById: async (_db: unknown, id: string) => D1[id] ?? null,
  };
});
vi.mock("../src/storage/proposalCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/storage/proposalCache")>();
  return {
    ...actual,
    getProposal: async (_kv: unknown, id: string) => KV_PROPOSALS[id] ?? null,
  };
});
vi.mock("../src/domain/signalService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/domain/signalService")>();
  const { toSignalSummaries } = await import("../src/mappers/signalMapper");
  return {
    ...actual,
    getWholesaleFeedVersion: async () => "wf_test_token",
    // Browse-path stand-in: a fixed 3-row page shaped by the REAL mapper.
    searchSignalsService: async () => {
      const page = toSignalSummaries([D1["sig_alpha"]!, D1["sig_beta"]!, D1["sig_gamma"]!]);
      return { signals: page, totalCount: 3, hasMore: false };
    },
  };
});

import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-mcp-test";
const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
const logger = createLogger("test-req");

async function callGetSignals(args: Record<string, unknown>) {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "get_signals", arguments: args },
    }),
  });
  const res = await handleMcpRequest(req, env, logger);
  const body = JSON.parse(await res.text());
  return body.result?.structuredContent ?? {};
}

const idsOf = (sc: Record<string, unknown>) =>
  ((sc.signals as Array<{ signal_agent_segment_id: string }>) ?? []).map(
    (s) => s.signal_agent_segment_id
  );

describe("get_signals exact lookup (signal_refs / signal_ids)", () => {
  it("signal_refs returns only the exact match, not the catalog page", async () => {
    const sc = await callGetSignals({
      signal_refs: [{ scope: "signal_source", signal_id: "sig_beta" }],
      context: { correlation_id: "lookup-1" },
    });
    expect(idsOf(sc)).toEqual(["sig_beta"]);
    expect((sc.pagination as { has_more: boolean }).has_more).toBe(false);
    expect((sc.pagination as { total_count: number }).total_count).toBe(1);
    expect(sc.context).toEqual({ correlation_id: "lookup-1" });
  });

  it("unknown ref returns an empty set, NOT the default catalog page", async () => {
    const sc = await callGetSignals({
      signal_refs: [{ scope: "data_provider", data_provider_domain: "other.example", signal_id: "totally_bogus_xyz" }],
    });
    expect(sc.signals).toEqual([]);
    expect(sc.status).toBe("completed");
    expect((sc.pagination as { total_count: number }).total_count).toBe(0);
  });

  it("object-form signal_id (round-tripping our own response row) is unwrapped and matches", async () => {
    const sc = await callGetSignals({
      signal_refs: [{ signal_id: { source: "agent", agent_url: "https://adcp.signal-stack.io/mcp", id: "sig_gamma" } }],
    });
    expect(idsOf(sc)).toEqual(["sig_gamma"]);
  });

  it("present-but-all-malformed lookup arrays return signals: [], never the browse page", async () => {
    const sc = await callGetSignals({
      signal_refs: [{ scope: "product" }],
      signal_ids: [42, { nope: true }],
    });
    expect(sc.signals).toEqual([]);
    expect(sc.status).toBe("completed");
  });

  it("empty signal_refs array gets lookup semantics (empty set), not browse", async () => {
    const sc = await callGetSignals({ signal_refs: [] });
    expect(sc.signals).toEqual([]);
  });

  it("deprecated signal_ids object + legacy string forms both match", async () => {
    const obj = await callGetSignals({ signal_ids: [{ id: "sig_gamma" }] });
    expect(idsOf(obj)).toEqual(["sig_gamma"]);
    const str = await callGetSignals({ signal_ids: ["sig_alpha"] });
    expect(idsOf(str)).toEqual(["sig_alpha"]);
  });

  it("multiple refs return matches in requested order, skipping unknowns and dupes", async () => {
    const sc = await callGetSignals({
      signal_refs: [
        { scope: "signal_source", signal_id: "sig_gamma" },
        { scope: "signal_source", signal_id: "nope_missing" },
        { scope: "signal_source", signal_id: "sig_alpha" },
        { scope: "signal_source", signal_id: "sig_gamma" },
      ],
    });
    expect(idsOf(sc)).toEqual(["sig_gamma", "sig_alpha"]);
  });

  it("non-available D1 rows are excluded (search-surface visibility parity)", async () => {
    const sc = await callGetSignals({ signal_refs: [{ signal_id: "sig_hidden" }] });
    expect(sc.signals).toEqual([]);
  });

  it("brief-minted KV proposal ids resolve via the getProposal fallback", async () => {
    const sc = await callGetSignals({ signal_refs: [{ signal_id: "prop_minted_123" }] });
    expect(idsOf(sc)).toEqual(["prop_minted_123"]);
  });

  it("refs combined with signal_spec return the anchored ref matches", async () => {
    const sc = await callGetSignals({
      signal_spec: "luxury auto intenders",
      signal_refs: [{ scope: "signal_source", signal_id: "sig_beta" }],
    });
    expect(idsOf(sc)).toEqual(["sig_beta"]);
  });

  it("wholesale mode ignores lookup fields (behavior unchanged: full feed page)", async () => {
    const sc = await callGetSignals({
      discovery_mode: "wholesale",
      signal_refs: [{ scope: "signal_source", signal_id: "sig_beta" }],
    });
    expect((sc.signals as unknown[]).length).toBe(3);
  });

  it("no lookup fields → normal search path unchanged (default page)", async () => {
    const sc = await callGetSignals({ signal_spec: "anything" });
    expect((sc.signals as unknown[]).length).toBe(3);
  });
});
