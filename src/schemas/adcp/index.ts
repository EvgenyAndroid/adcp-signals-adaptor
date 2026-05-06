// AUTO-GENERATED — do not edit by hand.
// Source: node_modules/@adcp/sdk/dist/lib/schemas-data/3.0/
// Regenerate with: node scripts/vendor-adcp-schemas.mjs
//
// This module vendors AdCP signal-protocol JSON schemas as TypeScript
// constants so the worker can bundle them without relying on
// @adcp/sdk's package.json exports map (which omits the schemas-data
// path). Used by src/domain/signalTrace.ts for AJV-based runtime
// validation of get_signals + activate_signal request/response payloads.

export const getSignalsReq = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/signals/get-signals-request.json",
  "title": "Get Signals Request",
  "description": "Request parameters for discovering and refining signals. Use signal_spec for natural language discovery, signal_ids for exact lookups, or both to refine previous results (signal_ids anchor the starting set, signal_spec guides adjustments).",
  "type": "object",
  "properties": {
    "adcp_major_version": {
      "type": "integer",
      "description": "The AdCP major version the buyer's payloads conform to. Sellers validate against their supported major_versions and return VERSION_UNSUPPORTED if unsupported. When omitted, the seller assumes its highest supported version.",
      "minimum": 1,
      "maximum": 99
    },
    "account": {
      "$ref": "/schemas/3.0.1/core/account-ref.json",
      "description": "Account for this request. When provided, the signals agent returns per-account pricing options if configured."
    },
    "signal_spec": {
      "type": "string",
      "description": "Natural language description of the desired signals. When used alone, enables semantic discovery. When combined with signal_ids, provides context for the agent but signal_ids matches are returned first."
    },
    "signal_ids": {
      "type": "array",
      "description": "Specific signals to look up by data provider and ID. Returns exact matches from the data provider's catalog. When combined with signal_spec, these signals anchor the starting set and signal_spec guides adjustments.",
      "items": {
        "$ref": "/schemas/3.0.1/core/signal-id.json"
      },
      "minItems": 1
    },
    "destinations": {
      "type": "array",
      "description": "Filter signals to those activatable on specific agents/platforms. When omitted, returns all signals available on the current agent. If the authenticated caller matches one of these destinations, activation keys will be included in the response.",
      "items": {
        "$ref": "/schemas/3.0.1/core/destination.json"
      },
      "minItems": 1
    },
    "countries": {
      "type": "array",
      "description": "Countries where signals will be used (ISO 3166-1 alpha-2 codes). When omitted, no geographic filter is applied.",
      "items": {
        "type": "string",
        "pattern": "^[A-Z]{2}$"
      },
      "minItems": 1
    },
    "filters": {
      "$ref": "/schemas/3.0.1/core/signal-filters.json"
    },
    "max_results": {
      "type": "integer",
      "description": "DEPRECATED: Use pagination.max_results instead. When both fields are present, agents MUST honor pagination.max_results. When only this field is present without a pagination envelope, agents SHOULD treat it as the page size subject to a maximum of 100 results. This field will be removed in AdCP 4.0.",
      "deprecated": true,
      "minimum": 1
    },
    "pagination": {
      "$ref": "/schemas/3.0.1/core/pagination-request.json",
      "description": "Pagination parameters. Use pagination.max_results (max: 100, default: 50) and pagination.cursor for cursor-based page walks. When the deprecated top-level max_results field is also present, pagination.max_results takes precedence."
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "anyOf": [
    {
      "required": [
        "signal_spec"
      ]
    },
    {
      "required": [
        "signal_ids"
      ]
    }
  ],
  "additionalProperties": true
} as const;

export const getSignalsRes = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/signals/get-signals-response.json",
  "title": "Get Signals Response",
  "description": "Response payload for get_signals task",
  "type": "object",
  "properties": {
    "signals": {
      "type": "array",
      "description": "Array of matching signals",
      "items": {
        "type": "object",
        "properties": {
          "signal_id": {
            "$ref": "/schemas/3.0.1/core/signal-id.json",
            "description": "Universal signal identifier referencing the data provider's catalog. Use this to verify authorization and look up signal definitions."
          },
          "signal_agent_segment_id": {
            "type": "string",
            "description": "Opaque identifier used for activation. This is the signals agent's internal segment ID.",
            "x-entity": "signal_activation_id"
          },
          "name": {
            "type": "string",
            "description": "Human-readable signal name"
          },
          "description": {
            "type": "string",
            "description": "Detailed signal description"
          },
          "value_type": {
            "$ref": "/schemas/3.0.1/enums/signal-value-type.json",
            "description": "The data type of this signal's values (binary, categorical, numeric)"
          },
          "categories": {
            "type": "array",
            "description": "Valid values for categorical signals. Present when value_type is 'categorical'. Buyers must use one of these values in SignalTargeting.values.",
            "items": {
              "type": "string"
            }
          },
          "range": {
            "type": "object",
            "description": "Valid range for numeric signals. Present when value_type is 'numeric'.",
            "properties": {
              "min": {
                "type": "number",
                "description": "Minimum value (inclusive)"
              },
              "max": {
                "type": "number",
                "description": "Maximum value (inclusive)"
              }
            },
            "required": [
              "min",
              "max"
            ],
            "additionalProperties": false
          },
          "signal_type": {
            "$ref": "/schemas/3.0.1/enums/signal-catalog-type.json",
            "description": "Catalog type of signal (marketplace, custom, owned)"
          },
          "data_provider": {
            "type": "string",
            "description": "Human-readable name of the data provider"
          },
          "coverage_percentage": {
            "type": "number",
            "description": "Percentage of audience coverage",
            "minimum": 0,
            "maximum": 100
          },
          "deployments": {
            "type": "array",
            "description": "Array of deployment targets",
            "items": {
              "$ref": "/schemas/3.0.1/core/deployment.json"
            }
          },
          "pricing_options": {
            "type": "array",
            "description": "Pricing options available for this signal. The buyer selects one and passes its pricing_option_id in report_usage for billing verification.",
            "items": {
              "$ref": "/schemas/3.0.1/core/vendor-pricing-option.json"
            },
            "minItems": 1
          }
        },
        "required": [
          "signal_id",
          "signal_agent_segment_id",
          "name",
          "description",
          "signal_type",
          "data_provider",
          "coverage_percentage",
          "deployments",
          "pricing_options"
        ],
        "additionalProperties": true
      }
    },
    "errors": {
      "type": "array",
      "description": "Task-specific errors and warnings (e.g., signal discovery or pricing issues)",
      "items": {
        "$ref": "/schemas/3.0.1/core/error.json"
      }
    },
    "pagination": {
      "$ref": "/schemas/3.0.1/core/pagination-response.json"
    },
    "sandbox": {
      "type": "boolean",
      "description": "When true, this response contains simulated data from sandbox mode."
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "signals"
  ],
  "additionalProperties": true
} as const;

export const activateReq = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/signals/activate-signal-request.json",
  "title": "Activate Signal Request",
  "description": "Request parameters for activating or deactivating a signal on deployment targets",
  "x-mutates-state": true,
  "type": "object",
  "properties": {
    "adcp_major_version": {
      "type": "integer",
      "description": "The AdCP major version the buyer's payloads conform to. Sellers validate against their supported major_versions and return VERSION_UNSUPPORTED if unsupported. When omitted, the seller assumes its highest supported version.",
      "minimum": 1,
      "maximum": 99
    },
    "action": {
      "type": "string",
      "enum": [
        "activate",
        "deactivate"
      ],
      "default": "activate",
      "description": "Whether to activate or deactivate the signal. Deactivating removes the segment from downstream platforms, required when campaigns end to comply with data governance policies (GDPR, CCPA). Defaults to 'activate' when omitted."
    },
    "signal_agent_segment_id": {
      "type": "string",
      "description": "The universal identifier for the signal to activate",
      "x-entity": "signal_activation_id"
    },
    "destinations": {
      "type": "array",
      "description": "Target destination(s) for activation. If the authenticated caller matches one of these destinations, activation keys will be included in the response.",
      "items": {
        "$ref": "/schemas/3.0.1/core/destination.json"
      },
      "minItems": 1
    },
    "pricing_option_id": {
      "type": "string",
      "description": "The pricing option selected from the signal's pricing_options in the get_signals response. Required when the signal has pricing options. Records the buyer's pricing commitment at activation time; pass this same value in report_usage for billing verification.",
      "x-entity": "vendor_pricing_option"
    },
    "account": {
      "$ref": "/schemas/3.0.1/core/account-ref.json",
      "description": "Account for this activation. Associates with a commercial relationship established via sync_accounts."
    },
    "idempotency_key": {
      "type": "string",
      "description": "Client-generated unique key for this request. Prevents duplicate activations on retries. MUST be unique per (seller, request) pair to prevent cross-seller correlation. Use a fresh UUID v4 for each request.",
      "minLength": 16,
      "maxLength": 255,
      "pattern": "^[A-Za-z0-9_.:-]{16,255}$"
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "idempotency_key",
    "signal_agent_segment_id",
    "destinations"
  ],
  "additionalProperties": true
} as const;

export const activateRes = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/signals/activate-signal-response.json",
  "title": "Activate Signal Response",
  "description": "Response payload for activate_signal task. Returns either complete success data OR error information, never both. This enforces atomic operation semantics - the signal is either fully activated or not activated at all.",
  "type": "object",
  "oneOf": [
    {
      "title": "ActivateSignalSuccess",
      "description": "Success response - signal activated successfully to one or more deployment targets",
      "type": "object",
      "properties": {
        "deployments": {
          "type": "array",
          "description": "Array of deployment results for each deployment target",
          "items": {
            "$ref": "/schemas/3.0.1/core/deployment.json"
          }
        },
        "sandbox": {
          "type": "boolean",
          "description": "When true, this response contains simulated data from sandbox mode."
        },
        "context": {
          "$ref": "/schemas/3.0.1/core/context.json"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "deployments"
      ],
      "additionalProperties": true,
      "not": {
        "required": [
          "errors"
        ]
      }
    },
    {
      "title": "ActivateSignalError",
      "description": "Error response - operation failed, signal not activated",
      "type": "object",
      "properties": {
        "errors": {
          "type": "array",
          "description": "Array of errors explaining why activation failed (e.g., platform connectivity issues, signal definition problems, authentication failures)",
          "items": {
            "$ref": "/schemas/3.0.1/core/error.json"
          },
          "minItems": 1
        },
        "context": {
          "$ref": "/schemas/3.0.1/core/context.json"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "errors"
      ],
      "additionalProperties": true,
      "not": {
        "anyOf": [
          {
            "required": [
              "deployments"
            ]
          },
          {
            "required": [
              "sandbox"
            ]
          }
        ]
      }
    }
  ]
} as const;

export const listCreativeFormatsReq = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/creative/list-creative-formats-request.json",
  "title": "List Creative Formats Request (Creative Agent)",
  "description": "Request parameters for discovering creative formats provided by this creative agent",
  "type": "object",
  "properties": {
    "adcp_major_version": {
      "type": "integer",
      "description": "The AdCP major version the buyer's payloads conform to. Sellers validate against their supported major_versions and return VERSION_UNSUPPORTED if unsupported. When omitted, the seller assumes its highest supported version.",
      "minimum": 1,
      "maximum": 99
    },
    "format_ids": {
      "type": "array",
      "description": "Return only these specific format IDs",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      },
      "minItems": 1
    },
    "type": {
      "type": "string",
      "description": "Filter by format type (technical categories with distinct requirements)",
      "enum": [
        "audio",
        "video",
        "display",
        "dooh"
      ]
    },
    "asset_types": {
      "type": "array",
      "description": "Filter to formats that include these asset types. For third-party tags, search for 'html' or 'javascript'. E.g., ['image', 'text'] returns formats with images and text, ['javascript'] returns formats accepting JavaScript tags.",
      "items": {
        "type": "string",
        "enum": [
          "image",
          "video",
          "audio",
          "text",
          "html",
          "javascript",
          "url"
        ]
      },
      "minItems": 1
    },
    "max_width": {
      "type": "integer",
      "description": "Maximum width in pixels (inclusive). Returns formats with width <= this value. Omit for responsive/fluid formats."
    },
    "max_height": {
      "type": "integer",
      "description": "Maximum height in pixels (inclusive). Returns formats with height <= this value. Omit for responsive/fluid formats."
    },
    "min_width": {
      "type": "integer",
      "description": "Minimum width in pixels (inclusive). Returns formats with width >= this value."
    },
    "min_height": {
      "type": "integer",
      "description": "Minimum height in pixels (inclusive). Returns formats with height >= this value."
    },
    "is_responsive": {
      "type": "boolean",
      "description": "Filter for responsive formats that adapt to container size. When true, returns formats without fixed dimensions."
    },
    "name_search": {
      "type": "string",
      "description": "Search for formats by name (case-insensitive partial match)"
    },
    "wcag_level": {
      "$ref": "/schemas/3.0.1/enums/wcag-level.json",
      "description": "Filter to formats that meet at least this WCAG conformance level (A < AA < AAA)"
    },
    "disclosure_positions": {
      "type": "array",
      "description": "Filter to formats that support all of these disclosure positions. When a format has disclosure_capabilities, match against those positions. Otherwise fall back to supported_disclosure_positions. Use to find formats compatible with a brief's compliance requirements.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/disclosure-position.json"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "disclosure_persistence": {
      "type": "array",
      "description": "Filter to formats where each requested persistence mode is supported by at least one position in disclosure_capabilities. Different positions may satisfy different modes. Use to find formats compatible with jurisdiction-specific persistence requirements (e.g., continuous for EU AI Act).",
      "items": {
        "$ref": "/schemas/3.0.1/enums/disclosure-persistence.json"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "output_format_ids": {
      "type": "array",
      "description": "Filter to formats whose output_format_ids includes any of these format IDs. Returns formats that can produce these outputs — inspect each result's input_format_ids to see what inputs they accept.",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      },
      "minItems": 1
    },
    "input_format_ids": {
      "type": "array",
      "description": "Filter to formats whose input_format_ids includes any of these format IDs. Returns formats that accept these creatives as input — inspect each result's output_format_ids to see what they can produce.",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      },
      "minItems": 1
    },
    "include_pricing": {
      "type": "boolean",
      "default": false,
      "description": "Include pricing_options on each format. Used by transformation and generation agents that charge per format or per unit of work. Requires account. When false or omitted, pricing is not computed."
    },
    "account": {
      "$ref": "/schemas/3.0.1/core/account-ref.json",
      "description": "Account reference for pricing. When provided with include_pricing, the agent returns pricing_options from this account's rate card on each format."
    },
    "pagination": {
      "$ref": "/schemas/3.0.1/core/pagination-request.json"
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "additionalProperties": true,
  "allOf": [
    {
      "if": {
        "properties": {
          "include_pricing": {
            "const": true
          }
        },
        "required": [
          "include_pricing"
        ]
      },
      "then": {
        "required": [
          "account"
        ]
      }
    }
  ]
} as const;

export const listCreativeFormatsRes = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/creative/list-creative-formats-response.json",
  "title": "List Creative Formats Response (Creative Agent)",
  "description": "Response payload for list_creative_formats task from creative agent - returns full format definitions",
  "type": "object",
  "properties": {
    "formats": {
      "type": "array",
      "description": "Full format definitions for all formats this agent supports. Each format's authoritative source is indicated by its agent_url field.",
      "items": {
        "$ref": "/schemas/3.0.1/core/format.json"
      }
    },
    "creative_agents": {
      "type": "array",
      "description": "Optional: Creative agents that provide additional formats. Buyers can recursively query these agents to discover more formats. No authentication required for list_creative_formats.",
      "items": {
        "type": "object",
        "properties": {
          "agent_url": {
            "type": "string",
            "format": "uri",
            "description": "Base URL for the creative agent (e.g., 'https://reference.adcp.org', 'https://dco.example.com'). Call list_creative_formats on this URL to get its formats."
          },
          "agent_name": {
            "type": "string",
            "description": "Human-readable name for the creative agent"
          },
          "capabilities": {
            "type": "array",
            "description": "Capabilities this creative agent provides",
            "items": {
              "$ref": "/schemas/3.0.1/enums/creative-agent-capability.json"
            }
          }
        },
        "required": [
          "agent_url"
        ]
      }
    },
    "errors": {
      "type": "array",
      "description": "Task-specific errors and warnings",
      "items": {
        "$ref": "/schemas/3.0.1/core/error.json"
      }
    },
    "pagination": {
      "$ref": "/schemas/3.0.1/core/pagination-response.json"
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "formats"
  ],
  "additionalProperties": true
} as const;

export const getProductsReq = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/media-buy/get-products-request.json",
  "title": "Get Products Request",
  "description": "Request parameters for discovering or refining advertising products. buying_mode declares the buyer's intent: 'brief' for curated discovery, 'wholesale' for raw catalog access, or 'refine' to iterate on known products and proposals.",
  "type": "object",
  "properties": {
    "adcp_major_version": {
      "type": "integer",
      "description": "The AdCP major version the buyer's payloads conform to. Sellers validate against their supported major_versions and return VERSION_UNSUPPORTED if unsupported. When omitted, the seller assumes its highest supported version.",
      "minimum": 1,
      "maximum": 99
    },
    "buying_mode": {
      "type": "string",
      "enum": [
        "brief",
        "wholesale",
        "refine"
      ],
      "description": "Declares buyer intent for this request. 'brief': publisher curates product recommendations from the provided brief. 'wholesale': buyer requests raw inventory to apply their own audiences — brief must not be provided, and proposals are omitted. 'refine': iterate on products and proposals from a previous get_products response using the refine array of change requests. v3 clients MUST include buying_mode. Sellers receiving requests from pre-v3 clients without buying_mode SHOULD default to 'brief'."
    },
    "brief": {
      "type": "string",
      "description": "Natural language description of campaign requirements. Required when buying_mode is 'brief'. Must not be provided when buying_mode is 'wholesale' or 'refine'."
    },
    "refine": {
      "type": "array",
      "description": "Array of change requests for iterating on products and proposals from a previous get_products response. Each entry declares a scope (request, product, or proposal) and what the buyer is asking for. Only valid when buying_mode is 'refine'. The seller responds to each entry via refinement_applied in the response, matched by position.",
      "minItems": 1,
      "items": {
        "type": "object",
        "discriminator": {
          "propertyName": "scope"
        },
        "oneOf": [
          {
            "properties": {
              "scope": {
                "type": "string",
                "const": "request",
                "description": "Change scoped to the overall request — direction for the selection as a whole."
              },
              "ask": {
                "type": "string",
                "minLength": 1,
                "description": "What the buyer is asking for at the request level (e.g., 'more video options and less display', 'suggest how to combine these products')."
              }
            },
            "required": [
              "scope",
              "ask"
            ],
            "additionalProperties": false
          },
          {
            "properties": {
              "scope": {
                "type": "string",
                "const": "product",
                "description": "Change scoped to a specific product."
              },
              "product_id": {
                "type": "string",
                "minLength": 1,
                "description": "Product ID from a previous get_products response."
              },
              "action": {
                "type": "string",
                "enum": [
                  "include",
                  "omit",
                  "more_like_this"
                ],
                "default": "include",
                "description": "'include' (default): return this product with updated pricing and data. 'omit': exclude this product from the response. 'more_like_this': find additional products similar to this one (the original is also returned). Optional — when omitted, the seller treats the entry as action: 'include'."
              },
              "ask": {
                "type": "string",
                "minLength": 1,
                "description": "What the buyer is asking for on this product. For 'include': specific changes to request (e.g., 'add 16:9 format'). For 'more_like_this': what 'similar' means (e.g., 'same audience but video format'). Ignored when action is 'omit'."
              }
            },
            "required": [
              "scope",
              "product_id"
            ],
            "additionalProperties": false
          },
          {
            "properties": {
              "scope": {
                "type": "string",
                "const": "proposal",
                "description": "Change scoped to a specific proposal."
              },
              "proposal_id": {
                "type": "string",
                "minLength": 1,
                "description": "Proposal ID from a previous get_products response."
              },
              "action": {
                "type": "string",
                "enum": [
                  "include",
                  "omit",
                  "finalize"
                ],
                "default": "include",
                "description": "'include' (default): return this proposal with updated allocations and pricing. 'omit': exclude this proposal from the response. 'finalize': request firm pricing and inventory hold — transitions a draft proposal to committed with an expires_at hold window. May trigger seller-side approval (HITL). The buyer should not set a time_budget for finalize requests — they represent a commitment to wait for the result. Optional — when omitted, the seller treats the entry as action: 'include'."
              },
              "ask": {
                "type": "string",
                "minLength": 1,
                "description": "What the buyer is asking for on this proposal (e.g., 'shift more budget toward video', 'reduce total by 10%'). Ignored when action is 'omit'."
              }
            },
            "required": [
              "scope",
              "proposal_id"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "brand": {
      "$ref": "/schemas/3.0.1/core/brand-ref.json",
      "description": "Brand reference for product discovery context. Resolved to full brand identity at execution time."
    },
    "catalog": {
      "$ref": "/schemas/3.0.1/core/catalog.json",
      "description": "Catalog of items the buyer wants to promote. The seller matches catalog items against its inventory and returns products where matches exist. Supports all catalog types: a job catalog finds job ad products, a product catalog finds sponsored product slots. Reference a synced catalog by catalog_id, or provide inline items."
    },
    "account": {
      "$ref": "/schemas/3.0.1/core/account-ref.json",
      "description": "Account for product lookup. Returns products with pricing specific to this account's rate card."
    },
    "preferred_delivery_types": {
      "type": "array",
      "description": "Delivery types the buyer prefers, in priority order. Unlike filters.delivery_type which excludes non-matching products, this signals preference for curation — the publisher may still include other delivery types when they match the brief well.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/delivery-type.json"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "filters": {
      "$ref": "/schemas/3.0.1/core/product-filters.json"
    },
    "property_list": {
      "$ref": "/schemas/3.0.1/core/property-list-ref.json",
      "description": "[AdCP 3.0] Reference to an externally managed property list. When provided, the sales agent should filter products to only those available on properties in the list."
    },
    "fields": {
      "type": "array",
      "description": "Specific product fields to include in the response. When omitted, all fields are returned. Use for lightweight discovery calls where only a subset of product data is needed (e.g., just IDs and pricing for comparison). Required fields (product_id, name) are always included regardless of selection.",
      "minItems": 1,
      "items": {
        "type": "string",
        "enum": [
          "product_id",
          "name",
          "description",
          "publisher_properties",
          "channels",
          "format_ids",
          "placements",
          "delivery_type",
          "exclusivity",
          "pricing_options",
          "forecast",
          "outcome_measurement",
          "delivery_measurement",
          "reporting_capabilities",
          "creative_policy",
          "catalog_types",
          "metric_optimization",
          "conversion_tracking",
          "data_provider_signals",
          "max_optimization_goals",
          "catalog_match",
          "collections",
          "collection_targeting_allowed",
          "installments",
          "brief_relevance",
          "expires_at",
          "product_card",
          "product_card_detailed",
          "enforced_policies",
          "trusted_match"
        ]
      }
    },
    "time_budget": {
      "allOf": [
        {
          "$ref": "/schemas/3.0.1/core/duration.json"
        }
      ],
      "description": "Maximum time the buyer will commit to this request. The seller returns the best results achievable within this budget and does not start processes (human approvals, expensive external queries) that cannot complete in time. When omitted, the seller decides timing."
    },
    "pagination": {
      "$ref": "/schemas/3.0.1/core/pagination-request.json"
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "required_policies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Registry policy IDs that the buyer requires to be enforced for products in this response. Sellers filter products to only those that comply with or already enforce the requested policies."
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "buying_mode"
  ],
  "dependencies": {
    "catalog": [
      "brand"
    ]
  },
  "additionalProperties": true
} as const;

export const getProductsRes = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/media-buy/get-products-response.json",
  "title": "Get Products Response",
  "description": "Response payload for get_products task",
  "type": "object",
  "properties": {
    "products": {
      "type": "array",
      "description": "Array of matching products",
      "items": {
        "$ref": "/schemas/3.0.1/core/product.json"
      }
    },
    "proposals": {
      "type": "array",
      "description": "Optional array of proposed media plans with budget allocations across products. Publishers include proposals when they can provide strategic guidance based on the brief. Proposals are actionable - buyers can refine them via follow-up get_products calls within the same session, or execute them directly via create_media_buy.",
      "items": {
        "$ref": "/schemas/3.0.1/core/proposal.json"
      }
    },
    "errors": {
      "type": "array",
      "description": "Task-specific errors and warnings (e.g., product filtering issues)",
      "items": {
        "$ref": "/schemas/3.0.1/core/error.json"
      }
    },
    "property_list_applied": {
      "type": "boolean",
      "description": "[AdCP 3.0] Indicates whether property_list filtering was applied. True if the agent filtered products based on the provided property_list. Absent or false if property_list was not provided or not supported by this agent."
    },
    "catalog_applied": {
      "type": "boolean",
      "description": "Whether the seller filtered results based on the provided catalog. True if the seller matched catalog items against its inventory. Absent or false if no catalog was provided or the seller does not support catalog matching."
    },
    "refinement_applied": {
      "type": "array",
      "description": "Seller's response to each change request in the refine array, matched by position. Each entry acknowledges whether the corresponding ask was applied, partially applied, or unable to be fulfilled. MUST contain the same number of entries in the same order as the request's refine array. Only present when the request used buying_mode: 'refine'. Each entry MUST echo the request entry's scope and — for product and proposal scopes — the matching id field (product_id or proposal_id), so orchestrators can cross-validate alignment.",
      "items": {
        "type": "object",
        "discriminator": {
          "propertyName": "scope"
        },
        "oneOf": [
          {
            "properties": {
              "scope": {
                "type": "string",
                "const": "request",
                "description": "Echoes scope 'request' from the corresponding refine entry."
              },
              "status": {
                "type": "string",
                "enum": [
                  "applied",
                  "partial",
                  "unable"
                ],
                "description": "'applied': the ask was fulfilled. 'partial': the ask was partially fulfilled — see notes for details. 'unable': the seller could not fulfill the ask — see notes for why."
              },
              "notes": {
                "type": "string",
                "description": "Seller explanation of what was done, what couldn't be done, or why. Recommended when status is 'partial' or 'unable'."
              }
            },
            "required": [
              "scope",
              "status"
            ],
            "additionalProperties": false
          },
          {
            "properties": {
              "scope": {
                "type": "string",
                "const": "product",
                "description": "Echoes scope 'product' from the corresponding refine entry."
              },
              "product_id": {
                "type": "string",
                "description": "Echoes product_id from the corresponding refine entry."
              },
              "status": {
                "type": "string",
                "enum": [
                  "applied",
                  "partial",
                  "unable"
                ],
                "description": "'applied': the ask was fulfilled. 'partial': the ask was partially fulfilled — see notes for details. 'unable': the seller could not fulfill the ask — see notes for why."
              },
              "notes": {
                "type": "string",
                "description": "Seller explanation of what was done, what couldn't be done, or why. Recommended when status is 'partial' or 'unable'."
              }
            },
            "required": [
              "scope",
              "product_id",
              "status"
            ],
            "additionalProperties": false
          },
          {
            "properties": {
              "scope": {
                "type": "string",
                "const": "proposal",
                "description": "Echoes scope 'proposal' from the corresponding refine entry."
              },
              "proposal_id": {
                "type": "string",
                "description": "Echoes proposal_id from the corresponding refine entry."
              },
              "status": {
                "type": "string",
                "enum": [
                  "applied",
                  "partial",
                  "unable"
                ],
                "description": "'applied': the ask was fulfilled. 'partial': the ask was partially fulfilled — see notes for details. 'unable': the seller could not fulfill the ask — see notes for why."
              },
              "notes": {
                "type": "string",
                "description": "Seller explanation of what was done, what couldn't be done, or why. Recommended when status is 'partial' or 'unable'."
              }
            },
            "required": [
              "scope",
              "proposal_id",
              "status"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "incomplete": {
      "type": "array",
      "description": "Declares what the seller could not finish within the buyer's time_budget or due to internal limits. Each entry identifies a scope that is missing or partial. Absent when the response is fully complete.",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "enum": [
              "products",
              "pricing",
              "forecast",
              "proposals"
            ],
            "description": "'products': not all inventory sources were searched. 'pricing': products returned but pricing is absent or unconfirmed. 'forecast': products returned but forecast data is absent. 'proposals': proposals were not generated or are incomplete."
          },
          "description": {
            "type": "string",
            "description": "Human-readable explanation of what is missing and why."
          },
          "estimated_wait": {
            "allOf": [
              {
                "$ref": "/schemas/3.0.1/core/duration.json"
              }
            ],
            "description": "How much additional time would resolve this scope. Allows the buyer to decide whether to retry with a larger time_budget."
          }
        },
        "required": [
          "scope",
          "description"
        ],
        "additionalProperties": false
      }
    },
    "pagination": {
      "$ref": "/schemas/3.0.1/core/pagination-response.json"
    },
    "sandbox": {
      "type": "boolean",
      "description": "When true, this response contains simulated data from sandbox mode."
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "products"
  ],
  "additionalProperties": true
} as const;

export const createMediaBuyReq = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/media-buy/create-media-buy-request.json",
  "title": "Create Media Buy Request",
  "description": "Request parameters for creating a media buy. Supports two modes: (1) Manual mode - provide packages array with explicit line item configurations, or (2) Proposal mode - provide proposal_id and total_budget to execute a proposal from get_products. One of packages or proposal_id must be provided.",
  "x-mutates-state": true,
  "type": "object",
  "properties": {
    "adcp_major_version": {
      "type": "integer",
      "description": "The AdCP major version the buyer's payloads conform to. Sellers validate against their supported major_versions and return VERSION_UNSUPPORTED if unsupported. When omitted, the seller assumes its highest supported version.",
      "minimum": 1,
      "maximum": 99
    },
    "idempotency_key": {
      "type": "string",
      "description": "Client-generated unique key for this request. If a request with the same idempotency_key and account has already been processed, the seller returns the existing media buy rather than creating a duplicate. MUST be unique per (seller, request) pair to prevent cross-seller correlation. Use a fresh UUID v4 for each request.",
      "minLength": 16,
      "maxLength": 255,
      "pattern": "^[A-Za-z0-9_.:-]{16,255}$"
    },
    "plan_id": {
      "type": "string",
      "description": "Campaign governance plan identifier. Required when the account has governance_agents. The seller includes this in the committed check_governance request so the governance agent can validate against the correct plan.",
      "x-entity": "governance_plan"
    },
    "account": {
      "$ref": "/schemas/3.0.1/core/account-ref.json",
      "description": "Account to bill for this media buy. Pass a natural key (brand, operator, optional sandbox) or a seller-assigned account_id from list_accounts."
    },
    "proposal_id": {
      "type": "string",
      "description": "ID of a proposal from get_products to execute. When provided with total_budget, the publisher converts the proposal's allocation percentages into packages automatically. Alternative to providing packages array."
    },
    "total_budget": {
      "type": "object",
      "description": "Total budget for the media buy when executing a proposal. The publisher applies the proposal's allocation percentages to this amount to derive package budgets.",
      "properties": {
        "amount": {
          "type": "number",
          "description": "Total budget amount",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code"
        }
      },
      "required": [
        "amount",
        "currency"
      ],
      "additionalProperties": false
    },
    "packages": {
      "type": "array",
      "description": "Array of package configurations. Required when not using proposal_id. When executing a proposal, this can be omitted and packages will be derived from the proposal's allocations.",
      "items": {
        "$ref": "/schemas/3.0.1/media-buy/package-request.json"
      },
      "minItems": 1
    },
    "brand": {
      "$ref": "/schemas/3.0.1/core/brand-ref.json",
      "description": "Brand reference for this media buy. Resolved to full brand identity at execution time from brand.json or the registry."
    },
    "advertiser_industry": {
      "$ref": "/schemas/3.0.1/enums/advertiser-industry.json",
      "description": "Industry classification for this specific campaign. A brand may operate across multiple industries (brand.json industries field), but each media buy targets one. For example, a consumer health company running a wellness campaign sends 'healthcare.wellness', not 'cpg'. Sellers map this to platform-native codes (e.g., Spotify ADV categories, LinkedIn industry IDs). When omitted, sellers may infer from the brand manifest's industries field."
    },
    "invoice_recipient": {
      "$ref": "/schemas/3.0.1/core/business-entity.json",
      "description": "Override the account's default billing entity for this specific buy. When provided, the seller invoices this entity instead. The seller MUST validate the invoice recipient is authorized for this account. When governance_agents are configured, the seller MUST include invoice_recipient in the check_governance request."
    },
    "io_acceptance": {
      "type": "object",
      "description": "Acceptance of an insertion order from a committed proposal. Required when the proposal's insertion_order has requires_signature: true. References the io_id from the proposal's insertion_order.",
      "properties": {
        "io_id": {
          "type": "string",
          "description": "The io_id from the proposal's insertion_order being accepted"
        },
        "accepted_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when the IO was accepted"
        },
        "signatory": {
          "type": "string",
          "description": "Who accepted the IO — agent identifier or human name",
          "minLength": 1,
          "maxLength": 250
        },
        "signature_id": {
          "type": "string",
          "description": "Reference to the electronic signature from the signing service, when signing_url was used"
        }
      },
      "required": [
        "io_id",
        "accepted_at",
        "signatory"
      ],
      "additionalProperties": true
    },
    "po_number": {
      "type": "string",
      "description": "Purchase order number for tracking"
    },
    "agency_estimate_number": {
      "type": "string",
      "maxLength": 100,
      "description": "Agency estimate or authorization number. Primary financial reference for broadcast buys — links the order to the agency's media plan and billing system. Travels with the order and Ad-IDs through the transaction lifecycle."
    },
    "start_time": {
      "$ref": "/schemas/3.0.1/core/start-timing.json"
    },
    "end_time": {
      "type": "string",
      "format": "date-time",
      "description": "Campaign end date/time in ISO 8601 format"
    },
    "push_notification_config": {
      "$ref": "/schemas/3.0.1/core/push-notification-config.json",
      "description": "Optional webhook configuration for async task status notifications. Publisher will send webhooks when status changes (working, input-required, completed, failed). The client generates an operation_id and embeds it in the URL before sending — the publisher echoes it back in webhook payloads for correlation."
    },
    "reporting_webhook": {
      "$ref": "/schemas/3.0.1/core/reporting-webhook.json",
      "description": "Optional webhook configuration for automated reporting delivery"
    },
    "artifact_webhook": {
      "$comment": "Webhook configuration for content artifact delivery - enables governance validation. Same authentication structure as reporting_webhook.",
      "type": "object",
      "description": "Optional webhook configuration for content artifact delivery. Used by governance agents to validate content adjacency. Seller pushes artifacts to this endpoint; orchestrator forwards to governance agent for validation.",
      "properties": {
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Webhook endpoint URL for artifact delivery"
        },
        "token": {
          "type": "string",
          "description": "Optional client-provided token for webhook validation. Echoed back in webhook payload to validate request authenticity.",
          "minLength": 16
        },
        "authentication": {
          "type": "object",
          "description": "Authentication configuration for webhook delivery (A2A-compatible)",
          "properties": {
            "schemes": {
              "type": "array",
              "description": "Array of authentication schemes. Supported: ['Bearer'] for simple token auth, ['HMAC-SHA256'] for signature verification (recommended for production)",
              "items": {
                "$ref": "/schemas/3.0.1/enums/auth-scheme.json"
              },
              "minItems": 1,
              "maxItems": 1
            },
            "credentials": {
              "type": "string",
              "description": "Credentials for authentication. For Bearer: token sent in Authorization header. For HMAC-SHA256: shared secret used to generate signature. Minimum 32 characters. Exchanged out-of-band during onboarding.",
              "minLength": 32
            }
          },
          "required": [
            "schemes",
            "credentials"
          ],
          "additionalProperties": false
        },
        "delivery_mode": {
          "type": "string",
          "enum": [
            "realtime",
            "batched"
          ],
          "description": "How artifacts are delivered. 'realtime' pushes artifacts as impressions occur. 'batched' aggregates artifacts and pushes periodically (see batch_frequency)."
        },
        "batch_frequency": {
          "type": "string",
          "enum": [
            "hourly",
            "daily"
          ],
          "description": "For batched delivery, how often to push artifacts. Required when delivery_mode is 'batched'."
        },
        "sampling_rate": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "description": "Fraction of impressions to include (0-1). 1.0 = all impressions, 0.1 = 10% sample. Default: 1.0"
        }
      },
      "required": [
        "url",
        "authentication",
        "delivery_mode"
      ],
      "additionalProperties": true
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "idempotency_key",
    "account",
    "brand",
    "start_time",
    "end_time"
  ],
  "dependencies": {
    "proposal_id": [
      "total_budget"
    ]
  },
  "additionalProperties": true
} as const;

export const createMediaBuyRes = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/media-buy/create-media-buy-response.json",
  "title": "Create Media Buy Response",
  "description": "Response payload for create_media_buy. Exactly one of three shapes: (1) synchronous success — media_buy_id and packages are issued in-line, no status or a MediaBuyStatus value (pending_creatives / pending_start / active); (2) terminal failure — an errors array with no media-buy artifact and status != 'submitted'; (3) submitted task envelope — status 'submitted' with task_id, the media buy is queued or awaiting a human decision (e.g., IO signing), and media_buy_id / packages land on the task's completion artifact, not this response. The submitted branch MAY carry advisory errors for non-blocking warnings; terminal failures belong in the error branch. These three shapes are mutually exclusive — a response has exactly one.",
  "type": "object",
  "oneOf": [
    {
      "title": "CreateMediaBuySuccess",
      "description": "Success response - media buy created successfully",
      "type": "object",
      "properties": {
        "media_buy_id": {
          "type": "string",
          "description": "Seller's unique identifier for the created media buy",
          "x-entity": "media_buy"
        },
        "account": {
          "$ref": "/schemas/3.0.1/core/account.json",
          "description": "Account billed for this media buy. Includes advertiser, billing proxy (if any), and rate card applied."
        },
        "invoice_recipient": {
          "$ref": "/schemas/3.0.1/core/business-entity.json",
          "description": "Per-buy invoice recipient, echoed from the request when provided. Confirms the seller accepted the billing override. Bank details are omitted (write-only)."
        },
        "status": {
          "$ref": "/schemas/3.0.1/enums/media-buy-status.json",
          "description": "Initial media buy status. Either 'pending_creatives' (awaiting creative assets), 'pending_start' (ready to serve, waiting for flight date), or 'active' (immediate activation)."
        },
        "confirmed_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when this media buy was confirmed by the seller. A successful create_media_buy response constitutes order confirmation."
        },
        "creative_deadline": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp for creative upload deadline"
        },
        "revision": {
          "type": "integer",
          "description": "Initial revision number for this media buy. Use in subsequent update_media_buy requests for optimistic concurrency.",
          "minimum": 1
        },
        "valid_actions": {
          "type": "array",
          "description": "Actions the buyer can perform on this media buy after creation. Saves a round-trip to get_media_buys.",
          "items": {
            "$ref": "/schemas/3.0.1/enums/media-buy-valid-action.json"
          }
        },
        "packages": {
          "type": "array",
          "description": "Array of created packages with complete state information",
          "items": {
            "$ref": "/schemas/3.0.1/core/package.json"
          }
        },
        "planned_delivery": {
          "$ref": "/schemas/3.0.1/core/planned-delivery.json",
          "description": "The seller's interpreted delivery parameters. Describes what the seller will actually run -- geo, channels, flight dates, frequency caps, and budget. Present when the account has governance_agents or when the seller chooses to provide delivery transparency."
        },
        "sandbox": {
          "type": "boolean",
          "description": "When true, this response contains simulated data from sandbox mode."
        },
        "context": {
          "$ref": "/schemas/3.0.1/core/context.json"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "media_buy_id",
        "packages"
      ],
      "additionalProperties": true,
      "not": {
        "required": [
          "errors"
        ]
      }
    },
    {
      "title": "CreateMediaBuyError",
      "description": "Error response - operation failed, no media buy created",
      "type": "object",
      "properties": {
        "errors": {
          "type": "array",
          "description": "Array of errors explaining why the operation failed",
          "items": {
            "$ref": "/schemas/3.0.1/core/error.json"
          },
          "minItems": 1
        },
        "context": {
          "$ref": "/schemas/3.0.1/core/context.json"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "errors"
      ],
      "additionalProperties": true,
      "not": {
        "anyOf": [
          {
            "required": [
              "media_buy_id"
            ]
          },
          {
            "required": [
              "packages"
            ]
          },
          {
            "required": [
              "sandbox"
            ]
          },
          {
            "properties": {
              "status": {
                "const": "submitted"
              }
            },
            "required": [
              "status"
            ]
          }
        ]
      }
    },
    {
      "title": "CreateMediaBuySubmitted",
      "description": "Async task envelope returned when the media buy cannot be confirmed before the response is emitted — for example, when a guaranteed buy requires IO signing, when governance review is outstanding, or when the seller has queued the request for batch processing. The buyer polls tasks/get with task_id or receives a webhook when the task completes; the media_buy_id and packages land on the completion artifact, not this envelope. Do not use a 'pending_approval' MediaBuy.status for this case — that value is not in MediaBuyStatus; IO review and similar pre-issuance workflows are modeled at the task layer only.",
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "const": "submitted",
          "description": "Task-level status literal. Discriminates this async envelope from the synchronous success shape, whose status field carries a MediaBuyStatus value (pending_creatives, pending_start, active). See task-status.json for the full task-status enum."
        },
        "task_id": {
          "type": "string",
          "description": "Task handle the buyer uses with tasks/get, and that the seller references on push-notification callbacks. The media_buy_id is issued on the completion artifact, not here. Per AdCP wire conventions this is snake_case; A2A adapters MAY surface it as taskId, but the payload field emitted by the agent is task_id.",
          "x-entity": "task"
        },
        "message": {
          "type": "string",
          "maxLength": 2000,
          "description": "Optional human-readable explanation of why the task is submitted — e.g., 'Awaiting IO signature from sales team; typical turnaround 2–4 hours.' Plain text only. Buyers MUST treat this as untrusted seller input: escape before rendering to HTML UIs, and sanitize or isolate before passing to an LLM prompt context — a hostile seller may inject prompt-injection payloads aimed at the buyer's agent."
        },
        "errors": {
          "type": "array",
          "description": "Optional advisory errors accompanying the submitted envelope. Use only for non-blocking warnings (e.g., throttled_severity advisories, governance observations). Terminal failures belong in the error branch, not here.",
          "items": {
            "$ref": "/schemas/3.0.1/core/error.json"
          }
        },
        "context": {
          "$ref": "/schemas/3.0.1/core/context.json"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "status",
        "task_id"
      ],
      "additionalProperties": true,
      "not": {
        "anyOf": [
          {
            "required": [
              "media_buy_id"
            ]
          },
          {
            "required": [
              "packages"
            ]
          }
        ]
      }
    }
  ]
} as const;

export const signalId = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/signal-id.json",
  "title": "Signal ID",
  "description": "Universal signal identifier. Uses 'source' as discriminator: 'catalog' for signals from a data provider's published catalog (verifiable), 'agent' for agent-native signals (not externally verifiable).",
  "x-entity": "signal",
  "discriminator": {
    "propertyName": "source"
  },
  "oneOf": [
    {
      "type": "object",
      "description": "Catalog signal - references a signal from a data provider's published catalog. Buyers can verify authorization by checking the data provider's adagents.json.",
      "properties": {
        "source": {
          "type": "string",
          "const": "catalog",
          "description": "Discriminator indicating this signal is from a data provider's published catalog"
        },
        "data_provider_domain": {
          "type": "string",
          "description": "Domain of the data provider that owns this signal (e.g., 'polk.com', 'experian.com'). The signal definition is published at this domain's /.well-known/adagents.json",
          "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$"
        },
        "id": {
          "type": "string",
          "pattern": "^[a-zA-Z0-9_-]+$",
          "description": "Signal identifier within the data provider's catalog (e.g., 'likely_tesla_buyers', 'income_100k_plus')"
        }
      },
      "required": [
        "source",
        "data_provider_domain",
        "id"
      ],
      "additionalProperties": true
    },
    {
      "type": "object",
      "description": "Agent signal - references a signal native to the signals agent. Not externally verifiable; buyer trusts the agent's claim about the signal.",
      "properties": {
        "source": {
          "type": "string",
          "const": "agent",
          "description": "Discriminator indicating this signal is native to the agent (not from a data provider catalog)"
        },
        "agent_url": {
          "type": "string",
          "format": "uri",
          "description": "URL of the signals agent that provides this signal (e.g., 'https://liveramp.com/.well-known/adcp/signals')"
        },
        "id": {
          "type": "string",
          "pattern": "^[a-zA-Z0-9_-]+$",
          "description": "Signal identifier within the agent's signal set (e.g., 'custom_auto_intenders')"
        }
      },
      "required": [
        "source",
        "agent_url",
        "id"
      ],
      "additionalProperties": true
    }
  ]
} as const;

export const deployment = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/deployment.json",
  "title": "Deployment",
  "description": "A signal deployment to a specific deployment target with activation status and key",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "const": "platform",
          "description": "Discriminator indicating this is a platform-based deployment"
        },
        "platform": {
          "type": "string",
          "description": "Platform identifier for DSPs"
        },
        "account": {
          "type": "string",
          "description": "Account identifier if applicable"
        },
        "is_live": {
          "type": "boolean",
          "description": "Whether signal is currently active on this deployment"
        },
        "activation_key": {
          "$ref": "/schemas/3.0.1/core/activation-key.json",
          "description": "The key to use for targeting. Only present if is_live=true AND requester has access to this deployment."
        },
        "estimated_activation_duration_minutes": {
          "type": "number",
          "description": "Estimated time to activate if not live, or to complete activation if in progress",
          "minimum": 0
        },
        "deployed_at": {
          "type": "string",
          "format": "date-time",
          "description": "Timestamp when activation completed (if is_live=true)"
        }
      },
      "required": [
        "type",
        "platform",
        "is_live"
      ],
      "additionalProperties": true
    },
    {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "const": "agent",
          "description": "Discriminator indicating this is an agent URL-based deployment"
        },
        "agent_url": {
          "type": "string",
          "format": "uri",
          "description": "URL identifying the deployment agent"
        },
        "account": {
          "type": "string",
          "description": "Account identifier if applicable"
        },
        "is_live": {
          "type": "boolean",
          "description": "Whether signal is currently active on this deployment"
        },
        "activation_key": {
          "$ref": "/schemas/3.0.1/core/activation-key.json",
          "description": "The key to use for targeting. Only present if is_live=true AND requester has access to this deployment."
        },
        "estimated_activation_duration_minutes": {
          "type": "number",
          "description": "Estimated time to activate if not live, or to complete activation if in progress",
          "minimum": 0
        },
        "deployed_at": {
          "type": "string",
          "format": "date-time",
          "description": "Timestamp when activation completed (if is_live=true)"
        }
      },
      "required": [
        "type",
        "agent_url",
        "is_live"
      ],
      "additionalProperties": true
    }
  ]
} as const;

