// Signal Ledger Media product catalog — AdCP 3.0.1-conformant.
//
// Each Product satisfies /schemas/3.0.1/core/product.json:
//   - product_id, name, description, delivery_type ✓
//   - publisher_properties[] (selectors against our adagents.json)
//   - format_ids[] (FormatRef objects with agent_url + id, NOT strings)
//   - pricing_options[] (discriminated union — see CPM / flat_rate / CPA shapes)
//   - reporting_capabilities (frequencies + metrics + timezone)
//   - creative_policy {co_branding, landing_page, templates_available} with
//     spec-aligned enum values (co_branding: required|optional|none)
//   - performance_standards[] (decimal thresholds 0..1, with metric + vendor)
//
// AI Buying Assistant uses pricing_model "cpa" with event_type: "custom" +
// custom_event_name: "qualified_conversation" — the only spec-aligned way to
// express "$3.50 per qualified conversation" since 3.0.1 doesn't define a
// dedicated cost_per_conversation model.

import type { CreativeFormat } from "./formats";

const PUBLISHER_DOMAIN = "signalledgermedia.example.com";
const SELLER_AGENT_URL = "https://signal-ledger-media-seller.example.workers.dev";
const FORMATS_AGENT_URL = SELLER_AGENT_URL; // we own all 4 custom formats

const CURRENCY = "USD";

// ── Schema-aligned types ──────────────────────────────────────────────────

export type DeliveryType = "guaranteed" | "non_guaranteed";

export interface FormatRef {
    agent_url: string;
    id: string;
}

export interface PublisherPropertySelector {
    publisher_domain: string;
    selection_type: "all" | "by_id" | "by_tag";
    property_ids?: string[];
    property_tags?: string[];
}

export type PricingOption =
    | CpmOption
    | FlatRateOption
    | CpaOption;

interface BasePricingOption {
    pricing_option_id: string;
    pricing_model: string;
    currency: string;
    min_spend_per_package?: number;
}

export interface CpmOption extends BasePricingOption {
    pricing_model: "cpm";
    fixed_price: number;
}

export interface FlatRateOption extends BasePricingOption {
    pricing_model: "flat_rate";
    fixed_price: number;
}

export interface CpaOption extends BasePricingOption {
    pricing_model: "cpa";
    event_type:
        | "page_view" | "view_content" | "select_content" | "select_item"
        | "search" | "share" | "add_to_cart" | "remove_from_cart"
        | "viewed_cart" | "add_to_wishlist" | "initiate_checkout"
        | "add_payment_info" | "purchase" | "refund" | "lead"
        | "qualify_lead" | "close_convert_lead" | "disqualify_lead"
        | "complete_registration" | "subscribe" | "start_trial"
        | "app_install" | "app_launch" | "contact" | "schedule"
        | "donate" | "submit_application" | "custom";
    custom_event_name?: string;
    fixed_price: number;
}

export interface ReportingCapabilities {
    available_reporting_frequencies: ("hourly" | "daily" | "monthly")[];
    expected_delay_minutes: number;
    timezone: string;
    supports_webhooks: boolean;
    available_metrics: string[];
    date_range_support: "date_range" | "lifetime_only";
}

export interface CreativePolicy {
    co_branding: "required" | "optional" | "none";
    landing_page: "any" | "retailer_site_only" | "must_include_retailer";
    templates_available: boolean;
}

export type PerfMetric = "viewability" | "ivt" | "completion_rate" | "brand_safety" | "attention_score";

export interface PerformanceStandard {
    metric: PerfMetric;
    threshold: number; // decimal 0..1
    standard?: "mrc" | "groupm";
    vendor: { domain: string };
}

export interface MeasurementTerms {
    billing_measurement: {
        vendor: { domain: string };
        /** Lowest variance the seller will commit to. Buyer requests below this
         *  are TERMS_REJECTED. */
        max_variance_percent: number;
        /** Reconciliation window the seller supports (e.g. "c7"). Buyer requests
         *  outside the seller's supported set are TERMS_REJECTED. Sellers may
         *  also expose `supported_measurement_windows` for richer matching. */
        measurement_window?: string;
    };
    /** Auxiliary list of windows we accept besides the default. */
    supported_measurement_windows?: string[];
    makegood_policy?: { available_remedies: string[] };
}

