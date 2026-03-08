/**
 * queryResolver.ts
 * AudienceQueryAST → ranked signal matches from the catalog.
 *
 * UCP v5.2 NLAQ §3.2 — Leaf Resolution Layer
 *
 * Each LEAF in the AST is resolved to one or more candidate signals using
 * a three-pass strategy:
 *
 *   Pass 1 — Exact rule match: if dimension+value maps directly to a signal's
 *             generation rule (age_band=35-44, content_genre=drama, etc.)
 *
 *   Pass 2 — Description similarity: cosine similarity between leaf description
 *             and signal name+description fields (TF-IDF / Jaccard fallback when
 *             no vector store is available — upgradeable to embedding in Phase 2b)
 *
 *   Pass 3 — Archetype expansion: archetype LEAFs are expanded into constituent
 *             dimensions and each re-resolved (recursive, depth-capped at 2)
 *
 * ARCHETYPE EXPANSION TABLE
 * Defined inline here for v5.2 reference implementation. Phase 3: move to
 * concept registry endpoint (/ucp/concepts) as described in spec §4.
 */

import type { AudienceQueryLeaf, AudienceQueryNode, AudienceQueryBranch, AudienceQueryAST } from "./queryParser.js";
import { flattenLeafs, extractExclusions } from "./queryParser.js";

// ─── Archetype Expansion Table ────────────────────────────────────────────────
// Each archetype maps to weighted constituent leaf nodes.
// concept_id anchors to the future IAB Tech Lab concept registry.

interface ArchetypeConstituent {
  dimension: AudienceQueryLeaf["dimension"];
  value: string;
  weight: number; // 0–1 relative importance for audience intersection math
  description: string;
}

const ARCHETYPE_TABLE: Record<string, { concept_id: string; constituents: ArchetypeConstituent[] }> = {
  soccer_mom: {
    concept_id: "SOCCER_MOM_US",
    constituents: [
      { dimension: "household_type", value: "family_with_kids", weight: 0.30, description: "household with school-age children" },
      { dimension: "age_band", value: "35-44", weight: 0.25, description: "adult female aged 35 to 44" },
      { dimension: "age_band", value: "45-54", weight: 0.15, description: "adult female aged 45 to 54" },
      { dimension: "metro_tier", value: "top_50", weight: 0.15, description: "suburban or mid-size metro resident" },
      { dimension: "streaming_affinity", value: "medium", weight: 0.15, description: "moderate streaming consumption" },
    ],
  },
  urban_professional: {
    concept_id: "URBAN_PROFESSIONAL_US",
    constituents: [
      { dimension: "age_band", value: "25-34", weight: 0.35, description: "young adult professional aged 25 to 34" },
      { dimension: "metro_tier", value: "top_10", weight: 0.30, description: "resident of top-10 US metro area" },
      { dimension: "education", value: "bachelors", weight: 0.20, description: "bachelor's degree holder" },
      { dimension: "income_band", value: "100k_150k", weight: 0.15, description: "household income 100K to 150K" },
    ],
  },
  affluent_family: {
    concept_id: "AFFLUENT_FAMILY_US",
    constituents: [
      { dimension: "household_type", value: "family_with_kids", weight: 0.35, description: "household with children" },
      { dimension: "income_band", value: "150k_plus", weight: 0.35, description: "high income household above 150K" },
      { dimension: "education", value: "graduate", weight: 0.30, description: "graduate degree holder" },
    ],
  },
};

// ─── Signal shape (minimal, matches catalog) ─────────────────────────────────

export interface CatalogSignal {
  signal_agent_segment_id: string;
  name: string;
  category_type: string;
  estimated_audience_size: number;
  coverage_percentage: number;
  /** Rules if available (from dynamic/derived signals) */
  rules?: Array<{ dimension: string; operator: string; value: string }>;
  /** Free-text description for similarity matching */
  description?: string;
  iab_taxonomy_ids?: string[];
}

// ─── Resolution result per leaf ───────────────────────────────────────────────

export interface LeafResolution {
  leaf: AudienceQueryLeaf;
  /** Matched signals ranked by match_score descending */
  matches: ResolvedSignal[];
  /** True if this leaf came from NOT node — signals go to exclude list */
  is_exclusion: boolean;
  /** Expanded archetype constituents (if applicable) */
  archetype_expansion?: AudienceQueryLeaf[];
}

