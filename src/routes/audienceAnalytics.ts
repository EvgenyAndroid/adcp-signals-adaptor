// src/routes/audienceAnalytics.ts
// Sec-43: Audience Composer + activation-planning analytics.
//
// Three new endpoints layered on top of the existing portfolio +
// embedding stack. All public, all read-only, all return JSON.
//
//   POST /audience/compose        — set ops (∪, ∩, −) + lookalike expand
//   POST /audience/saturation     — frequency saturation curve (Poisson)
//   POST /audience/affinity-audit — over/under-index vs catalog baseline
//
// Math notes:
//
// 1. Set ops over reach (no user-level membership)
//    Catalog signals expose only `estimated_audience_size`. We model
//    pairwise overlap with the same heuristic Jaccard the portfolio
//    optimizer uses (category-affinity × min/max reach), then collapse:
//      union(A, B)  = A + B − overlap(A, B)
//      intersect(A, B) = overlap(A, B)
//      A \ B = A − overlap(A, B)
//    For >2 sets we apply the operation pairwise as a fold. This is
//    approximate but consistent with /signals/overlap and the greedy
//    optimizer — same heuristic, same answer shape.
//
// 2. Frequency saturation
//    Under a Poisson exposure model, the expected fraction of an
//    audience reached after I impressions on population R is
//    1 − exp(−F) where F = I/R. We sample F = 1..15 and report
//    incremental reach + diminishing returns.
//
// 3. Affinity audit
//    Compare the composed audience's category × vertical × geo
//    distribution against the catalog baseline. Over-index = ratio of
//    selection share to baseline share, capped to (-100%, +500%).
//    Same shape as the IAB Audience Profile / Nielsen Affinity Index.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse, readJsonBody } from "./shared";
import { getDb } from "../storage/db";
import { searchSignals } from "../storage/signalRepo";
import { toSignalSummary } from "../mappers/signalMapper";
import type { SignalSummary } from "../types/api";
import { SIGNAL_EMBEDDINGS } from "../domain/embeddingStore";
import { topKCosine } from "../analytics/vectorMath";
import {
  verticalOf,
  geoBand,
  unionReach,
  intersectReach,
  excludeReach,
  saturationCurve,
  saturationKnee,
  shareByKey,
  affinityRows,
  skewScore,
  concentrationOf,
  journeyFunnel,
  inferSensitiveCategories,
  privacyCheck,
  holdoutPlan,
  type AffinityRow,
} from "../analytics/audienceMath";

// ── shared helpers ──────────────────────────────────────────────────────────

async function loadCatalog(env: Env, _logger: Logger): Promise<SignalSummary[]> {
  const db = getDb(env);
  const { signals } = await searchSignals(db, { limit: 1000, offset: 0 });
  return signals.map(toSignalSummary);
}

function indexById(catalog: SignalSummary[]): Map<string, SignalSummary> {
  const m = new Map<string, SignalSummary>();
  for (const s of catalog) m.set(s.signal_agent_segment_id, s);
  return m;
}

// ── POST /audience/compose ──────────────────────────────────────────────────

interface ComposeBody {
  include?: string[];     // union — at least one match
  intersect?: string[];   // intersection — must match all
  exclude?: string[];     // suppression — must NOT match
  lookalike?: { seed_signal_id: string; k?: number; min_cosine?: number };
}

