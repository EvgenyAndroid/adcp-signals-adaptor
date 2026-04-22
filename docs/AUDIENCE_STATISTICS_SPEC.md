# Audience Statistics — Full Specification

**Parent plan:** `TIER23_MASTER_PLAN.md` §4.2
**Ships in:** PR #58 (Sec-41c)
**Deliverable:** Portfolio Optimizer tab + `/portfolio/optimize` + `/analytics/*` endpoints.

---

## 1. Why go beyond Jaccard

Tier 1 shipped a heuristic Jaccard overlap. It's useful as a first-pass "are these audiences duplicates?" signal, but:

1. **Jaccard is size-sensitive**: two signals with nearly identical distributions but very different sizes can score low
2. **Jaccard is pair-only**: tells you nothing about portfolio-level redundancy when stacking 5+ signals
3. **Jaccard ignores distribution shape**: two signals concentrated in the same 3 DMAs overlap hard; two spread evenly overlap less. Jaccard doesn't see it.

Real media planners need portfolio-scale reasoning:
- "Given a $250K budget, which **set** of signals maximizes unique reach?"
- "Which two signals are the **most redundant**, in information-theoretic terms?"
- "How concentrated is my catalog — do 20% of signals deliver 80% of the reach?"

This spec introduces **KL divergence**, **mutual information**, **Lorenz curves + Gini coefficients**, and a **greedy portfolio solver** to answer all of those.

---

## 2. PO-1: Pareto Frontier (reach × cost × specificity)

### The axes
- **Reach**: estimated audience size (log scale)
- **Cost**: CPM (linear)
- **Specificity**: category-based score (purchase_intent=0.85, composite=0.8, interest=0.65, demographic=0.45, geo=0.4)

### The frontier
A point P is **Pareto-optimal** if there's no other point Q with:
- Q.reach ≥ P.reach AND
- Q.cost ≤ P.cost AND
- Q.specificity ≥ P.specificity
- (at least one strict)

### Algorithm
```ts
function paretoFrontier(points: Point[]): Point[] {
  // Sort by reach desc, cost asc
  const sorted = [...points].sort((a,b) => b.reach - a.reach || a.cost - b.cost);
  const frontier = [];
  let bestSpec = -Infinity;
  for (const p of sorted) {
    if (p.specificity > bestSpec) { frontier.push(p); bestSpec = p.specificity; }
  }
  return frontier;
}
```

### Response (`GET /portfolio/pareto`)
```json
{
  "axes": ["reach", "cost_cpm", "specificity"],
  "total_points": 520,
  "frontier": [
    { "signal_id": "sig_xyz", "reach": 45000000, "cost_cpm": 5.5, "specificity": 0.85 },
    ...
  ],
  "frontier_count": 28,
  "summary": {
    "most_reach": "sig_age_25_34",
    "lowest_cost": "sig_age_18_24",
    "highest_specificity": "sig_b2b_intent_saas_q4"
  }
}
```

### UI
3D-ish scatter: X = log(reach), Y = CPM, Z = specificity encoded as color + point size. Frontier points highlighted in gold; dominated points dimmed. 2D projections (X-Y, X-Z, Y-Z) available via axis toggles.

---

## 3. PO-2: Greedy Marginal-Reach Allocator

### Problem
Given N candidate signals and a budget B, select a subset S that maximizes unique reach, where pairwise overlap reduces marginal reach.

### Algorithm (greedy)
```ts
function greedy(candidates: Signal[], budget: number): Portfolio {
  const S = []; let spent = 0; let cumReach = 0;
  while (spent < budget) {
    let best = null; let bestMarg = 0;
    for (const c of candidates) {
      if (S.includes(c)) continue;
      if (spent + c.cost > budget) continue;
      // Marginal reach: subtract pairwise overlap with all already-picked
      const overlap = S.reduce((acc, picked) =>
        acc + jaccard(c, picked) * Math.min(c.reach, picked.reach), 0);
      const marg = c.reach - overlap;
      if (marg > bestMarg) { best = c; bestMarg = marg; }
    }
    if (!best) break;
    S.push(best); spent += best.cost; cumReach += bestMarg;
  }
  return { picked: S, total_cost: spent, unique_reach: cumReach };
}
```

