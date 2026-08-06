// MCP tool definitions for the Signal Ledger Media seller agent.
// Schemas track AdCP 3.0 GA HEAD shapes:
//   - get_adcp_capabilities: `protocols` filter, `adcp.major_versions`,
//     `adcp.idempotency` discriminated union, `context` round-trip echo
//   - get_products: `brief` + `promoted_offering`, optional `filters`
//   - create_media_buy: `buyer_ref` + `packages[]` + `budget`, optional
//     `idempotency_key` (HEAD-required for replay-safe POSTs)
//   - list_creative_formats: optional `type` / `format_ids` filter
//
// outputSchema blocks are deliberately permissive (additionalProperties:
// true) so additive AdCP changes don't trip strict client validators.

export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
    };
    outputSchema?: {
        type: "object";
        description?: string;
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
    };
}

const PROTOCOL_ENUM = ["media_buy", "creative", "signals", "governance", "brand", "sponsored_intelligence"] as const;

const CONTEXT_PROP = {
    type: "object",
    description:
        "Opaque correlation data echoed unchanged in the response. Use for " +
        "tracing / session IDs / correlation IDs. Per the AdCP context schema, " +
        "contents are not parsed by the agent — they round-trip.",
    additionalProperties: true,
};

const DELIVER_TO_PROP = {
    type: "object",
    description: "Where the buyer wants delivery (geo + deployment targets).",
    properties: {
        countries: { type: "array", items: { type: "string" } },
        deployments: { type: "array", items: { type: "object" } },
    },
    additionalProperties: true,
};

