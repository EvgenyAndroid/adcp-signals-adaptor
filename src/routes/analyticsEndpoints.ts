// src/routes/analyticsEndpoints.ts
// Sec-41: core analytics endpoints for the Embedding Lab + Portfolio.
//
// Endpoints implemented here:
//   POST /ucp/query-vector     — custom similarity (text or vector input)
//   POST /ucp/arithmetic       — semantic arithmetic (plus/minus terms)
//   POST /ucp/analogy          — A:B::C:? analogy
//   POST /ucp/neighborhood     — k-NN + local density for a signal
//   GET  /analytics/coverage-gaps
//   GET  /analytics/lorenz?group=vertical
//   GET  /analytics/summary
//   GET  /analytics/knn-graph
//   GET  /analytics/seasonality?signal_id=X
//   GET  /analytics/best-for?window=Q3
//   POST /portfolio/optimize
//
// All endpoints public (read-only analytics), all return JSON. See
// docs/EMBEDDING_LAB_SPEC.md + docs/AUDIENCE_STATISTICS_SPEC.md for
// methodology.

import { SIGNAL_EMBEDDINGS } from "../domain/embeddingStore";
import { jsonResponse, errorResponse } from "./shared";
import {
  l2Normalize,
  textToPseudoVector,
  topKCosine,
  add,
  sub,
  scale,
  centroid,
  analogy3CosAdd,
  analogy3CosMulScore,
  dot,
} from "../analytics/vectorMath";

// Shape of the body we accept for query-vector:
interface QueryVectorBody {
  mode?: "text" | "vector";
  text?: string;
  vector?: number[];
  k?: number;
  min_cosine?: number;
  exclude?: string[];
}