### Response (`POST /portfolio/optimize`)
```json
{
  "method": "greedy_marginal_reach",
  "budget": 250000,
  "picked": [
    { "signal_id": "sig_a", "cost": 50000, "marginal_reach": 12000000, "cumulative_reach": 12000000 },
    { "signal_id": "sig_b", "cost": 35000, "marginal_reach":  8500000, "cumulative_reach": 20500000 },
    ...
  ],
  "total_cost":        225000,
  "total_unique_reach": 48000000,
  "efficiency":        213,    // reach per $k
  "overlap_waste":     7200000
}
```

### UI
Waterfall chart showing each pick's marginal contribution. Bar colors: green for reach, red for "waste" (displaced overlap). Explainer: "Each addition's marginal reach is its own audience **minus** what it overlaps with already-picked signals."

---

## 4. PO-3: Information-Theoretic Overlap

### Kullback-Leibler Divergence
For two signals A, B with category × geography distributions, compute KL divergence:
```
KL(P ‖ Q) = Σ P(x) · log(P(x) / Q(x))
```

A low KL(A‖B) means A's distribution is "close to" B's in shape. Unlike Jaccard (which is symmetric and set-based), KL is **asymmetric** (A → B vs B → A can differ) and **distribution-aware**.

### Mutual Information
```
MI(X; Y) = Σ P(x,y) · log( P(x,y) / (P(x)·P(y)) )
```

Here X and Y are two signals' distributions over (vertical, category, geography). High MI means the signals carry redundant information.

### Demo data
Since we don't have true joint distributions, synthesize per-signal distributions from:
- `category_type` (one-hot over 5 categories)
- `vertical` (one-hot over ~20 verticals)
- `geography` (uniform if universal; concentrated for DMA-specific)
- `cross_taxonomy` systems (presence/absence × stage)

This gives each signal a ~100-dim probability distribution that we can feed to KL / MI.

### Endpoint (`POST /portfolio/info-overlap`)
```json
{
  "signal_ids": ["sig_a", "sig_b", "sig_c"],
  "metrics": {
    "jaccard_matrix":   [[1, 0.42, 0.15], [0.42, 1, 0.33], ...],
    "kl_matrix":        [[0, 0.12, 0.88], [0.14, 0, 0.61], ...],
    "mi_matrix":        [[5.2, 2.1, 0.3], ...],
    "interpretation": "Jaccard 1.0 = identical set; KL 0 = identical distribution; MI 0 = independent"
  }
}
```

### UI
Three side-by-side small heatmaps: Jaccard, KL, MI. Each cell hoverable. Tabular view with sortable columns.

---

## 5. PO-4: Lorenz Curve + Gini Coefficient

### What they are
- **Lorenz curve**: cumulative share of audience (y-axis) vs cumulative share of signals (x-axis). Perfect equality is the y = x line.
- **Gini coefficient**: 2× area between Lorenz curve and equality line. 0 = perfect equality, 1 = one signal owns everything.

### Why they matter for a signals catalog
Tells you how **concentrated** your catalog is. If 20% of signals deliver 80% of total reach, you have a long tail of niche audiences — valuable. If 50% of signals deliver 95%, your catalog is top-heavy — consolidate opportunity.

### Endpoint (`GET /analytics/lorenz?group=vertical`)
```json
{
  "group": "vertical",
  "slices": [
    { "vertical": "automotive",
      "lorenz": [{x:0,y:0},{x:0.05,y:0.12},{x:0.10,y:0.22},...,{x:1,y:1}],
      "gini":   0.34 },
    { "vertical": "b2b",
      "lorenz": [...],
      "gini":   0.61 },
    ...
  ],
  "overall": {
    "lorenz": [...],
    "gini":   0.48,
    "interpretation": "Gini 0.48 = moderate concentration. Long tail of niche audiences exists."
  }
}
```

