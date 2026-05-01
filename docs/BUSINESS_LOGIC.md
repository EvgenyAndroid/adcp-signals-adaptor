# Business logic — sell-side + buy-side data flow

End-to-end orchestration logic for both sides of the adapter, anchored on **Coca-Cola** as the carry-through example. Every stage's assumptions and decision rules are called out. At the bottom of each side: a paste-ready **Claude.ai Design** prompt to generate a printable one-pager.

> Companion to:
> - **`README.md`** — version history + protocol compliance + standards
> - **`docs/PROTOCOL_CHANGELOG.md`** — per-version wire-format diff
> - **`docs/workshop-evidence/`** — workshop deck content + 8-scene runbook
> - **`memory/agent_capability_dump_2026_04_27.md`** — directory deep-mine + 12-tool universal buying contract
>
> This doc is the **end-to-end narrative** — the others are reference data + protocol surface.

---

## A. SELL-SIDE workflow (Brand Canvas)

### Mental model

The brand owns budget. It wants to buy media. The pipeline is **linear and deterministic** — discover what's available, pick what fits, fire the buy. Auth-gating at the vendor's mutation boundary is the workshop punchline.

**Carry-through example:** `coca-cola.com`, classification = `master`, industries = `["Food and Drink", "Beverages"]`.

### Stage 0 — Brand resolution

**Endpoint:** `GET /brands/resolve?domain=coca-cola.com`
**Source code:** `src/routes/brandRegistry.ts`

**Assumptions:**
- Upstream agentic-advertising registry is the canonical source of `brand.json`
- Brand domain is unique and stable; no aliasing
- KV cache is acceptable up to 1 hour of staleness; 24-hour SWR window beyond that

**Decision rules:**

1. **KV lookup** keyed on `brand_resolve:<domain>`
2. **Cache age check:**
   - `< 1h` → return as-is, mark `cache: "hit"`
   - `1h–24h` → conditional `GET` upstream with `If-None-Match: <stored-etag>`
     - `304` → bump `fetched_at` in KV, return body, mark `cache: "swr-validated"`
     - `200` → write fresh body, return, mark `cache: "swr-refresh"`
     - upstream-error → return stale body, mark `cache: "swr-stale-fallback"`
   - `≥ 24h` → KV entry expired; full fetch from upstream
3. **Industry enrichment** (`src/domain/brandIndustryOverrides.ts`):
   - Match `brand_name` against 11 pattern groups (alcohol / tobacco / cannabis / gambling / pharma / children / financial / fast_food / confectionery / political / ai_generated)
   - Append matched tags; track in `brand_manifest.industries_meta.added_by_override[]`
   - Idempotent — re-running doesn't double-add; first-pattern-wins
4. **Return** `brand_manifest` with `company.industries` + `classification.kind` + `house_domain` + `logos` + `colors` + `fonts` + `description`

**For Coca-Cola:**
- `classification.kind = "master"` (Coca-Cola IS the parent in the registry; "Honest Tea" would be `sub_brand` with `house_domain = coca-cola.com`)
- `industries = ["Food and Drink", "Beverages"]`
- No override pattern matches (registry already covers it)
- Cache hit on 2nd visit within 1h, etag-validated past 1h

### Stage 0.5 — Brief derivation (client-side)

**Source code:** `_canvasDeriveBrief()` in `src/routes/demo.ts`

**Logic:**
```
brief = "<industry1> + <industry2> buyers in <brand_name> core markets"
```

**Assumption:** downstream agents are NL-search-capable. We don't construct structured filters — we feed each agent a single short string and let its semantic match do the ranking.

**For Coca-Cola:** `"food and drink + beverages buyers in Coca-Cola core markets"`

### Stage 1 — Signals fan-out

**Endpoint:** `POST /agents/workflow/run/stream` (orchestrator) → fans out to live signals agents in parallel
**Source code:** `src/routes/agentsEndpoints.ts` + `src/domain/workflowOrchestration.ts`

**Assumptions:**
- All live signals agents support `get_signals` (verified at probe time via `/agents/probe-all`)
- `coverage_percentage` is the one normalized field every vendor returns; CPM/eCPM are deal-scoped and inconsistent
- Brief is interpretable by both Evgeny's embedding pipeline and Dstillery's behavioral model (different algorithms, comparable inputs)

**Process:**
1. Parallel call `get_signals` against every live signals agent in `AGENT_REGISTRY` with `role === "signals"`:
   - **Evgeny self-agent** (us — in-process via self-hooks)
   - **Dstillery** (vendor MCP)
2. Each agent receives `{ signal_spec: brief, max_results: 20, deliver_to, pagination }`
3. Each agent runs its own ranking algorithm

