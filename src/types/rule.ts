// src/types/rule.ts
// Rule engine input/output types

import type { RuleDimension, RuleOperator } from "./signal";

export interface ResolvedRule {
  dimension: RuleDimension;
  operator: RuleOperator;
  value: string | number | string[];
  weight?: number;
}

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AudienceSizeEstimate {
  estimated: number;
  confidence: "high" | "medium" | "low";
  methodology: "heuristic_demo";
  note: string;
}

export interface GeneratedSegmentResult {
  signalId: string;
  name: string;
  description: string;
  categoryType: string;
  rules: ResolvedRule[];
  estimatedAudienceSize: number;
  estimateConfidence: "high" | "medium" | "low";
  taxonomyMatches: string[];
  generationNotes: string;
}
