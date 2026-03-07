// src/mcp/tools.ts
// MCP tool definitions — 4 tools matching the AdCP Signals protocol.
// Parameter names match the canonical AdCP spec:
//   get_signals:    signal_spec (brief), deliver_to (required), max_results, filters, pagination
//   activate_signal: signal_agent_segment_id, deliver_to (required), webhook_url
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
];

export function getToolByName(name: string): McpToolDefinition | undefined {
  return ADCP_TOOLS.find((t) => t.name === name);
}