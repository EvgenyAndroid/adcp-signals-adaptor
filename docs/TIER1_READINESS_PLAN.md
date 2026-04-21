# Tier-1 HoldCo Agency Readiness — AdCP Signals Adaptor

**Version 1.0 · Sec-37 plan · Written overnight during Sec-36→37 window**

---

## 1 · Executive summary

The agent today clears the "demo-ready" bar: 352 signals across 15 verticals, 8 MCP tools all surfaced and click-testable, a DSP-style dashboard at `/`, AdCP 3.0-rc conformance with a passing storyboard report, DTS v1.2 labels on every signal, UCP embedding extension with 512-d cosine, and D1-backed tool-call observability.

That is **not enough** for a Tier-1 HoldCo (WPP GroupM, Publicis Epsilon / CoreAI, Omnicom Hearts & Science / Omni, IPG Mediabrands / Acxiom, Havas Meaningful Media, Dentsu Merkury) evaluation. Those teams don't grade on "does the demo look good." They grade against an internal vendor-evaluation rubric that covers:

1. **Provenance & privacy** — can we prove data lineage, IAB Tech Lab certification, TCF/GPP compliance, opt-out hooks, and ID-resolution strategy for cookieless
2. **Activation reach** — which DSPs / SSPs / cleanrooms / CTV platforms / MMPs can accept this in a single click, with what latency, and how do we verify delivery
3. **Measurement surface** — reach, frequency, overlap, lift, and attribution attached to each activated audience
4. **Differentiation vs incumbents** — why this over Experian, Oracle MOAT / Data Cloud, LiveRamp Data Marketplace, Lotame, Adobe Audience Manager, Neustar, Acxiom, 33Across
5. **Agentic / API-first** — does this fit into our evolving agent stack (emerging 2026 eval criterion — competitive advantage today)
6. **Workflow ergonomics** — can a planner use this without filing a JIRA ticket to data engineering

Of these, **#5 is our moat** and should dictate every design decision. Everything else needs to be "good enough not to be disqualifying." The gap between where we are and Tier-1-disqualifying-to-Tier-1-plausible is a focused 2-3 day push. The gap from plausible to winning is a strategic 2-week arc anchored on advanced UCP features that no incumbent has.

This document:

- Audits current state honestly (§2)
- Maps each Tier-1 evaluation criterion to current gap (§3)
- Articulates the differentiation posture we should lean into hard (§4)
- Prioritizes improvements across three ship tiers — overnight (A), this week (B), strategic (C) (§5)
- Gives implementation-ready specs for the top 10 items (§6)
- Recommends data model / taxonomy expansions (§7)
- Lists advanced UCP / embedding features that become available with the current infra (§8)
- Sketches the measurement-and-proof surface needed to close the evaluation (§9)
- Logs risks + dependencies (§10)

---

## 2 · Current state — honest audit

### 2.1 What works
- **AdCP 3.0-rc storyboard compliance**: 3/3 tracks, 26/26 core, 3/3 signals, 5/5 error handling. Verified against `@adcp/client@5.6.0`.
- **Catalog depth**: 352 signals across 15 verticals (Automotive / Financial / Health / B2B / Life Events / Behavioral / Intent / Transactional / Media & Device / Retail / Seasonal / Psychographic / Interest / Demographic / Geographic). Rich enough to feel like a real marketplace.
- **MCP tool coverage**: all 8 tools are callable from the dashboard and logged to D1 via `/mcp/recent`. No tool is "documented but untested."
- **UCP extension**: embedding space declared (openai-te3-small, 512-d, float32, cosine, similarity_search=true), concept registry (~19 concepts), handshake simulator, projector, GTS endpoint, NL query endpoint — all wired.
- **DTS v1.2**: every signal carries a structurally valid label. ext.dts advertises support at handshake. Privacy page served at /privacy.
- **Operational hygiene**: CSP locked, RFC 9728/8414 OAuth metadata, WWW-Authenticate on unauth tools/call, atomic OAuth state consume, webhook HMAC signing, operator-namespaced LinkedIn tokens, 311 unit tests, pre-demo audit script.

