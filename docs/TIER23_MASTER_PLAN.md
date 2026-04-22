# Sec-41 · Tier 2 & 3 Master Plan — Advanced Analytics, Embedding Lab, A2A Federation

**Status:** execution underway (2026-04-21 post-Sec-40)
**Scope:** elevate the AdCP Signals Adaptor from a Tier-1 HoldCo-ready demo to a best-in-class marketplace with differentiated analytics, live agent-to-agent federation, and a wow-factor embedding lab.
**Audience:** HoldCo review committees (WPP/Publicis/Omnicom/IPG), technical buyer agents, AdCP protocol reviewers, vendor evaluation teams at Samba/Disney/Comcast/Roku.

---

## 1. Why Tier 2/3 now

Tier 1 (Sec-32 through Sec-40) delivered a complete, conforming AdCP Signals agent with a DSP-style demo UI, cross-taxonomy bridges, a rich capability declaration, weekly data hygiene, and a full developer kit. It is **feature-complete against the AdCP 3.0-rc specification** — every storyboard (Core 25/26, Signals 3/3, Error-handling 5/5) passes, `ext.{ucp, dts, id_resolution, measurement, governance}` is declared, the catalog spans ~435 audiences across 21 verticals.

That is table stakes. What is missing is the set of capabilities that separates a conforming reference implementation from a *marketplace that HoldCos adopt*:

1. **Applied analytics on top of the embedding space** — not just "we have 512-d vectors," but live arithmetic, analogy queries, custom similarity against arbitrary text, coverage-gap heatmaps, centroid analysis, neighborhood DNA.
2. **Portfolio-level reasoning** — not just "pick two signals, compute overlap," but "pick N signals that maximize reach at fixed CPM" with a Pareto frontier visualization, greedy marginal-reach allocation, information-theoretic overlap (KL divergence, mutual information) that goes beyond Jaccard.
3. **Agent-to-agent (A2A) federation** — calling other AdCP Signals agents live, cross-catalog similarity via Procrustes alignment, interop matrices, federated search. Dstillery's public MCP (`https://adcp-signals-agent.dstillery.com/mcp`) is the first real-world test bed.
4. **Temporal / seasonality intelligence** — seasonal decomposition, forward-looking audience recommendations, freshness decay curves, volatility indexing.
5. **Bespoke analysis surfaces** — semantic arithmetic (`luxury + millennial − urban`), analogy queries (`A is to B as C is to ?`), custom vector upload, 1P lookalike seed workflow, signal DNA fingerprints.

Tier 2/3 converts all of the above from "theoretical capability" into **live working surfaces**, each with a methodology explainer so a HoldCo analyst new to vector semantics can understand what they are looking at on first visit.

---

## 2. North-star metrics

| Dimension | Tier 1 baseline | Tier 2/3 target |
|---|---|---|
| Catalog size | ~435 signals | **~520 signals** (+~85 across B2B firmographic, retail media, CTV×Hispanic×daypart, weather-triggered, venue-fenced, 1P lookalikes) |
| Taxonomy bridges | 5 systems | **9 systems** (+ Oracle Moat, Experian Mosaic, Acxiom PersonicX, IRI ProScores) |
| Analytics endpoints | 3 (estimate, overlap, openapi) | **11** (+query-vector, arithmetic, analogy, neighborhood, portfolio/optimize, coverage-gaps, lorenz, federated-search, cross-sim) |
| A2A federation | 0 | **2+ live agents** (Dstillery wired, Scope3/NextData/Peer39 stubbed based on registry) |
| Advanced viz types | 5 (treemap, scatter, heatmap, Sankey, lineage) | **14+** (+ force graph, UMAP-local, chord, sunburst, parallel coords, Pareto, waterfall, DNA fingerprint, small multiples, analogy arrow, coverage heatmap) |
| Chart explainers | 10 | **every** chart has What/How/Read/Limits |
| Expected time on demo | ~5 min (treemap → detail) | **~20 min** (Embedding Lab → Portfolio Optimizer → Federation → Detail) |

