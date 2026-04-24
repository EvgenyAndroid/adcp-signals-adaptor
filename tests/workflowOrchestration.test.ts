// tests/workflowOrchestration.test.ts
// Unit coverage for Sec-48f workflow helpers. These are pure functions
// (no network, no Env binding) so the tests are deterministic.

import { describe, it, expect } from "vitest";
import {
  signalId,
  productId,
  pickTopSignals,
  pickProductPerAgent,
  buildCreateMediaBuyPayload,
  extractCategories,
  extractArrayPayload,
  extractMcpToolArray,
  newWorkflowId,
} from "../src/domain/workflowOrchestration";

describe("signalId / productId", () => {
  it("signalId prefers signal_agent_segment_id, falls back to id", () => {
    expect(signalId({ signal_agent_segment_id: "seg_1" })).toBe("seg_1");
    expect(signalId({ id: "abc" })).toBe("abc");
    expect(signalId({ name: "no id" })).toBeNull();
  });

  it("productId prefers product_id over id", () => {
    expect(productId({ product_id: "p1" })).toBe("p1");
    expect(productId({ id: "alt" })).toBe("alt");
    expect(productId({ name: "no id" })).toBeNull();
  });
});

describe("pickTopSignals", () => {
  it("ranks by coverage_percentage desc, ties broken by input order", () => {
    const merged = [
      { signal_agent_segment_id: "low",   coverage_percentage: 0.2 },
      { signal_agent_segment_id: "high",  coverage_percentage: 0.9 },
      { signal_agent_segment_id: "mid_a", coverage_percentage: 0.5 },
      { signal_agent_segment_id: "mid_b", coverage_percentage: 0.5 },
    ];
    expect(pickTopSignals(merged, 3)).toEqual(["high", "mid_a", "mid_b"]);
  });

  it("deduplicates by id across source agents", () => {
    const merged = [
      { signal_agent_segment_id: "seg1", coverage_percentage: 0.7, source_agent: "a" },
      { signal_agent_segment_id: "seg1", coverage_percentage: 0.7, source_agent: "b" },
      { signal_agent_segment_id: "seg2", coverage_percentage: 0.5 },
    ];
    expect(pickTopSignals(merged, 5)).toEqual(["seg1", "seg2"]);
  });

  it("skips signals without any id", () => {
    const merged = [
      { name: "no id",  coverage_percentage: 0.9 },
      { id: "seg_alt", coverage_percentage: 0.3 },
    ];
    expect(pickTopSignals(merged, 2)).toEqual(["seg_alt"]);
  });

  it("returns empty array when no signals", () => {
    expect(pickTopSignals([], 5)).toEqual([]);
  });
});

describe("pickProductPerAgent", () => {
  it("picks the first product with an id per agent", () => {
    const out = pickProductPerAgent([
      { id: "agent_a", products: [{ product_id: "p_a1" }, { product_id: "p_a2" }] },
      { id: "agent_b", products: [{ id: "p_b1" }] },
    ]);
    expect(out).toEqual({ agent_a: "p_a1", agent_b: "p_b1" });
  });

  it("returns null for agents with no products or no ids", () => {
    const out = pickProductPerAgent([
      { id: "empty",  products: [] },
      { id: "no_ids", products: [{ name: "untagged" }] },
    ]);
    expect(out).toEqual({ empty: null, no_ids: null });
  });
});