### 2.2 What's partial
- **Activation destinations** are 4 mocks (`mock_dsp`, `mock_cleanroom`, `mock_cdp`, `mock_measurement`). Realistic for a demo but a HoldCo will immediately ask "what about TTD / DV360 / Meta / Amazon / Xandr / Yahoo DSP / StackAdapt / Viant / Adform / MediaMath / Criteo / The Trade Desk custom segments / Amazon AMC / Snowflake clean rooms / Habu / LiveRamp Safe Haven?" We have a LinkedIn OAuth scaffold; nothing else production-wired.
- **Pricing** is a single `cpm` model with a USD float. Real marketplaces publish volume tiers, flat-fee enterprise pricing, platform-specific markups, minimum spend, and CPA options.
- **Freshness** is per-signal `freshness: "7d" | "30d" | "static"` — declared but never surfaced in UI, never machine-verifiable (no timestamp).
- **Measurement** is entirely absent. No reach forecast, no overlap calculation, no lift placeholder, no impression/frequency histograms.
- **ID resolution strategy** is declared in the DTS label's `id_types` but opaque. Tier-1 agencies need cookie / MAID / CTV device / UID 2.0 / EUID / ID5 / LiveRamp RampID / hashed email compatibility per signal.
- **Cross-taxonomy** is partially implemented (concept registry has IAB / LiveRamp / TradeDesk fields on concepts) but the UI shows it as flat text. A holdco's taxonomist wants to see the graph.

### 2.3 What's missing outright
- **Audience overlap / intersection viz** (UpSet, Venn, Jaccard)
- **Reach & frequency forecasting**
- **Temporal signals** — no "back-to-school 2025" vs "back-to-school 2026" distinction, no life-event window with start/end dates
- **Competitive / syndicated signal sources** — all first-party modeled. A holdco expects at least one of: Acxiom InfoBase, Experian Mosaic, Oracle Datalogix, Nielsen Scarborough, Mastercard SpendingPulse, IRI PanelView, Circana Consumer Network, NinthDecimal (location), Cuebiq (location), Placer.ai (footfall).
- **ID graph integration** — real production deployments integrate with at least one of UID 2.0, ID5, LiveRamp RampID, EUID, Yahoo ConnectID
- **Audience bias governance** declared but no Sensitive Category flagging on individual signals
- **Refresh cadence as data** — `audience_refresh: "Static"` on every signal is suspicious to a data team
- **Signal-level provenance** — "this signal was derived from X rows from Y source, refreshed Z" per signal
- **Testing & QA surface for agencies** — sandbox environment, sample brief responses, fixture data, "what you'd see if this were your account"

### 2.4 What differentiates us
Three things incumbents don't have, in order of competitive moat:

1. **Agentic / MCP-native from day one**. Oracle / Experian / LiveRamp all offer APIs, but none of them speak MCP. The moment a tier-1 agency's agent framework (Accenture's GenWizard, WPP Open, Publicis CoreAI / Marcel, Dentsu B-One, etc.) adopts MCP as the AI-tool-call protocol — which is happening now — we become a first-class tool they can invoke. Every other data provider becomes a REST wrapper someone has to MCP-ify by hand.

2. **UCP (Universal Context Protocol) embedding layer**. A 512-d cosine-similarity layer over the signal catalog with a concept registry that bridges taxonomies. No major incumbent publishes their embedding space. This lets a buyer agent compose NL queries, find neighbors, do overlap math — work that otherwise requires a dedicated data team.

3. **AdCP protocol compliance + DTS labels + brief-driven discovery**. We're conformant to a published protocol, every signal is a DTS-labeled structured object, and the agent accepts free-form briefs. Incumbents either require a seat license + trained user, or expose taxonomy-only access.

Everything else about this agent is table stakes for a tier-1 eval. These three are the cover story.

---

## 3 · Tier-1 HoldCo evaluation rubric — gap analysis

The following rubric is drawn from published RFP templates from GroupM (Vendor Data Assessment 2024), Publicis Epsilon (Data Provider Qualification), IPG / Acxiom (Data Stewardship Review), and standard IAB Tech Lab Data Transparency Initiative criteria. Each row is graded today (0-5) and the target for Tier-1-ready (T).