---

## 3. Product posture: what we are differentiating on

The AdCP ecosystem now has multiple viable signals agents:

- **LiveRamp** (TypeScript MCP server, signals catalog)
- **Peer39** (contextual)
- **Scope3** (sustainability + signals)
- **NextData** (B2B intent)
- **Dstillery** (real-time audience graph, behavioral)
- **Samba TV / us** (MCP-native, UCP embedding bridge, IAB-DTS v1.2 label, cross-taxonomy)

Our differentiation, stack-ranked by strategic value:

### 3.1 Only agent with a live UCP embedding bridge + full analytics lab
UCP (Universal Context Protocol) is an emerging standard for semantic interop across agents. We have the only **live implementation** with:
- Real 512-d OpenAI text-embedding-3-small vectors stored per signal
- A Procrustes-aligned projector (`/ucp/projector`)
- A concept registry (`/ucp/concepts`)
- GTS identity anchors (`/ucp/gts`)
- A simulated cross-agent handshake (`/ucp/simulate-handshake`)

Sec-41 adds the **Embedding Lab** — every advanced vector operation a buyer agent would ever ask for, rendered live with methodology explanations.

### 3.2 IAB Data Transparency Standard v1.2, every signal
No other agent exposes a full per-signal DTS v1.2 label. We do — 27 fields per label, derived from the signal's actual `sourceSystems`, `rawSourceRefs`, and `audience_precision_levels`. Sec-41 extends this with **provenance graphs** and **authority scoring**.

### 3.3 Cross-taxonomy bridge with stage confidence
Every signal carries `x_cross_taxonomy` — deterministic predicted IDs in IAB 3.0, LiveRamp AbiliTec, TTD DMP, Mastercard SpendingPulse, Nielsen. Sec-41 extends this to 9 systems and adds **reverse-lookup** (paste a foreign ID, find our equivalent).

### 3.4 MCP-native audit + governance with declared data hygiene
7-day tool-call log in D1, CSV export, weekly purge cron, declared `ext.governance.data_hygiene` policy. Sec-41 adds **per-tool latency histograms** and **anomaly flagging**.

### 3.5 A2A federation via live Dstillery MCP
The marquee new capability. We're not just declaring "we could federate" — we call Dstillery live and render their catalog alongside ours.

---

## 4. Feature catalog (30 specs)

Each feature below has a full spec in a companion document. This section is the index + acceptance criteria.

### 4.1 Embedding Lab (centerpiece)

| # | Feature | Spec doc | Acceptance |
|---|---|---|---|
| EL-1 | **Custom similarity playground** — paste text or upload vector, get ranked neighbors | EMBEDDING_LAB_SPEC §2 | Live endpoint `POST /ucp/query-vector` returns ≤50 ranked matches with cosine; UI renders matches with hover explain |
| EL-2 | **Semantic arithmetic** — `luxury + millennial − urban` → audience matches | EMBEDDING_LAB_SPEC §3 | Live endpoint `POST /ucp/arithmetic` accepts `{base, plus[], minus[]}`; UI lets user compose expressions; limit 6 terms |
| EL-3 | **Analogy queries** — `A : B :: C : ?` vector arithmetic | EMBEDDING_LAB_SPEC §4 | Live endpoint `POST /ucp/analogy`; UI renders A→B arrow + C→? arrow in a 2D scatter |
| EL-4 | **k-NN force graph** | EMBEDDING_LAB_SPEC §5 | d3-force layout; click node to expand to next 5 neighbors; edges weighted by cosine |
| EL-5 | **UMAP-local 2D scatter** — iterative local refinement of JL projection | EMBEDDING_LAB_SPEC §6 | Better cluster separation than pure JL; fully client-side, runs ≤1s for 50 points |
| EL-6 | **Coverage-gap heatmap** | EMBEDDING_LAB_SPEC §7 | Grid over 2D projection; color = local density; highlight holes as "marketplace opportunities" |
| EL-7 | **Signal DNA fingerprint** | EMBEDDING_LAB_SPEC §8 | Deterministic SVG fingerprint per signal (spiral pattern encoded from vector); unique per audience |
| EL-8 | **Centroid analysis** | EMBEDDING_LAB_SPEC §9 | Per-vertical centroids; prototypical (closest to centroid) vs edge-case (furthest) signals highlighted |
| EL-9 | **Neighborhood explorer** | EMBEDDING_LAB_SPEC §10 | `POST /ucp/neighborhood` → 10 neighbors + local density stats + centroid distance |

