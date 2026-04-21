/**
 * src/routes/ucpProjection.ts
 *
 * Sec-38 B5: 2D projection of the UCP embedding space for visualization.
 *
 * Returns all 26 real signal vectors projected to 2 dimensions so the
 * demo UI can render a scatter plot showing semantic neighborhoods.
 *
 * Algorithm: deterministic random projection (Johnson-Lindenstrauss).
 * We draw two fixed 512-dim unit vectors from a seeded PRNG and dot each
 * signal vector against them to get (x, y). JL guarantees approximate
 * distance preservation — not as tight as PCA but:
 *   • computable in <10ms in the Worker
 *   • fully deterministic (fixed seed)
 *   • needs no SVD / eigen library
 *
 * For a demo surface this is good enough to show clustering structure.
 * The axes are labeled "UCP₁", "UCP₂" to avoid implying they are PC1/PC2.
 *
 * Public endpoint — no auth required.
 *
 * GET /ucp/projection
 * Response shape:
 * {
 *   space_id:  "openai-te3-small-d512-v1",
 *   method:    "random_projection_jl",
 *   dimensions_in: 512,
 *   dimensions_out: 2,
 *   signed_at: ISO string,
 *   points: [
 *     { signal_id, name, category, x, y, norm }
 *   ],
 * }
 *
 * Also supports GET /ucp/similarity?n=20 — returns a 20×20 pairwise
 * cosine similarity matrix over a deterministic sample for the heatmap
 * visualization.
 */

import { SIGNAL_EMBEDDINGS } from "../domain/embeddingStore";
import { jsonResponse } from "./shared";

// Seeded xorshift32 PRNG — fully deterministic for a fixed seed.
function makeRng(seed: number) {
  let state = seed >>> 0;
  if (state === 0) state = 0xdeadbeef;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0;
    // map to [-1, 1]
    return (state / 0xffffffff) * 2 - 1;
  };
}

function randomUnitVector(dim: number, seed: number): number[] {
  const rng = makeRng(seed);
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) vec.push(rng());
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

// Infer category from signal_id prefix. The 26 seed signals use
// readable slug prefixes that map to category types used elsewhere.
function inferCategory(signalId: string): string {
  if (signalId.startsWith("sig_age_")) return "demographic";
  if (signalId.startsWith("sig_high_income") || signalId.includes("_income")) return "demographic";
  if (signalId.includes("_college") || signalId.includes("_graduate") || signalId.includes("_educated")) return "demographic";
  if (signalId.includes("_acs_")) return "demographic";
  if (signalId.includes("stream") || signalId.includes("drama") || signalId.includes("viewer")) return "interest";
  if (signalId.includes("intent") || signalId.includes("purchase")) return "purchase_intent";
  if (signalId.includes("geo") || signalId.includes("dma")) return "geo";
  return "interest";
}

// Humanize "sig_age_18_24" → "Age 18-24"
function humanize(signalId: string): string {
  return signalId
    .replace(/^sig_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ProjectionPoint {
  signal_id: string;
  name: string;
  category: string;
  description: string;
  x: number;
  y: number;
  norm: number;
}

export function handleUcpProjection(): Response {
  const DIM = 512;
  const axisX = randomUnitVector(DIM, 0xabcdef01);
  const axisY = randomUnitVector(DIM, 0x12345678);

  const points: ProjectionPoint[] = [];
  for (const [signalId, entry] of Object.entries(SIGNAL_EMBEDDINGS)) {
    const x = dot(entry.vector, axisX);
    const y = dot(entry.vector, axisY);
    const n = Math.sqrt(entry.vector.reduce((s, v) => s + v * v, 0));
    points.push({
      signal_id: signalId,
      name: humanize(signalId),
      category: inferCategory(signalId),
      description: entry.description,
      x,
      y,
      norm: n,
    });
  }

  return jsonResponse({
    space_id: "openai-te3-small-d512-v1",
    method: "random_projection_jl",
    dimensions_in: DIM,
    dimensions_out: 2,
    signed_at: new Date().toISOString(),
    seed_x: "0xabcdef01",
    seed_y: "0x12345678",
    point_count: points.length,
    points,
  });
}

/**
 * GET /ucp/similarity — pairwise cosine similarity matrix over a
 * deterministic sample of the embedding store.
 *
 * Query: ?n=20  (clamped to [2, 26])
 *
 * Used by the UI similarity heatmap. Returns signal_ids in order
 * plus a flattened row-major matrix (length n*n).
 */
export function handleUcpSimilarity(url: URL): Response {
  const nRaw = Number(url.searchParams.get("n") ?? 20);
  const n = Math.max(2, Math.min(26, Number.isFinite(nRaw) ? Math.floor(nRaw) : 20));

  const allIds = Object.keys(SIGNAL_EMBEDDINGS);
  const sampledIds = allIds.slice(0, n);

  // Fetch vectors + normalise (they should already be L2 but the stored
  // vectors are pre-normalised so cos(a,b) = a·b).
  const vectors = sampledIds
    .map((id) => SIGNAL_EMBEDDINGS[id]?.vector)
    .filter((v): v is number[] => Array.isArray(v));

  const matrix: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = 0; j < vectors.length; j++) {
      const vi = vectors[i];
      const vj = vectors[j];
      if (!vi || !vj) { matrix.push(0); continue; }
      matrix.push(Math.max(-1, Math.min(1, dot(vi, vj))));
    }
  }

  return jsonResponse({
    space_id: "openai-te3-small-d512-v1",
    metric: "cosine",
    n,
    signal_ids: sampledIds,
    signal_names: sampledIds.map(humanize),
    matrix,
  });
}
