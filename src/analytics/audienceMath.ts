// src/analytics/audienceMath.ts
// Sec-43: pure math for the audience composer endpoints.
// No I/O, no DB, no fetch — testable in isolation.

import type { SignalSummary } from "../types/api";

// ── Vertical / geo classifiers ──────────────────────────────────────────────

/** Mirrors verticalOf in portfolioEndpoints.ts so audits + portfolio stay aligned. */
export function verticalOf(id: string): string {
  if (id.startsWith("sig_b2b_firmo") || id.startsWith("sig_b2b_techno") || id.startsWith("sig_b2b_funding") || id.startsWith("sig_b2b_intent")) return "b2b_firmo_techno";
  if (id.startsWith("sig_rmn_")) return "retail_media_network";
  if (id.startsWith("sig_ctv_")) return "ctv_hispanic_daypart";
  if (id.startsWith("sig_venue_")) return "venue_fenced";
  if (id.startsWith("sig_weather_")) return "weather_triggered";
  if (id.startsWith("sig_context_")) return "contextual_advanced";
  if (id.startsWith("sig_lal_")) return "lookalike";
  if (id.startsWith("sig_auto") || id.includes("automotive")) return "automotive";
  if (id.startsWith("sig_b2b") || id.includes("b2b")) return "b2b";
  if (id.startsWith("sig_finance") || id.includes("financial")) return "financial";
  if (id.startsWith("sig_health")) return "health";
  if (id.startsWith("sig_life_") || id.startsWith("sig_lw_")) return "life_events";
  if (id.startsWith("sig_seasonal") || id.startsWith("sig_sr_")) return "seasonal";
  if (id.startsWith("sig_media_") || id.includes("ctv")) return "media";
  if (id.startsWith("sig_retail")) return "retail";
  if (id.startsWith("sig_psycho")) return "psychographic";
  if (id.startsWith("sig_geo_") || id.includes("_dma_") || id.includes("_region")) return "geo";
  return "other";
}

/** Reach-as-geo proxy. Matches portfolioOptimizer.distributionVector banding. */
export function geoBand(s: SignalSummary): string {
  const r = s.estimated_audience_size ?? 0;
  if (r >= 50_000_000) return "national";
  if (r >= 10_000_000) return "multi_region";
  if (r >= 1_000_000) return "metro";
  return "local";
}

// ── Pairwise heuristic Jaccard ──────────────────────────────────────────────

/**
 * Heuristic pairwise overlap — returns an estimated count of users who would
 * appear in both signals. Same shape as portfolioOptimizer's affinity Jaccard:
 *   affinity × min(reach) × (min(reach) / max(reach))
 * where affinity = 0.55 for matching category_type, 0.20 otherwise.
 */
export function pairOverlap(a: SignalSummary, b: SignalSummary): number {
  const ra = a.estimated_audience_size ?? 0;
  const rb = b.estimated_audience_size ?? 0;
  if (ra === 0 || rb === 0) return 0;
  const aff = a.category_type === b.category_type ? 0.55 : 0.20;
  const minR = Math.min(ra, rb);
  const maxR = Math.max(ra, rb);
  return aff * (minR / maxR) * minR;
}

// ── Set-op reach folds ──────────────────────────────────────────────────────

/** Inclusion-exclusion union over an ordered list. */
export function unionReach(ss: SignalSummary[]): number {
  if (ss.length === 0) return 0;
  let acc = ss[0]!.estimated_audience_size ?? 0;
  const pool: SignalSummary[] = [ss[0]!];
  for (let i = 1; i < ss.length; i++) {
    const next = ss[i]!;
    const nextR = next.estimated_audience_size ?? 0;
    const overlap = pool.reduce((s, p) => s + pairOverlap(next, p), 0);
    acc += Math.max(0, nextR - overlap);
    pool.push(next);
  }
  return Math.round(acc);
}

/**
 * Intersect a current reach with each signal in `ss`, decaying by the
 * pairwise overlap rate at each step. Returns count of users assumed to
 * match the union AND every signal in `ss`.
 */