describe("buildCreateMediaBuyPayload", () => {
  const NOW = Date.UTC(2026, 3, 24, 12, 0, 0); // 2026-04-24T12:00:00Z

  it("emits buyer_ref + all union-required fields", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "wf_abc",
      agentId: "claire_pub",
      brief: "luxury travelers APAC",
      chosenProductId: "prod_123",
      chosenSignalIds: ["sig_1", "sig_2"],
      nowMs: NOW,
    });
    expect(p.buyer_ref).toBe("wf_wf_abc_claire_pub");
    expect(p.brand_manifest.categories).toContain("luxury");
    expect(p.packages).toHaveLength(1);
    expect(p.packages[0]!.product_id).toBe("prod_123");
    expect(p.packages[0]!.budget.currency).toBe("USD");
    expect(p.start_time).toBe("2026-04-25T12:00:00.000Z");
    expect(p.end_time).toBe("2026-05-02T12:00:00.000Z");
    expect(p.total_budget.amount).toBe(1000);
    expect(p.po_number).toBe("demo_wf_abc");
    expect(p.targeting_overlay?.required_axe_signals).toEqual(["sig_1", "sig_2"]);
  });

  it("omits targeting_overlay when no signals chosen", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "w", agentId: "a", brief: "t",
      chosenProductId: "p", chosenSignalIds: [], nowMs: NOW,
    });
    expect(p.targeting_overlay).toBeUndefined();
  });

  it("honors custom budget + duration overrides", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "w", agentId: "a", brief: "t",
      chosenProductId: "p", chosenSignalIds: [],
      totalBudgetUsd: 5000, startDelayHours: 48, durationDays: 14, nowMs: NOW,
    });
    expect(p.total_budget.amount).toBe(5000);
    expect(p.packages[0]!.budget.amount).toBe(5000);
    expect(p.start_time).toBe("2026-04-26T12:00:00.000Z");
    expect(p.end_time).toBe("2026-05-10T12:00:00.000Z");
  });

  it("handles null product id (agent returned no products)", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "w", agentId: "a", brief: "t",
      chosenProductId: null, chosenSignalIds: [], nowMs: NOW,
    });
    expect(p.packages[0]!.product_id).toBeNull();
  });
});

describe("extractCategories", () => {
  it("keeps the first 3 unique alpha tokens length >= 4", () => {
    expect(extractCategories("luxury travelers planning APAC trips")).toEqual(["luxury", "travelers", "planning"]);
  });

  it("deduplicates repeated tokens", () => {
    expect(extractCategories("travel travel travel luxury")).toEqual(["travel", "luxury"]);
  });

  it("falls back to ['general'] when no tokens match", () => {
    expect(extractCategories("a b c")).toEqual(["general"]);
    expect(extractCategories("")).toEqual(["general"]);
  });

  it("lowercases and strips punctuation", () => {
    expect(extractCategories("LUXURY! travel_segments (APAC)")).toEqual(["luxury", "travel", "segments"]);
  });
});

describe("extractArrayPayload", () => {
  it("returns the array under the first preferred key that matches", () => {
    const out = extractArrayPayload({ creative_formats: [1, 2], formats: [9] }, ["formats", "creative_formats"]);
    expect(out).toEqual([9]);
  });

  it("checks all preferred keys in order before the fallback", () => {
    const out = extractArrayPayload({ creative_formats: [1, 2] }, ["formats", "creative_formats"]);
    expect(out).toEqual([1, 2]);
  });

  it("falls back to the first array-valued key when no preferred key matches", () => {
    const out = extractArrayPayload({ items: [{ x: 1 }], meta: {} }, ["products"]);
    expect(out).toEqual([{ x: 1 }]);
  });

  it("returns [] when no arrays are present", () => {
    expect(extractArrayPayload({ a: 1, b: "x" }, ["anything"])).toEqual([]);
  });

  it("returns [] on null / non-object", () => {
    expect(extractArrayPayload(null, ["products"])).toEqual([]);
    expect(extractArrayPayload("string", ["products"])).toEqual([]);
    expect(extractArrayPayload(42, ["products"])).toEqual([]);
  });

  // Sec-48i: depth-1 nested search for vendors that wrap in an envelope.
  it("finds a preferred key nested one level deep in a wrapper object", () => {
    const out = extractArrayPayload(
      { result: { formats: [{ id: "f1" }, { id: "f2" }] } },
      ["formats", "creative_formats"],
    );
    expect(out).toEqual([{ id: "f1" }, { id: "f2" }]);
  });

  it("prefers a top-level preferred key over a nested one", () => {
    const out = extractArrayPayload(
      { formats: ["top"], result: { formats: ["nested"] } },
      ["formats"],
    );
    expect(out).toEqual(["top"]);
  });

  it("prefers a nested preferred key over a top-level generic-array fallback", () => {
    const out = extractArrayPayload(
      { meta: [1, 2, 3], data: { products: [{ id: "p" }] } },
      ["products"],
    );
    expect(out).toEqual([{ id: "p" }]);
  });

  it("falls back to the first nested array when no preferred key matches", () => {
    const out = extractArrayPayload(
      { output: { unknown_key: [{ id: "x" }] } },
      ["products"],
    );
    expect(out).toEqual([{ id: "x" }]);
  });

  it("does not dive into array-valued top-level keys when looking nested", () => {
    // Arrays of objects at top-level that themselves contain arrays
    // should not confuse the nested search. Here no preferred key is
    // present, so the top-level array wins via rule 3.
    const out = extractArrayPayload(
      { items: [{ sub: [1] }, { sub: [2] }] },
      ["products"],
    );
    expect(out).toEqual([{ sub: [1] }, { sub: [2] }]);
  });
});

