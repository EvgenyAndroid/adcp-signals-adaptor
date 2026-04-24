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
  journeyFunnel,
  inferSensitiveCategories,
  privacyCheck,
  holdoutPlan,
} from "../src/analytics/audienceMath";

// ── fixtures ────────────────────────────────────────────────────────────────

function sig(over: Partial<SignalSummary> & { signal_agent_segment_id: string }): SignalSummary {
  const base = {
    signal_id: { source: "agent", agent_url: "https://x", id: over.signal_agent_segment_id },
    name: over.signal_agent_segment_id,
    description: "",
    signal_type: "marketplace",
    data_provider: "test",
    coverage_percentage: 1,
    deployments: [],
    pricing_options: [{ pricing_option_id: "p1", model: "cpm", cpm: 5, currency: "USD" }],
    category_type: "interest" as SignalSummary["category_type"],
    taxonomy_system: "iab_audience_1_1",
    generation_mode: "seeded",
    estimated_audience_size: 1_000_000,
    status: "available",
  };
  return { ...base, ...over } as SignalSummary;
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

// ── Sec-44: Journey funnel ──────────────────────────────────────────────────

describe("journeyFunnel", () => {
  it("first stage has conversion_rate = 1.0 and cumulative_rate = 1.0", () => {
    const f = journeyFunnel([{ name: "top", reach: 1_000_000 }, { name: "mid", reach: 500_000 }]);
    expect(f[0]!.conversion_rate).toBe(1);
    expect(f[0]!.cumulative_rate).toBe(1);
    expect(f[0]!.dropped_off).toBe(0);
  });
  it("clamps a stage whose reach exceeds its predecessor", () => {
    const f = journeyFunnel([{ name: "a", reach: 500_000 }, { name: "b", reach: 1_000_000 }]);
    expect(f[1]!.clamped).toBe(true);
    expect(f[1]!.reach).toBe(500_000);
    expect(f[1]!.conversion_rate).toBe(1);
  });
  // Sec-46: pre_clamp_reach surfaces the raw (pre-clamp) reach so the UI can explain
  // why a clamped stage reads as "100% conversion, 0 dropped".
  it("preserves the pre-clamp reach for surfacing in the UI", () => {
    const f = journeyFunnel([{ name: "a", reach: 500_000 }, { name: "b", reach: 1_000_000 }]);
    expect(f[1]!.clamped).toBe(true);
    expect(f[1]!.pre_clamp_reach).toBe(1_000_000);
    expect(f[1]!.reach).toBe(500_000);
  });
  it("pre_clamp_reach equals reach when no clamping occurred", () => {
    const f = journeyFunnel([{ name: "a", reach: 1_000_000 }, { name: "b", reach: 300_000 }]);
    expect(f[1]!.clamped).toBe(false);
    expect(f[1]!.pre_clamp_reach).toBe(300_000);
    expect(f[1]!.reach).toBe(300_000);
  });
  it("conversion_rate is ratio of current to previous", () => {
    const f = journeyFunnel([{ name: "a", reach: 1_000_000 }, { name: "b", reach: 300_000 }, { name: "c", reach: 60_000 }]);
    expect(f[1]!.conversion_rate).toBeCloseTo(0.3, 3);
    expect(f[2]!.conversion_rate).toBeCloseTo(0.2, 3);
    expect(f[2]!.cumulative_rate).toBeCloseTo(0.06, 4);
  });
  it("dropped_off is prev - current", () => {
    const f = journeyFunnel([{ name: "a", reach: 1_000_000 }, { name: "b", reach: 250_000 }]);
    expect(f[1]!.dropped_off).toBe(750_000);
  });
});

// ── Sec-44: Privacy check ───────────────────────────────────────────────────

describe("inferSensitiveCategories", () => {
  it("picks up sensitive keywords across name + description", () => {
    const hits = inferSensitiveCategories([
      { name: "Diabetes medication intenders", description: "Users with a chronic medical condition" },
      { name: "High income households" },
    ]);
    expect(hits).toContain("medical");
    expect(hits).toContain("medication");
    expect(hits).toContain("condition");
    expect(hits).toContain("income");
  });
  it("returns empty for non-sensitive signals", () => {
    const hits = inferSensitiveCategories([
      { name: "Streaming enthusiasts" },
      { name: "Automotive intenders" },
    ]);
    expect(hits).toEqual([]);
  });
});

describe("privacyCheck", () => {
  it("blocks when cohort_size < min_k", () => {
    const r = privacyCheck(500, [], 1000);
    expect(r.status).toBe("block");
    expect(r.k_anon_pass).toBe(false);
  });
  it("ok when k passes and no sensitive categories", () => {
    const r = privacyCheck(2_000_000, [], 1000);
    expect(r.status).toBe("ok");
    expect(r.k_anon_pass).toBe(true);
  });
  it("warns when a single sensitive category is touched", () => {
    const r = privacyCheck(2_000_000, ["medical"], 1000);
    expect(r.status).toBe("warn");
    expect(r.intersectional_sensitivity).toBe(false);
  });
  it("warns + flags intersectional when 2+ sensitive categories touched", () => {
    const r = privacyCheck(2_000_000, ["medical", "income"], 1000);
    expect(r.status).toBe("warn");
    expect(r.intersectional_sensitivity).toBe(true);
  });
});

// ── Sec-44: Holdout plan ────────────────────────────────────────────────────

describe("holdoutPlan", () => {
  it("splits reach into control + exposed per holdout_pct", () => {
    const p = holdoutPlan(1_000_000, 0.10);
    expect(p.control_size).toBe(100_000);
    expect(p.exposed_size).toBe(900_000);
    expect(p.control_size + p.exposed_size).toBe(1_000_000);
  });
  it("clamps holdout_pct to [0.01, 0.5]", () => {
    const tiny = holdoutPlan(1_000_000, 0.001);
    expect(tiny.holdout_pct).toBeGreaterThanOrEqual(0.01);
    const huge = holdoutPlan(1_000_000, 0.9);
    expect(huge.holdout_pct).toBeLessThanOrEqual(0.5);
  });
  it("MDE shrinks as reach grows (more power)", () => {
    const small = holdoutPlan(100_000, 0.10, 0.02);
    const large = holdoutPlan(10_000_000, 0.10, 0.02);
    expect(large.mde_absolute).toBeLessThan(small.mde_absolute);
  });
  it("mde_relative = mde_absolute / baseline_conversion_rate (within rounding)", () => {
    const p = holdoutPlan(1_000_000, 0.10, 0.02);
    // Both fields are independently rounded to 4 decimals, so allow 1 d.p. slack.
    expect(p.mde_relative).toBeCloseTo(p.mde_absolute / p.baseline_conversion_rate, 1);
  });
});