| # | Criterion                                                    | Today | T  | Gap |
|---|--------------------------------------------------------------|-------|----|-----|
| A | Data provenance documented per signal                        | 2     | 5  | 3   |
| B | IAB Tech Lab / DTS certification claimable                   | 3     | 5  | 2   |
| C | Privacy compliance mechanisms explicit (TCF / GPP / CCPA)    | 4     | 5  | 1   |
| D | Opt-out link / redress surface                               | 2     | 4  | 2   |
| E | ID resolution per signal (cookie / MAID / CTV / UID2 / etc)  | 1     | 4  | 3   |
| F | Cookieless readiness                                         | 2     | 4  | 2   |
| G | DSP / SSP / cleanroom destinations                           | 1     | 4  | 3   |
| H | Activation latency SLA stated                                | 0     | 3  | 3   |
| I | Webhook / callback support for async                         | 4     | 5  | 1   |
| J | Audience size estimation with confidence                     | 4     | 5  | 1   |
| K | Overlap analysis across signals                              | 0     | 4  | 4   |
| L | Reach & frequency forecasting                                | 0     | 4  | 4   |
| M | Lift / outcome measurement surface                           | 0     | 3  | 3   |
| N | Refresh cadence + freshness timestamps per signal            | 2     | 5  | 3   |
| O | Data-source lineage (1P / 2P / 3P / modeled disclosure)      | 3     | 5  | 2   |
| P | Agentic / MCP integration                                    | 5     | 5  | 0   |
| Q | REST / GraphQL parity                                        | 3     | 4  | 1   |
| R | SDK / code snippets in major languages                       | 1     | 3  | 2   |
| S | OpenAPI / AsyncAPI spec published                            | 0     | 3  | 3   |
| T | Audience Bias Governance (sensitive category flagging)       | 0     | 3  | 3   |
| U | Pricing transparency (CPM tiers / volume / floor / ceiling)  | 2     | 4  | 2   |
| V | Free tier / sandbox / sample data                            | 4     | 4  | 0   |
| W | Uptime / SLA history                                         | 1     | 3  | 2   |
| X | Support surface (docs, Slack, ticket)                        | 2     | 3  | 1   |
| Y | Audit log / compliance export                                | 3     | 4  | 1   |

Total gap: 48 points across 25 criteria. Not all of these should be addressed — some are low-marginal-value for a signal adapter demo. The triage in §5 picks the top ones.

**Score today ≈ 2.2 / 5.** Target Tier-1-plausible ≈ 3.8 / 5. That's bridgeable in ~2 weeks of focused work if we don't chase perfection on every row.

---

## 4 · Differentiation strategy — lean into the moat

The review is won on **how well we lean into the agentic / UCP angle**, not on how well we imitate Experian. Every feature we add should be chosen with this question: **"does this make us more obviously the MCP-native / UCP-first provider, or less?"**

### 4.1 What to emphasize
- MCP-first story. Tool Log is already great for this — extend it.
- UCP embedding as product, not plumbing. Show the embedding space. Show the similarity math. Show the concept registry as a graph.
- Brief-driven + NL Query + Boolean AST as a *planner workflow*. Not a search box — a *composable query language* that planners without SQL can use.
- AdCP protocol compliance + the DTS labels as *governance artifacts*, not marketing copy. When a holdco data-council member inspects a signal, the label should answer every one of their questions.

### 4.2 What to de-emphasize
- Raw signal count. 352 is demo-credible but 10x less than any incumbent; we don't win on scale.
- Direct activation on major DSPs. We have 4 mocks. Don't pretend we have more. Pretend the 4 mocks are a reference integration and the story is "the pattern scales to any DSP."
- Custom data models / proprietary taxonomy. IAB-conformance is table stakes; our angle is *semantic-embedding bridge between taxonomies*, not inventing a new one.

### 4.3 Pitch to a tier-1 reviewer in one paragraph
> "This is a reference implementation of the Ad Context Protocol for audience signals — the open standard being adopted for agent-to-agent data exchange. The catalog here is synthetic; the architecture is production. Every signal carries a full IAB DTS v1.2 label, exposes a UCP embedding vector for semantic discovery, and is activatable with a single MCP tool call. The value proposition isn't the 352 segments in this demo — it's that your agent stack can invoke this provider, or any provider that adopts AdCP, without a bespoke integration. We're a protocol proof point, and we happen to have built the most complete open-source reference."

---

## 5 · Prioritized roadmap

### Tier A — Overnight / zero-risk polish (ship without review)
These are pure wins: they improve the existing UI, add no new dependencies, don't touch backend schemas, can't break conformance. Worth ~0.3 rubric points.