export const destination = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/destination.json",
  "title": "Destination",
  "description": "A deployment target where signals can be activated (DSP, sales agent, etc.)",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "type": {
          "const": "platform",
          "description": "Discriminator indicating this is a platform-based deployment"
        },
        "platform": {
          "type": "string",
          "description": "Platform identifier for DSPs (e.g., 'the-trade-desk', 'amazon-dsp')"
        },
        "account": {
          "type": "string",
          "description": "Optional account identifier on the platform"
        }
      },
      "required": [
        "type",
        "platform"
      ],
      "additionalProperties": true
    },
    {
      "type": "object",
      "properties": {
        "type": {
          "const": "agent",
          "description": "Discriminator indicating this is an agent URL-based deployment"
        },
        "agent_url": {
          "type": "string",
          "format": "uri",
          "description": "URL identifying the deployment agent (for sales agents, etc.)"
        },
        "account": {
          "type": "string",
          "description": "Optional account identifier on the agent"
        }
      },
      "required": [
        "type",
        "agent_url"
      ],
      "additionalProperties": true
    }
  ]
} as const;

export const accountRef = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/account-ref.json",
  "title": "Account Reference",
  "description": "Reference to an account by seller-assigned ID or natural key. Use account_id for explicit accounts (require_operator_auth: true, discovered via list_accounts). Use the natural key (brand + operator) for implicit accounts (require_operator_auth: false, declared via sync_accounts). For sandbox: explicit accounts use account_id (pre-existing test account), implicit accounts use the natural key with sandbox: true.",
  "type": "object",
  "oneOf": [
    {
      "properties": {
        "account_id": {
          "type": "string",
          "description": "Seller-assigned account identifier (from sync_accounts or list_accounts)",
          "x-entity": "account"
        }
      },
      "required": [
        "account_id"
      ],
      "additionalProperties": false
    },
    {
      "properties": {
        "brand": {
          "$ref": "/schemas/3.0.1/core/brand-ref.json",
          "description": "Brand reference identifying the advertiser"
        },
        "operator": {
          "type": "string",
          "description": "Domain of the entity operating on the brand's behalf. When the brand operates directly, this is the brand's domain.",
          "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$",
          "x-entity": "operator"
        },
        "sandbox": {
          "type": "boolean",
          "description": "When true, references the sandbox account for this brand/operator pair. Defaults to false (production account).",
          "default": false
        }
      },
      "required": [
        "brand",
        "operator"
      ],
      "additionalProperties": false
    }
  ],
  "examples": [
    {
      "account_id": "acc_acme_001"
    },
    {
      "brand": {
        "domain": "acme-corp.com"
      },
      "operator": "acme-corp.com"
    },
    {
      "brand": {
        "domain": "nova-brands.com",
        "brand_id": "spark"
      },
      "operator": "pinnacle-media.com"
    },
    {
      "brand": {
        "domain": "acme-corp.com"
      },
      "operator": "acme-corp.com",
      "sandbox": true
    }
  ]
} as const;

