/**
 * nlaq.integration.test.ts
 * Tests the full pipeline: real Claude API → AST → resolver → scorer.
 * Requires ANTHROPIC_API_KEY env var.
 * Run with: ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
 *
 * These are slower (~3-5s each) and cost API credits — run before deploy, not on every commit.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { parseNLQuery } from "../src/domain/queryParser.js";
import { QueryResolver } from "../src/domain/queryResolver.js";
import { CompositeScorer, buildResolutionMap } from "../src/domain/compositeScorer.js";
import { handleNLQuery } from "../src/domain/nlQueryHandler.js";
import type { CatalogSignal } from "../src/domain/queryResolver.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;

// Skip all integration tests if no API key present
const describeIfKey = API_KEY ? describe : describe.skip;

const MOCK_CATALOG: CatalogSignal[] = [
  { signal_agent_segment_id: "sig_family_with_kids", name: "Households with Children", category_type: "demographic", estimated_audience_size: 38_400_000, coverage_percentage: 0.16, rules: [{ dimension: "household_type", operator: "eq", value: "family_with_kids" }], description: "households with school-age children family kids parents" },
  { signal_agent_segment_id: "sig_35_44", name: "Adults 35-44", category_type: "demographic", estimated_audience_size: 43_200_000, coverage_percentage: 0.18, rules: [{ dimension: "age_band", operator: "eq", value: "35-44" }], description: "adults aged 35 to 44 mid-life" },
  { signal_agent_segment_id: "sig_45_54", name: "Adults 45-54", category_type: "demographic", estimated_audience_size: 40_800_000, coverage_percentage: 0.17, rules: [{ dimension: "age_band", operator: "eq", value: "45-54" }], description: "adults aged 45 to 54" },
  { signal_agent_segment_id: "sig_drama_viewers", name: "Drama Viewers", category_type: "interest", estimated_audience_size: 14_400_000, coverage_percentage: 0.06, rules: [{ dimension: "content_genre", operator: "eq", value: "drama" }], description: "viewers who watch drama television series" },
  { signal_agent_segment_id: "sig_nashville_geo", name: "Nashville DMA", category_type: "geo", estimated_audience_size: 1_620_000, coverage_percentage: 0.00675, description: "Nashville Tennessee DMA 659 metro area residents" },
  { signal_agent_segment_id: "sig_coffee_enthusiasts", name: "Coffee Enthusiasts", category_type: "interest", estimated_audience_size: 57_600_000, coverage_percentage: 0.24, rules: [{ dimension: "interest", operator: "eq", value: "coffee" }], description: "coffee drinkers enthusiasts morning beverage café" },
  { signal_agent_segment_id: "sig_high_income", name: "High Income Households", category_type: "demographic", estimated_audience_size: 28_800_000, coverage_percentage: 0.12, rules: [{ dimension: "income_band", operator: "eq", value: "150k_plus" }], description: "high income households 150k plus affluent wealthy" },
  { signal_agent_segment_id: "sig_urban_top10", name: "Top 10 Metro Residents", category_type: "geo", estimated_audience_size: 72_000_000, coverage_percentage: 0.30, rules: [{ dimension: "metro_tier", operator: "eq", value: "top_10" }], description: "residents of top 10 largest US metropolitan areas urban" },
  { signal_agent_segment_id: "sig_luxury_interest", name: "Luxury Goods Interest", category_type: "interest", estimated_audience_size: 24_000_000, coverage_percentage: 0.10, description: "interest in luxury goods fashion premium brands affluent shoppers" },
  { signal_agent_segment_id: "sig_sci_fi_viewers", name: "Sci-Fi Viewers", category_type: "interest", estimated_audience_size: 9_600_000, coverage_percentage: 0.04, rules: [{ dimension: "content_genre", operator: "eq", value: "sci_fi" }], description: "science fiction sci-fi television viewers streamers" },
];

describeIfKey("parseNLQuery — real Claude API", () => {
  it("parses simple demographic query", async () => {
    const ast = await parseNLQuery("women aged 35 to 50 with children", { apiKey: API_KEY });
    expect(ast.root).toBeDefined();
    expect(ast.confidence).toBeGreaterThan(0);
    const leafs = getAllLeafs(ast.root);
    expect(leafs.length).toBeGreaterThan(0);
    // Should find age dimension
    expect(leafs.some(l => l.dimension === "age_band" || l.dimension === "household_type")).toBe(true);
  }, 10_000);

  it("parses negation correctly", async () => {
    const ast = await parseNLQuery("adults who don't drink coffee", { apiKey: API_KEY });
    expect(hasNotNode(ast.root)).toBe(true);
  }, 10_000);

  it("parses archetype", async () => {
    const ast = await parseNLQuery("soccer moms in the suburbs", { apiKey: API_KEY });
    const leafs = getAllLeafs(ast.root);
    expect(leafs.some(l => l.dimension === "archetype")).toBe(true);
  }, 10_000);

  it("parses temporal scope", async () => {
    const ast = await parseNLQuery("drama viewers in the afternoon", { apiKey: API_KEY });
    const leafs = getAllLeafs(ast.root);
    const temporal = leafs.find(l => l.temporal !== undefined);
    expect(temporal).toBeDefined();
    expect(temporal?.temporal?.daypart).toBe("afternoon");
  }, 10_000);

  it("parses the full soccer mom query", async () => {
    const ast = await parseNLQuery(
      "soccer moms who are 35+ and live in Nashville, don't like coffee but watch desperate housewives in the afternoon",
      { apiKey: API_KEY }
    );

    console.log("\n=== Full AST ===\n", JSON.stringify(ast, null, 2));

    const leafs = getAllLeafs(ast.root);
    // Should have: archetype, age or demographic, geo, NOT(interest), content_title or content_genre
    expect(leafs.length).toBeGreaterThanOrEqual(3);
    expect(hasNotNode(ast.root)).toBe(true);
    // Temporal on the content leaf
    const temporalLeafs = leafs.filter(l => l.temporal !== undefined);
    expect(temporalLeafs.length).toBeGreaterThan(0);
  }, 15_000);
});

describeIfKey("handleNLQuery — full pipeline E2E", () => {
  it("soccer mom query returns scored result", async () => {
    const resp = await handleNLQuery(
      { query: "soccer moms who are 35+ and live in Nashville, don't like coffee but watch desperate housewives in the afternoon", limit: 10 },
      MOCK_CATALOG,
      API_KEY
    );

    expect(resp.success).toBe(true);
    expect(resp.result).toBeDefined();

    const r = resp.result!;
    console.log("\n=== Full Pipeline Result ===");
    console.log("Query:", r.nl_query);
    console.log("Estimated size:", r.estimated_size.toLocaleString());
    console.log("Confidence:", r.confidence.toFixed(2), `(${r.confidence_tier})`);
    console.log("Matched:", r.matched_signals.map(s => `${s.name} [${s.match_score.toFixed(2)}]`).join(", "));
    console.log("Excluded:", r.exclude_signals.map(s => s.name).join(", "));
    console.log("Warnings:", r.warnings);
    console.log("Duration:", resp.duration_ms, "ms");

    expect(r.matched_signals.length).toBeGreaterThan(0);
    expect(r.exclude_signals.some(s => s.name.toLowerCase().includes("coffee"))).toBe(true);
    expect(r.estimated_size).toBeGreaterThan(0);
  }, 20_000);

  it("simple luxury query", async () => {
    const resp = await handleNLQuery(
      { query: "high-income households interested in luxury goods", limit: 5 },
      MOCK_CATALOG,
      API_KEY
    );
    expect(resp.success).toBe(true);
    expect(resp.result!.matched_signals.length).toBeGreaterThan(0);
  }, 15_000);

  it("rejects empty query", async () => {
    const resp = await handleNLQuery({ query: "" }, MOCK_CATALOG, API_KEY);
    expect(resp.success).toBe(false);
    expect(resp.error).toMatch(/required/i);
  }, 5_000);

  it("rejects oversized query", async () => {
    const resp = await handleNLQuery({ query: "x".repeat(2001) }, MOCK_CATALOG, API_KEY);
    expect(resp.success).toBe(false);
    expect(resp.error).toMatch(/2000/);
  }, 5_000);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAllLeafs(node: any): any[] {
  if (node.op === "LEAF") return [node];
  return (node.children ?? []).flatMap(getAllLeafs);
}

function hasNotNode(node: any): boolean {
  if (node.op === "NOT") return true;
  return (node.children ?? []).some(hasNotNode);
}
