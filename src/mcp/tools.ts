// src/mcp/tools.ts
// MCP tool definitions — 4 tools matching the AdCP Signals protocol.
// generate_custom_signal removed: proposals are surfaced in get_signals via brief parameter.
// activate_signal creates custom segments lazily if a proposal ID is passed.
//
// @adcp/client SDK reference:
//   SIGNALS_TOOLS = ['get_signals', 'activate_signal']  — core protocol tools
//   ADCP_STATUS   — canonical status constants

// SDK-defined core signal tools (subset — we also implement get_adcp_capabilities + get_operation_status)
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
      "Discover audience signals from this AdCP provider. " +
      "Pass a natural language 'brief' to get AI-generated custom segment proposals alongside catalog signals. " +
      "Proposals have signal_type='custom' and is_live=false — activate them to create and deploy. " +
      "Also supports keyword search and structured filters. " +
      "Returns catalog signals (marketplace) and any custom proposals matching the brief.",
    inputSchema: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description:
            "Natural language targeting brief. Generates custom segment proposals inline with catalog results. " +
            "Example: 'affluent parents in top metros interested in streaming', " +
            "'college-educated sci-fi fans aged 25-34', 'high income couples no kids'.",
        },
        query: {
          type: "string",
          description: "Keyword search across signal names and descriptions.",
        },
        categoryType: {
          type: "string",
          enum: ["demographic", "interest", "purchase_intent", "geo", "composite"],
          description: "Filter by signal category type.",
        },
        generationMode: {
          type: "string",
          enum: ["seeded", "derived", "dynamic"],
          description: "Filter by generation mode.",
        },
        destination: {
          type: "string",
          enum: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
          description: "Filter signals available for a specific destination.",
        },
        destinations: {
          type: "array",
          description: "Filter by deployment platforms.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["platform", "agent"] },
              platform: { type: "string" },
            },
            required: ["type"],
          },
        },
        taxonomyId: {
          type: "string",
          description: "Filter by IAB Audience Taxonomy 1.1 node ID.",
        },
        limit: {
          type: "number",
          description: "Max signals to return. Default 20, max 100.",
        },
        offset: {
          type: "number",
          description: "Pagination offset. Default 0.",
        },
      },
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
        destinations: {
          type: "array",
          description: "The platforms to activate the signal on.",
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
        accountId: {
          type: "string",
          description: "Optional account or seat ID on the destination platform.",
        },
        notes: {
          type: "string",
          description: "Optional notes about this activation.",
        },
      },
      required: ["signal_agent_segment_id", "destinations"],
    },
  },

  {
    name: "get_operation_status",
    description:
      "Poll the status of an async activation task. " +
      "Returns current status: pending → processing → completed (or failed). " +
      "On completion, includes the activated deployments with activation keys. " +
      "Use the task_id returned by activate_signal.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID returned by activate_signal. Format: 'op_{timestamp}_{hex}'",
        },
      },
      required: ["task_id"],
    },
  },
];

export function getToolByName(name: string): McpToolDefinition | undefined {
  return ADCP_TOOLS.find((t) => t.name === name);
}
