// 4 creative formats Signal Ledger Media accepts.
// AdCP 3.0 GA creative-format shape: { format_id, name, type, is_standard,
//   requirements?, assets_required? }. `type` is the IAB-aligned channel
//   classification: display | video | audio | native | rich_media | dooh.
// Sponsored-intelligence formats (AI agent placements) carry type='native'
// + a custom `delivery_surface: 'ai_agent'` flag in requirements, since
// AdCP 3.0 doesn't yet have a first-class SI format type.

export interface CreativeFormat {
    format_id: string;
    name: string;
    type: "display" | "video" | "audio" | "native" | "rich_media" | "dooh";
    is_standard: boolean;
    description: string;
    assets_required: AssetSpec[];
    requirements?: Record<string, unknown>;
}

interface AssetSpec {
    asset_id: string;
    asset_type: "image" | "video" | "audio" | "text" | "url";
    required: boolean;
    description: string;
    constraints?: Record<string, unknown>;
}

export const CREATIVE_FORMATS: CreativeFormat[] = [
    {
        format_id: "b2b_native_card",
        name: "B2B Native Card",
        type: "native",
        is_standard: false,
        description:
            "In-feed native card for B2B contexts (newsletter, decision-maker portal, " +
            "research hub). Supports headline, body, logo, and one CTA.",
        assets_required: [
            {
                asset_id: "headline",
                asset_type: "text",
                required: true,
                description: "Card headline",
                constraints: { max_length: 90 },
            },
            {
                asset_id: "body",
                asset_type: "text",
                required: true,
                description: "Card body copy",
                constraints: { max_length: 240 },
            },
            {
                asset_id: "logo",
                asset_type: "image",
                required: true,
                description: "Advertiser logo (square)",
                constraints: {
                    formats: ["png", "svg"],
                    min_width: 200,
                    min_height: 200,
                    max_size_kb: 200,
                },
            },
            {
                asset_id: "cta_text",
                asset_type: "text",
                required: true,
                description: "Call-to-action button text",
                constraints: { max_length: 24 },
            },
            {
                asset_id: "click_url",
                asset_type: "url",
                required: true,
                description: "Landing-page URL",
            },
        ],
        requirements: {
            placements: ["newsletter_inline", "portal_feed", "research_sidebar"],
            macros_supported: ["{advertiser_id}", "{click_id}", "{user_segment}"],
        },
    },
    {
        format_id: "research_brief_sponsorship",
        name: "Sponsored Research Brief",
        type: "display",
        is_standard: false,
        description:
            "Co-branded research brief (PDF + landing page + 10-slide companion deck). " +
            "Sponsor receives co-author byline, lead-share rights for 90 days, and " +
            "right-of-first-refusal on quarterly update. Includes optional embedded " +
            "OLV explainer (15-30s).",
        assets_required: [
            {
                asset_id: "sponsor_logo",
                asset_type: "image",
                required: true,
                description: "Sponsor logo for co-branding",
                constraints: {
                    formats: ["svg", "png"],
                    min_width: 400,
                    transparent_bg: true,
                },
            },
            {
                asset_id: "byline_copy",
                asset_type: "text",
                required: true,
                description: "Co-author byline (advertiser name + 1-line description)",
                constraints: { max_length: 180 },
            },
            {
                asset_id: "olv_asset",
                asset_type: "video",
                required: false,
                description:
                    "Optional 15-30s OLV explainer embedded in landing page",
                constraints: {
                    duration_sec: { min: 15, max: 30 },
                    formats: ["mp4"],
                    aspect: "16:9",
                    max_size_mb: 50,
                },
            },
            {
                asset_id: "lead_capture_url",
                asset_type: "url",
                required: true,
                description: "Sponsor's lead capture URL (gated brief downloads route here)",
            },
        ],
        requirements: {
            channels: ["display", "olv"],
            lead_share_window_days: 90,
            production_lead_time_business_days: 21,
        },
    },
    {
        format_id: "podcast_host_read_30",
        name: "Podcast Host-Read (30s)",
        type: "audio",
        is_standard: true,
        description:
            "30-second host-read mid-roll on the Data Leaders Podcast. " +
            "Talking points provided by advertiser; host adapts in their voice. " +
            "Includes one promo URL + one promo code.",
        assets_required: [
            {
                asset_id: "talking_points",
                asset_type: "text",
                required: true,
                description: "3-5 bullet talking points for the host to adapt",
                constraints: { min_bullets: 3, max_bullets: 5, max_chars_per_bullet: 200 },
            },
            {
                asset_id: "promo_url",
                asset_type: "url",
                required: true,
                description: "Trackable URL for the promo (vanity domain recommended)",
            },
            {
                asset_id: "promo_code",
                asset_type: "text",
                required: false,
                description: "Optional promo code mentioned in the read",
                constraints: { max_length: 20 },
            },
            {
                asset_id: "pronunciation_guide",
                asset_type: "text",
                required: false,
                description: "Phonetic pronunciation for brand/product names",
                constraints: { max_length: 200 },
            },
        ],
        requirements: {
            duration_sec: 30,
            placement: "mid_roll",
            host_approval_required: true,
            production_lead_time_business_days: 10,
        },
    },
    {
        format_id: "ai_sponsored_agent",
        name: "AI Sponsored Agent Placement",
        type: "native",
        is_standard: false,
        description:
            "Sponsored answer placement inside Signal Ledger's AI Buying Assistant. " +
            "Surfaced when conversation matches advertiser's intent triggers. " +
            "Disclosure-labeled per FTC sponsored-content guidelines. Billed per " +
            "qualified conversation (cost_per_conversation).",
        assets_required: [
            {
                asset_id: "agent_persona",
                asset_type: "text",
                required: true,
                description:
                    "Short description of the sponsoring brand and the angle the agent should foreground",
                constraints: { max_length: 500 },
            },
            {
                asset_id: "intent_triggers",
                asset_type: "text",
                required: true,
                description:
                    "Comma-separated buying-intent triggers (e.g. 'cdp evaluation, identity resolution rfp')",
                constraints: { max_length: 1000 },
            },
            {
                asset_id: "knowledge_url",
                asset_type: "url",
                required: true,
                description:
                    "URL the agent grounds on (product docs, comparison page, RFP guide)",
            },
            {
                asset_id: "handoff_url",
                asset_type: "url",
                required: true,
                description: "Conversation hand-off URL when user opts in",
            },
            {
                asset_id: "disclosure_tagline",
                asset_type: "text",
                required: false,
                description:
                    "Optional sponsor disclosure tagline appended after the default 'Sponsored by X' label",
                constraints: { max_length: 80 },
            },
        ],
        requirements: {
            delivery_surface: "ai_agent",
            disclosure: "ftc_sponsored_label_required",
            qualified_conversation_definition:
                "user-initiated multi-turn (>=3 turns) conversation matching at least one intent trigger",
            min_conversation_turns: 3,
            production_lead_time_business_days: 7,
        },
    },
];

export function findFormat(formatId: string): CreativeFormat | undefined {
    return CREATIVE_FORMATS.find((f) => f.format_id === formatId);
}