export const context = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/context.json",
  "title": "Context Object",
  "description": "Opaque correlation data that is echoed unchanged in responses. Used for internal tracking, UI session IDs, trace IDs, and other caller-specific identifiers that don't affect protocol behavior. Context data is never parsed by AdCP agents - it's simply preserved and returned.",
  "type": "object",
  "additionalProperties": true
} as const;

export const ext = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/ext.json",
  "title": "Extension Object",
  "description": "Extension object for platform-specific, vendor-namespaced parameters. Extensions are always optional and must be namespaced under a vendor/platform key (e.g., ext.gam, ext.roku). Used for custom capabilities, partner-specific configuration, and features being proposed for standardization.",
  "type": "object",
  "additionalProperties": true
} as const;

export const error = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/error.json",
  "title": "Error",
  "description": "Standard error structure for task-specific errors and warnings",
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "description": "Error code for programmatic handling. Standard codes are defined in error-code.json and enable autonomous agent recovery. Sellers MAY use codes not in the standard vocabulary for platform-specific errors; agents MUST handle unknown codes gracefully by falling back to the recovery classification."
    },
    "message": {
      "type": "string",
      "description": "Human-readable error message"
    },
    "field": {
      "type": "string",
      "description": "Field path associated with the error (e.g., 'packages[0].targeting')"
    },
    "suggestion": {
      "type": "string",
      "description": "Suggested fix for the error"
    },
    "retry_after": {
      "type": "number",
      "description": "Seconds to wait before retrying the operation. Sellers MUST return values between 1 and 3600. Clients MUST clamp values outside this range.",
      "minimum": 1,
      "maximum": 3600
    },
    "details": {
      "type": "object",
      "description": "Additional task-specific error details",
      "additionalProperties": true
    },
    "recovery": {
      "type": "string",
      "enum": [
        "transient",
        "correctable",
        "terminal"
      ],
      "description": "Agent recovery classification. transient: retry after delay (rate limit, service unavailable, timeout). correctable: fix the request and resend (invalid field, budget too low, creative rejected). terminal: requires human action (account suspended, payment required, account not found)."
    }
  },
  "required": [
    "code",
    "message"
  ],
  "additionalProperties": true
} as const;

export const paginationReq = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/pagination-request.json",
  "title": "Pagination Request",
  "description": "Standard cursor-based pagination parameters for list operations",
  "type": "object",
  "properties": {
    "max_results": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 50,
      "description": "Maximum number of items to return per page"
    },
    "cursor": {
      "type": "string",
      "description": "Opaque cursor from a previous response to fetch the next page"
    }
  },
  "additionalProperties": false
} as const;

export const paginationRes = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/pagination-response.json",
  "title": "Pagination Response",
  "description": "Standard cursor-based pagination metadata for list responses",
  "type": "object",
  "properties": {
    "has_more": {
      "type": "boolean",
      "description": "Whether more results are available beyond this page"
    },
    "cursor": {
      "type": "string",
      "description": "Opaque cursor to pass in the next request to fetch the next page. Only present when has_more is true."
    },
    "total_count": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of items matching the query across all pages. Optional because not all backends can efficiently compute this."
    }
  },
  "required": [
    "has_more"
  ],
  "additionalProperties": false
} as const;

export const signalFilters = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/signal-filters.json",
  "title": "Signal Filters",
  "description": "Filters to refine signal discovery results",
  "type": "object",
  "properties": {
    "catalog_types": {
      "type": "array",
      "description": "Filter by catalog type",
      "items": {
        "$ref": "/schemas/3.0.1/enums/signal-catalog-type.json"
      },
      "minItems": 1
    },
    "data_providers": {
      "type": "array",
      "description": "Filter by specific data providers",
      "items": {
        "type": "string"
      },
      "minItems": 1
    },
    "max_cpm": {
      "type": "number",
      "description": "Maximum CPM filter. Applies only to signals with model='cpm'.",
      "minimum": 0
    },
    "max_percent": {
      "type": "number",
      "description": "Maximum percent-of-media rate filter. Signals where all percent_of_media pricing options exceed this value are excluded. Does not account for max_cpm caps.",
      "minimum": 0,
      "maximum": 100
    },
    "min_coverage_percentage": {
      "type": "number",
      "description": "Minimum coverage requirement",
      "minimum": 0,
      "maximum": 100
    }
  },
  "additionalProperties": true
} as const;

export const vendorPricingOption = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/vendor-pricing-option.json",
  "title": "Vendor Pricing Option",
  "description": "A pricing option offered by a vendor agent (signals, creative, governance). Combines pricing_option_id with the pricing model fields. Pass pricing_option_id in report_usage for billing verification. All vendor discovery responses return pricing_options as an array — vendors may offer multiple options (volume tiers, context-specific rates, different models per product line).",
  "allOf": [
    {
      "type": "object",
      "properties": {
        "pricing_option_id": {
          "type": "string",
          "description": "Opaque identifier for this pricing option, unique within the vendor agent. Pass this in report_usage to identify which pricing option was applied.",
          "x-entity": "vendor_pricing_option"
        }
      },
      "required": [
        "pricing_option_id"
      ]
    },
    {
      "$ref": "/schemas/3.0.1/core/signal-pricing.json"
    }
  ]
} as const;

export const signalPricing = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/signal-pricing.json",
  "title": "Vendor Pricing",
  "description": "Pricing model for a vendor service. Discriminated by model: 'cpm' (fixed CPM), 'percent_of_media' (percentage of spend with optional CPM cap), 'flat_fee' (fixed charge per reporting period), 'per_unit' (fixed price per unit of work), or 'custom' (escape hatch for models not covered by the enumerated forms — requires a description and structured metadata).",
  "type": "object",
  "oneOf": [
    {
      "title": "CpmPricing",
      "description": "Fixed cost per thousand impressions",
      "type": "object",
      "properties": {
        "model": {
          "type": "string",
          "const": "cpm"
        },
        "cpm": {
          "type": "number",
          "description": "Cost per thousand impressions",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code",
          "pattern": "^[A-Z]{3}$"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "model",
        "cpm",
        "currency"
      ],
      "additionalProperties": true
    },
    {
      "title": "PercentOfMediaPricing",
      "description": "Percentage of media spend charged for this signal. When max_cpm is set, the effective rate is capped at that CPM — useful for platforms like The Trade Desk that use percent-of-media pricing with a CPM ceiling.",
      "type": "object",
      "properties": {
        "model": {
          "type": "string",
          "const": "percent_of_media"
        },
        "percent": {
          "type": "number",
          "description": "Percentage of media spend, e.g. 15 = 15%",
          "minimum": 0,
          "maximum": 100
        },
        "max_cpm": {
          "type": "number",
          "description": "Optional CPM cap. When set, the effective charge is min(percent × media_spend_per_mille, max_cpm).",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code for the resulting charge",
          "pattern": "^[A-Z]{3}$"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "model",
        "percent",
        "currency"
      ],
      "additionalProperties": true
    },
    {
      "title": "FlatFeePricing",
      "description": "Fixed charge per billing period, regardless of impressions or spend. Used for licensed data bundles and audience subscriptions.",
      "type": "object",
      "properties": {
        "model": {
          "type": "string",
          "const": "flat_fee"
        },
        "amount": {
          "type": "number",
          "description": "Fixed charge for the billing period",
          "minimum": 0
        },
        "period": {
          "type": "string",
          "enum": [
            "monthly",
            "quarterly",
            "annual",
            "campaign"
          ],
          "description": "Billing period for the flat fee."
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code",
          "pattern": "^[A-Z]{3}$"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "model",
        "amount",
        "period",
        "currency"
      ],
      "additionalProperties": true
    },
    {
      "title": "PerUnitPricing",
      "description": "Fixed price per unit of work. Used for creative transformation (per format), AI generation (per image, per token), and rendering (per variant). The unit field describes what is counted; unit_price is the cost per one unit.",
      "type": "object",
      "properties": {
        "model": {
          "type": "string",
          "const": "per_unit"
        },
        "unit": {
          "type": "string",
          "description": "What is counted — e.g. 'format', 'image', 'token', 'variant', 'render', 'evaluation'."
        },
        "unit_price": {
          "type": "number",
          "description": "Cost per one unit",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code",
          "pattern": "^[A-Z]{3}$"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "model",
        "unit",
        "unit_price",
        "currency"
      ],
      "additionalProperties": true
    },
    {
      "title": "CustomPricing",
      "description": "Escape hatch for pricing constructs that do not fit cpm, percent_of_media, flat_fee, or per_unit. Use when a vendor prices via performance kickers, tiered volume, hybrid formulas, outcome-sharing, or any other model the standard forms cannot express. Requires a human-readable description and a structured metadata object that captures the parameters a buyer needs to reason about the charge. Buyers SHOULD route custom pricing through operator review before commitment — automatic selection is not recommended.",
      "type": "object",
      "properties": {
        "model": {
          "type": "string",
          "const": "custom"
        },
        "description": {
          "type": "string",
          "description": "Human-readable description of the custom pricing model. Buyers display this to the operator when requesting approval.",
          "minLength": 1
        },
        "metadata": {
          "type": "object",
          "description": "Structured parameters for the custom model. Keys follow lowercase_snake_case. Values may be primitives, arrays, or nested objects. Must be sufficient for a human to understand the pricing basis and for a downstream system to reconstruct the charge. Vendors SHOULD include a `summary_for_operator` string (one or two sentences, suitable for display in a buyer's operator-review UI) so reviewers across vendors see a consistent prompt. Required operator-review fields (approver role, dollar threshold for automatic approval, escalation contact) MAY be surfaced via additional keys the buyer's review surface recognizes.",
          "additionalProperties": true,
          "minProperties": 1,
          "properties": {
            "summary_for_operator": {
              "type": "string",
              "description": "One or two sentences describing the pricing construct in plain language, displayed to the buyer's operator when requesting approval. Should not repeat the top-level `description` verbatim — summarize the charge mechanic instead (e.g., 'Base $12 CPM plus $0.50 per qualifying post-view conversion, capped at $45 CPM').",
              "minLength": 1
            }
          }
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code. Present when the pricing resolves to a monetary charge in a specific currency.",
          "pattern": "^[A-Z]{3}$"
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "required": [
        "model",
        "description",
        "metadata"
      ],
      "additionalProperties": true
    }
  ]
} as const;

export const signalPricingOption = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/signal-pricing-option.json",
  "title": "Signal Pricing Option",
  "description": "Deprecated — use vendor-pricing-option.json for new implementations. This alias is retained for backward compatibility.",
  "$ref": "/schemas/3.0.1/core/vendor-pricing-option.json"
} as const;

export const pricingOption = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/pricing-option.json",
  "title": "Pricing Option",
  "description": "A pricing model option offered by a publisher for a product. Discriminated by pricing_model field. If fixed_price is present, it's fixed pricing. If absent, it's auction-based (floor_price and price_guidance optional). Bid-based auction models may also include max_bid as a boolean signal to interpret bid_price as a buyer ceiling instead of an exact honored price.",
  "oneOf": [
    {
      "$ref": "/schemas/3.0.1/pricing-options/cpm-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/vcpm-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/cpc-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/cpcv-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/cpv-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/cpp-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/cpa-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/flat-rate-option.json"
    },
    {
      "$ref": "/schemas/3.0.1/pricing-options/time-option.json"
    }
  ]
} as const;

export const activationKey = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/activation-key.json",
  "title": "Activation Key",
  "description": "Universal identifier for using a signal on a destination platform. Can be either a segment ID or a key-value pair depending on the platform's targeting mechanism.",
  "type": "object",
  "oneOf": [
    {
      "properties": {
        "type": {
          "type": "string",
          "const": "segment_id",
          "description": "Segment ID based targeting"
        },
        "segment_id": {
          "type": "string",
          "description": "The platform-specific segment identifier to use in campaign targeting"
        }
      },
      "required": [
        "type",
        "segment_id"
      ],
      "additionalProperties": true
    },
    {
      "properties": {
        "type": {
          "type": "string",
          "const": "key_value",
          "description": "Key-value pair based targeting"
        },
        "key": {
          "type": "string",
          "description": "The targeting parameter key"
        },
        "value": {
          "type": "string",
          "description": "The targeting parameter value"
        }
      },
      "required": [
        "type",
        "key",
        "value"
      ],
      "additionalProperties": true
    }
  ]
} as const;

export const signalValueType = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/signal-value-type.json",
  "title": "Signal Value Type",
  "description": "The data type of a signal's values, determining how it can be targeted",
  "type": "string",
  "enum": [
    "binary",
    "categorical",
    "numeric"
  ],
  "x-enum-descriptions": {
    "binary": "Boolean signal - user either matches or doesn't (e.g., 'likely_tesla_buyers')",
    "categorical": "Signal with discrete values from a defined set (e.g., 'vehicle_ownership' with values 'tesla', 'bmw', etc.)",
    "numeric": "Signal with continuous numeric values within a range (e.g., 'purchase_propensity' from 0.0 to 1.0)"
  }
} as const;

export const signalCatalogType = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/signal-catalog-type.json",
  "title": "Signal Catalog Type",
  "description": "Types of signal catalogs available for audience targeting",
  "type": "string",
  "enum": [
    "marketplace",
    "custom",
    "owned"
  ],
  "enumDescriptions": {
    "marketplace": "Resold third-party segments (provider authorization verifiable via the provider's adagents.json)",
    "custom": "Agent-native segment built on demand from models, composites, or buyer inputs — not attributable to a standing upstream provider",
    "owned": "First-party segments derived from data the signal agent directly owns (retailer purchase data, publisher behavioral data, telco data)"
  }
} as const;

export const taskStatus = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/task-status.json",
  "title": "Task Status",
  "description": "Standardized task status values based on A2A TaskState enum. Indicates the current state of any AdCP operation.",
  "type": "string",
  "enum": [
    "submitted",
    "working",
    "input-required",
    "completed",
    "canceled",
    "failed",
    "rejected",
    "auth-required",
    "unknown"
  ],
  "enumDescriptions": {
    "submitted": "Task accepted and queued for long-running execution (hours to days). Client should poll with tasks/get or provide webhook_url at protocol level.",
    "working": "Agent is actively processing the task, expect completion within 120 seconds",
    "input-required": "Task is paused and waiting for input from the user (e.g., clarification, approval)",
    "completed": "Task has been successfully completed",
    "canceled": "Task was canceled by the user",
    "failed": "Task failed due to an error during execution",
    "rejected": "Task was rejected by the agent and was not started",
    "auth-required": "Task requires authentication to proceed",
    "unknown": "Task is in an unknown or indeterminate state"
  }
} as const;

