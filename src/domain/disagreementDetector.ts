// src/domain/disagreementDetector.ts
//
// Wave 6 (Race Canvas) — detects substantive disagreement between vendor
// responses on the same brief.
//
// Demo purpose:
//   - When two vendors disagree on a key field, the canvas draws a halo
//     between them and the agentic layer reconciles. This module is the
//     decision function for "do we draw the halo?"
//
// Disagreement criteria (governance audience appropriate):
//
//   audience_size                     numeric, ±15% threshold
//   recommended_bid_floor_cents       numeric, ±20% threshold
//   sensitive_category_verdict        categorical, any difference
//   governance_outcome                categorical, any difference
//
// Numeric threshold is intentionally generous — vendors legitimately
// disagree on sizing within ±10%, that's noise. ±15% means "they're
// reading the audience differently," which is the wow-factor moment.

import type { VendorRaceResponse } from "./vendorRaceMock";

export type DisagreementField =
  | "audience_size"
  | "recommended_bid_floor_cents"
  | "sensitive_category_verdict"
  | "governance_outcome";

export type DisagreementSeverity = "minor" | "material" | "blocking";

export interface Disagreement {
  field: DisagreementField;
  field_label: string;
  severity: DisagreementSeverity;
  /** Two vendors that diverge most on this field. UI highlights these. */
  conflict_pair: Array<{ vendor_id: string; vendor_name: string; value: string | number }>;
  /** All distinct values across all vendors (for the callout text). */
  all_values: Array<{ vendor_id: string; value: string | number }>;
  /** Human-readable rationale the canvas can render under the halo. */
  rationale: string;
  /** Suggested reconciled value the agentic layer would pick. */
  reconciled_value: string | number;
  /** One-line explanation of why the reconciled value was chosen. */
  reconcile_rationale: string;
}

const NUMERIC_THRESHOLDS: Partial<Record<DisagreementField, number>> = {
  audience_size: 0.15,
  recommended_bid_floor_cents: 0.20,
};

const FIELD_LABELS: Record<DisagreementField, string> = {
  audience_size: "Audience size",
  recommended_bid_floor_cents: "Recommended bid floor",
  sensitive_category_verdict: "Sensitive-category verdict",
  governance_outcome: "Governance outcome",
};

function formatValue(field: DisagreementField, value: string | number): string {
  if (field === "audience_size" && typeof value === "number") {
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
    if (value >= 1_000) return (value / 1_000).toFixed(0) + "K";
    return String(value);
  }
  if (field === "recommended_bid_floor_cents" && typeof value === "number") {
    return "$" + (value / 100).toFixed(2) + " CPM";
  }
  return String(value);
}

function severityFor(field: DisagreementField, divergence: number): DisagreementSeverity {
  // governance_outcome=block is always blocking — caller passes a synthetic
  // divergence of 1.0 for that case.
  if (field === "governance_outcome") {
    return divergence >= 0.99 ? "blocking" : "material";
  }
  if (field === "sensitive_category_verdict") return "material";
  // Numeric: ±15% min for audience, ±25% means material, ±50% means blocking.
  if (divergence >= 0.50) return "blocking";
  if (divergence >= 0.25) return "material";
  return "minor";
}

function detectNumericDisagreement(
  responses: VendorRaceResponse[],
  field: "audience_size" | "recommended_bid_floor_cents",
): Disagreement | null {
  const values = responses.map((r) => ({ vendor_id: r.vendor_id, vendor_name: r.vendor_name, value: r[field] as number }));
  if (values.length < 2) return null;

  // Find min and max — the two vendors most in conflict.
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v.value < min.value) min = v;
    if (v.value > max.value) max = v;
  }
  if (max.value === 0) return null;
  const divergence = (max.value - min.value) / max.value;
  const threshold = NUMERIC_THRESHOLDS[field] ?? 0.15;
  if (divergence < threshold) return null;

  // Reconciled value: median across vendors (robust to outliers).
  const sorted = values.map((v) => v.value).slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  const severity = severityFor(field, divergence);
  const pctDiff = Math.round(divergence * 100);

  return {
    field,
    field_label: FIELD_LABELS[field],
    severity,
    conflict_pair: [min, max].map((v) => ({ ...v, value: v.value })),
    all_values: values,
    rationale: `${max.vendor_name} reports ${formatValue(field, max.value)}; ${min.vendor_name} reports ${formatValue(field, min.value)}. ${pctDiff}% gap exceeds the ${Math.round(threshold * 100)}% threshold.`,
    reconciled_value: median,
    reconcile_rationale: `Reconciled to median across ${values.length} vendors: ${formatValue(field, median)}. Robust to single-vendor outliers; aligns with the consensus cluster.`,
  };
}

function detectCategoricalDisagreement(
  responses: VendorRaceResponse[],
  field: "sensitive_category_verdict" | "governance_outcome",
): Disagreement | null {
  const values = responses.map((r) => ({ vendor_id: r.vendor_id, vendor_name: r.vendor_name, value: r[field] as string }));
  if (values.length < 2) return null;
  const distinct = new Set(values.map((v) => v.value));
  if (distinct.size < 2) return null;

  // Find the majority value and the minority — minority is the "outlier."
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
  const sortedCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const majority = sortedCounts[0]![0];
  const minority = sortedCounts[sortedCounts.length - 1]![0];
  const majorityVendor = values.find((v) => v.value === majority)!;
  const minorityVendor = values.find((v) => v.value === minority)!;

  // For governance: any "block" is blocking severity; otherwise material.
  const divergence = field === "governance_outcome" && [...distinct].includes("block") ? 1.0 : 0.5;
  const severity = severityFor(field, divergence);

  // Reconcile: take the more conservative value (warn > allow; elevated > none).
  const orderGov: Record<string, number> = { allow: 0, warn: 1, block: 2 };
  const orderSens: Record<string, number> = { none: 0, elevated: 1, restricted: 2 };
  const order = field === "governance_outcome" ? orderGov : orderSens;
  let reconciled = majority;
  for (const [val] of sortedCounts) {
    if ((order[val] ?? 0) > (order[reconciled] ?? 0)) reconciled = val;
  }

  return {
    field,
    field_label: FIELD_LABELS[field],
    severity,
    conflict_pair: [minorityVendor, majorityVendor],
    all_values: values,
    rationale: `${minorityVendor.vendor_name} returns "${minority}"; ${sortedCounts[0]![1]} other vendor(s) return "${majority}". A single dissent on a categorical field is treated as material.`,
    reconciled_value: reconciled,
    reconcile_rationale: `Reconciled to "${reconciled}" — the more conservative read. When vendors disagree on a categorical safety field, defer to the stricter posture.`,
  };
}

/**
 * Detect all disagreements across a set of vendor responses. Returns
 * them in render-priority order: blocking > material > minor.
 */
export function detectDisagreements(responses: VendorRaceResponse[]): Disagreement[] {
  const out: Disagreement[] = [];

  const numAudience = detectNumericDisagreement(responses, "audience_size");
  if (numAudience) out.push(numAudience);

  const numFloor = detectNumericDisagreement(responses, "recommended_bid_floor_cents");
  if (numFloor) out.push(numFloor);

  const catSens = detectCategoricalDisagreement(responses, "sensitive_category_verdict");
  if (catSens) out.push(catSens);

  const catGov = detectCategoricalDisagreement(responses, "governance_outcome");
  if (catGov) out.push(catGov);

  // Sort: blocking first, then material, then minor.
  const order: Record<DisagreementSeverity, number> = { blocking: 0, material: 1, minor: 2 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return out;
}
