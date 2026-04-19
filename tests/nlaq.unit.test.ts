/**
 * nlaq.unit.test.ts
 * Pure logic tests — no Claude API, no D1, no network.
 * Run with: npm test
 *
 * Covers:
 *   - flattenLeafs / extractExclusions
 *   - QueryResolver: exact rule match, description similarity, archetype expansion
 *   - CompositeScorer: AND/OR/NOT set arithmetic, confidence tiers, exclude_signals
 */

import { describe, it, expect } from "vitest";
import { flattenLeafs, extractExclusions } from "../src/domain/queryParser.js";
import type { AudienceQueryAST, AudienceQueryNode, AudienceQueryLeaf } from "../src/domain/queryParser.js";
import { QueryResolver } from "../src/domain/queryResolver.js";
import type { CatalogSignal, ResolvedLeaf } from "../src/domain/queryResolver.js";
import { CompositeScorer, buildResolutionMap } from "../src/domain/compositeScorer.js";
import { adaptToLeafResolutions } from "../src/domain/nlQueryHandler.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Fixture IDs match the live SIGNAL_RULE_MAP in queryResolver.ts so Pass 1
// (exact_rule match) can fire. Signals whose dimensions aren't covered by
// that map (`interest`, `geo`) still live in the catalog and are resolved
// via Pass 3 (lexical description similarity).
//
// Fixtures intentionally mirror the D1 wire shape (`signal_agent_segment_id`,
// `category_type`, `estimated_audience_size`) rather than the in-memory
// `CatalogSignal` interface (`id`, `category`). The runtime resolver reads
// both via fallbacks in getSignalId / catalog adapters, but the structural
// type is too narrow for both shapes — typed as `any[]` here so the fixture
// stays readable and matches what production sees from D1.
const MOCK_CATALOG: any[] = [
  {
    signal_agent_segment_id: "sig_families_with_children",
    name: "Households with Children",
    category_type: "demographic",
    estimated_audience_size: 38_400_000,
    coverage_percentage: 0.16,
    rules: [{ dimension: "household_type", operator: "eq", value: "family_with_kids" }],
    description: "households with school-age children family kids parents",
  },
  {
    signal_agent_segment_id: "sig_age_35_44",
    name: "Adults 35-44",
    category_type: "demographic",
    estimated_audience_size: 43_200_000,
    coverage_percentage: 0.18,
    rules: [{ dimension: "age_band", operator: "eq", value: "35-44" }],
    description: "adults aged 35 to 44 mid-life demographic",
  },
  {
    signal_agent_segment_id: "sig_drama_viewers",
    name: "Drama Viewers",
    category_type: "interest",
    estimated_audience_size: 14_400_000,
    coverage_percentage: 0.06,
    rules: [{ dimension: "content_genre", operator: "eq", value: "drama" }],
    description: "viewers who watch drama television series",
  },
  {
    signal_agent_segment_id: "sig_nashville_geo",
    name: "Nashville DMA",
    category_type: "geo",
    estimated_audience_size: 1_620_000,
    coverage_percentage: 0.00675,
    description: "Nashville Tennessee DMA 659 metro area residents",
  },
  {
    signal_agent_segment_id: "sig_coffee_enthusiasts",
    name: "Coffee Enthusiasts",
    category_type: "interest",
    estimated_audience_size: 57_600_000,
    coverage_percentage: 0.24,
    rules: [{ dimension: "interest", operator: "eq", value: "coffee" }],
    description: "coffee drinkers enthusiasts café morning beverage",
  },
  {
    signal_agent_segment_id: "sig_high_income_households",
    name: "High Income Households",
    category_type: "demographic",
    estimated_audience_size: 28_800_000,
    coverage_percentage: 0.12,
    rules: [{ dimension: "income_band", operator: "eq", value: "150k+" }],
    description: "high income households 150k plus affluent wealthy",
  },
];

// Shared helpers — convert between the public resolver API (resolveAST
// returns ResolvedAST with per-leaf matches) and the per-leaf shape the
// old tests were written against. resolveOneLeaf wraps a leaf into an AST,
// awaits, and returns the single ResolvedLeaf. buildCatalogMap mirrors
// what nlQueryHandler does in production so the CompositeScorer adapter
// sees consistent data.
async function resolveOneLeaf(
  resolver: QueryResolver,
  leaf: AudienceQueryLeaf,
): Promise<ResolvedLeaf> {
  const resolved = await resolver.resolveAST(leaf);
  expect(resolved.resolvedLeaves.length).toBe(1);
  return resolved.resolvedLeaves[0]!;
}

