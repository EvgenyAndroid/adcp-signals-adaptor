// src/analytics/portfolioOptimizer.ts
// Sec-41: Portfolio Optimizer math — Pareto frontier, greedy marginal
// reach, budget-constrained N-pick, information-theoretic overlap
// (Jaccard / KL / MI), Lorenz + Gini per catalog slice.
//
// All pure functions, no I/O. Caller hydrates signals + cost + reach.

import type { SignalSummary } from "../types/api";

// ── Shared types ─────────────────────────────────────────────────────────────

export interface PortfolioSignal {
  signal_id: string;
  name: string;
  reach: number;
  cpm: number;
  specificity: number;
  category: string;
  vertical?: string;
}

// Turn a SignalSummary into the optimizer's canonical shape.
export function signalToPortfolioEntry(s: SignalSummary): PortfolioSignal | null {
  if (!s.estimated_audience_size) return null;
  const cpmOpt = s.pricing_options?.[0];
  const cpm = cpmOpt && cpmOpt.model === "cpm" ? cpmOpt.cpm : 0;
  const specificity =
    s.category_type === "purchase_intent" ? 0.85
    : s.category_type === "composite" ? 0.80
    : s.category_type === "interest" ? 0.65
    : s.category_type === "demographic" ? 0.45
    : 0.40;
  return {
    signal_id: s.signal_agent_segment_id,
    name: s.name,
    reach: s.estimated_audience_size,
    cpm,
    specificity,
    category: s.category_type,
  };
}

// ── Pareto frontier ─────────────────────────────────────────────────────────

/**
 * Find Pareto-optimal points under: maximize reach, minimize cpm, maximize specificity.
 * A point P dominates Q iff P.reach >= Q.reach AND P.cpm <= Q.cpm AND P.specificity >= Q.specificity
 * with at least one strict.
 */
