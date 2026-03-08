/**
 * src/domain/nlQueryHandler.ts
 *
 * NLAQ route handler and MCP tool definition.
 *
 * Change from v1: createEmbeddingEngine(env) is called once per request and
 * injected into QueryResolver. This is the ONLY place the engine is instantiated
 * for a given NLAQ request — guaranteeing request-scoped, single-space semantics.
 *
 * Public contract unchanged:
 *   handleNLQuery(body, catalog, env) → NLQueryResponse
 *   route:  POST /signals/query
 *   shape:  { success, result, error, duration_ms }
 */

import { parseNLQuery } from './queryParser';
import { QueryResolver } from './queryResolver';
import { CompositeScorer } from './compositeScorer';
import { createEmbeddingEngine, type EmbeddingEngineEnv } from '../ucp/embeddingEngine';
import type { CatalogSignal } from './queryResolver';

// ─── Request / Response types ─────────────────────────────────────────────────

export interface NLQueryRequest {
  query: string;
  limit?: number;
}

// Full env shape expected from Cloudflare Worker env
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

    // ── Step 1: Parse — NL text → AudienceQueryAST via Claude ──────────────
    const anthropicKey = env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return jsonError('ANTHROPIC_API_KEY not configured', 500);
    }
    const ast = await parseNLQuery(body.query, anthropicKey);

    // ── Step 2: Engine selection — ONE instance per request ─────────────────
    //
    // createEmbeddingEngine inspects env.EMBEDDING_ENGINE + env.OPENAI_API_KEY.
    // The same instance is passed to QueryResolver so query vectors and candidate
    // vectors always use the same model/space. Never instantiate a second engine
    // in this request lifecycle.
    const engine = createEmbeddingEngine(env);

    // ── Step 3: Resolve — AST leaves → ranked signal matches ────────────────
    const resolver = new QueryResolver(catalog, engine);
    const { resolvedLeaves, pseudoEmbeddingWarning } = await resolver.resolveAST(ast);

    // ── Step 4: Score — boolean set arithmetic → CompositeAudienceResult ────
    const scorer = new CompositeScorer(resolvedLeaves, limit);
    const result = scorer.score(ast);

    // Append pseudo warning if embedding engine was in pseudo mode
    if (pseudoEmbeddingWarning) {
      result.warnings = result.warnings ?? [];
      result.warnings.push(
        'Semantic similarity used pseudo embedding vectors (adcp-bridge-space-v1.0). ' +
        'Results are structurally valid but embedding scores are not semantically meaningful. ' +
        'Set EMBEDDING_ENGINE=llm and OPENAI_API_KEY for real semantic matching.',
      );
    }

    // Append engine mode to response metadata for transparency
    result._embedding_mode = engine.phase;
    result._embedding_space = engine.spaceId;

    return json({ success: true, result, duration_ms: Date.now() - start });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      { success: false, error: message, duration_ms: Date.now() - start },
      500,
    );
  }
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number): Response {
  return json({ success: false, error: message }, status);
}
