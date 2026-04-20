// src/mcp/tools.ts
// MCP tool definitions — 8 tools matching the AdCP Signals protocol.
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
    /**
     * Optional JSON Schema describing the tool's `structuredContent` response.
     * Per MCP 2025-06-18 §Tools, clients SHOULD validate structured results
     * against this schema. Schemas here are deliberately permissive
     * (additionalProperties: true, only require the contractually-required
     * fields) so additive changes to response shape don't trip validators.
     */
    outputSchema?: {
        type: "object";
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
    };
}

// ── Reusable schema fragments ────────────────────────────────────────────────

const PROTOCOL_ENUM = ["media_buy", "signals", "governance", "sponsored_intelligence", "creative", "brand"] as const;

const DEPLOYMENT_ITEM = {
    type: "object",
    properties: {
        type: { type: "string" },
        platform: { type: "string" },
        is_live: { type: "boolean" },
        activation_key: { type: "object" },
        estimated_activation_duration_minutes: { type: "number" },
    },
    additionalProperties: true,
};

export const ADCP_TOOLS: McpToolDefinition[] = [
    {
        name: "get_adcp_capabilities",
        description:
            "Returns the capabilities of this AdCP Signals Provider: supported operations, " +
            "signal categories, available destinations, activation mode, and limits. " +
            "Call this first to understand what the provider supports before searching or activating signals. " +
            "Optionally pass `protocols` to filter the response to specific protocol blocks.",
        inputSchema: {
            type: "object",
            properties: {
                protocols: {
                    type: "array",
                    description:
                        "Optional filter — return only the listed protocol blocks. " +
                        "Top-level adcp, supported_protocols, and ext are always returned.",
                    items: {
                        type: "string",
                        enum: [...PROTOCOL_ENUM],
                    },
                },
                protocol: {
                    type: "string",
                    description:
                        "Singular alias for `protocols` — accepts a single protocol name. " +
                        "Provided for compatibility with clients that use the singular form.",
                    enum: [...PROTOCOL_ENUM],
                },
                context: {
                    type: "object",
                    description:
                        "Opaque correlation data echoed unchanged in the response. " +
                        "Use for tracing / session IDs / correlation IDs. Per the AdCP " +
                        "context schema, contents are not parsed by the agent — they round-trip.",
                    additionalProperties: true,
                },
            },
        },
        outputSchema: {
            type: "object",
            required: ["adcp", "supported_protocols"],
            properties: {
                adcp: {
                    type: "object",
                    required: ["major_versions", "idempotency"],
                    properties: {
                        major_versions: {
                            type: "array",
                            items: { type: "integer", minimum: 1 },
                            minItems: 1,
                        },
                        idempotency: {
                            // HEAD schema: discriminated union on `supported`.
                            // We always declare the supported=true variant.
                            type: "object",
                            required: ["supported", "replay_ttl_seconds"],
                            properties: {
                                supported: { type: "boolean", const: true },
                                replay_ttl_seconds: {
                                    type: "integer",
                                    minimum: 3600,
                                    maximum: 604800,
                                },
                            },
                        },
                    },
                    additionalProperties: true,
                },
                supported_protocols: {
                    type: "array",
                    items: { type: "string", enum: [...PROTOCOL_ENUM] },
                },
                signals: { type: "object", additionalProperties: true },
                media_buy: { type: "object", additionalProperties: true },
                governance: { type: "object", additionalProperties: true },
                sponsored_intelligence: { type: "object", additionalProperties: true },
                creative: { type: "object", additionalProperties: true },
                brand: { type: "object", additionalProperties: true },
                ext: { type: "object", additionalProperties: true },
                context: { type: "object", additionalProperties: true },
                extensions_supported: { type: "array", items: { type: "string" } },
                last_updated: { type: "string" },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            required: ["signals", "count"],
            properties: {
                message: { type: "string" },
                context_id: { type: "string" },
                signals: { type: "array", items: { type: "object", additionalProperties: true } },
                proposals: { type: "array", items: { type: "object", additionalProperties: true } },
                count: { type: "integer", minimum: 0 },
                totalCount: { type: "integer", minimum: 0 },
                offset: { type: "integer", minimum: 0 },
                hasMore: { type: "boolean" },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            required: ["task_id", "status", "signal_agent_segment_id"],
            properties: {
                task_id: { type: "string" },
                status: { type: "string" },
                signal_agent_segment_id: { type: "string" },
                deployments: { type: "array", items: DEPLOYMENT_ITEM },
                webhook_url: { type: "string" },
                pricing_option_id: { type: "string" },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            required: ["task_id", "status", "signal_agent_segment_id"],
            properties: {
                task_id: { type: "string" },
                status: { type: "string" },
                signal_agent_segment_id: { type: "string" },
                deployments: { type: "array", items: DEPLOYMENT_ITEM },
                submittedAt: { type: "string" },
                updatedAt: { type: "string" },
                completedAt: { type: "string" },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            required: ["reference_signal_id", "results", "count"],
            properties: {
                reference_signal_id: { type: "string" },
                model_id: { type: "string" },
                space_id: { type: "string" },
                results: { type: "array", items: { type: "object", additionalProperties: true } },
                context_id: { type: "string" },
                count: { type: "integer", minimum: 0 },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            properties: {
                query: { type: "string" },
                matched_signals: { type: "array", items: { type: "object", additionalProperties: true } },
                composite_audience: { type: "object", additionalProperties: true },
                resolved_ast: { type: "object", additionalProperties: true },
                count: { type: "integer", minimum: 0 },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            properties: {
                concept_id: { type: "string" },
                label: { type: "string" },
                description: { type: "string" },
                category: { type: "string" },
                error: { type: "string" },
                available_count: { type: "integer" },
            },
            additionalProperties: true,
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
        outputSchema: {
            type: "object",
            properties: {
                query: { type: "string" },
                results: { type: "array", items: { type: "object", additionalProperties: true } },
                count: { type: "integer", minimum: 0 },
                total_in_registry: { type: "integer", minimum: 0 },
                error: { type: "string" },
            },
            additionalProperties: true,
        },
    },

    // Sec-22: stubbed to satisfy the universal schema_validation storyboard's
    // past_start_enforcement assertion. We're a signals agent, not a media-buy
    // seller, so every call returns an AdCP error envelope — INVALID_REQUEST
    // for temporal violations (past start_time or reversed dates), and
    // UNSUPPORTED_OPERATION otherwise. The storyboard's `past_start_reject_path`
    // only needs the past-start branch to fire to contribute `past_start_handled`.
    {
        name: "create_media_buy",
        description:
            "Stubbed for storyboard conformance — this agent is a signals provider, not a media-buy seller. " +
            "Returns INVALID_REQUEST when temporal constraints are violated (past start_time, reversed dates); " +
            "returns UNSUPPORTED_OPERATION for every other call.",
        inputSchema: {
            type: "object",
            properties: {
                start_time: { type: "string", description: "ISO-8601 flight start." },
                end_time: { type: "string", description: "ISO-8601 flight end." },
                packages: { type: "array", items: { type: "object", additionalProperties: true } },
                idempotency_key: { type: "string" },
                context: { type: "object", additionalProperties: true },
            },
            additionalProperties: true,
        },
        outputSchema: {
            type: "object",
            required: ["errors"],
            properties: {
                errors: {
                    type: "array",
                    minItems: 1,
                    items: {
                        type: "object",
                        required: ["code", "message"],
                        properties: {
                            code: { type: "string" },
                            message: { type: "string" },
                            // Sec-25a: optional recovery enum from core/error.json
                            recovery: {
                                type: "string",
                                enum: ["transient", "correctable", "terminal"],
                            },
                        },
                        additionalProperties: true,
                    },
                },
                context: { type: "object", additionalProperties: true },
            },
            additionalProperties: true,
        },
    },
];

export function getToolByName(name: string): McpToolDefinition | undefined {
    return ADCP_TOOLS.find((t) => t.name === name);
}