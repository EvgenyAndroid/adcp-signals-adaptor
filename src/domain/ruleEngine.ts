// src/domain/ruleEngine.ts
// Deterministic rule-based segment generator.
// No user-level data - all outputs are synthetic/aggregated.

import type { ResolvedRule, RuleValidationResult, GeneratedSegmentResult } from "../types/rule";
import type { RuleDimension, RuleOperator } from "../types/signal";
import { estimateAudienceSize } from "../utils/estimation";
import { dynamicSignalId } from "../utils/ids";

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_VALUES: Partial<Record<RuleDimension, Set<string>>> = {
  age_band: new Set(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]),
  income_band: new Set(["under_50k", "50k_100k", "100k_150k", "150k_plus"]),
  education: new Set(["high_school", "some_college", "bachelors", "graduate"]),
  household_type: new Set([
    "single",
    "couple_no_kids",
    "family_with_kids",
    "senior_household",
  ]),
  metro_tier: new Set(["top_10", "top_25", "top_50", "other"]),
  content_genre: new Set([
    "action",
    "sci_fi",
    "drama",
    "comedy",
    "documentary",
    "thriller",
    "animation",
    "romance",
  ]),
  streaming_affinity: new Set(["high", "medium", "low"]),
};

export function validateRules(rules: ResolvedRule[]): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenDimensions = new Set<string>();

  for (const [i, rule] of rules.entries()) {
    // Duplicate dimension check
    if (seenDimensions.has(rule.dimension)) {
      warnings.push(
        `Rule ${i}: dimension '${rule.dimension}' appears more than once - results may be unexpected`
      );
    }
    seenDimensions.add(rule.dimension);

    // Value validation for known dimensions
    const validVals = VALID_VALUES[rule.dimension as RuleDimension];
    if (validVals) {
      const values = Array.isArray(rule.value) ? rule.value : [String(rule.value)];
      for (const v of values) {
        if (!validVals.has(String(v))) {
          errors.push(
            `Rule ${i}: value '${v}' is not valid for dimension '${rule.dimension}'. Valid: ${[...validVals].join(", ")}`
          );
        }
      }
    }

    // Operator compatibility
    if (rule.operator === "range" && !Array.isArray(rule.value)) {
      errors.push(`Rule ${i}: operator 'range' requires an array value [min, max]`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Segment Generation ────────────────────────────────────────────────────────

/**
 * Build a readable segment name from rules.
 */
function buildSegmentName(rules: ResolvedRule[]): string {
  const parts: string[] = [];

  for (const rule of rules) {
    const val = Array.isArray(rule.value) ? rule.value.join("/") : String(rule.value);

    switch (rule.dimension) {
      case "age_band":
        parts.push(`Age ${val}`);
        break;
      case "income_band":
        parts.push(labelIncome(val));
        break;
      case "education":
        parts.push(labelEducation(val));
        break;
      case "household_type":
        parts.push(labelHousehold(val));
        break;
      case "metro_tier":
        parts.push(labelMetro(val));
        break;
      case "content_genre":
        parts.push(`${capitalize(val)} Fans`);
        break;
      case "streaming_affinity":
        parts.push(`${capitalize(val)} Streaming Affinity`);
        break;
      default:
        parts.push(`${capitalize(rule.dimension)}: ${val}`);
    }
  }

  return parts.length > 0 ? parts.join(", ") : "Custom Segment";
}

function buildSegmentDescription(rules: ResolvedRule[], name: string): string {
  return (
    `Dynamically generated composite segment: ${name}. ` +
    `Based on ${rules.length} targeting dimension(s). ` +
    `Audience size is a modeled estimate for demo purposes.`
  );
}

/**
 * Determine category type from rules.
 */
function inferCategoryType(rules: ResolvedRule[]): string {
  const hasDemographic = rules.some((r) =>
    ["age_band", "income_band", "education", "household_type"].includes(r.dimension)
  );
  const hasInterest = rules.some((r) =>
    ["content_genre", "streaming_affinity"].includes(r.dimension)
  );
  const hasGeo = rules.some((r) => ["geography", "metro_tier"].includes(r.dimension));

  if (hasDemographic && hasInterest) return "composite";
  if (hasInterest) return "interest";
  if (hasGeo) return "geo";
  if (hasDemographic) return "demographic";
  return "composite";
}

/**
 * Map rules to potential taxonomy ID matches.
 */
function mapToTaxonomyIds(rules: ResolvedRule[]): string[] {
  const mapping: Partial<Record<string, Record<string, string>>> = {
    age_band: { "18-24": "3", "25-34": "4", "35-44": "5", "45-54": "6" },
    income_band: { "150k_plus": "17", "100k_150k": "16", "50k_100k": "15" },
    content_genre: { sci_fi: "104", action: "103", drama: "105", comedy: "106" },
    streaming_affinity: { high: "109", medium: "109" },
  };

  const ids: string[] = [];
  for (const rule of rules) {
    const dimMap = mapping[rule.dimension];
    if (!dimMap) continue;
    const val = Array.isArray(rule.value) ? rule.value[0] : String(rule.value);
    if (val !== undefined) {
      const id = dimMap[val];
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

/**
 * Main entry point: given validated rules, generate a segment descriptor.
 */
export function generateSegment(
  rules: ResolvedRule[],
  customName?: string
): GeneratedSegmentResult {
  const name = customName ?? buildSegmentName(rules);
  const description = buildSegmentDescription(rules, name);
  const categoryType = inferCategoryType(rules);
  const taxonomyMatches = mapToTaxonomyIds(rules);

  const sizeEstimate = estimateAudienceSize(rules);

  // Deterministic ID: hash of sorted rules ensures same targeting = same segment
  const rulesKey = JSON.stringify(
    [...rules].sort((a, b) => a.dimension.localeCompare(b.dimension))
  );
  const signalId = dynamicSignalId(name, rulesKey);

  const ruleCount = rules.length;
  const generationNotes = [
    `Generated from ${ruleCount} rule(s).`,
    `Category inferred as: ${categoryType}.`,
    ...(taxonomyMatches.length > 0
      ? [`Mapped to IAB taxonomy node(s): ${taxonomyMatches.join(", ")}.`]
      : []),
    `Audience size: ${sizeEstimate.confidence} confidence (${sizeEstimate.note})`,
  ].join(" ");

  return {
    signalId,
    name,
    description,
    categoryType,
    rules,
    estimatedAudienceSize: sizeEstimate.estimated,
    estimateConfidence: sizeEstimate.confidence,
    taxonomyMatches,
    generationNotes,
  };
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function labelIncome(val: string): string {
  const map: Record<string, string> = {
    under_50k: "Income <$50K",
    "50k_100k": "Income $50K–$100K",
    "100k_150k": "Income $100K–$150K",
    "150k_plus": "High Income $150K+",
  };
  return map[val] ?? `Income: ${val}`;
}

function labelEducation(val: string): string {
  const map: Record<string, string> = {
    high_school: "HS Education",
    some_college: "Some College",
    bachelors: "College Educated",
    graduate: "Graduate Educated",
  };
  return map[val] ?? capitalize(val);
}

function labelHousehold(val: string): string {
  const map: Record<string, string> = {
    single: "Single Adults",
    couple_no_kids: "Couples (No Kids)",
    family_with_kids: "Families w/ Children",
    senior_household: "Senior Households",
  };
  return map[val] ?? capitalize(val);
}

function labelMetro(val: string): string {
  const map: Record<string, string> = {
    top_10: "Top 10 Metros",
    top_25: "Top 25 Metros",
    top_50: "Top 50 Metros",
    other: "Smaller Markets",
  };
  return map[val] ?? capitalize(val);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}