// Readable label from a signal id (best-effort humanization)
function humanize(id: string): string {
  return id.replace(/^sig_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function categoryFrom(id: string): string {
  if (id.startsWith("sig_age_") || id.includes("income") || id.includes("educated") || id.includes("household") || id.includes("acs_")) return "demographic";
  if (id.includes("stream") || id.includes("drama") || id.includes("viewer") || id.includes("affinity")) return "interest";
  if (id.includes("intent") || id.includes("purchase") || id.includes("rmn_") || id.includes("venue_")) return "purchase_intent";
  if (id.includes("geo") || id.includes("dma") || id.includes("weather")) return "geo";
  return "interest";
}

// ── POST /ucp/query-vector ───────────────────────────────────────────────────

export async function handleQueryVector(request: Request): Promise<Response> {
  let body: QueryVectorBody;
  try { body = (await request.json()) as QueryVectorBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }

  const mode = body.mode ?? (body.vector ? "vector" : "text");
  let q: number[];
  let source: string;

  if (mode === "vector") {
    if (!Array.isArray(body.vector)) return errorResponse("INVALID_INPUT", "mode=vector requires `vector: number[]`", 400);
    if (body.vector.length !== 512) return errorResponse("DIMENSION_MISMATCH", `Expected 512-d vector, got ${body.vector.length}`, 400);
    q = l2Normalize(body.vector);
    source = "caller_provided_vector";
  } else {
    if (!body.text || body.text.trim().length === 0) return errorResponse("INVALID_INPUT", "mode=text requires non-empty `text`", 400);
    q = textToPseudoVector(body.text);
    source = "pseudo_hash_from_text";
  }

  const k = Math.max(1, Math.min(50, body.k ?? 10));
  const minCos = typeof body.min_cosine === "number" ? body.min_cosine : -1;
  const exclude = new Set(body.exclude ?? []);

  const top = topKCosine(q, SIGNAL_EMBEDDINGS, k, exclude, minCos);
  const results = top.map((r) => ({
    signal_agent_segment_id: r.id,
    name: humanize(r.id),
    description: SIGNAL_EMBEDDINGS[r.id]?.description ?? "",
    category_type: categoryFrom(r.id),
    cosine: Math.round(r.cosine * 10000) / 10000,
  }));

  return jsonResponse({
    space_id: "openai-te3-small-d512-v1",
    query_vector_source: source,
    query_vector_norm: 1.0,
    mode,
    k,
    min_cosine: minCos,
    result_count: results.length,
    results,
    method: "cosine_over_openai_te3_small_512",
    note: mode === "text"
      ? "Text mode pseudo-vectorizes via deterministic djb2 hash. For real-LLM-quality queries, generate an OpenAI text-embedding-3-small vector client-side and POST with mode='vector'."
      : "Vector mode: caller-provided vector L2-normalized and scored against all 26 embedded signals.",
  });
}

// ── POST /ucp/arithmetic ─────────────────────────────────────────────────────

interface ArithmeticBody {
  base?: string;
  plus?: string[];
  minus?: string[];
  weights?: Record<string, number>;
  k?: number;
}

export async function handleArithmetic(request: Request): Promise<Response> {
  let body: ArithmeticBody;
  try { body = (await request.json()) as ArithmeticBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }

  const plus = body.plus ?? [];
  const minus = body.minus ?? [];
  const weights = body.weights ?? {};

  if (!body.base && plus.length === 0 && minus.length === 0) {
    return errorResponse("EMPTY_EXPRESSION", "Provide at least one of: base, plus, minus", 400);
  }

  const termCount = (body.base ? 1 : 0) + plus.length + minus.length;
  if (termCount > 6) return errorResponse("TOO_MANY_TERMS", `Max 6 terms; got ${termCount}`, 400);

  function clip(w: number): number { return Math.max(0, Math.min(2, w)); }
  function getVec(id: string): number[] | null {
    return SIGNAL_EMBEDDINGS[id]?.vector ?? null;
  }

  let q = new Array(512).fill(0);
  const missing: string[] = [];
  const exprParts: string[] = [];
  const excludeIds = new Set<string>();

  if (body.base) {
    const v = getVec(body.base);
    if (!v) missing.push(body.base);
    else {
      const w = clip(weights[body.base] ?? 1);
      q = add(q, scale(v, w));
      exprParts.push(`${w} × ${body.base}`);
      excludeIds.add(body.base);
    }
  }
  for (const id of plus) {
    const v = getVec(id);
    if (!v) { missing.push(id); continue; }
    const w = clip(weights[id] ?? 1);
    q = add(q, scale(v, w));
    exprParts.push(`+ ${w} × ${id}`);
    excludeIds.add(id);
  }
  for (const id of minus) {
    const v = getVec(id);
    if (!v) { missing.push(id); continue; }
    const w = clip(weights[id] ?? 1);
    q = sub(q, scale(v, w));
    exprParts.push(`− ${w} × ${id}`);
    excludeIds.add(id);
  }

  if (missing.length > 0) return errorResponse("UNKNOWN_SIGNALS", `Unknown signal ids: ${missing.join(", ")}`, 400);

  const preNormNorm = Math.sqrt(q.reduce((s, v) => s + v * v, 0));
  const qN = l2Normalize(q);
  const k = Math.max(1, Math.min(50, body.k ?? 10));
  const top = topKCosine(qN, SIGNAL_EMBEDDINGS, k, excludeIds);
  const results = top.map((r) => ({
    signal_agent_segment_id: r.id,
    name: humanize(r.id),
    cosine: Math.round(r.cosine * 10000) / 10000,
  }));

  return jsonResponse({
    expression: exprParts.join(" ").trim(),
    composed_vector_norm_before_normalize: Math.round(preNormNorm * 1000) / 1000,
    k,
    result_count: results.length,
    results,
    method: "weighted_sum_l2_normalized",
    note: "Expression evaluated as weighted sum then L2-normalized. Input signals excluded from results to prevent self-match.",
  });
}

// ── POST /ucp/analogy ────────────────────────────────────────────────────────

interface AnalogyBody {
  a: string;
  b: string;
  c: string;
  k?: number;
  algorithm?: "3cos_add" | "3cos_mul";
}

export async function handleAnalogy(request: Request): Promise<Response> {
  let body: AnalogyBody;
  try { body = (await request.json()) as AnalogyBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }

  if (!body.a || !body.b || !body.c) return errorResponse("INVALID_INPUT", "a, b, c all required", 400);
  if (body.a === body.b || body.a === body.c || body.b === body.c) return errorResponse("DEGENERATE_ANALOGY", "a, b, c must be distinct", 400);

  const vA = SIGNAL_EMBEDDINGS[body.a]?.vector;
  const vB = SIGNAL_EMBEDDINGS[body.b]?.vector;
  const vC = SIGNAL_EMBEDDINGS[body.c]?.vector;
  if (!vA || !vB || !vC) return errorResponse("UNKNOWN_SIGNALS", "a, b, or c not in embedding store", 404);

  const k = Math.max(1, Math.min(20, body.k ?? 10));
  const algorithm = body.algorithm ?? "3cos_add";
  const exclude = new Set([body.a, body.b, body.c]);

  let results: Array<{ id: string; cosine: number }> = [];
  if (algorithm === "3cos_add") {
    const target = analogy3CosAdd(vA, vB, vC);
    results = topKCosine(target, SIGNAL_EMBEDDINGS, k, exclude);
  } else {
    const scored: Array<{ id: string; cosine: number }> = [];
    for (const [id, entry] of Object.entries(SIGNAL_EMBEDDINGS)) {
      if (exclude.has(id)) continue;
      scored.push({ id, cosine: analogy3CosMulScore(vA, vB, vC, entry.vector) });
    }
    scored.sort((a, b) => b.cosine - a.cosine);
    results = scored.slice(0, k);
  }

  return jsonResponse({
    analogy: `${body.a} : ${body.b} :: ${body.c} : ?`,
    algorithm,
    k,
    results: results.map((r) => ({
      signal_agent_segment_id: r.id,
      name: humanize(r.id),
      cosine_or_score: Math.round(r.cosine * 10000) / 10000,
    })),
    note: algorithm === "3cos_add"
      ? "3CosAdd: target = normalize(B − A + C); rank by cosine."
      : "3CosMul (Levy & Goldberg 2014): rank by (cos(x,B)+1) × (cos(x,C)+1) / (cos(x,A)+ε+1).",
  });
}

// ── POST /ucp/neighborhood ───────────────────────────────────────────────────

export async function handleNeighborhood(request: Request): Promise<Response> {
  let body: { signal_id?: string; k?: number };
  try { body = await request.json(); }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }

  if (!body.signal_id) return errorResponse("INVALID_INPUT", "signal_id required", 400);
  const self = SIGNAL_EMBEDDINGS[body.signal_id];
  if (!self) return errorResponse("NOT_FOUND", `Signal ${body.signal_id} not in embedding store`, 404);

  const k = Math.max(1, Math.min(50, body.k ?? 10));
  const neighbors = topKCosine(self.vector, SIGNAL_EMBEDDINGS, k, new Set([body.signal_id]));

  // Local density = mean cosine to neighbors
  const meanCos = neighbors.length > 0 ? neighbors.reduce((s, n) => s + n.cosine, 0) / neighbors.length : 0;

  // Distance to overall catalog centroid
  const allVectors = Object.values(SIGNAL_EMBEDDINGS).map((e) => e.vector);
  const cat = centroid(allVectors);
  const distToCentroid = 1 - dot(self.vector, cat);

  return jsonResponse({
    signal_id: body.signal_id,
    k,
    neighbors: neighbors.map((n) => ({
      signal_agent_segment_id: n.id,
      name: humanize(n.id),
      cosine: Math.round(n.cosine * 10000) / 10000,
      category: categoryFrom(n.id),
    })),
    local_density: Math.round(meanCos * 1000) / 1000,
    catalog_centroid_distance: Math.round(distToCentroid * 1000) / 1000,
    is_prototypical: distToCentroid < 0.35,
    method: "cosine_k_nearest_neighbors",
  });
}

// ── GET /analytics/coverage-gaps ─────────────────────────────────────────────

export async function handleCoverageGaps(): Promise<Response> {
  // Project all vectors to 2D via JL, then partition into a grid and
  // compute per-cell density. Cells with low density = "gaps".
  const { jlAxes } = await import("../analytics/vectorMath");
  const [ax, ay] = jlAxes();
  const points = Object.entries(SIGNAL_EMBEDDINGS).map(([id, entry]) => ({
    id,
    x: dot(entry.vector, ax),
    y: dot(entry.vector, ay),
  }));
  if (points.length === 0) return jsonResponse({ cells: [], summary: {} });

  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const GRID = 12;
  const cellW = (xMax - xMin) / GRID || 1;
  const cellH = (yMax - yMin) / GRID || 1;

  // Count points per cell
  const counts: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  for (const p of points) {
    const c = Math.min(GRID - 1, Math.floor((p.x - xMin) / cellW));
    const r = Math.min(GRID - 1, Math.floor((p.y - yMin) / cellH));
    counts[r]![c]!++;
  }

  // Density 0-1
  const allCounts = counts.flat();
  const maxCount = Math.max(...allCounts, 1);
  const densities: number[][] = counts.map((row) => row.map((c) => c / maxCount));

  // Compute median non-zero density for gap threshold
  const nonZero = allCounts.filter((c) => c > 0).sort((a, b) => a - b);
  const medianCount = nonZero.length > 0 ? (nonZero[Math.floor(nonZero.length / 2)] ?? 1) : 1;

  // Nearest-concept hint per gap cell
  const gapCells: Array<{
    row: number; col: number; density: number; gap_score: number; nearest_signals: string[];
  }> = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const density = densities[r]![c]!;
      if (counts[r]![c]! >= medianCount) continue;
      const cellX = xMin + (c + 0.5) * cellW;
      const cellY = yMin + (r + 0.5) * cellH;
      const nearest = points
        .map((p) => ({ id: p.id, d: Math.hypot(p.x - cellX, p.y - cellY) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((p) => p.id);
      gapCells.push({
        row: r, col: c,
        density: Math.round(density * 1000) / 1000,
        gap_score: Math.round((1 - density) * 1000) / 1000,
        nearest_signals: nearest,
      });
    }
  }

  const totalCells = GRID * GRID;
  const filledCells = allCounts.filter((c) => c > 0).length;
  const coverageScore = filledCells / totalCells;

  return jsonResponse({
    grid_w: GRID,
    grid_h: GRID,
    bounds: { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax },
    cells_with_points: counts.flatMap((row, r) =>
      row.map((count, c) => ({ row: r, col: c, count, density: Math.round((count / maxCount) * 1000) / 1000 })),
    ).filter((c) => c.count > 0),
    gap_cells: gapCells.sort((a, b) => b.gap_score - a.gap_score).slice(0, 20),
    summary: {
      total_points: points.length,
      total_cells: totalCells,
      filled_cells: filledCells,
      empty_cells: totalCells - filledCells,
      coverage_score: Math.round(coverageScore * 1000) / 1000,
      median_count_per_filled_cell: medianCount,
    },
    method: "jl_2d_projection_then_12x12_grid_density",
    note: "Gap cells are 12×12 grid cells with below-median point count. Nearest-signals hint suggests the concept region needing coverage.",
  });
}

// ── GET /analytics/summary ───────────────────────────────────────────────────

export async function handleAnalyticsSummary(): Promise<Response> {
  return jsonResponse({
    embedding: {
      space_id: "openai-te3-small-d512-v1",
      model: "text-embedding-3-small",
      dimensions: 512,
      embedded_signal_count: Object.keys(SIGNAL_EMBEDDINGS).length,
    },
    catalog_facets_enabled: [
      "cross_taxonomy (9 systems)",
      "x_analytics.seasonality",
      "x_analytics.authority_score",
      "x_analytics.volatility_index",
      "x_analytics.decay_half_life",
      "x_analytics.id_stability_class",
    ],
    analytics_endpoints: [
      "POST /ucp/query-vector",
      "POST /ucp/arithmetic",
      "POST /ucp/analogy",
      "POST /ucp/neighborhood",
      "GET /ucp/projection",
      "GET /ucp/similarity",
      "GET /analytics/coverage-gaps",
      "GET /analytics/lorenz",
      "GET /analytics/knn-graph",
      "POST /portfolio/optimize",
      "POST /audience/compose",
      "POST /audience/saturation",
      "POST /audience/affinity-audit",
    ],
  });
}