export async function handleAudienceCompose(request: Request, env: Env, logger: Logger): Promise<Response> {
  const parsed = await readJsonBody<ComposeBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: ComposeBody = parsed.kind === "parsed" ? parsed.data : {};

  const include = body.include ?? [];
  const intersect = body.intersect ?? [];
  const exclude = body.exclude ?? [];
  const totalRefs = include.length + intersect.length + exclude.length;
  if (totalRefs === 0 && !body.lookalike) {
    return errorResponse("EMPTY_COMPOSITION", "Provide at least one of: include, intersect, exclude, lookalike", 400);
  }
  if (totalRefs > 20) return errorResponse("TOO_MANY_SIGNALS", `Max 20 signal references; got ${totalRefs}`, 400);

  const catalog = await loadCatalog(env, logger);
  const byId = indexById(catalog);

  function resolve(ids: string[]): { resolved: SignalSummary[]; missing: string[] } {
    const resolved: SignalSummary[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (s) resolved.push(s);
      else missing.push(id);
    }
    return { resolved, missing };
  }
  const inc = resolve(include);
  const itx = resolve(intersect);
  const exc = resolve(exclude);
  const allMissing = [...inc.missing, ...itx.missing, ...exc.missing];
  if (allMissing.length > 0) {
    return errorResponse("UNKNOWN_SIGNALS", `Unknown signal ids: ${allMissing.join(", ")}`, 400);
  }

  // ── Lookalike expand (optional) ───────────────────────────────────────────
  // Embedding cosine over the seed; we surface the top-K as candidates the
  // caller can promote into `include` on a follow-up call. We do NOT auto-add
  // them to the reach math — that would silently inflate the answer.
  let lookalike: null | {
    seed: string;
    k: number;
    min_cosine: number;
    candidates: Array<{ signal_agent_segment_id: string; cosine: number; estimated_audience_size: number; name: string }>;
  } = null;
  if (body.lookalike?.seed_signal_id) {
    const seed = body.lookalike.seed_signal_id;
    if (!SIGNAL_EMBEDDINGS[seed]) {
      return errorResponse("SEED_NOT_EMBEDDED", `Signal ${seed} has no embedding for lookalike expansion`, 400);
    }
    const k = Math.max(1, Math.min(25, body.lookalike.k ?? 10));
    const minCos = typeof body.lookalike.min_cosine === "number" ? body.lookalike.min_cosine : 0.55;
    const seedVec = SIGNAL_EMBEDDINGS[seed]!.vector;
    const exclude = new Set([seed, ...include, ...intersect]);
    const neighbors = topKCosine(seedVec, SIGNAL_EMBEDDINGS, k, exclude, minCos);
    lookalike = {
      seed,
      k,
      min_cosine: minCos,
      candidates: neighbors.map((n) => {
        const s = byId.get(n.id);
        return {
          signal_agent_segment_id: n.id,
          cosine: Math.round(n.cosine * 10000) / 10000,
          estimated_audience_size: s?.estimated_audience_size ?? 0,
          name: s?.name ?? n.id,
        };
      }),
    };
  }

  // ── Reach math (delegated to analytics/audienceMath) ──────────────────────
  const baseSet = inc.resolved.length > 0 ? inc.resolved : itx.resolved;
  const unionR = unionReach(inc.resolved);
  const intersectBase = unionR > 0 ? unionR : (itx.resolved[0]?.estimated_audience_size ?? 0);
  const intersectTpl = baseSet[0] ?? null;
  // When include is empty we already consumed itx[0] as the base — drop it
  // from the fold so we don't double-decay.
  const intersectFold = itx.resolved.length > 0
    ? (unionR > 0 ? itx.resolved : itx.resolved.slice(1))
    : [];
  const afterIntersect = intersectReach(intersectBase, intersectTpl, intersectFold);
  const finalReach = excludeReach(afterIntersect, baseSet, exc.resolved);

  // Naive cost: average CPM across include set, applied to final reach.
  function cpmOf(s: SignalSummary): number {
    const opt = s.pricing_options?.[0];
    if (!opt) return 0;
    if (opt.model === "cpm") return opt.cpm;
    return 0; // flat_fee not amortized here
  }
  const costSet = inc.resolved.length > 0 ? inc.resolved : itx.resolved;
  const avgCpm = costSet.length > 0
    ? costSet.reduce((s, x) => s + cpmOf(x), 0) / costSet.length
    : 0;
  const estimatedCost = Math.round((finalReach * avgCpm / 1000) * 100) / 100;

  // Confidence: shrink as composition complexity grows. Single union = high.
  const complexity = inc.resolved.length + 2 * itx.resolved.length + exc.resolved.length;
  const confidence: "high" | "medium" | "low" =
    complexity <= 2 ? "high" : complexity <= 5 ? "medium" : "low";

  return jsonResponse({
    composition: {
      include: inc.resolved.map((s) => ({ signal_agent_segment_id: s.signal_agent_segment_id, name: s.name, reach: s.estimated_audience_size ?? 0 })),
      intersect: itx.resolved.map((s) => ({ signal_agent_segment_id: s.signal_agent_segment_id, name: s.name, reach: s.estimated_audience_size ?? 0 })),
      exclude: exc.resolved.map((s) => ({ signal_agent_segment_id: s.signal_agent_segment_id, name: s.name, reach: s.estimated_audience_size ?? 0 })),
    },
    lookalike,
    reach: {
      union_only: unionR,
      after_intersect: afterIntersect,
      final: finalReach,
    },
    estimated_cpm: Math.round(avgCpm * 100) / 100,
    estimated_cost_usd: estimatedCost,
    confidence,
    method: "pairwise_inclusion_exclusion_with_category_affinity_jaccard",
    note: "Heuristic — catalog signals expose reach not user-level membership. Lookalike candidates are proposed (not auto-added) to keep the reach math auditable.",
  });
}