export interface Product {
    product_id: string;
    name: string;
    description: string;
    publisher_properties: PublisherPropertySelector[];
    format_ids: FormatRef[];
    delivery_type: DeliveryType;
    is_custom: boolean;
    pricing_options: PricingOption[];
    reporting_capabilities: ReportingCapabilities;
    creative_policy?: CreativePolicy;
    performance_standards?: PerformanceStandard[];
    measurement_terms?: MeasurementTerms;
    /** Bundle-only: constituent product_ids. */
    bundled_product_ids?: string[];
}

// ── Reusable building blocks ──────────────────────────────────────────────

const DEFAULT_PROPERTY: PublisherPropertySelector = {
    publisher_domain: PUBLISHER_DOMAIN,
    selection_type: "all",
};

function fmt(id: string): FormatRef {
    return { agent_url: FORMATS_AGENT_URL, id };
}

const STANDARD_REPORTING: ReportingCapabilities = {
    available_reporting_frequencies: ["daily"],
    expected_delay_minutes: 240,
    timezone: "UTC",
    supports_webhooks: true,
    available_metrics: ["impressions", "spend", "clicks", "ctr", "viewability"],
    date_range_support: "date_range",
};

const PODCAST_REPORTING: ReportingCapabilities = {
    available_reporting_frequencies: ["daily", "monthly"],
    expected_delay_minutes: 1440, // 24h — podcast download counts settle slowly
    timezone: "UTC",
    supports_webhooks: false,
    available_metrics: ["impressions", "spend"],
    date_range_support: "date_range",
};

const SI_REPORTING: ReportingCapabilities = {
    available_reporting_frequencies: ["daily"],
    expected_delay_minutes: 240,
    timezone: "UTC",
    supports_webhooks: true,
    available_metrics: ["impressions", "spend", "engagement_rate", "leads", "conversions"],
    date_range_support: "date_range",
};

const VIEWABILITY_70: PerformanceStandard = {
    metric: "viewability",
    threshold: 0.70,
    standard: "mrc",
    vendor: { domain: "moat.com" },
};

// Default seller measurement-terms commitments. These describe what
// Signal Ledger will commit to honor. Buyer requests stricter than these
// (e.g. max_variance_percent=0, measurement_window="c30") are
// TERMS_REJECTED; equal-or-looser proposals are accepted.
const SELLER_MEASUREMENT_TERMS: MeasurementTerms = {
    billing_measurement: {
        vendor: { domain: "admanager.google.com" },
        max_variance_percent: 5,
        measurement_window: "c7",
    },
    supported_measurement_windows: ["c7", "live", "post_ivt"],
    makegood_policy: {
        available_remedies: ["additional_delivery", "credit"],
    },
};

// ── Products ──────────────────────────────────────────────────────────────