export const brandId = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/brand-id.json",
  "title": "Brand ID",
  "description": "Identifier for a brand within a house portfolio. Must be lowercase alphanumeric with underscores only. The house chooses this identifier.",
  "type": "string",
  "pattern": "^[a-z0-9_]+$",
  "x-entity": "advertiser_brand",
  "examples": [
    "tide",
    "cheerios",
    "air_jordan",
    "nike",
    "pampers"
  ]
} as const;

export const brandRef = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/brand-ref.json",
  "title": "Brand Reference",
  "description": "Reference to a brand by domain and optional brand_id. The domain hosts /.well-known/brand.json or is registered in the brand registry. For single-brand domains, brand_id can be omitted. For house-of-brands domains, brand_id identifies the specific brand.",
  "type": "object",
  "properties": {
    "domain": {
      "type": "string",
      "description": "Domain where /.well-known/brand.json is hosted, or the brand's operating domain",
      "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$"
    },
    "brand_id": {
      "$ref": "/schemas/3.0.1/core/brand-id.json",
      "description": "Brand identifier within the house portfolio. Optional for single-brand domains."
    },
    "industries": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Inline override for the brand's industries. Useful when the caller cannot modify the brand's canonical brand.json but needs to declare industries for governance (e.g., Annex III vertical detection). brand.json remains the canonical source; when omitted here, governance agents SHOULD resolve from brand.json."
    },
    "data_subject_contestation": {
      "type": "object",
      "description": "Inline override for the brand's contestation contact point. Useful when the operator does not control brand.json but needs to discharge Art 22(3) for this plan. brand.json is canonical; when omitted, governance agents resolve brand → house → missing.",
      "properties": {
        "url": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://"
        },
        "email": {
          "type": "string",
          "format": "email"
        },
        "languages": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "anyOf": [
        {
          "required": [
            "url"
          ]
        },
        {
          "required": [
            "email"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  "required": [
    "domain"
  ],
  "additionalProperties": false,
  "examples": [
    {
      "domain": "nova-brands.com",
      "brand_id": "spark"
    },
    {
      "domain": "nova-brands.com",
      "brand_id": "glow"
    },
    {
      "domain": "acme-corp.com"
    }
  ]
} as const;

export const account = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/account.json",
  "title": "Account",
  "description": "A billing account representing the relationship between a buyer and seller. The account determines rate cards, payment terms, and billing entity.",
  "type": "object",
  "properties": {
    "account_id": {
      "type": "string",
      "description": "Unique identifier for this account",
      "x-entity": "account"
    },
    "name": {
      "type": "string",
      "description": "Human-readable account name (e.g., 'Acme', 'Acme c/o Pinnacle')"
    },
    "advertiser": {
      "type": "string",
      "description": "The advertiser whose rates apply to this account"
    },
    "billing_proxy": {
      "type": "string",
      "description": "Optional intermediary who receives invoices on behalf of the advertiser (e.g., agency)"
    },
    "status": {
      "$ref": "/schemas/3.0.1/enums/account-status.json",
      "description": "Account lifecycle status. See the Accounts Protocol overview for the operations matrix showing which tasks are permitted in each state."
    },
    "brand": {
      "$ref": "/schemas/3.0.1/core/brand-ref.json",
      "description": "Brand reference identifying the advertiser"
    },
    "operator": {
      "type": "string",
      "description": "Domain of the entity operating this account. When the brand operates directly, this is the brand's domain.",
      "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$",
      "x-entity": "operator"
    },
    "billing": {
      "$ref": "/schemas/3.0.1/enums/billing-party.json",
      "description": "Who is invoiced on this account. See billing_entity for the invoiced party's business details."
    },
    "billing_entity": {
      "$ref": "/schemas/3.0.1/core/business-entity.json",
      "description": "Business entity details for the party responsible for payment. Contains the legal name, tax IDs, address, and bank details needed for formal B2B invoicing. Corresponds to whoever billing points to (operator, agent, or advertiser). When this account appears in a response, bank details MUST be omitted (write-only)."
    },
    "rate_card": {
      "type": "string",
      "description": "Identifier for the rate card applied to this account"
    },
    "payment_terms": {
      "$ref": "/schemas/3.0.1/enums/payment-terms.json",
      "description": "Payment terms agreed for this account. Binding for all invoices when the account is active."
    },
    "credit_limit": {
      "type": "object",
      "description": "Maximum outstanding balance allowed",
      "properties": {
        "amount": {
          "type": "number",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        }
      },
      "required": [
        "amount",
        "currency"
      ]
    },
    "setup": {
      "type": "object",
      "description": "Present when status is 'pending_approval'. Contains next steps for completing account activation.",
      "properties": {
        "url": {
          "type": "string",
          "format": "uri",
          "description": "URL where the human can complete the required action (credit application, legal agreement, add funds)."
        },
        "message": {
          "type": "string",
          "description": "Human-readable description of what's needed."
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "When this setup link expires."
        }
      },
      "required": [
        "message"
      ],
      "additionalProperties": true
    },
    "account_scope": {
      "$ref": "/schemas/3.0.1/enums/account-scope.json"
    },
    "governance_agents": {
      "type": "array",
      "description": "Governance agent endpoints registered on this account. Authentication credentials are write-only and not included in responses — use sync_governance to set or update credentials.",
      "items": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "format": "uri",
            "pattern": "^https://",
            "description": "Governance agent endpoint URL. Must use HTTPS."
          },
          "categories": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 64,
              "pattern": "^[a-z][a-z0-9_]*$"
            },
            "description": "Governance categories this agent handles (e.g., ['budget_authority', 'strategic_alignment']). When omitted, the agent handles all categories.",
            "maxItems": 20
          }
        },
        "required": [
          "url"
        ],
        "additionalProperties": false
      },
      "maxItems": 10
    },
    "reporting_bucket": {
      "type": "object",
      "description": "Cloud storage bucket where the seller delivers offline reporting files for this account. Seller provisions a dedicated bucket or a per-account prefix within a shared bucket, and grants the buyer read access out-of-band. Access MUST be scoped at the IAM layer so each account can only read its own prefix — bucket-wide grants are non-compliant even with per-account prefixes. Seller MUST revoke access when the account's status transitions to inactive, suspended, or closed. See security considerations for offline delivery in docs/media-buy/media-buys/optimization-reporting. Only present when the seller supports offline delivery (reporting_delivery_methods includes 'offline' in capabilities).",
      "properties": {
        "protocol": {
          "$ref": "/schemas/3.0.1/enums/cloud-storage-protocol.json",
          "description": "Cloud storage protocol"
        },
        "bucket": {
          "type": "string",
          "description": "Bucket or container name",
          "minLength": 3,
          "maxLength": 63,
          "pattern": "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
        },
        "prefix": {
          "type": "string",
          "description": "Path prefix within the bucket. Seller appends date-based partitioning beneath this prefix.",
          "maxLength": 512,
          "pattern": "^[a-zA-Z0-9/_.-]+$",
          "examples": [
            "accounts/pinnacle/adcp",
            "reporting/2024"
          ]
        },
        "region": {
          "type": "string",
          "description": "Cloud region for the bucket",
          "maxLength": 64,
          "pattern": "^[a-z0-9-]+$",
          "examples": [
            "us-east-1",
            "europe-west1"
          ]
        },
        "format": {
          "type": "string",
          "enum": [
            "jsonl",
            "csv",
            "parquet",
            "avro",
            "orc"
          ],
          "description": "File format for delivered files. Parquet, Avro, and ORC use internal compression (the top-level compression field is ignored for these formats).",
          "default": "jsonl"
        },
        "compression": {
          "type": "string",
          "enum": [
            "gzip",
            "none"
          ],
          "description": "Compression applied to delivered files",
          "default": "gzip"
        },
        "file_retention_days": {
          "type": "integer",
          "description": "How long reporting files are retained in the bucket before deletion. Buyers must read files within this window. Minimum recommended: 14 days.",
          "minimum": 1,
          "examples": [
            14,
            30,
            90
          ]
        },
        "setup_instructions": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "description": "URL to documentation for configuring buyer read access to this bucket (IAM role, service account, etc.). Operator-facing documentation — buyer agents MUST NOT auto-fetch this URL; surface it to a human operator. If an implementation fetches it (for preview), apply webhook URL SSRF validation and do not pass the fetched content into an LLM context without indirect-prompt-injection guarding. See docs/media-buy/media-buys/optimization-reporting#security-considerations-for-offline-delivery."
        }
      },
      "required": [
        "protocol",
        "bucket",
        "file_retention_days"
      ],
      "additionalProperties": false
    },
    "sandbox": {
      "type": "boolean",
      "description": "When true, this is a sandbox account — no real platform calls, no real spend. For explicit accounts (require_operator_auth: true), sandbox accounts are pre-existing test accounts on the platform discovered via list_accounts. For implicit accounts, sandbox is part of the natural key: the same brand/operator pair can have both a production and sandbox account."
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "account_id",
    "name",
    "status"
  ],
  "additionalProperties": true,
  "examples": [
    {
      "description": "Direct advertiser account",
      "data": {
        "account_id": "acc_acme_direct",
        "name": "Acme",
        "advertiser": "Acme Corp",
        "brand": {
          "domain": "acme-corp.com"
        },
        "operator": "acme-corp.com",
        "status": "active",
        "billing": "operator",
        "account_scope": "brand",
        "rate_card": "acme_vip_2024",
        "payment_terms": "net_30"
      }
    },
    {
      "description": "Advertiser account with agency billing proxy",
      "data": {
        "account_id": "acc_acme_pinnacle",
        "name": "Acme c/o Pinnacle",
        "advertiser": "Acme Corp",
        "billing_proxy": "Pinnacle Media",
        "brand": {
          "domain": "acme-corp.com"
        },
        "operator": "pinnacle-media.com",
        "status": "active",
        "billing": "operator",
        "account_scope": "operator_brand",
        "rate_card": "acme_vip_2024",
        "payment_terms": "net_60"
      }
    },
    {
      "description": "Agency as direct buyer",
      "data": {
        "account_id": "acc_pinnacle",
        "name": "Pinnacle",
        "advertiser": "Pinnacle Media",
        "brand": {
          "domain": "pinnacle-media.com"
        },
        "operator": "pinnacle-media.com",
        "status": "active",
        "billing": "operator",
        "account_scope": "operator",
        "rate_card": "agency_standard",
        "payment_terms": "net_45"
      }
    },
    {
      "description": "Account with brand identity and operator (via sync_accounts)",
      "data": {
        "account_id": "acc_spark_001",
        "name": "Spark (via Pinnacle)",
        "advertiser": "Nova Brands",
        "status": "active",
        "brand": {
          "domain": "nova-brands.com",
          "brand_id": "spark"
        },
        "operator": "pinnacle-media.com",
        "billing": "agent",
        "account_scope": "operator_brand",
        "payment_terms": "net_30"
      }
    },
    {
      "description": "Pending account awaiting seller approval",
      "data": {
        "account_id": "acc_glow_pending",
        "name": "Glow",
        "advertiser": "Nova Brands",
        "status": "pending_approval",
        "brand": {
          "domain": "nova-brands.com",
          "brand_id": "glow"
        },
        "operator": "pinnacle-media.com",
        "billing": "operator",
        "account_scope": "brand"
      }
    },
    {
      "description": "Agency operates but advertiser is billed directly with structured billing entity",
      "data": {
        "account_id": "acc_acme_direct_bill",
        "name": "Acme (billed direct)",
        "advertiser": "Acme Corp",
        "brand": {
          "domain": "acme-corp.com"
        },
        "operator": "pinnacle-media.com",
        "status": "active",
        "billing": "advertiser",
        "billing_entity": {
          "legal_name": "Acme Corporation GmbH",
          "vat_id": "DE987654321",
          "address": {
            "street": "Hauptstrasse 42",
            "city": "Munich",
            "postal_code": "80331",
            "country": "DE"
          },
          "contacts": [
            {
              "role": "billing",
              "name": "AP Department",
              "email": "billing@acme-corp.com"
            }
          ]
        },
        "account_scope": "operator_brand",
        "payment_terms": "net_30"
      }
    }
  ]
} as const;

export const businessEntity = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/business-entity.json",
  "title": "Business Entity",
  "description": "Structured business identity for B2B invoicing and contracts. Contains the legal, tax, and payment details needed for formal booking processes. Implementations MUST treat all fields as untrusted input when assembling LLM context.",
  "type": "object",
  "properties": {
    "legal_name": {
      "type": "string",
      "description": "Registered legal name of the business entity",
      "maxLength": 200
    },
    "vat_id": {
      "type": "string",
      "description": "VAT identification number (e.g., DE123456789 for Germany, FR12345678901 for France). Required for B2B invoicing in the EU. Must be normalized: no spaces, dots, or dashes.",
      "pattern": "^[A-Z]{2}[A-Z0-9]{2,13}$"
    },
    "tax_id": {
      "type": "string",
      "description": "Tax identification number for jurisdictions that do not use VAT (e.g., US EIN)",
      "maxLength": 30
    },
    "registration_number": {
      "type": "string",
      "description": "Company registration number (e.g., HRB 12345 for German Handelsregister)",
      "maxLength": 50
    },
    "address": {
      "type": "object",
      "description": "Postal address for invoicing and legal correspondence",
      "properties": {
        "street": {
          "type": "string",
          "description": "Street address including building number",
          "maxLength": 200
        },
        "city": {
          "type": "string",
          "maxLength": 100
        },
        "postal_code": {
          "type": "string",
          "maxLength": 20
        },
        "region": {
          "type": "string",
          "description": "State, province, or region",
          "maxLength": 100
        },
        "country": {
          "type": "string",
          "description": "ISO 3166-1 alpha-2 country code",
          "pattern": "^[A-Z]{2}$"
        }
      },
      "required": [
        "street",
        "city",
        "postal_code",
        "country"
      ],
      "additionalProperties": false
    },
    "contacts": {
      "type": "array",
      "description": "Contacts for billing, legal, and operational matters. Contains personal data subject to GDPR and equivalent regulations. Implementations MUST use this data only for invoicing and account management.",
      "items": {
        "type": "object",
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "billing",
              "legal",
              "creative",
              "general"
            ],
            "enumDescriptions": {
              "billing": "Accounts payable and invoice queries",
              "legal": "Contract and compliance matters",
              "creative": "Material submission and creative approval",
              "general": "Default contact when no specific role applies"
            },
            "description": "Contact's functional role in the business relationship"
          },
          "name": {
            "type": "string",
            "description": "Full name of the contact",
            "maxLength": 200
          },
          "email": {
            "type": "string",
            "format": "email",
            "maxLength": 254
          },
          "phone": {
            "type": "string",
            "maxLength": 30
          }
        },
        "required": [
          "role"
        ],
        "additionalProperties": false
      },
      "maxItems": 10
    },
    "bank": {
      "type": "object",
      "writeOnly": true,
      "description": "Bank account details for payment processing. Write-only: included in requests to provide payment coordinates, but MUST NOT be echoed in responses. Sellers store these details and confirm receipt without returning them.",
      "properties": {
        "account_holder": {
          "type": "string",
          "description": "Name on the bank account",
          "maxLength": 200
        },
        "iban": {
          "type": "string",
          "description": "International Bank Account Number (SEPA markets)",
          "pattern": "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$"
        },
        "bic": {
          "type": "string",
          "description": "Bank Identifier Code / SWIFT code (SEPA markets)",
          "pattern": "^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$"
        },
        "routing_number": {
          "type": "string",
          "description": "Bank routing number for non-SEPA markets (e.g., US ABA routing number, Canadian transit/institution number)",
          "maxLength": 30
        },
        "account_number": {
          "type": "string",
          "description": "Bank account number for non-SEPA markets",
          "maxLength": 30
        }
      },
      "required": [
        "account_holder"
      ],
      "additionalProperties": false
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "legal_name"
  ],
  "additionalProperties": false,
  "examples": [
    {
      "description": "German agency with full B2B details",
      "data": {
        "legal_name": "Pinnacle Media GmbH",
        "vat_id": "DE123456789",
        "registration_number": "HRB 12345",
        "address": {
          "street": "Friedrichstrasse 100",
          "city": "Berlin",
          "postal_code": "10117",
          "country": "DE"
        },
        "contacts": [
          {
            "role": "billing",
            "name": "Sam Adeyemi",
            "email": "billing@pinnacle-media.com",
            "phone": "+49 30 12345678"
          }
        ],
        "bank": {
          "account_holder": "Pinnacle Media GmbH",
          "iban": "DE89370400440532013000",
          "bic": "COBADEFFXXX"
        }
      }
    },
    {
      "description": "US advertiser with EIN and domestic bank details",
      "data": {
        "legal_name": "Acme Corporation",
        "tax_id": "12-3456789",
        "address": {
          "street": "123 Main St",
          "city": "New York",
          "postal_code": "10001",
          "region": "NY",
          "country": "US"
        },
        "contacts": [
          {
            "role": "billing",
            "name": "AP Department",
            "email": "ap@acme-corp.com"
          }
        ],
        "bank": {
          "account_holder": "Acme Corporation",
          "routing_number": "021000021",
          "account_number": "123456789"
        }
      }
    }
  ]
} as const;

export const catalog = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/catalog.json",
  "title": "Catalog",
  "description": "A typed data feed. Catalogs carry the items, locations, stock levels, or pricing that publishers use to render ads. They can be synced to a platform via sync_catalogs (managed lifecycle with approval), provided inline, or fetched from an external URL. The catalog type determines the item schema and can be structural (offering, product, inventory, store, promotion) or vertical-specific (hotel, flight, job, vehicle, real_estate, education, destination, app). Selectors (ids, tags, category, query) filter items regardless of sourcing method.",
  "type": "object",
  "properties": {
    "catalog_id": {
      "type": "string",
      "description": "Buyer's identifier for this catalog. Required when syncing via sync_catalogs. When used in creatives, references a previously synced catalog on the account.",
      "x-entity": "catalog"
    },
    "name": {
      "type": "string",
      "description": "Human-readable name for this catalog (e.g., 'Summer Products 2025', 'Amsterdam Store Locations')."
    },
    "type": {
      "$ref": "/schemas/3.0.1/enums/catalog-type.json",
      "description": "Catalog type. Structural types: 'offering' (AdCP Offering objects), 'product' (ecommerce entries), 'inventory' (stock per location), 'store' (physical locations), 'promotion' (deals and pricing). Vertical types: 'hotel', 'flight', 'job', 'vehicle', 'real_estate', 'education', 'destination', 'app' — each with an industry-specific item schema."
    },
    "url": {
      "type": "string",
      "format": "uri",
      "description": "URL to an external catalog feed. The platform fetches and resolves items from this URL. For offering-type catalogs, the feed contains an array of Offering objects. For other types, the feed format is determined by feed_format. When omitted with type 'product', the platform uses its synced copy of the brand's product catalog."
    },
    "feed_format": {
      "$ref": "/schemas/3.0.1/enums/feed-format.json",
      "description": "Format of the external feed at url. Required when url points to a non-AdCP feed (e.g., Google Merchant Center XML, Meta Product Catalog). Omit for offering-type catalogs where the feed is native AdCP JSON."
    },
    "update_frequency": {
      "$ref": "/schemas/3.0.1/enums/update-frequency.json",
      "description": "How often the platform should re-fetch the feed from url. Only applicable when url is provided. Platforms may use this as a hint for polling schedules."
    },
    "items": {
      "type": "array",
      "description": "Inline catalog data. The item schema depends on the catalog type: Offering objects for 'offering', StoreItem for 'store', HotelItem for 'hotel', FlightItem for 'flight', JobItem for 'job', VehicleItem for 'vehicle', RealEstateItem for 'real_estate', EducationItem for 'education', DestinationItem for 'destination', AppItem for 'app', or freeform objects for 'product', 'inventory', and 'promotion'. Mutually exclusive with url — provide one or the other, not both. Implementations should validate items against the type-specific schema.",
      "items": {
        "type": "object"
      },
      "minItems": 1
    },
    "ids": {
      "type": "array",
      "description": "Filter catalog to specific item IDs. For offering-type catalogs, these are offering_id values. For product-type catalogs, these are SKU identifiers.",
      "items": {
        "type": "string"
      },
      "minItems": 1
    },
    "gtins": {
      "type": "array",
      "description": "Filter product-type catalogs by GTIN identifiers for cross-retailer catalog matching. Accepts standard GTIN formats (GTIN-8, UPC-A/GTIN-12, EAN-13/GTIN-13, GTIN-14). Only applicable when type is 'product'.",
      "items": {
        "type": "string",
        "pattern": "^[0-9]{8,14}$"
      },
      "minItems": 1
    },
    "tags": {
      "type": "array",
      "description": "Filter catalog to items with these tags. Tags are matched using OR logic — items matching any tag are included.",
      "items": {
        "type": "string"
      },
      "minItems": 1
    },
    "category": {
      "type": "string",
      "description": "Filter catalog to items in this category (e.g., 'beverages/soft-drinks', 'chef-positions')."
    },
    "query": {
      "type": "string",
      "description": "Natural language filter for catalog items (e.g., 'all pasta sauces under $5', 'amsterdam vacancies')."
    },
    "conversion_events": {
      "type": "array",
      "description": "Event types that represent conversions for items in this catalog. Declares what events the platform should attribute to catalog items — e.g., a job catalog converts via submit_application, a product catalog via purchase. The event's content_ids field carries the item IDs that connect back to catalog items. Use content_id_type to declare what identifier type content_ids values represent.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/event-type.json"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "content_id_type": {
      "$ref": "/schemas/3.0.1/enums/content-id-type.json",
      "description": "Identifier type that the event's content_ids field should be matched against for items in this catalog. For example, 'gtin' means content_ids values are Global Trade Item Numbers, 'sku' means retailer SKUs. Omit when using a custom identifier scheme not listed in the enum."
    },
    "feed_field_mappings": {
      "type": "array",
      "description": "Declarative normalization rules for external feeds. Maps non-standard feed field names, date formats, price encodings, and image URLs to the AdCP catalog item schema. Applied during sync_catalogs ingestion. Supports field renames, named transforms (date, divide, boolean, split), static literal injection, and assignment of image URLs to typed asset pools.",
      "items": {
        "$ref": "/schemas/3.0.1/core/catalog-field-mapping.json"
      },
      "minItems": 1
    }
  },
  "required": [
    "type"
  ],
  "additionalProperties": true,
  "examples": [
    {
      "description": "Synced product catalog from Google Merchant Center",
      "data": {
        "catalog_id": "gmc-primary",
        "name": "Primary Product Feed",
        "type": "product",
        "url": "https://feeds.acmecorp.com/products.xml",
        "feed_format": "google_merchant_center",
        "update_frequency": "daily"
      }
    },
    {
      "description": "Inventory feed for store-level stock data",
      "data": {
        "catalog_id": "store-inventory",
        "name": "Store Inventory",
        "type": "inventory",
        "url": "https://feeds.acmecorp.com/inventory.json",
        "feed_format": "custom",
        "update_frequency": "hourly"
      }
    },
    {
      "description": "Store locator feed",
      "data": {
        "catalog_id": "retail-locations",
        "name": "Retail Locations",
        "type": "store",
        "url": "https://feeds.acmecorp.com/stores.json",
        "feed_format": "custom",
        "update_frequency": "weekly"
      }
    },
    {
      "description": "Promotional pricing feed",
      "data": {
        "catalog_id": "summer-sale",
        "name": "Summer Sale Promotions",
        "type": "promotion",
        "url": "https://feeds.acmecorp.com/promotions.json",
        "feed_format": "google_merchant_center",
        "update_frequency": "daily"
      }
    },
    {
      "description": "Inline offering catalog (no sync needed)",
      "data": {
        "type": "offering",
        "items": [
          {
            "offering_id": "summer-sale",
            "name": "Summer Sale",
            "landing_url": "https://acme.com/summer"
          }
        ]
      }
    },
    {
      "description": "Reference to a previously synced catalog by ID",
      "data": {
        "catalog_id": "gmc-primary",
        "type": "product",
        "ids": [
          "SKU-12345",
          "SKU-67890"
        ]
      }
    },
    {
      "description": "Product catalog with GTIN cross-retailer matching and attribution",
      "data": {
        "type": "product",
        "gtins": [
          "00013000006040",
          "00013000006057"
        ],
        "content_id_type": "gtin",
        "conversion_events": [
          "purchase",
          "add_to_cart"
        ]
      }
    },
    {
      "description": "Inline store catalog with catchment areas",
      "data": {
        "catalog_id": "retail-locations",
        "name": "Retail Locations",
        "type": "store",
        "items": [
          {
            "store_id": "amsterdam-flagship",
            "name": "Amsterdam Flagship",
            "location": {
              "lat": 52.3676,
              "lng": 4.9041
            },
            "catchments": [
              {
                "catchment_id": "walk",
                "travel_time": {
                  "value": 10,
                  "unit": "min"
                },
                "transport_mode": "walking"
              },
              {
                "catchment_id": "drive",
                "travel_time": {
                  "value": 15,
                  "unit": "min"
                },
                "transport_mode": "driving"
              }
            ]
          }
        ]
      }
    }
  ]
} as const;