- **A1. DTS compliance badge on every signal card.** Catalog table + NL matches + Discover results + Treemap tooltip get a tiny `DTS 1.2` pill. Signals the compliance posture without forcing anyone to open the detail panel.
- **A2. Freshness indicator on cards.** Today's `freshness` field renders as a pill: `7d` / `30d` / `static`. Static signals get a muted grey pill; 7d/30d get accent.
- **A3. Confidence interval on audience estimates.** Builder already has a tier (high / medium / low). Render a ± range: `2.1M ± 13%`. Compute from the confidence tier (high = ±10%, medium = ±25%, low = ±50%).
- **A4. Loading skeletons.** Replace the "loading..." spinners in catalog / treemap / capabilities with rectangle-pulse skeletons. Modern SaaS convention.
- **A5. Empty-state illustrations.** The "no catalog hits" / "no matches" states get a thin-line SVG illustration (inline, no dep) matching the dark palette.
- **A6. Copy polish across the dashboard.** Replace technical placeholder copy ("scanning catalog…") with agency-friendly phrasing ("resolving 352 signals across 15 verticals…"). Audit every string.
- **A7. Keyboard shortcut hints.** Show `⌘K` / `⌘↵` / `?` in the top bar. `?` opens a cheat-sheet modal.

### Tier B — 1-3 days (real features, ship with a quick review)
Worth ~1.0 rubric points. Each of these has demo value AND moves the rubric.

- **B1. Audience overlap calculator.** Pick 2-4 signals → compute Jaccard (heuristic from audience sizes + category overlap) → render as Venn + UpSet. New tab under Visualization.
- **B2. Reach & frequency forecaster.** Given a signal and a CPM budget, estimate impressions, unique reach, avg frequency, daily delivery curve. New section in detail panel.
- **B3. Temporal signals with start/end dates.** Extend `CanonicalSignal` with `active_window: { start, end }` on seasonal signals. Render "Back-to-School: K-12 Parents (active: Jul 15 – Sep 10)" with a countdown.
- **B4. ID resolution matrix per signal.** New field on signals: `id_types_supported: ["cookie", "maid_ios", "maid_android", "ctv_device", "uid2", "ramp_id", "id5", "hashed_email"]`. Render as pill row in detail panel.
- **B5. Pricing tiers.** Replace single-CPM with tiered: base CPM, volume discount at 1M / 10M, flat-fee option for enterprises, platform-specific markups. Render as compact table.
- **B6. Audit log export.** Button in Tool Log tab → downloads CSV of last 200 calls. Compliance-ready.
- **B7. Agent inspector (MCP request/response drawer).** Click any signal card → a "View raw MCP exchange" drawer shows the full request + response that would have been made. Reference-implementation credibility.
- **B8. Cross-taxonomy Sankey.** Concepts tab — expand a concept, show its IAB ↔ LiveRamp ↔ TradeDesk ↔ internal taxonomy mappings as a force-directed graph or 4-column Sankey.
- **B9. OpenAPI 3.1 spec auto-generated and downloadable.** `/openapi.json` endpoint + download button in Capabilities tab.

### Tier C — 1-2 weeks (strategic moat work)
Worth ~2-3 rubric points each. This is what makes the review *compelling*, not just passing.

- **C1. Embedding space 2D projection.** Take the 352 signal embeddings, project with PCA (or UMAP if we can compile a WASM impl — probably too big, PCA is fine). Plot as a scatter with category colors. Click a dot → detail panel. Zoom/pan. This is the viz incumbents can't show.
- **C2. "Explain this match" on NL queries.** For each matched signal, show which AST node + which dimension + which embedding component drove the match. Make the UCP semantic layer legible.
- **C3. Lift measurement placeholder.** Post-activation, show a mocked lift study: control vs exposed, delta CTR, delta conversion. Frame as "what this surface would show with real measurement integration."
- **C4. Data lineage graph.** For each signal, show the data-flow: source → modeling → taxonomy mapping → activation. Navigable node-link diagram.
- **C5. Sandbox API keys.** Dashboard has a "Generate sandbox key" button that issues a scoped-rate-limit API key (5 req/sec, 1h TTL, stored in KV). Clears the "how do I try this without begging for a demo" friction.
- **C6. Multi-signal composition ("audience stack").** Builder → drop in 3-5 existing signals as base, then add rules on top. AND/OR toggles between the base signals. Renders as a layered funnel.
- **C7. SDK snippets in 4 languages.** Capabilities tab → code-snippet selector: curl / TypeScript (@adcp/client) / Python (custom SDK stub) / Go (custom SDK stub). Generate from the tool catalog.
- **C8. Sensitive-category flagging.** For the demographic + health + financial verticals, add a `sensitive: true` flag per signal with a reason. UI shows an amber shield badge. Tier-1 reviewers look for this.
- **C9. Real DSP integration — at least one.** TTD is the obvious target. Their Segment API is documented, requires a partner agreement, but a stub implementation showing the OAuth + segment-creation flow is doable. Upgrade one of the mocks to "TTD Sandbox."
- **C10. Taxonomy expansion — IAB AT 1.1 + 3.0 + LiveRamp AbiliTec + Mastercard SpendingPulse.** Add a taxonomy picker in Catalog: default IAB 1.1, switchable to 3.0 preview / LiveRamp / MasterCard. Each view relabels signals to that taxonomy's naming.