export function paretoFrontier(points: PortfolioSignal[]): PortfolioSignal[] {
  const frontier: PortfolioSignal[] = [];
  for (const p of points) {
    let dominated = false;
    for (const q of points) {
      if (p === q) continue;
      if (q.reach >= p.reach && q.cpm <= p.cpm && q.specificity >= p.specificity &&
          (q.reach > p.reach || q.cpm < p.cpm || q.specificity > p.specificity)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) frontier.push(p);
  }
  return frontier;
}

// ── Category affinity for heuristic Jaccard ─────────────────────────────────

function affinity(a: PortfolioSignal, b: PortfolioSignal): number {
  if (a.category === b.category) return 0.55;
  return 0.20;
}

function heuristicJaccard(a: PortfolioSignal, b: PortfolioSignal): number {
  const aff = affinity(a, b);
  const minR = Math.min(a.reach, b.reach);
  const maxR = Math.max(a.reach, b.reach);
  if (maxR === 0) return 0;
  return aff * (minR / maxR);
}

// ── Greedy marginal-reach optimizer ────────────────────────────────────────

export interface OptimizationResult {
  method: string;
  budget: number;
  target_reach?: number;
  picked: Array<{
    signal_id: string;
    name: string;
    cost: number;
    marginal_reach: number;
    cumulative_reach: number;
    cpm: number;
  }>;
  total_cost: number;
  total_unique_reach: number;
  efficiency: number;     // reach per $
  overlap_waste: number;
  candidates_considered: number;
}

/**
 * Greedy allocator. Cost per signal = reach * cpm / 1000 (standard CPM math).
 */
export function greedyMarginalReach(
  candidates: PortfolioSignal[],
  budget: number,
  maxSignals: number = 20,
  targetReach?: number,
  mustInclude: string[] = [],
  mustExclude: string[] = [],
): OptimizationResult {
  const excluded = new Set(mustExclude);
  const pool = candidates.filter((c) => !excluded.has(c.signal_id));
  const includeFirst = pool.filter((c) => mustInclude.includes(c.signal_id));
  const rest = pool.filter((c) => !mustInclude.includes(c.signal_id));

  const picked: PortfolioSignal[] = [];
  const trail: OptimizationResult["picked"] = [];
  let spent = 0;
  let cumReach = 0;
  let overlapWaste = 0;

  // Force-include always-in signals first
  for (const c of includeFirst) {
    const cost = (c.reach * c.cpm) / 1000;
    if (spent + cost > budget) continue;
    const overlap = picked.reduce((acc, p) => acc + heuristicJaccard(c, p) * Math.min(c.reach, p.reach), 0);
    const marg = Math.max(0, c.reach - overlap);
    picked.push(c);
    trail.push({
      signal_id: c.signal_id, name: c.name, cost, cpm: c.cpm,
      marginal_reach: marg, cumulative_reach: cumReach + marg,
    });
    spent += cost;
    cumReach += marg;
    overlapWaste += overlap;
  }

  // Greedy pick from rest
  while (picked.length < maxSignals && spent < budget) {
    let best: PortfolioSignal | null = null;
    let bestMarg = 0;
    let bestCost = 0;
    let bestOverlap = 0;
    for (const c of rest) {
      if (picked.some((p) => p.signal_id === c.signal_id)) continue;
      const cost = (c.reach * c.cpm) / 1000;
      if (spent + cost > budget) continue;
      const overlap = picked.reduce((acc, p) => acc + heuristicJaccard(c, p) * Math.min(c.reach, p.reach), 0);
      const marg = Math.max(0, c.reach - overlap);
      if (marg > bestMarg) {
        best = c; bestMarg = marg; bestCost = cost; bestOverlap = overlap;
      }
    }
    if (!best || bestMarg <= 0) break;
    picked.push(best);
    trail.push({
      signal_id: best.signal_id, name: best.name, cost: bestCost, cpm: best.cpm,
      marginal_reach: bestMarg, cumulative_reach: cumReach + bestMarg,
    });
    spent += bestCost;
    cumReach += bestMarg;
    overlapWaste += bestOverlap;
    if (targetReach && cumReach >= targetReach) break;
  }

  return {
    method: "greedy_marginal_reach",
    budget,
    ...(targetReach !== undefined ? { target_reach: targetReach } : {}),
    picked: trail,
    total_cost: Math.round(spent * 100) / 100,
    total_unique_reach: Math.round(cumReach),
    efficiency: spent > 0 ? Math.round(cumReach / (spent / 1000)) : 0,
    overlap_waste: Math.round(overlapWaste),
    candidates_considered: candidates.length,
  };
}

// ── Information-theoretic overlap ──────────────────────────────────────────

/**
 * Build a synthetic probability distribution for a signal over
 * (category × vertical × geo). Sums to 1.0. Used for KL / MI.
 */
function distributionVector(s: PortfolioSignal): number[] {
  const categories = ["demographic", "interest", "purchase_intent", "geo", "composite"];
  const verticals = [
    "automotive", "financial", "health", "b2b", "life_events", "behavioral",
    "intent", "transactional", "media", "retail", "seasonal", "psychographic",
    "interest_ext", "demographic_ext", "geographic_ext", "b2b_firmo_techno",
    "retail_media_network", "ctv_hispanic_daypart", "venue_fenced",
    "weather_triggered", "contextual_advanced", "lookalike_recipe", "other",
  ];
  const dims = categories.length + verticals.length + 4; // +4 for geo bands
  const dist = new Array(dims).fill(0.01 / dims);
  const cIdx = categories.indexOf(s.category);
  if (cIdx >= 0) dist[cIdx] = 0.40;
  const vIdx = s.vertical ? verticals.indexOf(s.vertical) : verticals.length - 1;
  if (vIdx >= 0) dist[categories.length + vIdx] = 0.40;
  // Geo bias: treat reach as proxy (large reach = broad geo)
  const reachLog = Math.max(0, Math.log10(s.reach + 1));
  const geoBase = categories.length + verticals.length;
  dist[geoBase + Math.min(3, Math.floor(reachLog / 2))] = 0.18;
  // Normalize
  const sum = dist.reduce((acc, x) => acc + x, 0);
  return dist.map((x) => x / sum);
}

function klDivergence(p: number[], q: number[]): number {
  let kl = 0;
  const eps = 1e-9;
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] ?? 0, qi = q[i] ?? 0;
    if (pi > 0) kl += pi * Math.log((pi + eps) / (qi + eps));
  }
  return kl;
}

