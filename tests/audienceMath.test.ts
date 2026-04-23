// tests/audienceMath.test.ts
// Sec-43: pure-math tests for the audience composer helpers.

import { describe, it, expect } from "vitest";
import type { SignalSummary } from "../src/types/api";
import {
  verticalOf,
  geoBand,
  pairOverlap,
  unionReach,
  intersectReach,
  excludeReach,
  saturationCurve,
  saturationKnee,
  shareByKey,
  affinityRows,
  skewScore,
  concentrationOf,
} from "../src/analytics/audienceMath";

// ── fixtures ────────────────────────────────────────────────────────────────

function sig(over: Partial<SignalSummary> & { signal_agent_segment_id: string }): SignalSummary {
  return {
    signal_id: { source: "agent", agent_url: "https://x", id: over.signal_agent_segment_id },
    signal_agent_segment_id: over.signal_agent_segment_id,
    name: over.name ?? over.signal_agent_segment_id,
    description: "",
    signal_type: "marketplace",
    data_provider: "test",
    coverage_percentage: 1,
    deployments: [],
    pricing_options: [{ pricing_option_id: "p1", model: "cpm", cpm: 5, currency: "USD" }],
    category_type: (over.category_type ?? "interest") as SignalSummary["category_type"],
    taxonomy_system: "iab_audience_1_1",
    generation_mode: "seeded",
    estimated_audience_size: over.estimated_audience_size ?? 1_000_000,
    status: "available",
    ...over,
  } as SignalSummary;
}

// ── classifiers ─────────────────────────────────────────────────────────────

describe("verticalOf", () => {
  it("recognizes B2B firmographic prefixes", () => {
    expect(verticalOf("sig_b2b_firmo_software_5000")).toBe("b2b_firmo_techno");
    expect(verticalOf("sig_b2b_techno_aws")).toBe("b2b_firmo_techno");
  });
  it("recognizes retail media + CTV + venue + weather variants", () => {
    expect(verticalOf("sig_rmn_walmart_grocery")).toBe("retail_media_network");
    expect(verticalOf("sig_ctv_hispanic_primetime")).toBe("ctv_hispanic_daypart");
    expect(verticalOf("sig_venue_stadium_nfl")).toBe("venue_fenced");
    expect(verticalOf("sig_weather_heatwave_ne")).toBe("weather_triggered");
  });
  it("falls back to other for unrecognized ids", () => {
    expect(verticalOf("sig_unknown_thing")).toBe("other");
  });
});

describe("geoBand", () => {
  it("bands by reach", () => {
    expect(geoBand(sig({ signal_agent_segment_id: "a", estimated_audience_size: 100_000_000 }))).toBe("national");
    expect(geoBand(sig({ signal_agent_segment_id: "a", estimated_audience_size: 20_000_000 }))).toBe("multi_region");
    expect(geoBand(sig({ signal_agent_segment_id: "a", estimated_audience_size: 2_000_000 }))).toBe("metro");
    expect(geoBand(sig({ signal_agent_segment_id: "a", estimated_audience_size: 100_000 }))).toBe("local");
  });
});

// ── pairOverlap ─────────────────────────────────────────────────────────────

describe("pairOverlap", () => {
  it("returns 0 when either reach is 0", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 0 });
    const b = sig({ signal_agent_segment_id: "b", estimated_audience_size: 1_000_000 });
    expect(pairOverlap(a, b)).toBe(0);
  });
  it("uses higher affinity for matching category", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000, category_type: "interest" });
    const b = sig({ signal_agent_segment_id: "b", estimated_audience_size: 1_000_000, category_type: "interest" });
    const c = sig({ signal_agent_segment_id: "c", estimated_audience_size: 1_000_000, category_type: "demographic" });
    expect(pairOverlap(a, b)).toBeGreaterThan(pairOverlap(a, c));
  });
  it("scales with min reach", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000, category_type: "interest" });
    const small = sig({ signal_agent_segment_id: "b", estimated_audience_size: 100_000, category_type: "interest" });
    const large = sig({ signal_agent_segment_id: "c", estimated_audience_size: 10_000_000, category_type: "interest" });
    expect(pairOverlap(a, small)).toBeLessThan(pairOverlap(a, large));
  });
});

// ── set ops ─────────────────────────────────────────────────────────────────

describe("unionReach", () => {
  it("returns 0 for empty input", () => {
    expect(unionReach([])).toBe(0);
  });
  it("returns single signal reach for length 1", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 750_000 });
    expect(unionReach([a])).toBe(750_000);
  });
  it("union of two signals is between max(reach) and sum(reach)", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000, category_type: "interest" });
    const b = sig({ signal_agent_segment_id: "b", estimated_audience_size: 1_000_000, category_type: "interest" });
    const u = unionReach([a, b]);
    expect(u).toBeGreaterThanOrEqual(1_000_000);
    expect(u).toBeLessThanOrEqual(2_000_000);
  });
  it("union grows monotonically with added signals", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000 });
    const b = sig({ signal_agent_segment_id: "b", estimated_audience_size: 800_000 });
    const c = sig({ signal_agent_segment_id: "c", estimated_audience_size: 600_000 });
    expect(unionReach([a])).toBeLessThanOrEqual(unionReach([a, b]));
    expect(unionReach([a, b])).toBeLessThanOrEqual(unionReach([a, b, c]));
  });
});

