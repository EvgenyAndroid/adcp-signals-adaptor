// src/domain/enrichedSignalModel.ts
// Signals derived from Census ACS, Nielsen DMA, and IAB cross-taxonomy bridge data.
// These supplement the base seeded catalog with higher-fidelity, source-attributed segments.

import type { CanonicalSignal } from "../types/signal";
import { signalIdFromSlug } from "../utils/ids";

const NOW = "2025-01-01T00:00:00Z";
const DEFAULT_DESTINATIONS = ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"];

function enriched(
  slug: string,
  name: string,
  description: string,
  categoryType: CanonicalSignal["categoryType"],
  taxonomyId: string | undefined,
  estimatedSize: number,
  sourceSystems: string[],
  opts: Partial<CanonicalSignal> = {}
): CanonicalSignal {
  return {
    signalId: signalIdFromSlug(slug),
    taxonomySystem: "iab_audience_1_1",
    name,
    description,
    categoryType,
    ...(taxonomyId ? { externalTaxonomyId: taxonomyId } : {}),
    sourceSystems,
    destinations: DEFAULT_DESTINATIONS,
    activationSupported: true,
    estimatedAudienceSize: estimatedSize,
    accessPolicy: "public_demo",
    generationMode: "seeded",
    status: "available",
    freshness: "30d",
    pricing: { model: "mock_cpm", value: 2.5, currency: "USD" },
    createdAt: NOW,
    updatedAt: NOW,
    ...opts,
  };
}

// ── Census ACS-Derived Signals ────────────────────────────────────────────────
// Source: ACS 2022 5-year estimates, tables B01001 × B19001 × B15003 × B11001

export const CENSUS_SIGNALS: CanonicalSignal[] = [
  enriched(
    "acs_affluent_college_educated",
    "Affluent College Educated Households (ACS)",
    "Households with HHI $100K+ and bachelor's degree or higher. " +
      "Source: ACS 2022 B19001 × B15003 cross-tab. MOE ±2.1% at 90% confidence. " +
      "High index for premium brands, financial services, travel, and professional services.",
    "demographic",
    "10",
    3_850_000,
    ["census_acs_2022", "iab_taxonomy_loader"],
    { rawSourceRefs: ["ACS_B19001", "ACS_B15003"] }
  ),

  enriched(
    "acs_middle_income_families",
    "Middle Income Families with Children (ACS)",
    "Family households with children earning $50K–$150K. " +
      "Source: ACS 2022 B11001 × B19001. MOE ±1.8% at 90% confidence. " +
      "Core CPG, education technology, family entertainment, and QSR segment.",
    "demographic",
    "20",
    5_240_000,
    ["census_acs_2022", "iab_taxonomy_loader"],
    { rawSourceRefs: ["ACS_B11001", "ACS_B19001"] }
  ),

  enriched(
    "acs_young_single_adults",
    "Young Single Adults 18-34 (ACS)",
    "Single-person households aged 18-34. " +
      "Source: ACS 2022 B01001 × B11001. MOE ±2.4% at 90% confidence. " +
      "Digital-first, streaming-primary, high mobile usage, gaming affinity.",
    "demographic",
    "4",
    4_510_000,
    ["census_acs_2022", "iab_taxonomy_loader"],
    { rawSourceRefs: ["ACS_B01001", "ACS_B11001"] }
  ),

  enriched(
    "acs_graduate_high_income",
    "Graduate Educated High Income Households (ACS)",
    "Households with graduate/professional degree and HHI $150K+. " +
      "Source: ACS 2022 B15003 × B19001. Top-tier premium segment. " +
      "Strong affinity for financial content, business news, travel, and luxury categories.",
    "demographic",
    "11",
    1_290_000,
    ["census_acs_2022", "iab_taxonomy_loader"],
    { rawSourceRefs: ["ACS_B15003", "ACS_B19001"] }
  ),

  enriched(
    "acs_senior_households_income",
    "Senior Households with Income (ACS)",
    "Households where primary adult is 65+ with HHI $50K+. " +
      "Source: ACS 2022 B01001 × B11001 × B19001. Growing digital adoption cohort. " +
      "Strong index for healthcare, financial services, travel, and home improvement.",
    "demographic",
    "22",
    2_100_000,
    ["census_acs_2022", "iab_taxonomy_loader"],
    { rawSourceRefs: ["ACS_B01001", "ACS_B11001", "ACS_B19001"] }
  ),
];

