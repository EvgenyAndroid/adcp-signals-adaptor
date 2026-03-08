/**
 * compositeScorer.ts
 * Traverses AudienceQueryAST + LeafResolution[] → CompositeAudienceResult.
 *
 * UCP v5.2 NLAQ §3.3 — Compositional Scoring Engine
 *
 * Implements set arithmetic over resolved signal audiences:
 *   AND  → probabilistic intersection (independence assumption + overlap factor)
 *   OR   → union with deduplication
 *   NOT  → subtraction + uncertainty penalty (negation always adds noise)
 *
 * Audience size model:
 *   Baseline: 240M US adults
 *   Each signal carries coverage_percentage (0–1) relative to baseline.
 *   Intersection: product of coverage percentages × overlap_factor (0.7 default,
 *   reflecting real-world correlation between demographic co-targeting).
 *   Floor: 50K households (below this → "narrow" confidence tier).
 */

import type { AudienceQueryNode, AudienceQueryLeaf, AudienceQueryBranch, AudienceQueryAST } from "./queryParser.js";
import type { LeafResolution, ResolvedSignal, CatalogSignal } from "./queryResolver.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const US_ADULT_BASELINE = 240_000_000;
const AUDIENCE_FLOOR = 50_000;
const DEFAULT_OVERLAP_FACTOR = 0.70; // correlation discount for AND intersections
const NEGATION_UNCERTAINTY = 0.80;   // negation degrades confidence by 20%

// ─── Result types ─────────────────────────────────────────────────────────────

export type ConfidenceTier = "high" | "medium" | "low" | "narrow";

export interface AudienceNode {
  /** Best-matched signals contributing to this node */
  signals: ResolvedSignal[];
  /** Estimated addressable audience size */
  estimated_size: number;
  /** 0–1 confidence in the estimate */
  confidence: number;
  /** Signals to exclude at activation layer */
  exclude_signals?: ResolvedSignal[];
}

export interface CompositeAudienceResult {
  nl_query: string;
  estimated_size: number;
  confidence: number;
  confidence_tier: ConfidenceTier;
  /** Top signals to activate for this audience (positive, deduped, ranked) */
  matched_signals: RankedSignal[];
  /** Signals to exclude at activation (from NOT nodes) */
  exclude_signals: RankedSignal[];
  /** Per-dimension breakdown for transparency */
  dimension_breakdown: DimensionBreakdown[];
  /** Warnings — unresolved hints, narrow audience, low confidence leaves */
  warnings: string[];
  /** Cross-taxonomy entries (Phase 2b: populated when concept registry is live) */
  cross_taxonomy: CrossTaxonomyEntry[];
}

export interface RankedSignal {
  signal_agent_segment_id: string;
  name: string;
  match_score: number;
  match_method: string;
  estimated_audience_size: number;
  coverage_percentage: number;
  temporal_scope?: AudienceQueryLeaf["temporal"];
  concept_id?: string;
}

export interface DimensionBreakdown {
  dimension: string;
  value: string;
  is_exclusion: boolean;
  top_match: string | null;
  match_score: number;
  estimated_size: number;
}

export interface CrossTaxonomyEntry {
  vendor: string;
  node_id: string;
  similarity: number;
  source: "concept_registry" | "embedding_inference" | "placeholder";
}

// ─── Scorer ───────────────────────────────────────────────────────────────────

export class CompositeScorer {
  constructor(private readonly resolutions: Map<string, LeafResolution>) {}

