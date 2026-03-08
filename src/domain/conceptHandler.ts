/**
 * conceptHandler.ts
 * HTTP + MCP handlers for the Concept-Level VAC registry.
 * UCP v5.2 §4.3
 *
 * Routes (add to src/index.ts):
 *
 *   GET  /ucp/concepts                  — list all (paginated, filterable by category)
 *   GET  /ucp/concepts/:concept_id      — get single concept
 *   GET  /ucp/concepts?q=soccer+mom     — semantic search
 *   GET  /ucp/concepts?category=archetype
 *   POST /ucp/concepts/seed             — (re)seed KV from in-memory registry (auth required)
 *
 * MCP tool: get_concept  (add to tools.ts)
 * MCP tool: search_concepts
 */

import {
  getConceptById,
  searchConcepts,
  getConceptsByCategory,
  seedConceptsToKV,
  CONCEPT_REGISTRY,
} from "./conceptRegistry.js";
import type { ConceptEntry } from "./conceptRegistry.js";

// ─── Env interface (matches wrangler.toml bindings) ──────────────────────────

interface Env {
  SIGNALS_CACHE: KVNamespace;
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * Main dispatcher. Call from your fetch() handler:
 *
 *   if (pathname.startsWith("/ucp/concepts")) {
 *     return handleConceptRoute(request, env, pathname);
 *   }
 */
export async function handleConceptRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const url = new URL(request.url);

  // POST /ucp/concepts/seed — re-seed KV (auth required)
  if (pathname === "/ucp/concepts/seed" && request.method === "POST") {
    const auth = request.headers.get("Authorization");
    if (auth !== "Bearer demo-key-adcp-signals-v1") {
      return json({ error: "Unauthorized" }, 401);
    }
    const count = await seedConceptsToKV(env.SIGNALS_CACHE);
    return json({ seeded: count, message: `${count} concepts written to KV` });
  }

  // GET /ucp/concepts/:concept_id
  const idMatch = pathname.match(/^\/ucp\/concepts\/([A-Z0-9_]+)$/);
  if (idMatch && request.method === "GET") {
    const concept_id = idMatch[1];
    const entry = getConceptById(concept_id);
    if (!entry) {
      return json({ error: `Concept '${concept_id}' not found` }, 404);
    }
    return json(entry);
  }

  // GET /ucp/concepts — list / search / filter
  if (pathname === "/ucp/concepts" && request.method === "GET") {
    const q = url.searchParams.get("q");
    const category = url.searchParams.get("category") as ConceptEntry["category"] | null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    let results: ConceptEntry[];

    if (q) {
      results = searchConcepts(q, limit + offset);
    } else if (category) {
      const valid = ["demographic", "interest", "behavioral", "geo", "archetype", "content", "purchase_intent"];
      if (!valid.includes(category)) {
        return json({ error: `Invalid category. Must be one of: ${valid.join(", ")}` }, 400);
      }
      results = getConceptsByCategory(category);
    } else {
      results = [...CONCEPT_REGISTRY];
    }

    const page = results.slice(offset, offset + limit);

    return json({
      concepts: page,
      total: results.length,
      limit,
      offset,
      has_more: offset + limit < results.length,
      registry_version: "ucp-concept-registry-v1.0",
      concept_count: CONCEPT_REGISTRY.length,
    });
  }

  return json({ error: "Not found" }, 404);
}

// ─── MCP tool definitions ─────────────────────────────────────────────────────
// Add these to your tools array in src/mcp/tools.ts

export const CONCEPT_MCP_TOOLS = [
  {
    name: "get_concept",
    description:
      "Look up a specific concept from the UCP Concept-Level VAC registry by concept_id. " +
      "Returns the concept definition including label, description, constituent dimensions, " +
      "and cross-taxonomy member nodes showing how it maps to IAB, LiveRamp, TradeDesk, etc.",
    inputSchema: {
      type: "object",
      properties: {
        concept_id: {
          type: "string",
          description:
            "Concept registry ID. Examples: HIGH_INCOME_HOUSEHOLD_US, SOCCER_MOM_US, DRAMA_VIEWER_US, NASHVILLE_DMA_US",
        },
      },
      required: ["concept_id"],
    },
  },
  {
    name: "search_concepts",
    description:
      "Semantic search over the UCP Concept Registry. " +
      "Find concepts matching a natural language description. " +
      "Use this to discover concept_ids for use in audience queries, " +
      "or to explore what cross-taxonomy mappings exist for a given audience type. " +
      "Optionally filter by category: demographic, interest, behavioral, geo, archetype, content, purchase_intent.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query. Examples: 'soccer mom', 'high income', 'afternoon drama viewer'",
        },
        category: {
          type: "string",
          enum: ["demographic", "interest", "behavioral", "geo", "archetype", "content", "purchase_intent"],
          description: "Optional category filter",
        },
        limit: {
          type: "number",
          description: "Max results (1–50, default 10)",
        },
      },
      required: ["q"],
    },
  },
] as const;

// ─── MCP tool call handler ────────────────────────────────────────────────────
// Add these cases to your tools/call switch in src/mcp/server.ts

export function handleConceptToolCall(
  name: string,
  args: Record<string, unknown>
): unknown {
  if (name === "get_concept") {
    const concept_id = String(args.concept_id ?? "");
    const entry = getConceptById(concept_id);
    if (!entry) {
      return { error: `Concept '${concept_id}' not found`, available_count: CONCEPT_REGISTRY.length };
    }
    return entry;
  }

  if (name === "search_concepts") {
    const q = String(args.q ?? "");
    const limit = Math.min(Number(args.limit ?? 10), 50);
    const category = args.category as ConceptEntry["category"] | undefined;

    let results = searchConcepts(q, limit);
    if (category) {
      results = results.filter((c) => c.category === category);
    }

    return {
      query: q,
      results,
      count: results.length,
      total_in_registry: CONCEPT_REGISTRY.length,
    };
  }

  return { error: `Unknown concept tool: ${name}` };
}

// ─── Capability declaration fragment ─────────────────────────────────────────
// Merge this into your capabilityService.ts getCapabilities() response:
//
// "ucp": {
//   "space_id": "adcp-bridge-space-v1.0",
//   "nl_query": { "supported": true },
//   "concept_registry": {
//     "supported": true,
//     "endpoint": "/ucp/concepts",
//     "concept_count": 19,
//     "registry_version": "ucp-concept-registry-v1.0",
//     "categories": ["demographic","interest","behavioral","geo","archetype","content","purchase_intent"]
//   }
// }
