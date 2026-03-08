/**
 * src/domain/queryResolver.ts
 *
 * Hybrid three-pass NLAQ leaf resolver.
 *
 * Pass 1 — Exact rule match (deterministic, zero latency, no embeddings)
 * Pass 2 — Embedding similarity via SemanticResolver (semantic, engine-scoped)
 * Pass 3 — Lexical fallback (Jaccard token overlap, only when Pass 2 is unavailable)
 *
 * Archetype expansion runs as a pre-processing step: archetype leafs are expanded
 * into constituent dimension leaves (from ARCHETYPE_TABLE), each resolved independently
 * through the same three-pass pipeline, then aggregated by weighted average.
 *
 * Request-scoped engine: the EmbeddingEngine instance is injected at construction time
 * and used for ALL leaf resolutions in that request. This guarantees that query vectors
 * and candidate vectors come from the same space. Never mix pseudo↔llm within one request.
 *
 * Public surface unchanged from v1:
 *   new QueryResolver(catalog, engine).resolveAST(ast) → ResolvedAST
 * The engine parameter is optional; when omitted the resolver uses lexical-only mode
 * (backward-compatible with callers that don't pass an engine).
 */

import type { AudienceQueryAST, AudienceQueryLeaf, AudienceQueryBranch } from './queryParser';
import type { EmbeddingEngine } from '../ucp/embeddingEngine';
import { SemanticResolver, buildSignalSemanticText, type CatalogSignalForSemantic } from './semanticResolver';

// ─── Public types ─────────────────────────────────────────────────────────────

export type MatchMethod =
  | 'exact_rule'
  | 'embedding_similarity'
  | 'lexical_fallback'
  | 'archetype_expansion'
  | 'title_genre_inference'
  | 'category_fallback';

export interface LeafMatch {
  signal_agent_segment_id: string;
  name: string;
  match_score: number;
  match_method: MatchMethod;
  is_exclusion: boolean;
  concept_id?: string;
}

export interface ResolvedLeaf {
  leaf: AudienceQueryLeaf;
  matches: LeafMatch[];
  unresolved: boolean;
}

export interface ResolvedAST {
  resolvedLeaves: ResolvedLeaf[];
  /** true if at least one Pass 2 embedding comparison used pseudo vectors (not semantically valid) */
  pseudoEmbeddingWarning: boolean;
}

// ─── Catalog signal shape (what QueryResolver expects from signalService) ─────

export interface CatalogSignal extends CatalogSignalForSemantic {
  estimated_size?: number;
  coverage_percentage?: number;
}

// ─── Dimension rule map (Pass 1) ──────────────────────────────────────────────

/**
 * inferRulesFromSignalId — maps actual D1 signal IDs → {dimension, value} pairs.
 * Used for Pass 1 exact rule matching.
 */
export function inferRulesFromSignalId(signalId: string): { dimension: string; value: string } | null {
  const map: Record<string, { dimension: string; value: string }> = {
    sig_age_18_24:              { dimension: 'age_band',           value: '18-24' },
    sig_age_25_34:              { dimension: 'age_band',           value: '25-34' },
    sig_age_35_44:              { dimension: 'age_band',           value: '35-44' },
    sig_age_45_54:              { dimension: 'age_band',           value: '45-54' },
    sig_age_55_64:              { dimension: 'age_band',           value: '55-64' },
    sig_age_65_plus:            { dimension: 'age_band',           value: '65+' },
    sig_high_income_households: { dimension: 'income_band',        value: '150k+' },
    sig_upper_middle_income:    { dimension: 'income_band',        value: '100k-150k' },
    sig_middle_income_households:{ dimension: 'income_band',       value: '50k-100k' },
    sig_college_educated_adults:{ dimension: 'education',          value: 'college' },
    sig_graduate_educated_adults:{ dimension: 'education',         value: 'graduate' },
    sig_families_with_children: { dimension: 'household_type',     value: 'family_with_kids' },
    sig_senior_households:      { dimension: 'household_type',     value: 'senior' },
    sig_urban_professionals:    { dimension: 'household_type',     value: 'urban_professional' },
    sig_streaming_enthusiasts:  { dimension: 'streaming_affinity', value: 'high' },
    sig_drama_viewers:          { dimension: 'content_genre',      value: 'drama' },
    sig_comedy_fans:            { dimension: 'content_genre',      value: 'comedy' },
    sig_action_movie_fans:      { dimension: 'content_genre',      value: 'action' },
    sig_documentary_viewers:    { dimension: 'content_genre',      value: 'documentary' },
    sig_sci_fi_enthusiasts:     { dimension: 'content_genre',      value: 'sci_fi' },
  };
  return map[signalId] ?? null;
}

