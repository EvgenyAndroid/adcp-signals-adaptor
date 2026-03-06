// tests/index.test.ts
// AdCP Signals Adaptor - Comprehensive test suite

import { describe, it, expect, beforeEach } from "vitest";

// ── Utility tests ─────────────────────────────────────────────────────────────

import { signalIdFromSlug, dynamicSignalId, operationId, requestId } from "../src/utils/ids";

describe("ID utilities", () => {
  it("signalIdFromSlug produces stable deterministic IDs", () => {
    expect(signalIdFromSlug("High Income Households")).toBe("sig_high_income_households");
    expect(signalIdFromSlug("Action Movie Fans")).toBe("sig_action_movie_fans");
  });

  it("signalIdFromSlug strips leading/trailing underscores", () => {
    const id = signalIdFromSlug("  Adults 25-34  ");
    expect(id).toMatch(/^sig_/);
    expect(id).not.toMatch(/^sig__/);
  });

  it("dynamicSignalId has correct prefix", () => {
    const id = dynamicSignalId("Urban Sci-Fi Fans");
    expect(id).toMatch(/^sig_dyn_/);
  });

  it("operationId has correct prefix", () => {
    const id = operationId();
    expect(id).toMatch(/^op_/);
  });

  it("requestId has correct prefix", () => {
    const id = requestId();
    expect(id).toMatch(/^req_/);
  });
});

// ── Estimation tests ──────────────────────────────────────────────────────────

import { estimateAudienceSize, estimateSeededSize } from "../src/utils/estimation";

describe("Audience size estimation", () => {
  it("returns an estimate above the floor for a single rule", () => {
    const result = estimateAudienceSize([
      { dimension: "age_band", operator: "eq", value: "25-34" },
    ]);
    expect(result.estimated).toBeGreaterThan(50_000);
  });

  it("narrows audience size with multiple intersecting rules", () => {
    const broadResult = estimateAudienceSize([
      { dimension: "age_band", operator: "eq", value: "25-34" },
    ]);
    const narrowResult = estimateAudienceSize([
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
      { dimension: "metro_tier", operator: "eq", value: "top_10" },
    ]);
    expect(narrowResult.estimated).toBeLessThan(broadResult.estimated);
  });

  it("returns heuristic_demo methodology", () => {
    const result = estimateAudienceSize([]);
    expect(result.methodology).toBe("heuristic_demo");
  });

  it("estimateSeededSize returns a positive number", () => {
    expect(estimateSeededSize("demographic", "4")).toBeGreaterThan(0);
    expect(estimateSeededSize("interest", "103")).toBeGreaterThan(0);
  });
});

// ── Taxonomy loader tests ─────────────────────────────────────────────────────

import { parseTaxonomyTsv, findBestTaxonomyMatch } from "../src/connectors/iabTaxonomyLoader";

const SAMPLE_TSV = `Unique ID\tParent ID\tName\tTier 1\tTier 2\tTier 3\tExtension
1\t\tDemographic\t\t\t
2\t1\tAge\tDemographic\tAge\t
3\t2\t18-24\tDemographic\tAge\t18-24
4\t2\t25-34\tDemographic\tAge\t25-34
100\t\tInterests\t\t\t
101\t100\tMovies\tInterests\tMovies\t
102\t101\tSci-Fi\tInterests\tMovies\tSci-Fi`;

describe("IAB Taxonomy loader", () => {
  it("parses TSV and builds index correctly", () => {
    const index = parseTaxonomyTsv(SAMPLE_TSV);
    expect(index.byId.size).toBe(7);
    expect(index.byId.get("3")?.name).toBe("18-24");
    expect(index.byId.get("102")?.name).toBe("Sci-Fi");
  });

  it("builds parent-child hierarchy", () => {
    const index = parseTaxonomyTsv(SAMPLE_TSV);
    expect(index.children.get("2")).toHaveLength(2);
    expect(index.roots).toHaveLength(2);
  });

  it("findBestTaxonomyMatch finds by exact name", () => {
    const index = parseTaxonomyTsv(SAMPLE_TSV);
    const match = findBestTaxonomyMatch(index, ["Sci-Fi"]);
    expect(match?.uniqueId).toBe("102");
  });

  it("throws on invalid TSV", () => {
    expect(() => parseTaxonomyTsv("not a tsv at all")).toThrow();
  });
});

// ── Demographic loader tests ──────────────────────────────────────────────────

import { parseDemographicsCsv, aggregateByDimension } from "../src/connectors/demographicLoader";

const DEMO_CSV = `age_band,income_band,education,household_type,region,metro_tier,estimated_count
25-34,50k_100k,bachelors,single,northeast,top_10,870000
25-34,150k_plus,graduate,couple_no_kids,west,top_10,310000
35-44,100k_150k,bachelors,family_with_kids,south,top_50,780000`;

describe("Demographic loader", () => {
  it("parses CSV into DemographicRecord array", () => {
    const records = parseDemographicsCsv(DEMO_CSV);
    expect(records).toHaveLength(3);
    expect(records[0]?.ageBand).toBe("25-34");
    expect(records[0]?.estimatedCount).toBe(870000);
  });

  it("aggregates by dimension", () => {
    const records = parseDemographicsCsv(DEMO_CSV);
    const byAge = aggregateByDimension(records, "ageBand");
    expect(byAge.get("25-34")).toBe(870000 + 310000);
    expect(byAge.get("35-44")).toBe(780000);
  });
});

