// src/mcp/tools.ts
// MCP tool definitions - schema + descriptions.
// These are the contracts exposed to AI agents via the MCP protocol.

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
      "Search and discover available audience signals from this AdCP provider. " +
      "Signals are IAB Audience Taxonomy 1.1 aligned and include demographics, interests, " +
      "purchase intent, geo, and composite segments. " +
      "Supports filtering by category, keyword, generation mode, destination, and taxonomy ID. " +
      "Returns signal metadata including estimated audience size, CPM pricing, and activation status.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keyword search across signal names and descriptions. " +
            "Examples: 'sci-fi', 'high income', 'streaming', 'urban'",
        },
        categoryType: {
          type: "string",
          enum: ["demographic", "interest", "purchase_intent", "geo", "composite"],
          description: "Filter by signal category type.",
        },
        generationMode: {
          type: "string",
          enum: ["seeded", "derived", "dynamic"],
          description:
            "Filter by how the signal was created. " +
            "'seeded' = static catalog, 'derived' = pre-built combinations, 'dynamic' = AI-generated.",
        },
        destination: {
          type: "string",
          enum: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
          description: "Filter signals available for a specific destination platform.",
        },
        taxonomyId: {
          type: "string",
          description: "Filter by IAB Audience Taxonomy 1.1 node ID (e.g. '104' for Sci-Fi).",
        },
        limit: {
          type: "number",
          description: "Maximum number of signals to return. Default 20, max 100.",
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
      "Activate an audience signal to a destination platform for use in ad campaigns. " +
      "Submits an async activation job and returns an operation ID for status tracking. " +
      "The signal must exist and have activationSupported=true. " +
      "Use get_signals first to find a valid signalId.",
    inputSchema: {
      type: "object",
      properties: {
        signal_agent_segment_id: {
          type: "string",
          description:
            "The signal to activate. Use the signal_agent_segment_id returned by get_signals. " +
            "Example: 'sig_high_income_households'",
        },
        deployments: {
          type: "array",
          description: "The platforms to activate the signal on.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["platform", "agent"],
                description: "Deployment type.",
              },
              platform: {
                type: "string",
                enum: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
                description: "Platform ID (when type is platform).",
              },
            },
            required: ["type", "platform"],
          },
        },
        accountId: {
          type: "string",
          description: "Optional account or seat ID on the destination platform.",
        },
        campaignId: {
          type: "string",
          description: "Optional campaign ID to associate this activation with.",
        },
        notes: {
          type: "string",
          description: "Optional notes about this activation.",
        },
      },
      required: ["signal_agent_segment_id", "deployments"],
    },
  },

  {
    name: "generate_custom_signal",
    description:
      "Dynamically generate a new composite audience signal by combining targeting rules. " +
      "Supports up to 6 rules across dimensions like age, income, education, household type, " +
      "metro tier, content genre, and streaming affinity. " +
      "Returns a new signal with an estimated audience size and IAB taxonomy mapping. " +
      "The generated signal is persisted and can be immediately activated. " +
      "Example use: 'Create a segment of high-income sci-fi fans in top metros aged 25-34'.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Human-readable name for the segment. " +
            "If omitted, a name is auto-generated from the rules.",
        },
        description: {
          type: "string",
          description: "Optional description of the segment's intent.",
        },
        rules: {
          type: "array",
          description: "Array of targeting rules (2-6 recommended for meaningful segments).",
          items: {
            type: "object",
            properties: {
              dimension: {
                type: "string",
                enum: [
                  "age_band",
                  "income_band",
                  "education",
                  "household_type",
                  "metro_tier",
                  "content_genre",
                  "streaming_affinity",
                ],
                description: "The targeting dimension.",
              },
              operator: {
                type: "string",
                enum: ["eq", "in"],
                description: "'eq' for single value match, 'in' for multiple values.",
              },
              value: {
                description:
                  "The value(s) to match. " +
                  "age_band: '18-24','25-34','35-44','45-54','55-64','65+'. " +
                  "income_band: 'under_50k','50k_100k','100k_150k','150k_plus'. " +
                  "education: 'high_school','some_college','bachelors','graduate'. " +
                  "household_type: 'single','couple_no_kids','family_with_kids','senior_household'. " +
                  "metro_tier: 'top_10','top_25','top_50','other'. " +
                  "content_genre: 'action','sci_fi','drama','comedy','documentary','thriller','animation','romance'. " +
                  "streaming_affinity: 'high','medium','low'.",
              },
            },
            required: ["dimension", "operator", "value"],
          },
          minItems: 1,
          maxItems: 6,
        },
      },
      required: ["rules"],
    },
  },

  {
    name: "get_operation_status",
    description:
      "Check the status of a signal activation operation. " +
      "Returns current status (submitted/processing/completed/failed) " +
      "and the full signal details associated with the operation. " +
      "Use the operationId returned from activate_signal.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: {
          type: "string",
          description:
            "The operation ID to check. Returned by activate_signal. " +
            "Format: 'op_{timestamp}_{hex}'",
        },
      },
      required: ["operationId"],
    },
  },
];

export function getToolByName(name: string): McpToolDefinition | undefined {
  return ADCP_TOOLS.find((t) => t.name === name);
}
