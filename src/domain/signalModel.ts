// src/domain/signalModel.ts
// Static seeded signal catalog and canonical signal builder helpers.

import type { CanonicalSignal } from "../types/signal";
import { signalIdFromSlug } from "../utils/ids";
import { estimateSeededSize } from "../utils/estimation";

const NOW = "2025-01-01T00:00:00Z";
const DEFAULT_DESTINATIONS = ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"];
const DEMO_SOURCES = ["iab_taxonomy_loader", "demographics_seed", "interests_seed"];

function seeded(
  slug: string,
  name: string,
  description: string,
  categoryType: CanonicalSignal["categoryType"],
  taxonomyId?: string,
  opts: Partial<CanonicalSignal> = {}
): CanonicalSignal {
  return {
    signalId: signalIdFromSlug(slug),
    taxonomySystem: "iab_audience_1_1",
    name,
    description,
    categoryType,
    ...(taxonomyId ? { externalTaxonomyId: taxonomyId } : {}),
    sourceSystems: DEMO_SOURCES,
    destinations: DEFAULT_DESTINATIONS,
    activationSupported: true,
    estimatedAudienceSize: estimateSeededSize(categoryType, taxonomyId),
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

function derived(
  slug: string,
  name: string,
  description: string,
  categoryType: CanonicalSignal["categoryType"],
  rules: CanonicalSignal["rules"],
  size: number,
  opts: Partial<CanonicalSignal> = {}
): CanonicalSignal {
  return {
    signalId: signalIdFromSlug(slug),
    taxonomySystem: "iab_audience_1_1",
    name,
    description,
    categoryType,
    sourceSystems: DEMO_SOURCES,
    destinations: DEFAULT_DESTINATIONS,
    activationSupported: true,
    estimatedAudienceSize: size,
    accessPolicy: "public_demo",
    generationMode: "derived",
    status: "available",
    freshness: "7d",
    pricing: { model: "mock_cpm", value: 3.5, currency: "USD" },
    rules,
    createdAt: NOW,
    updatedAt: NOW,
    ...opts,
  };
}

// ── Seeded Signals Catalog ────────────────────────────────────────────────────

export const SEEDED_SIGNALS: CanonicalSignal[] = [
  // Demographic - Age
  seeded(
    "age_18_24",
    "Adults 18-24",
    "Young adults aged 18-24, strong digital-first behavior and entertainment consumption.",
    "demographic",
    "3"
  ),
  seeded(
    "age_25_34",
    "Adults 25-34",
    "Core millennial segment aged 25-34, high streaming adoption and disposable income growth.",
    "demographic",
    "4"
  ),
  seeded(
    "age_35_44",
    "Adults 35-44",
    "Prime earner segment aged 35-44, high purchase intent and family household overlap.",
    "demographic",
    "5"
  ),
  seeded(
    "age_45_54",
    "Adults 45-54",
    "Established adults aged 45-54, strong brand loyalty and higher household income.",
    "demographic",
    "6"
  ),
  seeded(
    "age_55_64",
    "Adults 55-64",
    "Pre-retirement adults aged 55-64, growing streaming and digital commerce engagement.",
    "demographic",
    "7"
  ),
  seeded(
    "age_65_plus",
    "Adults 65+",
    "Seniors 65 and over, significant household wealth and growing digital adoption.",
    "demographic",
    "8"
  ),

  // Demographic - Income
  seeded(
    "high_income_households",
    "High Income Households",
    "Households with annual income over $150,000. Strong purchase intent across premium categories.",
    "demographic",
    "17",
    { estimatedAudienceSize: 1_200_000 }
  ),
  seeded(
    "upper_middle_income",
    "Upper Middle Income Households",
    "Households with annual income $100,000–$150,000. Broad purchase intent across travel, tech, and home.",
    "demographic",
    "16",
    { estimatedAudienceSize: 2_800_000 }
  ),
  seeded(
    "middle_income_households",
    "Middle Income Households",
    "Households with annual income $50,000–$100,000. Core consumer segment.",
    "demographic",
    "15",
    { estimatedAudienceSize: 6_200_000 }
  ),

  // Demographic - Education
  seeded(
    "college_educated_adults",
    "College Educated Adults",
    "Adults with a bachelor's degree or higher. Index high on technology, streaming, and premium brands.",
    "demographic",
    "10",
    { estimatedAudienceSize: 4_500_000 }
  ),
  seeded(
    "graduate_educated_adults",
    "Graduate Educated Adults",
    "Adults with a graduate or professional degree. Premium segment with high household income overlap.",
    "demographic",
    "11",
    { estimatedAudienceSize: 1_800_000 }
  ),

  // Demographic - Household
  seeded(
    "families_with_children",
    "Families with Children",
    "Households with at least one child under 18. Strong intent across CPG, education, family entertainment.",
    "demographic",
    "20",
    { estimatedAudienceSize: 5_800_000 }
  ),
  seeded(
    "senior_households",
    "Senior Households",
    "Households where the primary adult is 65+. Significant wealth accumulation, growing digital engagement.",
    "demographic",
    "22",
    { estimatedAudienceSize: 2_400_000 }
  ),

  // Interest - Entertainment
  seeded(
    "action_movie_fans",
    "Action Movie Fans",
    "Strong affinity for action and adventure films. High index on streaming services, gaming, and tech.",
    "interest",
    "103",
    { estimatedAudienceSize: 3_200_000 }
  ),
  seeded(
    "sci_fi_enthusiasts",
    "Sci-Fi & Fantasy Enthusiasts",
    "High affinity for science fiction and fantasy content across streaming, gaming, and related merchandise.",
    "interest",
    "104",
    { estimatedAudienceSize: 2_100_000 }
  ),
  seeded(
    "drama_viewers",
    "Drama Viewers",
    "Regular viewers of drama content. Skews 35-54, higher household income, female-leaning.",
    "interest",
    "105",
    { estimatedAudienceSize: 3_800_000 }
  ),
  seeded(
    "comedy_fans",
    "Comedy Fans",
    "Broad entertainment segment with strong affinity for comedy content across streaming and linear TV.",
    "interest",
    "106",
    { estimatedAudienceSize: 5_100_000 }
  ),
  seeded(
    "documentary_viewers",
    "Documentary Viewers",
    "Engaged viewers of documentary content. Skews educated, higher income, strong intent for premium services.",
    "interest",
    "107",
    { estimatedAudienceSize: 1_500_000 }
  ),
  seeded(
    "streaming_enthusiasts",
    "Streaming Enthusiasts",
    "Heavy users of streaming TV and on-demand content. Multi-platform, high engagement, cord-cutter overlap.",
    "interest",
    "109",
    { estimatedAudienceSize: 7_200_000 }
  ),

  // Purchase Intent
  seeded(
    "tech_buyers",
    "Technology Buyers",
    "In-market for consumer technology products. High purchase intent, brand-aware, early adopter lean.",
    "purchase_intent",
    "201",
    { estimatedAudienceSize: 2_600_000 }
  ),
  seeded(
    "streaming_subscribers",
    "Streaming Service Subscribers",
    "Active subscribers to one or more streaming services. Multi-platform, high LTV, upsell receptive.",
    "purchase_intent",
    "202",
    { estimatedAudienceSize: 4_800_000 }
  ),
  seeded(
    "premium_content_buyers",
    "Premium Content Buyers",
    "Purchasers of premium or paid content. Strong signal for subscription, PVOD, and premium tiers.",
    "purchase_intent",
    "203",
    { estimatedAudienceSize: 1_900_000 }
  ),

  // Geographic
  seeded(
    "urban_audiences",
    "Urban Audiences",
    "Adults living in urban core ZIP codes. High density, diverse, strong index on mobile and streaming.",
    "geo",
    "301",
    { estimatedAudienceSize: 5_500_000, geography: ["US-Urban"] }
  ),
  seeded(
    "top_10_metro",
    "Top 10 Metro Markets",
    "Adults in the top 10 US Designated Market Areas (DMAs). NY, LA, Chicago, Houston, Phoenix, etc.",
    "geo",
    "303",
    {
      estimatedAudienceSize: 8_800_000,
      geography: ["NY", "LA", "CHI", "HOU", "PHX", "PHI", "SA", "SD", "DAL", "SJ"],
    }
  ),
  seeded(
    "top_25_metro",
    "Top 25 Metro Markets",
    "Adults in the top 25 US DMAs. Covers ~55% of US adult population.",
    "geo",
    "304",
    { estimatedAudienceSize: 14_200_000, geography: ["US-Top25DMA"] }
  ),

  // Professional
  seeded(
    "urban_professionals",
    "Urban Professionals",
    "College-educated adults in urban metros with professional/managerial employment. High HHI, digitally engaged.",
    "demographic",
    "401",
    { estimatedAudienceSize: 3_100_000 }
  ),
];

// ── Derived Signals Catalog ───────────────────────────────────────────────────

export const DERIVED_SIGNALS: CanonicalSignal[] = [
  derived(
    "high_income_entertainment_fans",
    "High Income Entertainment Enthusiasts",
    "Households earning $150K+ with strong affinity for streaming and premium content. High LTV segment.",
    "composite",
    [
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
    680_000,
    { externalTaxonomyId: "17" }
  ),
  derived(
    "urban_young_professionals",
    "Urban Young Professionals",
    "Adults 25-34 in top 25 metros with college education. Core target for financial, tech, and lifestyle brands.",
    "composite",
    [
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "metro_tier", operator: "in", value: ["top_10", "top_25"] },
      { dimension: "education", operator: "in", value: ["bachelors", "graduate"] },
    ],
    920_000,
    { externalTaxonomyId: "4" }
  ),
  derived(
    "affluent_families_travel_intent",
    "Affluent Families Interested in Travel",
    "High income households with children showing travel content affinity. Premium travel advertiser target.",
    "composite",
    [
      { dimension: "income_band", operator: "in", value: ["100k_150k", "150k_plus"] },
      { dimension: "household_type", operator: "eq", value: "family_with_kids" },
    ],
    540_000
  ),
  derived(
    "metro_sci_fi_fans",
    "Metro Sci-Fi Enthusiasts",
    "Science fiction content aficionados in top 50 metros. Strong index for tech, streaming, and gaming.",
    "composite",
    [
      { dimension: "content_genre", operator: "eq", value: "sci_fi" },
      { dimension: "metro_tier", operator: "in", value: ["top_10", "top_25", "top_50"] },
    ],
    780_000,
    { externalTaxonomyId: "104" }
  ),
  derived(
    "college_educated_streaming_heavy",
    "College Educated Heavy Streamers",
    "College or graduate educated adults with high streaming affinity. Premium digital engagement profile.",
    "composite",
    [
      { dimension: "education", operator: "in", value: ["bachelors", "graduate"] },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
    1_450_000,
    { externalTaxonomyId: "10" }
  ),
  derived(
    "affluent_urban_entertainment_fans",
    "Affluent Urban Entertainment Fans",
    "High income adults in urban metros with broad entertainment affinity. Multi-format premium audience.",
    "composite",
    [
      { dimension: "income_band", operator: "in", value: ["100k_150k", "150k_plus"] },
      { dimension: "metro_tier", operator: "in", value: ["top_10", "top_25"] },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
    390_000
  ),
];