export const TOOLS: McpToolDefinition[] = [
    // ── 1. get_adcp_capabilities ─────────────────────────────────────────────
    {
        name: "get_adcp_capabilities",
        description:
            "Returns the capabilities of the Signal Ledger Media seller agent: " +
            "supported AdCP versions, supported protocols (media_buy + creative), " +
            "idempotency support, contact + sales region. Call this first to learn " +
            "what the agent supports before calling get_products or create_media_buy. " +
            "Optionally pass `protocols` to filter the response to specific protocol " +
            "blocks.",
        inputSchema: {
            type: "object",
            properties: {
                protocols: {
                    type: "array",
                    description:
                        "Optional filter — return only the listed protocol blocks. " +
                        "Top-level adcp, supported_protocols, and ext are always returned.",
                    items: { type: "string", enum: [...PROTOCOL_ENUM] },
                },
                protocol: {
                    type: "string",
                    description:
                        "Singular alias for `protocols` — accepts a single protocol name.",
                    enum: [...PROTOCOL_ENUM],
                },
                context: CONTEXT_PROP,
            },
            additionalProperties: true,
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
                    minItems: 1,
                },
            },
            additionalProperties: true,
        },
    },

    // ── 2. get_products ──────────────────────────────────────────────────────
    {
        name: "get_products",
        description:
            "Returns the seller's product catalog. Pass `brief` and (recommended) " +
            "`promoted_offering` for relevance ranking and creative-policy screening — " +
            "ABM-intent briefs surface the Cross-Channel ABM Bundle proposal first. " +
            "Pass `buying_mode: 'refine'` plus `refine` to narrow a previous discovery " +
            "(proposal mode). Optional `filters` narrow by format, delivery_type, or " +
            "pricing model.",
        inputSchema: {
            type: "object",
            properties: {
                brief: {
                    type: "string",
                    description:
                        "Free-form campaign brief. Used for relevance ranking; not parsed " +
                        "into structured targeting. Max 4000 chars.",
                    maxLength: 4000,
                },
                promoted_offering: {
                    type: "string",
                    description:
                        "What the buyer is promoting (product, brand, offer). Recommended " +
                        "by AdCP 3.0 — sellers screen against creative_policy when present, " +
                        "but may be omitted for exploratory discovery.",
                    maxLength: 1000,
                },
                deliver_to: DELIVER_TO_PROP,
                buying_mode: {
                    type: "string",
                    enum: ["all", "refine"],
                    description:
                        "Discovery mode. 'all' (default) returns the catalog ranked by brief; " +
                        "'refine' narrows a previous discovery using the `refine` block.",
                },
                refine: {
                    type: "object",
                    description:
                        "Refinement payload paired with `buying_mode: 'refine'`. Contents " +
                        "vary by seller; this agent treats it as advisory and re-ranks.",
                    additionalProperties: true,
                },
                brand: {
                    description:
                        "Brand reference. AdCP 3.0 GA accepts either a string brand_ref or " +
                        "a full BrandManifest object.",
                    oneOf: [
                        { type: "string" },
                        { type: "object", additionalProperties: true },
                    ],
                },
                account: {
                    description:
                        "Account reference for multi-tenant sellers. Either an account_id " +
                        "string or an object with platform-specific fields.",
                    oneOf: [
                        { type: "string" },
                        { type: "object", additionalProperties: true },
                    ],
                },
                filters: {
                    type: "object",
                    description: "Optional response filters.",
                    properties: {
                        format_ids: { type: "array", items: { type: "string" } },
                        delivery_type: { type: "string", enum: ["guaranteed", "non_guaranteed"] },
                        pricing_model: {
                            type: "string",
                            // AdCP 3.0.1 pricing-options enum (per
                            // /schemas/3.0.1/core/pricing-option.json oneOf
                            // discriminators). cost_per_conversation is a
                            // product-copy label only and is NOT a valid wire
                            // value — buyers asking for that model should
                            // pass `cpa` and inspect custom_event_name.
                            enum: ["cpm", "vcpm", "cpc", "cpcv", "cpv", "cpp", "cpa", "flat_rate", "time"],
                        },
                    },
                    additionalProperties: true,
                },
                adcp_version: { type: "string", description: "Caller's AdCP version, e.g. '3.0'." },
                context: CONTEXT_PROP,
            },
            additionalProperties: true,
        },
        outputSchema: {
            type: "object",
            required: ["products"],
            properties: {
                products: {
                    type: "array",
                    items: {
                        type: "object",
                        required: ["product_id", "name", "format_ids", "delivery_type", "currency"],
                        additionalProperties: true,
                    },
                },
                context: { type: "object", additionalProperties: true },
            },
            additionalProperties: true,
        },
    },

    // ── 3. create_media_buy ──────────────────────────────────────────────────
    {
        name: "create_media_buy",
        description:
            "Creates a media buy (insertion order). Returns one of three shapes per " +
            "AdCP 3.0: (1) task envelope `{task_id, status:'submitted'}` when manual IO " +
            "review is required, (2) `{media_buy_id, status:'pending_creatives'}` when " +
            "the buy is approved pending creative upload, (3) `{media_buy_id, " +
            "status:'active'}` when the buy goes live immediately. Pass " +
            "`idempotency_key` for retry-safe POSTs (HEAD spec: replay returns the " +
            "cached response within `replay_ttl_seconds`).",
        inputSchema: {
            type: "object",
            properties: {
                buyer_ref: {
                    type: "string",
                    description: "Buyer's reference for this media buy (their PO / campaign ID).",
                    maxLength: 200,
                },
                packages: {
                    type: "array",
                    minItems: 1,
                    description:
                        "Line items. Each package binds a product_id (or pricing_option_id) " +
                        "to a budget allocation, flight, and targeting.",
                    items: {
                        type: "object",
                        required: ["product_id"],
                        properties: {
                            buyer_ref: { type: "string" },
                            product_id: { type: "string" },
                            pricing_option_id: { type: "string" },
                            budget: { type: ["number", "object"] },
                            impressions: { type: "integer", minimum: 1 },
                            targeting: { type: "object", additionalProperties: true },
                            measurement_terms: {
                                type: "object",
                                description:
                                    "Per-package billing-measurement terms the buyer proposes " +
                                    "(vendor, variance window). Sellers may accept, adjust, or " +
                                    "reject with TERMS_REJECTED.",
                                additionalProperties: true,
                            },
                            performance_standards: {
                                type: "array",
                                description:
                                    "Per-package performance-standard requests (e.g. viewability " +
                                    "floor, ivt ceiling). Sellers reject with TERMS_REJECTED when a " +
                                    "requested floor exceeds the product's published floor or a " +
                                    "requested ceiling falls below the product's published ceiling. " +
                                    "Thresholds are decimals 0..1 per AdCP 3.0.1.",
                                items: {
                                    type: "object",
                                    properties: {
                                        metric: {
                                            type: "string",
                                            enum: ["viewability", "ivt", "completion_rate", "brand_safety", "attention_score"],
                                        },
                                        threshold: { type: "number", minimum: 0, maximum: 1 },
                                        standard: { type: "string", enum: ["mrc", "groupm"] },
                                        vendor: { type: "object", additionalProperties: true },
                                    },
                                    required: ["metric", "threshold"],
                                    additionalProperties: true,
                                },
                            },
                        },
                        additionalProperties: true,
                    },
                },
                budget: {
                    description: "Total budget — scalar number or object with `total` + `currency`.",
                    oneOf: [
                        { type: "number" },
                        {
                            type: "object",
                            required: ["total", "currency"],
                            properties: {
                                total: { type: "number" },
                                currency: { type: "string" },
                            },
                            additionalProperties: true,
                        },
                    ],
                },
                start_time: { type: "string", description: "ISO 8601 flight start." },
                end_time: { type: "string", description: "ISO 8601 flight end." },
                promoted_offering: { type: "string", maxLength: 1000 },
                po_number: { type: "string", description: "Buyer purchase order number." },
                idempotency_key: {
                    type: "string",
                    description:
                        "Caller-supplied key for retry safety. Replays within " +
                        "`replay_ttl_seconds` return the cached canonical response.",
                    maxLength: 200,
                },
                reporting_webhook: {
                    type: "object",
                    description: "Optional webhook for delivery notifications.",
                    properties: {
                        url: { type: "string", format: "uri" },
                    },
                    additionalProperties: true,
                },
                measurement_terms: {
                    type: "object",
                    description:
                        "Buy-level billing-measurement terms applied to all packages. " +
                        "Per-package overrides take precedence.",
                    additionalProperties: true,
                },
                performance_standards: {
                    type: "array",
                    description:
                        "Buy-level performance standards applied to every package. " +
                        "Per-package overrides take precedence. Sellers reject with " +
                        "TERMS_REJECTED when a request exceeds any selected product's " +
                        "published floor (or undercuts its ceiling for ivt). Thresholds " +
                        "are decimals 0..1.",
                    items: {
                        type: "object",
                        properties: {
                            metric: {
                                type: "string",
                                enum: ["viewability", "ivt", "completion_rate", "brand_safety", "attention_score"],
                            },
                            threshold: { type: "number", minimum: 0, maximum: 1 },
                            standard: { type: "string", enum: ["mrc", "groupm"] },
                            vendor: { type: "object", additionalProperties: true },
                        },
                        required: ["metric", "threshold"],
                        additionalProperties: true,
                    },
                },
                brand: {
                    description:
                        "Brand reference (string brand_ref or BrandManifest object).",
                    oneOf: [
                        { type: "string" },
                        { type: "object", additionalProperties: true },
                    ],
                },
                account: {
                    description: "Account reference for multi-tenant sellers.",
                    oneOf: [
                        { type: "string" },
                        { type: "object", additionalProperties: true },
                    ],
                },
                context: CONTEXT_PROP,
            },
            required: ["packages"],
            additionalProperties: true,
        },
        outputSchema: {
            type: "object",
            description:
                "One of three shapes: task envelope (status='submitted', has task_id), " +
                "pending_creatives, or active.",
            additionalProperties: true,
        },
    },

    // ── 4. get_media_buy_delivery ────────────────────────────────────────────
    {
        name: "get_media_buy_delivery",
        description:
            "Returns delivery metrics for one or more media buys created via " +
            "create_media_buy. Provides aggregated_totals + per-buy totals + " +
            "per-package breakdown with spend, pacing, and the appropriate " +
            "volume metric (impressions for CPM/flat-rate inventory; " +
            "conversations for the SI product, billed per qualified " +
            "conversation). Pass `media_buy_ids` (array) or `media_buy_id` " +
            "(singular convenience). When start_date/end_date are omitted, " +
            "returns lifetime-to-date data.",
        inputSchema: {
            type: "object",
            properties: {
                media_buy_ids: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    description: "AdCP-canonical: array of media buy IDs.",
                },
                media_buy_id: {
                    type: "string",
                    description: "Singular convenience alias accepted alongside media_buy_ids.",
                },
                start_date: {
                    type: "string",
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "Reporting period start (YYYY-MM-DD).",
                },
                end_date: {
                    type: "string",
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "Reporting period end (YYYY-MM-DD).",
                },
                context: CONTEXT_PROP,
            },
            additionalProperties: true,
        },
        outputSchema: {
            type: "object",
            required: ["media_buy_deliveries"],
            properties: {
                reporting_period: { type: "object", additionalProperties: true },
                currency: { type: "string" },
                aggregated_totals: { type: "object", additionalProperties: true },
                media_buy_deliveries: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                },
            },
            additionalProperties: true,
        },
    },

    // ── 5. list_creative_formats ─────────────────────────────────────────────
    {
        name: "list_creative_formats",
        description:
            "Returns the creative formats Signal Ledger Media accepts. Filter by " +
            "`type` (display/video/audio/native) or by `format_ids` (specific format " +
            "lookups). Each format documents required assets and delivery constraints.",
        inputSchema: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    enum: ["display", "video", "audio", "native", "rich_media", "dooh"],
                },
                format_ids: { type: "array", items: { type: "string" } },
                context: CONTEXT_PROP,
            },
            additionalProperties: true,
        },
        outputSchema: {
            type: "object",
            required: ["formats"],
            properties: {
                formats: {
                    type: "array",
                    items: {
                        type: "object",
                        required: ["format_id", "name", "type", "assets_required"],
                        additionalProperties: true,
                    },
                },
            },
            additionalProperties: true,
        },
    },
];

export function findToolDef(name: string): McpToolDefinition | undefined {
    return TOOLS.find((t) => t.name === name);
}
