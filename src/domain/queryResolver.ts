/**
 * src/domain/queryResolver.ts
 *
 * Hybrid three-pass NLAQ leaf resolver.
 *
 * Pass 1 — Exact rule match (deterministic, zero latency, no embeddings)
 * Pass 2 — Embedding similarity via SemanticResolver (semantic, engine-scoped)
 * Pass 3 — Lexical fallback (Jaccard token overlap, only when Pass 2 unavailable)
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
import {
  SemanticResolver,
  buildSignalSemanticText,
  type CatalogSignalForSemantic,
} from './semanticResolver';

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
  /** true if at least one Pass 2 embedding comparison used pseudo vectors */
  pseudoEmbeddingWarning: boolean;
}

// ─── Catalog signal shape ─────────────────────────────────────────────────────

export interface CatalogSignal extends CatalogSignalForSemantic {
  estimated_size?: number;
  coverage_percentage?: number;
}

// ─── Helpers — get the stable signal ID regardless of field name ──────────────

function getSignalId(signal: CatalogSignal): string {
  return signal.id ?? (signal as any).signal_agent_segment_id ?? '';
}

function getSignalName(signal: CatalogSignal): string {
  return signal.name ?? (signal as any).signal_name ?? '';
}

// ─── Dimension rule map (Pass 1) ──────────────────────────────────────────────

/**
 * inferRulesFromSignalId — maps actual D1 signal IDs → {dimension, value} pairs.
 * Used for Pass 1 exact rule matching.
 * Includes common value aliases to handle variation in Claude's output
 * (e.g. "150k+" vs "150k_plus", "50k-100k" vs "50k_100k").
 */
export function inferRulesFromSignalId(
  signalId: string,
): { dimension: string; value: string } | null {
  const map: Record<string, { dimension: string; value: string }> = {
    sig_age_18_24:               { dimension: 'age_band',           value: '18-24' },
    sig_age_25_34:               { dimension: 'age_band',           value: '25-34' },
    sig_age_35_44:               { dimension: 'age_band',           value: '35-44' },
    sig_age_45_54:               { dimension: 'age_band',           value: '45-54' },
    sig_age_55_64:               { dimension: 'age_band',           value: '55-64' },
    sig_age_65_plus:             { dimension: 'age_band',           value: '65+' },
    sig_high_income_households:  { dimension: 'income_band',        value: '150k+' },
    sig_upper_middle_income:     { dimension: 'income_band',        value: '100k-150k' },
    sig_middle_income_households:{ dimension: 'income_band',        value: '50k-100k' },
    sig_college_educated_adults: { dimension: 'education',          value: 'college' },
    sig_graduate_educated_adults:{ dimension: 'education',          value: 'graduate' },
    sig_families_with_children:  { dimension: 'household_type',     value: 'family_with_kids' },
    sig_senior_households:       { dimension: 'household_type',     value: 'senior' },
    sig_urban_professionals:     { dimension: 'household_type',     value: 'urban_professional' },
    sig_streaming_enthusiasts:   { dimension: 'streaming_affinity', value: 'high' },
    sig_drama_viewers:           { dimension: 'content_genre',      value: 'drama' },
    sig_comedy_fans:             { dimension: 'content_genre',      value: 'comedy' },
    sig_action_movie_fans:       { dimension: 'content_genre',      value: 'action' },
    sig_documentary_viewers:     { dimension: 'content_genre',      value: 'documentary' },
    sig_sci_fi_enthusiasts:      { dimension: 'content_genre',      value: 'sci_fi' },
  };
  return map[signalId] ?? null;
}

/**
 * normalizeValue — canonicalize dimension values for fuzzy comparison.
 * Handles common variations in Claude output:
 *   "150k+" → "150k_plus"
 *   "50k-100k" → "50k_100k"
 */
