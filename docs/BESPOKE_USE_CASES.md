# Bespoke Use Cases & Temporal Intelligence

**Parent plan:** `TIER23_MASTER_PLAN.md` §4.4 + §4.5
**Ships in:** PR #58 + PR #59

This doc covers the custom / future-facing use cases that go beyond simple overlap composition — the kind of analyses a senior media planner or a buyer-agent developer actually uses day-to-day.

---

## 1. Philosophy

Tier 1 (Sec-38) gave us catalogs, filters, overlap, and a treemap. That's descriptive analytics.

Tier 2/3 moves us into **prescriptive** territory: not just "here's the catalog" but "given what you want, here's what to do." Every use case below takes a user input and returns a concrete recommendation with reasoning.

---

## 2. TI-1: Seasonality Decomposition

### What
Per-signal monthly multipliers (12 values, normalized so annual average = 1.0). Represents how this audience's relevance / reach / intent varies through the year.

### Data model
New facet on `CanonicalSignal`:
```ts
seasonalityProfile?: {
  monthly: number[];         // 12 multipliers, avg = 1.0
  peakMonth: number;          // 0-11
  peakMultiplier: number;     // e.g. 1.85 in December
  troughMonth: number;
  troughMultiplier: number;   // e.g. 0.52 in August
  coefficientOfVariation: number;  // σ/μ of the monthly series
};
```

### Synthesis rules (demo-safe, deterministic)
We don't have real time-series, so we synthesize per signal via category + name hints:

```ts
function seasonalityFor(signal): SeasonalityProfile {
  const name = signal.name.toLowerCase();
  const cat  = signal.categoryType;
  // Start from flat profile (all 1.0)
  let m = Array(12).fill(1.0);
  if (name.includes("holiday") || name.includes("q4"))   m = [0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.3, 1.8, 2.0];
  else if (name.includes("back_to_school"))              m = [0.9, 0.9, 0.9, 0.9, 1.0, 1.0, 1.3, 1.8, 1.7, 1.0, 0.9, 0.8];
  else if (name.includes("summer") || name.includes("july_4")) m = [0.8, 0.8, 0.9, 1.0, 1.2, 1.5, 1.6, 1.4, 1.0, 0.8, 0.8, 0.8];
  else if (name.includes("tax"))                         m = [1.2, 1.7, 1.8, 1.5, 0.9, 0.8, 0.7, 0.7, 0.8, 0.8, 0.9, 1.0];
  else if (cat === "demographic" || cat === "geo")       m = m;  // flat
  else if (cat === "purchase_intent")                    m = [0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.2];
  // normalize
  const avg = m.reduce((s,x)=>s+x,0)/12;
  return { monthly: m.map(x=>x/avg), peakMonth: argmax(m), ... };
}
```

### Endpoint (`GET /analytics/seasonality?signal_id=X`)
Returns the profile for a specific signal or a batch of signals.

### UI
- Per-signal: small 12-cell heatstrip in the detail panel
- Tab-level: sortable table with seasonality curves alongside each signal
- Top-level: "Best signals for [month]" ranker

---

## 3. TI-2: Forward-looking Recommender

### What
Given a target time window (e.g. "Q3 2026"), rank signals by their window-average seasonality × specificity × coverage.

### Endpoint (`GET /analytics/best-for?window=Q3`)
```json
{
  "window":        "Q3",
  "months":        [6, 7, 8],
  "ranking": [
    { "signal_id": "sig_summer_vacation", "window_multiplier": 1.53, "adj_score": 0.92 },
    { "signal_id": "sig_july_4_shoppers", "window_multiplier": 1.47, "adj_score": 0.89 },
    ...
  ],
  "method": "window_avg_seasonality × specificity_score × coverage_pct"
}
```

### UI
Seasonality tab has a big month-range picker → ranked list with "why this was recommended" explainers.

---

## 4. TI-3: Freshness Decay Curves

### What
Each signal has a data-freshness half-life (days). An exponential decay curve shows how much the audience estimate should be trusted as time passes since last refresh.

### Data
New facet:
```ts
decayHalfLifeDays?: number;     // 7, 30, 90, 365
idStabilityClass?: "stable" | "semi_stable" | "volatile";
```

Rules:
- Life-event 0-30d windows → 7 days
- Life-event 90d+ windows → 30 days
- Demographic / geographic → 365 days
- Purchase-intent in-window → 14 days
- B2B firmographic → 90 days

### UI
Detail-panel mini-chart: exponential decay curve `y = exp(-t / half_life)`; shades "refresh-needed" region in warm color past t = half_life.

---

## 5. TI-4: Volatility Index

### What
0-100 score of how much a signal's measured reach varies month-to-month. High volatility = plan with buffer.

Synthesized from seasonality's coefficient of variation:
```ts
volatilityIndex = Math.min(100, round(coefficientOfVariation * 200));
```

### UI
Pill in the detail panel; histogram distribution in Seasonality tab.

---

## 6. BA-1: Persona Synthesis

### What
Render a human-readable "persona card" from a signal's metadata. Not a real LLM call — deterministic template-driven.

