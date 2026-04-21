// tests/estimateService.test.ts
// Sec-32: estimate service — dry-run audience sizing. Same heuristic as
// /generate so numbers are consistent, but no D1 write and no persisted
// segment.

import { describe, it, expect } from "vitest";
import { estimateAudience, isEstimateError } from "../src/domain/estimateService";
import type { ResolvedRule } from "../src/types/rule";

describe("estimateService.estimateAudience", () => {
  it("returns the US baseline for an empty rule set", async () => {
    const r = await estimateAudience([]);
    expect(isEstimateError(r)).toBe(false);
    if (!isEstimateError(r)) {
      expect(r.estimated_audience_size).toBe(240_000_000);
      expect(r.coverage_percentage).toBe(100);
      expect(r.rule_count).toBe(0);
      expect(r.dimensions_used).toEqual([]);
      expect(r.confidence).toBe("low");
    }
  });

  it("narrows the audience on a single rule and reports one dimension", async () => {
    const rules: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "25-34" },
    ];
    const r = await estimateAudience(rules);
    expect(isEstimateError(r)).toBe(false);
    if (!isEstimateError(r)) {
      expect(r.rule_count).toBe(1);
      expect(r.dimensions_used).toEqual(["age_band"]);
      expect(r.estimated_audience_size).toBeLessThan(240_000_000);
      expect(r.coverage_percentage).toBeLessThan(100);
      expect(r.confidence).toBe("high");
    }
  });

  it("intersects multiple rules (stacking reduces size)", async () => {
    const single: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "25-34" },
    ];
    const triple: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
      { dimension: "metro_tier", operator: "eq", value: "top_10" },
    ];
    const rSingle = await estimateAudience(single);
    const rTriple = await estimateAudience(triple);
    if (!isEstimateError(rSingle) && !isEstimateError(rTriple)) {
      expect(rTriple.estimated_audience_size).toBeLessThan(rSingle.estimated_audience_size);
      expect(rTriple.rule_count).toBe(3);
      expect(rTriple.confidence).toBe("medium");
      expect(new Set(rTriple.dimensions_used)).toEqual(
        new Set(["age_band", "income_band", "metro_tier"]),
      );
    }
  });

  it("accepts the 6-rule maximum without rejection", async () => {
    const rules: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "income_band", operator: "eq", value: "100k_150k" },
      { dimension: "education", operator: "eq", value: "bachelors" },
      { dimension: "household_type", operator: "eq", value: "couple_no_kids" },
      { dimension: "metro_tier", operator: "eq", value: "top_25" },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ];
    const r = await estimateAudience(rules);
    expect(isEstimateError(r)).toBe(false);
    if (!isEstimateError(r)) {
      expect(r.rule_count).toBe(6);
      expect(r.dimensions_used).toHaveLength(6);
    }
  });

  it("returns INVALID_REQUEST when a value is not in the dimension's enum", async () => {
    const rules: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "0-17" }, // not allowed
    ];
    const r = await estimateAudience(rules);
    expect(isEstimateError(r)).toBe(true);
    if (isEstimateError(r)) {
      expect(r.code).toBe("INVALID_REQUEST");
      expect(r.details?.validation_errors?.[0]).toMatch(/0-17/);
    }
  });

  it("returns an estimate even for an unknown dimension (no validation table)", async () => {
    // Unknown dimensions aren't in VALID_VALUES, so they pass validation.
    // The estimator just skips unknown dimensions when multiplying reach
    // factors — result is still a valid number, not an error.
    const rules = [
      { dimension: "brand_loyalty", operator: "eq", value: "high" },
    ] as unknown as ResolvedRule[];
    const r = await estimateAudience(rules);
    expect(isEstimateError(r)).toBe(false);
  });

  it("never drops below the 50K floor even under extreme stacking", async () => {
    const rules: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "65+" },           // 0.11
      { dimension: "income_band", operator: "eq", value: "150k_plus" },  // 0.11
      { dimension: "education", operator: "eq", value: "graduate" },     // 0.13
      { dimension: "household_type", operator: "eq", value: "senior_household" }, // 0.14
      { dimension: "metro_tier", operator: "eq", value: "top_10" },      // 0.21
      { dimension: "streaming_affinity", operator: "eq", value: "low" }, // 0.25
    ];
    const r = await estimateAudience(rules);
    if (!isEstimateError(r)) {
      expect(r.estimated_audience_size).toBeGreaterThanOrEqual(50_000);
    }
  });

  it("hashes rule order invariantly (sort before cache key)", async () => {
    // Implementation detail — not directly observable without KV, but we
    // can at least confirm the same inputs return the same result.
    const a: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "income_band", operator: "eq", value: "100k_150k" },
    ];
    const b: ResolvedRule[] = [
      { dimension: "income_band", operator: "eq", value: "100k_150k" },
      { dimension: "age_band", operator: "eq", value: "25-34" },
    ];
    const rA = await estimateAudience(a);
    const rB = await estimateAudience(b);
    if (!isEstimateError(rA) && !isEstimateError(rB)) {
      expect(rA.estimated_audience_size).toBe(rB.estimated_audience_size);
    }
  });

  it("caches through the provided KV namespace", async () => {
    const store = new Map<string, string>();
    const kv = {
      async get(key: string) { return store.get(key) ?? null; },
      async put(key: string, value: string) { store.set(key, value); },
    } as unknown as KVNamespace;

    const rules: ResolvedRule[] = [
      { dimension: "age_band", operator: "eq", value: "25-34" },
    ];
    await estimateAudience(rules, kv);
    // One KV entry should have been written under the estimate: prefix.
    const keys = [...store.keys()];
    expect(keys.some((k) => k.startsWith("estimate:"))).toBe(true);
  });
});