### 4.2 Audience Portfolio Optimizer

| # | Feature | Spec doc | Acceptance |
|---|---|---|---|
| PO-1 | **Pareto frontier: reach × cost × specificity** | AUDIENCE_STATISTICS_SPEC §2 | 3D scatter with Pareto-optimal points highlighted; axis-pair projections |
| PO-2 | **Greedy marginal-reach allocator** | AUDIENCE_STATISTICS_SPEC §3 | Given N signals + budget, greedily select subset maximizing unique reach; show each addition's marginal contribution as waterfall |
| PO-3 | **Information-theoretic overlap (KL, MI)** | AUDIENCE_STATISTICS_SPEC §4 | Beyond Jaccard: compute Kullback-Leibler divergence + mutual information from category+geography distributions; tabular view |
| PO-4 | **Lorenz curve + Gini per slice** | AUDIENCE_STATISTICS_SPEC §5 | Catalog concentration analysis; `GET /analytics/lorenz?group=vertical` + UI |
| PO-5 | **Budget-constrained N-pick** | AUDIENCE_STATISTICS_SPEC §6 | User inputs budget + target reach; solver returns signal set + allocation |
| PO-6 | **What-if analyzer** | AUDIENCE_STATISTICS_SPEC §7 | Remove/add signal from portfolio; delta reach, delta CPM, delta overlap shown |

### 4.3 Agent Federation (A2A)

| # | Feature | Spec doc | Acceptance |
|---|---|---|---|
| AF-1 | **Agent registry** | AGENT_FEDERATION_SPEC §2 | `GET /agents/registry` returns curated agent list with capabilities flags; includes Dstillery (live), Peer39/Scope3/NextData (roadmap), Samba (self) |
| AF-2 | **Live Dstillery federation** | AGENT_FEDERATION_SPEC §3 | `POST /agents/federated-search` queries Dstillery's `/mcp` `get_signals` tool in parallel with ours; merged ranked results |
| AF-3 | **Cross-agent similarity via Procrustes** | AGENT_FEDERATION_SPEC §4 | `POST /agents/cross-similarity` aligns embedding spaces via shared anchor signals; reports alignment quality |
| AF-4 | **Interop matrix** | AGENT_FEDERATION_SPEC §5 | UI table: agent × capability (signals, activation, embedding, DTS, federation, …) |
| AF-5 | **Reverse cross-taxonomy lookup** | AGENT_FEDERATION_SPEC §6 | `POST /taxonomy/reverse` accepts foreign ID in any of 9 systems, returns our equivalent |
| AF-6 | **Federated audience comparison** | AGENT_FEDERATION_SPEC §7 | UI side-by-side: our catalog × Dstillery catalog for the same brief |

### 4.4 Temporal Intelligence

| # | Feature | Spec doc | Acceptance |
|---|---|---|---|
| TI-1 | **Seasonality decomposition** | BESPOKE_USE_CASES §2 | Per-signal seasonality profile (monthly multiplier 0.5–1.8×); synthetic but tied to signal category |
| TI-2 | **Forward-looking recommender** | BESPOKE_USE_CASES §3 | "Best signals for Q3 2026" — rank by forward-window seasonality × audience match |
| TI-3 | **Freshness decay curves** | BESPOKE_USE_CASES §4 | Per-signal decay half-life; UI shows decay curve; older signals visibly degrade |
| TI-4 | **Volatility index** | BESPOKE_USE_CASES §5 | Per-signal 0–100 volatility score; high volatility = high variance in reach over time |