export const duration = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/duration.json",
  "title": "Duration",
  "description": "A time duration expressed as an interval and unit. Used for frequency cap windows, attribution windows, reach optimization windows, time budgets, and other time-based settings. When unit is 'campaign', interval must be 1 — the window spans the full campaign flight.",
  "type": "object",
  "properties": {
    "interval": {
      "type": "integer",
      "minimum": 1,
      "description": "Number of time units. Must be 1 when unit is 'campaign'."
    },
    "unit": {
      "type": "string",
      "enum": [
        "seconds",
        "minutes",
        "hours",
        "days",
        "campaign"
      ],
      "description": "Time unit. 'seconds' for sub-minute precision. 'campaign' spans the full campaign flight."
    }
  },
  "required": [
    "interval",
    "unit"
  ],
  "additionalProperties": false
} as const;

export const formatId = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/format-id.json",
  "title": "Format Reference (Structured Object)",
  "description": "A JSON object — never a plain string — that identifies a creative format by its declaring agent and local slug. Required properties: agent_url (URI of the agent that owns the format) and id (slug matching [a-zA-Z0-9_-]+). Example: {\"agent_url\": \"https://creative.adcontextprotocol.org\", \"id\": \"display_300x250\"}. Can reference: (1) a concrete format with fixed dimensions (id only), (2) a template format without parameters (id only), or (3) a template format with parameters (id + dimensions/duration). Template formats accept parameters in format_id while concrete formats have fixed dimensions in their definition. Parameterized format IDs create unique, specific format variants. Using a plain string here is a schema violation.",
  "x-entity": "creative_format",
  "type": "object",
  "properties": {
    "agent_url": {
      "type": "string",
      "format": "uri",
      "description": "URL of the agent that defines this format (e.g., 'https://creative.adcontextprotocol.org' for standard formats, or 'https://publisher.com/.well-known/adcp/sales' for custom formats). Callers comparing two `format-id` values MUST canonicalize `agent_url` per the AdCP URL canonicalization rules before treating two formats as the same. See docs/reference/url-canonicalization."
    },
    "id": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9_-]+$",
      "description": "Format identifier within the agent's namespace (e.g., 'display_static', 'video_hosted', 'audio_standard'). When used alone, references a template format. When combined with dimension/duration fields, creates a parameterized format ID for a specific variant."
    },
    "width": {
      "type": "integer",
      "minimum": 1,
      "description": "Width in pixels for visual formats. When specified, height must also be specified. Both fields together create a parameterized format ID for dimension-specific variants."
    },
    "height": {
      "type": "integer",
      "minimum": 1,
      "description": "Height in pixels for visual formats. When specified, width must also be specified. Both fields together create a parameterized format ID for dimension-specific variants."
    },
    "duration_ms": {
      "type": "number",
      "minimum": 1,
      "description": "Duration in milliseconds for time-based formats (video, audio). When specified, creates a parameterized format ID. Omit to reference a template format without parameters."
    }
  },
  "required": [
    "agent_url",
    "id"
  ],
  "additionalProperties": true,
  "dependencies": {
    "width": [
      "height"
    ],
    "height": [
      "width"
    ]
  }
} as const;

export const format = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/format.json",
  "title": "Format",
  "description": "Represents a creative format with its requirements",
  "type": "object",
  "$defs": {
    "baseIndividualAsset": {
      "type": "object",
      "properties": {
        "item_type": {
          "type": "string",
          "const": "individual",
          "description": "Discriminator indicating this is an individual asset"
        },
        "asset_id": {
          "type": "string",
          "description": "Unique identifier for this asset. Creative manifests MUST use this exact value as the key in the assets object."
        },
        "asset_role": {
          "type": "string",
          "description": "Descriptive label for this asset's purpose (e.g., 'hero_image', 'logo', 'third_party_tracking'). For documentation and UI display only — manifests key assets by asset_id, not asset_role."
        },
        "required": {
          "type": "boolean",
          "description": "Whether this asset is required (true) or optional (false). Required assets must be provided for a valid creative. Optional assets enhance the creative but are not mandatory."
        },
        "overlays": {
          "type": "array",
          "description": "Publisher-controlled elements rendered on top of buyer content at this asset's position (e.g., video player controls, publisher logos). Creative agents should avoid placing critical content (CTAs, logos, key copy) within overlay bounds.",
          "items": {
            "$ref": "/schemas/3.0.1/core/overlay.json"
          }
        }
      },
      "required": [
        "item_type",
        "asset_id",
        "asset_type",
        "required"
      ]
    },
    "baseGroupAsset": {
      "type": "object",
      "properties": {
        "asset_id": {
          "type": "string",
          "description": "Identifier for this asset within the group"
        },
        "asset_role": {
          "type": "string",
          "description": "Descriptive label for this asset's purpose. For documentation and UI display only — manifests key assets by asset_id, not asset_role."
        },
        "required": {
          "type": "boolean",
          "description": "Whether this asset is required within each repetition of the group",
          "default": false
        },
        "overlays": {
          "type": "array",
          "description": "Publisher-controlled elements rendered on top of buyer content at this asset's position (e.g., carousel navigation arrows, slide indicators). Creative agents should avoid placing critical content within overlay bounds.",
          "items": {
            "$ref": "/schemas/3.0.1/core/overlay.json"
          }
        }
      },
      "required": [
        "asset_id",
        "asset_type",
        "required"
      ]
    }
  },
  "properties": {
    "format_id": {
      "$ref": "/schemas/3.0.1/core/format-id.json",
      "description": "This format's own identifier — a structured object {agent_url, id}, not a string. See /schemas/core/format-id.json for the full shape."
    },
    "name": {
      "type": "string",
      "description": "Human-readable format name"
    },
    "description": {
      "type": "string",
      "description": "Plain text explanation of what this format does and what assets it requires"
    },
    "example_url": {
      "type": "string",
      "format": "uri",
      "description": "Optional URL to showcase page with examples and interactive demos of this format"
    },
    "accepts_parameters": {
      "type": "array",
      "description": "List of parameters this format accepts in format_id. Template formats define which parameters (dimensions, duration, etc.) can be specified when instantiating the format. Empty or omitted means this is a concrete format with fixed parameters.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/format-id-parameter.json"
      },
      "uniqueItems": true
    },
    "renders": {
      "type": "array",
      "description": "Specification of rendered pieces for this format. Most formats produce a single render. Companion ad formats (video + banner), adaptive formats, and multi-placement formats produce multiple renders. Each render specifies its role and dimensions.",
      "items": {
        "type": "object",
        "properties": {
          "role": {
            "type": "string",
            "description": "Semantic role of this rendered piece (e.g., 'primary', 'companion', 'mobile_variant')"
          },
          "parameters_from_format_id": {
            "type": "boolean",
            "description": "When true, parameters for this render (dimensions and/or duration) are specified in the format_id. Used for template formats that accept parameters. Mutually exclusive with specifying dimensions object explicitly."
          },
          "dimensions": {
            "type": "object",
            "description": "Dimensions for this rendered piece. Defaults to pixels when unit is absent.",
            "properties": {
              "width": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Fixed width. Interpretation depends on unit (default: pixels)."
              },
              "height": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Fixed height. Interpretation depends on unit (default: pixels)."
              },
              "min_width": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Minimum width for responsive renders"
              },
              "min_height": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Minimum height for responsive renders"
              },
              "max_width": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Maximum width for responsive renders"
              },
              "max_height": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Maximum height for responsive renders"
              },
              "unit": {
                "$ref": "/schemas/3.0.1/enums/dimension-unit.json",
                "description": "Unit of measurement for width/height values. Defaults to 'px' when absent. Print formats use 'inches' or 'cm'."
              },
              "responsive": {
                "type": "object",
                "description": "Indicates which dimensions are responsive/fluid",
                "properties": {
                  "width": {
                    "type": "boolean"
                  },
                  "height": {
                    "type": "boolean"
                  }
                },
                "required": [
                  "width",
                  "height"
                ]
              },
              "aspect_ratio": {
                "type": "string",
                "description": "Fixed aspect ratio constraint (e.g., '16:9', '4:3', '1:1', '1.91:1')",
                "pattern": "^\\d+(\\.\\d+)?:\\d+(\\.\\d+)?$"
              }
            }
          }
        },
        "required": [
          "role"
        ],
        "oneOf": [
          {
            "required": [
              "dimensions"
            ],
            "not": {
              "required": [
                "parameters_from_format_id"
              ]
            }
          },
          {
            "required": [
              "parameters_from_format_id"
            ],
            "properties": {
              "parameters_from_format_id": {
                "const": true
              }
            },
            "not": {
              "required": [
                "dimensions"
              ]
            }
          }
        ]
      },
      "minItems": 1
    },
    "assets": {
      "type": "array",
      "description": "Array of all assets supported for this format. Each asset is identified by its asset_id, which must be used as the key in creative manifests. Use the 'required' boolean on each asset to indicate whether it's mandatory.",
      "items": {
        "oneOf": [
          {
            "title": "IndividualImageAsset",
            "description": "Image asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "image"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/image-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualVideoAsset",
            "description": "Video asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "video"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/video-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualAudioAsset",
            "description": "Audio asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "audio"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/audio-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualTextAsset",
            "description": "Text asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "text"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/text-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualMarkdownAsset",
            "description": "Markdown asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "markdown"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/markdown-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualHtmlAsset",
            "description": "HTML asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "html"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/html-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualCssAsset",
            "description": "CSS asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "css"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/css-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualJavaScriptAsset",
            "description": "JavaScript asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "javascript"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/javascript-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualVastAsset",
            "description": "VAST asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "vast"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/vast-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualDaastAsset",
            "description": "DAAST asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "daast"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/daast-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualUrlAsset",
            "description": "URL asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "url"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/url-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualWebhookAsset",
            "description": "Webhook asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "webhook"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/webhook-asset-requirements.json"
              }
            }
          },
          {
            "title": "IndividualBriefAsset",
            "description": "Brief asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "brief"
              }
            }
          },
          {
            "title": "IndividualCatalogAsset",
            "description": "Catalog asset",
            "allOf": [
              {
                "$ref": "#/$defs/baseIndividualAsset"
              }
            ],
            "properties": {
              "item_type": {
                "const": "individual"
              },
              "asset_type": {
                "const": "catalog"
              },
              "requirements": {
                "$ref": "/schemas/3.0.1/core/requirements/catalog-requirements.json"
              }
            }
          },
          {
            "title": "RepeatableGroupAsset",
            "description": "Repeatable asset group (for carousels, slideshows, playlists, etc.)",
            "type": "object",
            "properties": {
              "item_type": {
                "type": "string",
                "const": "repeatable_group",
                "description": "Discriminator indicating this is a repeatable asset group"
              },
              "asset_group_id": {
                "type": "string",
                "description": "Identifier for this asset group (e.g., 'product', 'slide', 'card')"
              },
              "required": {
                "type": "boolean",
                "description": "Whether this asset group is required. If true, at least min_count repetitions must be provided."
              },
              "min_count": {
                "type": "integer",
                "description": "Minimum number of repetitions required (if group is required) or allowed (if optional)",
                "minimum": 0
              },
              "max_count": {
                "type": "integer",
                "description": "Maximum number of repetitions allowed",
                "minimum": 1
              },
              "selection_mode": {
                "type": "string",
                "description": "How the platform uses repetitions of this group. 'sequential' means all items display in order (carousels, playlists). 'optimize' means the platform selects the best-performing combination from alternatives (asset group optimization like Meta Advantage+ or Google Pmax).",
                "enum": [
                  "sequential",
                  "optimize"
                ],
                "default": "sequential"
              },
              "assets": {
                "type": "array",
                "description": "Assets within each repetition of this group",
                "items": {
                  "oneOf": [
                    {
                      "title": "GroupImageAsset",
                      "description": "Image asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "image"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/image-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupVideoAsset",
                      "description": "Video asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "video"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/video-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupAudioAsset",
                      "description": "Audio asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "audio"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/audio-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupTextAsset",
                      "description": "Text asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "text"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/text-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupMarkdownAsset",
                      "description": "Markdown asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "markdown"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/markdown-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupHtmlAsset",
                      "description": "HTML asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "html"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/html-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupCssAsset",
                      "description": "CSS asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "css"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/css-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupJavaScriptAsset",
                      "description": "JavaScript asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "javascript"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/javascript-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupVastAsset",
                      "description": "VAST asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "vast"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/vast-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupDaastAsset",
                      "description": "DAAST asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "daast"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/daast-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupUrlAsset",
                      "description": "URL asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "url"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/url-asset-requirements.json"
                        }
                      }
                    },
                    {
                      "title": "GroupWebhookAsset",
                      "description": "Webhook asset in group",
                      "allOf": [
                        {
                          "$ref": "#/$defs/baseGroupAsset"
                        }
                      ],
                      "properties": {
                        "asset_type": {
                          "const": "webhook"
                        },
                        "requirements": {
                          "$ref": "/schemas/3.0.1/core/requirements/webhook-asset-requirements.json"
                        }
                      }
                    }
                  ]
                }
              }
            },
            "required": [
              "item_type",
              "asset_group_id",
              "required",
              "min_count",
              "max_count",
              "assets"
            ]
          }
        ]
      }
    },
    "delivery": {
      "type": "object",
      "description": "Delivery method specifications (e.g., hosted, VAST, third-party tags)",
      "additionalProperties": true
    },
    "supported_macros": {
      "type": "array",
      "description": "List of universal macros supported by this format (e.g., MEDIA_BUY_ID, CACHEBUSTER, DEVICE_ID). Used for validation and developer tooling. See docs/creative/universal-macros.mdx for full documentation.",
      "items": {
        "oneOf": [
          {
            "$ref": "/schemas/3.0.1/enums/universal-macro.json"
          },
          {
            "type": "string",
            "description": "Custom or publisher-specific macro name"
          }
        ]
      }
    },
    "input_format_ids": {
      "type": "array",
      "description": "Array of format IDs this format accepts as input creative manifests. When present, indicates this format can take existing creatives in these formats as input. Omit for formats that work from raw assets (images, text, etc.) rather than existing creatives.",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      }
    },
    "output_format_ids": {
      "type": "array",
      "description": "Array of format IDs that this format can produce as output. When present, indicates this format can build creatives in these output formats (e.g., a multi-publisher template format might produce standard display formats across many publishers). Omit for formats that produce a single fixed output (the format itself).",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      }
    },
    "format_card": {
      "type": "object",
      "description": "Optional standard visual card (300x400px) for displaying this format in user interfaces. Can be rendered via preview_creative or pre-generated.",
      "properties": {
        "format_id": {
          "$ref": "/schemas/3.0.1/core/format-id.json",
          "description": "Creative format defining the card layout (typically format_card_standard)"
        },
        "manifest": {
          "type": "object",
          "description": "Asset manifest for rendering the card, structure defined by the format",
          "additionalProperties": true
        }
      },
      "required": [
        "format_id",
        "manifest"
      ],
      "additionalProperties": true
    },
    "accessibility": {
      "type": "object",
      "description": "Accessibility posture of this format. Declares the WCAG conformance level that creatives produced by this format will meet.",
      "properties": {
        "wcag_level": {
          "$ref": "/schemas/3.0.1/enums/wcag-level.json",
          "description": "WCAG conformance level that this format achieves. For format-rendered creatives, the format guarantees this level. For opaque creatives, the format requires assets that self-certify to this level."
        },
        "requires_accessible_assets": {
          "type": "boolean",
          "description": "When true, all assets with x-accessibility fields must include those fields. For inspectable assets (image, video, audio), this means providing accessibility metadata like alt_text or captions. For opaque assets (HTML, JavaScript), this means providing self-declared accessibility properties."
        }
      },
      "required": [
        "wcag_level"
      ]
    },
    "supported_disclosure_positions": {
      "type": "array",
      "description": "Disclosure positions this format can render. Buyers use this to determine whether a format can satisfy their compliance requirements before submitting a creative. When omitted, the format makes no disclosure rendering guarantees — creative agents SHOULD treat this as incompatible with briefs that require specific disclosure positions. Values correspond to positions on creative-brief.json required_disclosures.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/disclosure-position.json"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "disclosure_capabilities": {
      "type": "array",
      "description": "Structured disclosure capabilities per position with persistence modes. Declares which persistence behaviors each disclosure position supports, enabling persistence-aware matching against provenance render guidance and brief requirements. When present, supersedes supported_disclosure_positions for persistence-aware queries. The flat supported_disclosure_positions field is retained for backward compatibility. Each position MUST appear at most once; validators and agents SHOULD reject duplicates.",
      "items": {
        "type": "object",
        "properties": {
          "position": {
            "$ref": "/schemas/3.0.1/enums/disclosure-position.json",
            "description": "The disclosure position"
          },
          "persistence": {
            "type": "array",
            "description": "Persistence modes this position supports",
            "items": {
              "$ref": "/schemas/3.0.1/enums/disclosure-persistence.json"
            },
            "minItems": 1,
            "uniqueItems": true
          }
        },
        "required": [
          "position",
          "persistence"
        ],
        "additionalProperties": true
      },
      "minItems": 1
    },
    "format_card_detailed": {
      "type": "object",
      "description": "Optional detailed card with carousel and full specifications. Provides rich format documentation similar to ad spec pages.",
      "properties": {
        "format_id": {
          "$ref": "/schemas/3.0.1/core/format-id.json",
          "description": "Creative format defining the detailed card layout (typically format_card_detailed)"
        },
        "manifest": {
          "type": "object",
          "description": "Asset manifest for rendering the detailed card, structure defined by the format",
          "additionalProperties": true
        }
      },
      "required": [
        "format_id",
        "manifest"
      ],
      "additionalProperties": true
    },
    "reported_metrics": {
      "type": "array",
      "description": "Metrics this format can produce in delivery reporting. Buyers receive the intersection of format reported_metrics and product available_metrics. If omitted, the format defers entirely to product-level metric declarations.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/available-metric.json"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "pricing_options": {
      "type": "array",
      "description": "Pricing options for this format. Used by transformation and generation agents that charge per format adapted, per image generated, or per unit of work. Present when the request included include_pricing=true and account. Ad servers and library-based agents expose pricing on list_creatives instead.",
      "items": {
        "$ref": "/schemas/3.0.1/core/vendor-pricing-option.json"
      },
      "minItems": 1
    }
  },
  "required": [
    "format_id",
    "name"
  ],
  "additionalProperties": true
} as const;