function mutualInformation(p: number[], q: number[]): number {
  // Approximation: treat P, Q as two marginal distributions of two variables
  // assumed joint via outer product. This gives a synthetic MI that's
  // interpretable for comparison purposes.
  let mi = 0;
  const eps = 1e-9;
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      const pij = (p[i] ?? 0) * (q[j] ?? 0);
      const marg = (p[i] ?? 0) * (q[j] ?? 0);
      if (pij > 0) mi += pij * Math.log((pij + eps) / (marg + eps));
    }
  }
  return Math.abs(mi); // fallback to symmetric proxy
}

export interface InfoOverlapResult {
  signal_ids: string[];
  jaccard_matrix: number[][];
  kl_matrix: number[][];
  mi_matrix: number[][];
  interpretation: string;
}

export function informationOverlap(signals: PortfolioSignal[]): InfoOverlapResult {
  const n = signals.length;
  const jaccard_matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const kl_matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const mi_matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const dists = signals.map(distributionVector);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const si = signals[i]!, sj = signals[j]!;
      const pi = dists[i]!, pj = dists[j]!;
      if (i === j) {
        jaccard_matrix[i]![j] = 1;
        kl_matrix[i]![j] = 0;
        mi_matrix[i]![j] = 0;
        continue;
      }
      jaccard_matrix[i]![j] = Math.round(heuristicJaccard(si, sj) * 1000) / 1000;
      kl_matrix[i]![j] = Math.round(klDivergence(pi, pj) * 1000) / 1000;
      // Simple MI proxy: 1 - symmetric KL
      const symKL = (klDivergence(pi, pj) + klDivergence(pj, pi)) / 2;
      mi_matrix[i]![j] = Math.round(Math.max(0, 1 - symKL) * 1000) / 1000;
    }
  }
  return {
    signal_ids: signals.map((s) => s.signal_id),
    jaccard_matrix, kl_matrix, mi_matrix,
    interpretation: "Jaccard 1.0 = identical set; KL 0 = identical distribution; MI 1 = maximally shared info.",
  };
}

// ── Lorenz + Gini ────────────────────────────────────────────────────────────

export interface LorenzSlice {
  group: string;
  signal_count: number;
  lorenz: Array<{ x: number; y: number }>;
  gini: number;
  interpretation: string;
}

export function lorenzCurve(sizes: number[]): { curve: Array<{ x: number; y: number }>; gini: number } {
  if (sizes.length === 0) return { curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], gini: 0 };
  const sorted = [...sizes].sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  const n = sorted.length;
  const curve: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += sorted[i]!;
    curve.push({ x: (i + 1) / n, y: total > 0 ? cum / total : 0 });
  }
  // Gini = 1 - 2 * area under Lorenz curve (trapezoid rule)
  let area = 0;
  for (let i = 1; i < curve.length; i++) {
    const x1 = curve[i - 1]!.x, y1 = curve[i - 1]!.y;
    const x2 = curve[i]!.x, y2 = curve[i]!.y;
    area += ((y1 + y2) / 2) * (x2 - x1);
  }
  const gini = Math.max(0, Math.min(1, 1 - 2 * area));
  return { curve, gini: Math.round(gini * 1000) / 1000 };
}

export function giniInterpret(gini: number): string {
  if (gini < 0.2) return "Very even distribution — catalog is well-balanced.";
  if (gini < 0.4) return "Moderate concentration — healthy long tail of niche audiences.";
  if (gini < 0.6) return "Significant concentration — a few signals dominate reach.";
  return "Highly concentrated — catalog is top-heavy; few signals own most reach.";
}