function normalizeValue(v: string): string {
  return v
    .toLowerCase()
    .replace(/\+/g, '_plus')
    .replace(/[-\s]/g, '_')
    .replace(/__+/g, '_');
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
    { dimension: 'age_band',           value: '35-44',            weight: 0.35 },
    { dimension: 'household_type',     value: 'family_with_kids', weight: 0.40 },
    { dimension: 'income_band',        value: '50k-100k',         weight: 0.15 },
    { dimension: 'interest',           value: 'youth_sports',     weight: 0.10 },
  ],
  urban_professional: [
    { dimension: 'education',          value: 'college',          weight: 0.30 },
    { dimension: 'household_type',     value: 'urban_professional',weight: 0.35 },
    { dimension: 'income_band',        value: '100k-150k',        weight: 0.35 },
  ],
  affluent_family: [
    { dimension: 'income_band',        value: '150k+',            weight: 0.40 },
    { dimension: 'household_type',     value: 'family_with_kids', weight: 0.35 },
    { dimension: 'education',          value: 'graduate',         weight: 0.25 },
  ],
  affluent_families: [
    { dimension: 'income_band',        value: '150k+',            weight: 0.40 },
    { dimension: 'household_type',     value: 'family_with_kids', weight: 0.35 },
    { dimension: 'education',          value: 'graduate',         weight: 0.25 },
  ],
  cord_cutter: [
    { dimension: 'streaming_affinity', value: 'high',             weight: 0.60 },
    { dimension: 'age_band',           value: '25-34',            weight: 0.25 },
    { dimension: 'income_band',        value: '50k-100k',         weight: 0.15 },
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

// ─── Embedding similarity threshold ──────────────────────────────────────────

/**
 * MIN_EMBEDDING_SCORE — minimum cosine similarity for Pass 2 to accept a match.
 *
 * Set to 0.45 for LLM embeddings (openai-te3-small-d512-v1).
 * Below this threshold the semantic match is too weak to be trusted — e.g.
 * "coffee" returning "College Educated Heavy Streamers" at 0.30 is noise,
 * not a real semantic match. At < 0.45 we fall through to Pass 3 or unresolved.
 *
 * For pseudo embeddings the threshold is effectively moot since pseudo cosine
 * is not semantically meaningful regardless — pseudoEmbeddingWarning is set instead.
 */
const MIN_EMBEDDING_SCORE = 0.45;

// ─── QueryResolver ────────────────────────────────────────────────────────────

export class QueryResolver {
  private readonly semantic: SemanticResolver | null;
  private pseudoWarning = false;

  /**
   * @param catalog  All catalog signals from signalService.getAllSignalsForCatalog()
   * @param engine   Optional EmbeddingEngine injected by nlQueryHandler.
   *                 When provided, Pass 2 uses embedding cosine similarity.
   *                 When omitted, Pass 2 is skipped (lexical-only mode).
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

  async resolveAST(
    ast: AudienceQueryAST | AudienceQueryLeaf | AudienceQueryBranch,
  ): Promise<ResolvedAST> {
    this.pseudoWarning = false;
    const resolvedLeaves: ResolvedLeaf[] = [];
    // Handle both full AST wrapper and bare node
    const root = (ast as any).root ?? ast;
    await this.walkNode(root, resolvedLeaves);
    return {
      resolvedLeaves,
      pseudoEmbeddingWarning: this.pseudoWarning,
    };
  }

  // ── Tree walk ───────────────────────────────────────────────────────────────

  private async walkNode(
    node: AudienceQueryLeaf | AudienceQueryBranch,
    out: ResolvedLeaf[],
  ): Promise<void> {
    if (node.op === 'LEAF') {
      const resolved = await this.resolveLeaf(node as AudienceQueryLeaf);
      out.push(resolved);
      return;
    }
    const branch = node as AudienceQueryBranch;
    for (const child of branch.children) {
      await this.walkNode(child as any, out);
    }
  }

  // ── Leaf dispatch ───────────────────────────────────────────────────────────

  private async resolveLeaf(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    if (leaf.dimension === 'archetype') {
      return this.resolveArchetype(leaf);
    }
    if (leaf.dimension === 'content_title') {
      return this.resolveContentTitle(leaf);
    }
    return this.resolveDimensionLeaf(leaf);
  }

  // ── Pass 1: Exact rule match ────────────────────────────────────────────────

  private pass1ExactRule(leaf: AudienceQueryLeaf): LeafMatch[] {
    const matches: LeafMatch[] = [];
    const normalizedLeafValue = normalizeValue(leaf.value);

    for (const signal of this.catalog) {
      const signalId = getSignalId(signal);
      if (!signalId) continue;

      const rule = inferRulesFromSignalId(signalId);
      if (!rule) continue;

      if (
        rule.dimension === leaf.dimension &&
        (rule.value === leaf.value || normalizeValue(rule.value) === normalizedLeafValue)
      ) {
        matches.push({
          signal_agent_segment_id: signalId,
          name: getSignalName(signal),
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

    if (this.engine?.phase === 'pseudo-v1') {
      this.pseudoWarning = true;
    }

    try {
      const results = await this.semantic.resolve(leaf, this.catalog);
      return results
        // MIN_EMBEDDING_SCORE = 0.45: prevents weak semantic matches (e.g. "coffee" →
        // "College Educated Heavy Streamers" at 0.30) from polluting results.
        // Signals below this threshold are better handled as unresolved than as
        // misleading low-confidence matches.
        .filter(r => r.score >= MIN_EMBEDDING_SCORE)
        .map(r => ({
          signal_agent_segment_id: r.signalId,
          name: r.signalName,
          match_score: r.score,
          match_method: 'embedding_similarity' as MatchMethod,
          is_exclusion: leaf.is_exclusion ?? false,
          concept_id: leaf.concept_id,
        }));
    } catch {
      // Embedding API unavailable — fall through to Pass 3
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
        signal_agent_segment_id: getSignalId(signal),
        name: getSignalName(signal),
        match_score: Math.min(score * 1.5, 0.75),
        match_method: 'lexical_fallback' as MatchMethod,
        is_exclusion: leaf.is_exclusion ?? false,
        concept_id: leaf.concept_id,
      }));
  }

  // ── Three-pass pipeline for a single dimension leaf ─────────────────────────

  private async resolveDimensionLeaf(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    const pass1 = this.pass1ExactRule(leaf);
    if (pass1.length > 0) {
      return { leaf, matches: pass1, unresolved: false };
    }

    const pass2 = await this.pass2Embedding(leaf);
    if (pass2.length > 0) {
      return { leaf, matches: pass2, unresolved: false };
    }

    const pass3 = this.pass3Lexical(leaf);
    if (pass3.length > 0) {
      return { leaf, matches: pass3, unresolved: false };
    }

    return { leaf, matches: [], unresolved: true };
  }

  // ── Content title resolution ─────────────────────────────────────────────────

  private async resolveContentTitle(leaf: AudienceQueryLeaf): Promise<ResolvedLeaf> {
    const key = normalizeTitleKey(leaf.value);
    const genre = TITLE_GENRE_MAP[key];

    if (genre) {
      const genreLeaf: AudienceQueryLeaf = {
        ...leaf,
        dimension: 'content_genre',
        value: genre,
        description: `${genre} content viewers — inferred from title: ${leaf.value}`,
      };
      const resolved = await this.resolveDimensionLeaf(genreLeaf);
      return {
        leaf,
        unresolved: resolved.unresolved,
        matches: resolved.matches.map(m => ({
          ...m,
          match_method: 'title_genre_inference' as MatchMethod,
          match_score: m.match_score * 0.90,
        })),
      };
    }

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
          confidence: 1.0,
          is_exclusion: leaf.is_exclusion ?? false,
        };
        const resolved = await this.resolveDimensionLeaf(pseudoLeaf);
        return { resolved, weight: c.weight };
      }),
    );

    // Aggregate: weighted average of top match score per constituent
    // Weight is applied exactly ONCE here — never in resolveDimensionLeaf
    const aggregated = new Map<string, { score: number; name: string }>();

    for (const { resolved, weight } of constituentResults) {
      const top = resolved.matches[0];
      if (!top) continue;

      const weightedScore = top.match_score * weight; // weight applied ONCE
      const existing = aggregated.get(top.signal_agent_segment_id);
      if (existing) {
        existing.score += weightedScore;
      } else {
        aggregated.set(top.signal_agent_segment_id, {
          score: weightedScore,
          name: top.name,
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