export const packageSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/package.json",
  "title": "Package",
  "description": "A specific product within a media buy (line item)",
  "type": "object",
  "properties": {
    "package_id": {
      "type": "string",
      "description": "Seller's unique identifier for the package",
      "x-entity": "package"
    },
    "product_id": {
      "type": "string",
      "description": "ID of the product this package is based on",
      "x-entity": "product"
    },
    "budget": {
      "type": "number",
      "description": "Budget allocation for this package in the currency specified by the pricing option",
      "minimum": 0
    },
    "pacing": {
      "$ref": "/schemas/3.0.1/enums/pacing.json"
    },
    "pricing_option_id": {
      "type": "string",
      "description": "ID of the selected pricing option from the product's pricing_options array",
      "x-entity": "product_pricing_option"
    },
    "bid_price": {
      "type": "number",
      "description": "Bid price for auction-based pricing. This is the exact bid/price to honor unless the selected pricing option has max_bid=true, in which case bid_price is the buyer's maximum willingness to pay (ceiling).",
      "minimum": 0
    },
    "price_breakdown": {
      "description": "Breakdown of the effective price for this package. On fixed-price packages, echoes the pricing option's breakdown. On auction packages, shows the clearing price breakdown including any commission or settlement terms.",
      "$ref": "/schemas/3.0.1/pricing-options/price-breakdown.json"
    },
    "impressions": {
      "type": "number",
      "description": "Impression goal for this package",
      "minimum": 0
    },
    "catalogs": {
      "type": "array",
      "description": "Catalogs this package promotes. Each catalog MUST have a distinct type (e.g., one product catalog, one store catalog). This constraint is enforced at the application level — sellers MUST reject requests containing multiple catalogs of the same type with a validation_error. Echoed from the create_media_buy request.",
      "items": {
        "$ref": "/schemas/3.0.1/core/catalog.json"
      }
    },
    "format_ids": {
      "type": "array",
      "description": "Format IDs active for this package. Echoed from the create_media_buy request; omitted means all formats for the product are active.",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      }
    },
    "targeting_overlay": {
      "$ref": "/schemas/3.0.1/core/targeting.json"
    },
    "measurement_terms": {
      "$ref": "/schemas/3.0.1/core/measurement-terms.json",
      "description": "Agreed billing measurement and makegood terms for this package. Reflects what was negotiated — may differ from the buyer's proposal or the product's defaults. When present, these terms are binding for the package's duration."
    },
    "performance_standards": {
      "type": "array",
      "description": "Agreed performance standards for this package. When any entry specifies a vendor, creatives assigned to this package MUST include corresponding tracker_script or tracker_pixel assets from that vendor.",
      "items": {
        "$ref": "/schemas/3.0.1/core/performance-standard.json"
      },
      "minItems": 1
    },
    "creative_assignments": {
      "type": "array",
      "description": "Creative assets assigned to this package",
      "items": {
        "$ref": "/schemas/3.0.1/core/creative-assignment.json"
      }
    },
    "format_ids_to_provide": {
      "type": "array",
      "description": "Format IDs that creative assets will be provided for this package",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      }
    },
    "optimization_goals": {
      "type": "array",
      "description": "Optimization targets for this package. The seller optimizes delivery toward these goals in priority order. Common pattern: event goals (purchase, install) as primary targets at priority 1; metric goals (clicks, views) as secondary proxy signals at priority 2+.",
      "items": {
        "$ref": "/schemas/3.0.1/core/optimization-goal.json"
      },
      "minItems": 1
    },
    "start_time": {
      "type": "string",
      "format": "date-time",
      "not": {
        "const": "asap"
      },
      "description": "Flight start date/time for this package in ISO 8601 format. When omitted, the package inherits the media buy's start_time. Sellers SHOULD always include the resolved value in responses, even when inherited."
    },
    "end_time": {
      "type": "string",
      "format": "date-time",
      "description": "Flight end date/time for this package in ISO 8601 format. When omitted, the package inherits the media buy's end_time. Sellers SHOULD always include the resolved value in responses, even when inherited."
    },
    "paused": {
      "type": "boolean",
      "description": "Whether this package is paused by the buyer. Paused packages do not deliver impressions. Defaults to false.",
      "default": false
    },
    "canceled": {
      "type": "boolean",
      "description": "Whether this package has been canceled. Canceled packages stop delivery and cannot be reactivated. Defaults to false.",
      "default": false
    },
    "cancellation": {
      "type": "object",
      "description": "Cancellation metadata. Present only when canceled is true.",
      "required": [
        "canceled_at",
        "canceled_by"
      ],
      "properties": {
        "canceled_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when this package was canceled."
        },
        "canceled_by": {
          "$ref": "/schemas/3.0.1/enums/canceled-by.json",
          "description": "Which party initiated the package cancellation."
        },
        "reason": {
          "type": "string",
          "description": "Reason the package was canceled.",
          "maxLength": 500
        },
        "acknowledged_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when the seller acknowledged the cancellation. Confirms inventory has been released and billing stopped. Absent until the seller processes the cancellation."
        }
      },
      "additionalProperties": false
    },
    "agency_estimate_number": {
      "type": "string",
      "maxLength": 100,
      "description": "Agency estimate or authorization number for this package. Echoed from the buyer's request. When present on the package, takes precedence over the media buy-level estimate number."
    },
    "creative_deadline": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp for creative upload or change deadline for this package. After this deadline, creative changes are rejected. When absent, the media buy's creative_deadline applies."
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "package_id"
  ],
  "additionalProperties": true
} as const;

export const plannedDelivery = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/planned-delivery.json",
  "title": "Planned Delivery",
  "description": "The seller's interpreted delivery parameters for a media buy. Represents what the seller will actually run, which may differ from what the buyer requested (e.g., the seller may apply additional targeting, frequency caps, or adjust geo to match their inventory). Used for authorization verification and audit.",
  "type": "object",
  "properties": {
    "geo": {
      "type": "object",
      "description": "Geographic targeting the seller will apply.",
      "properties": {
        "countries": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "ISO 3166-1 alpha-2 country codes where ads will deliver."
        },
        "regions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "ISO 3166-2 subdivision codes where ads will deliver."
        }
      },
      "additionalProperties": true
    },
    "channels": {
      "type": "array",
      "items": {
        "$ref": "/schemas/3.0.1/enums/channels.json"
      },
      "description": "Channels the seller will deliver on."
    },
    "start_time": {
      "type": "string",
      "format": "date-time",
      "description": "Actual flight start the seller will use."
    },
    "end_time": {
      "type": "string",
      "format": "date-time",
      "description": "Actual flight end the seller will use."
    },
    "frequency_cap": {
      "$ref": "/schemas/3.0.1/core/frequency-cap.json",
      "description": "Frequency cap the seller will apply."
    },
    "audience_summary": {
      "type": "string",
      "description": "Human-readable summary of the audience the seller will target."
    },
    "audience_targeting": {
      "type": "array",
      "description": "Structured audience targeting the seller will activate. Each entry is either a signal reference or a descriptive criterion. When present, governance agents MUST use this for bias/fairness validation and SHOULD ignore audience_summary for validation purposes. The audience_summary field is a human-readable rendering of this array, not an independent declaration.",
      "items": {
        "$ref": "/schemas/3.0.1/core/audience-selector.json"
      },
      "minItems": 1
    },
    "total_budget": {
      "type": "number",
      "description": "Total budget the seller will deliver against.",
      "minimum": 0
    },
    "currency": {
      "type": "string",
      "description": "ISO 4217 currency code for the budget.",
      "pattern": "^[A-Z]{3}$"
    },
    "enforced_policies": {
      "type": "array",
      "description": "Registry policy IDs the seller will enforce for this delivery.",
      "items": {
        "type": "string"
      }
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "additionalProperties": true
} as const;

export const productFilters = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/product-filters.json",
  "title": "Product Filters",
  "description": "Structured filters for product discovery",
  "type": "object",
  "properties": {
    "delivery_type": {
      "$ref": "/schemas/3.0.1/enums/delivery-type.json"
    },
    "exclusivity": {
      "$ref": "/schemas/3.0.1/enums/exclusivity.json",
      "description": "Filter by exclusivity level. Returns products matching the specified exclusivity (e.g., 'exclusive' returns only sole-sponsorship products)."
    },
    "is_fixed_price": {
      "type": "boolean",
      "description": "Filter by pricing availability: true = products offering fixed pricing (at least one option with fixed_price), false = products offering auction pricing (at least one option without fixed_price). Products with both fixed and auction options match both true and false."
    },
    "format_ids": {
      "type": "array",
      "description": "Filter by specific format IDs",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      },
      "minItems": 1
    },
    "standard_formats_only": {
      "type": "boolean",
      "description": "Only return products accepting IAB standard formats"
    },
    "min_exposures": {
      "type": "integer",
      "description": "Minimum exposures/impressions needed for measurement validity",
      "minimum": 1
    },
    "start_date": {
      "type": "string",
      "format": "date",
      "description": "Campaign start date (ISO 8601 date format: YYYY-MM-DD) for availability checks"
    },
    "end_date": {
      "type": "string",
      "format": "date",
      "description": "Campaign end date (ISO 8601 date format: YYYY-MM-DD) for availability checks"
    },
    "budget_range": {
      "type": "object",
      "description": "Budget range to filter appropriate products",
      "properties": {
        "min": {
          "type": "number",
          "description": "Minimum budget amount",
          "minimum": 0
        },
        "max": {
          "type": "number",
          "description": "Maximum budget amount",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code (e.g., 'USD', 'EUR', 'GBP')",
          "pattern": "^[A-Z]{3}$"
        }
      },
      "required": [
        "currency"
      ],
      "anyOf": [
        {
          "required": [
            "min"
          ]
        },
        {
          "required": [
            "max"
          ]
        }
      ],
      "additionalProperties": true
    },
    "countries": {
      "type": "array",
      "description": "Filter by country coverage using ISO 3166-1 alpha-2 codes (e.g., ['US', 'CA', 'GB']). Works for all inventory types.",
      "items": {
        "type": "string",
        "pattern": "^[A-Z]{2}$"
      },
      "minItems": 1
    },
    "regions": {
      "type": "array",
      "description": "Filter by region coverage using ISO 3166-2 codes (e.g., ['US-NY', 'US-CA', 'GB-SCT']). Use for locally-bound inventory (regional OOH, local TV) where products have region-specific coverage.",
      "items": {
        "type": "string",
        "pattern": "^[A-Z]{2}-[A-Z0-9]+$"
      },
      "minItems": 1
    },
    "metros": {
      "type": "array",
      "description": "Filter by metro coverage for locally-bound inventory (radio, DOOH, local TV). Use when products have DMA/metro-specific coverage. For digital inventory where products have broad coverage, use required_geo_targeting instead to filter by seller capability.",
      "items": {
        "type": "object",
        "properties": {
          "system": {
            "$ref": "/schemas/3.0.1/enums/metro-system.json",
            "description": "Metro classification system"
          },
          "code": {
            "type": "string",
            "description": "Metro code within the system (e.g., '501' for NYC DMA)"
          }
        },
        "required": [
          "system",
          "code"
        ],
        "additionalProperties": false
      },
      "minItems": 1
    },
    "channels": {
      "type": "array",
      "description": "Filter by advertising channels (e.g., ['display', 'ctv', 'dooh'])",
      "items": {
        "$ref": "/schemas/3.0.1/enums/channels.json"
      },
      "minItems": 1
    },
    "required_axe_integrations": {
      "type": "array",
      "description": "Deprecated: Use trusted_match filter instead. Filter to products executable through specific agentic ad exchanges. URLs are canonical identifiers.",
      "deprecated": true,
      "items": {
        "type": "string",
        "format": "uri"
      },
      "minItems": 1
    },
    "trusted_match": {
      "type": "object",
      "description": "Filter products by Trusted Match Protocol capabilities. Only products with matching TMP support are returned.",
      "properties": {
        "providers": {
          "type": "array",
          "description": "Filter to products with specific TMP providers and match types. Each entry identifies a provider by agent_url and optionally requires specific match capabilities. Products must match at least one entry.",
          "items": {
            "type": "object",
            "properties": {
              "agent_url": {
                "type": "string",
                "format": "uri",
                "description": "Provider's agent URL from the registry."
              },
              "context_match": {
                "type": "boolean",
                "description": "When true, require this provider to support context match."
              },
              "identity_match": {
                "type": "boolean",
                "description": "When true, require this provider to support identity match."
              }
            },
            "required": [
              "agent_url"
            ],
            "additionalProperties": true
          },
          "minItems": 1
        },
        "response_types": {
          "type": "array",
          "description": "Filter to products supporting specific TMP response types (e.g., 'activation', 'creative', 'catalog_items'). Products must support at least one of the listed types.",
          "items": {
            "$ref": "/schemas/3.0.1/enums/response-type.json"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "required_features": {
      "$ref": "/schemas/3.0.1/core/media-buy-features.json",
      "description": "Filter to products from sellers supporting specific protocol features. Only features set to true are used for filtering."
    },
    "required_geo_targeting": {
      "type": "array",
      "description": "Filter to products from sellers supporting specific geo targeting capabilities. Each entry specifies a targeting level (country, region, metro, postal_area) and optionally a system for levels that have multiple classification systems.",
      "items": {
        "type": "object",
        "properties": {
          "level": {
            "$ref": "/schemas/3.0.1/enums/geo-level.json",
            "description": "Geographic targeting level (country, region, metro, postal_area)"
          },
          "system": {
            "type": "string",
            "description": "Classification system within the level. Required for metro (e.g., 'nielsen_dma') and postal_area (e.g., 'us_zip'). Not applicable for country/region which use ISO standards."
          }
        },
        "required": [
          "level"
        ],
        "additionalProperties": false
      },
      "minItems": 1
    },
    "signal_targeting": {
      "type": "array",
      "description": "Filter to products supporting specific signals from data provider catalogs. Products must have the requested signals in their data_provider_signals and signal_targeting_allowed must be true (or all signals requested).",
      "items": {
        "$ref": "/schemas/3.0.1/core/signal-targeting.json"
      },
      "minItems": 1
    },
    "postal_areas": {
      "type": "array",
      "description": "Filter by postal area coverage for locally-bound inventory (direct mail, DOOH, local campaigns). Use when products have postal-area-specific coverage. For digital inventory where products have broad coverage, use required_geo_targeting instead to filter by seller capability.",
      "items": {
        "type": "object",
        "properties": {
          "system": {
            "$ref": "/schemas/3.0.1/enums/postal-system.json",
            "description": "Postal code system (e.g., 'us_zip', 'gb_outward')"
          },
          "values": {
            "type": "array",
            "description": "Postal codes within the system (e.g., ['10001', '10002'] for us_zip)",
            "items": {
              "type": "string"
            },
            "minItems": 1
          }
        },
        "required": [
          "system",
          "values"
        ],
        "additionalProperties": false
      },
      "minItems": 1
    },
    "geo_proximity": {
      "type": "array",
      "description": "Filter by proximity to geographic points. Returns products with inventory coverage near these locations. Follows the same format as the targeting overlay — each entry uses exactly one method: travel_time + transport_mode, radius, or geometry. For locally-bound inventory (DOOH, radio), filters to products with coverage in the area. For digital inventory, filters to products from sellers supporting geo_proximity targeting.",
      "items": {
        "type": "object",
        "properties": {
          "lat": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Latitude in decimal degrees (WGS 84)"
          },
          "lng": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "description": "Longitude in decimal degrees (WGS 84)"
          },
          "label": {
            "type": "string",
            "description": "Human-readable label (e.g., 'Düsseldorf', 'Heathrow Airport')"
          },
          "travel_time": {
            "type": "object",
            "description": "Travel time limit for isochrone calculation",
            "properties": {
              "value": {
                "type": "number",
                "minimum": 1,
                "description": "Travel time limit"
              },
              "unit": {
                "$ref": "/schemas/3.0.1/enums/travel-time-unit.json"
              }
            },
            "required": [
              "value",
              "unit"
            ],
            "additionalProperties": false
          },
          "transport_mode": {
            "$ref": "/schemas/3.0.1/enums/transport-mode.json",
            "description": "Transportation mode for isochrone calculation. Required when travel_time is provided."
          },
          "radius": {
            "type": "object",
            "description": "Simple radius from the point",
            "properties": {
              "value": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "Radius distance"
              },
              "unit": {
                "$ref": "/schemas/3.0.1/enums/distance-unit.json",
                "description": "Distance unit"
              }
            },
            "required": [
              "value",
              "unit"
            ],
            "additionalProperties": false
          },
          "geometry": {
            "type": "object",
            "description": "Pre-computed GeoJSON geometry defining the proximity boundary",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "Polygon",
                  "MultiPolygon"
                ],
                "description": "GeoJSON geometry type"
              },
              "coordinates": {
                "type": "array",
                "description": "GeoJSON coordinates array"
              }
            },
            "required": [
              "type",
              "coordinates"
            ],
            "additionalProperties": false
          }
        },
        "oneOf": [
          {
            "required": [
              "lat",
              "lng",
              "travel_time",
              "transport_mode"
            ],
            "not": {
              "anyOf": [
                {
                  "required": [
                    "radius"
                  ]
                },
                {
                  "required": [
                    "geometry"
                  ]
                }
              ]
            }
          },
          {
            "required": [
              "lat",
              "lng",
              "radius"
            ],
            "not": {
              "anyOf": [
                {
                  "required": [
                    "travel_time"
                  ]
                },
                {
                  "required": [
                    "geometry"
                  ]
                }
              ]
            }
          },
          {
            "required": [
              "geometry"
            ],
            "not": {
              "anyOf": [
                {
                  "required": [
                    "travel_time"
                  ]
                },
                {
                  "required": [
                    "radius"
                  ]
                }
              ]
            }
          }
        ],
        "additionalProperties": true
      },
      "minItems": 1
    },
    "required_performance_standards": {
      "type": "array",
      "description": "Filter to products that can meet the buyer's performance standard requirements. Each entry specifies a metric, minimum threshold, and optionally a required vendor and standard. Products that cannot meet these thresholds or do not support the specified vendors are excluded. Use this to tell the seller upfront: 'I need DoubleVerify for viewability at 70% MRC.'",
      "items": {
        "$ref": "/schemas/3.0.1/core/performance-standard.json"
      },
      "minItems": 1
    },
    "keywords": {
      "type": "array",
      "description": "Filter by keyword relevance for search and retail media platforms. Returns products that support keyword targeting for these terms. Allows the sell-side agent to assess keyword availability and recommend appropriate products. Use match_type to indicate the desired precision.",
      "items": {
        "type": "object",
        "properties": {
          "keyword": {
            "type": "string",
            "minLength": 1,
            "description": "The keyword to target"
          },
          "match_type": {
            "$ref": "/schemas/3.0.1/enums/match-type.json",
            "default": "broad"
          }
        },
        "required": [
          "keyword"
        ],
        "additionalProperties": false
      },
      "minItems": 1
    }
  },
  "additionalProperties": true
} as const;

