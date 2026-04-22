// src/routes/portfolioEndpoints.ts
// Sec-41: Portfolio + catalog-analytics endpoints.
//   GET  /analytics/lorenz?group=vertical|category
//   GET  /analytics/knn-graph?k=5
//   GET  /analytics/seasonality?signal_id=X
//   GET  /analytics/best-for?window=Q3|month_N|months_N_M
//   POST /portfolio/optimize
//   GET  /portfolio/pareto
//   POST /portfolio/info-overlap
//   POST /portfolio/hit-target
//   POST /portfolio/what-if
//   POST /portfolio/from-brief

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { getDb } from "../storage/db";
import { searchSignals } from "../storage/signalRepo";
import { toSignalSummary } from "../mappers/signalMapper";
import { SIGNAL_EMBEDDINGS } from "../domain/embeddingStore";
import { dot, textToPseudoVector, topKCosine } from "../analytics/vectorMath";
import {
  signalToPortfolioEntry,
  paretoFrontier,
  greedyMarginalReach,
  informationOverlap,
  lorenzCurve,
  giniInterpret,
  type PortfolioSignal,
} from "../analytics/portfolioOptimizer";
import {
  deriveSeasonality,
  deriveDecayHalfLifeDays,
  deriveVolatilityIndex,
  deriveAuthorityScore,
} from "../analytics/derivedFacets";

// Helper: load all signals + summaries. Uses searchSignals with a large
// limit so we operate on live D1 data rather than the static seed list.
async function loadAllSignals(env: Env, _logger: Logger) {
  const db = getDb(env);
  const { signals } = await searchSignals(db, { limit: 1000, offset: 0 });
  const summaries = signals.map(toSignalSummary);
  return { cats: signals, summaries };
}