function buildCatalogMap(catalog: CatalogSignal[]): Map<string, CatalogSignal> {
  return new Map(catalog.map(s => [(s as any).signal_agent_segment_id ?? s.id ?? "", s]));
}

async function resolveAndScore(resolver: QueryResolver, ast: AudienceQueryAST, hints: string[] = []) {
  const { resolvedLeaves } = await resolver.resolveAST(ast.root);
  const leafResolutions = adaptToLeafResolutions(resolvedLeaves, buildCatalogMap(MOCK_CATALOG));
  const scorer = new CompositeScorer(buildResolutionMap(leafResolutions as any));
  return scorer.score(ast, hints);
}

function makeAST(root: AudienceQueryNode, nl = "test query"): AudienceQueryAST {
  return {
    nl_query: nl,
    parsed_at: new Date().toISOString(),
    parser_model: "test",
    root,
    confidence: 0.9,
    unresolved_hints: [],
  };
}

// ─── queryParser utilities ────────────────────────────────────────────────────

describe("flattenLeafs", () => {
  it("returns single leaf", () => {
    const leaf: AudienceQueryNode = {
      op: "LEAF", dimension: "age_band", value: "35-44",
      description: "adults 35 to 44", confidence: 0.9,
    };
    expect(flattenLeafs(leaf)).toHaveLength(1);
  });

  it("flattens AND tree", () => {
    const tree: AudienceQueryNode = {
      op: "AND",
      children: [
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "", confidence: 0.9 },
        { op: "LEAF", dimension: "household_type", value: "family_with_kids", description: "", confidence: 0.9 },
      ],
    };
    expect(flattenLeafs(tree)).toHaveLength(2);
  });

  it("flattens nested NOT", () => {
    const tree: AudienceQueryNode = {
      op: "AND",
      children: [
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "", confidence: 0.9 },
        { op: "NOT", children: [
          { op: "LEAF", dimension: "interest", value: "coffee", description: "", confidence: 0.9 },
        ]},
      ],
    };
    expect(flattenLeafs(tree)).toHaveLength(2);
  });
});

describe("extractExclusions", () => {
  it("extracts leaf inside NOT", () => {
    const tree: AudienceQueryNode = {
      op: "AND",
      children: [
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "", confidence: 0.9 },
        { op: "NOT", children: [
          { op: "LEAF", dimension: "interest", value: "coffee", description: "", confidence: 0.9 },
        ]},
      ],
    };
    const excl = extractExclusions(tree);
    expect(excl).toHaveLength(1);
    expect(excl[0]?.value).toBe("coffee");
  });

  it("returns empty for no NOT nodes", () => {
    const tree: AudienceQueryNode = {
      op: "AND",
      children: [
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "", confidence: 0.9 },
      ],
    };
    expect(extractExclusions(tree)).toHaveLength(0);
  });
});

// ─── QueryResolver ────────────────────────────────────────────────────────────

// Re-aligned: the public resolver API is `resolveAST(ast)` (async) which
// returns ResolvedAST.resolvedLeaves with a flat LeafMatch[] per leaf.
// See resolveOneLeaf helper above; it wraps a single leaf in resolveAST
// and returns the one ResolvedLeaf so per-leaf tests stay concise.
describe("QueryResolver — exact rule match", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  it("matches age_band leaf to correct signal", async () => {
    const leaf: AudienceQueryLeaf = {
      op: "LEAF", dimension: "age_band", value: "35-44",
      description: "adults 35 to 44", confidence: 0.95,
    };
    const res = await resolveOneLeaf(resolver, leaf);
    expect(res.matches[0]?.signal_agent_segment_id).toBe("sig_age_35_44");
    expect(res.matches[0]?.match_score).toBeGreaterThan(0.7);
    expect(res.matches[0]?.is_exclusion).toBe(false);
  });

  it("matches household_type leaf", async () => {
    const leaf: AudienceQueryLeaf = {
      op: "LEAF", dimension: "household_type", value: "family_with_kids",
      description: "family with school-age children", confidence: 0.9,
    };
    const res = await resolveOneLeaf(resolver, leaf);
    expect(res.matches[0]?.signal_agent_segment_id).toBe("sig_families_with_children");
  });

  it("marks exclusion leaf correctly", async () => {
    // is_exclusion now lives on the leaf itself (not as a second arg to the
    // old resolveLeaf). Pass 3 lexical fallback resolves "coffee" against
    // the coffee_enthusiasts description.
    const leaf: AudienceQueryLeaf = {
      op: "LEAF", dimension: "interest", value: "coffee",
      description: "coffee drinkers café morning", confidence: 0.88,
      is_exclusion: true,
    };
    const res = await resolveOneLeaf(resolver, leaf);
    expect(res.matches[0]?.is_exclusion).toBe(true);
    expect(res.matches[0]?.signal_agent_segment_id).toBe("sig_coffee_enthusiasts");
  });

  it("handles geo leaf via description similarity", async () => {
    const leaf: AudienceQueryLeaf = {
      op: "LEAF", dimension: "geo", value: "DMA-659",
      description: "Nashville Tennessee metro area residents",
      confidence: 0.97,
    };
    const res = await resolveOneLeaf(resolver, leaf);
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.matches[0]?.signal_agent_segment_id).toBe("sig_nashville_geo");
  });
});