export const product = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/product.json",
  "title": "Product",
  "description": "Represents available advertising inventory",
  "type": "object",
  "properties": {
    "product_id": {
      "type": "string",
      "description": "Unique identifier for the product",
      "x-entity": "product"
    },
    "name": {
      "type": "string",
      "description": "Human-readable product name"
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the product and its inventory"
    },
    "publisher_properties": {
      "type": "array",
      "description": "Publisher properties covered by this product. Buyers fetch actual property definitions from each publisher's adagents.json and validate agent authorization. Selection patterns mirror the authorization patterns in adagents.json for consistency.",
      "items": {
        "$ref": "/schemas/3.0.1/core/publisher-property-selector.json"
      },
      "minItems": 1
    },
    "channels": {
      "type": "array",
      "description": "Advertising channels this product is sold as. Products inherit from their properties' supported_channels but may narrow the scope. For example, a product covering YouTube properties might be sold as ['ctv'] even though those properties support ['olv', 'social', 'ctv'].",
      "items": {
        "$ref": "/schemas/3.0.1/enums/channels.json"
      },
      "uniqueItems": true
    },
    "format_ids": {
      "type": "array",
      "description": "Array of supported creative format IDs - structured format_id objects with agent_url and id",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      }
    },
    "placements": {
      "type": "array",
      "description": "Optional array of specific placements within this product. When provided, buyers can target specific placements when assigning creatives.",
      "items": {
        "$ref": "/schemas/3.0.1/core/placement.json"
      },
      "minItems": 1
    },
    "delivery_type": {
      "$ref": "/schemas/3.0.1/enums/delivery-type.json"
    },
    "exclusivity": {
      "$ref": "/schemas/3.0.1/enums/exclusivity.json",
      "description": "Whether this product offers exclusive access to its inventory. Defaults to 'none' when absent. Most relevant for guaranteed products tied to specific collections or placements."
    },
    "pricing_options": {
      "type": "array",
      "description": "Available pricing models for this product",
      "items": {
        "$ref": "/schemas/3.0.1/core/pricing-option.json"
      },
      "minItems": 1
    },
    "forecast": {
      "$ref": "/schemas/3.0.1/core/delivery-forecast.json",
      "description": "Forecasted delivery metrics for this product. Gives buyers an estimate of expected performance before requesting a proposal."
    },
    "outcome_measurement": {
      "$ref": "/schemas/3.0.1/core/outcome-measurement.json"
    },
    "delivery_measurement": {
      "type": "object",
      "description": "Measurement provider and methodology for delivery metrics. The buyer accepts the declared provider as the source of truth for the buy. When absent, buyers should apply their own measurement defaults.",
      "properties": {
        "provider": {
          "type": "string",
          "description": "Measurement provider(s) used for this product (e.g., 'Google Ad Manager with IAS viewability', 'Nielsen DAR', 'Geopath for DOOH impressions')"
        },
        "notes": {
          "type": "string",
          "description": "Additional details about measurement methodology in plain language (e.g., 'MRC-accredited viewability. 50% in-view for 1s display / 2s video', 'Panel-based demographic measurement updated monthly')"
        }
      },
      "required": [
        "provider"
      ]
    },
    "measurement_terms": {
      "$ref": "/schemas/3.0.1/core/measurement-terms.json",
      "description": "Seller's default billing measurement and makegood terms. Declares who counts the billing metric and what remedies apply when thresholds are breached. Buyers may propose different terms at media buy creation — sellers accept, reject (TERMS_REJECTED), or adjust per their policy."
    },
    "performance_standards": {
      "type": "array",
      "description": "Seller's default performance standards for this product: viewability, IVT, completion rate, brand safety, attention score. Buyers may propose different standards at media buy creation. When absent, no structured performance standards apply.",
      "items": {
        "$ref": "/schemas/3.0.1/core/performance-standard.json"
      },
      "minItems": 1
    },
    "cancellation_policy": {
      "$ref": "/schemas/3.0.1/core/cancellation-policy.json",
      "description": "Cancellation terms for this product. Declares the minimum notice period required before cancellation takes effect and any penalties for insufficient notice. Relevant for guaranteed delivery products. Buyers accept these terms by creating a media buy against the product."
    },
    "reporting_capabilities": {
      "$ref": "/schemas/3.0.1/core/reporting-capabilities.json"
    },
    "creative_policy": {
      "$ref": "/schemas/3.0.1/core/creative-policy.json"
    },
    "is_custom": {
      "type": "boolean",
      "description": "Whether this is a custom product"
    },
    "property_targeting_allowed": {
      "type": "boolean",
      "default": false,
      "description": "Whether buyers can filter this product to a subset of its publisher_properties. When false (default), the product is 'all or nothing' - buyers must accept all properties or the product is excluded from property_list filtering results."
    },
    "data_provider_signals": {
      "type": "array",
      "description": "Data provider signals available for this product. Buyers fetch signal definitions from each data provider's adagents.json and can verify agent authorization.",
      "items": {
        "$ref": "/schemas/3.0.1/core/data-provider-signal-selector.json"
      }
    },
    "signal_targeting_allowed": {
      "type": "boolean",
      "default": false,
      "description": "Whether buyers can filter this product to a subset of its data_provider_signals. When false (default), the product includes all listed signals as a bundle. When true, buyers can target specific signals."
    },
    "catalog_types": {
      "type": "array",
      "description": "Catalog types this product supports for catalog-driven campaigns. A sponsored product listing declares [\"product\"], a job board declares [\"job\", \"offering\"]. Buyers match synced catalogs to products via this field.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/catalog-type.json"
      },
      "uniqueItems": true,
      "minItems": 1
    },
    "metric_optimization": {
      "type": "object",
      "description": "Metric optimization capabilities for this product. Presence indicates the product supports optimization_goals with kind: 'metric'. No event source or conversion tracking setup required — the seller tracks these metrics natively.",
      "properties": {
        "supported_metrics": {
          "type": "array",
          "description": "Metric kinds this product can optimize for. Buyers should only request metric goals for kinds listed here.",
          "items": {
            "type": "string",
            "enum": [
              "clicks",
              "views",
              "completed_views",
              "viewed_seconds",
              "attention_seconds",
              "attention_score",
              "engagements",
              "follows",
              "saves",
              "profile_visits",
              "reach"
            ]
          },
          "minItems": 1
        },
        "supported_reach_units": {
          "type": "array",
          "description": "Reach units this product can optimize for. Required when supported_metrics includes 'reach'. Buyers must set reach_unit to a value in this list on reach optimization goals — sellers reject unsupported values.",
          "items": {
            "$ref": "/schemas/3.0.1/enums/reach-unit.json"
          },
          "minItems": 1
        },
        "supported_view_durations": {
          "type": "array",
          "description": "Video view duration thresholds (in seconds) this product supports for completed_views goals. Only relevant when supported_metrics includes 'completed_views'. When absent, the seller uses their platform default. Buyers must set view_duration_seconds to a value in this list — sellers reject unsupported values.",
          "items": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        },
        "supported_targets": {
          "type": "array",
          "description": "Target kinds available for metric goals on this product. Values match target.kind on the optimization goal. Only these target kinds are accepted — goals with unlisted target kinds will be rejected. When omitted, buyers can set target-less metric goals (maximize volume within budget) but cannot set specific targets.",
          "items": {
            "type": "string",
            "enum": [
              "cost_per",
              "threshold_rate"
            ]
          }
        }
      },
      "required": [
        "supported_metrics"
      ],
      "additionalProperties": true
    },
    "max_optimization_goals": {
      "type": "integer",
      "minimum": 1,
      "description": "Maximum number of optimization_goals this product accepts on a package. When absent, no limit is declared. Most social platforms accept only 1 goal — buyers sending arrays longer than this value should expect the seller to use only the highest-priority (lowest priority number) goal."
    },
    "measurement_readiness": {
      "$ref": "/schemas/3.0.1/core/measurement-readiness.json",
      "description": "Assessment of whether the buyer's event source setup is sufficient for this product to optimize effectively. Only present when the seller can evaluate the buyer's account context. Buyers should check this before creating media buys with event-based optimization goals."
    },
    "conversion_tracking": {
      "type": "object",
      "description": "Conversion event tracking for this product. Presence indicates the product supports optimization_goals with kind: 'event'. Seller-level capabilities (supported event types, UID types, attribution windows) are declared in get_adcp_capabilities.",
      "properties": {
        "action_sources": {
          "type": "array",
          "description": "Action sources relevant to this product (e.g. a retail media product might have 'in_store' and 'website', while a display product might only have 'website')",
          "items": {
            "$ref": "/schemas/3.0.1/enums/action-source.json"
          },
          "minItems": 1
        },
        "supported_targets": {
          "type": "array",
          "description": "Target kinds available for event goals on this product. Values match target.kind on the optimization goal. cost_per: target cost per conversion event. per_ad_spend: target return on ad spend (requires value_field on event sources). maximize_value: maximize total conversion value without a specific ratio target (requires value_field). Only these target kinds are accepted — goals with unlisted target kinds will be rejected. A goal without a target implicitly maximizes conversion count within budget — no declaration needed for that mode. When omitted, buyers can still set target-less event goals.",
          "items": {
            "type": "string",
            "enum": [
              "cost_per",
              "per_ad_spend",
              "maximize_value"
            ]
          },
          "minItems": 1
        },
        "platform_managed": {
          "type": "boolean",
          "description": "Whether the seller provides its own always-on measurement (e.g. Amazon sales attribution for Amazon advertisers). When true, sync_event_sources response will include seller-managed event sources with managed_by='seller'."
        }
      },
      "additionalProperties": true
    },
    "catalog_match": {
      "type": "object",
      "description": "When the buyer provides a catalog on get_products, indicates which catalog items are eligible for this product. Only present for products where catalog matching is relevant (e.g., sponsored product listings, job boards, hotel ads).",
      "properties": {
        "matched_gtins": {
          "type": "array",
          "description": "GTINs from the buyer's catalog that are eligible on this product's inventory. Standard GTIN formats (GTIN-8 through GTIN-14). Only present for product-type catalogs with GTIN matching.",
          "items": {
            "type": "string",
            "pattern": "^[0-9]{8,14}$"
          }
        },
        "matched_ids": {
          "type": "array",
          "description": "Item IDs from the buyer's catalog that matched this product's inventory. The ID type depends on the catalog type and content_id_type (e.g., SKUs for product catalogs, job_ids for job catalogs, offering_ids for offering catalogs).",
          "items": {
            "type": "string"
          }
        },
        "matched_count": {
          "type": "integer",
          "description": "Number of catalog items that matched this product's inventory.",
          "minimum": 0
        },
        "submitted_count": {
          "type": "integer",
          "description": "Total catalog items evaluated from the buyer's catalog.",
          "minimum": 0
        }
      },
      "required": [
        "submitted_count"
      ]
    },
    "brief_relevance": {
      "type": "string",
      "description": "Explanation of why this product matches the brief (only included when brief is provided)"
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "description": "Expiration timestamp. After this time, the product may no longer be available for purchase and create_media_buy may reject packages referencing it."
    },
    "product_card": {
      "type": "object",
      "description": "Optional standard visual card (300x400px) for displaying this product in user interfaces. Can be rendered via preview_creative or pre-generated.",
      "properties": {
        "format_id": {
          "$ref": "/schemas/3.0.1/core/format-id.json",
          "description": "Creative format defining the card layout (typically product_card_standard)"
        },
        "manifest": {
          "type": "object",
          "description": "Asset manifest for rendering the card, structure defined by the format",
          "additionalProperties": true
        }
      },
      "required": [
        "format_id",
        "manifest"
      ],
      "additionalProperties": true
    },
    "product_card_detailed": {
      "type": "object",
      "description": "Optional detailed card with carousel and full specifications. Provides rich product presentation similar to media kit pages.",
      "properties": {
        "format_id": {
          "$ref": "/schemas/3.0.1/core/format-id.json",
          "description": "Creative format defining the detailed card layout (typically product_card_detailed)"
        },
        "manifest": {
          "type": "object",
          "description": "Asset manifest for rendering the detailed card, structure defined by the format",
          "additionalProperties": true
        }
      },
      "required": [
        "format_id",
        "manifest"
      ],
      "additionalProperties": true
    },
    "collections": {
      "type": "array",
      "description": "Collections available in this product. Each entry references collections declared in an adagents.json by domain and collection ID. Buyers resolve full collection objects from the referenced adagents.json.",
      "items": {
        "$ref": "/schemas/3.0.1/core/collection-selector.json"
      },
      "minItems": 1
    },
    "collection_targeting_allowed": {
      "type": "boolean",
      "default": false,
      "description": "Whether buyers can target a subset of this product's collections. When false (default), the product is a bundle — buyers get all listed collections. When true, buyers can select specific collections in the media buy."
    },
    "installments": {
      "type": "array",
      "description": "Specific installments included in this product. Each installment references its parent collection via collection_id when the product spans multiple collections. When absent with collections present, the product covers the collections broadly (run-of-collection).",
      "items": {
        "$ref": "/schemas/3.0.1/core/installment.json"
      }
    },
    "enforced_policies": {
      "type": "array",
      "description": "Registry policy IDs the seller enforces for this product. Enforcement level comes from the policy registry. Buyers can filter products by required policies.",
      "items": {
        "type": "string"
      }
    },
    "trusted_match": {
      "type": "object",
      "description": "Trusted Match Protocol capabilities for this product. When present, the product supports real-time contextual and/or identity matching via TMP. Buyers use this to determine what response types the publisher can accept and whether brands can be selected dynamically at match time.",
      "properties": {
        "context_match": {
          "type": "boolean",
          "description": "Whether this product supports Context Match requests. When true, the publisher's TMP router will send context match requests to registered providers for this product's inventory.",
          "default": true
        },
        "identity_match": {
          "type": "boolean",
          "description": "Whether this product supports Identity Match requests. When true, the publisher's TMP router will send identity match requests to evaluate user eligibility.",
          "default": false
        },
        "response_types": {
          "type": "array",
          "description": "What the publisher can accept back from context match.",
          "items": {
            "$ref": "/schemas/3.0.1/enums/response-type.json"
          },
          "minItems": 1,
          "default": [
            "activation"
          ]
        },
        "dynamic_brands": {
          "type": "boolean",
          "description": "Whether the buyer can select a brand at match time. When false (default), the brand must be specified on the media buy/package. When true, the buyer's offer can include any brand — the publisher applies approval rules at match time. Enables multi-brand agreements where the holding company or buyer agent selects brand based on context.",
          "default": false
        },
        "providers": {
          "type": "array",
          "description": "TMP providers integrated with this product's inventory. Each entry identifies a provider by agent_url (from the registry) and declares what match types it supports for this product. The product-level context_match and identity_match booleans declare what the product supports overall; the per-provider booleans declare which provider handles each match type. Enables buyer discovery: 'find products where a specific provider does context matching.'",
          "items": {
            "type": "object",
            "properties": {
              "agent_url": {
                "type": "string",
                "format": "uri",
                "description": "Provider's agent URL from the registry. Canonical identifier for this TMP provider."
              },
              "context_match": {
                "type": "boolean",
                "description": "Whether this provider handles context match for this product.",
                "default": false
              },
              "identity_match": {
                "type": "boolean",
                "description": "Whether this provider handles identity match for this product.",
                "default": false
              },
              "countries": {
                "type": "array",
                "description": "ISO 3166-1 alpha-2 country codes this provider serves for identity match. The router uses this to select the correct regional provider based on the request's country field. Required when identity_match is true.",
                "items": {
                  "type": "string",
                  "pattern": "^[A-Z]{2}$"
                },
                "minItems": 1
              },
              "uid_types": {
                "type": "array",
                "description": "Identity types this regional provider can resolve. The router filters providers whose uid_types includes the request's uid_type. Required when identity_match is true.",
                "items": {
                  "$ref": "/schemas/3.0.1/enums/uid-type.json"
                },
                "minItems": 1
              }
            },
            "required": [
              "agent_url"
            ],
            "if": {
              "properties": {
                "identity_match": {
                  "const": true
                }
              },
              "required": [
                "identity_match"
              ]
            },
            "then": {
              "required": [
                "agent_url",
                "countries",
                "uid_types"
              ]
            },
            "additionalProperties": true
          },
          "minItems": 1
        }
      },
      "required": [
        "context_match"
      ],
      "additionalProperties": true
    },
    "material_submission": {
      "type": "object",
      "description": "Instructions for submitting physical creative materials (print, static OOH, cinema). Present only for products requiring physical delivery outside the digital creative assignment flow. Buyer agents MUST validate url and email domains against the seller's known domains (from adagents.json) before submitting materials. Never auto-submit without human confirmation.",
      "properties": {
        "url": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "description": "HTTPS URL for uploading or submitting physical creative materials"
        },
        "email": {
          "type": "string",
          "format": "email",
          "description": "Email address for creative material submission"
        },
        "instructions": {
          "type": "string",
          "description": "Human-readable instructions for material submission (file naming conventions, shipping address, etc.)",
          "maxLength": 2000
        },
        "ext": {
          "$ref": "/schemas/3.0.1/core/ext.json"
        }
      },
      "minProperties": 1,
      "additionalProperties": true
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "product_id",
    "name",
    "description",
    "publisher_properties",
    "format_ids",
    "delivery_type",
    "pricing_options",
    "reporting_capabilities"
  ],
  "additionalProperties": true
} as const;

export const propertyListRef = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/property-list-ref.json",
  "title": "Property List Reference",
  "description": "Reference to an externally managed property list. Enables passing large property sets (50,000+) without embedding them in requests. The receiving agent fetches and caches the list independently.",
  "type": "object",
  "properties": {
    "agent_url": {
      "type": "string",
      "format": "uri",
      "description": "URL of the agent managing the property list"
    },
    "list_id": {
      "type": "string",
      "description": "Identifier for the property list within the agent",
      "minLength": 1,
      "x-entity": "property_list"
    },
    "auth_token": {
      "type": "string",
      "description": "JWT or other authorization token for accessing the list. Optional if the list is public or caller has implicit access."
    }
  },
  "required": [
    "agent_url",
    "list_id"
  ],
  "additionalProperties": false
} as const;

export const proposal = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/proposal.json",
  "title": "Proposal",
  "description": "A proposed media plan with budget allocations across products. Represents the publisher's strategic recommendation for how to structure a campaign based on the brief. Proposals are actionable - buyers can execute them directly via create_media_buy by providing the proposal_id.",
  "type": "object",
  "properties": {
    "proposal_id": {
      "type": "string",
      "description": "Unique identifier for this proposal. Used to execute it via create_media_buy.",
      "maxLength": 255
    },
    "name": {
      "type": "string",
      "description": "Human-readable name for this media plan proposal",
      "maxLength": 500
    },
    "description": {
      "type": "string",
      "description": "Explanation of the proposal strategy and what it achieves",
      "maxLength": 2000
    },
    "allocations": {
      "type": "array",
      "description": "Budget allocations across products. Allocation percentages MUST sum to 100. Publishers are responsible for ensuring the sum equals 100; buyers SHOULD validate this before execution.",
      "items": {
        "$ref": "/schemas/3.0.1/core/product-allocation.json"
      },
      "minItems": 1
    },
    "proposal_status": {
      "$ref": "/schemas/3.0.1/enums/proposal-status.json",
      "description": "Lifecycle status of this proposal. When absent, the proposal is ready to buy (backward compatible). 'draft' means indicative pricing — finalize via refine before purchasing. 'committed' means firm pricing with inventory reserved until expires_at."
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "description": "When this proposal expires and can no longer be executed. For draft proposals, indicates when indicative pricing becomes stale. For committed proposals, indicates when the inventory hold lapses — the buyer must call create_media_buy before this time."
    },
    "insertion_order": {
      "$ref": "/schemas/3.0.1/core/insertion-order.json",
      "description": "Formal insertion order attached to a committed proposal. Present when the seller requires a signed agreement before the media buy can proceed. The buyer references the io_id in io_acceptance on create_media_buy."
    },
    "total_budget_guidance": {
      "type": "object",
      "description": "Optional budget guidance for this proposal",
      "properties": {
        "min": {
          "type": "number",
          "description": "Minimum recommended budget",
          "minimum": 0
        },
        "recommended": {
          "type": "number",
          "description": "Recommended budget for optimal performance",
          "minimum": 0
        },
        "max": {
          "type": "number",
          "description": "Maximum budget before diminishing returns",
          "minimum": 0
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code"
        }
      },
      "additionalProperties": true
    },
    "brief_alignment": {
      "type": "string",
      "description": "Explanation of how this proposal aligns with the campaign brief",
      "maxLength": 2000
    },
    "forecast": {
      "$ref": "/schemas/3.0.1/core/delivery-forecast.json",
      "description": "Aggregate forecasted delivery metrics for the entire proposal. When both proposal-level and allocation-level forecasts are present, the proposal-level forecast is authoritative for total delivery estimation."
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "proposal_id",
    "name",
    "allocations"
  ],
  "additionalProperties": true
} as const;

export const pushNotificationConfig = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/push-notification-config.json",
  "title": "Push Notification Config",
  "description": "Webhook configuration for asynchronous task notifications. Uses A2A-compatible PushNotificationConfig structure. By default, webhooks are signed with the AdCP RFC 9421 profile (see docs/building/implementation/security.mdx#webhook-callbacks) — the seller signs outbound with a key published at the jwks_uri on its own brand.json `agents[]` entry and the buyer verifies against that JWKS, so no shared secret crosses the wire. The optional `authentication` block selects the legacy Bearer or HMAC-SHA256 fallback for compatibility with receivers that have not yet adopted the 9421 profile; this fallback is deprecated and will be removed in AdCP 4.0. Note: the `idempotency_key` that receivers dedup on lives inside the webhook **payload** body (see docs/building/implementation/webhooks.mdx#reliability and the mcp-webhook-payload schema), not in this configuration object — this schema only describes the receiver-side transport config sent to the seller. This schema is designed for composition via allOf - consuming schemas should define their own additionalProperties constraints.",
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "format": "uri",
      "description": "Webhook endpoint URL for task status notifications"
    },
    "token": {
      "type": "string",
      "description": "Optional client-provided token for webhook validation. Echoed back in webhook payload to validate request authenticity.",
      "minLength": 16
    },
    "authentication": {
      "type": "object",
      "description": "Legacy authentication configuration (A2A-compatible). Opts the seller into Bearer or HMAC-SHA256 signing instead of the default RFC 9421 webhook profile. Deprecated; removed in AdCP 4.0. **Precedence is a switch, not a fallback:** presence of this block selects the legacy scheme; absence selects 9421. A seller MUST NOT sign the same webhook both ways, and a buyer MUST NOT attempt 'try 9421 first, fall back to HMAC' verification — signature mode is determined solely by whether this block was present at registration time. The seller's baseline 9421 webhook-signing key published at its brand.json `agents[]` `jwks_uri` does not override this selector; it is always discoverable but only used when `authentication` is omitted. See docs/building/implementation/security.mdx#webhook-callbacks for the full precedence and downgrade-resistance rules (including the `webhook_mode_mismatch` rejection a buyer MUST apply when a received webhook's signing mode does not match the registered mode).",
      "properties": {
        "schemes": {
          "type": "array",
          "description": "Array of authentication schemes. Supported: ['Bearer'] for simple token auth, ['HMAC-SHA256'] for legacy shared-secret signing. Both are deprecated; new integrations SHOULD omit `authentication` and use the RFC 9421 webhook profile.",
          "items": {
            "$ref": "/schemas/3.0.1/enums/auth-scheme.json"
          },
          "minItems": 1,
          "maxItems": 1
        },
        "credentials": {
          "type": "string",
          "description": "Credentials for the legacy scheme. For Bearer: token sent in Authorization header. For HMAC-SHA256: shared secret used to generate signature. Minimum 32 characters. Exchanged out-of-band during onboarding.",
          "minLength": 32
        }
      },
      "required": [
        "schemes",
        "credentials"
      ],
      "additionalProperties": false
    }
  },
  "required": [
    "url"
  ]
} as const;

