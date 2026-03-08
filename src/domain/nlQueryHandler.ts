/**
 * src/domain/nlQueryHandler.ts
 *
 * NLAQ route handler and MCP tool definition.
 *
 * Bridges:
 *   - new QueryResolver (returns ResolvedLeaf[] with flat LeafMatch[])
 *   - old CompositeScorer (expects Map<string, LeafResolution> with nested ResolvedSignal[])
 *
 * The adapter (adaptToLeafResolutions) converts between the two shapes
 * by looking up the full CatalogSignal for each matched signal ID.
 */

import { parseNLQuery } from './queryParser';
import { QueryResolver } from './queryResolver';
import { CompositeScorer, buildResolutionMap } from './compositeScorer';
import { createEmbeddingEngine, type EmbeddingEngineEnv } from '../ucp/embeddingEngine';
import type { CatalogSignal } from './queryResolver';
import type { LeafResolution, ResolvedSignal } from './queryResolver';

// ─── Request / Response types ─────────────────────────────────────────────────

export interface NLQueryRequest {
  query: string;
  limit?: number;
}

export interface NLQueryEnv extends EmbeddingEngineEnv {
  ANTHROPIC_API_KEY?: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handleNLQuery(
  body: NLQueryRequest,
  catalog: CatalogSignal[],
  env: NLQueryEnv,
): Promise<Response> {
  const start = Date.now();

  try {
    if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
      return jsonError('query is required', 400);
    }
    if (body.query.length > 2000) {
      return jsonError('query exceeds maximum length of 2000 characters', 400);
    }

    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);