### 4.5 Bespoke Analysis

| # | Feature | Spec doc | Acceptance |
|---|---|---|---|
| BA-1 | **Persona synthesis** | BESPOKE_USE_CASES §6 | Generate a human-readable persona card from a signal (name, age, occupation, day-in-life, media mix) |
| BA-2 | **Brief → portfolio** | BESPOKE_USE_CASES §7 | Paste a full brief; returns ranked signal portfolio with allocation weights |
| BA-3 | **1P lookalike seed workflow** | BESPOKE_USE_CASES §8 | Paste audience characteristics; modeled seed → lookalike matches from catalog |
| BA-4 | **Signal authority score** | BESPOKE_USE_CASES §9 | 0–100 per-signal authority = f(data_sources, inclusion_methodology, refresh cadence, precision); UI pill |

### 4.6 Polish & onboarding

| # | Feature | Spec doc | Acceptance |
|---|---|---|---|
| PL-1 | **Onboarding tour** | (this doc §8) | First-visit overlay walking through 10 panels; dismissible |
| PL-2 | **Every chart has explainer** | VISUALIZATION_COOKBOOK | Uniform What/How/Read/Limits block on every viz |
| PL-3 | **Updated keyboard cheat-sheet** | (this doc §9) | `g l` = Embedding Lab, `g p` = Portfolio, `g f` = Federation, `g s` = Seasonality |
| PL-4 | **Theme variants** | — | Default dark unchanged; light-mode toggle in topbar |
| PL-5 | **Inline demos / sample queries** | VISUALIZATION_COOKBOOK | Every empty state has 3 click-to-load sample queries |

---

## 5. Catalog expansion (+85 signals)

### 5.1 B2B Firmographic & Technographic (20)
High-value B2B signals missing from the Tier-1 catalog. HoldCos with CMO-tech accounts ask for these constantly.

- `b2b_firmo_fortune500_decision_makers` — Fortune 500 C-suite
- `b2b_firmo_smb_1_50_employees` — small business, 1-50 HC
- `b2b_firmo_midmarket_51_1000` — mid-market, 51-1000 HC
- `b2b_firmo_enterprise_1000_plus` — enterprise, 1000+ HC
- `b2b_firmo_highgrowth_yoy_30pct` — hypergrowth (YoY ≥30%)
- `b2b_techno_aws_customers` — AWS-committed
- `b2b_techno_gcp_customers` — GCP-committed
- `b2b_techno_azure_customers` — Azure-committed
- `b2b_techno_snowflake_users` — Snowflake
- `b2b_techno_databricks_users` — Databricks
- `b2b_techno_salesforce_admins` — Salesforce admins
- `b2b_techno_hubspot_users` — HubSpot
- `b2b_techno_segment_cdp_users` — Segment
- `b2b_techno_okta_customers` — Okta
- `b2b_techno_datadog_users` — Datadog
- `b2b_techno_kubernetes_shops` — Kubernetes in prod
- `b2b_funding_series_a_recent` — recent Series A (< 12mo)
- `b2b_funding_series_b_recent` — recent Series B (< 12mo)
- `b2b_intent_rfp_active_30d` — active RFP in last 30d
- `b2b_intent_analyst_mentions` — mentioned in Gartner/Forrester

### 5.2 Retail Media Network audiences (15)
Every major retailer now runs a retail media network. These are shoppable-intent signals often only available via RMN partnerships.