#### Evgeny signal-selection logic — deep dive (we own this)

**Source:** `src/domain/queryResolver.ts` + `src/domain/signalService.ts` + UCP v0.3 spec at `src/domain/ucp-v0.2-nlaq-spec.md`

1. **Brief embedding** — input string embedded via `openai-te3-small-d512-v1` (production-deployed since UCP v0.3). 512-dim float vector.
2. **Candidate pool** — every canonical signal in the catalog has a pre-computed embedding stored at seed time. Cross-taxonomy bridging maps **9 source taxonomies** into one space:
   - IAB AT 1.1
   - Curated Audiences
   - Behavioral
   - Affinity
   - In-Market
   - Demographic
   - Geo
   - Custom Composer
   - Cross-Verticals
3. **Cosine similarity** — `score = cos(brief_vec, signal_vec)` for every candidate.
4. **Penalty model** (UCP v0.3 §3.2.4 / §3.3.1):
   - `unresolved_dimension_penalty`: brief mentions a dimension we don't have a node for → soft penalty
   - `double_weight_archetype` (§3.2.3): when both an explicit signal and an archetype-implied signal fire, don't double-count
5. **VAC space anchoring** — Volumetric Audience Conformance: `space_id` is semantically valid (production deployment). Each result carries a VAC `phase` field describing where it sits in the lifecycle.
6. **Output ranking** — sorted by combined score (cos sim + bonuses for taxonomy alignment). Top-20 returned with `coverage_percentage`, `estimated_audience_size`, `signal_agent_segment_id`.

**For Coca-Cola brief** `"food and drink + beverages buyers in Coca-Cola core markets"` — Evgeny's likely top signals (deterministic given the seeded catalog):
- `sig_int_food_foo_foodies` — Foodies / Culinary Explorers (high cos sim on "food and drink")
- `sig_int_market_beverages` — Beverage In-Market (direct hit on "beverages")
- `sig_aff_qsr_visitors` — QSR Frequent Visitors (taxonomy-bridged from "food and drink")
- `sig_demo_us_household` — US households (geo from "core markets" → US default)

#### Dstillery signal-selection logic (vendor-internal — opaque to us)
- `mcp_url: https://adcp-signals-agent.dstillery.com/mcp`
- We send `{ signal_spec: brief }` and they return their proprietary behavioral matches (TTD-deployment-aware)
- Their algorithm is a black box; we only see the resulting ranked list

### Stage 1.5 — Top-N selection

**Source code:** `pickTopSignals()` in `src/domain/workflowOrchestration.ts`

**Logic:**
```ts
merged = [...evgeny_signals, ...dstillery_signals]
sort by coverage_percentage DESC, tiebreak appearance_order
dedupe by signal_agent_segment_id (Set-based)
return top 3
```

**Why coverage_percentage as primary key?** It's the one normalized field every vendor returns. CPM/eCPM are scoped to deals and inconsistent.

**Why dedupe?** Multiple agents may surface the same canonical signal under different sources. The `seen` Set ensures one entry per canonical id.

**For Coca-Cola:** orchestrator picks **3 signals globally** (not per-agent). If Evgeny returns 5 high-coverage CPG signals and Dstillery returns 5 mediocre-coverage ones, the chosen 3 might all be from Evgeny.

### Stage 2 — Creative formats + brand-rights gate

**Process:**
1. Parallel call `list_creative_formats` against `creative_agents`:
   - **Celtra** (creative authoring + dynamic creative)
   - **Advertible** (native sizeless formats + retail media)
2. Each returns its supported format catalog
3. **Filter** to formats matching the brand's domain assumptions:
   - Default: standard display (300×250, 728×90, 320×50)
   - DOOH if brand has retail/QSR signal in chosen set
   - Native if brand has content/editorial signal

**For Coca-Cola:** chosen formats = `display_300x250`, `display_728x90`, `native_in_feed`, `dooh_billboard_landscape` (Coca-Cola has historic DOOH inventory).

**Brand-rights gate** (`src/domain/brandRightsMock.ts` — predictive mock; 0 vendors advertise live):
- `classification.kind = "master"` → all creatives: `owned`
- `sub_brand` with `house_domain` → `delegated_from_parent`
- `independent` → `self_owned`
- missing classification → `unknown` (would need live `get_rights`)
- DOOH formats escalate to `needs_clearance` (physical-distribution check separate from creative ownership)
- Native formats add `needs_disclosure` flag (FTC + EU AVMSD)

**For Coca-Cola DOOH outcome:** `needs_clearance` warning, **not block** — proceed with the buy, flag for ops follow-up.

### Stage 3 — Products / inventory

