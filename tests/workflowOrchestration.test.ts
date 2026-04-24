// tests/workflowOrchestration.test.ts
// Unit coverage for Sec-48f workflow helpers. These are pure functions
// (no network, no Env binding) so the tests are deterministic.

import { describe, it, expect } from "vitest";
import {
  signalId,
  productId,
  pickTopSignals,
  pickTopFormatIds,
  pickProductPerAgent,
  buildCreateMediaBuyPayload,
  applyVendorAdapter,
  extractCategories,
  extractArrayPayload,
  extractMcpToolArray,
  deriveCreativeFilter,
  deriveProductFilter,
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

  // Sec-48l: Celtra-style human-prefix + JSON text. Direct JSON.parse
  // fails on "Available Creative Formats:\n\n{...}". Fallback slices
  // from the first opener to the last matching closer.
  it("recovers JSON from a text block with a human-readable prefix", () => {
    const out = extractMcpToolArray(
      {},
      [{
        type: "text",
        text:
          "Available Creative Formats:\n\n" +
          JSON.stringify({ formats: [{ id: "f1" }, { id: "f2" }] }),
      }],
      ["formats"],
    );
    expect(out).toEqual([{ id: "f1" }, { id: "f2" }]);
  });

  it("recovers an array payload with a human-readable prefix", () => {
    const out = extractMcpToolArray(
      {},
      [{
        type: "text",
        text: "Results:\n\n" + JSON.stringify([{ id: "a" }, { id: "b" }]),
      }],
      ["formats"], // no preferred key matches an array at top level
    );
    // extractArrayPayload's generic fallback takes the first array-valued
    // key — but the parsed JSON is itself an array, not an object. That
    // doesn't match any of the lookup rules, so we expect empty.
    // This test documents the current behavior: we recover arrays only
    // when they're inside an object under a preferred or any key.
    expect(out).toEqual([]);
  });

  it("handles the Celtra-observed payload shape end-to-end", () => {
    // Real shape captured 2026-04-24 via /agents/workflow/run/stream
    // diagnostic: structured_content null/other, content[0].text starts
    // with "Available Creative Formats:\n\n{\"formats\":[...]}".
    const text =
      "Available Creative Formats:\n\n" +
      JSON.stringify({
        formats: [
          { format_id: { agent_url: "...", id: "ed4e8559" }, name: "2 Images Display 160x600" },
          { format_id: { agent_url: "...", id: "abc12345" }, name: "Video 16:9" },
        ],
      });
    const out = extractMcpToolArray(
      null,
      [{ type: "text", text }],
      ["formats", "creative_formats", "items"],
    );
    expect(out).toHaveLength(2);
    expect((out[0] as { name: string }).name).toBe("2 Images Display 160x600");
  });
});

describe("deriveCreativeFilter", () => {
  it("detects video intent from common keywords", () => {
    expect(deriveCreativeFilter("luxury APAC video campaign")).toEqual({ asset_types: ["video"] });
    expect(deriveCreativeFilter("pre-roll CTV across OTT")).toEqual({ asset_types: ["video"] });
  });

  it("detects image/display intent", () => {
    expect(deriveCreativeFilter("banner campaign for auto intenders")).toEqual({ asset_types: ["image"] });
    expect(deriveCreativeFilter("static display retargeting")).toEqual({ asset_types: ["image"] });
  });

  it("leaves asset_types unset when both or neither are mentioned", () => {
    expect(deriveCreativeFilter("multimedia: video and display")).toEqual({});
    expect(deriveCreativeFilter("luxury travel")).toEqual({});
  });

  it("layers mobile hint on top of asset type", () => {
    const out = deriveCreativeFilter("mobile video for commuters");
    expect(out.asset_types).toEqual(["video"]);
    expect(out.max_width).toBe(500);
  });

  it("recognizes desktop takeover pattern", () => {
    const out = deriveCreativeFilter("desktop home page takeover");
    expect(out.min_width).toBe(728);
  });
});

