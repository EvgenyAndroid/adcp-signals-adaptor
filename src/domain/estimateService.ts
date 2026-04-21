// src/domain/estimateService.ts
// Dry-run audience-size sizer. Same input shape as /signals/generate but
// DOES NOT persist to D1 and DOES NOT return a signal_agent_segment_id —
// a builder UI calls this on every rule change (debounced) to show live
// audience numbers without creating a segment.
//
// Reuses ruleEngine's validator + estimateAudienceSize heuristic so the
// numbers stay consistent with the real /generate path. Results are
// cached in KV for 60s keyed on a hash of the sorted rule set.

import type { ResolvedRule } from "../types/rule";
import { validateRules } from "./ruleEngine";
import { estimateAudienceSize } from "../utils/estimation";

const US_ADULT_BASELINE = 240_000_000;
const CACHE_TTL_SECONDS = 60;

export interface EstimateResult {
  estimated_audience_size: number;
  coverage_percentage: number;
  rule_count: number;
  dimensions_used: string[];
  confidence: "high" | "medium" | "low";
}

export interface EstimateError {
  error: string;
  code: "INVALID_REQUEST";
  details?: { validation_errors?: string[]; validation_warnings?: string[] };
}

export async function estimateAudience(
  rules: ResolvedRule[],
  cache?: KVNamespace,
): Promise<EstimateResult | EstimateError> {
  // Empty rule set is allowed — represents the full baseline. Skipping
  // validation for this case so a builder UI rendering "no rules yet" still
  // gets a valid baseline number rather than a 400.
  if (rules.length === 0) {
    return {
      estimated_audience_size: US_ADULT_BASELINE,
      coverage_percentage: 100,
      rule_count: 0,
      dimensions_used: [],
      confidence: "low",
    };
  }

  const validation = validateRules(rules);
  if (!validation.valid) {
    return {
      error: "Rule validation failed",
      code: "INVALID_REQUEST",
      details: {
        validation_errors: validation.errors,
        ...(validation.warnings.length ? { validation_warnings: validation.warnings } : {}),
      },
    };
  }

  const cacheKey = cache ? "estimate:" + hashRules(rules) : null;
  if (cacheKey && cache) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached) return JSON.parse(cached) as EstimateResult;
    } catch { /* cache miss — fall through */ }
  }

  const est = estimateAudienceSize(rules);
  const result: EstimateResult = {
    estimated_audience_size: est.estimated,
    coverage_percentage: Math.round((est.estimated / US_ADULT_BASELINE) * 1000) / 10,
    rule_count: rules.length,
    dimensions_used: [...new Set(rules.map((r) => r.dimension))],
    confidence: est.confidence,
  };

  if (cacheKey && cache) {
    try {
      await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS });
    } catch { /* non-fatal */ }
  }

  return result;
}

// Stable order-independent hash for cache keying. Rules are sorted by
// dimension before serializing so [{age, income}] and [{income, age}]
// hit the same cache entry.
function hashRules(rules: ResolvedRule[]): string {
  const sorted = [...rules].sort((a, b) =>
    a.dimension === b.dimension
      ? String(a.operator).localeCompare(String(b.operator))
      : a.dimension.localeCompare(b.dimension),
  );
  const canonical = JSON.stringify(sorted);
  // djb2 — cheap, stable, good enough for KV keying at this scale.
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) {
    h = ((h << 5) + h + canonical.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function isEstimateError(r: EstimateResult | EstimateError): r is EstimateError {
  return "error" in r;
}
