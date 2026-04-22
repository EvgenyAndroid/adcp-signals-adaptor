// src/analytics/vectorMath.ts
// Sec-41: shared vector math helpers for the Embedding Lab endpoints.
// Pure functions, no external deps, deterministic. All vectors are
// assumed L2-normalized where indicated.

const DIM = 512;

export function zeros(n: number = DIM): number[] {
  return new Array(n).fill(0);
}

export function add(a: number[], b: number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

export function sub(a: number[], b: number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}

export function scale(v: number[], s: number): number[] {
  return v.map((x) => x * s);
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export function norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

export function l2Normalize(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v.slice();
  return v.map((x) => x / n);
}

// djb2 hash — deterministic text → seed
export function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic pseudo-embedding from arbitrary text. Same algorithm as
 * getEmbedding's fallback so text queries live in the same space as
 * pseudo-vector signals. Note: not a real OpenAI embedding — for demo
 * pure-semantic queries, callers should POST a real vector instead.
 */
export function textToPseudoVector(text: string, dim: number = DIM): number[] {
  const seed = djb2(text.toLowerCase().trim());
  const v = new Array(dim);
  let rng = seed >>> 0;
  for (let i = 0; i < dim; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    v[i] = (rng / 0xffffffff) * 2 - 1;
  }
  return l2Normalize(v);
}

/**
 * Top-K cosine similarity against a registry of vectors.
 * @param query — query vector (already L2-normalized)
 * @param registry — map of id → vector (each L2-normalized)
 * @param k — max results
 * @param excludeIds — ids to skip (self-match exclusion for analogies)
 * @param minCosine — cut off below this
 */
export function topKCosine(
  query: number[],
  registry: Record<string, { vector: number[] }>,
  k: number,
  excludeIds: Set<string> = new Set(),
  minCosine: number = -1,
): Array<{ id: string; cosine: number }> {
  const results: Array<{ id: string; cosine: number }> = [];
  for (const [id, entry] of Object.entries(registry)) {
    if (excludeIds.has(id)) continue;
    const cos = dot(query, entry.vector);
    if (cos >= minCosine) results.push({ id, cosine: cos });
  }
  results.sort((a, b) => b.cosine - a.cosine);
  return results.slice(0, k);
}

/**
 * Compute a centroid from a list of vectors. Returns L2-normalized result.
 */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return zeros();
  const c = zeros(vectors[0]!.length);
  for (const v of vectors) {
    for (let i = 0; i < c.length; i++) {
      const ci = c[i] ?? 0;
      c[i] = ci + (v[i] ?? 0);
    }
  }
  for (let i = 0; i < c.length; i++) {
    const ci = c[i] ?? 0;
    c[i] = ci / vectors.length;
  }
  return l2Normalize(c);
}

/**
 * 3CosAdd analogy: target = normalize(B - A + C).
 */
export function analogy3CosAdd(
  a: number[],
  b: number[],
  c: number[],
): number[] {
  const target = add(sub(b, a), c);
  return l2Normalize(target);
}

/**
 * 3CosMul analogy (Levy & Goldberg 2014). Returns a scoring function
 * that callers apply to each candidate x.
 */
export function analogy3CosMulScore(
  a: number[],
  b: number[],
  c: number[],
  x: number[],
  eps: number = 1e-3,
): number {
  const cosXB = dot(x, b);
  const cosXC = dot(x, c);
  const cosXA = dot(x, a);
  return ((cosXB + 1) * (cosXC + 1)) / (cosXA + eps + 1);
}

/**
 * Compute a JL 2D projection pair of seed vectors so callers can batch-
 * project many vectors into a shared 2D frame. Returns [axisX, axisY].
 */
export function jlAxes(dim: number = DIM, seedX: number = 0xabcdef01, seedY: number = 0x12345678): [number[], number[]] {
  function seededVec(seed: number): number[] {
    let rng = seed >>> 0;
    const v = new Array(dim);
    for (let i = 0; i < dim; i++) {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      v[i] = (rng / 0xffffffff) * 2 - 1;
    }
    return l2Normalize(v);
  }
  return [seededVec(seedX), seededVec(seedY)];
}

/**
 * UMAP-local refinement on 2D points. Given initial 2D positions and a
 * reference to the higher-D vectors, iterate to pull k-nearest neighbors
 * closer and push far points apart.
 */
export function umapLocalRefine(
  points2D: Array<{ id: string; x: number; y: number }>,
  hiDim: Record<string, number[]>,
  k: number = 5,
  iterations: number = 15,
  stepSize: number = 0.1,
): Array<{ id: string; x: number; y: number }> {
  // Precompute k-NN per point in high-D space
  const knn = new Map<string, Array<{ id: string; cos: number }>>();
  const ids = points2D.map((p) => p.id);
  for (const id of ids) {
    const q = hiDim[id];
    if (!q) continue;
    const neighbors: Array<{ id: string; cos: number }> = [];
    for (const other of ids) {
      if (other === id) continue;
      const v = hiDim[other];
      if (!v) continue;
      neighbors.push({ id: other, cos: dot(q, v) });
    }
    neighbors.sort((a, b) => b.cos - a.cos);
    knn.set(id, neighbors.slice(0, k));
  }
  // Iterative refinement
  const pts = points2D.map((p) => ({ ...p }));
  const idx = new Map<string, number>();
  pts.forEach((p, i) => idx.set(p.id, i));

  for (let iter = 0; iter < iterations; iter++) {
    const forces: Array<{ fx: number; fy: number }> = pts.map(() => ({ fx: 0, fy: 0 }));
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      // Attract to k-NN
      const neighbors = knn.get(p.id) ?? [];
      for (const n of neighbors) {
        const j = idx.get(n.id);
        if (j === undefined) continue;
        const q = pts[j]!;
        const dx = q.x - p.x, dy = q.y - p.y;
        const pull = (n.cos + 1) * 0.5;  // 0..1
        forces[i]!.fx += dx * pull * 0.2;
        forces[i]!.fy += dy * pull * 0.2;
      }
      // Repel random far points
      for (let sample = 0; sample < 5; sample++) {
        const j = Math.floor(((djb2(p.id + iter + sample)) >>> 0) % pts.length);
        if (j === i) continue;
        const q = pts[j]!;
        const dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy + 0.01;
        forces[i]!.fx += (dx / d2) * 0.05;
        forces[i]!.fy += (dy / d2) * 0.05;
      }
    }
    // Apply forces with step size
    for (let i = 0; i < pts.length; i++) {
      const f = forces[i]!;
      const mag = Math.sqrt(f.fx * f.fx + f.fy * f.fy);
      const clipped = mag > 0.3 ? 0.3 / mag : 1;
      pts[i]!.x += f.fx * clipped * stepSize;
      pts[i]!.y += f.fy * clipped * stepSize;
    }
  }
  return pts;
}