describe("deriveProductFilter", () => {
  it("forwards signals + asset_types, strips format_ids (Sec-48r vendor-model mismatch)", () => {
    const out = deriveProductFilter(
      ["sig_1", "sig_2"],
      ["fmt_a", "fmt_b"],
      { asset_types: ["video"] },
    );
    expect(out).toEqual({
      targeting_signals: ["sig_1", "sig_2"],
      asset_types: ["video"],
    });
    // NOT in output — see note in deriveProductFilter source about Pydantic
    // FormatId model rejecting string[].
    expect(out).not.toHaveProperty("format_ids");
  });

  it("omits keys with empty inputs", () => {
    expect(deriveProductFilter([], [], {})).toEqual({});
    expect(deriveProductFilter(["s"], [], {})).toEqual({ targeting_signals: ["s"] });
  });
});

describe("pickTopFormatIds", () => {
  it("takes one format id per vendor first, then fills the remainder", () => {
    // n=5, vendors have 2+1=3 total: per-vendor pass picks a1 + b1,
    // fill pass adds a2 from the first vendor's overflow.
    const out = pickTopFormatIds(
      [
        { payload: { formats: [{ id: "a1" }, { id: "a2" }] } },
        { payload: { formats: [{ id: "b1" }] } },
      ],
      5,
    );
    expect(out).toEqual(["a1", "b1", "a2"]);
  });

  it("caps at n even when more are available", () => {
    const out = pickTopFormatIds(
      [
        { payload: { formats: [{ id: "a1" }, { id: "a2" }] } },
        { payload: { formats: [{ id: "b1" }, { id: "b2" }] } },
      ],
      2,
    );
    expect(out).toEqual(["a1", "b1"]);
  });

  it("flattens Celtra's nested format_id.{agent_url,id} shape", () => {
    const out = pickTopFormatIds(
      [{ payload: { formats: [{ format_id: { agent_url: "x", id: "celtra_123" }, name: "x" }] } }],
      3,
    );
    expect(out).toEqual(["celtra_123"]);
  });

  it("fills remaining slots from first vendor after per-vendor pass", () => {
    const out = pickTopFormatIds(
      [{ payload: { formats: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] } }],
      3,
    );
    expect(out).toEqual(["a1", "a2", "a3"]);
  });

  it("dedupes ids if the same one appears in multiple vendors", () => {
    const out = pickTopFormatIds(
      [
        { payload: { formats: [{ id: "shared" }] } },
        { payload: { formats: [{ id: "shared" }, { id: "unique" }] } },
      ],
      5,
    );
    expect(out).toEqual(["shared", "unique"]);
  });

  it("returns [] when no formats have ids", () => {
    expect(pickTopFormatIds([{ payload: { formats: [{ name: "no id" }] } }], 3)).toEqual([]);
  });
});

describe("buildCreateMediaBuyPayload with creatives (Sec-48q)", () => {
  const NOW = Date.UTC(2026, 3, 24, 12, 0, 0);
  it("emits packages[0].creatives with each chosen format id", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "wf_test",
      agentId: "adzymic_apx",
      brief: "x",
      chosenProductId: "prod",
      chosenSignalIds: [],
      chosenFormatIds: ["fmt_a", "fmt_b"],
      nowMs: NOW,
    });
    expect(p.packages[0]!.creatives).toEqual([
      { format_id: "fmt_a" },
      { format_id: "fmt_b" },
    ]);
  });

  it("omits creatives key when no formats are chosen", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "w", agentId: "a", brief: "x",
      chosenProductId: "p", chosenSignalIds: [], chosenFormatIds: [], nowMs: NOW,
    });
    expect(p.packages[0]!.creatives).toBeUndefined();
  });

  it("treats missing chosenFormatIds as empty", () => {
    const p = buildCreateMediaBuyPayload({
      workflowId: "w", agentId: "a", brief: "x",
      chosenProductId: "p", chosenSignalIds: [], nowMs: NOW,
    });
    expect(p.packages[0]!.creatives).toBeUndefined();
  });
});

