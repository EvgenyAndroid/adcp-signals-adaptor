/**
 * nlQueryHandler.ts
 * Wires parseNLQuery → QueryResolver → CompositeScorer into a single
 * request handler used by both the REST route and the MCP tool.
 *
 * REST:  POST /signals/query
 * MCP:   tools/call → query_signals_nl
 *
 * Request body:
 * {
 *   "query": "soccer moms in Nashville who watch drama in the afternoon",
 *   "limit": 10         // optional, max matched_signals returned (default 10)
 * }
 *
 * Response: CompositeAudienceResult (see compositeScorer.ts)
 */

import { parseNLQuery } from "./queryParser.js";
import { QueryResolver } from "./queryResolver.js";
import { CompositeScorer, buildResolutionMap } from "./compositeScorer.js";
import type { CatalogSignal } from "./queryResolver.js";
import type { CompositeAudienceResult } from "./compositeScorer.js";

export interface NLQueryRequest {
  query: string;
  limit?: number;
}

export interface NLQueryResponse {
  success: boolean;
  result?: CompositeAudienceResult;
  error?: string;
  /** Total wall-clock time in milliseconds */
  duration_ms?: number;
}

/**
 * Main handler — call from your Worker route or MCP tool dispatcher.
 *
 * @param req          Parsed request body
 * @param catalog      Signals loaded from D1 / signalModel (pass all available)
 * @param anthropicKey Anthropic API key from env (ANTHROPIC_API_KEY binding)
 */
export async function handleNLQuery(
  req: NLQueryRequest,
  catalog: CatalogSignal[],
  anthropicKey?: string
): Promise<NLQueryResponse> {
  const start = Date.now();

  if (!req.query?.trim()) {
    return { success: false, error: "query is required" };
  }
  if (req.query.length > 2000) {
    return { success: false, error: "query exceeds 2000 character limit" };
  }

  try {
    // Step 1: NL → AST
    const ast = await parseNLQuery(req.query, { apiKey: anthropicKey });

    // Step 2: resolve each leaf against catalog
    const resolver = new QueryResolver(catalog);
    const resolutions = resolver.resolveAST(ast);

    // Step 3: composite scoring
    const resMap = buildResolutionMap(resolutions);
    const scorer = new CompositeScorer(resMap);
    let result = scorer.score(ast, ast.unresolved_hints);

    // Apply limit
    const limit = Math.min(Math.max(req.limit ?? 10, 1), 50);
    result = {
      ...result,
      matched_signals: result.matched_signals.slice(0, limit),
    };

    return { success: true, result, duration_ms: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
      duration_ms: Date.now() - start,
    };
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────
// Add this to your tools.ts alongside the existing tool definitions.

export const QUERY_SIGNALS_NL_TOOL = {
  name: "query_signals_nl",
  description:
    "Find audience signals matching a natural language description. " +
    "Supports complex compositional queries with boolean logic (AND/OR/NOT), " +
    "archetypes (e.g. 'soccer moms'), negation ('don't like coffee'), " +
    "geo specificity, temporal context ('afternoon viewers'), and content affinity. " +
    "Returns ranked matching signals with estimated audience size and activation payloads.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language audience description. Examples: " +
          "'women 35+ in Nashville who watch drama in the afternoon', " +
          "'high-income households interested in luxury goods but not coffee', " +
          "'urban professionals aged 25-34 who stream sci-fi'",
      },
      limit: {
        type: "number",
        description: "Maximum number of matched signals to return (1–50, default 10)",
      },
    },
    required: ["query"],
  },
} as const;

// ─── Route fragment for src/index.ts ─────────────────────────────────────────
// Drop this into your fetch() handler after your existing /signals/generate route:
//
//   if (pathname === "/signals/query" && request.method === "POST") {
//     const body = await request.json() as NLQueryRequest;
//     const catalog = await getAllSignals(env);          // your existing catalog loader
//     const resp = await handleNLQuery(body, catalog, env.ANTHROPIC_API_KEY);
//     return new Response(JSON.stringify(resp), {
//       status: resp.success ? 200 : 400,
//       headers: { "Content-Type": "application/json", ...corsHeaders },
//     });
//   }
//
// In mcp/server.ts, add to your tools/call handler:
//   case "query_signals_nl": {
//     const body = params.arguments as NLQueryRequest;
//     const catalog = await getAllSignals(env);
//     const resp = await handleNLQuery(body, catalog, env.ANTHROPIC_API_KEY);
//     return mcpResult(resp);
//   }