function verticalOf(s: { signal_agent_segment_id: string; name: string }): string {
  const id = s.signal_agent_segment_id || "";
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

// ── /analytics/lorenz ────────────────────────────────────────────────────────

export async function handleLorenz(url: URL, env: Env, logger: Logger): Promise<Response> {
  const group = url.searchParams.get("group") ?? "vertical";
  if (!["vertical", "category"].includes(group)) {
    return errorResponse("INVALID_GROUP", "group must be 'vertical' or 'category'", 400);
  }
  const { summaries } = await loadAllSignals(env, logger);

  const slices: Record<string, number[]> = {};
  for (const s of summaries) {
    const size = s.estimated_audience_size ?? 0;
    if (size === 0) continue;
    const key = group === "vertical" ? verticalOf(s) : s.category_type;
    if (!slices[key]) slices[key] = [];
    slices[key].push(size);
  }

  const sliceResults = Object.entries(slices)
    .map(([key, sizes]) => {
      const { curve, gini } = lorenzCurve(sizes);
      return {
        group: key,
        signal_count: sizes.length,
        lorenz: curve,
        gini,
        interpretation: giniInterpret(gini),
      };
    })
    .sort((a, b) => b.signal_count - a.signal_count);

  const overall = lorenzCurve(summaries.map((s) => s.estimated_audience_size ?? 0).filter((v) => v > 0));

  return jsonResponse({
    group_by: group,
    slice_count: sliceResults.length,
    slices: sliceResults,
    overall: {
      signal_count: summaries.length,
      lorenz: overall.curve,
      gini: overall.gini,
      interpretation: giniInterpret(overall.gini),
    },
    method: "sorted_cumulative_share_trapezoid_gini",
    note: "Lorenz x = cumulative signal share; y = cumulative audience share. Perfect equality = y=x; Gini = 1 − 2 × area under curve.",
  });
}

// ── /analytics/knn-graph ─────────────────────────────────────────────────────

export function handleKnnGraph(url: URL): Response {
  const k = Math.max(1, Math.min(10, Number(url.searchParams.get("k") ?? 5)));
  const ids = Object.keys(SIGNAL_EMBEDDINGS);
  const nodes = ids.map((id) => {
    const vec = SIGNAL_EMBEDDINGS[id]!.vector;
    const desc = SIGNAL_EMBEDDINGS[id]!.description;
    return { id, description: desc, vector_ref: id };
  });
  const edges: Array<{ source: string; target: string; cosine: number }> = [];
  for (const id of ids) {
    const self = SIGNAL_EMBEDDINGS[id]!.vector;
    const neighbors: Array<{ id: string; cos: number }> = [];
    for (const other of ids) {
      if (other === id) continue;
      const v = SIGNAL_EMBEDDINGS[other]!.vector;
      neighbors.push({ id: other, cos: dot(self, v) });
    }
    neighbors.sort((a, b) => b.cos - a.cos);
    for (const n of neighbors.slice(0, k)) {
      edges.push({ source: id, target: n.id, cosine: Math.round(n.cos * 1000) / 1000 });
    }
  }
  return jsonResponse({
    k,
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    method: "per_node_top_k_cosine_directed_edges",
  });
}

// ── /analytics/seasonality ───────────────────────────────────────────────────

export async function handleSeasonality(url: URL, env: Env, logger: Logger): Promise<Response> {
  const signalId = url.searchParams.get("signal_id");
  const { cats } = await loadAllSignals(env, logger);
  if (signalId) {
    const sig = cats.find((c) => c.signalId === signalId);
    if (!sig) return errorResponse("NOT_FOUND", `signal ${signalId} not found`, 404);
    return jsonResponse({
      signal_id: signalId,
      seasonality: deriveSeasonality(sig),
      decay_half_life_days: deriveDecayHalfLifeDays(sig),
      authority_score: deriveAuthorityScore(sig),
      method: "deterministic_from_signal_metadata",
    });
  }
  // Full batch
  const profiles = cats.slice(0, 100).map((sig) => ({
    signal_id: sig.signalId,
    name: sig.name,
    monthly: deriveSeasonality(sig).monthly,
    peak_month: deriveSeasonality(sig).peakMonth,
    volatility: deriveVolatilityIndex(deriveSeasonality(sig)),
  }));
  return jsonResponse({
    count: profiles.length,
    profiles,
    note: "Returns first 100 signals. Pass ?signal_id=X for a specific signal's full profile.",
  });
}

// ── /analytics/best-for ──────────────────────────────────────────────────────

export async function handleBestForWindow(url: URL, env: Env, logger: Logger): Promise<Response> {
  const windowParam = url.searchParams.get("window") ?? "current";
  // Parse window → months array (0-indexed)
  const now = new Date();
  let months: number[] = [now.getMonth()];
  let label = "current";
  if (windowParam === "Q1") { months = [0, 1, 2]; label = "Q1"; }
  else if (windowParam === "Q2") { months = [3, 4, 5]; label = "Q2"; }
  else if (windowParam === "Q3") { months = [6, 7, 8]; label = "Q3"; }
  else if (windowParam === "Q4") { months = [9, 10, 11]; label = "Q4"; }
  else if (windowParam === "next30") { months = [now.getMonth()]; label = "next 30 days"; }
  else if (/^month_\d+$/.test(windowParam)) {
    const m = parseInt(windowParam.split("_")[1]!, 10);
    if (m >= 0 && m <= 11) { months = [m]; label = `month_${m}`; }
  } else if (/^months_\d+_\d+$/.test(windowParam)) {
    const parts = windowParam.split("_");
    const a = parseInt(parts[1]!, 10), b = parseInt(parts[2]!, 10);
    months = []; for (let m = a; m <= b; m++) months.push(m % 12);
    label = `months_${a}_${b}`;
  }

  const { cats } = await loadAllSignals(env, logger);
  const scored = cats.map((sig) => {
    const season = deriveSeasonality(sig);
    const windowAvg = months.reduce((s, m) => s + (season.monthly[m] ?? 1), 0) / months.length;
    const specificity =
      sig.categoryType === "purchase_intent" ? 0.85
      : sig.categoryType === "composite" ? 0.80
      : sig.categoryType === "interest" ? 0.65
      : sig.categoryType === "demographic" ? 0.45 : 0.40;
    const reachLog = Math.log10((sig.estimatedAudienceSize ?? 0) + 1) / 9;
    const adjScore = windowAvg * specificity * Math.max(0.1, reachLog);
    return {
      signal_id: sig.signalId,
      name: sig.name,
      window_multiplier: Math.round(windowAvg * 1000) / 1000,
      specificity,
      reach: sig.estimatedAudienceSize ?? 0,
      adj_score: Math.round(adjScore * 1000) / 1000,
    };
  });
  scored.sort((a, b) => b.adj_score - a.adj_score);
  return jsonResponse({
    window: label,
    months,
    top: scored.slice(0, 30),
    method: "window_avg_seasonality × specificity × log_reach",
    note: "Forward-looking ranker: scores signals by how well their seasonality profile matches the target time window.",
  });
}

// ── /portfolio/optimize ──────────────────────────────────────────────────────

interface OptimizeBody {
  budget?: number;
  max_signals?: number;
  target_reach?: number;
  include?: string[];
  exclude?: string[];
  candidate_signal_ids?: string[];
}

export async function handleOptimize(request: Request, env: Env, logger: Logger): Promise<Response> {
  let body: OptimizeBody = {};
  try { body = (await request.json()) as OptimizeBody; } catch {}
  const budget = body.budget ?? 100_000;
  const maxSignals = Math.max(1, Math.min(20, body.max_signals ?? 8));

  const { summaries } = await loadAllSignals(env, logger);
  let candidates = summaries
    .map(signalToPortfolioEntry)
    .filter((x): x is PortfolioSignal => x !== null && x.reach > 0);

  if (body.candidate_signal_ids && body.candidate_signal_ids.length > 0) {
    const set = new Set(body.candidate_signal_ids);
    candidates = candidates.filter((c) => set.has(c.signal_id));
  }

  const result = greedyMarginalReach(
    candidates, budget, maxSignals,
    body.target_reach, body.include ?? [], body.exclude ?? [],
  );
  return jsonResponse(result);
}

// ── /portfolio/pareto ────────────────────────────────────────────────────────

export async function handlePareto(env: Env, logger: Logger): Promise<Response> {
  const { summaries } = await loadAllSignals(env, logger);
  const candidates = summaries
    .map(signalToPortfolioEntry)
    .filter((x): x is PortfolioSignal => x !== null && x.reach > 0);
  const frontier = paretoFrontier(candidates);

  let mostReach = candidates[0], lowestCost = candidates[0], highestSpec = candidates[0];
  for (const c of candidates) {
    if (!mostReach || c.reach > mostReach.reach) mostReach = c;
    if (!lowestCost || c.cpm < lowestCost.cpm) lowestCost = c;
    if (!highestSpec || c.specificity > highestSpec.specificity) highestSpec = c;
  }

  return jsonResponse({
    axes: ["reach", "cpm", "specificity"],
    total_points: candidates.length,
    frontier_count: frontier.length,
    frontier: frontier.map((p) => ({
      signal_id: p.signal_id, name: p.name,
      reach: p.reach, cpm: p.cpm, specificity: p.specificity, category: p.category,
    })),
    summary: {
      most_reach: mostReach?.signal_id,
      lowest_cost: lowestCost?.signal_id,
      highest_specificity: highestSpec?.signal_id,
    },
    method: "pareto_dominance_over_reach_cpm_specificity",
  });
}

// ── /portfolio/info-overlap ──────────────────────────────────────────────────

export async function handleInfoOverlap(request: Request, env: Env, logger: Logger): Promise<Response> {
  let body: { signal_ids?: string[] } = {};
  try { body = await request.json(); } catch {}
  const ids = body.signal_ids ?? [];
  if (ids.length < 2) return errorResponse("INSUFFICIENT_SIGNALS", "Provide at least 2 signal_ids", 400);
  if (ids.length > 10) return errorResponse("TOO_MANY_SIGNALS", "Max 10 signal_ids per request", 400);

  const { summaries } = await loadAllSignals(env, logger);
  const picked = ids
    .map((id) => summaries.find((s) => s.signal_agent_segment_id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map(signalToPortfolioEntry)
    .filter((x): x is PortfolioSignal => x !== null);

  if (picked.length < 2) return errorResponse("SIGNALS_NOT_FOUND", "Fewer than 2 valid signals resolved", 400);

  const result = informationOverlap(picked);
  return jsonResponse({
    ...result,
    method: "synthetic_category_vertical_geo_distribution",
    note: "Distributions synthesized from signal metadata (category × vertical × reach). Jaccard uses category-affinity heuristic.",
  });
}

// ── /portfolio/hit-target ────────────────────────────────────────────────────

export async function handleHitTarget(request: Request, env: Env, logger: Logger): Promise<Response> {
  let body: { target_reach?: number; budget?: number; max_signals?: number; include?: string[]; exclude?: string[] } = {};
  try { body = await request.json(); } catch {}
  if (!body.target_reach || body.target_reach <= 0) return errorResponse("INVALID_TARGET", "target_reach > 0 required", 400);
  const budget = body.budget ?? 1_000_000;
  const maxSignals = Math.max(1, Math.min(20, body.max_signals ?? 10));

  const { summaries } = await loadAllSignals(env, logger);
  const candidates = summaries
    .map(signalToPortfolioEntry)
    .filter((x): x is PortfolioSignal => x !== null && x.reach > 0);

  const result = greedyMarginalReach(
    candidates, budget, maxSignals, body.target_reach, body.include ?? [], body.exclude ?? [],
  );
  return jsonResponse({
    found: result.total_unique_reach >= body.target_reach,
    target_reach: body.target_reach,
    reached: result.total_unique_reach,
    ...result,
  });
}

// ── /portfolio/what-if ───────────────────────────────────────────────────────

export async function handleWhatIf(request: Request, env: Env, logger: Logger): Promise<Response> {
  let body: { current?: string[]; remove?: string[]; add?: string[] } = {};
  try { body = await request.json(); } catch {}
  const current = new Set(body.current ?? []);
  const remove = new Set(body.remove ?? []);
  const add = body.add ?? [];
  if (current.size === 0) return errorResponse("INVALID_INPUT", "current[] required", 400);

  const { summaries } = await loadAllSignals(env, logger);
  const byId = new Map(summaries.map((s) => [s.signal_agent_segment_id, s]));

  function evalSet(ids: Set<string>): { reach: number; cost: number; signals: PortfolioSignal[] } {
    const sigs = [...ids].map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
      .map(signalToPortfolioEntry).filter((x): x is PortfolioSignal => x !== null);
    // Use the same greedy logic for consistency
    const budget = 1e12; // unconstrained to evaluate this exact set
    const res = greedyMarginalReach(sigs, budget, sigs.length, undefined, sigs.map((s) => s.signal_id), []);
    return { reach: res.total_unique_reach, cost: res.total_cost, signals: sigs };
  }

  const before = evalSet(current);
  const afterSet = new Set(current);
  for (const r of remove) afterSet.delete(r);
  for (const a of add) afterSet.add(a);
  const after = evalSet(afterSet);

  const deltaReach = after.reach - before.reach;
  const deltaCost = after.cost - before.cost;
  const recommendation =
    deltaReach > 0 && deltaCost < deltaReach * 0.01 ? "operation_accepted"
    : deltaReach > 0 ? "operation_marginal"
    : "operation_rejected";

  return jsonResponse({
    before: { reach: before.reach, cost: before.cost, signal_count: before.signals.length },
    after: { reach: after.reach, cost: after.cost, signal_count: after.signals.length },
    delta_reach: deltaReach,
    delta_cost: Math.round(deltaCost * 100) / 100,
    delta_reach_per_dollar: deltaCost > 0 ? Math.round(deltaReach / deltaCost) : null,
    recommendation,
    reasoning: `Net ${deltaReach > 0 ? "+" : ""}${deltaReach.toLocaleString()} unique reach at ${deltaCost >= 0 ? "+" : ""}$${Math.round(deltaCost).toLocaleString()}. ${recommendation === "operation_accepted" ? "Recommended." : recommendation === "operation_marginal" ? "Marginal — verify creative alignment." : "Not recommended."}`,
  });
}

// ── /portfolio/from-brief ────────────────────────────────────────────────────

export async function handleFromBrief(request: Request, env: Env, logger: Logger): Promise<Response> {
  let body: { brief?: string; budget?: number; max_signals?: number } = {};
  try { body = await request.json(); } catch {}
  if (!body.brief || body.brief.trim().length === 0) return errorResponse("INVALID_INPUT", "brief required", 400);

  // Vectorize brief → top-K similar embedded signals
  const queryVec = textToPseudoVector(body.brief);
  const topEmbedded = topKCosine(queryVec, SIGNAL_EMBEDDINGS, 30, new Set(), -1);
  const embIds = new Set(topEmbedded.map((t) => t.id));

  // Pull full catalog + filter to matched
  const { summaries } = await loadAllSignals(env, logger);
  const candidates = summaries
    .filter((s) => embIds.has(s.signal_agent_segment_id))
    .map(signalToPortfolioEntry)
    .filter((x): x is PortfolioSignal => x !== null);

  if (candidates.length === 0) {
    // Fallback: use purchase_intent + composite from full summaries
    const fallback = summaries
      .filter((s) => s.category_type === "purchase_intent" || s.category_type === "composite")
      .slice(0, 20)
      .map(signalToPortfolioEntry)
      .filter((x): x is PortfolioSignal => x !== null);
    candidates.push(...fallback);
  }

  const budget = body.budget ?? 250_000;
  const maxSignals = Math.max(1, Math.min(10, body.max_signals ?? 6));
  const result = greedyMarginalReach(candidates, budget, maxSignals);

  // Compute allocation %
  const totalCost = result.total_cost;
  const portfolio = result.picked.map((p, i) => ({
    ...p,
    allocation_pct: totalCost > 0 ? Math.round((p.cost / totalCost) * 1000) / 10 : 0,
    rank: i + 1,
    reasoning: `Cosine-matched to brief (rank ${i + 1}); adds ${p.marginal_reach.toLocaleString()} unique reach at $${p.cost.toFixed(0)}.`,
  }));

  return jsonResponse({
    brief: body.brief,
    budget,
    max_signals: maxSignals,
    portfolio,
    total_cost: totalCost,
    total_unique_reach: result.total_unique_reach,
    candidates_from_embedding: candidates.length,
    method: "brief → text-pseudo-vector → top-K similarity → greedy marginal reach",
  });
}