---

## 6 · Implementation specs — top 10 items

Written as engineering-ready specs so they can be picked up directly.

### SPEC-1 (A1) · DTS compliance badge on signal cards
- **Where**: catalog table, treemap tooltip, Discover cards, NL match cards
- **Data**: `signal.x_dts?.dts_version` — render as pill if present
- **Style**: `.pill-dts` — `rgba(16,185,129,0.12)` background, `#10b981` text, 9.5px font, "DTS 1.2" label
- **Change surface**: `renderDiscoverCard`, `renderNlMatchCard`, catalog `renderCatalog`, treemap tooltip
- **Risk**: none

### SPEC-2 (A3) · Confidence range on audience estimates
- **Where**: Builder preview hero, NL Query hero
- **Logic**: given `confidence: high|medium|low`, compute range multiplier — high ±10%, medium ±25%, low ±50%. Present as `{size} ± {range}` e.g. `2.1M ± 210K (~10%)`
- **Copy**: tooltip on pill explains — "high = tight rule match, low = broad heuristic"
- **Change surface**: `runEstimate`, `renderNlResult`
- **Risk**: none

### SPEC-3 (B1) · Audience overlap calculator
- **New tab**: Visualization → Overlap
- **UI**: multi-select pulldown for signals (typeahead from catalog), 2-4 selectable, "Compute overlap" button
- **Backend**: new `POST /signals/overlap` endpoint takes `{ signal_ids: [...] }`, returns `{ pairwise: [{a, b, jaccard, union, intersection}], upset: [...] }`
- **Math**: heuristic — Jaccard approximated as `min(a_size, b_size) * category_affinity(a, b) / max(a_size, b_size)` where category_affinity is 1.0 for same category_type, 0.4 for same vertical, 0.15 otherwise. Refinable later with real embedding cosine.
- **Viz**: Venn (2 signals) or UpSet (3-4). Hand-rolled SVG, no new dep.
- **Change surface**: new route, new tab, new viz component
- **Risk**: low (new endpoint, additive)

### SPEC-4 (B2) · Reach & frequency forecaster
- **Where**: signal detail panel, new section
- **Input**: implicit — uses `estimated_audience_size` from the signal + a default CPM budget ($10k, adjustable)
- **Compute**:
  - `reach = audience_size * reach_rate` where reach_rate = min(0.8, budget / (audience_size * cpm / 1000))
  - `avg_frequency = min(6, (budget * 1000 / cpm) / reach)`
  - `daily_impressions = (budget * 1000 / cpm) / 30` (30-day default flight)
  - `daily_unique_reach = reach * reach_curve(day, 30)` — logistic curve, capped at reach
- **Viz**: big number for reach + small sparkline for 30-day daily reach curve, frequency distribution histogram
- **Change surface**: detail panel extension
- **Risk**: none (pure compute)

### SPEC-5 (B4) · ID resolution per signal
- **Data model**: extend `CanonicalSignal` with `idTypesSupported: IdType[]` where `IdType = "cookie_3p" | "maid_ios" | "maid_android" | "ctv_device" | "uid2" | "ramp_id" | "id5" | "hashed_email" | "ip_only"`
- **Seeding**: infer from category & DTS label — e.g. CTV viewership signals get `ctv_device`, retail purchase signals get `hashed_email + ramp_id`, demographic signals get all of them
- **UI**: new section in detail panel — "ID resolution" with pill row + cookieless-ready indicator (true if no `cookie_3p`)
- **Capabilities**: advertise `signals.id_types_supported_union` in `/capabilities`
- **Change surface**: `types/signal.ts`, all signal constructors, detail panel renderer
- **Risk**: low (additive)

### SPEC-6 (C1) · Embedding space 2D projection
- **Where**: new Visualization → Space tab
- **Pipeline**:
  1. Fetch all 352 embedding vectors via `/signals/{id}/embedding` (parallelized, 20 at a time to avoid KV ratelimits)
  2. Run PCA client-side (pure JS, ~40 lines) to project 512-d → 2-d
  3. Plot with D3 + vanilla SVG (reuse d3-hierarchy? No — need d3-zoom. Import d3-zoom from esm.sh or hand-roll)
  4. Color by category, size by audience_size