// ─── Title → Genre map (Pass 2 title_genre_inference) ────────────────────────

const TITLE_GENRE_MAP: Record<string, string> = {
  desperate_housewives:   'drama',
  grey_s_anatomy:         'drama',
  greys_anatomy:          'drama',
  the_crown:              'drama',
  succession:             'drama',
  breaking_bad:           'drama',
  better_call_saul:       'drama',
  mad_men:                'drama',
  downton_abbey:          'drama',
  the_office:             'comedy',
  friends:                'comedy',
  seinfeld:               'comedy',
  parks_and_recreation:   'comedy',
  brooklyn_nine_nine:     'comedy',
  star_wars:              'sci_fi',
  the_mandalorian:        'sci_fi',
  stranger_things:        'sci_fi',
  the_expanse:            'sci_fi',
  black_mirror:           'sci_fi',
  planet_earth:           'documentary',
  march_of_the_penguins:  'documentary',
  free_solo:              'documentary',
  the_last_dance:         'documentary',
  avengers:               'action',
  john_wick:              'action',
  mission_impossible:     'action',
};

function normalizeTitleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Archetype table ─────────────────────────────────────────────────────────

interface ArchetypeConstituent {
  dimension: string;
  value: string;
  weight: number;
}

const ARCHETYPE_TABLE: Record<string, ArchetypeConstituent[]> = {
  soccer_mom: [
    { dimension: 'age_band',           value: '35-44',          weight: 0.35 },
    { dimension: 'household_type',     value: 'family_with_kids',weight: 0.40 },
    { dimension: 'income_band',        value: '50k-100k',        weight: 0.15 },
    { dimension: 'interest',           value: 'youth_sports',    weight: 0.10 },
  ],
  urban_professional: [
    { dimension: 'education',          value: 'college',         weight: 0.30 },
    { dimension: 'household_type',     value: 'urban_professional',weight: 0.35 },
    { dimension: 'income_band',        value: '100k+',           weight: 0.35 },
  ],
  affluent_family: [
    { dimension: 'income_band',        value: '150k+',           weight: 0.40 },
    { dimension: 'household_type',     value: 'family_with_kids',weight: 0.35 },
    { dimension: 'education',          value: 'graduate',        weight: 0.25 },
  ],
  affluent_families: [
    { dimension: 'income_band',        value: '150k+',           weight: 0.40 },
    { dimension: 'household_type',     value: 'family_with_kids',weight: 0.35 },
    { dimension: 'education',          value: 'graduate',        weight: 0.25 },
  ],
};

// ─── Jaccard lexical fallback (Pass 3) ───────────────────────────────────────

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2),
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ─── QueryResolver ────────────────────────────────────────────────────────────

export class QueryResolver {
  private readonly semantic: SemanticResolver | null;
  private pseudoWarning = false;

  /**
   * @param catalog      All catalog signals from signalService.getAllSignalsForCatalog()
   * @param engine       Optional EmbeddingEngine injected by nlQueryHandler.
   *                     When provided, Pass 2 uses embedding cosine similarity.
   *                     When omitted, Pass 2 skips and falls through to Pass 3 (lexical).
   */
  constructor(
    private readonly catalog: CatalogSignal[],
    private readonly engine?: EmbeddingEngine,
  ) {
    if (engine) {
      this.semantic = new SemanticResolver(engine, { topN: 5, minScore: 0.0 });
    } else {
      this.semantic = null;
    }
  }

  // ── Public entry point ──────────────────────────────────────────────────────

  async resolveAST(ast: AudienceQueryAST): Promise<ResolvedAST> {
    this.pseudoWarning = false;
    const resolvedLeaves: ResolvedLeaf[] = [];
    await this.walkNode(ast, resolvedLeaves);
    return {
      resolvedLeaves,
      pseudoEmbeddingWarning: this.pseudoWarning,
    };
  }

