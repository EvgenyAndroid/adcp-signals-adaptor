# Embedding Lab — Full Specification

**Parent plan:** `TIER23_MASTER_PLAN.md` §4.1
**Ships in:** PR #57 (Sec-41b)
**Centerpiece of Tier 2/3 — the single most differentiating surface.**

---

## 1. Why an Embedding Lab

Every AdCP Signals agent today tells the same shallow story: "we have embeddings, you can compute similarity." Our Tier-1 build already did that — a 2D scatter, a 20×20 cosine heatmap, a cross-taxonomy Sankey.

That's table stakes. An **embedding lab** is different: it's a live playground where a buyer agent — or a human analyst — can run the operations that actually drive value in a real workflow. Specifically:

1. **Intent translation** — "I have a brief in plain English; show me the audiences." Not keyword match. Not rule-based filters. Semantic proximity in a shared vector space.
2. **Concept composition** — "what does the intersection of `luxury` and `millennial` actually *look like* as an audience?" Vector arithmetic gives you a principled answer.
3. **Gap analysis** — "where in our semantic coverage do we have holes?" Density heatmaps reveal unmet demand.
4. **Signal genealogy** — "which audiences are prototypical of `automotive intent` and which are edge cases?" Centroid distance tells you.
5. **Diff-against-seed** — "I have a customer seed audience; find me the 10 closest catalog matches and tell me which *concepts* are shared."

No other public AdCP Signals agent ships any of this. We will.

---

## 2. EL-1: Custom Similarity Playground

