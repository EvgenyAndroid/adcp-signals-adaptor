// src/types/signal.ts
// Canonical internal signal model - independent of protocol or raw dataset shape

export type SignalCategoryType =
  | "demographic"
  | "interest"
  | "purchase_intent"
  | "geo"
  | "composite";

export type GenerationMode = "seeded" | "derived" | "dynamic";

export type SignalStatus = "available" | "inactive" | "pending";

export type TaxonomySystem = "iab_audience_1_1";

export type PricingModel = "mock_cpm" | "mock_flat" | "none";

export type AccessPolicy = "public_demo" | "restricted_demo";

export interface SignalPricing {
  model: PricingModel;
  value?: number;
  currency?: "USD";
}

export interface CanonicalSignal {
  signalId: string;
  externalTaxonomyId?: string;
  taxonomySystem: TaxonomySystem;
  name: string;
  description: string;
  categoryType: SignalCategoryType;
  parentSignalId?: string;
  sourceSystems: string[];
  destinations: string[];
  activationSupported: boolean;
  estimatedAudienceSize?: number;
  geography?: string[];
  pricing?: SignalPricing;
  freshness?: string;
  accessPolicy: AccessPolicy;
  generationMode: GenerationMode;
  status: SignalStatus;
  rawSourceRefs?: string[];
  rules?: SegmentRule[];
  createdAt: string;
  updatedAt: string;
}

// SegmentRule describes one filter dimension in the rule engine
export interface SegmentRule {
  dimension: RuleDimension;
  operator: RuleOperator;
  value: string | number | string[];
  weight?: number; // 0-1, used for affinity scoring
}

export type RuleDimension =
  | "age_band"
  | "income_band"
  | "education"
  | "household_type"
  | "geography"
  | "metro_tier"
  | "content_genre"
  | "content_affinity_score"
  | "streaming_affinity";

export type RuleOperator =
  | "eq"
  | "in"
  | "gte"
  | "lte"
  | "contains"
  | "range";

// IAB Audience Taxonomy record
export interface IabTaxonomyNode {
  uniqueId: string;
  parentId?: string;
  name: string;
  tier1?: string;
  tier2?: string;
  tier3?: string;
  extension: boolean;
}

// Row shapes for raw seed data
export interface DemographicRecord {
  ageBand: string;        // "18-24", "25-34", etc.
  incomeBand: string;     // "under_50k", "50k_100k", "100k_150k", "150k_plus"
  education: string;      // "high_school", "some_college", "bachelors", "graduate"
  householdType: string;  // "single", "couple_no_kids", "family_with_kids", "senior_household"
  region: string;         // "northeast", "south", "midwest", "west"
  metroTier: string;      // "top_10", "top_25", "top_50", "other"
  estimatedCount: number;
}

export interface InterestRecord {
  genre: string;          // "action", "sci_fi", "drama", etc.
  affinityScore: number;  // 0-1 normalized
  ageBand: string;
  incomeBand: string;
  metroTier: string;
  estimatedCount: number;
}

export interface GeoRecord {
  city: string;
  state: string;
  metroTier: "top_10" | "top_25" | "top_50" | "other";
  region: string;
  estimatedPopulation: number;
}