  // ── Tree walk ───────────────────────────────────────────────────────────────

  private async walkNode(
    node: AudienceQueryAST,
    out: ResolvedLeaf[],
  ): Promise<void> {
    if (node.op === 'LEAF') {
      const resolved = await this.resolveLeaf(node as AudienceQueryLeaf);
      out.push(resolved);
      return;
    }
    const branch = node as AudienceQueryBranch;
    for (const child of branch.children) {
      await this.walkNode(child, out);
    }
  }

  // ── Leaf dispatch ───────────────────────────────────────────────────────────

  private async resolveLeaf(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    // Archetype dimension: expand then aggregate
    if (leaf.dimension === 'archetype') {
      return this.resolveArchetype(leaf);
    }

    // content_title: TITLE_GENRE_MAP → treat as content_genre leaf
    if (leaf.dimension === 'content_title') {
      return this.resolveContentTitle(leaf);
    }

    return this.resolveDimensionLeaf(leaf);
  }

  // ── Pass 1: Exact rule match ────────────────────────────────────────────────

  private pass1ExactRule(leaf: AudienceQueryLeaf): LeafMatch[] {
    const matches: LeafMatch[] = [];
    for (const signal of this.catalog) {
      const rule = inferRulesFromSignalId(signal.id);
      if (!rule) continue;
      if (rule.dimension === leaf.dimension && rule.value === leaf.value) {
        matches.push({
          signal_agent_segment_id: signal.id,
          name: signal.name,
          match_score: 0.95,
          match_method: 'exact_rule',
          is_exclusion: leaf.is_exclusion ?? false,
          concept_id: leaf.concept_id,
        });
      }
    }
    return matches;
  }

  // ── Pass 2: Embedding similarity ───────────────────────────────────────────

  private async pass2Embedding(leaf: AudienceQueryLeaf): Promise<LeafMatch[]> {
    if (!this.semantic) return [];

    // Track if pseudo engine is in use — signals semantically invalid comparison
    if (this.engine?.phase === 'pseudo-v1') {
      this.pseudoWarning = true;
    }

    try {
      const results = await this.semantic.resolve(leaf, this.catalog);
      return results
        .filter(r => r.score > 0.3) // minimum meaningful cosine for llm; pseudo will be noisy
        .map(r => ({
          signal_agent_segment_id: r.signalId,
          name: r.signalName,
          match_score: r.score,
          match_method: 'embedding_similarity' as MatchMethod,
          is_exclusion: leaf.is_exclusion ?? false,
          concept_id: leaf.concept_id,
        }));
    } catch {
      // embedding API unavailable — fall through to Pass 3
      return [];
    }
  }

  // ── Pass 3: Lexical fallback ────────────────────────────────────────────────