describe("intersectReach", () => {
  it("returns base unchanged when fold is empty", () => {
    expect(intersectReach(500_000, null, [])).toBe(500_000);
  });
  it("intersection ≤ base", () => {
    const tpl = sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000, category_type: "interest" });
    const next = sig({ signal_agent_segment_id: "b", estimated_audience_size: 1_000_000, category_type: "interest" });
    expect(intersectReach(1_000_000, tpl, [next])).toBeLessThanOrEqual(1_000_000);
  });
});

describe("excludeReach", () => {
  it("returns base when nothing to exclude", () => {
    expect(excludeReach(500_000, [], [])).toBe(500_000);
  });
  it("exclusion ≤ base, never negative", () => {
    const a = sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000, category_type: "interest" });
    const huge = sig({ signal_agent_segment_id: "huge", estimated_audience_size: 100_000_000, category_type: "interest" });
    const r = excludeReach(1_000_000, [a], [huge]);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1_000_000);
  });
});

// ── saturation ──────────────────────────────────────────────────────────────

describe("saturationCurve", () => {
  it("F=1 reaches ≈63% under Poisson", () => {
    const c = saturationCurve(1_000_000, 5, [1]);
    expect(c[0]!.reach_fraction).toBeCloseTo(1 - Math.exp(-1), 4);
    expect(c[0]!.unique_reach).toBeGreaterThan(620_000);
    expect(c[0]!.unique_reach).toBeLessThan(640_000);
  });
  it("unique_reach is monotonically non-decreasing as F grows", () => {
    const c = saturationCurve(1_000_000, 5, [1, 2, 3, 5, 10]);
    for (let i = 1; i < c.length; i++) {
      expect(c[i]!.unique_reach).toBeGreaterThanOrEqual(c[i - 1]!.unique_reach);
    }
  });
  it("marginal_reach is non-increasing (diminishing returns)", () => {
    const c = saturationCurve(1_000_000, 5, [1, 2, 3, 4, 5]);
    for (let i = 1; i < c.length; i++) {
      expect(c[i]!.marginal_reach).toBeLessThanOrEqual(c[i - 1]!.marginal_reach + 1);
    }
  });
  it("cost = impressions × cpm / 1000", () => {
    const c = saturationCurve(1_000_000, 10, [3]);
    expect(c[0]!.cost_usd).toBeCloseTo((1_000_000 * 3) * 10 / 1000, 2);
  });
});

describe("saturationKnee", () => {
  it("returns a frequency past F=1 for a sensible curve", () => {
    const c = saturationCurve(1_000_000, 5, [1, 2, 3, 4, 5, 6, 7, 8, 10, 15]);
    const knee = saturationKnee(c);
    expect(knee).not.toBeNull();
    expect(knee).toBeGreaterThan(1);
  });
  it("returns null when only F=1 sampled", () => {
    expect(saturationKnee(saturationCurve(1_000_000, 5, [1]))).toBeNull();
  });
});

// ── affinity / share ───────────────────────────────────────────────────────

describe("shareByKey", () => {
  it("sums to 1.0 when at least one row has non-zero reach", () => {
    const rows = [
      sig({ signal_agent_segment_id: "a", estimated_audience_size: 1_000_000, category_type: "interest" }),
      sig({ signal_agent_segment_id: "b", estimated_audience_size: 3_000_000, category_type: "demographic" }),
    ];
    const m = shareByKey(rows, (s) => s.category_type);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 4);
  });
});

describe("affinityRows", () => {
  it("computes index 100 at parity, 200 at 2x over-rep", () => {
    const baseline = new Map([["a", 0.5], ["b", 0.5]]);
    const sel = new Map([["a", 1.0], ["b", 0.0]]);
    const rows = affinityRows(baseline, sel);
    const a = rows.find((r) => r.key === "a")!;
    const b = rows.find((r) => r.key === "b")!;
    expect(a.index).toBe(200);
    expect(b.index).toBe(0);
  });
  it("caps index at 600 for tiny baselines", () => {
    const baseline = new Map([["a", 0.001]]);
    const sel = new Map([["a", 1.0]]);
    const rows = affinityRows(baseline, sel);
    expect(rows[0]!.index).toBe(600);
  });
});

describe("skewScore", () => {
  it("0 when all rows are at parity", () => {
    const rows = affinityRows(new Map([["a", 0.5], ["b", 0.5]]), new Map([["a", 0.5], ["b", 0.5]]));
    expect(skewScore(rows)).toBe(0);
  });
  it("higher when selection diverges from baseline", () => {
    const flat = affinityRows(new Map([["a", 0.5], ["b", 0.5]]), new Map([["a", 0.5], ["b", 0.5]]));
    const skewed = affinityRows(new Map([["a", 0.5], ["b", 0.5]]), new Map([["a", 1.0], ["b", 0.0]]));
    expect(skewScore(skewed)).toBeGreaterThan(skewScore(flat));
  });
});

describe("concentrationOf", () => {
  it("returns 1 when one bucket holds ≥80%", () => {
    const rows = affinityRows(new Map([["a", 1.0]]), new Map([["a", 1.0]]));
    expect(concentrationOf(rows)).toBe(1);
  });
  it("returns multiple when share is spread", () => {
    const rows = affinityRows(
      new Map([["a", 0.25], ["b", 0.25], ["c", 0.25], ["d", 0.25]]),
      new Map([["a", 0.25], ["b", 0.25], ["c", 0.25], ["d", 0.25]]),
    );
    expect(concentrationOf(rows)).toBeGreaterThanOrEqual(3);
  });
});
