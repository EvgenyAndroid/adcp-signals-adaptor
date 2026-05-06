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

export function loadAdcpCorpus(): Array<{ $id?: string; [k: string]: unknown }> {
  return [
    getSignalsReq, getSignalsRes, activateReq, activateRes, signalId, deployment, destination, accountRef, context, ext, error, paginationReq, paginationRes, signalFilters, vendorPricingOption, signalPricing, signalPricingOption, pricingOption, activationKey, signalValueType, signalCatalogType, taskStatus, brandId, brandRef
  ] as Array<{ $id?: string; [k: string]: unknown }>;
}