export function intersectReach(base: number, baseTemplate: SignalSummary | null, ss: SignalSummary[]): number {
  if (ss.length === 0 || !baseTemplate) return base;
  let r = base;
  for (const next of ss) {
    const nextR = next.estimated_audience_size ?? 0;
    const baseProxy: SignalSummary = { ...baseTemplate, estimated_audience_size: r };
    const overlap = pairOverlap(baseProxy, next);
    const rate = r > 0 && nextR > 0 ? overlap / Math.min(r, nextR) : 0;
    r = Math.round(r * Math.max(0, Math.min(1, rate)));
  }
  return r;
}

/** Suppress users that overlap with any signal in `ss`. */
export function excludeReach(base: number, baseSet: SignalSummary[], ss: SignalSummary[]): number {
  if (ss.length === 0 || baseSet.length === 0) return base;
  let r = base;
  for (const next of ss) {
    const overlap = baseSet.reduce((s, p) => s + pairOverlap(next, p), 0);
    r = Math.max(0, r - Math.round(overlap));
  }
  return r;
}

// ── Frequency saturation ────────────────────────────────────────────────────

export interface SaturationPoint {
  frequency: number;
  reach_fraction: number;
  unique_reach: number;
  impressions: number;
  cost_usd: number;
  cost_per_unique_reach_usd: number;
  marginal_reach: number;
}

/**
 * Poisson exposure model: P(seen at least once | F) = 1 − exp(−F).
 * Returns one point per requested frequency, plus per-step marginal reach.
 */
export function saturationCurve(reach: number, cpm: number, frequencies: number[]): SaturationPoint[] {
  const out: SaturationPoint[] = [];
  let prev = 0;
  for (const f of frequencies) {
    const reachFraction = 1 - Math.exp(-f);
    const uniqueReach = Math.round(reach * reachFraction);
    const impressions = Math.round(reach * f);
    const cost = Math.round((impressions * cpm / 1000) * 100) / 100;
    const cpUR = uniqueReach > 0 ? Math.round((cost / uniqueReach) * 10000) / 10000 : 0;
    out.push({
      frequency: f,
      reach_fraction: Math.round(reachFraction * 10000) / 10000,
      unique_reach: uniqueReach,
      impressions,
      cost_usd: cost,
      cost_per_unique_reach_usd: cpUR,
      marginal_reach: uniqueReach - prev,
    });
    prev = uniqueReach;
  }
  return out;
}

/**
 * "Knee" of the saturation curve: first frequency whose marginal reach is
 * less than half of the F=1 baseline gain. Returns null if no point qualifies.
 */
export function saturationKnee(curve: SaturationPoint[]): number | null {
  const baseline = curve[0]?.unique_reach ?? 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i]!.marginal_reach < baseline * 0.5) return curve[i]!.frequency;
  }
  return null;
}

// ── Affinity index / over-under analysis ────────────────────────────────────

/**
 * Reach-weighted share of `key(s)` over a row set. Returns map of
 * key → fraction (0..1). Sums to 1.0 (or 0 if all reaches are zero).
 */
export function shareByKey<T extends SignalSummary>(rows: T[], key: (s: T) => string): Map<string, number> {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const s of rows) {
    const r = s.estimated_audience_size ?? 0;
    grand += r;
    totals.set(key(s), (totals.get(key(s)) ?? 0) + r);
  }
  const out = new Map<string, number>();
  for (const [k, v] of totals) out.set(k, grand > 0 ? v / grand : 0);
  return out;
}

export interface AffinityRow {
  key: string;
  share: number;
  selection_share: number;
  index: number; // 100 = parity; capped to 600
}

/**
 * For each key in `selection ∪ baseline`, compute its baseline share, its
 * selection share, and the affinity index (selection_share / baseline_share × 100).
 * Index is capped at 600 to bound display contrast on a tiny baseline.
 */