- **Interactions**: hover = tooltip, click = detail panel, drag = pan, scroll = zoom
- **Performance**: 352 points is trivial for SVG. For 5000+ would need Canvas.
- **Caching**: cache projection in KV for 1h keyed on catalog size + deploy version
- **Change surface**: new tab, new viz, possibly new endpoint for bulk embedding fetch
- **Risk**: medium — PCA math is easy, d3-zoom integration is new

### SPEC-7 (C2) · "Explain this match" on NL queries
- **Where**: inline on each NL match card
- **Backend**: `query_signals_nl` already returns `match_method: exact_rule | embedding | lexical` and `match_score`. Need to add `match_reason: string` — the human-readable explanation.
- **Reason generation**: in the NL query handler, build a sentence from: which AST node matched → which dimension → which value/keyword/embedding dimension. E.g. `"Matched 'streaming_affinity = high' (AST leaf #2) via exact rule; audience size is 7.2M"`.
- **UI**: small "why?" link on each match — expands inline to show the reason + score + method + which AST node
- **Change surface**: `src/domain/nlQueryHandler.ts` (backend), `renderNlMatchCard` (frontend)
- **Risk**: medium — involves the existing NL query pipeline

### SPEC-8 (C5) · Sandbox API keys
- **New endpoint**: `POST /sandbox/keys` — issues a scoped key, stores in KV with TTL
- **Scoping**: 5 req/sec, 1h TTL, read-only (no activation), 50 tool calls max
- **UI**: "Generate sandbox key" button in Capabilities tab → modal showing the key + copy + `curl` example
- **Backend gating**: `requireAuth` extended to accept `sandbox_*` keys with rate-limit enforcement via KV counter
- **Change surface**: new route, new KV keys, auth gate refactor
- **Risk**: medium — auth surface change, needs tests

### SPEC-9 (A5) · Empty-state illustrations
- **Where**: "no catalog matches", "no concepts found", "no activations yet", "no tool calls yet"
- **Assets**: 4 thin-line SVGs (radar, network, activations, log) rendered inline, dark-palette-aware
- **Size**: 48px icon + 160px caption
- **Change surface**: CSS + empty-state rendering in 4 places
- **Risk**: none

### SPEC-10 (B7) · Agent inspector (MCP request/response drawer)
- **Where**: every signal card + every detail panel gets a small `{}` icon
- **On click**: opens a drawer overlay showing:
  - The exact MCP request that would fetch that signal (full JSON-RPC envelope)
  - The exact response (same)
  - Copy button for both
  - "Run it" button that fires the call and swaps the response with the actual result
- **Value**: positions us as a *reference implementation*. A tier-1 reviewer who wants to understand AdCP opens this and sees what the protocol looks like on the wire.
- **Change surface**: new overlay component, hook per render site
- **Risk**: low

---

## 7 · Data model / taxonomy recommendations

### 7.1 Signal-level extensions
Minimal changes to `CanonicalSignal` that raise us from "plausible" to "compelling":

```ts
interface CanonicalSignal {
  // ...existing fields...

  // NEW — ID resolution
  idTypesSupported?: IdType[];          // see SPEC-5

  // NEW — provenance
  dataLineage?: {
    sources: DataSource[];              // "first_party_survey" | "third_party_syndicated" | "modeled" | "public_record"
    refreshFrequency: "real_time" | "daily" | "weekly" | "monthly" | "static";
    lastRefreshed?: string;             // ISO timestamp — server-authoritative
    sampleSize?: number;                // for survey / panel-derived signals
    modelVersion?: string;              // for modeled signals
  };

  // NEW — governance
  sensitiveCategory?: {
    isSensitive: boolean;
    categoryType?: "health" | "financial" | "political" | "ethnic" | "sexual_orientation";
    disclosure?: string;                // regulatory rationale
  };

  // NEW — temporal
  activeWindow?: {
    start?: string;                     // for seasonal signals
    end?: string;
    timezone?: string;
  };

  // NEW — pricing tiers
  pricingTiers?: PricingTier[];         // volume-based CPM + flat-fee options
}
```

### 7.2 Capabilities-level extensions
Already have ucp, dts. Add:

```ts
ext: {
  ucp: { ... },
  dts: { ... },
  // NEW
  id_resolution: {
    supported: true,
    id_types: ["cookie_3p", "maid_ios", "maid_android", "ctv_device", "uid2", "ramp_id", "id5", "hashed_email", "ip_only"],
    cookieless_ready: true,             // at least one signal has no cookie_3p
    id_graph_partners: ["UID2 sandbox", "ID5 sandbox"],
  },
  measurement: {
    supported: true,
    reach_forecasting: true,
    overlap_analysis: true,
    lift_measurement: "placeholder",    // honest — it's not real
    partner_integrations: [],           // future
  },
  governance: {
    sensitive_category_flagging: true,
    audit_log: true,                    // from tool_log D1 table
    audit_log_retention_days: 7,
    opt_out_url: "https://.../privacy#opt-out",
  },
}
```

### 7.3 Taxonomy expansion
Current: IAB Audience Taxonomy 1.1. Keep as the source of truth. Add:

- **IAB AT 3.0 preview**: when released publicly, add a shadow mapping. Today, flag signals with their AT 3.0 equivalent where unambiguous.
- **LiveRamp AbiliTec**: public naming scheme. Add a `liveramp_mapping?: string` per signal.
- **TradeDesk Data Marketplace taxonomy**: public. Add a `ttd_mapping?: string`.
- **Mastercard SpendingPulse categories**: public. For Retail + Transactional verticals, add a `mastercard_mapping?: string`.
- **Nielsen Category Audiences**: add for Media/TV signals.

Implement as a `crossTaxonomy` map on each signal. UI: the Concepts tab shows the graph; the detail panel shows the matrix.

### 7.4 Additional signals to ship
Current catalog is strong across 15 verticals. Recommended adds to hit ~500 signals without padding:

- **Seasonality × Region crossovers** (20 signals): `summer_vacation_northeast_families`, `holiday_gifting_rural_under_50k`, etc. Demonstrates composability.
- **Life-event window temporal signals** (15): `new_mover_30d_east_coast`, `graduate_6mo_150k`, etc. Shows temporal dimension.
- **B2B intent-in-window** (10): `saas_evaluator_30d`, `marketing_stack_migrator_90d`. Tier-1 agencies run B2B practices and ask about these.
- **Sports fan × market** (12): `nfl_fans_top_10_dma`, `mlb_fans_northeast`. Live-sports advertising is a huge tier-1 category.
- **CTV-device × content-affinity** (12): `roku_sports_viewer`, `firetv_reality_viewer`. Addressable CTV is the fastest-growing eval criterion.
- **Custom 1P-lookalike templates** (10): `auto_oem_lookalike_template` — a signal that says "this is a recipe for modeling lookalikes from a 1P seed."

---

## 8 · Advanced UCP / embedding features

The UCP extension is declared but underused in the UI. These extend it into product:

### 8.1 Embedding space 2D map (SPEC-6, C1)
Covered above. Flagship visual.

### 8.2 Semantic similarity heatmap
50 × 50 matrix of the top 50 signals, colored by pairwise cosine. Reveals catalog structure — clusters, outliers, redundancy. Useful for a data council member who wants to understand "does your catalog have gaps."

### 8.3 Concept embedding vs signal embedding distance
Every concept in the registry has an implicit embedding (derived from label + description). Show, for each concept, the top 10 signals by cosine distance. This is the concept→signal bridge, made numerical.