// ── Rule engine tests ─────────────────────────────────────────────────────────

import { validateRules, generateSegment } from "../src/domain/ruleEngine";

describe("Rule engine - validation", () => {
  it("accepts valid rules", () => {
    const result = validateRules([
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid dimension value", () => {
    const result = validateRules([
      { dimension: "age_band", operator: "eq", value: "99-999" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("warns about duplicate dimensions", () => {
    const result = validateRules([
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "age_band", operator: "eq", value: "35-44" },
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("Rule engine - segment generation", () => {
  it("generates a segment with valid ID and name", () => {
    const result = generateSegment([
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "metro_tier", operator: "eq", value: "top_10" },
    ]);
    expect(result.signalId).toMatch(/^sig_dyn_/);
    expect(result.name).toContain("25-34");
    expect(result.estimatedAudienceSize).toBeGreaterThan(0);
  });

  it("uses custom name when provided", () => {
    const result = generateSegment(
      [{ dimension: "content_genre", operator: "eq", value: "sci_fi" }],
      "My Custom Sci-Fi Segment"
    );
    expect(result.name).toBe("My Custom Sci-Fi Segment");
  });

  it("infers composite category for multi-dimension segments", () => {
    const result = generateSegment([
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "content_genre", operator: "eq", value: "action" },
    ]);
    expect(result.categoryType).toBe("composite");
  });

  it("maps genres to taxonomy IDs", () => {
    const result = generateSegment([
      { dimension: "content_genre", operator: "eq", value: "sci_fi" },
    ]);
    expect(result.taxonomyMatches).toContain("104");
  });
});

// ── Signal model tests ────────────────────────────────────────────────────────

import { SEEDED_SIGNALS, DERIVED_SIGNALS } from "../src/domain/signalModel";

describe("Signal catalog", () => {
  it("all seeded signals have required fields", () => {
    for (const signal of SEEDED_SIGNALS) {
      // test-signal-001 is a conformance fixture with a stable non-prefixed ID
      if (signal.signalId !== "test-signal-001") {
        expect(signal.signalId).toMatch(/^sig_/);
      }
      expect(signal.name.length).toBeGreaterThan(0);
      expect(signal.taxonomySystem).toBe("iab_audience_1_1");
      expect(signal.generationMode).toBe("seeded");
      expect(signal.status).toBe("available");
    }
  });

  it("all derived signals have rules attached", () => {
    for (const signal of DERIVED_SIGNALS) {
      expect(signal.rules).toBeDefined();
      expect(signal.rules!.length).toBeGreaterThan(0);
      expect(signal.generationMode).toBe("derived");
    }
  });

  it("seeded catalog has at least 20 signals", () => {
    expect(SEEDED_SIGNALS.length).toBeGreaterThanOrEqual(20);
  });

  it("total catalog (seeded + derived) has at least 25 signals", () => {
    expect(SEEDED_SIGNALS.length + DERIVED_SIGNALS.length).toBeGreaterThanOrEqual(25);
  });
});

// ── Validation tests ──────────────────────────────────────────────────────────

import {
  validateSearchRequest,
  validateActivateRequest,
  validateGenerateRequest,
} from "../src/utils/validation";

describe("Request validation", () => {
  it("accepts valid search request", () => {
    const result = validateSearchRequest({ categoryType: "demographic", limit: 20 });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid category type", () => {
    const result = validateSearchRequest({ categoryType: "invalid_type" });
    expect(result.ok).toBe(false);
  });

  it("rejects limit out of range", () => {
    const result = validateSearchRequest({ limit: 999 });
    expect(result.ok).toBe(false);
  });

  it("accepts valid activation request", () => {
    const result = validateActivateRequest({
      signalId: "sig_demo_test",
      destination: "mock_dsp",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects activation with missing signalId", () => {
    const result = validateActivateRequest({ destination: "mock_dsp" });
    expect(result.ok).toBe(false);
  });

  it("rejects activation with invalid destination", () => {
    const result = validateActivateRequest({
      signalId: "sig_demo_test",
      destination: "real_dsp_that_doesnt_exist",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts valid generate request", () => {
    const result = validateGenerateRequest({
      rules: [{ dimension: "age_band", operator: "eq", value: "25-34" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects generate request with no rules", () => {
    const result = validateGenerateRequest({ rules: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects generate request with too many rules", () => {
    const result = validateGenerateRequest({
      rules: Array.from({ length: 7 }, () => ({
        dimension: "age_band",
        operator: "eq",
        value: "25-34",
      })),
    });
    expect(result.ok).toBe(false);
  });
});

// ── Mapper tests ──────────────────────────────────────────────────────────────

import { toSignalSummary } from "../src/mappers/signalMapper";

describe("Signal mapper", () => {
  it("maps canonical signal to summary without internal fields", () => {
    const canonical = SEEDED_SIGNALS[0]!;
    const summary = toSignalSummary(canonical);

    expect(summary.signal_agent_segment_id).toBe(canonical.signalId);
    expect(summary.name).toBe(canonical.name);
    expect(summary.signal_type).toBeDefined();
    // Internal fields should not be in summary
    expect((summary as Record<string, unknown>)["rules"]).toBeUndefined();
    expect((summary as Record<string, unknown>)["rawSourceRefs"]).toBeUndefined();
    expect((summary as Record<string, unknown>)["signalId"]).toBeUndefined();
  });
});