### UI
Small-multiples grid: one Lorenz curve per vertical + an "overall" card. Each has its Gini as a badge. Hover a vertical's curve to overlay with "all other verticals" for comparison.

---

## 6. PO-5: Budget-Constrained N-Pick

### Generalized optimizer
Given a budget B, a target reach R, and optional constraints (max signals, must-include/must-exclude), find the cheapest subset achieving ≥ R unique reach.

Algorithm: same greedy as PO-2, but terminate when `cumulative_reach ≥ R` rather than when `spent ≥ B`.

### Endpoint (`POST /portfolio/hit-target`)
```json
{
  "target_reach":   40000000,
  "budget":         200000,
  "max_signals":    6,
  "include":        [],
  "exclude":        ["sig_political_xyz"],
  "result": {
    "found":              true,
    "picked":             [ ... ],
    "reached":            42300000,
    "spent":              175000,
    "signals_used":       5,
    "budget_remaining":   25000
  }
}
```

---

## 7. PO-6: What-If Analyzer

### What it does
Given a portfolio and a candidate change (add X, remove Y, swap Y→Z), return Δreach, Δcost, Δoverlap.

### Endpoint (`POST /portfolio/what-if`)
```json
{
  "current":    ["sig_a", "sig_b", "sig_c"],
  "operation":  "swap",
  "remove":     ["sig_b"],
  "add":        ["sig_d"],
  "result": {
    "delta_reach":    +2100000,
    "delta_cost":     +4500,
    "delta_overlap":  -1800000,
    "recommendation": "swap_accepted",
    "reasoning":      "Net +2.1M unique reach at cost of +$4.5k. Recommended."
  }
}
```

### UI
Live in Portfolio tab: current portfolio on left, "what if" builder on right. Deltas rendered as bar charts.

---

## 8. AUX-1: Coverage score per vertical

```
coverage_score(vertical) = signal_count × Gini × avg_specificity
```

Rank verticals by coverage to identify gaps.

---

## 9. AUX-2: Catalog summary stats endpoint

`GET /analytics/summary`:
```json
{
  "total_signals":       520,
  "by_category":         { "demographic": 97, "interest": 148, ... },
  "by_vertical":         { "automotive": 22, "b2b": 41, ... },
  "by_generation_mode":  { "seeded": 320, "derived": 90, "dynamic": 110 },
  "total_addressable":   240000000,
  "avg_cpm":             6.73,
  "gini_overall":        0.48,
  "cross_taxonomy_coverage": {
    "iab_audience_1_1":       1.0,
    "iab_content_3_0":        1.0,
    "liveramp_abilitec":      1.0,
    "ttd_dmp":                1.0,
    "nielsen_category":       1.0,
    "mastercard_spendingpulse": 0.18,
    "oracle_moat":            0.45,
    "experian_mosaic":        0.60,
    "acxiom_personicx":       0.55,
    "iri_proscores":          0.30
  }
}
```

---

## 10. Testing matrix

| Endpoint | Test | Expected |
|---|---|---|
| `/portfolio/optimize` `{budget:0}` | zero budget | 200, empty picked[] |
| `/portfolio/optimize` `{budget:1e9}` | infinite budget | 200, large portfolio, high reach |
| `/portfolio/info-overlap` `{signal_ids:["x"]}` | single signal | 400 INSUFFICIENT_SIGNALS |
| `/analytics/lorenz?group=vertical` | all verticals | 200, 21+ slices + overall |
| `/portfolio/hit-target` unreachable target | target too high | 200 with found:false |

---

*Spec length: 2800 words.*