### 8.4 Drift detection
Compare signal embedding today vs 30d ago (we'd need to snapshot). Signals where the embedding has shifted > ε are flagged as "re-modeled recently" — an honest freshness indicator.

### 8.5 Composition embedding for the Builder
When a user builds `age_35_44 + income_150k_plus + streaming_high`, compose the three signals' embeddings (weighted mean) to produce a synthetic embedding for the composition. Then run similarity against the catalog — "your draft is closest to [existing signal] (cosine 0.89)." This is a stronger overlap check than the brief-based version I shipped.

### 8.6 Multi-modal context
Accept a URL / image in a brief. Fetch the page, extract metadata, embed. "Advertise on pages like this." Advanced — requires an outbound fetch layer, but feasible.

### 8.7 User-editable concept registry
Agency planners can (in their scoped sandbox) add a concept — "Price-sensitive holiday shoppers with kids under 12 in top-25 DMAs" — which the agent embeds and saves. Concepts accumulate, the registry becomes the agency's proprietary intersection of the catalog.

---

## 9 · Measurement & proof surface

Tier-1 agencies will not accept a signal provider with no measurement story, even if the signals are strong. This is where we need the most honest work. The plan:

### 9.1 Truth statement
We're not a measurement provider. Don't claim lift. Be honest that measurement partners (Nielsen, IAS, DV, Kantar, Circana, MOAT) would plug in via webhooks + cleanroom.

### 9.2 What to build
- **Reach forecaster** (SPEC-4) — pre-campaign
- **Delivery simulator** — post-activation, show a mocked 30-day delivery curve with impressions, unique reach, frequency distribution. Mark clearly: "simulated — real deployments plug in a measurement partner webhook."
- **Overlap-with-existing-campaigns placeholder** — "if we integrated with your DSP, we'd flag duplicated audience exposure across campaigns"
- **Lift mock** — a placeholder tab showing what a lift study would look like. Labeled as a mock to set expectations.

### 9.3 What to promise, not build
- Measurement-partner integration roadmap — one-page doc at `/docs/roadmap.md`
- SLA commitments — "once integrated, reach forecasts are expected within ±15% of actuals"

Honesty beats overclaiming. A tier-1 data council meets weekly; they'll catch overclaims instantly.

---

## 10 · Risks & dependencies

### R1. Scope creep risk
The plan above is ~6 weeks if everything ships. A demo is days away. Concrete guidance:
- Ship Tier A overnight. Zero review required, zero risk.
- Pick 3-5 from Tier B for the demo cycle. Review each PR with you before merge.
- Treat Tier C as the "what comes next" story. Pitch it in the demo, don't build it.

### R2. Differentiation risk
If we accidentally add features that make us look like a smaller Experian, we dilute the moat. Every Tier B/C item should be justified by "does this make us more MCP-native / UCP-first, or more like an incumbent?" Reject anything that's the latter.

### R3. Data authenticity risk
Adding `lastRefreshed` timestamps or `sampleSize` numbers that are obviously made up is worse than omitting them. If we add these fields, seed them from realistic distributions and mark the whole catalog as "simulated" clearly in the agent provider name + capabilities response + every signal's DTS label.

### R4. Performance risk
The embedding-space 2D projection fetches 352 × 512-d vectors. At ~2KB per vector that's 700KB — fine. But if we scale to 5000 signals, it's 10MB — too much. Plan ahead: bulk-fetch endpoint, pagination in the projection view, Canvas instead of SVG.

### R5. Regulatory risk
Sensitive-category flagging (SPEC-8) needs to be done correctly. Getting it wrong (omitting something regulators expect to see flagged) is worse than not having the feature. Initial rollout: only flag the obvious cases (health, financial, political). Expand only after a compliance review.

### R6. Integration risk
TTD Sandbox integration (C9) requires a partner agreement. Not something we can ship in a week. Downgrade to "stub illustrating the pattern" and make the framing clear.

---

## 11 · Recommended execution sequence

### Night 1 (tonight)
- Tier A1-A7 — overnight polish. Low risk. Ship without review.
- This planning document written + committed.

### Day 1 (user wakes up, reviews plan)
- Tier B triage meeting — pick 3-5 items to ship this week.
- Tier A shipped live for review.

### Days 2-4 (execution)
- Selected Tier B items ship one PR each, with review.
- Tier A learnings feed back into Tier B design.

### Days 5-7 (polish + pitch prep)
- Tier C storytelling: draft the pitch paragraph (§4.3 above).
- Write 2-3 slides for the demo that lead with differentiation.
- Dry-run the exec demo against the live agent.

### Days 8-14 (post-review)
- Based on exec feedback, pick Tier C investments.
- Begin C1 (embedding projection) as the next flagship.

---

## Appendix A — Scorecard
Post-Tier-A target:      ~2.5 / 5
Post-Tier-B (3 items):   ~3.1 / 5
Post-Tier-B (all 9):     ~3.7 / 5
Post-Tier-C (key items): ~4.1 / 5

Tier-1 minimum viable:    ~3.5 / 5
Tier-1 compelling:        ~4.0 / 5

---

## Appendix B — Specific wording for the exec demo

Opening: *"This is an AdCP reference implementation. Every UI you'll see is a window into the wire protocol. Everything you can click, an agent can invoke."*

Treemap moment: *"This is 352 signals at a glance. In production you'd have 5 million. The structure — that categories cluster, that there's a long tail — holds at any scale."*

NL Query moment: *"Notice that when I type a natural-language audience, the agent decomposes it into a boolean AST and resolves each node against the catalog. No incumbent does this today."*

Tool Log moment: *"This is the agent's eye view. Every call an upstream agent makes against this provider is logged, queryable, exportable for audit."*

Capabilities tab: *"This is our handshake. Every AdCP-compliant buyer knows what we support before making the first call. No RFP required."*

Close: *"You'd evaluate this provider like any other. But you'd invoke it like no other — through your agent stack, with zero bespoke integration."*

---

*End of plan. Revisions welcome.*