// ── POST /audience/saturation ───────────────────────────────────────────────

interface SaturationBody {
  signal_ids?: string[];
  reach?: number;             // override; otherwise computed as union of signal_ids
  cpm?: number;               // override; otherwise averaged from signal_ids
  budget_usd?: number;        // optional — clamps the curve at affordable F
  frequencies?: number[];     // override sampled F values
}

export async function handleAudienceSaturation(request: Request, env: Env, logger: Logger): Promise<Response> {
  const parsed = await readJsonBody<SaturationBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: SaturationBody = parsed.kind === "parsed" ? parsed.data : {};

  let reach = body.reach ?? 0;
  let cpm = body.cpm ?? 0;
  const ids = body.signal_ids ?? [];

  if (reach === 0 && ids.length === 0) {
    return errorResponse("INVALID_INPUT", "Provide reach OR signal_ids[]", 400);
  }

  // Hydrate from catalog if signal_ids supplied.
  let resolved: SignalSummary[] = [];
  if (ids.length > 0) {
    if (ids.length > 15) return errorResponse("TOO_MANY_SIGNALS", `Max 15 signal_ids; got ${ids.length}`, 400);
    const catalog = await loadCatalog(env, logger);
    const byId = indexById(catalog);
    const missing: string[] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (s) resolved.push(s);
      else missing.push(id);
    }
    if (missing.length > 0) return errorResponse("UNKNOWN_SIGNALS", `Unknown signal ids: ${missing.join(", ")}`, 400);

    if (reach === 0) reach = unionReach(resolved);
    if (cpm === 0) {
      const cpms = resolved.map((s) => {
        const opt = s.pricing_options?.[0];
        return opt && opt.model === "cpm" ? opt.cpm : 0;
      }).filter((v) => v > 0);
      cpm = cpms.length > 0 ? cpms.reduce((s, v) => s + v, 0) / cpms.length : 0;
    }
  }

  if (reach <= 0) return errorResponse("INVALID_REACH", "reach must be > 0", 400);

  const frequencies = (body.frequencies && body.frequencies.length > 0)
    ? body.frequencies.filter((f) => f > 0 && f <= 30)
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];

  const curve = saturationCurve(reach, cpm, frequencies);
  const knee = saturationKnee(curve);

  // Affordable cap if budget supplied.
  let affordableF: number | null = null;
  if (typeof body.budget_usd === "number" && body.budget_usd > 0) {
    for (const c of curve) {
      if (c.cost_usd <= body.budget_usd) affordableF = c.frequency;
    }
  }

  return jsonResponse({
    reach_population: reach,
    cpm,
    signals: resolved.map((s) => ({ signal_agent_segment_id: s.signal_agent_segment_id, name: s.name })),
    curve,
    knee_frequency: knee,
    affordable_frequency: affordableF,
    budget_usd: body.budget_usd ?? null,
    method: "poisson_exposure_1_minus_exp_neg_f",
    note: "Assumes random-impression delivery. Real platforms with frequency-cap optimizers reach the knee faster; treat this as an upper bound on diminishing returns.",
  });
}