describe("extractMcpToolArray", () => {
  it("returns structured_content array when present (fast path)", () => {
    const out = extractMcpToolArray(
      { formats: [{ id: "f1" }] },
      [{ type: "text", text: "ignored" }],
      ["formats"],
    );
    expect(out).toEqual([{ id: "f1" }]);
  });

  it("falls back to parsing content[].text as JSON when structured is empty", () => {
    const out = extractMcpToolArray(
      {},
      [{ type: "text", text: JSON.stringify({ formats: [{ id: "f1" }, { id: "f2" }] }) }],
      ["formats"],
    );
    expect(out).toEqual([{ id: "f1" }, { id: "f2" }]);
  });

  it("handles structured_content null with content fallback", () => {
    const out = extractMcpToolArray(
      null,
      [{ type: "text", text: '{"products":[{"id":"p"}]}' }],
      ["products"],
    );
    expect(out).toEqual([{ id: "p" }]);
  });

  it("picks the first text block that parses as JSON with a matching array", () => {
    const out = extractMcpToolArray(
      {},
      [
        { type: "text", text: "not json" },
        { type: "text", text: '{"irrelevant":1}' },
        { type: "text", text: '{"formats":[{"id":"f"}]}' },
      ],
      ["formats"],
    );
    expect(out).toEqual([{ id: "f" }]);
  });

  it("tolerates non-text content blocks without crashing", () => {
    const out = extractMcpToolArray(
      {},
      [{ type: "image", data: "..." }, { type: "text", text: '{"formats":[1]}' }],
      ["formats"],
    );
    expect(out).toEqual([1]);
  });

  it("returns [] when neither structured nor any text block yields an array", () => {
    expect(extractMcpToolArray({}, [{ type: "text", text: "hello" }], ["formats"])).toEqual([]);
    expect(extractMcpToolArray({ meta: 1 }, null, ["formats"])).toEqual([]);
    expect(extractMcpToolArray(null, null, ["formats"])).toEqual([]);
  });

  it("uses depth-1 nested search inside text-block JSON too", () => {
    const out = extractMcpToolArray(
      {},
      [{ type: "text", text: JSON.stringify({ result: { formats: [{ id: "nested" }] } }) }],
      ["formats"],
    );
    expect(out).toEqual([{ id: "nested" }]);
  });
});

describe("newWorkflowId", () => {
  it("starts with wf_ and is unique on repeated calls", () => {
    const a = newWorkflowId();
    const b = newWorkflowId();
    expect(a.startsWith("wf_")).toBe(true);
    expect(b.startsWith("wf_")).toBe(true);
    expect(a).not.toEqual(b);
  });
});