// ── Nielsen DMA-Derived Signals ───────────────────────────────────────────────
// Source: Nielsen 2023-24 DMA universe estimates

export const DMA_SIGNALS: CanonicalSignal[] = [
  enriched(
    "dma_new_york_dma",
    "New York DMA (DMA 501)",
    "Nielsen DMA 501 — New York. 7.5M+ TV households. " +
      "Covers NY, NJ, CT. Rank #1 US market. " +
      "Premium CPM market with highest advertiser demand nationally.",
    "geo",
    "303",
    7_520_000,
    ["nielsen_dma_2024"],
    { geography: ["DMA-501", "NY", "NJ", "CT"] }
  ),

  enriched(
    "dma_top_5_markets",
    "Top 5 US DMA Markets",
    "Nielsen DMAs ranked 1-5: New York (501), Los Angeles (802), Chicago (602), " +
      "Philadelphia (504), Dallas-Ft. Worth (618). " +
      "Combined ~25M TV households, ~21% of US. Premium national reach.",
    "geo",
    "303",
    24_680_000,
    ["nielsen_dma_2024"],
    { geography: ["DMA-501", "DMA-802", "DMA-602", "DMA-504", "DMA-618"] }
  ),

  enriched(
    "dma_top_10_markets",
    "Top 10 US DMA Markets (Nielsen)",
    "Nielsen DMAs ranked 1-10. Covers New York, LA, Chicago, Philadelphia, Dallas, " +
      "Boston, San Francisco, Washington DC, Atlanta, Houston. " +
      "~37M TV households, ~32% of US addressable market.",
    "geo",
    "303",
    37_510_000,
    ["nielsen_dma_2024"],
    {
      geography: [
        "DMA-501", "DMA-802", "DMA-602", "DMA-504", "DMA-618",
        "DMA-511", "DMA-803", "DMA-524", "DMA-561", "DMA-623",
      ],
    }
  ),

  enriched(
    "dma_top_25_markets",
    "Top 25 US DMA Markets (Nielsen)",
    "Nielsen DMAs ranked 1-25. Covers all major US metros. " +
      "~60M TV households, ~52% of US addressable market. " +
      "Standard planning unit for national broadcast buys.",
    "geo",
    "304",
    59_850_000,
    ["nielsen_dma_2024"],
    { geography: ["DMA-TOP-25"] }
  ),

  enriched(
    "dma_sunbelt_growth_markets",
    "Sunbelt Growth DMA Markets",
    "High-growth Sunbelt DMAs: Dallas (618), Houston (623), Atlanta (561), " +
      "Phoenix (753), Miami (527), Tampa (539), Austin (543), Charlotte (616). " +
      "Above-average HHI growth and population expansion. Strong for financial, auto, and retail.",
    "geo",
    "301",
    17_470_000,
    ["nielsen_dma_2024"],
    {
      geography: [
        "DMA-618", "DMA-623", "DMA-561", "DMA-753",
        "DMA-527", "DMA-539", "DMA-543", "DMA-616",
      ],
    }
  ),

  enriched(
    "dma_midwest_markets",
    "Midwest DMA Markets",
    "Major Midwest Nielsen DMAs: Chicago (602), Detroit (637), Minneapolis (641), " +
      "Cleveland (517), St. Louis (609), Indianapolis (619), Columbus (545), Milwaukee (558). " +
      "Combined ~10M TV households. Strong auto, CPG, and financial services.",
    "geo",
    "302",
    9_930_000,
    ["nielsen_dma_2024"],
    {
      geography: [
        "DMA-602", "DMA-637", "DMA-641", "DMA-517",
        "DMA-609", "DMA-619", "DMA-545", "DMA-558",
      ],
    }
  ),
];

// ── Cross-Taxonomy Bridge Signals ─────────────────────────────────────────────
// Source: IAB Audience Taxonomy 1.1 × IAB Content Taxonomy 3.0 bridge
// These signals are contextual + audience composites — useful for AI-driven planning