// ── POST /audience/affinity-audit ───────────────────────────────────────────

interface AffinityBody {
  signal_ids?: string[];
}

export async function handleAffinityAudit(request: Request, env: Env, logger: Logger): Promise<Response> {
  const parsed = await readJsonBody<AffinityBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: AffinityBody = parsed.kind === "parsed" ? parsed.data : {};
  const ids = body.signal_ids ?? [];
  if (ids.length === 0) return errorResponse("INVALID_INPUT", "signal_ids[] required", 400);
  if (ids.length > 20) return errorResponse("TOO_MANY_SIGNALS", `Max 20 signal_ids; got ${ids.length}`, 400);

  const catalog = await loadCatalog(env, logger);
  const byId = indexById(catalog);
  const selection: SignalSummary[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (s) selection.push(s);
    else missing.push(id);
  }
  if (missing.length > 0) return errorResponse("UNKNOWN_SIGNALS", `Unknown signal ids: ${missing.join(", ")}`, 400);

  function audit(facet: string, key: (s: SignalSummary) => string): { facet: string; rows: AffinityRow[]; top_over: AffinityRow | null; top_under: AffinityRow | null } {
    const baseline = shareByKey(catalog, key);
    const sel = shareByKey(selection, key);
    const rows = affinityRows(baseline, sel);
    const ranked = [...rows].filter((r) => r.selection_share > 0).sort((a, b) => b.index - a.index);
    return {
      facet,
      rows,
      top_over: ranked[0] ?? null,
      top_under: ranked[ranked.length - 1] ?? null,
    };
  }

  const facets = [
    audit("category_type", (s) => s.category_type),
    audit("vertical", (s) => verticalOf(s.signal_agent_segment_id)),
    audit("geo_band", (s) => geoBand(s)),
    audit("data_provider", (s) => s.data_provider || "unknown"),
  ];

  const summary = {
    selection_count: selection.length,
    catalog_count: catalog.length,
    skew_scores: facets.reduce<Record<string, number>>((acc, f) => {
      acc[f.facet] = skewScore(f.rows);
      return acc;
    }, {}),
    concentration: facets.reduce<Record<string, number>>((acc, f) => {
      acc[f.facet] = concentrationOf(f.rows);
      return acc;
    }, {}),
  };

  return jsonResponse({
    facets,
    summary,
    method: "reach_weighted_share_then_index_vs_catalog_baseline",
    note: "Index = 100 × (selection_share / catalog_share). 100 = parity, 200 = 2× over-represented, 50 = under-represented. Capped at 600.",
  });
}

// ── POST /audience/journey ──────────────────────────────────────────────────
// Sequential segmentation: each stage supplies its own include/intersect
// /exclude set. We reach-size each stage (reusing /audience/compose math)
// then compute funnel conversion + drop-off.

interface JourneyStageBody {
  name?: string;
  include?: string[];
  intersect?: string[];
  exclude?: string[];
}

interface JourneyBody {
  stages?: JourneyStageBody[];
  cumulative?: boolean;   // Sec-46: default true — each stage is a subset of the prior
}