- `rmn_amazon_prime_subscribers` — Amazon Prime
- `rmn_amazon_high_aov_shoppers` — Amazon HH AOV $200+
- `rmn_walmart_connect_shoppers` — Walmart+ / Walmart Connect
- `rmn_target_roundel_shoppers` — Target Circle / Roundel
- `rmn_kroger_precision_loyal` — Kroger Precision Marketing
- `rmn_costco_members` — Costco members
- `rmn_homedepot_pro_contractors` — Home Depot Pro
- `rmn_lowes_onebuilder_contractors` — Lowe's contractors
- `rmn_wayfair_home_shoppers` — Wayfair home goods
- `rmn_sephora_beauty_insiders` — Sephora loyalty
- `rmn_bestbuy_tech_shoppers` — Best Buy My Best Buy
- `rmn_instacart_grocery_frequent` — Instacart frequent
- `rmn_ulta_beauty_loyal` — Ulta Ultamate
- `rmn_dollargeneral_value_shoppers` — Dollar General
- `rmn_nordstrom_luxury_shoppers` — Nordstrom

### 5.3 CTV × Hispanic × Daypart (12)
Hispanic CTV is the fastest-growing demo. Daypart crossovers are planner-critical.

- `ctv_hispanic_primetime_sports` — Hispanic × primetime × sports
- `ctv_hispanic_telenovela_viewers` — Telenovela viewers
- `ctv_hispanic_youth_esports` — Hispanic youth × esports
- `ctv_primetime_drama_en` — English prestige-drama × primetime
- `ctv_early_fringe_news` — early fringe × news
- `ctv_late_fringe_sports` — late fringe × sports
- `ctv_daytime_talk_shows` — daytime × talk
- `ctv_weekend_movies_premium` — weekend × premium movies
- `ctv_overnight_news_intl` — overnight × international news
- `ctv_streaming_kids_weekday` — kids × weekday streaming
- `ctv_streaming_docs_weekend` — docs × weekend streaming
- `ctv_streaming_foreign_language` — foreign-language streaming

### 5.4 Weather-triggered (8)
Contextual weather-triggered audiences.

- `weather_extreme_heat_heat_wave` — active heat-wave regions
- `weather_snow_storm_active` — active snow-storm regions
- `weather_hurricane_watch_coastal` — hurricane-watch coastal
- `weather_rain_7day_forecast` — 7-day rainy forecast
- `weather_sunny_beach_season` — sunny + beach-season
- `weather_allergy_high_pollen` — high pollen
- `weather_cold_snap_north` — cold snap in north
- `weather_drought_regions` — drought-classification

### 5.5 Geo-fenced venue audiences (15)
High-intent venue visitors, QSR competitive conquesting, stadium, etc.

- `venue_qsr_mcdonalds_visitors_30d` — McDonald's visitors
- `venue_qsr_chipotle_visitors_30d` — Chipotle visitors
- `venue_qsr_starbucks_regulars` — Starbucks regulars
- `venue_stadium_nfl_attendees` — NFL stadium attendees
- `venue_stadium_nba_attendees` — NBA stadium attendees
- `venue_airport_international_flyers` — int'l airport departure
- `venue_airport_business_class_lounge` — business-class lounge visits
- `venue_luxury_mall_visitors` — luxury mall visitors
- `venue_big_box_home_improvement` — big-box HI visitors
- `venue_gym_fitness_club_members` — gym members
- `venue_cinema_amc_regal_regulars` — cinema regulars
- `venue_hospital_frequent_visitors` — hospital visitors
- `venue_university_campus_regulars` — campus regulars
- `venue_casino_las_vegas_visitors` — LV casino visitors
- `venue_ski_resort_winter` — winter ski-resort

### 5.6 1P Lookalike Recipe Templates (10)
Extensions beyond the Sec-38 lookalikes; these are named recipes.

- `lal_recipe_bestbuy_vip_customers`
- `lal_recipe_amex_platinum_holders`
- `lal_recipe_luxury_auto_owners`
- `lal_recipe_disneyplus_power_users`
- `lal_recipe_peloton_all_access`
- `lal_recipe_lululemon_vip`
- `lal_recipe_shake_shack_regulars`
- `lal_recipe_equinox_members`
- `lal_recipe_wholefoods_amazon_prime`
- `lal_recipe_warby_parker_repeat`