export const PRODUCTS: Product[] = [
    {
        product_id: "slm_executive_insight_display",
        name: "Executive Insight Display",
        description:
            "Premium display inventory across Signal Ledger's executive newsletter and " +
            "C-suite portal. 100% SOV in editorial frames adjacent to executive analysis " +
            "content. Audience: VP+ at companies with revenue >$50M. Guaranteed CPM.",
        publisher_properties: [DEFAULT_PROPERTY],
        format_ids: [fmt("b2b_native_card")],
        delivery_type: "guaranteed",
        is_custom: false,
        pricing_options: [
            {
                pricing_option_id: "executive_cpm_45",
                pricing_model: "cpm",
                currency: CURRENCY,
                fixed_price: 45,
                min_spend_per_package: 25_000,
            },
        ],
        reporting_capabilities: STANDARD_REPORTING,
        creative_policy: { co_branding: "optional", landing_page: "any", templates_available: false },
        measurement_terms: SELLER_MEASUREMENT_TERMS,
        performance_standards: [VIEWABILITY_70],
    },

    {
        product_id: "slm_sponsored_research_brief",
        name: "Sponsored Research Brief",
        description:
            "Co-branded research brief produced by Signal Ledger's research team. " +
            "Includes: 10-page brief PDF, dedicated landing page, optional 15-30s OLV " +
            "explainer, 10-slide companion deck, and 90-day lead-share with sponsor. " +
            "Topic alignment with sponsor's category required (no editorial control). " +
            "Flat-fee, guaranteed delivery.",
        publisher_properties: [DEFAULT_PROPERTY],
        format_ids: [fmt("research_brief_sponsorship"), fmt("b2b_native_card")],
        delivery_type: "guaranteed",
        is_custom: true,
        pricing_options: [
            {
                pricing_option_id: "rb_flat_25k",
                pricing_model: "flat_rate",
                currency: CURRENCY,
                fixed_price: 25_000,
                min_spend_per_package: 25_000,
            },
        ],
        reporting_capabilities: STANDARD_REPORTING,
        creative_policy: { co_branding: "required", landing_page: "any", templates_available: true },
        measurement_terms: SELLER_MEASUREMENT_TERMS,
    },

    {
        product_id: "slm_data_leaders_podcast",
        name: "Data Leaders Podcast Sponsorship",
        description:
            "30-second host-read mid-roll on the Data Leaders Podcast. Audience: data " +
            "engineering leaders, CDOs, analytics VPs (avg episode listens: 18K, 65% " +
            "VP+). Includes podcast network distribution + 14-day audio shoulder " +
            "(rebroadcast in newsletter podcast embed). Flat-fee per episode.",
        publisher_properties: [DEFAULT_PROPERTY],
        format_ids: [fmt("podcast_host_read_30")],
        delivery_type: "guaranteed",
        is_custom: false,
        pricing_options: [
            {
                pricing_option_id: "podcast_flat_18k",
                pricing_model: "flat_rate",
                currency: CURRENCY,
                fixed_price: 18_000,
                min_spend_per_package: 18_000,
            },
        ],
        reporting_capabilities: PODCAST_REPORTING,
        creative_policy: { co_branding: "none", landing_page: "any", templates_available: false },
        measurement_terms: SELLER_MEASUREMENT_TERMS,
    },

    {
        product_id: "slm_ai_buying_assistant",
        name: "AI Buying Assistant Sponsorship",
        description:
            "Sponsored agent placement inside Signal Ledger's AI Buying Assistant. " +
            "Triggers on intent-matched buyer conversations (CDP evaluations, identity " +
            "resolution RFPs, attribution reviews). FTC-disclosed sponsored answer with " +
            "knowledge grounding to sponsor's content. Billed per qualified conversation " +
            "(>=3-turn, intent-matched), modeled as a CPA event with " +
            "custom_event_name='qualified_conversation'. Sponsored-intelligence " +
            "inventory; non-guaranteed (throughput depends on matched intent volume).",
        publisher_properties: [DEFAULT_PROPERTY],
        format_ids: [fmt("ai_sponsored_agent")],
        delivery_type: "non_guaranteed",
        is_custom: true,
        pricing_options: [
            {
                pricing_option_id: "ai_cpa_350",
                pricing_model: "cpa",
                event_type: "custom",
                custom_event_name: "qualified_conversation",
                currency: CURRENCY,
                fixed_price: 3.50,
                min_spend_per_package: 10_000,
            },
        ],
        reporting_capabilities: SI_REPORTING,
        creative_policy: { co_branding: "required", landing_page: "any", templates_available: true },
        measurement_terms: SELLER_MEASUREMENT_TERMS,
    },

    {
        product_id: "slm_abm_display_extension",
        name: "ABM Display Extension",
        description:
            "Account-targeted display extension across Signal Ledger's owned-and-operated " +
            "audience network (newsletter inventory + B2B partner extension). Sponsor " +
            "supplies target account list; we match to authenticated readers and partner " +
            "1P graph. Guaranteed CPM at the higher rate reflects ABM matching premium.",
        publisher_properties: [DEFAULT_PROPERTY],
        format_ids: [fmt("b2b_native_card")],
        delivery_type: "guaranteed",
        is_custom: false,
        pricing_options: [
            {
                pricing_option_id: "abm_cpm_65",
                pricing_model: "cpm",
                currency: CURRENCY,
                fixed_price: 65,
                min_spend_per_package: 50_000,
            },
        ],
        reporting_capabilities: STANDARD_REPORTING,
        creative_policy: { co_branding: "optional", landing_page: "any", templates_available: false },
        measurement_terms: SELLER_MEASUREMENT_TERMS,
        performance_standards: [VIEWABILITY_70],
    },
];

