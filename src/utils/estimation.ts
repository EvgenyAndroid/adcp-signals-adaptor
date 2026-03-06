// src/utils/estimation.ts
// Demo-safe heuristic audience size estimation.
// All outputs are approximate and clearly marked as modeled.

import type { ResolvedRule } from "../types/rule";
import type { AudienceSizeEstimate } from "../types/rule";

// US adult internet-connected population baseline (~240M)
const US_ADULT_BASELINE = 240_000_000;

// Approximate reach multipliers per dimension value
const REACH_FACTORS: Record<string, Record<string, number>> = {
  age_band: {
    "18-24": 0.12,
    "25-34": 0.18,
    "35-44": 0.17,
    "45-54": 0.15,
    "55-64": 0.13,
    "65+": 0.11,
  },
  income_band: {
    under_50k: 0.42,
    "50k_100k": 0.33,
    "100k_150k": 0.14,
    "150k_plus": 0.11,
  },
  education: {
    high_school: 0.28,
    some_college: 0.29,
    bachelors: 0.26,
    graduate: 0.13,
  },
  household_type: {
    single: 0.28,
    couple_no_kids: 0.25,
    family_with_kids: 0.33,
    senior_household: 0.14,
  },
  metro_tier: {
    top_10: 0.21,
    top_25: 0.35,
    top_50: 0.52,
    other: 0.48,
  },
  content_genre: {
    action: 0.24,
    sci_fi: 0.16,
    drama: 0.22,
    comedy: 0.28,
    documentary: 0.12,
    thriller: 0.18,
    animation: 0.14,
    romance: 0.15,
  },
  streaming_affinity: {
    high: 0.35,
    medium: 0.40,
    low: 0.25,
  },
};

/**
 * Estimate audience size given a set of rules.
 * Uses independent probability intersection (conservative heuristic).
 * Applies a floor to avoid implausibly small numbers.
 */
export function estimateAudienceSize(rules: ResolvedRule[]): AudienceSizeEstimate {
  let factor = 1.0;
  let matchedRules = 0;

  for (const rule of rules) {
    const dimFactors = REACH_FACTORS[rule.dimension];
    if (!dimFactors) continue;

    const val = Array.isArray(rule.value) ? rule.value[0] : String(rule.value);
    const dimFactor = dimFactors[val];
    if (dimFactor !== undefined) {
      factor *= dimFactor;
      matchedRules++;
    }
  }

  // Ensure a reasonable floor even for narrow segments
  const raw = Math.round(US_ADULT_BASELINE * factor);
  const estimated = Math.max(raw, 50_000);

  const confidence: "high" | "medium" | "low" =
    matchedRules >= 3 ? "medium" : matchedRules >= 1 ? "high" : "low";

  return {
    estimated,
    confidence,
    methodology: "heuristic_demo",
    note: "Modeled estimate only. Not derived from real user-level data. For demo purposes.",
  };
}

/**
 * Simple size estimate for seeded signals based on category.
 */
export function estimateSeededSize(
  categoryType: string,
  taxonomyId?: string
): number {
  // Rough size brackets by category
  const brackets: Record<string, [number, number]> = {
    demographic: [800_000, 15_000_000],
    interest: [500_000, 8_000_000],
    purchase_intent: [200_000, 3_000_000],
    geo: [100_000, 5_000_000],
    composite: [150_000, 4_000_000],
  };

  const [min, max] = brackets[categoryType] ?? [500_000, 5_000_000];

  // Use taxonomy ID as a deterministic seed for consistent demo output
  const seed = taxonomyId
    ? [...taxonomyId].reduce((acc, c) => acc + c.charCodeAt(0), 0)
    : Math.floor(Math.random() * 100);

  return min + ((seed * 137_438_953_441) % (max - min));
}