export interface ResolvedSignal {
  signal: CatalogSignal;
  match_score: number; // 0–1
  match_method: "exact_rule" | "description_similarity" | "archetype_expansion" | "category_fallback";
  temporal_scope?: AudienceQueryLeaf["temporal"];
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export class QueryResolver {
  constructor(private readonly catalog: CatalogSignal[]) {}

  /**
   * Resolve all leaf nodes in the AST against the catalog.
   * Returns per-leaf resolution results. The compositeScorer then handles
   * set arithmetic across the AND/OR/NOT tree.
   */
  resolveAST(ast: AudienceQueryAST): LeafResolution[] {
    const exclusionLeafs = new Set(
      extractExclusions(ast.root).map((l) => JSON.stringify({ d: l.dimension, v: l.value }))
    );

    const allLeafs = flattenLeafs(ast.root);
    return allLeafs.map((leaf) => {
      const key = JSON.stringify({ d: leaf.dimension, v: leaf.value });
      return this.resolveLeaf(leaf, exclusionLeafs.has(key));
    });
  }

  resolveLeaf(leaf: AudienceQueryLeaf, is_exclusion: boolean): LeafResolution {
    // Archetype path — expand then resolve each constituent
    if (leaf.dimension === "archetype") {
      return this.resolveArchetype(leaf, is_exclusion);
    }

    const matches = this.scoreAgainstCatalog(leaf);
    return {
      leaf,
      matches: matches.slice(0, 5), // top-5 per leaf
      is_exclusion,
    };
  }

  private resolveArchetype(leaf: AudienceQueryLeaf, is_exclusion: boolean): LeafResolution {
    const key = normaliseArchetypeKey(leaf.value);
    const entry = ARCHETYPE_TABLE[key];

    if (!entry) {
      // Unknown archetype — fall back to description similarity
      return {
        leaf,
        matches: this.scoreAgainstCatalog(leaf).slice(0, 5),
        is_exclusion,
      };
    }

    // Expand into constituent pseudo-leafs and resolve each
    const expanded: AudienceQueryLeaf[] = entry.constituents.map((c) => ({
      op: "LEAF" as const,
      dimension: c.dimension,
      value: c.value,
      description: c.description,
      concept_id: entry.concept_id,
      confidence: leaf.confidence * c.weight,
    }));

    // Aggregate: each constituent produces matches; deduplicate and weight by constituent weight
    const scoreMap = new Map<string, { signal: CatalogSignal; score: number }>();
    for (const constituent of entry.constituents) {
      const pseudoLeaf: AudienceQueryLeaf = {
        op: "LEAF",
        dimension: constituent.dimension,
        value: constituent.value,
        description: constituent.description,
        confidence: constituent.weight,
      };
      const matches = this.scoreAgainstCatalog(pseudoLeaf);
      for (const m of matches) {
        const id = m.signal.signal_agent_segment_id;
        const existing = scoreMap.get(id);
        const weighted = m.match_score * constituent.weight;
        scoreMap.set(id, {
          signal: m.signal,
          score: (existing?.score ?? 0) + weighted,
        });
      }
    }

    const aggregated: ResolvedSignal[] = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((e) => ({
        signal: e.signal,
        match_score: Math.min(e.score, 1.0),
        match_method: "archetype_expansion",
      }));

    return {
      leaf,
      matches: aggregated,
      is_exclusion,
      archetype_expansion: expanded,
    };
  }

  private scoreAgainstCatalog(leaf: AudienceQueryLeaf): ResolvedSignal[] {
    const results: ResolvedSignal[] = [];

    for (const signal of this.catalog) {
      const score = this.scoreSignalForLeaf(signal, leaf);
      if (score > 0.1) {
        results.push({
          signal,
          match_score: score,
          match_method: score > 0.85 ? "exact_rule" : "description_similarity",
          temporal_scope: leaf.temporal,
        });
      }
    }

    return results.sort((a, b) => b.match_score - a.match_score);
  }

  private scoreSignalForLeaf(signal: CatalogSignal, leaf: AudienceQueryLeaf): number {
    let best = 0;

    // Pass 1: exact rule match
    if (signal.rules) {
      for (const rule of signal.rules) {
        if (rule.dimension === leaf.dimension && rule.value === leaf.value) {
          best = Math.max(best, 0.95 * leaf.confidence);
        }
      }
    }

    // Pass 1b: category-level match for content/geo
    if (leaf.dimension === "content_genre" && signal.category_type === "interest") {
      const nameMatch = tokenOverlap(signal.name.toLowerCase(), leaf.value.toLowerCase());
      best = Math.max(best, nameMatch * 0.8 * leaf.confidence);
    }
    if (leaf.dimension === "content_title") {
      if (signal.category_type === "interest") {
        const descMatch = tokenOverlap(
          (signal.description ?? signal.name).toLowerCase(),
          leaf.description.toLowerCase()
        );
        best = Math.max(best, descMatch * 0.75 * leaf.confidence);
      }
    }
    if (leaf.dimension === "geo") {
      if (signal.category_type === "geo") {
        const nameMatch = tokenOverlap(signal.name.toLowerCase(), leaf.description.toLowerCase());
        best = Math.max(best, nameMatch * 0.85 * leaf.confidence);
      }
    }

    // Pass 2: description similarity (token overlap as embedding proxy)
    const leafText = `${leaf.dimension} ${leaf.value} ${leaf.description}`.toLowerCase();
    const signalText = `${signal.name} ${signal.description ?? ""} ${signal.category_type}`.toLowerCase();
    const simScore = tokenOverlap(leafText, signalText);
    best = Math.max(best, simScore * 0.7 * leaf.confidence);

    // Pass 3: category bucket match for demographics
    if (
      leaf.dimension === "age_band" ||
      leaf.dimension === "income_band" ||
      leaf.dimension === "education" ||
      leaf.dimension === "household_type"
    ) {
      if (signal.category_type === "demographic") {
        const nameHit = signal.name.toLowerCase().includes(leaf.value.replace(/_/g, " "));
        if (nameHit) best = Math.max(best, 0.80 * leaf.confidence);
      }
    }

    return best;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Jaccard token overlap — cheap embedding proxy for Pass 2 */
function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(a.split(/\W+/).filter((t) => t.length > 2));
  const tokB = new Set(b.split(/\W+/).filter((t) => t.length > 2));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokA) if (tokB.has(t)) intersection++;
  const union = tokA.size + tokB.size - intersection;
  return intersection / union;
}

function normaliseArchetypeKey(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, "_");
}
