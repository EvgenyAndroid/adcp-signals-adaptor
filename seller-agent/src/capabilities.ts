import type { Env } from "./env";

const REPLAY_TTL_SECONDS = 86_400; // 24h — matches HEAD spec defaults
const SUPPORTED_PROTOCOLS = ["media_buy", "creative"] as const;
const SUPPORTED_OPERATIONS = [
    "get_products",
    "create_media_buy",
    "get_media_buy_delivery",
    "list_creative_formats",
] as const;

export interface AdcpCapabilities {
    adcp: {
        major_versions: number[];
        idempotency: { supported: true; replay_ttl_seconds: number };
    };
    supported_protocols: readonly string[];
    media_buy?: {
        supported_operations: readonly string[];
        currencies: string[];
        pricing_models: string[];
        delivery_types: string[];
        idempotency_required_on: string[];
    };
    creative?: {
        supported_operations: readonly string[];
        max_assets_per_format: number;
    };
    contact: {
        publisher: string;
        domain: string;
        sales_email: string;
    };
    ext?: Record<string, unknown>;
}

export function buildCapabilities(env: Env, filter: ReadonlySet<string> | null): AdcpCapabilities {
    const cap: AdcpCapabilities = {
        adcp: {
            major_versions: [3],
            idempotency: { supported: true, replay_ttl_seconds: REPLAY_TTL_SECONDS },
        },
        supported_protocols: SUPPORTED_PROTOCOLS,
        contact: {
            publisher: env.PUBLISHER,
            domain: env.AGENT_DOMAIN,
            sales_email: "sales@signalledgermedia.example",
        },
    };

    const include = (p: string) => !filter || filter.has(p);

    if (include("media_buy")) {
        cap.media_buy = {
            supported_operations: SUPPORTED_OPERATIONS,
            currencies: ["USD"],
            // AdCP 3.0.1 pricing-model enum values only. The SI product is
            // billed per qualified conversation (a $3.50/conversation rate),
            // but the wire model is `cpa` with custom_event_name=
            // "qualified_conversation" — see catalog/products.ts. The
            // "cost_per_conversation" string is product-description copy, not
            // an enum value, and never lands in this list.
            pricing_models: ["cpm", "flat_rate", "cpa"],
            delivery_types: ["guaranteed", "non_guaranteed"],
            idempotency_required_on: ["create_media_buy"],
        };
    }
    if (include("creative")) {
        cap.creative = {
            supported_operations: ["list_creative_formats"],
            max_assets_per_format: 10,
        };
    }
    return cap;
}