### Template rules
```ts
function personaFor(signal): PersonaCard {
  const age = pickAgeFromSignal(signal);       // e.g. "32-38"
  const occupation = pickOccupation(signal);
  const daypart = pickMedia(signal);
  return {
    headline: `Meet ${personaName(signal)}`,
    tagline:  generateTagline(signal),
    age,
    hh_income: pickIncome(signal),
    occupation,
    location_type: pickLocation(signal),
    day_in_life: [
      "7:00 AM - wakes up, checks phone",
      "8:30 AM - ...",
      ...
    ],
    media_mix: { ctv: "high", mobile: "high", ooh: "low", ... },
    brands: pickBrands(signal),
    pain_points: pickPainPoints(signal),
  };
}
```

### UI
"Persona card" tab inside the detail panel. Expands into a vertical card with avatar placeholder + structured sections.

### Why this matters
HoldCo creatives want the persona. Planners want the demo. This gives both.

---

## 7. BA-2: Brief → Portfolio

### What
User pastes a full brief (paragraph of text). System returns a ranked signal portfolio with allocation weights.

### Endpoint (`POST /portfolio/from-brief`)
```json
Request: { "brief": "Launch campaign for... targeting... across these channels..." }
Response: {
  "brief":   "...",
  "portfolio": [
    { "signal_id": "sig_a", "allocation_pct": 35, "reasoning": "Primary match — brief mentions 'affluent families'" },
    { "signal_id": "sig_b", "allocation_pct": 25, "reasoning": "Secondary — brief mentions 'luxury travel'" },
    ...
  ],
  "total_allocation_pct": 100,
  "estimated_unique_reach": 24_500_000,
  "estimated_total_cost_at_10k_cpm_split": 42000
}
```

### Algorithm
1. Query-vector search on brief text → top-10 candidates
2. Filter to Pareto-frontier-like subset
3. Allocate budget proportional to cosine × coverage (decay for overlapping)
4. Surface reasoning per pick

### UI
Discover tab gains a "→ Portfolio" button that takes the current brief and jumps to Portfolio tab prefilled.

---

## 8. BA-3: 1P Lookalike Seed Workflow

### What
User describes their 1P audience in plain English (or uploads attribute summary). System matches lookalike-template signals.

### Flow
1. User types: "top 10% LTV e-commerce customers, 30-50 yrs old, $150k+, 3+ purchases/yr"
2. System parses attributes
3. Finds matching `lal_recipe_*` signals via query-vector + filters
4. Ranks with cosine + attribute-match bonus

### UI
Detail panel section for any `composite` or `lal_*` signal gets a "+ upload seed" button that opens this workflow.

---

## 9. BA-4: Signal Authority Score

### What
0-100 score per signal measuring data quality.

### Formula
```ts
authorityScore = round(
  (methodology_weight(inclusion_methodology) * 40) +     // Observed > Derived > Modeled
  (precision_weight(precision_levels)    * 20) +         // Individual > HH > Device > Geo
  (refresh_weight(refresh_cadence)       * 20) +         // Weekly > Monthly > Annually
  (source_diversity_weight(sources)      * 10) +         // Multi-source > Single
  (provider_weight                       * 10)           // Us = 9, Dstillery live = 9, roadmap = 5
);
```

### UI
Pill in detail panel. Sortable column in catalog. Surface as a filter in the Embedding Lab.

---

## 10. Onboarding tour (PL-1)

### What
First-visit full-screen overlay walking through the 11 tabs in 7 steps.

### Steps
1. "Welcome — this is the AdCP Signals Adaptor, a production-grade demo"
2. "Discover — paste a brief, get matched signals"
3. "Catalog — 520+ signals across 21 verticals"
4. "Treemap & Embedding — visual exploration"
5. "Embedding Lab — semantic arithmetic, analogies, custom queries"
6. "Portfolio — Pareto frontier + budget optimization"
7. "Federation — live calls to other AdCP agents"

### Persistence
- localStorage flag `adcp_tour_seen_v1` = true
- Dismiss always-visible as "Skip tour"
- Can be reopened from the `?` cheat-sheet

### UI
Full-screen overlay with centered card (500px wide); progress dots at bottom; previous/next/skip buttons.

---

## 11. Completeness checklist

| Feature | UI hook | Endpoint | Data model |
|---|---|---|---|
| TI-1 Seasonality | Seasonality tab | `/analytics/seasonality` | `seasonalityProfile` |
| TI-2 Forward recommender | Seasonality tab | `/analytics/best-for` | uses TI-1 |
| TI-3 Decay curves | Detail panel | `/analytics/decay?id=X` | `decayHalfLifeDays` |
| TI-4 Volatility index | Detail panel + Seasonality tab | derived | computed from TI-1 |
| BA-1 Persona synthesis | Detail panel | `/analytics/persona?id=X` | deterministic template |
| BA-2 Brief → portfolio | Discover tab + Portfolio tab | `/portfolio/from-brief` | derived |
| BA-3 1P lookalike seed | Detail panel | `/analytics/lookalike-match` | uses text-to-vec |
| BA-4 Authority score | Detail panel + catalog filter | derived | `authorityScore` |
| PL-1 Onboarding tour | App shell | none | localStorage |

---

*Length: 1850 words.*