export const ABM_BUNDLE: Product = {
    product_id: "slm_cross_channel_abm_bundle",
    name: "Cross-Channel ABM Bundle (proposal)",
    description:
        "Cross-channel ABM proposal bundling ABM Display Extension + Sponsored " +
        "Research Brief + AI Buying Assistant Sponsorship. Coordinated flight: " +
        "Display awareness (weeks 1-4) → Brief co-publication (week 3) → AI " +
        "Buying Assistant activation (weeks 4-8). Single contact, single PO, " +
        "12% bundle discount vs. line-item pricing at $150K+ committed spend. " +
        "Proposal-mode product — concrete pricing finalized in proposal exchange.",
    publisher_properties: [DEFAULT_PROPERTY],
    format_ids: [fmt("b2b_native_card"), fmt("research_brief_sponsorship"), fmt("ai_sponsored_agent")],
    delivery_type: "guaranteed",
    is_custom: true,
    bundled_product_ids: [
        "slm_abm_display_extension",
        "slm_sponsored_research_brief",
        "slm_ai_buying_assistant",
    ],
    pricing_options: [
        {
            pricing_option_id: "abm_bundle_proposal_floor",
            pricing_model: "flat_rate",
            currency: CURRENCY,
            fixed_price: 150_000,
            min_spend_per_package: 150_000,
        },
    ],
    reporting_capabilities: STANDARD_REPORTING,
    creative_policy: { co_branding: "required", landing_page: "any", templates_available: true },
    measurement_terms: SELLER_MEASUREMENT_TERMS,
};

export const ALL_PRODUCTS: Product[] = [...PRODUCTS, ABM_BUNDLE];

export function findProduct(productId: string): Product | undefined {
    return ALL_PRODUCTS.find((p) => p.product_id === productId);
}

// ── Discovery filtering / ranking ─────────────────────────────────────────

export function rankProducts(brief: string | undefined, filterFormatIds: string[] | undefined): Product[] {
    let pool: Product[] = ALL_PRODUCTS;
    if (filterFormatIds && filterFormatIds.length > 0) {
        const wanted = new Set(filterFormatIds);
        pool = pool.filter((p) => p.format_ids.some((f) => wanted.has(f.id)));
    }
    const briefLower = (brief ?? "").toLowerCase();
    const isAbmIntent =
        /\babm\b|account[-\s]?based|target accounts?|named accounts?/.test(briefLower);
    if (!isAbmIntent) return pool;
    return [...pool].sort((a, b) => abmRank(b) - abmRank(a));
}

function abmRank(p: Product): number {
    if (p.product_id === "slm_cross_channel_abm_bundle") return 100;
    if (p.product_id === "slm_abm_display_extension") return 80;
    if (p.product_id === "slm_sponsored_research_brief") return 60;
    if (p.product_id === "slm_ai_buying_assistant") return 50;
    return 0;
}

export function productHasPricingModel(p: Product, model: string): boolean {
    return p.pricing_options.some((o) => o.pricing_model === model);
}

// Touch unused import to satisfy strict linting if turned on.
export type { CreativeFormat };