### 5.7 Advanced contextual (5)
- `context_brand_safe_premium_news`
- `context_ai_generated_content_exclude`
- `context_sports_live_broadcast`
- `context_finance_bloomberg_readers`
- `context_technology_wsj_cnet_readers`

**Total new signals: 85.** Post-reseed catalog: **~520 signals.**

---

## 6. Schema & type additions

### 6.1 `CanonicalSignal` facets (new optional fields)

```typescript
seasonalityProfile?: {
  // 12-element array: multiplier for each month (Jan=0, Dec=11)
  monthly: number[];    // range ~[0.3, 2.0]
  peakMonth: number;    // index of peak
  annualAvg: 1.0;       // always normalizes to 1.0
};

decayHalfLifeDays?: number;   // data freshness half-life
volatilityIndex?: number;     // 0-100, variance in reach over time
authorityScore?: number;      // 0-100, derived from DTS methodology
idStabilityClass?: "stable" | "semi_stable" | "volatile";
```

### 6.2 Extended cross-taxonomy systems

Add to `crossTaxonomy.ts`:
- `oracle_moat` (contextual brand safety)
- `experian_mosaic` (lifestyle segmentation)
- `acxiom_personicx` (consumer lifestage)
- `iri_proscores` (shopper propensity)

### 6.3 `ext.analytics` capability block

```typescript
ext.analytics: {
  supported: true,
  endpoints: {
    query_vector:        { method: "POST", path: "/ucp/query-vector" },
    semantic_arithmetic: { method: "POST", path: "/ucp/arithmetic" },
    analogy:             { method: "POST", path: "/ucp/analogy" },
    neighborhood:        { method: "POST", path: "/ucp/neighborhood" },
    portfolio_optimize:  { method: "POST", path: "/portfolio/optimize" },
    coverage_gaps:       { method: "GET",  path: "/analytics/coverage-gaps" },
    lorenz:              { method: "GET",  path: "/analytics/lorenz" },
    federated_search:    { method: "POST", path: "/agents/federated-search" },
    cross_similarity:    { method: "POST", path: "/agents/cross-similarity" },
    reverse_taxonomy:    { method: "POST", path: "/taxonomy/reverse" },
  },
  methods: {
    similarity_metric:       "cosine",
    arithmetic_model:        "vector_l2_normalized",
    analogy_algorithm:       "3cos_add",
    portfolio_solver:        "greedy_marginal_reach",
    overlap_metrics:         ["jaccard", "kl_divergence", "mutual_information"],
    projection_algorithms:   ["jl_random", "umap_local_refine"],
  },
  limits: {
    max_arithmetic_terms:    6,
    max_portfolio_signals:   20,
    max_neighborhood_k:      50,
    max_query_vector_dim:    512,
  },
};
```

### 6.4 `ext.federation` capability block

```typescript
ext.federation: {
  supported: true,
  protocol: "adcp_a2a_v0.1",
  partners: [
    { id: "dstillery", url: "https://adcp-signals-agent.dstillery.com/mcp",
      stage: "live", last_probed: "2026-04-21T23:27:49Z" },
    { id: "peer39",    url: "https://…", stage: "roadmap" },
    { id: "scope3",    url: "https://…", stage: "roadmap" },
    { id: "nextdata",  url: "https://…", stage: "roadmap" },
  ],
  alignment_method: "procrustes_svd_shared_anchors",
  cache_ttl_seconds: 600,
};
```

---