export async function handleAudienceJourney(request: Request, env: Env, logger: Logger): Promise<Response> {
  const parsed = await readJsonBody<JourneyBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: JourneyBody = parsed.kind === "parsed" ? parsed.data : {};
  const stages = body.stages ?? [];
  // Sec-46: cumulative mode (default) makes each stage a subset of the prior stage by
  // folding the prior stage's signals into the current stage's intersect pool. Opt-out
  // (`cumulative:false`) preserves the legacy "independent stages + monotone clamp" math.
  const cumulative = body.cumulative !== false;
  if (stages.length < 2) return errorResponse("INVALID_INPUT", "At least 2 stages required", 400);
  if (stages.length > 6) return errorResponse("TOO_MANY_STAGES", `Max 6 stages; got ${stages.length}`, 400);

  const catalog = await loadCatalog(env, logger);
  const byId = indexById(catalog);

  const stageReaches: { name: string; reach: number; includeCount: number; intersectCount: number; excludeCount: number }[] = [];
  const priorFilterPool: SignalSummary[] = [];  // cumulative-mode accumulator
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]!;
    const inc = (st.include ?? []).map((id) => byId.get(id)).filter((x): x is SignalSummary => !!x);
    const itxRaw = (st.intersect ?? []).map((id) => byId.get(id)).filter((x): x is SignalSummary => !!x);
    const exc = (st.exclude ?? []).map((id) => byId.get(id)).filter((x): x is SignalSummary => !!x);
    if (inc.length === 0 && itxRaw.length === 0) {
      return errorResponse("INVALID_STAGE", `Stage ${i} (${st.name ?? "unnamed"}) needs at least one include or intersect signal`, 400);
    }
    // Cumulative mode: prior stages' signals become implicit intersects on this stage,
    // which geometrically narrows reach (inclusion-exclusion monotone). We dedupe against
    // the current stage's raw itx to avoid double-counting.
    const seenItxIds = new Set(itxRaw.map((s) => s.signal_agent_segment_id));
    const itx = cumulative && i > 0
      ? [...itxRaw, ...priorFilterPool.filter((s) => !seenItxIds.has(s.signal_agent_segment_id))]
      : itxRaw;
    const baseSet = inc.length > 0 ? inc : itx;
    const unionR = unionReach(inc);
    const intersectBase = unionR > 0 ? unionR : (itx[0]?.estimated_audience_size ?? 0);
    const intersectFold = itx.length > 0 ? (unionR > 0 ? itx : itx.slice(1)) : [];
    const afterIntersect = intersectReach(intersectBase, baseSet[0] ?? null, intersectFold);
    const finalR = excludeReach(afterIntersect, baseSet, exc);
    stageReaches.push({
      name: st.name ?? `stage_${i + 1}`,
      reach: finalR,
      includeCount: inc.length,
      intersectCount: itxRaw.length,   // surface user-declared count, not cumulative-augmented
      excludeCount: exc.length,
    });
    // Accumulate this stage's own signals for downstream stages.
    for (const s of inc) priorFilterPool.push(s);
    for (const s of itxRaw) priorFilterPool.push(s);
  }

  const funnel = journeyFunnel(stageReaches.map((s) => ({ name: s.name, reach: s.reach })));
  const anyClamped = funnel.some((f) => f.clamped);

  return jsonResponse({
    stages: funnel.map((f, i) => ({
      ...f,
      include_count: stageReaches[i]!.includeCount,
      intersect_count: stageReaches[i]!.intersectCount,
      exclude_count: stageReaches[i]!.excludeCount,
    })),
    overall: {
      top_of_funnel: funnel[0]?.reach ?? 0,
      bottom_of_funnel: funnel[funnel.length - 1]?.reach ?? 0,
      end_to_end_conversion: funnel[funnel.length - 1]?.cumulative_rate ?? 0,
      biggest_dropoff_stage: funnel
        .map((f, i) => ({ i, name: f.name, dropped: f.dropped_off }))
        .sort((a, b) => b.dropped - a.dropped)[0]?.name ?? null,
      any_clamped: anyClamped,
    },
    mode: cumulative ? "cumulative" : "independent",
    method: cumulative
      ? "prior_stage_signals_folded_as_intersects_then_monotone_safety_clamp"
      : "per_stage_compose_then_monotone_funnel",
    note: cumulative
      ? "Cumulative mode (default): each stage is constructed as a subset of the prior stage — upstream signals are automatically folded into the current stage's intersect pool. Clamping should be rare and indicates a non-monotone heuristic edge case. Set `cumulative:false` to get independent per-stage sizing with after-the-fact monotone clamping (the legacy behavior)."
      : "Independent-stage mode: each stage is sized on its own, then reaches are clamped to be monotonically non-increasing. A `clamped:true` flag signals that the stage's raw composition breached the subset invariant — planners should treat any clamp as a configuration error (the stage is broader than its parent), not a genuine funnel.",
  });
}

