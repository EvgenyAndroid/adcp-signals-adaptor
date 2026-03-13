// src/mcp/tools.ts
// MCP tool definitions — 8 tools matching the AdCP Signals protocol v2.6 + UCP extensions.
// Parameter names match the canonical AdCP spec.
//
// @adcp/client SDK reference:
//   SIGNALS_TOOLS = ['get_signals', 'activate_signal']
//   ADCP_STATUS   — canonical status constants

export const ADCP_SIGNALS_CORE_TOOLS = ['get_signals', 'activate_signal'] as const;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const ADCP_TOOLS: McpToolDefinition[] = [
  // ── Core AdCP tools ─────────────────────────────────────────────────────────

  {
    name: "get_adcp_capabilities",
    description:
      "Returns the capabilities of this AdCP Signals Provider: supported operations, " +
      "signal categories, available destinations, activation mode, and limits. " +
      "Call this first to understand what the provider supports before searching or activating signals.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "get_signals",
    description:
      "Discover and propose audience signals from this AdCP provider. " +
      "Pass a natural language signal_spec to get AI-generated custom segment proposals " +
      "alongside catalog signals. Proposals have signal_type='custom' and is_live=false — " +
      "activate them to create and deploy. " +
      "deliver_to is required: specifies target deployments and countries.",
    inputSchema: {
      type: "object",
      properties: {
        signal_spec: {
          type: "string",
          description:
            "Natural language targeting brief or signal specification. " +
            "Generates custom segment proposals inline with catalog results. " +
            "Examples: 'high income households interested in luxury goods', " +
            "'college-educated sci-fi fans aged 25-34', 'affluent cord cutters in top metros'.",
        },
        signal_ids: {
          type: "array",
          description: "Retrieve specific signals by ID instead of searching.",
          items: { type: "string" },
        },
        deliver_to: {
          type: "object",
          description: "Required. Specifies where signals should be delivered.",
          properties: {
            deployments: {
              type: "array",
              description: "Target deployment platforms.",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["platform", "agent"] },
                  platform: {
                    type: "string",
                    enum: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
                  },
                  account_id: { type: "string" },
                },
                required: ["type"],
              },
            },
            countries: {
              type: "array",
              description: "ISO country codes. Example: ['US']",
              items: { type: "string" },
            },
          },
          required: ["deployments", "countries"],
        },
        filters: {
          type: "object",
          description: "Optional structured filters.",
          properties: {
            category_type: {
              type: "string",
              enum: ["demographic", "interest", "purchase_intent", "geo", "composite"],
              description: "Filter by signal category type.",
            },
            generation_mode: {
              type: "string",
              enum: ["seeded", "derived", "dynamic"],
              description: "Filter by generation mode.",
            },
            taxonomy_id: {
              type: "string",
              description: "Filter by IAB Audience Taxonomy 1.1 node ID.",
            },
            query: {
              type: "string",
              description: "Keyword search across signal names and descriptions.",
            },
          },
        },
        max_results: {
          type: "number",
          description: "Maximum number of signals to return. Default 20, max 100.",
        },
        pagination: {
          type: "object",
          description: "Pagination parameters.",
          properties: {
            offset: { type: "number", description: "Pagination offset. Default 0." },
            cursor: { type: "string", description: "Pagination cursor." },
          },
        },
      },
      required: ["signal_spec", "deliver_to"],
    },
  },

  {
    name: "activate_signal",
    description:
      "Activate an audience signal to a destination platform. " +
      "Returns task_id immediately with status 'pending' — this is an async operation. " +
      "Poll get_operation_status with task_id to check progress. " +
      "Optionally provide webhook_url to receive a POST callback on completion. " +
      "If activating a custom proposal from get_signals (is_live=false), the segment is created on activation.",
    inputSchema: {
      type: "object",
      properties: {
        signal_agent_segment_id: {
          type: "string",
          description:
            "The signal to activate. From get_signals catalog or proposals array. " +
            "Example: 'sig_high_income_households'",
        },
        deliver_to: {
          type: "object",
          description: "Required. Specifies where to activate the signal.",
          properties: {
            deployments: {
              type: "array",
              description: "Target deployment platforms.",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["platform", "agent"] },
                  platform: {
                    type: "string",
                    enum: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
                  },
                  account_id: { type: "string", description: "Platform account/seat ID." },
                },
                required: ["type"],
              },
            },
            countries: {
              type: "array",
              description: "ISO country codes. Example: ['US']",
              items: { type: "string" },
            },
          },
          required: ["deployments", "countries"],
        },
        webhook_url: {
          type: "string",
          description:
            "Optional URL to receive a POST callback when activation completes. " +
            "Payload: { task_id, status, signal_agent_segment_id, deployments }",
        },
        pricing_option_id: {
          type: "string",
          description: "Pricing option to use, from the signal's pricing_options array.",
        },
        notes: {
          type: "string",
          description: "Optional notes about this activation.",
        },
      },
      required: ["signal_agent_segment_id", "deliver_to"],
    },
  },

  {
    name: "get_operation_status",
    description:
      "Poll the status of an async activation task. " +
      "Returns current status: pending → working → completed (or failed). " +
      "On completion, includes the activated deployments with activation keys. " +
      "Use the task_id returned by activate_signal.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID returned by activate_signal. Format: 'op_{timestamp}_{nanoid}'",
        },
      },
      required: ["task_id"],
    },
  },

  {
    name: "get_similar_signals",
    description:
      "Find audience signals semantically similar to a reference signal using UCP embedding cosine similarity. " +
      "Returns ranked signals with similarity scores. " +
      "Demonstrates UCP vector search vs keyword search — related signals cluster by taxonomy, category, and data source quality.",
    inputSchema: {
      type: "object",
      properties: {
        signal_agent_segment_id: {
          type: "string",
          description: "Reference signal ID. Similar signals will be ranked by cosine similarity to this signal.",
        },
        top_k: {
          type: "number",
          description: "Number of similar signals to return. Default 5, max 20.",
        },
        min_similarity: {
          type: "number",
          description: "Minimum cosine similarity threshold (0–1). Default 0.7.",
        },
        deliver_to: {
          type: "object",
          description: "Required. Specifies target deployments and countries.",
          properties: {
            deployments: { type: "array", items: { type: "object" } },
            countries: { type: "array", items: { type: "string" } },
          },
          required: ["deployments", "countries"],
        },
      },
      required: ["signal_agent_segment_id", "deliver_to"],
    },
  },

  // ── UCP extension tools ──────────────────────────────────────────────────────

  {
    name: "query_signals_nl",
    description:
      "Find audience signals matching a natural language description. " +
      "Decomposes the query into a boolean AST (AND/OR/NOT), resolves each dimension " +
      "against the signal catalog using hybrid rule+embedding+lexical matching, " +
      "and returns ranked matches with a compositional audience size estimate. " +
      "Use when the user describes a target audience in free-form language.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language audience description. " +
            "Examples: 'soccer moms 35+ who stream heavily', " +
            "'urban professionals without children who watch sci-fi', " +
            "'affluent families 35-44 in top DMAs'.",
          maxLength: 2000,
        },
        limit: {
          type: "number",
          description: "Maximum number of matched signals to return. Range 1–50. Default 10.",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["query"],
    },
  },

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
];

export function getToolByName(name: string): McpToolDefinition | undefined {
  return ADCP_TOOLS.find((t) => t.name === name);
}