export const CROSS_TAXONOMY_SIGNALS: CanonicalSignal[] = [
  enriched(
    "ctx_scifi_tech_content_audience",
    "Sci-Fi & Tech Content Audience (Cross-Taxonomy)",
    "Audience segment with strong sci-fi affinity (IAB Audience 1.1: node 104) mapped to " +
      "IAB Content Taxonomy 3.0: Science Fiction (IAB1-7) + Technology & Computing (IAB19). " +
      "Bridge type: strong + moderate. Bidirectional: content consumption confirms audience membership. " +
      "High index for streaming tech products, gaming hardware, and developer tools.",
    "composite",
    "104",
    2_680_000,
    ["iab_taxonomy_loader", "taxonomy_bridge_ct3"],
    {
      pricing: { model: "mock_cpm", value: 3.0, currency: "USD" },
      rawSourceRefs: ["IAB_AUD_104", "IAB_CT3_IAB1-7", "IAB_CT3_IAB19"],
    }
  ),

  enriched(
    "ctx_affluent_travel_content",
    "Affluent Travel Content Audience (Cross-Taxonomy)",
    "High income households (IAB Audience 1.1: node 17) with strong IAB Content Taxonomy 3.0 " +
      "Travel (IAB23) and Real Estate (IAB21) affinity. " +
      "Bridge type: strong (both directions). Premium travel advertiser target — validated by content consumption signal. " +
      "Luxury travel, credit cards, premium hospitality.",
    "composite",
    "17",
    1_140_000,
    ["iab_taxonomy_loader", "taxonomy_bridge_ct3"],
    {
      pricing: { model: "mock_cpm", value: 4.0, currency: "USD" },
      rawSourceRefs: ["IAB_AUD_17", "IAB_CT3_IAB23", "IAB_CT3_IAB21"],
    }
  ),

  enriched(
    "ctx_families_education_content",
    "Families + Education Content Audience (Cross-Taxonomy)",
    "Families with children (IAB Audience 1.1: node 20) cross-mapped to " +
      "IAB Content Taxonomy 3.0: Family & Parenting (IAB5) + Education (IAB4). " +
      "Bridge type: strong (bidirectional). Content consumption validates family segment membership. " +
      "Ed-tech, tutoring services, family entertainment, back-to-school retail.",
    "composite",
    "20",
    3_920_000,
    ["iab_taxonomy_loader", "taxonomy_bridge_ct3"],
    {
      pricing: { model: "mock_cpm", value: 2.8, currency: "USD" },
      rawSourceRefs: ["IAB_AUD_20", "IAB_CT3_IAB5", "IAB_CT3_IAB4"],
    }
  ),

  enriched(
    "ctx_bdm_business_news_content",
    "Business Decision Makers + Business Content (Cross-Taxonomy)",
    "Business Decision Makers (IAB Audience 1.1: node 401) mapped to " +
      "IAB Content Taxonomy 3.0: Business (IAB3) + News & Politics (IAB12). " +
      "Bridge type: strong (bidirectional). B2B premium segment with content validation. " +
      "Enterprise software, financial services, professional development, business travel.",
    "composite",
    "401",
    1_580_000,
    ["iab_taxonomy_loader", "taxonomy_bridge_ct3"],
    {
      pricing: { model: "mock_cpm", value: 5.0, currency: "USD" },
      rawSourceRefs: ["IAB_AUD_401", "IAB_CT3_IAB3", "IAB_CT3_IAB12"],
    }
  ),

  enriched(
    "ctx_streaming_entertainment_content",
    "Streaming Enthusiasts + Entertainment Content (Cross-Taxonomy)",
    "Heavy streamers (IAB Audience 1.1: node 109) mapped to " +
      "IAB Content Taxonomy 3.0: Entertainment (IAB1-5) + Action (IAB1-1) + Sci-Fi (IAB1-7). " +
      "Bridge type: strong (bidirectional). Cross-platform streaming audience validated by content signals. " +
      "Streaming subscriptions, smart TV, gaming, connected home.",
    "composite",
    "109",
    5_840_000,
    ["iab_taxonomy_loader", "taxonomy_bridge_ct3"],
    {
      pricing: { model: "mock_cpm", value: 3.2, currency: "USD" },
      rawSourceRefs: ["IAB_AUD_109", "IAB_CT3_IAB1-5", "IAB_CT3_IAB1-1", "IAB_CT3_IAB1-7"],
    }
  ),
];

export const ALL_ENRICHED_SIGNALS: CanonicalSignal[] = [
  ...CENSUS_SIGNALS,
  ...DMA_SIGNALS,
  ...CROSS_TAXONOMY_SIGNALS,
];