// ── POST /audience/privacy-check ────────────────────────────────────────────

interface PrivacyBody {
  signal_ids?: string[];
  cohort_size?: number;     // optional override
  min_k?: number;           // default 1000
}

export async function handleAudiencePrivacyCheck(request: Request, env: Env, logger: Logger): Promise<Response> {
  const parsed = await readJsonBody<PrivacyBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: PrivacyBody = parsed.kind === "parsed" ? parsed.data : {};
  const ids = body.signal_ids ?? [];
  if (ids.length === 0 && typeof body.cohort_size !== "number") {
    return errorResponse("INVALID_INPUT", "Provide signal_ids[] or cohort_size", 400);
  }
  if (ids.length > 20) return errorResponse("TOO_MANY_SIGNALS", `Max 20 signal_ids; got ${ids.length}`, 400);

  let cohortSize = body.cohort_size ?? 0;
  let sensitiveTokens: string[] = [];

  if (ids.length > 0) {
    const catalog = await loadCatalog(env, logger);
    const byId = indexById(catalog);
    const resolved: SignalSummary[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (s) resolved.push(s);
      else missing.push(id);
    }
    if (missing.length > 0) return errorResponse("UNKNOWN_SIGNALS", `Unknown signal ids: ${missing.join(", ")}`, 400);
    if (cohortSize === 0) cohortSize = unionReach(resolved);
    sensitiveTokens = inferSensitiveCategories(resolved.map((s) => ({ name: s.name, description: s.description })));
  }

  const result = privacyCheck(cohortSize, sensitiveTokens, body.min_k ?? 1000);
  return jsonResponse({
    ...result,
    note: "k-anonymity floor defaults to 1000 per common GDPR/CCPA cohort conventions. Sensitive-category inference uses keyword matches on signal name + description; override via `min_k` for stricter thresholds.",
  });
}

// ── POST /audience/holdout ──────────────────────────────────────────────────

interface HoldoutBody {
  signal_ids?: string[];
  reach?: number;
  holdout_pct?: number;
  baseline_conversion_rate?: number;
  power?: number;
  alpha?: number;
}

export async function handleAudienceHoldout(request: Request, env: Env, logger: Logger): Promise<Response> {
  const parsed = await readJsonBody<HoldoutBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: HoldoutBody = parsed.kind === "parsed" ? parsed.data : {};

  let reach = body.reach ?? 0;
  const ids = body.signal_ids ?? [];
  if (reach === 0 && ids.length === 0) return errorResponse("INVALID_INPUT", "Provide reach or signal_ids[]", 400);
  if (ids.length > 0) {
    const catalog = await loadCatalog(env, logger);
    const byId = indexById(catalog);
    const resolved: SignalSummary[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (s) resolved.push(s);
      else missing.push(id);
    }
    if (missing.length > 0) return errorResponse("UNKNOWN_SIGNALS", `Unknown signal ids: ${missing.join(", ")}`, 400);
    if (reach === 0) reach = unionReach(resolved);
  }
  if (reach <= 0) return errorResponse("INVALID_REACH", "reach must be > 0", 400);

  const plan = holdoutPlan(
    reach,
    typeof body.holdout_pct === "number" ? body.holdout_pct : 0.10,
    typeof body.baseline_conversion_rate === "number" ? body.baseline_conversion_rate : 0.02,
    typeof body.power === "number" ? body.power : 0.80,
    typeof body.alpha === "number" ? body.alpha : 0.05,
  );
  return jsonResponse({
    ...plan,
    note: "MDE is the smallest lift the experiment can reliably detect. To detect smaller lifts, either grow total reach, raise the baseline conversion rate assumption, relax alpha, or reduce required power.",
  });
}