export function affinityRows(baseline: Map<string, number>, selection: Map<string, number>): AffinityRow[] {
  const keys = new Set<string>([...baseline.keys(), ...selection.keys()]);
  const rows: AffinityRow[] = [];
  for (const k of keys) {
    const b = baseline.get(k) ?? 0;
    const s = selection.get(k) ?? 0;
    const idx = b > 0 ? Math.round((s / b) * 100) : 0;
    rows.push({
      key: k,
      share: Math.round(b * 10000) / 10000,
      selection_share: Math.round(s * 10000) / 10000,
      index: Math.min(600, idx),
    });
  }
  rows.sort((a, b) => b.selection_share - a.selection_share);
  return rows;
}

/** Mean of |index - 100| across rows with non-zero selection share. 0 = no skew. */
export function skewScore(rows: AffinityRow[]): number {
  const live = rows.filter((r) => r.selection_share > 0);
  if (live.length === 0) return 0;
  return Math.round(live.reduce((s, r) => s + Math.abs(r.index - 100), 0) / live.length);
}

/** Number of distinct buckets carrying ≥80% of selection share. */
export function concentrationOf(rows: AffinityRow[]): number {
  const sorted = [...rows].filter((r) => r.selection_share > 0).sort((a, b) => b.selection_share - a.selection_share);
  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i]!.selection_share;
    if (cum >= 0.8) return i + 1;
  }
  return sorted.length;
}

// ── Sequential / journey drop-off ───────────────────────────────────────────
// Sec-44: given stage reaches A, B, C, …, compute per-stage conversion rates
// and cumulative drop-off. We assume each stage is a subset of the previous
// (awareness ⊇ consideration ⊇ intent ⊇ conversion) — reach should be
// monotonically non-increasing. If a stage reach exceeds its predecessor we
// clamp it to preserve the subset invariant and flag it in the result.

export interface JourneyStageInput {
  name: string;
  reach: number;
}

export interface JourneyStageOut {
  name: string;
  reach: number;
  pre_clamp_reach: number;   // Sec-46: reach before monotone clamp (= reach when not clamped)
  conversion_rate: number;   // vs previous stage; 1.0 for stage 0
  cumulative_rate: number;   // vs stage 0; 1.0 for stage 0
  dropped_off: number;       // reach[i-1] - reach[i], 0 for stage 0
  clamped: boolean;          // true if input reach exceeded predecessor
}

export function journeyFunnel(stages: JourneyStageInput[]): JourneyStageOut[] {
  const out: JourneyStageOut[] = [];
  let prev = stages[0]?.reach ?? 0;
  const base = prev;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]!;
    const raw = st.reach;
    let r = raw;
    let clamped = false;
    if (i > 0 && r > prev) { r = prev; clamped = true; }
    const conv = i === 0 ? 1 : (prev > 0 ? r / prev : 0);
    const cum = base > 0 ? r / base : 0;
    out.push({
      name: st.name,
      reach: r,
      pre_clamp_reach: raw,
      conversion_rate: Math.round(conv * 10000) / 10000,
      cumulative_rate: Math.round(cum * 10000) / 10000,
      dropped_off: i === 0 ? 0 : Math.max(0, prev - r),
      clamped,
    });
    prev = r;
  }
  return out;
}

// ── Privacy-safe cohort gate ────────────────────────────────────────────────
// Sec-44: k-anonymity threshold check + sensitive-category flag. Cohorts
// below min_k (default 1000 per the GDPR/CCPA "small cell" convention) are
// blocked from activation; mixing ≥2 sensitive categories raises a warning
// even if k-anon passes (intersectional sensitivity risk).

export interface PrivacyCheckResult {
  min_k: number;
  cohort_size: number;
  k_anon_pass: boolean;
  sensitive_categories_touched: string[];
  intersectional_sensitivity: boolean;
  status: "ok" | "warn" | "block";
  reasons: string[];
}