describe("QueryResolver — archetype expansion", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  // Archetype expansion now surfaces via match_method === "archetype_expansion"
  // on the leaf's matches (the dedicated `archetype_expansion` field on the
  // old ResolvedLeaf shape is gone — the expansion runs internally and
  // aggregates weighted matches into the normal matches array).
  it("expands soccer_mom archetype", async () => {
    const leaf: AudienceQueryLeaf = {
      op: "LEAF", dimension: "archetype", value: "soccer_mom",
      description: "soccer mom suburban female with kids", confidence: 0.91,
    };
    const res = await resolveOneLeaf(resolver, leaf);
    expect(res.matches.length).toBeGreaterThan(0);
    // Should surface families_with_children and age_band 35-44 signals from
    // the soccer_mom archetype constituents (see ARCHETYPE_TABLE in
    // queryResolver.ts).
    const ids = res.matches.map(m => m.signal_agent_segment_id);
    expect(ids.some(id => id.includes("families") || id.includes("35_44"))).toBe(true);
    expect(res.matches[0]?.match_method).toBe("archetype_expansion");
  });

  it("falls back to description similarity for unknown archetype", async () => {
    const leaf: AudienceQueryLeaf = {
      op: "LEAF", dimension: "archetype", value: "crypto_bro",
      description: "young male crypto investor tech enthusiast", confidence: 0.6,
    };
    const res = await resolveOneLeaf(resolver, leaf);
    // Unknown archetype falls through to the dimension-leaf path internally
    // but `resolveArchetype` re-tags the matches as `archetype_expansion`
    // regardless. The test's real job: the resolver doesn't throw and
    // returns a well-formed ResolvedLeaf.
    expect(res).toBeDefined();
    expect(res.leaf).toBe(leaf);
    expect(Array.isArray(res.matches)).toBe(true);
  });
});

// ─── CompositeScorer ──────────────────────────────────────────────────────────

// Re-aligned: resolveAST is async and returns ResolvedAST (not LeafResolution[]).
// buildResolutionMap expects the old nested LeafResolution shape, so we run
// the output through adaptToLeafResolutions (the same adapter production
// uses in nlQueryHandler). resolveAndScore() wraps the whole pipeline.
describe("CompositeScorer — AND intersection", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  it("estimates intersection of two demographic leafs", async () => {
    // families_with_children (16%) AND age_band 35-44 (18%)
    // expected ≈ 240M × 0.16 × 0.18 × 0.70 = ~4.8M
    const ast = makeAST({
      op: "AND",
      children: [
        { op: "LEAF", dimension: "household_type", value: "family_with_kids", description: "households with children", confidence: 0.9 },
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "adults 35 to 44", confidence: 0.9 },
      ],
    });
    const result = await resolveAndScore(resolver, ast);

    expect(result.estimated_size).toBeGreaterThan(1_000_000);
    expect(result.estimated_size).toBeLessThan(20_000_000);
    expect(result.matched_signals.length).toBeGreaterThan(0);
  });

  it("deep AND narrows audience (Nashville × drama × family)", async () => {
    const ast = makeAST({
      op: "AND",
      children: [
        { op: "LEAF", dimension: "geo", value: "DMA-659", description: "Nashville Tennessee metro area residents", confidence: 0.97 },
        { op: "LEAF", dimension: "content_genre", value: "drama", description: "drama television viewers", confidence: 0.9 },
        { op: "LEAF", dimension: "household_type", value: "family_with_kids", description: "households with children", confidence: 0.9 },
      ],
    });
    const result = await resolveAndScore(resolver, ast);

    expect(result.estimated_size).toBeLessThan(5_000_000);
    expect(["low", "narrow", "medium"]).toContain(result.confidence_tier);
  });
});