  /**
   * Primary entry point.
   * Walks the AST, scores each node, and assembles the final result.
   */
  score(ast: AudienceQueryAST, unresolved_hints: string[]): CompositeAudienceResult {
    const node = this.scoreNode(ast.root);
    const warnings: string[] = [...unresolved_hints.map((h) => `Unresolved: "${h}"`)];

    if (node.estimated_size < AUDIENCE_FLOOR) {
      warnings.push(
        `Estimated audience (${node.estimated_size.toLocaleString()}) below 50K floor — results are indicative only.`
      );
    }
    if (node.confidence < 0.5) {
      warnings.push("Low overall confidence — query contains ambiguous or unsupported dimensions.");
    }

    const tier = this.confidenceTier(node.estimated_size, node.confidence);

    // Deduplicate and rank positive signals
    const signalMap = new Map<string, RankedSignal>();
    for (const rs of node.signals) {
      const id = rs.signal.signal_agent_segment_id;
      const existing = signalMap.get(id);
      if (!existing || rs.match_score > existing.match_score) {
        signalMap.set(id, toRankedSignal(rs));
      }
    }

    // Exclude signals from NOT nodes
    const excludeMap = new Map<string, RankedSignal>();
    for (const rs of node.exclude_signals ?? []) {
      const id = rs.signal.signal_agent_segment_id;
      excludeMap.set(id, toRankedSignal(rs));
    }

    // Remove any exclude_ids from positive set
    for (const id of excludeMap.keys()) signalMap.delete(id);

    const matched_signals = Array.from(signalMap.values()).sort(
      (a, b) => b.match_score - a.match_score
    );

    const dimension_breakdown = this.buildBreakdown();

    // Placeholder cross_taxonomy entries — populated in Phase 2b when concept registry is live
    const cross_taxonomy: CrossTaxonomyEntry[] = matched_signals
      .filter((s) => s.concept_id)
      .map((s) => ({
        vendor: "iab",
        node_id: s.concept_id!,
        similarity: 1.0,
        source: "placeholder" as const,
      }));

    return {
      nl_query: ast.nl_query,
      estimated_size: Math.max(node.estimated_size, AUDIENCE_FLOOR),
      confidence: node.confidence,
      confidence_tier: tier,
      matched_signals,
      exclude_signals: Array.from(excludeMap.values()),
      dimension_breakdown,
      warnings,
      cross_taxonomy,
    };
  }

  // ─── AST node scoring ───────────────────────────────────────────────────────

  private scoreNode(node: AudienceQueryNode): AudienceNode {
    if (node.op === "LEAF") return this.scoreLeaf(node as AudienceQueryLeaf);
    const branch = node as AudienceQueryBranch;
    switch (branch.op) {
      case "AND": return this.scoreAND(branch);
      case "OR":  return this.scoreOR(branch);
      case "NOT": return this.scoreNOT(branch);
    }
  }

  private scoreLeaf(leaf: AudienceQueryLeaf): AudienceNode {
    const key = leafKey(leaf);
    const resolution = this.resolutions.get(key);
    if (!resolution || resolution.matches.length === 0) {
      return emptyNode(leaf.confidence * 0.3);
    }

    const topMatch = resolution.matches[0];
    const size = Math.round(topMatch.signal.coverage_percentage * US_ADULT_BASELINE);
    return {
      signals: resolution.matches,
      estimated_size: size,
      // When a catalog match exists, don't let the LLM's self-assessed leaf.confidence
      // (often low for archetypes like "soccer_mom") collapse the node below 0.5.
      // The catalog match itself is the evidence — use it as a floor.
      confidence: Math.max(topMatch.match_score * leaf.confidence, topMatch.match_score * 0.55),
      exclude_signals: [],
    };
  }

  private scoreAND(branch: AudienceQueryBranch): AudienceNode {
    const children = branch.children.map((c) => this.scoreNode(c));
    if (children.length === 0) return emptyNode(1);

    // Split into resolved children (have catalog matches) vs unresolved (nothing found).
    // Unresolved leaves — "Nashville", "desperate_housewives", "coffee" when those signals
    // don't exist in the catalog — must NOT collapse confidence via Math.min to near-zero.
    // They are noted via unresolvedPenalty below but excluded from size/confidence math.
    const resolved   = children.filter(c => c.signals.length > 0 || (c.exclude_signals?.length ?? 0) > 0);
    const unresolved = children.filter(c => c.signals.length === 0 && (c.exclude_signals?.length ?? 0) === 0);
    const workingSet = resolved.length > 0 ? resolved : children;

    // Probabilistic intersection: ∏(coverage_i) × baseline × overlap_factor^(n-1)
    let coverageProduct = 1.0;
    let minConfidence = 1.0;
    const allSignals: ResolvedSignal[] = [];
    const allExcludes: ResolvedSignal[] = [];

    for (const child of workingSet) {
      const childCoverage = child.estimated_size / US_ADULT_BASELINE;
      coverageProduct *= childCoverage;
      minConfidence = Math.min(minConfidence, child.confidence);
      allSignals.push(...child.signals);
      allExcludes.push(...(child.exclude_signals ?? []));
    }

    // Apply overlap discount for n > 1 resolved dimensions
    const n = workingSet.length;
    const overlapFactor = Math.pow(DEFAULT_OVERLAP_FACTOR, n - 1);
    const estimatedSize = Math.round(coverageProduct * US_ADULT_BASELINE * overlapFactor);

    // Penalise confidence proportionally for unresolved leaves — each one
    // represents a dimension we couldn't satisfy from the catalog.
    const unresolvedPenalty = Math.pow(0.85, unresolved.length);

    return {
      signals: allSignals,
      estimated_size: Math.max(estimatedSize, AUDIENCE_FLOOR),
      confidence: minConfidence * unresolvedPenalty,
      exclude_signals: allExcludes,
    };
  }

