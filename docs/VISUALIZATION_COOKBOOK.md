# Visualization Cookbook

**Parent plan:** `TIER23_MASTER_PLAN.md`
**Purpose:** every chart in this app, when to use it, how we implemented it, how the user reads it.

A visualization is only as good as the story it tells. This cookbook is the reference so every chart in the demo is intentional, legible, and uniformly explained.

---

## 1. Design principles

1. **Pure SVG, no chart library.** d3-hierarchy lives on esm.sh for treemap squarify; d3-force for force graphs. Everything else is vanilla SVG.
2. **Dark theme native.** All colors reference CSS variables (`var(--accent)`, `var(--text-mut)`, etc.) so any theme change applies uniformly.
3. **Every chart has a ChartExplainer.** Four standard rows: What / How / Read / Limits.
4. **Hover always reveals detail.** Every dot, cell, bar gets a `<title>` tooltip.
5. **Click always opens detail panel** (where applicable). Signal-bearing visualizations jump to the detail panel on click.
6. **Never more than 4 colors in a single chart** unless encoding a categorical dimension (max ~8 categories).
7. **Numeric labels always mono-spaced.** Use `var(--font-mono)` for values.
8. **Axes always labeled.** Even if obvious, label them. Unlabeled axes = confusion.

---

## 2. Chart inventory

### 2.1 Treemap (Catalog tab)
**What it shows:** whole marketplace at a glance.
**When to use:** compare sizes across a categorical hierarchy.
**Library:** d3-hierarchy `.treemap()` with `.tile(d3.treemapSquarify)`.
**Visual:** area ∝ audience size, color = category, halo-stroke labels.
**Caveats:** can hide tiny cells; mitigate with `padding(1)`.
**Reads well for:** ~50-500 items.

### 2.2 2D scatter (Embedding tab)
**What it shows:** semantic map of audiences in a 2D projection.
**When to use:** visualize high-dimensional similarity.
**Implementation:** JL random projection of 512→2; axes labeled UCP₁, UCP₂.
**Visual:** dots colored by category; halo-stroke name labels.
**Caveats:** JL axes not interpretable as principal components.
**Ships in Tier 1; Sec-41 adds UMAP-local toggle.**

### 2.3 Cosine similarity heatmap (Embedding tab)
**What it shows:** pairwise semantic closeness across 20 signals.
**When to use:** identify clusters + redundancy.
**Visual:** 20×20 grid, diverging color scale (deep blue → white → warm orange).
**Reads:** diagonal always = +1; bright cells near diagonal = clusters; bright off-diagonal = hidden similarity.
**Accessibility:** color scale legend with labeled endpoints (opposite / unrelated / identical).

### 2.4 Cross-taxonomy Sankey (Embedding tab)
**What it shows:** how signals flow from our native taxonomy → IAB 3.0 → buyer systems.
**Visual:** three columns (left: IAB 1.1 / middle: IAB 3.0 / right: LR/TTD/Nielsen/MC); ribbon width ∝ signal count.
**Reads:** thick ribbon to a system = that system has strong coverage of this class.

### 2.5 Force-directed k-NN graph (Embedding Lab, new)
**What it shows:** community structure in the embedding space.
**When to use:** "which audiences cluster vs which are bridges?"
**Library:** d3-force (via esm.sh, ~20kb gzipped).
**Visual:** nodes (radius ∝ log audience size, color = category) connected by edges (opacity ∝ cosine - threshold).
**Interactivity:** drag, pan, zoom; click expands 2nd-order neighbors.
**Limits:** >100 nodes becomes unreadable; we cap at 26 + expand-on-click.

### 2.6 UMAP-local 2D (Embedding Lab, new)
**What it shows:** better local cluster separation than JL.
**Algorithm:** start from JL, 20 iterations of attract-k-nearest + repel-far in 2D.
**Visual:** same as JL scatter but tighter clusters.
**Toggle:** JL is default, UMAP-local behind a switch.

### 2.7 Coverage-gap heatmap (Embedding Lab, new)
**What it shows:** holes in our semantic coverage.
**Visual:** 12×12 grid overlaid on 2D projection; color intensity = inverse-density (darker = gap).
**Reads:** dark cells = "marketplace opportunities." Top-3 gaps labeled with nearest-concept hint.
**When to use:** partnership pitching, catalog roadmapping.

### 2.8 Signal DNA fingerprint (Embedding Lab, new)
**What it shows:** unique visual identity per signal.
**Algorithm:** fold 512-d vector into 64 radial spokes; each spoke magnitude from ‖slice of 8‖; smooth spline.
**Visual:** spiral/starburst SVG, color hashed from signature.
**Use:** polish; visible on every detail panel.

### 2.9 Pareto frontier scatter (Portfolio, new)
**What it shows:** reach × cost × specificity tradeoff.
**Visual:** 2D scatter (reach vs cost) with Z encoded as point color + size; frontier points highlighted gold.
**Axes toggleable:** any two of reach/cost/specificity.
**Reads:** gold points are Pareto-optimal; dimmed points dominated.

### 2.10 Marginal-reach waterfall (Portfolio, new)
**What it shows:** how each pick in a portfolio contributes new reach.
**Visual:** vertical bars; green = marginal unique reach, red = overlap "waste"; running total labeled.
**Reads:** tall green bars early = efficient picks; short greens + tall reds later = saturation.