    // ── Step 1: Parse ────────────────────────────────────────────────────────
    const anthropicKey = env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return jsonError('ANTHROPIC_API_KEY not configured', 500);
    }
    const ast = await parseNLQuery(body.query, { apiKey: anthropicKey });

    // ── Step 2: Engine — one instance per request ────────────────────────────
    const engine = createEmbeddingEngine(env);

    // ── Step 3: Resolve — AST leaves → ranked signal matches ────────────────
    const resolver = new QueryResolver(catalog, engine);
    const { resolvedLeaves, pseudoEmbeddingWarning } = await resolver.resolveAST(ast.root);

    // ── Step 4: Adapt new resolver output → old scorer input ─────────────────
    // QueryResolver returns ResolvedLeaf[] with flat LeafMatch[].
    // CompositeScorer expects Map<string, LeafResolution> with nested ResolvedSignal[]
    // that carry full CatalogSignal objects (needed for coverage_percentage, audience_size).
    const catalogById = new Map(catalog.map(s => [s.id, s]));
    const leafResolutions = adaptToLeafResolutions(resolvedLeaves, catalogById);
    const resolutionMap = buildResolutionMap(leafResolutions);

    // ── Step 5: Score — boolean set arithmetic → CompositeAudienceResult ─────
    const scorer = new CompositeScorer(resolutionMap);
    const result = scorer.score(ast, ast.unresolved_hints ?? []);

    // Slice matched_signals to requested limit
    result.matched_signals = result.matched_signals.slice(0, limit);

    // Surface pseudo embedding warning
    if (pseudoEmbeddingWarning) {
      result.warnings = result.warnings ?? [];
      result.warnings.push(
        'Semantic similarity used pseudo embedding vectors (adcp-bridge-space-v1.0). ' +
        'Results are structurally valid but embedding scores are not semantically meaningful. ' +
        'Set EMBEDDING_ENGINE=llm and OPENAI_API_KEY for real semantic matching.',
      );
    }

    // Transparency metadata
    (result as any)._embedding_mode = engine.phase;
    (result as any)._embedding_space = engine.spaceId;

    return json({ success: true, result, duration_ms: Date.now() - start });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: message, duration_ms: Date.now() - start }, 500);
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * adaptToLeafResolutions — converts ResolvedLeaf[] (new resolver shape) to
 * LeafResolution[] (old scorer shape).
 *
 * The old scorer needs ResolvedSignal objects that contain:
 *   - signal: full CatalogSignal (for coverage_percentage, estimated_audience_size)
 *   - match_score, match_method, is_exclusion, temporal_scope
 *
 * We look up the full CatalogSignal by ID from the catalog map.
 * If a signal ID is not found in the catalog (shouldn't happen), we build
 * a minimal stub so the scorer doesn't crash.
 */
function adaptToLeafResolutions(
  resolvedLeaves: import('./queryResolver').ResolvedLeaf[],
  catalogById: Map<string, CatalogSignal>,
): LeafResolution[] {
  return resolvedLeaves.map(rl => {
    const resolvedSignals: ResolvedSignal[] = rl.matches.map(match => {
      const catalogSignal = catalogById.get(match.signal_agent_segment_id);
      const signal = catalogSignal
        ? toCatalogSignalForScorer(catalogSignal)
        : stubSignal(match.signal_agent_segment_id, match.name);

      return {
        signal,
        match_score: match.match_score,
        match_method: match.match_method,
        is_exclusion: match.is_exclusion,
        temporal_scope: rl.leaf.temporal,
      };
    });

    return {
      leaf: rl.leaf,
      matches: resolvedSignals,
      is_exclusion: rl.leaf.is_exclusion ?? false,
    };
  });
}

/**
 * Convert CatalogSignal (domain shape) to the nested signal shape
 * that CompositeScorer expects inside ResolvedSignal.signal.
 */
function toCatalogSignalForScorer(s: CatalogSignal): ResolvedSignal['signal'] {
  return {
    signal_agent_segment_id: s.id,
    name: s.name,
    description: s.description ?? '',
    coverage_percentage: (s as any).coverage_percentage ?? defaultCoverage(s.id),
    estimated_audience_size: (s as any).estimated_size ?? Math.round(defaultCoverage(s.id) * 240_000_000),
    iab_taxonomy_ids: (s as any).taxonomy_id ? [(s as any).taxonomy_id] : [],
    category: s.category ?? 'unknown',
  };
}

function stubSignal(id: string, name: string): ResolvedSignal['signal'] {
  return {
    signal_agent_segment_id: id,
    name,
    description: '',
    coverage_percentage: 0.05,
    estimated_audience_size: 12_000_000,
    iab_taxonomy_ids: [],
    category: 'unknown',
  };
}

/**
 * Default coverage percentages for known signals when coverage_percentage
 * is not stored on the CatalogSignal (it may be on the full DB signal).
 * These match the values seeded in signalModel.ts.
 */
function defaultCoverage(signalId: string): number {
  const coverageMap: Record<string, number> = {
    sig_age_18_24:               0.12,
    sig_age_25_34:               0.17,
    sig_age_35_44:               0.17,
    sig_age_45_54:               0.16,
    sig_age_55_64:               0.14,
    sig_age_65_plus:             0.17,
    sig_high_income_households:  0.09,
    sig_upper_middle_income:     0.14,
    sig_middle_income_households:0.28,
    sig_college_educated_adults: 0.36,
    sig_graduate_educated_adults:0.14,
    sig_families_with_children:  0.29,
    sig_senior_households:       0.28,
    sig_urban_professionals:     0.08,
    sig_streaming_enthusiasts:   0.45,
    sig_drama_viewers:           0.22,
    sig_comedy_fans:             0.28,
    sig_action_movie_fans:       0.19,
    sig_documentary_viewers:     0.12,
    sig_sci_fi_enthusiasts:      0.11,
    sig_acs_affluent_college_educated: 0.08,
    sig_acs_graduate_high_income:      0.05,
    sig_acs_middle_income_families:    0.18,
    sig_acs_senior_households_income:  0.09,
    sig_acs_young_single_adults:       0.07,
  };
  return coverageMap[signalId] ?? 0.05;
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const QUERY_SIGNALS_NL_TOOL = {
  name: 'query_signals_nl',
  description:
    'Find audience signals matching a natural language description. ' +
    'Decomposes the query into a boolean AST (AND/OR/NOT), resolves each dimension ' +
    'against the signal catalog using hybrid rule+embedding+lexical matching, ' +
    'and returns ranked matches with a compositional audience size estimate. ' +
    'Use when the user describes a target audience in free-form language.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          "Natural language audience description. " +
          "Examples: 'soccer moms 35+ who stream heavily', " +
          "'urban professionals without children who watch sci-fi', " +
          "'affluent families 35-44 in top DMAs'.",
        maxLength: 2000,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of matched signals to return. Range 1–50.',
        minimum: 1,
        maximum: 50,
        default: 10,
      },
    },
    required: ['query'],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number): Response {
  return json({ success: false, error: message }, status);
}