## 7. Endpoint inventory (additions in bold)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/capabilities` | GET | public | handshake |
| `/signals/search` | GET | bearer | catalog search |
| `/signals/estimate` | POST | public | audience sizing |
| `/signals/overlap` | POST | public | pairwise/N overlap (Jaccard) |
| `/signals/:id/embedding` | GET | public | 512-d vector |
| **`/ucp/query-vector`** | **POST** | **public** | **custom vector search** |
| **`/ucp/arithmetic`** | **POST** | **public** | **semantic arithmetic** |
| **`/ucp/analogy`** | **POST** | **public** | **analogy queries** |
| **`/ucp/neighborhood`** | **POST** | **public** | **k-NN + local density** |
| `/ucp/projection` | GET | public | 2D projection (JL) |
| `/ucp/similarity` | GET | public | pairwise cosine matrix |
| `/ucp/concepts` | GET | public | concept registry |
| `/ucp/gts` | GET | public | GTS anchors |
| `/ucp/projector` | GET | public | Procrustes matrix |
| **`/portfolio/optimize`** | **POST** | **public** | **Pareto/greedy optimizer** |
| **`/analytics/coverage-gaps`** | **GET** | **public** | **embedding-space holes** |
| **`/analytics/lorenz`** | **GET** | **public** | **concentration analysis** |
| **`/agents/registry`** | **GET** | **public** | **federation partner list** |
| **`/agents/federated-search`** | **POST** | **public** | **fan-out A2A query** |
| **`/agents/cross-similarity`** | **POST** | **public** | **cross-agent alignment** |
| **`/agents/:id/capabilities`** | **GET** | **public** | **proxied partner caps** |
| **`/taxonomy/reverse`** | **POST** | **public** | **foreign ID → ours** |
| `/mcp` | POST | bearer (tools/call) | JSON-RPC MCP |
| `/mcp/recent` | GET | public | 7-day tool log |
| `/admin/reseed` | POST | bearer | catalog rebuild |
| `/admin/purge` | POST | bearer | manual purge |
| `/openapi.json` | GET | public | spec |
| `/privacy` | GET | public | policy |

**11 new endpoints.** Total: 28.

---

## 8. UI surface additions

New tabs: **Embedding Lab**, **Portfolio**, **Federation**, **Seasonality**. Plus the existing 11 tabs.

### 8.1 Embedding Lab tab

Three-column layout:
- **Left**: Query composer — text input, vector upload, seed picker, arithmetic builder
- **Center**: Main visualization — force graph / scatter / heatmap (toggleable)
- **Right**: Result list — top N neighbors with methodology explain

Sub-panels accessible via intra-tab nav:
- `playground` — custom similarity
- `arithmetic` — compose queries
- `analogy` — A:B::C:? explorer
- `neighborhood` — pick a signal, explore
- `coverage` — gap heatmap
- `centroids` — prototypical vs edge-case
- `dna` — fingerprint gallery

### 8.2 Portfolio tab

- **Frontier**: Pareto scatter (reach vs cost, filterable by specificity)
- **Builder**: N-pick interface with marginal-reach waterfall
- **Metrics**: KL divergence + mutual information table alongside Jaccard
- **Lorenz**: catalog concentration curve per vertical

### 8.3 Federation tab

- **Registry card grid**: Dstillery (live) + stubbed partners
- **Federated search**: one input, fans out, merged result list with agent badges
- **Interop matrix**: agent × capability table
- **Cross-similarity**: given a local signal, show matches from partner catalogs

### 8.4 Seasonality tab

- **Heatmap**: signal × month, color = multiplier
- **Current window picker**: "Best signals for [month/quarter]"
- **Decay explorer**: pick a signal, see its freshness decay
- **Volatility distribution**: histogram across catalog

### 8.5 Onboarding tour (first-visit)

7-step dismissible overlay:
1. Discover — brief + NL query
2. Catalog — filter, sort
3. Detail panel — expand modes, explainers
4. Treemap — catalog at a glance
5. Embedding Lab — vector operations
6. Portfolio — reach optimization
7. Federation — A2A live call

---

## 9. Keyboard shortcut extensions

| Keys | Action |
|---|---|
| `g d` | Discover |
| `g c` | Catalog |
| `g b` | Builder |
| `g t` | Treemap |
| `g o` | Overlap |
| `g e` | Embedding |
| `g k` | Capabilities |
| `g v` | Dev kit |
| `g n` | Destinations |
| `g l` | Embedding **Lab** (new) |
| `g p` | **Portfolio** (new) |
| `g f` | **Federation** (new) |
| `g s` | **Seasonality** (new) |
| `f` | Expand/cycle detail panel |
| `?` | Cheat sheet |
| `Esc` | Close overlays / step narrower |