const SENSITIVE_TOKENS = [
  "health", "medical", "condition", "medication", "diagnosis",
  "finance", "income", "debt", "credit", "loan", "mortgage",
  "ethnic", "hispanic", "religion", "politic", "lgbt",
  "child", "children", "kids", "minor",
];

/** Infer sensitive-category touches from signal names/descriptions. */
export function inferSensitiveCategories(
  texts: Array<{ name: string; description?: string }>,
): string[] {
  const hit = new Set<string>();
  for (const t of texts) {
    const corpus = ((t.name || "") + " " + (t.description || "")).toLowerCase();
    for (const tok of SENSITIVE_TOKENS) {
      if (corpus.includes(tok)) hit.add(tok);
    }
  }
  return Array.from(hit);
}

export function privacyCheck(
  cohortSize: number,
  sensitiveTokens: string[],
  minK: number = 1000,
): PrivacyCheckResult {
  const reasons: string[] = [];
  const kPass = cohortSize >= minK;
  if (!kPass) reasons.push(`cohort_size ${cohortSize} < min_k ${minK} (k-anon floor)`);
  const intersectional = sensitiveTokens.length >= 2;
  if (intersectional) reasons.push(`intersectional sensitive categories: ${sensitiveTokens.slice(0, 6).join(", ")}`);
  else if (sensitiveTokens.length === 1) reasons.push(`touches sensitive category: ${sensitiveTokens[0]}`);
  const status: PrivacyCheckResult["status"] =
    !kPass ? "block"
    : intersectional ? "warn"
    : sensitiveTokens.length === 1 ? "warn"
    : "ok";
  return {
    min_k: minK,
    cohort_size: cohortSize,
    k_anon_pass: kPass,
    sensitive_categories_touched: sensitiveTokens,
    intersectional_sensitivity: intersectional,
    status,
    reasons,
  };
}

// ── Holdout / incrementality carve ──────────────────────────────────────────
// Sec-44: deterministic control/exposed split. Given a population reach and
// holdout_pct, report the split sizes and the minimum detectable effect
// (MDE) at 80% power / alpha=0.05 assuming a baseline conversion rate. MDE
// formula is the standard two-proportion z-test with n per arm.

export interface HoldoutPlan {
  reach_total: number;
  holdout_pct: number;
  control_size: number;
  exposed_size: number;
  baseline_conversion_rate: number;
  mde_absolute: number;        // minimum detectable difference in conversion rate
  mde_relative: number;        // as a fraction of baseline_conversion_rate
  power: number;
  alpha: number;
  method: string;
}

export function holdoutPlan(
  totalReach: number,
  holdoutPct: number,
  baselineCr: number = 0.02,   // 2% conversion default
  power: number = 0.80,
  alpha: number = 0.05,
): HoldoutPlan {
  const pct = Math.max(0.01, Math.min(0.5, holdoutPct));
  const control = Math.round(totalReach * pct);
  const exposed = Math.max(0, totalReach - control);

  // Two-proportion z-test MDE, balanced arms (use smaller arm as n for
  // conservative estimate).
  // z_alpha (two-sided) ≈ 1.96, z_beta (power 0.80) ≈ 0.84
  const zA = alpha === 0.05 ? 1.96 : alpha === 0.01 ? 2.576 : 1.645;
  const zB = power >= 0.90 ? 1.282 : power >= 0.80 ? 0.842 : 0.524;
  const n = Math.min(control, exposed);
  const p = Math.max(0.001, Math.min(0.999, baselineCr));
  const sigma = Math.sqrt(2 * p * (1 - p) / Math.max(1, n));
  const mde = n > 0 ? (zA + zB) * sigma : 0;
  return {
    reach_total: totalReach,
    holdout_pct: pct,
    control_size: control,
    exposed_size: exposed,
    baseline_conversion_rate: p,
    mde_absolute: Math.round(mde * 10000) / 10000,
    mde_relative: p > 0 ? Math.round((mde / p) * 10000) / 10000 : 0,
    power,
    alpha,
    method: "two_proportion_z_test_balanced_arms",
  };
}