  private pass3Lexical(leaf: AudienceQueryLeaf): LeafMatch[] {
    const query = [leaf.description, leaf.value, leaf.dimension].filter(Boolean).join(' ');
    const scored = this.catalog.map(signal => {
      const candidateText = buildSignalSemanticText(signal);
      const score = jaccardSimilarity(query, candidateText);
      return { signal, score };
    });

    return scored
      .filter(({ score }) => score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ signal, score }) => ({
        signal_agent_segment_id: signal.id,
        name: signal.name,
        match_score: Math.min(score * 1.5, 0.75), // scale Jaccard up; cap below exact_rule
        match_method: 'lexical_fallback' as MatchMethod,
        is_exclusion: leaf.is_exclusion ?? false,
        concept_id: leaf.concept_id,
      }));
  }

  // ── Three-pass pipeline for a single dimension leaf ─────────────────────────

  private async resolveDimensionLeaf(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    // Pass 1 — exact rule
    const pass1 = this.pass1ExactRule(leaf);
    if (pass1.length > 0) {
      return { leaf, matches: pass1, unresolved: false };
    }

    // Pass 2 — embedding similarity (only if engine available)
    const pass2 = await this.pass2Embedding(leaf);
    if (pass2.length > 0) {
      return { leaf, matches: pass2, unresolved: false };
    }

    // Pass 3 — lexical fallback
    const pass3 = this.pass3Lexical(leaf);
    if (pass3.length > 0) {
      return { leaf, matches: pass3, unresolved: false };
    }

    // Unresolved — no catalog signal matches
    return { leaf, matches: [], unresolved: true };
  }

  // ── Content title resolution ─────────────────────────────────────────────────

  private async resolveContentTitle(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    const key = normalizeTitleKey(leaf.value);
    const genre = TITLE_GENRE_MAP[key];

    if (genre) {
      // Synthesize a genre leaf and run through the full three-pass pipeline
      const genreLeaf: AudienceQueryLeaf = {
        ...leaf,
        dimension: 'content_genre',
        value: genre,
        description: `${genre} content viewers — inferred from title: ${leaf.value}`,
      };
      const resolved = await this.resolveDimensionLeaf(genreLeaf);
      // Relabel match_method so the caller knows title inference was used
      return {
        leaf,
        unresolved: resolved.unresolved,
        matches: resolved.matches.map(m => ({
          ...m,
          match_method: 'title_genre_inference' as MatchMethod,
          match_score: m.match_score * 0.90, // slight discount for indirect inference
        })),
      };
    }

    // No title mapping — fall through to regular dimension resolver
    // (embedding may still find something based on leaf.description)
    return this.resolveDimensionLeaf(leaf);
  }

  // ── Archetype expansion ──────────────────────────────────────────────────────

  /**
   * Archetype expansion runs the three-pass pipeline on each constituent dimension
   * independently, then aggregates results by weighted average.
   *
   * Key invariants (per spec §3.2.3):
   *   - constituent weight is applied ONCE (no double-weight)
   *   - constituent pseudo-leaf confidence is set to 1.0 before weighting
   *   - unresolved constituents reduce the composite score but don't veto it
   */
  private async resolveArchetype(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    const key = leaf.value.toLowerCase().replace(/\s+/g, '_');
    const constituents = ARCHETYPE_TABLE[key];

    if (!constituents) {
      // Unknown archetype — fall back to embedding/lexical on the archetype description
      const fallback = await this.resolveDimensionLeaf(leaf);
      return {
        leaf,
        unresolved: fallback.unresolved,
        matches: fallback.matches.map(m => ({
          ...m,
          match_method: 'archetype_expansion' as MatchMethod,
        })),
      };
    }

    // Resolve each constituent independently
    const constituentResults = await Promise.all(
      constituents.map(async c => {
        const pseudoLeaf: AudienceQueryLeaf = {
          op: 'LEAF',
          dimension: c.dimension as AudienceQueryLeaf['dimension'],
          value: c.value,
          description: `${c.dimension}: ${c.value} (constituent of archetype ${leaf.value})`,
          confidence: 1.0, // spec: confidence=1.0 before weighting
          is_exclusion: leaf.is_exclusion ?? false,
        };
        const resolved = await this.resolveDimensionLeaf(pseudoLeaf);
        return { resolved, weight: c.weight };
      }),
    );

    // Aggregate: weighted average of top match score per constituent
    // Weight is applied exactly once here (never in resolveDimensionLeaf)
    const aggregated = new Map<string, { score: number; name: string; count: number }>();

    for (const { resolved, weight } of constituentResults) {
      const top = resolved.matches[0];
      if (!top) continue;

      const weightedScore = top.match_score * weight; // weight applied ONCE
      const existing = aggregated.get(top.signal_agent_segment_id);
      if (existing) {
        existing.score += weightedScore;
        existing.count++;
      } else {
        aggregated.set(top.signal_agent_segment_id, {
          score: weightedScore,
          name: top.name,
          count: 1,
        });
      }
    }

    const matches: LeafMatch[] = Array.from(aggregated.entries())
      .map(([id, { score, name }]) => ({
        signal_agent_segment_id: id,
        name,
        match_score: Math.min(score, 1.0),
        match_method: 'archetype_expansion' as MatchMethod,
        is_exclusion: leaf.is_exclusion ?? false,
        concept_id: leaf.concept_id,
      }))
      .sort((a, b) => b.match_score - a.match_score);

    return {
      leaf,
      matches,
      unresolved: matches.length === 0,
    };
  }
}