### 2.11 Lorenz curve + Gini badge (Portfolio, new)
**What it shows:** catalog concentration per vertical.
**Visual:** cumulative audience share (y) vs cumulative signal share (x); equality line dotted.
**Gini badge:** area between curve and equality, ×2.
**Reads:** low Gini = even distribution; high Gini = a few signals dominate.

### 2.12 Information-theoretic overlap table (Portfolio, new)
**What it shows:** Jaccard + KL + MI side by side for selected signals.
**Visual:** three small heatmaps in a row; cells color-coded per-metric range.
**Reads:** a pair can be Jaccard-low but KL-high — distribution mismatch.

### 2.13 Interop matrix (Federation, new)
**What it shows:** which agents support which capabilities.
**Visual:** table with ✅ / ⚠️ / ❌ / ?; hover shows probe detail.
**Reads:** fully-filled column = mature capability; rows with lots of ❌ = new agent.

### 2.14 Federated side-by-side (Federation, new)
**What it shows:** same brief, two catalogs.
**Visual:** two columns with matched approximate pairs connected by thin lines.
**Reads:** unmatched items = unique inventory to that agent.

### 2.15 Seasonality heatmap (Seasonality, new)
**What it shows:** monthly audience multiplier per signal.
**Visual:** signals (rows) × 12 months (cols); cell color = multiplier (0.5 → 1.8).
**Reads:** warm vertical stripes = peak month; cool stripes = off-season.

### 2.16 Freshness decay curve (Seasonality, new)
**What it shows:** per-signal freshness half-life.
**Visual:** exponential decay line; x = days since last refresh, y = relative weight.
**Reads:** short half-life = volatile; long half-life = stable.

### 2.17 Volatility histogram (Seasonality, new)
**What it shows:** distribution of volatility scores across catalog.
**Visual:** histogram bars; median + IQR marked.
**Reads:** bimodal = two regimes of stability; long tail = a few very volatile audiences.

### 2.18 Analogy arrow scatter (Embedding Lab, new)
**What it shows:** analogy A:B :: C:? rendered in 2D.
**Visual:** A→B arrow + C→? arrow; parallel arrows = good analogy.
**Reads:** arrows pointing same direction + similar length = analogy holds.

### 2.19 Chord diagram (Federation, new — optional)
**What it shows:** cross-agent catalog overlap.
**Visual:** circular layout, ribbons connecting signals shared across agents.
**Reads:** thick ribbons = high overlap; thin = unique specialties.

### 2.20 Parallel coordinates (Portfolio, new — optional)
**What it shows:** multi-dim filter preview.
**Visual:** N parallel axes (reach / cost / specificity / seasonality / volatility); each signal is a polyline.
**Reads:** brush axes to filter; filtered lines highlighted.

---

## 3. Color system

### 3.1 Category palette (uniform across app)
```
demographic:      #4f8eff
interest:         #8b6eff
purchase_intent:  #ff7a5c
geo:              #2bd4a0
composite:        #ffcb5c
```

### 3.2 Stage palette
```
live:     var(--ok)      — green
modeled:  var(--accent)  — blue
roadmap:  var(--text-mut) — muted gray
sandbox:  var(--accent)  with dashed border
```

### 3.3 Diverging scale (heatmaps)
```
min (-1 or bad):  rgb(22, 52, 120)   — deep blue
mid (0 or neutral): rgb(240, 240, 240) — off-white
max (+1 or good): rgb(255, 128, 90)  — warm orange
```

### 3.4 Gradient scales (reach, density)
```
bg-input → accent  (monotone blue, for continuous quantitative)
```

---

## 4. Typography

- Sans-serif UI: `var(--font-sans)` (system ui-sans-serif stack)
- Mono-space values: `var(--font-mono)` (ui-monospace)
- Chart labels: 10-11px for axis/legend; 11-12px for tooltips; 13px for titles
- Never use fonts > 14px inside a chart.

---

## 5. Accessibility

- Every color-encoded chart has a legend with labeled stops.
- `<title>` on every SVG element for screen readers.
- High-contrast mode: stroke-based charts remain legible on bright backgrounds.
- Never encode info in color alone — always pair with shape/size/text.

---

## 6. ChartExplainer component (uniform across every chart)

```
┌─ HOW TO READ THIS ──────────────────┐
│ What   — one sentence, what you see │
│ How    — one sentence, methodology  │
│ Read   — two sentences, interp tips │
│ Limits — one sentence, caveats      │
└─────────────────────────────────────┘
```

Every new chart gets one. Non-negotiable.

---

## 7. Interaction standards

- **Hover**: tooltip within 80ms
- **Click**: if signal-bearing, open detail panel
- **Drag**: supported on force graphs + sliders
- **Keyboard**: `?` opens cheat-sheet, Escape closes overlays, `f` expands detail panel
- **Responsive**: all charts use `preserveAspectRatio="xMidYMid meet"` and flex to container width

---

## 8. Performance budgets

- Chart render ≤50ms for up to 100 points
- No full re-render on hover (use per-element class toggles)
- Force graph tick rate capped at 60Hz
- Large charts (treemap, k-NN) lazy-render on tab activation only

---

## 9. Testing

Every new chart:
1. Renders without errors on sample data
2. Handles empty data gracefully (shows empty state)
3. Tooltips appear on hover
4. Click handler attached where signal-bearing
5. Explainer block present
6. Color scheme is theme-variable-driven

---

*Length: 1650 words.*