  private scoreOR(branch: AudienceQueryBranch): AudienceNode {
    const children = branch.children.map((c) => this.scoreNode(c));
    if (children.length === 0) return emptyNode(1);

    // Union with expected overlap removal: |A ∪ B| = |A| + |B| - |A ∩ B|
    let unionSize = 0;
    let maxConfidence = 0;
    const allSignals: ResolvedSignal[] = [];

    for (const child of children) {
      const childCoverage = child.estimated_size / US_ADULT_BASELINE;
      const expectedOverlap = (unionSize / US_ADULT_BASELINE) * childCoverage * US_ADULT_BASELINE;
      unionSize = unionSize + child.estimated_size - expectedOverlap;
      maxConfidence = Math.max(maxConfidence, child.confidence);
      allSignals.push(...child.signals);
    }

    return {
      signals: allSignals,
      estimated_size: Math.min(Math.round(unionSize), US_ADULT_BASELINE),
      confidence: maxConfidence,
      exclude_signals: [],
    };
  }

  private scoreNOT(branch: AudienceQueryBranch): AudienceNode {
    // NOT nodes flip the match into exclude_signals; we score the child
    // but return it in exclude_signals rather than signals.
    const child = this.scoreNode(branch.children[0]);
    const invertedSize = US_ADULT_BASELINE - child.estimated_size;
    return {
      signals: [],
      exclude_signals: child.signals,
      estimated_size: Math.max(invertedSize, AUDIENCE_FLOOR),
      confidence: child.confidence * NEGATION_UNCERTAINTY,
    };
  }

  // ─── Dimension breakdown ────────────────────────────────────────────────────

  private buildBreakdown(): DimensionBreakdown[] {
    return Array.from(this.resolutions.values()).map((res) => {
      const topMatch = res.matches[0] ?? null;
      return {
        dimension: res.leaf.dimension,
        value: res.leaf.value,
        is_exclusion: res.is_exclusion,
        top_match: topMatch?.signal.name ?? null,
        match_score: topMatch?.match_score ?? 0,
        estimated_size: topMatch
          ? Math.round(topMatch.signal.coverage_percentage * US_ADULT_BASELINE)
          : 0,
      };
    });
  }

  private confidenceTier(size: number, confidence: number): ConfidenceTier {
    if (size < AUDIENCE_FLOOR || confidence < 0.4) return "narrow";
    if (confidence >= 0.75 && size >= 1_000_000) return "high";
    if (confidence >= 0.55) return "medium";
    return "low";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function leafKey(leaf: AudienceQueryLeaf): string {
  return `${leaf.dimension}::${leaf.value}`;
}

function emptyNode(confidence: number): AudienceNode {
  return { signals: [], estimated_size: AUDIENCE_FLOOR, confidence, exclude_signals: [] };
}

function toRankedSignal(rs: ResolvedSignal): RankedSignal {
  return {
    signal_agent_segment_id: rs.signal.signal_agent_segment_id,
    name: rs.signal.name,
    match_score: rs.match_score,
    match_method: rs.match_method,
    estimated_audience_size: rs.signal.estimated_audience_size,
    coverage_percentage: rs.signal.coverage_percentage,
    temporal_scope: rs.temporal_scope,
    concept_id: rs.signal.iab_taxonomy_ids?.[0],
  };
}

/**
 * Convenience: build the resolution map from LeafResolution[] for the scorer.
 */
export function buildResolutionMap(resolutions: LeafResolution[]): Map<string, LeafResolution> {
  const map = new Map<string, LeafResolution>();
  for (const r of resolutions) {
    const key = `${r.leaf.dimension}::${r.leaf.value}`;
    // Keep highest-confidence resolution if same key appears twice (archetype expansion)
    const existing = map.get(key);
    if (!existing || r.matches[0]?.match_score > (existing.matches[0]?.match_score ?? 0)) {
      map.set(key, r);
    }
  }
  return map;
}