---

## 10. Ship order & PR decomposition

| PR | Scope | Mergeable? |
|---|---|---|
| **#56 — Sec-41a** | 6 planning docs + schema additions + catalog expansion (85 signals) + `ext.analytics` + `ext.federation` + 4 analytics endpoints (query-vector, arithmetic, coverage-gaps, lorenz) | yes |
| **#57 — Sec-41b** | Embedding Lab UI (EL-1..EL-9) + endpoints (analogy, neighborhood) | yes, depends on #56 |
| **#58 — Sec-41c** | Agent Federation (AF-1..AF-6) + live Dstillery integration + Portfolio Optimizer (PO-1..PO-6) | yes, depends on #57 |
| **#59 — Sec-41d** | Seasonality tab + signal authority score + onboarding tour + polish | yes, depends on #58 |

Each PR squash-merged + deployed before the next begins. Master always shippable; production always verifiable.

---

## 11. Verification gates per PR

Before merging each PR:
1. `tsc --noEmit` → zero errors in `src/` (test files may carry pre-existing errors)
2. `wrangler deploy --dry-run` → clean build
3. `curl /capabilities` → new ext blocks land
4. `curl` new endpoints → live responses match spec
5. Storyboard re-run (`@adcp/client` conformance) → Core 25/26 + Signals 3/3 + Error 5/5 all green
6. Manual UI smoke: open new tab, click 3 sample queries, verify rendering

---

## 12. Risk register

| Risk | Mitigation |
|---|---|
| Dstillery MCP rate-limits our federation calls | 10-minute KV cache on `/agents/*` responses; circuit-breaker after 3 failures |
| Embedding Lab vector ops explode in bundle | No deps; pure math in < 500 lines; compute on server where possible |
| UMAP-local diverges from JL and breaks earlier scatter | Keep both; toggle between them; default to JL |
| Cron purge deletes in-flight activation mid-request | Purge ceiling is 30 days on activations; race is impossible |
| 85 new signals bloat catalog response | `max_results` default stays 5; pagination unchanged; reseed is single-run |
| Analogy queries produce nonsense for out-of-distribution terms | Return score alongside result; UI shows confidence badge |
| Light-mode theme uncovers hard-coded dark colors | Scope changes to new surfaces; test on every tab |

---

## 13. Success criteria (HoldCo review sign-off)

After Sec-41 ships, a HoldCo reviewer landing on the demo should:

1. **Within 2 min** — see embedding arithmetic produce meaningful results (e.g. "luxury + millennial → luxury millennial auto intenders")
2. **Within 5 min** — successfully query two agents simultaneously via federation and see merged results
3. **Within 10 min** — run a portfolio optimizer with budget constraint and see a Pareto frontier
4. **Within 15 min** — understand every chart via its What/How/Read/Limits explainer without asking a human
5. **Within 20 min** — conclude this is the most comprehensive AdCP Signals reference implementation publicly available

---

## 14. Post-Sec-41 roadmap (Tier 4, future)

Not in scope for this build but worth calling out:

- **Real OAuth to TTD / DV360** (activation flows, not just capability declarations)
- **LLM-generated persona synthesis** (currently template-based)
- **True UMAP** via WASM if bundle permits
- **Live A/B test simulator** with holdout cohort persistence
- **Peer39 / Scope3 / NextData live integration** (all currently stubbed as roadmap)
- **Measurement-partner bridges** (Nielsen DAR, Circana, Kantar)
- **Contextual × IAB 3.0 bridge** (our bridge today is audience-side only)

---

## 15. Execution telemetry

Building silently during an 8h window on 2026-04-21. Target completion: ~2026-04-22 07:30 ET. Each PR numbered #56..#59 in order; final deploy verified against prod endpoints.

*Document length: 5200 words. Companion specs total ~20000 words combined.*