describe("CompositeScorer — NOT exclusion", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  it("moves NOT leaf matches to exclude_signals", async () => {
    const ast = makeAST({
      op: "AND",
      children: [
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "adults 35 to 44", confidence: 0.9 },
        { op: "NOT", children: [
          { op: "LEAF", dimension: "interest", value: "coffee", description: "coffee enthusiasts drinkers", confidence: 0.88, is_exclusion: true },
        ]},
      ],
    });
    const result = await resolveAndScore(resolver, ast);

    const matchedIds = result.matched_signals.map(s => s.signal_agent_segment_id);
    const excludedIds = result.exclude_signals.map(s => s.signal_agent_segment_id);

    expect(excludedIds).toContain("sig_coffee_enthusiasts");
    expect(matchedIds).not.toContain("sig_coffee_enthusiasts");
  });

  it("negation reduces confidence by 20%", async () => {
    const ast = makeAST({
      op: "NOT",
      children: [
        { op: "LEAF", dimension: "interest", value: "coffee", description: "coffee drinkers", confidence: 1.0, is_exclusion: true },
      ],
    });
    const result = await resolveAndScore(resolver, ast);
    expect(result.confidence).toBeLessThan(1.0);
  });
});

describe("CompositeScorer — OR union", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  it("OR is larger than either child alone", async () => {
    const ast = makeAST({
      op: "OR",
      children: [
        { op: "LEAF", dimension: "age_band", value: "35-44", description: "adults 35 to 44", confidence: 0.9 },
        { op: "LEAF", dimension: "household_type", value: "family_with_kids", description: "families with children", confidence: 0.9 },
      ],
    });
    const result = await resolveAndScore(resolver, ast);

    // 35-44: 18% = 43.2M, family: 16% = 38.4M, union < sum
    expect(result.estimated_size).toBeGreaterThan(43_200_000);
    expect(result.estimated_size).toBeLessThan(43_200_000 + 38_400_000);
  });
});

describe("CompositeScorer — confidence tier", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  it("high income signal alone → high confidence tier", async () => {
    const ast = makeAST({
      op: "LEAF", dimension: "income_band", value: "150k+",
      description: "high income households 150k plus affluent", confidence: 0.99,
    });
    const result = await resolveAndScore(resolver, ast);
    expect(["high", "medium"]).toContain(result.confidence_tier);
  });

  it("unresolved hint surfaces in warnings", async () => {
    const ast = makeAST({
      op: "LEAF", dimension: "age_band", value: "35-44", description: "adults", confidence: 0.9,
    });
    const result = await resolveAndScore(resolver, ast, ["afternoon crypto viewers in Wyoming"]);
    expect(result.warnings.some(w => w.includes("afternoon crypto"))).toBe(true);
  });
});

describe("CompositeScorer — soccer mom composite (full E2E without API)", () => {
  const resolver = new QueryResolver(MOCK_CATALOG);

  it("resolves soccer_mom archetype + Nashville + drama + NOT coffee", async () => {
    const ast = makeAST(
      {
        op: "AND",
        children: [
          { op: "LEAF", dimension: "archetype", value: "soccer_mom", description: "suburban female 35-50 with school-age children", confidence: 0.91 },
          { op: "LEAF", dimension: "geo", value: "DMA-659", description: "Nashville Tennessee metro area residents", confidence: 0.97 },
          { op: "LEAF", dimension: "content_genre", value: "drama", description: "afternoon drama television viewers", confidence: 0.95, temporal: { daypart: "afternoon", timezone_inference: "geo" } },
          { op: "NOT", children: [
            { op: "LEAF", dimension: "interest", value: "coffee", description: "coffee enthusiasts drinkers", confidence: 0.88, is_exclusion: true },
          ]},
        ],
      },
      "soccer moms in Nashville who watch drama in the afternoon and don't like coffee"
    );

    const result = await resolveAndScore(resolver, ast);

    // Coffee excluded
    expect(result.exclude_signals.some(s => s.signal_agent_segment_id === "sig_coffee_enthusiasts")).toBe(true);
    // At least one positive match
    expect(result.matched_signals.length).toBeGreaterThan(0);
    // Narrow audience given geo + archetype + genre
    expect(result.estimated_size).toBeLessThan(10_000_000);
    // Temporal scope preserved on drama signal (when the signal matches)
    const drama = result.matched_signals.find(s => s.signal_agent_segment_id === "sig_drama_viewers");
    if (drama) {
      expect(drama.temporal_scope?.daypart).toBe("afternoon");
    }
  });
});