export const reportingWebhook = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/reporting-webhook.json",
  "title": "Reporting Webhook",
  "description": "Webhook configuration for automated reporting delivery. Configures where and how campaign performance reports are sent.",
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "format": "uri",
      "description": "Webhook endpoint URL for reporting notifications"
    },
    "token": {
      "type": "string",
      "description": "Optional client-provided token for webhook validation. Echoed back in webhook payload to validate request authenticity.",
      "minLength": 16
    },
    "authentication": {
      "type": "object",
      "description": "Authentication configuration for webhook delivery (A2A-compatible)",
      "properties": {
        "schemes": {
          "type": "array",
          "description": "Array of authentication schemes. Supported: ['Bearer'] for simple token auth, ['HMAC-SHA256'] for signature verification (recommended for production)",
          "items": {
            "$ref": "/schemas/3.0.1/enums/auth-scheme.json"
          },
          "minItems": 1,
          "maxItems": 1
        },
        "credentials": {
          "type": "string",
          "description": "Credentials for authentication. For Bearer: token sent in Authorization header. For HMAC-SHA256: shared secret used to generate signature. Minimum 32 characters. Exchanged out-of-band during onboarding.",
          "minLength": 32
        }
      },
      "required": [
        "schemes",
        "credentials"
      ],
      "additionalProperties": false
    },
    "reporting_frequency": {
      "type": "string",
      "enum": [
        "hourly",
        "daily",
        "monthly"
      ],
      "description": "Frequency for automated reporting delivery. Must be supported by all products in the media buy."
    },
    "requested_metrics": {
      "type": "array",
      "description": "Optional list of metrics to include in webhook notifications. If omitted, all available metrics are included. Must be subset of product's available_metrics.",
      "items": {
        "$ref": "/schemas/3.0.1/enums/available-metric.json"
      },
      "uniqueItems": true
    }
  },
  "required": [
    "url",
    "authentication",
    "reporting_frequency"
  ],
  "additionalProperties": true
} as const;

export const startTiming = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/core/start-timing.json",
  "title": "Start Timing",
  "description": "Campaign start timing: 'asap' or ISO 8601 date-time",
  "oneOf": [
    {
      "type": "string",
      "const": "asap",
      "description": "Start campaign as soon as possible"
    },
    {
      "type": "string",
      "format": "date-time",
      "description": "Scheduled start date/time in ISO 8601 format"
    }
  ]
} as const;

export const packageRequest = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/media-buy/package-request.json",
  "title": "Package Request",
  "description": "Package configuration for media buy creation",
  "type": "object",
  "properties": {
    "adcp_major_version": {
      "type": "integer",
      "description": "The AdCP major version the buyer's payloads conform to. Sellers validate against their supported major_versions and return VERSION_UNSUPPORTED if unsupported. When omitted, the seller assumes its highest supported version.",
      "minimum": 1,
      "maximum": 99
    },
    "product_id": {
      "type": "string",
      "description": "Product ID for this package",
      "x-entity": "product"
    },
    "format_ids": {
      "type": "array",
      "description": "Array of format IDs that will be used for this package - must be supported by the product. If omitted, defaults to all formats supported by the product.",
      "items": {
        "$ref": "/schemas/3.0.1/core/format-id.json"
      },
      "minItems": 1
    },
    "budget": {
      "type": "number",
      "description": "Budget allocation for this package in the media buy's currency",
      "minimum": 0
    },
    "pacing": {
      "$ref": "/schemas/3.0.1/enums/pacing.json"
    },
    "pricing_option_id": {
      "type": "string",
      "description": "ID of the selected pricing option from the product's pricing_options array",
      "x-entity": "product_pricing_option"
    },
    "bid_price": {
      "type": "number",
      "description": "Bid price for auction-based pricing options. This is the exact bid/price to honor unless selected pricing_option has max_bid=true, in which case bid_price is the buyer's maximum willingness to pay (ceiling).",
      "minimum": 0
    },
    "impressions": {
      "type": "number",
      "description": "Impression goal for this package",
      "minimum": 0
    },
    "start_time": {
      "type": "string",
      "format": "date-time",
      "not": {
        "const": "asap"
      },
      "description": "Flight start date/time for this package in ISO 8601 format. When omitted, the package inherits the media buy's start_time. Must fall within the media buy's date range."
    },
    "end_time": {
      "type": "string",
      "format": "date-time",
      "description": "Flight end date/time for this package in ISO 8601 format. When omitted, the package inherits the media buy's end_time. Must fall within the media buy's date range."
    },
    "paused": {
      "type": "boolean",
      "description": "Whether this package should be created in a paused state. Paused packages do not deliver impressions. Defaults to false.",
      "default": false
    },
    "catalogs": {
      "type": "array",
      "description": "Catalogs this package promotes. Each catalog MUST have a distinct type (e.g., one product catalog, one store catalog). This constraint is enforced at the application level — sellers MUST reject requests containing multiple catalogs of the same type with a validation_error. Makes the package catalog-driven: one budget envelope, platform optimizes across items.",
      "items": {
        "$ref": "/schemas/3.0.1/core/catalog.json"
      }
    },
    "optimization_goals": {
      "type": "array",
      "description": "Optimization targets for this package. The seller optimizes delivery toward these goals in priority order. Common pattern: event goals (purchase, install) as primary targets at priority 1; metric goals (clicks, views) as secondary proxy signals at priority 2+.",
      "items": {
        "$ref": "/schemas/3.0.1/core/optimization-goal.json"
      },
      "minItems": 1
    },
    "targeting_overlay": {
      "$ref": "/schemas/3.0.1/core/targeting.json"
    },
    "measurement_terms": {
      "$ref": "/schemas/3.0.1/core/measurement-terms.json",
      "description": "Buyer's proposed billing measurement and makegood terms. Overrides product defaults. Seller accepts (echoed on confirmed package), rejects with TERMS_REJECTED, or adjusts. When absent, product's measurement_terms apply."
    },
    "performance_standards": {
      "type": "array",
      "description": "Buyer's proposed performance standards for this package. Overrides product defaults. Seller accepts, rejects with TERMS_REJECTED, or adjusts. When absent, product's performance_standards apply.",
      "items": {
        "$ref": "/schemas/3.0.1/core/performance-standard.json"
      },
      "minItems": 1
    },
    "creative_assignments": {
      "type": "array",
      "description": "Assign existing library creatives to this package with optional weights and placement targeting",
      "items": {
        "$ref": "/schemas/3.0.1/core/creative-assignment.json"
      },
      "minItems": 1
    },
    "creatives": {
      "type": "array",
      "description": "Upload new creative assets and assign to this package (creatives will be added to library). Use creative_assignments instead for existing library creatives.",
      "items": {
        "$ref": "/schemas/3.0.1/core/creative-asset.json"
      },
      "minItems": 1,
      "maxItems": 100
    },
    "agency_estimate_number": {
      "type": "string",
      "maxLength": 100,
      "description": "Agency estimate or authorization number for this package. Overrides the media buy-level estimate number when different packages correspond to different agency estimates (e.g., different stations or flights within the same buy)."
    },
    "context": {
      "$ref": "/schemas/3.0.1/core/context.json"
    },
    "ext": {
      "$ref": "/schemas/3.0.1/core/ext.json"
    }
  },
  "required": [
    "product_id",
    "budget",
    "pricing_option_id"
  ],
  "additionalProperties": true
} as const;

export const advertiserIndustry = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/advertiser-industry.json",
  "title": "Advertiser Industry",
  "description": "Standardized advertiser industry classification. Top-level categories classify the advertiser's primary business. Dot-notation subcategories (e.g., 'media_entertainment.podcasts') provide platform-specific precision where needed. Sellers map these to platform-native codes (Spotify ADV categories, LinkedIn industry IDs, IAB Content Taxonomy, etc.). Sellers MUST accept unknown values gracefully — treat unrecognized values as the parent category (strip the subcategory) or as uncategorized. This ensures forward compatibility as the taxonomy evolves.",
  "type": "string",
  "x-extensible": true,
  "x-pattern": "^[a-z][a-z0-9_]+(\\.[a-z][a-z0-9_]+)?$",
  "enum": [
    "automotive",
    "automotive.electric_vehicles",
    "automotive.parts_accessories",
    "automotive.luxury",
    "beauty_cosmetics",
    "beauty_cosmetics.skincare",
    "beauty_cosmetics.fragrance",
    "beauty_cosmetics.haircare",
    "cannabis",
    "cpg",
    "cpg.personal_care",
    "cpg.household",
    "dating",
    "education",
    "education.higher_education",
    "education.online_learning",
    "education.k12",
    "energy_utilities",
    "energy_utilities.renewable",
    "fashion_apparel",
    "fashion_apparel.luxury",
    "fashion_apparel.sportswear",
    "finance",
    "finance.banking",
    "finance.insurance",
    "finance.investment",
    "finance.cryptocurrency",
    "food_beverage",
    "food_beverage.alcohol",
    "food_beverage.restaurants",
    "food_beverage.packaged_goods",
    "gambling_betting",
    "gambling_betting.sports_betting",
    "gambling_betting.casino",
    "gaming",
    "gaming.mobile",
    "gaming.console_pc",
    "gaming.esports",
    "government_nonprofit",
    "government_nonprofit.political",
    "government_nonprofit.charity",
    "healthcare",
    "healthcare.pharmaceutical",
    "healthcare.medical_devices",
    "healthcare.wellness",
    "home_garden",
    "home_garden.furniture",
    "home_garden.home_improvement",
    "media_entertainment",
    "media_entertainment.podcasts",
    "media_entertainment.music",
    "media_entertainment.film_tv",
    "media_entertainment.publishing",
    "media_entertainment.live_events",
    "pets",
    "professional_services",
    "professional_services.legal",
    "professional_services.consulting",
    "real_estate",
    "real_estate.residential",
    "real_estate.commercial",
    "recruitment_hr",
    "retail",
    "retail.ecommerce",
    "retail.department_stores",
    "sports_fitness",
    "sports_fitness.equipment",
    "sports_fitness.teams_leagues",
    "technology",
    "technology.software",
    "technology.hardware",
    "technology.ai_ml",
    "telecom",
    "telecom.mobile_carriers",
    "telecom.internet_providers",
    "transportation_logistics",
    "travel_hospitality",
    "travel_hospitality.airlines",
    "travel_hospitality.hotels",
    "travel_hospitality.cruise",
    "travel_hospitality.tourism"
  ],
  "enumDescriptions": {
    "automotive": "Automotive manufacturers, dealerships, and auto industry",
    "automotive.electric_vehicles": "Electric vehicle manufacturers and charging infrastructure",
    "automotive.parts_accessories": "Auto parts, accessories, and aftermarket products",
    "automotive.luxury": "Luxury and premium automotive brands",
    "beauty_cosmetics": "Beauty, cosmetics, and prestige skincare brands. Distinct from cpg.personal_care — use beauty_cosmetics for brands whose identity is rooted in beauty (L'Oreal Paris, Estee Lauder, Sephora) and cpg.personal_care for mass-market personal hygiene (Dove, Colgate)",
    "beauty_cosmetics.skincare": "Skincare brands and dermatological products",
    "beauty_cosmetics.fragrance": "Perfume and fragrance brands",
    "beauty_cosmetics.haircare": "Professional and prestige haircare brands",
    "cannabis": "Cannabis products and dispensaries. Subject to heavy platform restrictions — most platforms require explicit category declaration for ad acceptance",
    "cpg": "Consumer packaged goods — mass-market products sold through retail. For food and beverage manufacturers, use food_beverage. For prestige beauty, use beauty_cosmetics",
    "cpg.personal_care": "Mass-market personal care and hygiene products (deodorant, toothpaste, soap). For prestige beauty brands, use beauty_cosmetics",
    "cpg.household": "Household cleaning and maintenance products",
    "dating": "Dating apps and matchmaking services. Subject to platform restrictions similar to gambling_betting",
    "education": "Educational institutions and learning services",
    "education.higher_education": "Universities, colleges, and graduate programs",
    "education.online_learning": "Online courses, MOOCs, and digital education platforms",
    "education.k12": "Primary and secondary education",
    "energy_utilities": "Energy companies and utilities",
    "energy_utilities.renewable": "Renewable energy, solar, wind, and clean technology",
    "fashion_apparel": "Clothing, footwear, and fashion accessories",
    "fashion_apparel.luxury": "Luxury fashion and designer brands",
    "fashion_apparel.sportswear": "Athletic and sportswear brands",
    "finance": "Financial services, banking, and insurance",
    "finance.banking": "Retail and commercial banking",
    "finance.insurance": "Insurance products and services",
    "finance.investment": "Investment, wealth management, and brokerage",
    "finance.cryptocurrency": "Cryptocurrency exchanges and blockchain financial products",
    "food_beverage": "Food and beverage companies — manufacturers (Coca-Cola, Nestle), restaurants, and alcohol brands. For non-food packaged goods, use cpg",
    "food_beverage.alcohol": "Alcoholic beverages (beer, wine, spirits). Subject to platform age-gating and regional restrictions",
    "food_beverage.restaurants": "Restaurants, fast food, and food delivery",
    "food_beverage.packaged_goods": "Packaged food and non-alcoholic beverages",
    "gambling_betting": "Gambling, sports betting, and wagering. Subject to heavy platform restrictions — most platforms require explicit category declaration",
    "gambling_betting.sports_betting": "Sports betting and daily fantasy sports",
    "gambling_betting.casino": "Online casinos and traditional gambling",
    "gaming": "Video games and interactive entertainment",
    "gaming.mobile": "Mobile gaming",
    "gaming.console_pc": "Console and PC gaming",
    "gaming.esports": "Esports teams, tournaments, and streaming",
    "government_nonprofit": "Government agencies and nonprofit organizations",
    "government_nonprofit.political": "Political advertising and advocacy. Subject to platform transparency and disclosure requirements",
    "government_nonprofit.charity": "Charitable organizations and fundraising",
    "healthcare": "Healthcare, pharmaceuticals, and medical",
    "healthcare.pharmaceutical": "Pharmaceutical and biotech companies. Subject to platform restrictions on drug advertising",
    "healthcare.medical_devices": "Medical devices and health technology",
    "healthcare.wellness": "Wellness, supplements, and alternative health",
    "home_garden": "Home furnishing, improvement, and garden",
    "home_garden.furniture": "Furniture and home decor",
    "home_garden.home_improvement": "Home improvement, tools, and renovation",
    "media_entertainment": "Media, entertainment, and content",
    "media_entertainment.podcasts": "Podcast networks and podcast-first brands",
    "media_entertainment.music": "Music labels, streaming, and artists",
    "media_entertainment.film_tv": "Film studios, TV networks, and streaming services",
    "media_entertainment.publishing": "Book publishers, magazines, and digital publications",
    "media_entertainment.live_events": "Concerts, festivals, and live entertainment",
    "pets": "Pet food, supplies, and veterinary services",
    "professional_services": "Professional and business services",
    "professional_services.legal": "Law firms and legal services",
    "professional_services.consulting": "Management and business consulting",
    "real_estate": "Real estate, property, and construction",
    "real_estate.residential": "Residential real estate and housing",
    "real_estate.commercial": "Commercial real estate and property management",
    "recruitment_hr": "Job boards, staffing agencies, and HR technology",
    "retail": "Retail stores and e-commerce",
    "retail.ecommerce": "Online-first retailers and marketplaces",
    "retail.department_stores": "Department stores and multi-brand retailers",
    "sports_fitness": "Sports, fitness, and athletics",
    "sports_fitness.equipment": "Sports and fitness equipment",
    "sports_fitness.teams_leagues": "Professional sports teams and leagues",
    "technology": "Technology companies and digital services",
    "technology.software": "Software products, platforms, and SaaS",
    "technology.hardware": "Consumer electronics and hardware",
    "technology.ai_ml": "Artificial intelligence and machine learning companies",
    "telecom": "Telecommunications and connectivity",
    "telecom.mobile_carriers": "Mobile network operators",
    "telecom.internet_providers": "Internet service providers and broadband",
    "transportation_logistics": "Shipping, logistics, and freight services",
    "travel_hospitality": "Travel, hospitality, and tourism",
    "travel_hospitality.airlines": "Airlines and air travel",
    "travel_hospitality.hotels": "Hotels, resorts, and accommodation",
    "travel_hospitality.cruise": "Cruise lines and ocean travel",
    "travel_hospitality.tourism": "Tourism boards and travel agencies"
  }
} as const;

export const authScheme = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/auth-scheme.json",
  "title": "Authentication Scheme",
  "description": "Authentication schemes for push notification endpoints",
  "type": "string",
  "enum": [
    "Bearer",
    "HMAC-SHA256"
  ]
} as const;

export const creativeAgentCapability = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/creative-agent-capability.json",
  "title": "Creative Agent Capability",
  "description": "Capabilities supported by creative agents for format handling",
  "type": "string",
  "enum": [
    "validation",
    "assembly",
    "generation",
    "preview",
    "delivery"
  ]
} as const;

export const deliveryType = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/delivery-type.json",
  "title": "Delivery Type",
  "description": "Type of inventory delivery",
  "type": "string",
  "enum": [
    "guaranteed",
    "non_guaranteed"
  ],
  "enumDescriptions": {
    "guaranteed": "Reserved inventory with guaranteed delivery",
    "non_guaranteed": "Auction-based inventory without delivery guarantees"
  }
} as const;

export const disclosurePersistence = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/disclosure-persistence.json",
  "title": "Disclosure Persistence",
  "description": "How long a disclosure must persist during content playback or display. Different jurisdictions and regulations require different persistence behaviors for AI-generated content labels. When multiple sources specify persistence for the same jurisdiction (e.g., brief and provenance), the most restrictive mode applies: continuous > initial > flexible.",
  "type": "string",
  "enum": [
    "continuous",
    "initial",
    "flexible"
  ],
  "enumDescriptions": {
    "continuous": "Disclosure must remain visible or audible throughout the entire content display duration. For video and audio, this means the full playback duration. For static formats (display, DOOH), this means the full display slot. For DOOH specifically, 'content duration' means the ad's display slot within the rotation, not the screen's full rotation cycle.",
    "initial": "Disclosure must appear at the start of content for a minimum duration before it may be removed. Pair with min_duration_ms in render_guidance or creative brief to specify the required duration.",
    "flexible": "Disclosure presence is sufficient; placement timing and duration are at the publisher's discretion"
  }
} as const;

export const disclosurePosition = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/disclosure-position.json",
  "title": "Disclosure Position",
  "description": "Where a required disclosure should appear within a creative. Used by creative briefs to specify disclosure placement and by formats to declare which positions they can render.",
  "type": "string",
  "enum": [
    "prominent",
    "footer",
    "audio",
    "subtitle",
    "overlay",
    "end_card",
    "pre_roll",
    "companion"
  ]
} as const;

export const mediaBuyStatus = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/media-buy-status.json",
  "title": "Media Buy Status",
  "description": "Status of a media buy.",
  "type": "string",
  "enum": [
    "pending_creatives",
    "pending_start",
    "active",
    "paused",
    "completed",
    "rejected",
    "canceled"
  ],
  "enumDescriptions": {
    "pending_creatives": "Media buy is approved but has no creatives assigned. The buyer must attach creatives via sync_creatives before the buy can serve.",
    "pending_start": "Media buy is ready to serve and waiting for its flight date to begin.",
    "active": "Media buy is currently running",
    "paused": "Media buy is temporarily paused",
    "completed": "Media buy has finished running",
    "rejected": "Media buy was declined by the seller after creation",
    "canceled": "Media buy was terminated before natural completion. Check cancellation.canceled_by to determine whether the buyer or seller initiated."
  }
} as const;

export const mediaBuyValidAction = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/media-buy-valid-action.json",
  "title": "Media Buy Valid Action",
  "description": "Actions the buyer can perform on a media buy",
  "type": "string",
  "enum": [
    "pause",
    "resume",
    "cancel",
    "update_budget",
    "update_dates",
    "update_packages",
    "add_packages",
    "sync_creatives"
  ]
} as const;

export const wcagLevel = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.0.1/enums/wcag-level.json",
  "title": "WCAG Level",
  "description": "Web Content Accessibility Guidelines conformance level",
  "type": "string",
  "enum": [
    "A",
    "AA",
    "AAA"
  ],
  "enumDescriptions": {
    "A": "Minimum level of conformance. Addresses the most basic accessibility barriers.",
    "AA": "Addresses the most common barriers for disabled users. Required by most accessibility regulations.",
    "AAA": "Highest level of conformance. Addresses the widest range of accessibility barriers."
  }
} as const;

export function loadAdcpCorpus(): Array<{ $id?: string; [k: string]: unknown }> {
  return [
    getSignalsReq, getSignalsRes, activateReq, activateRes, listCreativeFormatsReq, listCreativeFormatsRes, getProductsReq, getProductsRes, createMediaBuyReq, createMediaBuyRes, signalId, deployment, destination, accountRef, context, ext, error, paginationReq, paginationRes, signalFilters, vendorPricingOption, signalPricing, signalPricingOption, pricingOption, activationKey, signalValueType, signalCatalogType, taskStatus, brandId, brandRef, account, businessEntity, catalog, duration, formatId, format, packageSchema, plannedDelivery, productFilters, product, propertyListRef, proposal, pushNotificationConfig, reportingWebhook, startTiming, packageRequest, advertiserIndustry, authScheme, creativeAgentCapability, deliveryType, disclosurePersistence, disclosurePosition, mediaBuyStatus, mediaBuyValidAction, wcagLevel
  ] as Array<{ $id?: string; [k: string]: unknown }>;
}