**Process:**
1. Sequential call `get_products` per buying agent in default trio:
   - Adzymic APX
   - Claire Scope3
   - Swivel
2. Each gets `{ brief, filters: { signals: chosen_signal_ids, format_ids: chosen_formats }, brand: BrandRef }`
3. Each returns matching products (deal IDs / inventory packages)

**Logic for choosing one product per agent** (`pickProductPerAgent`): highest-CPM-floor product that matches all chosen signals + at least one chosen format. Picked client-side from the returned list.

### Stage 3.5 — Governance + policy gates (mock; AdCP 3.0.1 spec'd, 0 vendors implement)

**Source code:** `predictGovernance()` in `src/domain/governanceMock.ts`

**Decision matrix:**
1. Take brand industries → `policiesForIndustries()` returns applicable registry policies (from `src/domain/policyRegistry.ts`, 14 policies hardcoded as local mirror)
2. Take signal attestations (from the SIGNAL's DTS label, Phase D extension)
3. For each applicable policy:
   - Signal attests `compliant`/`exempt`/`not_applicable` → `allow`
   - Signal attests `out_of_scope` → `allow`
   - Signal silent + policy is `must` → **`block`**
   - Signal silent + policy is `should` → **`warn`**
4. Worst outcome wins overall

**For Coca-Cola** (industries: `Food and Drink`, `Beverages`):
- Applicable policies: `eu_gdpr_advertising` (catch-all `must`), `csbs` (catch-all `must`)
- Our signal attests `out_of_scope` to GDPR (US-only data) → `allow`
- Our signal attests `compliant` to CSBS → `allow`
- **Overall outcome: ALLOW.** Fire button stays enabled.

**Counter-example** (AI-generated content brand): adds `eu_ai_act_article_50` (`must`); our signal is silent on it → **BLOCK**, fire button disabled with override link, remediation suggests adding an attestation.

### Stage 4 — Media buy + idempotency + attestations

**Source code:** `buildCreateMediaBuyPayload()` + `applyVendorAdapter()` in `src/domain/workflowOrchestration.ts`

**Synthesized payload per buying agent:**
- `brand_manifest` OR top-level `brand: BrandRef` (per-vendor schema-family split — Sec-48r6 rule table)
- `packages[].product_id` from stage 3 choice
- `packages[].budget` scalar (every vendor requires this)
- `packages[].buyer_ref` (every vendor requires)
- `pricing_option_id: "default"` (every vendor requires)
- `targeting_overlay.required_axe_signals = chosenSignalIds` (3 from stage 1.5)
- `total_budget` scalar
- **`idempotency_key`** (Phase D MVP #5): FNV-1a hash of `(workflow × agent × product × brand × formats)`. Same inputs → same key → vendor returns cached canonical response on retry. HEAD-spec future-proof; vendors that don't support replay ignore.
- **`signal_attestations[]`** (Phase D MVP #3): 8 policy claims propagated from our DTS label so buyer-side enforcer can act at fire-time.

**Vendor adapter rules** (Sec-48r6, captured in `applyVendorAdapter`):

| Transform | adzymic_* | swivel | claire_* | content_ignite |
|---|---|---|---|---|
| brand_manifest.name | ✓ | ✓ | omit | omit |
| top-level `brand: {domain, name}` | — | — | ✓ | ✓ |
| packages[].buyer_ref | ✓ | ✓ | ✓ | ✓ |
| packages[].budget scalar | ✓ | ✓ | ✓ | ✓ |
| total_budget scalar | ✓ | ✓ | ✓ | ✓ |
| packages[].pricing_option_id: "default" | ✓ | ✓ | ✓ | ✓ |

**Auth-gate detection** (regex on response body):
```
/principal id not found|authentication required|auth_token_invalid|unauthorized|\b401\b|tenant policy/i
```

When matched, the UI renders an amber callout instead of a generic error: *"auth-gated — payload shape passed; vendor requires credentials we do not have."*

**Partial-result rebalance** (Phase D MVP #6): if N agents auth-gate and ≥1 succeeds, banner shows `"X auth-gated · Y live · $perAgent → $rebalancedPerSuccess each"`. Demonstrates portfolio resilience.

### Stage 5 — Measurement (stub today; live when any vendor supports it)

**Source code:** `handleWorkflowMeasurementStub()` in `src/routes/agentsEndpoints.ts`

**Logic:** per-agent click → `/agents/workflow/measurement-stub?workflow_id=…&agent_id=…&days=7`. Deterministic FNV-seeded synthetic data:
- `daily_spend = total_budget × (1/days) × (0.85 + rand × 0.30)` (drift around even pacing)
- `impressions = daily_spend × (550 + rand × 200)` (CPM ~$1.50–$2.50)
- `viewable_pct = 68 + rand × 18` (%)
- `next_cycle_recommendations` = 2 strawman strings

This **closes the AdCP 4-stage loop visually** but does NOT yet feed back into the next workflow run. Closed-loop role is `unspec'd` in 3.0 GA.

### Sell-side trust contract layers

| Layer | What it covers |
|---|---|
| **DTS v1.2 label** under each signal | provenance / consent / freshness / coverage |
| **`policy_attestations[]`** (Phase D, proposed v1.3) | 8 strawman claims per our signals |
| **Governance preview** at the brand level | mock — derives from policies × attestations |
| **Brand-rights preview** at the format level | mock — from classification × format type |
| **Idempotency key** on every fire-buy | HEAD-spec future-proof |

### Sell-side workshop punchline

**Auth posture is the actual ceiling, not shape.** 5/8 buying agents reject `get_products` with auth errors. The 3 default-trio that accept discovery without auth (Adzymic APX, Claire Scope3, Swivel) **all** require auth at `create_media_buy`. Different vendors return different auth-error shapes (Adzymic: "Principal ID not found"; Claire: "tenant policy"; Swivel: 401 buried in `structured_content`). **No shared auth-posture standard in AdCP 3.0 GA.**

### 🎨 Claude.ai Design prompt — Sell-side one-pager

> Paste this into [claude.ai/new](https://claude.ai/new) (set artifact rendering on; pick Sonnet 4 or higher). It generates a printable single-page HTML.

```
Create a single-page HTML one-pager (~1100×850px, print-ready, dark mode)
visualizing how Coca-Cola flows through the SELL-SIDE AdCP workflow.

Visual style:
  - Dark mode: bg #0F1115, surfaces #1A1D23
  - Accent: #38B6FF · Success: #66BB6A · Warning: #D4A017 · Error: #EF4444
  - JetBrains Mono for IDs/numbers; Inter for prose
  - Inline SVG arrows (no external deps)
  - 12-column grid · 8px padding rhythm · generous whitespace

Header: "Coca-Cola · Sell-side workflow"
Subtitle: "Brand → media-buy in 5 stages — linear pipeline anchored on
agentic-advertising registry brand.json"

LEFT-TO-RIGHT 5-stage flow with arrows:

Stage 1 — BRAND RESOLUTION
  • GET /brands/resolve?domain=coca-cola.com
  • SWR cache: 1h fresh / 24h hard TTL · etag revalidation
  • industries: Food and Drink, Beverages (registry-original)
  • classification: master · house_domain: cola-cola.com
  • palette + logos + fonts from brand.json

Stage 2 — SIGNALS FAN-OUT (parallel)
  • Brief: "food and drink + beverages buyers in Coca-Cola core markets"
  • 2 signals agents in parallel:
      - Evgeny: openai-te3-small-d512 cosine sim →
        cross-taxonomy bridge (9 source taxonomies) →
        UCP penalty model → top-20
      - Dstillery: behavioral black-box
  • pickTopSignals: coverage_percentage DESC, dedupe by id, top-3

Stage 3 — CREATIVE + BRAND-RIGHTS GATE
  • Celtra + Advertible parallel
  • Chosen formats: display_300x250, native_in_feed, dooh_billboard
  • Brand-rights gate: classification=master → all owned;
    DOOH escalates to needs_clearance (physical distribution)

Stage 4 — PRODUCTS + GOVERNANCE
  • get_products per buying agent (Adzymic, Claire, Swivel)
  • Filtered by signals × formats × brand
  • Governance preview: industries × signal attestations
    Coca-Cola → only catch-alls (GDPR + CSBS), both attested → ALLOW

Stage 5 — MEDIA BUY
  • create_media_buy per agent
  • Per-vendor adapter rules (Sec-48r6 table)
  • Idempotency key (FNV-1a) + signal_attestations[] (8 claims)
  • Auth-gate detection: regex match → amber callout
  • Partial-result rebalance: $1000 → $1000/live agent

Below the 5 stages: a horizontal "TRUST PIPELINE" strip showing how
DTS v1.2 + v1.3 attestations flow alongside the data:
provenance · consent · freshness · coverage · 8 policy claims.

Bottom-right footnote: "Same brand, same brief, same registry —
produces a deterministic media-buy contract. Auth-gating at the
mutation boundary is the workshop punchline."
```

---

## B. BUY-SIDE workflow (Campaign Canvas)

### Mental model

A DSP holds the campaign. Bid requests stream in from many SSPs. Each must be answered in 50–100ms. Strategy and outcomes form a **continuous control loop**, not a pipeline.

**Carry-through example:** Coca-Cola Summer Refresh — `kpi: ROAS 3.5x`, `budget: $250K`, `flight: 2026-04-15 → 2026-05-30`, `geo: US`.

### Stage 0 — Campaign brief

**Source code:** `src/domain/dspMock.ts` — 3 demo campaigns (Coca-Cola / Nike / Pfizer)

**Coca-Cola Summer assumptions:**
- `kpi: "ROAS"`, `kpi_target: 3.5x`
- `budget_total_usd: 250,000`, `budget_daily_cap_usd: 10,000`
- `freq_cap_per_user: 5`
- `flight_start: 2026-04-15`, `flight_end: 2026-05-30` (45 days; day 14 = "today" in demo state)
- `geo: ["US"]`
- `audience_brief: "food and drink + beverages buyers in Coca-Cola core markets"`

**`audience_brief` is the hand-off point from sell-side to buy-side** — same string as the Canvas-derived brief.

### Stage 1 — Bid strategy declaration

**Source code:** `generateBidStrategy()` in `src/domain/dspMock.ts` — mocking unspec'd `submit_bid_strategy`

**Decision rules:**

1. **Algorithm selection:**
   - `BRAND_LIFT` campaigns → `fixed_cpm` (predictable; advertiser cares about reach, not auction wins)
   - Others → `second_price` (60%) or `first_price` (40%) — modeled after RTB market shift away from second-price
2. **Base bid:** for CPM campaigns, derived directly from KPI target × `(0.85 + rand × 0.20)`; for ROAS/CPA, `$5.50–$9.50`
3. **Bid modifiers** (multiplicative stack):
   - `audience_match` ×1.25 (signal-derived audience hit)
   - `contextual_brand_safe` ×1.10 (page-level brand-safe)
   - `dayparting_peak` ×1.15 (18:00–22:00 local)
   - `frequency_decay` ×0.70 (after 3 impressions/user, taper)
   - `BRAND_LIFT` only: `viewability_premium` ×1.30 (>75% viewable)
4. **Floor strategy:**
   - `BRAND_LIFT` → `respect_publisher` (premium inventory, don't squeeze)
   - others → `negotiate_down`
5. **Pacing strategy:** `CPM` campaigns ASAP-spend; ROAS/CPA → even pacing
6. **Brand-safety floor:** `BRAND_LIFT` ≥85/100 DV/IAS; others ≥70
7. **Viewability floor:** `BRAND_LIFT` ≥75%; others ≥50%
8. **Dayparting:** 24-hour multiplier table — 18:00–22:00 ×1.15, 02:00–05:00 ×0.6, lunch ×1.05, default ×1.0

**For Coca-Cola Summer:** `second_price` algo, base bid `$5.50–$9.50`, all 4 modifiers active, even pacing, brand-safety floor 70, viewability 50%.

### Stage 2 — Bid stream (60-minute window)

**Source code:** `generateBidStream()` in `src/domain/dspMock.ts` — mocking unspec'd `get_bid_opportunities`

**Decision rules:**
1. `base_qps = daily_cap / 86400 × 1000` → very rough scaling
2. Per minute-bucket: `requests = base_qps × 60 × (0.85 + rand × 0.30)` (15% volatility)
3. **Bid rate** = 12–20% of requests we actually bid on (not every request matches our targeting)
4. **Win rate** = 18–30% of bids we submit (we lose ~75% of auctions, normal for RTB)
5. **Avg winning CPM** = KPI-derived ± 30%
6. **Latency p50** = 35–55ms; p95 = 70–110ms

**Why these numbers?** Industry benchmarks:
- Win rate < 30% is normal; 50%+ means floor stripping
- p95 < 100ms is required by most SSPs to stay in auctions
- Bid rate of 15% means audience targeting is tight (good)

**For Coca-Cola Summer at $10K/day:**
- ~115 QPS bid requests received
- ~17 QPS bids submitted (15% bid rate)
- ~4 wins/sec (24% win rate)
- avg winning CPM ~$6 (mid-range)
- p95 latency ~85ms

### Stage 3 — SSP performance + brand-safety filter

**SSP fan-out** (`generateSspPerformance`):
- 7 SSPs: PubMatic, Magnite, Index Exchange, OpenX, Microsoft Xandr, TTD OpenPath, FreeWheel
- Each gets per-campaign deterministic stats:
  - `win_rate_pct`: 12–40
  - `avg_winning_cpm`: target × (0.80–1.20)
  - `audience_match_rate_pct`: 38–88 (how often our audience signal matches the impression's user)
  - `bid_qps`: per-SSP slice of total
  - `latency_p95`: 60–140ms
  - `trend_24h`: up/flat/down per ranking

**Composite ranking:** `win_rate × match_rate` — top SSPs get higher share-of-spend allocated proportionally.

**For Coca-Cola Summer:** PubMatic typically tops the composite (CPG-heavy SSP); FreeWheel CTV lower (no CTV creative in this campaign).

**Brand-safety filter** (`generateBrandSafety`, mocking pre-bid filter):
- `block_rate_pct` = 6–10% for normal campaigns; **18–24% for BRAND_LIFT** (much stricter)
- 6 reasons distribution (sums to 100%):
  - `brand_safety_category_breach` 42%
  - `viewability_below_floor` 28%
  - `geo_jurisdiction_excluded` 12%
  - `frequency_cap_hit` 10%
  - `page_not_brand_aligned` 5%
  - `audience_match_fail` 3%
- DV/IAS score average 78–94; predicted viewability avg 62–82%
- Filter latency p50: 8–20ms (must be fast, runs before bid)

**For Coca-Cola Summer:** ~8% block rate, ~85 DV/IAS avg, ~70% predicted viewable.

### Stage 4 — Pacing + delivery

**Source code:** `generatePacing()` in `src/domain/dspMock.ts` — mocking unspec'd `get_pacing_status`

**Decision rules:**
- `target_per_day = budget_total / days_total`
- `daily_target_capped = min(target_per_day, daily_cap)`
- Per-day actual = `target × (0.85 + rand × 0.35)` (drift)
- `cum_variance_pct = (cum_actual - cum_target) / cum_target × 100`
- **Pacing health classification:**
  - `|variance| < 5%` → `on_track`
  - `variance > 5%` → `over` (will exhaust budget early)
  - `variance < -5%` → `under` (won't spend full budget)

**For Coca-Cola Summer day 14 of 45:**
- target cumulative = `$250K × (14/45) = $77,777`
- actual cumulative ≈ `$80,200` (roughly on track, minor over)
- variance ~`+3%` → `on_track`
- impressions = `spend / cpm × 1000` ≈ ~13M cumulative

**Spend allocation across multiple buying agents** (`src/domain/spendAllocator.ts`, Wave 4):
- 4 strategies: `equal_split` / `score_weighted` / `priority_first` / `cap_then_split`
- Cents-precision; rounding-drift redistributed to largest allocation
- Returns per-agent USD + share + plain-language rationale

### Stage 5 — Attribution + optimization signals (the feedback loop)

**Source code:** `generateAttribution()` in `src/domain/dspMock.ts` — mocking unspec'd `optimize_strategy`

**Decision rules:**
1. CTR = 0.08–0.20% (industry display range)
2. CVR = 1.2–3.2% on clicks
3. AOV = $24–$80
4. **Realized KPI calculation:**
   - `ROAS` = `conversion_value / spend`
   - `CPM` = `spend / impressions × 1000`
   - `CPA` = `spend / conversions`
   - `BRAND_LIFT` = synthetic 9–15%
5. **Status:**
   - Lower-is-better (CPM/CPA): `realized < target × 0.95` = `above` (good); `> 1.05` = `below` (bad)
   - Higher-is-better (ROAS/BRAND_LIFT): inverse

**Optimization signals** — 4 per campaign, one of each kind:
- **`boost`**: top SSP share-of-spend up
- **`decay`**: drift-down SSP share-of-spend trim
- **`shift`**: audience-segment reallocation
- **`alert`**: dayparting suppress

**Strategy diff feedback** — 3 explicit lines showing what would change in the next strategy cycle (e.g. `bid_modifier['audience_match'] multiplier: 1.25 → 1.35`).

**For Coca-Cola Summer:**
- conversions ~ `4,800` · conv_value ~ `$190K`
- realized ROAS ~ `2.4x` against `3.5x` target → `below` (red badge)
- recommendations: boost PubMatic, decay OpenX, shift to in-market segments, suppress 02-05 hours
- diff: `bid_modifier['audience_match'] 1.25 → 1.35`, drop `ssp_openx`, suppress dayparting 02-05

### Closed-loop arrow

Visual reminder on Canvas: **optimization signals feed back into the strategy lane**. This loop runs continuously (mocked once per Canvas load).

In production this is where the buyer agent would call its own `submit_bid_strategy` with the diff — but **0 of 8 buying agents advertise that primitive**.

### Buy-side trust contract layers

| Layer | What it covers |
|---|---|
| **TCF / GPP / MSPA** | per-impression consent attestation (production-side; our mock abstracts into `block_rate.audience_match_fail`) |
| **DV / IAS / Peer39** | pre-bid scores per page (mock: avg DV/IAS score) |
| **Brand-safety floor** | enforced at strategy level (≥70 or ≥85) |
| **Frequency cap** | consent-derived obligation enforced in pre-bid filter |

### Buy-side workshop punchline

**The 4 unspec'd primitives — 0 of 8 buying agents advertise any of these:**
- `submit_bid_strategy`
- `get_bid_opportunities`
- `get_pacing_status`
- `optimize_strategy`

**This is the largest spec gap remaining in 3.0 GA.** Buy-side discovery + plan-level buy is in the spec; the real-time control loop is not. When that gap closes — same posture as the governance and brand-rights primitives — buyer agents become first-class participants in the auction layer.

**What IS live (lifecycle):**
- `create_media_buy` · `update_media_buy` · `get_media_buy_delivery` · `get_media_buys` — **8/8 buying agents** advertise these
- We orchestrate them live via `/dsp/media-buys/live`, `/dsp/campaigns/:id/fire-live`, `/dsp/campaigns/:id/update-live`

### 🎨 Claude.ai Design prompt — Buy-side one-pager

> Paste into [claude.ai/new](https://claude.ai/new) with artifact rendering. Generates a printable HTML one-pager.

```
Create a single-page HTML one-pager (~1100×850px, print-ready, dark mode)
visualizing the BUY-SIDE DSP control loop for Coca-Cola Summer Refresh.

Visual style:
  - Dark mode: bg #0F1115, surfaces #1A1D23
  - Accent: #38B6FF · Success: #66BB6A · Warning: #D4A017 · Error: #EF4444
  - JetBrains Mono for IDs/numbers; Inter for prose
  - Inline SVG (no external deps)

Header: "Coca-Cola Summer Refresh · Buy-side workflow"
Subtitle: "DSP control loop — bid → win/loss → optimize → bid"

Layout: 2x3 GRID of cards with a curved feedback arrow returning from
bottom-right back to top-left (the "↻ continuous" loop).

Top-left: CAMPAIGN CARD
  KPI: ROAS 3.5x (target)
  Budget: $250,000 ($10K/day cap)
  Flight: 2026-04-15 → 2026-05-30 (day 14 of 45)
  Frequency cap: 5/user
  Geo: US
  Audience brief: "food and drink + beverages buyers
                   in Coca-Cola core markets"

Top-middle: BID STRATEGY (Lane 1)
  algorithm: second_price · base_bid: $7.20 CPM
  modifiers: audience_match ×1.25 · contextual_brand_safe ×1.10 ·
             dayparting_peak ×1.15 · frequency_decay ×0.70
  pacing: even · floor: negotiate_down
  brand_safety_floor: ≥70 · viewability_floor: ≥50%
  Inline 24-hour dayparting bar chart.

Top-right: BID STREAM (Lane 2)
  ~115 QPS bid requests · ~17 QPS bids submitted (15% bid rate)
  ~4 wins/sec (24% win rate) · avg winning CPM $6.05 ·
  latency p95 85ms
  Inline 60-bar wins/sec sparkline.

Middle-left: SSP MATCH (Lane 3a)
  Mini table of 7 SSPs sorted by composite:
    PubMatic ↑ 32% win · 78% match
    Magnite → 28% · 65%
    Index ↓ 22% · 58%
    OpenX ↓ 18% · 49%
    Xandr → 24% · 70%
    TTD OpenPath ↑ 30% · 75%
    FreeWheel CTV → 12% · 38%
  Share-of-spend bars next to each.

Middle-middle: BRAND SAFETY (Lane 3b)
  evaluated 13M imps · blocked 1.04M (8%)
  Top reasons: brand_safety_category_breach 42%,
  viewability_below_floor 28%, geo_excluded 12%, freq_cap 10%
  avg DV/IAS 85/100 · avg viewable 70%

Middle-right: PACING / DELIVERY (Lane 4)
  ON_TRACK badge · variance +3%
  spent: $80,200 of $250,000 (32%) · 14d / 45d
  Mini per-day variance bar chart (14 bars, mostly green).

Bottom-left: ATTRIBUTION (Lane 5a)
  conversions: 4,820 · value: $192,800
  realized ROAS 2.40x vs target 3.5x · BELOW TARGET (red badge)

Bottom-middle: OPTIMIZATION SIGNALS (Lane 5b)
  4 cards stacked, color-coded by kind:
    BOOST   ssp:pubmatic       +14% efficiency  conf 87%
    DECAY   ssp:openx          -6% efficiency   conf 72%
    SHIFT   audience:in_market +18% lift        conf 79%
    ALERT   dayparting:02-05   low fill, high CPM  conf 91%

Bottom-right: STRATEGY DIFF (next cycle)
  → bid_modifier['audience_match'] multiplier: 1.25 → 1.35
  → ssp_allowlist: drop ssp_openx, promote ssp_pubmatic priority-1
  → dayparting hours 02-05: multiplier 0.6 → 0.0 (suppress)

Curved SVG arrow from bottom-right back to top-middle (Bid Strategy):
  "↻ feedback loop — re-tune strategy each cycle"

Below the grid, a small caption:
  "All 4 buy-side primitives mocked locally —
  submit_bid_strategy, get_bid_opportunities, get_pacing_status,
  optimize_strategy. Unspec'd in AdCP 3.0 GA across all 11
  directory agents. Lifecycle (create/update/delivery/buys)
  is live on 8/8 buying agents."
```

---

## C. How sell-side and buy-side connect

The single hand-off point is `audience_brief`:

```
SELL-SIDE                              BUY-SIDE
─────────                              ────────
  Stage 0.5 derives:
   "food and drink +
    beverages buyers in       ─────►   Stage 0 campaign card
    Coca-Cola core markets"             reads it as audience_brief
                                         │
  Stage 1 fans out get_signals          │
   on this string against                │
   Evgeny + Dstillery                    │
                                         ▼
                                       Stage 1 bid strategy
                                       Stage 2 bid stream
                                       (and so on)
```

Both Canvases use the SAME string. Sell-side uses it to discover signals + creative + products. Buy-side uses it to brief the bid strategy + feed audience-match scoring.

This is intentional — there's no explicit handoff endpoint because in production the same agent would carry the brief end-to-end (sell-side discovery feeds the buy-side execution). Today our two Canvases are visualizing two halves of one logical agent's work.

---

## D. References — code locations

| Concern | File |
|---|---|
| Brand resolution + SWR cache | `src/routes/brandRegistry.ts` |
| Industry enrichment overlay | `src/domain/brandIndustryOverrides.ts` |
| Sell-side workflow orchestration | `src/domain/workflowOrchestration.ts` |
| Sell-side workflow endpoints | `src/routes/agentsEndpoints.ts` |
| Vendor adapter rules (Sec-48r6) | `src/domain/workflowOrchestration.ts` (`applyVendorAdapter`) |
| Policy registry (14 policies) | `src/domain/policyRegistry.ts` |
| Governance preview mock | `src/domain/governanceMock.ts` |
| Brand-rights preview mock | `src/domain/brandRightsMock.ts` |
| Sponsored-Intelligence preview mock | `src/domain/sponsoredIntelligenceMock.ts` |
| Buy-side mock (3 demo campaigns + 5 generators) | `src/domain/dspMock.ts` |
| Buy-side endpoints | `src/routes/dspRoutes.ts` |
| Spend allocation (4 strategies) | `src/domain/spendAllocator.ts` |
| Run annotations (KV-backed thread) | `src/domain/runAnnotations.ts` |
| Per-agent circuit breaker + retry + async polling | `src/federation/genericMcpClient.ts` |
| Agentic core (LLM client) | `src/domain/agenticCore.ts` |
| Agentic brief expander | `src/domain/agenticBrief.ts` |
| Agentic tool planner | `src/domain/agenticPlanner.ts` |
| Agentic memory + recovery + remediation | `src/domain/agenticHelpers.ts` |
| Agentic endpoints (refine + critique + corrections + chat + execute stream) | `src/routes/agenticRoutes.ts` |
| Canvas client (all 3 tabs) | `src/routes/demo.ts` (lives inside a TS template literal — see `feedback_script_tag_template_trap` memory note) |

---

## E. Workshop trust contract (for May 7 deck)

Putting both sides together, the workshop trust narrative:

| Layer | Sell-side | Buy-side |
|---|---|---|
| **Identity / discovery** | brand.json from agentic-advertising registry | campaign card (manual today; would be agentic in production) |
| **Audience trust** | DTS v1.2 + v1.3 attestations on each signal | TCF/GPP/MSPA per-impression consent |
| **Compliance gate** | governance preview (mock, predictive) | brand-safety pre-bid filter (mock; DV/IAS/Peer39 in production) |
| **Rights gate** | brand-rights preview (mock) | none today |
| **Mutation safety** | idempotency_key on every fire-buy | idempotency for `update_media_buy` (handled by 5.25.1+ retry policy) |
| **Audit trail** | history/replay/permalinks + run annotations | (would be ad-server logs in production) |

**Headline finding for the workshop:**

> AdCP 3.0 GA covers sell-side discovery + plan-level buy with strong identity and audience-trust layers. The compliance + rights + sponsored-intelligence layers are spec'd or proposable but **0 vendors implement them**. The buy-side bid-time control loop has **no domain at all yet**. Our adapter mocks every gap visibly so the spec gap is auditable, not glossed.