### What it does
User enters arbitrary text (a brief, a product description, a competitor's ad copy). System returns the top-K signals whose embedding vectors are most cosine-similar.

### Why it matters
This is the "search that actually works" moment. Classic keyword search won't connect "cord-cutters who just bought a house" to `sig_life_new_homeowner_6mo × ctv_ott_cordcutter_premium`. Embedding search does — because those concepts are semantically adjacent even if the query never uses the catalog names.

### Input shape
```json
POST /ucp/query-vector
{
  "mode": "text" | "vector",
  "text": "cord-cutters who just bought a house",
  "vector": [... 512 floats ...],     // if mode=vector
  "k": 10,                             // default 10, max 50
  "category_filter": ["demographic", "interest"],   // optional
  "min_cosine": 0.35                   // optional
}
```

### Response shape
```json
{
  "space_id": "openai-te3-small-d512-v1",
  "query_vector_source": "text_hash",
  "query_vector_norm": 1.0,
  "results": [
    {
      "signal_agent_segment_id": "sig_life_new_homeowner_6mo",
      "name": "New Homeowner: 0-6 Months",
      "cosine": 0.812,
      "category_type": "demographic",
      "vertical": "life_events",
      "contribution_terms": ["homeowner", "household", "purchase"]
    },
    ...
  ],
  "method": "cosine_over_openai_te3_small_512",
  "note": "Text mode: query string pseudo-vectorized via deterministic djb2 hash (not a real OpenAI embedding). For production LLM-quality queries, route through your own embedding service and POST the vector directly."
}
```

### Server-side math
For text mode (demo-safe, no paid LLM calls):
```ts
function textToPseudoVector(text: string, dim=512): number[] {
  // Same algorithm as pseudo-embedding fallback in embeddingStore.ts
  const seed = djb2(text.toLowerCase().trim());
  const v = []; let rng = seed;
  for (let i = 0; i < dim; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    v.push((rng / 0xffffffff) * 2 - 1);
  }
  return l2Normalize(v);
}
```

For vector mode, caller provides a 512-d vector (ideally from their own OpenAI embedding). Server only normalizes.

Then for each signal in `SIGNAL_EMBEDDINGS`:
```ts
const cos = dot(queryVec, signalVec);  // both L2-normalized
```

Rank by cosine desc, apply filters, return top-K.

### UI
Three-panel playground:
- **Input panel** (left, 30% width): text area, mode toggle (text/vector), K slider (5-50), category filter, min-cosine slider
- **Results panel** (center, 50% width): ranked list with cosine bars, hover reveals contribution terms, click opens the signal detail panel
- **Methodology panel** (right, 20%): live explainer showing which vector was used, norm stats, "sample queries" (3 click-to-load briefs)

### Acceptance
- [ ] POST /ucp/query-vector with `{mode:"text", text:"test"}` returns 200 + 10 results
- [ ] POST /ucp/query-vector with `{mode:"vector", vector:[512 zeros]}` → 200 with cosine ≈ 0 for all
- [ ] UI shows all 3 panels; clicking a result opens detail panel
- [ ] Explainer block below results (What/How/Read/Limits)

---

## 3. EL-2: Semantic Arithmetic

### What it does
User constructs an expression like `luxury + millennial − urban`. Each term resolves to a base vector (either a signal's embedding or a concept centroid). Server computes the weighted sum, L2-normalizes, then runs top-K similarity against the catalog.

### Why it matters
This is the "word2vec king − man + woman = queen" moment made actionable for audiences. It directly answers composition questions like:
- `luxury_millennials = luxury − mass_market + millennial`
- `cord_cutter_parents = cord_cutter + parent − non_parent`
- `fitness_affluent = affluent + fitness_enthusiast − value_shopper`

### Input shape
```json
POST /ucp/arithmetic
{
  "base":  "sig_luxury_shoppers",             // optional; or use concept
  "plus":  ["sig_age_25_34"],
  "minus": ["sig_urban_metro_top10"],
  "weights": {
    "sig_luxury_shoppers":      1.0,
    "sig_age_25_34":            0.8,
    "sig_urban_metro_top10":    0.5
  },
  "k": 10
}
```

### Server-side math
```ts
function semanticArithmetic(base, plus, minus, weights, k): Result[] {
  let q = zeros(512);
  if (base)   q = add(q, scale(getVec(base),  weights[base]  ?? 1));
  for (const id of plus)  q = add(q, scale(getVec(id), weights[id] ?? 1));
  for (const id of minus) q = sub(q, scale(getVec(id), weights[id] ?? 1));
  q = l2Normalize(q);
  return topK(q, SIGNAL_EMBEDDINGS, k);
}
```

### Response shape
```json
{
  "expression":   "1.0 × luxury_shoppers + 0.8 × age_25_34 − 0.5 × urban_metro_top10",
  "composed_vector_norm_before_normalize": 1.27,
  "results": [ /* same shape as EL-1 */ ],
  "method": "weighted_sum_l2_normalized",
  "note": "Expression evaluated as weighted sum then L2-normalized. Results rank by cosine to the composed vector."
}
```

### UI
Builder interface with:
- **+ Add term** button (up to 6 terms)
- Per-term row: signal picker (typeahead), sign toggle (+/−), weight slider (0-2)
- Live preview pill showing the current expression
- **Compute** button → fan to result list
- "Try:" chips with preset expressions

### Acceptance
- [ ] 6-term cap enforced
- [ ] Empty plus + empty minus = 400
- [ ] Result list has per-result cosine
- [ ] Methodology chip shows the composed expression

---

## 4. EL-3: Analogy Queries

### What it does
User specifies an analogy: `A : B :: C : ?`. System computes the vector `D = B − A + C` (3CosAdd), then finds the top-K catalog signals by cosine to D.

### Why it matters
Analogies reveal the **direction** of a concept, not just its point. "What's the B2B version of this B2C audience?" "What's the lifted-tier version of this mass signal?" These questions are impossible to answer without vector arithmetic.

Concrete examples:
- `sig_college_students : sig_young_professionals :: sig_high_school :: ?` → young adults in entry-level roles
- `sig_massmarket_cars : sig_luxury_cars :: sig_massmarket_electronics :: ?` → premium electronics intenders

### Input shape
```json
POST /ucp/analogy
{
  "a": "sig_college_students",
  "b": "sig_young_professionals",
  "c": "sig_high_school_students",
  "k": 10,
  "algorithm": "3cos_add"    // or "3cos_mul" (Levy-Goldberg)
}
```

### Server-side math

3CosAdd:
```
target = normalize(B − A + C)
rank by cos(target, x) over all signals
```

3CosMul (Levy & Goldberg 2014):
```
rank by:  (cos(x,B) + 1) × (cos(x,C) + 1) / (cos(x,A) + ε + 1)
```

### Response shape
```json
{
  "analogy": "sig_college_students : sig_young_professionals :: sig_high_school_students : ?",
  "algorithm": "3cos_add",
  "target_vector_norm_before_normalize": 0.94,
  "results": [ /* top-K */ ],
  "note": "Algorithm 3cos_add: target = normalize(B − A + C). Results exclude A, B, C to prevent self-matching."
}
```

### UI
- Three signal pickers: A, B, C
- Algorithm toggle: 3CosAdd / 3CosMul
- Result list
- **Visualization**: 2D scatter with A, B, C, and top-3 results rendered; arrow from A→B, arrow from C→? highlighting parallel direction

### Acceptance
- [ ] Self-match exclusion works (results never include A, B, C)
- [ ] Both algorithms selectable
- [ ] Scatter viz renders parallel arrows

---

## 5. EL-4: k-NN Force Graph

### What it does
Interactive network visualization where each signal is a node and edges connect k-nearest neighbors by cosine similarity. d3-force layout; user can click a node to expand further.

### Why it matters
The flat 2D scatter we shipped in Tier 1 gives you spatial intuition but hides structure. A force-directed graph reveals **community structure**: which clusters of signals are tightly interlinked, which are bridges, which are peripheral. For a planner, this answers "which audiences behave as alternatives to each other?" at a glance.

### Server-side data
Precompute once on server:
```ts
// For each of 26 embedded signals, find top-5 nearest neighbors
const knn = signals.map(s => ({
  id: s.id,
  neighbors: topK(s.vec, OTHERS, 5).map(n => ({
    id: n.id, cos: n.cos
  }))
}));
```

Exposed via `GET /analytics/knn-graph?k=5`.

### UI
d3-force layout:
- Node radius ∝ audience size (log scale)
- Node color = category
- Edge opacity = cosine − threshold
- Hover reveals full signal card
- Click → highlight 2nd-order neighbors
- Toggle: "physics on/off" for frozen snapshot

### Acceptance
- [ ] Renders 26 nodes, ≤130 edges (26×5)
- [ ] Pan/zoom works
- [ ] Click highlights 2nd-order neighbors in different color

---

## 6. EL-5: UMAP-Local 2D Projection

### What it does
Improves on the Tier-1 JL projection by applying a **local refinement** step: start from JL coordinates, then iterate to pull k-nearest neighbors closer and push far points apart. This is a cheap approximation of UMAP that runs fully in the browser.

### Why it matters
JL projection preserves distances *approximately*. Real UMAP preserves **local structure** — tight clusters stay tight even after projection. For audiences, that means "young-adult streaming lovers" stay visually grouped even though they span multiple categories.

### Algorithm
```
1. start = JL projection (already have this)
2. for each iteration (10–30 iters):
   for each point p:
     for each k-nearest neighbor n in 512D:
       attract p toward n in 2D (force ∝ cos similarity)
     for each far point f (sample):
       repel p from f (force ∝ 1/distance²)
     p += clip(force, max_step)
3. final = points after convergence
```

Runs ≤1s on 50 points in pure JS.

### Server-side
New endpoint `GET /ucp/projection?method=umap_local` runs the refinement on the server and caches the result.

### UI
Toggle in Embedding tab: "JL" vs "UMAP-local". Default remains JL; UMAP-local shown when toggled.

---

## 7. EL-6: Coverage-Gap Heatmap

### What it does
Partition the 2D projection into a grid; color each cell by local point density. Cells with low density = "marketplace opportunities" (concept space where our catalog has gaps).

### Why it matters
Sells the marketplace story to HoldCos and to other signal providers: "Here's where our catalog is saturated, here's where we need partners." It's not just a visualization — it's a partnership pipeline.

### Algorithm
```
1. run 2D projection
2. grid = 12×12 cells covering [x_min..x_max] × [y_min..y_max]
3. for each cell: density = count(points in cell)
4. overlay: color cells where density < median with warm color ("gap")
5. label top-3 gaps with nearest-concept hint (centroid distance)
```

### Response shape
```json
GET /analytics/coverage-gaps
{
  "grid_w": 12, "grid_h": 12,
  "cells": [
    { "row": 0, "col": 5, "density": 0, "gap_score": 0.95,
      "nearest_concept": "sports_affluent_niche",
      "nearest_signals": [...] },
    ...
  ],
  "summary": {
    "total_points":       26,
    "median_density":     0.18,
    "gap_cell_count":     37,
    "coverage_score":     0.62
  }
}
```

### UI
Grid overlay on the 2D scatter. Hover cell → tooltip shows density + nearest concept. Top-3 gaps labeled with a "partnership opportunity" badge.

---

## 8. EL-7: Signal DNA Fingerprint

### What it does
Generate a unique, deterministic SVG fingerprint for each signal from its embedding vector. Think: spiral pattern where radius/color at each angle encodes vector components.

### Why it matters
Pure polish — but it's a **wow moment**. Planners get a visual identity for each audience. Signatures are uniformly distributed and visually distinctive.

### Algorithm
```ts
function dna(vec: number[], size=120): string {
  // Fold 512 dims into 64 radial angle buckets of 8 each
  const spokes = 64;
  const points = [];
  for (let i = 0; i < spokes; i++) {
    const slice = vec.slice(i*8, (i+1)*8);
    const mag = Math.sqrt(slice.reduce((s,v) => s+v*v, 0));
    const angle = (i / spokes) * Math.PI * 2;
    const r = size/2 + mag * size * 2;  // scale
    points.push({ x: r*Math.cos(angle), y: r*Math.sin(angle) });
  }
  // Smooth spline through points, color by hash of vec signature
  return svg(...points);
}
```

### UI
- Per-signal fingerprint on the detail panel (new section)
- Gallery view in Embedding Lab (grid of all 26 fingerprints)
- Fingerprints visually distinct enough that a trained eye can spot similar signals

---

## 9. EL-8: Centroid Analysis

### What it does
For each vertical (automotive, B2B, life_events, …), compute the centroid of its signals' vectors. Then rank every signal by its distance to its vertical's centroid.

- **Prototypical**: signals closest to centroid → most representative of the vertical
- **Edge cases**: signals furthest → borderline or novel

### Why it matters
Two use cases:
1. **Planner story**: "Which automotive signals are 'typical' vs which are specialty? Should I use both?"
2. **Marketplace health**: edges reveal which signals don't cleanly fit a vertical — candidates for new verticals.

### Server-side
```ts
function centroid(vectors: number[][]): number[] {
  const c = zeros(512);
  for (const v of vectors) for (let i=0; i<512; i++) c[i] += v[i];
  return l2Normalize(c.map(x => x / vectors.length));
}

for each vertical V:
  centroid_V = centroid(signals_in_V.map(s => s.vector))
  for each signal s in V:
    s.centroid_distance = 1 - cos(s.vector, centroid_V)
  rank s by distance asc (prototypical) / desc (edge)
```

### UI
Vertical picker → two columns: "prototypical" (top-5 closest) and "edge cases" (top-5 furthest). Each has a mini-scatter showing the centroid and the point.

---

## 10. EL-9: Neighborhood Explorer

### What it does
Pick any signal; get its 10 nearest neighbors + local density stats + distance-to-vertical-centroid.

### Input
```json
POST /ucp/neighborhood
{ "signal_id": "sig_life_new_homeowner_6mo", "k": 10 }
```

### Response
```json
{
  "signal_id": "sig_life_new_homeowner_6mo",
  "neighbors": [
    { "id": "sig_life_new_mover_30d", "cosine": 0.891, "vertical": "life_events" },
    ...
  ],
  "local_density": 0.72,          // relative density in this signal's neighborhood
  "vertical_centroid_distance": 0.23,
  "is_prototypical": true,
  "nearest_vertical": "life_events"
}
```

### UI
Inside the signal detail panel (new collapsible section "Neighborhood"):
- Top-10 neighbors with cosine bars
- Local density gauge
- Centroid distance indicator
- "Find similar" button that jumps to Embedding Lab with this signal as seed

---

## 11. Visual design principles

Every Embedding Lab panel follows these rules:

1. **Every viz has a ChartExplainer block** (What / How / Read / Limits) below it.
2. **Hover always reveals the signal card** — tooltip with name, audience size, category, cosine.
3. **Click always opens the detail panel** — consistent with the rest of the app.
4. **Empty states have sample queries** — 3 click-to-load examples per empty state.
5. **Methodology is always one line up top** — "Computed via: [algorithm name] over [space_id]".
6. **Results are always ranked** — never show unordered matches.
7. **Cosine is always displayed** — as a number AND as a fill-bar.

---

## 12. Performance budget

All endpoints must return in ≤200ms p50 on a cold Cloudflare Worker isolate with 26 cached vectors:

| Operation | Estimated cost | Target p50 |
|---|---|---|
| `query-vector` (text → pseudo-vec → cosine × 26) | 26 × 512 FMAs = 13312 ops | <50ms |
| `arithmetic` (≤6 terms × 512 + cosine × 26) | ~16000 ops | <50ms |
| `analogy` (3 vec math + cosine × 26) | ~15000 ops | <50ms |
| `neighborhood` (cosine × 26 + centroids) | 26 × 512 + 5 × 512 = ~16000 ops | <50ms |
| `coverage-gaps` (grid + density) | 144 cell scan × 26 | <30ms |
| `knn-graph` precomputed | N/A (cached) | <10ms |

Total new-endpoint compute per session is tiny; bundle size budget +15KB.

---

## 13. Open questions (resolved by default)

| Question | Default decision |
|---|---|
| Should query-vector mode accept arbitrary dimension vectors? | No — hard-require 512 dim |
| Should arithmetic accept concept IDs (from `/ucp/concepts`) as well as signals? | Yes — treat concepts the same as signals |
| Should we precompute the k-NN graph at deploy time? | Yes — 26 × 5 = 130 edges, trivial to cache in memory |
| Should UMAP-local default-on? | No — JL is faster and well-understood; UMAP-local behind toggle |
| Should Analogy show both algorithms side-by-side? | No — toggle, default 3CosAdd |
| DNA fingerprint: SVG or Canvas? | SVG — crisp + copy-paste-able |

---

## 14. Testing matrix

| Endpoint | Test input | Expected behavior |
|---|---|---|
| `/ucp/query-vector` `{mode:"text",text:""}` | empty text | 400 INVALID_INPUT |
| `/ucp/query-vector` `{mode:"text",text:"luxury travel",k:5}` | normal | 200, 5 results, top cosine > 0.3 |
| `/ucp/query-vector` `{mode:"vector",vector:[513 zeros]}` | wrong dim | 400 DIMENSION_MISMATCH |
| `/ucp/arithmetic` `{plus:[],minus:[]}` | no terms | 400 EMPTY_EXPRESSION |
| `/ucp/arithmetic` `{plus:[x],weights:{x:7}}` | weight out of range | 200 with clipped weight |
| `/ucp/analogy` `{a:x,b:x,c:y}` | A = B | 400 DEGENERATE_ANALOGY |
| `/ucp/neighborhood` `{signal_id:"nonexistent"}` | unknown signal | 404 NOT_FOUND |

---

*Spec length: 2900 words. Implementation lands in PR #57.*