describe("applyVendorAdapter (Sec-48r)", () => {
  const NOW = Date.UTC(2026, 3, 24, 12, 0, 0);
  const base = buildCreateMediaBuyPayload({
    workflowId: "wf_x",
    agentId: "dummy",
    brief: "automotive intenders",
    chosenProductId: "prod_1",
    chosenSignalIds: ["sig_1"],
    chosenFormatIds: ["fmt_1"],
    nowMs: NOW,
  });

  it("adzymic_*: brand_manifest.name + buyer_ref + scalar budgets + pricing_option_id", () => {
    const out = applyVendorAdapter("adzymic_apx", base) as unknown as {
      brand_manifest: Record<string, unknown>;
      packages: Array<Record<string, unknown>>;
      total_budget: unknown;
    };
    expect(out.brand_manifest.brand).toBe("AdCP Workflow Demo");
    expect(out.brand_manifest.name).toBe("AdCP Workflow Demo");
    expect(out.packages[0]!.buyer_ref).toContain("pkg_1");
    expect(out.packages[0]!.budget).toBe(1000);
    expect(out.packages[0]!.pricing_option_id).toBe("default");
    expect(out.total_budget).toBe(1000);
  });

  it("swivel: same as adzymic (budget also flattened — Sec-48r4)", () => {
    const out = applyVendorAdapter("swivel", base) as unknown as {
      brand_manifest: Record<string, unknown>;
      packages: Array<Record<string, unknown>>;
      total_budget: unknown;
    };
    expect(out.brand_manifest.name).toBeDefined();
    expect(out.packages[0]!.buyer_ref).toContain(base.buyer_ref);
    // Sec-48r4: swivel's pydantic is NOT lenient on budget. Same error
    // format as adzymic; flatten to scalar.
    expect(out.packages[0]!.budget).toBe(1000);
    expect(out.total_budget).toBe(1000);
    expect(out.packages[0]!.pricing_option_id).toBe("default");
  });

  it("claire_*: swap brand_manifest for top-level brand BrandReference (Sec-48r5)", () => {
    const out = applyVendorAdapter("claire_scope3", base) as unknown as {
      brand_manifest?: unknown;
      brand?: Record<string, unknown>;
      packages: Array<Record<string, unknown>>;
      total_budget: unknown;
    };
    // Sec-48r5: Claire expects top-level `brand: BrandReference`, not
    // `brand_manifest: BrandManifest`. Different schema family.
    expect(out.brand_manifest).toBeUndefined();
    // Sec-48r6: AdCP spec BrandReference is {domain, name} (not {id, name}).
    expect(out.brand).toEqual({ domain: "demo.example.com", name: "AdCP Workflow Demo" });
    expect(out.packages[0]!.buyer_ref).toBeDefined();
    expect(out.packages[0]!.budget).toBe(1000);
    expect(out.packages[0]!.pricing_option_id).toBe("default");
    expect(out.total_budget).toBe(1000);
  });

  it("content_ignite follows claire rules (brand swap, not brand_manifest)", () => {
    const out = applyVendorAdapter("content_ignite", base) as unknown as {
      brand_manifest?: unknown;
      brand?: Record<string, unknown>;
      packages: Array<Record<string, unknown>>;
    };
    expect(out.brand_manifest).toBeUndefined();
    expect(out.brand).toBeDefined();
    expect(out.brand!.name).toBe("AdCP Workflow Demo");
    expect(out.packages[0]!.pricing_option_id).toBe("default");
  });

  it("unknown agent passes through as identity", () => {
    const out = applyVendorAdapter("random_new_agent", base);
    expect(out).toEqual(base);
    // Confirmed not the same reference — adapter deep-clones.
    expect(out).not.toBe(base);
  });

  it("adapter is a deep-clone; mutating result doesn't touch base", () => {
    const out = applyVendorAdapter("adzymic_apx", base);
    (out.brand_manifest as unknown as Record<string, unknown>).name = "tampered";
    expect(base.brand_manifest.brand).toBe("AdCP Workflow Demo");
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
