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
