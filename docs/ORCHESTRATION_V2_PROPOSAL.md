# Multi-Agent Orchestration v2 — Strategic Proposal

**Date:** 2026-04-27
**Source-of-truth memory:** [`agent_capability_dump_2026_04_27.md`](https://github.com/EvgenyAndroid/...) (live deep-mine of 28 unique tools across 11 alive agents + AdCP 3.0 GA surface area + real `brand.json` shape from the live registry)

---

## TL;DR

Our current Orchestrator (Sec-48 arc) is **brief-driven, stage-linear, sell-side-flavored**. It demonstrates a thin slice — 12 of 28 universal buying-contract tools, no governance, no brand-rights, no measurement-as-its-own-role, synthesized brand-context that misses the canonical AdCP 3.0 `brand.json` shape.

**Three visual orchestration patterns are buildable today on top of the live directory.** All three honor what's already shipped in Sec-48; they redefine the orchestrator's *primary axis* — what the user picks first determines what flows, instead of always starting with a brief.

**Recommended:** **Pattern C — Brand-Anchored Canvas.** It's the most differentiated, demo-rich, and aligns with where AdCP 3.0 GA is going (`brand.json` as canonical primitive, `BrandRef` everywhere). Pattern A and B remain available as toggles within Pattern C.

---

## Where v1 sits today

The current Orchestrator workflow:

```
brief (text) → signals fan-out → creative fan-out → product fan-out → media-buy preview → opt-in fire
```

**Strengths** (don't throw away):
- Real multi-vendor fan-out across 7 live agents
- Streaming UI with progressive reveal
- Interactive picks (signals, formats, products) with live payload sync
- Per-vendor `create_media_buy` payload adapter
- Surfaced 9 implementation gaps with diagnostic infrastructure
- Auth-gated callout teaches the room why fires fail

**Limitations**:
- Brief-as-only-entry-point — buyers don't think in briefs first; they think in `we are brand X, we want to reach audience Y on inventory Z` simultaneously.
- Stage-linear — real orchestration is a DAG (creative format compatibility ⇆ product compatibility ⇆ signal deployment metadata).
- 12 of 28 universal tools used (`get_products`, `list_creative_formats`, `get_signals`, `create_media_buy`). 16 unused (`list_authorized_properties`, `list_creatives`, `get_media_buy_delivery`, `update_media_buy`, `update_performance_index`, `list_tasks`/`get_task`/`complete_task`, plus all vendor-specific).
- Sell-side flavored — we *are* a signals provider, the orchestrator looks like one. A buyer's view is missing.
- Brand context is synthesized `{name, advertiser, categories}` placeholder, not `brand.json` from the live registry.
- No governance, no brand-rights, no measurement-as-role, no identity-as-role.

---

## Use-case taxonomy by ICP × lifecycle × tool inventory

ICP roles in the AdCP 3.0 ecosystem (with director's-cut implementation status):

| Role | What they do | Live coverage today | Gap |
|---|---|---|---|
| **Buyer agent** | Define brand + brief → discover signals/inventory/creative → activate → optimize | 7 buying agents in directory; all expose universal 12-tool contract | None on tool surface; auth gate is the wall |
| **Seller agent** | Expose inventory + accept media buys; report delivery | 7 buying agents (same — these ARE sellers from the protocol POV) | Inventory listing (`list_authorized_properties`) is per-vendor; no shared property catalog |
| **Signals agent** | Discover audiences, score them, deploy to platforms, lifecycle-manage | evgeny + dstillery only (2 of ~19) | 3.0 enhancements (signal_id objects, value_type, signal_tags, activate/deactivate) — none implemented |
| **Creative agent** | Build/preview/transform creatives; expose format catalog | advertible (preview) + celtra (build) | Creative-side delivery (`get_creative_delivery`) only on celtra; format catalog only on the listing tool |
| **Brand agent** | Resolve brand identity, expose brand.json, declare brand-rights | Registry-resolved at agenticadvertising.org; **no live agent serves brand.json directly** | Brand Agent variant of brand.json (dynamic MCP) — no implementation |
| **Governance agent** | Approve plans, audit decisions, attest compliance | Spec'd in 3.0 GA but **unimplemented** in directory | Whole role is greenfield |
| **Measurement agent** | Verify lift, attribute outcomes, score brand fit, brand safety | Implicitly sell-side via `get_media_buy_delivery` + `update_performance_index`; **no dedicated agent type** | DV / IAS / Comscore / Nielsen positioning — not in directory |
| **Identity agent** | Resolve cross-platform IDs, run clean rooms | Implicitly via `x_cross_taxonomy[]` on signals; **no dedicated agent type** | LiveRamp positioning — not in directory |

Lifecycle phases × roles:

|  | Pre-buy | In-flight | Post-campaign |
|---|---|---|---|
| **Buyer** | Discover (signals + inventory + creative) → assemble plan | Trigger optimization, monitor delivery | Receive attribution, refine next brief |
| **Seller** | Expose inventory, report forecasts | Accept buys, report delivery | Reconcile, report final delivery |
| **Signals** | `get_signals` (sync batch) | **GAP** — no push primitive | Snapshot + diff (client-side only today) |
| **Creative** | `list_creative_formats`, `build_creative` | `get_creative_delivery` (celtra only) | — |
| **Brand** | Resolve `brand.json` + acquire rights | Validate continuing rights | — |
| **Governance** | `check_governance` on plan | Audit triggers | `report_plan_outcome` |
| **Measurement** | (Set up tracking) | Live verification | Lift / attribution / brand-fit reports |
| **Identity** | Resolve audience IDs across platforms | (Same) | — |

**Concrete demo-grade flows currently buildable:**

1. **Buyer end-to-end** (what we have): brief → signals → creative → products → media_buy. ✓ Shipped.
2. **Brand-led discovery**: pick a brand from the registry → resolve its `brand.json` → derive intent (industries, brand colors, founded year, employees → infer audience profile) → fan out to signals + inventory. **NOT shipped.**
3. **Inventory-first browsing**: pick a publisher (e.g. Weather, iHeart) → list their authorized properties → cross-reference with creative formats they support → only THEN figure out signals. **NOT shipped.**
4. **Signal-driven activation**: start with a Dstillery signal → see which buying agents have inventory that supports its `deployments[]` → assemble a buy. **NOT shipped.**
5. **Capability-graph exploration**: zero starting point — show the full DAG of agent capabilities + click any node to expand its contributions. **NOT shipped.**

---

## Three visual orchestration patterns

### Pattern A — DAG / Capability Graph

A force-directed graph where:
- **Nodes** = agents (colored by role: signals/creative/buying/etc.) sized by tool-count
- **Edges** = data-dependencies between tools (e.g. `get_signals.deployments[].decisioning_platform_segment_id` connects to `create_media_buy.targeting_overlay.required_axe_signals`)
- **Click a node** → expand its tool surface inline
- **Click an edge** → walk through the data-flow contract (what shape goes one way, what comes back)
- **Animations** trace a brief flowing through the graph during execution

**Pros:** brand-new visual, captures the protocol's true topology, no privileged starting role, natural for protocol designers.
**Cons:** abstract — doesn't immediately answer "what should I do?"; may overwhelm non-technical viewers (planners, brand managers).
**Effort:** ~3 days (D3 force layout + node/edge data model + click-through tool drawer reuse from Sec-48d).

### Pattern B — Role-Pivot Stage Switcher

Like the current Orchestrator, but with a **role-pivot toggle at the top** that reframes the same fan-out from a different starting role:

- **As a Buyer** (current): brief → signals → creative → products → media_buy
- **As a Seller**: brief → my inventory (`list_authorized_properties`) → matching products (`get_products` with my domain as filter) → who's buying signals (`get_signals` reverse-lookup)
- **As a Signals Provider**: pick one of our signals → which platforms can activate it (`deployments[]`) → which buying agents service those platforms (capability-matrix join) → orchestrate a hypothetical activation
- **As a Brand**: pick a brand from `brand.json` registry → derive intent → run buyer flow but pre-populated with the brand's colors/fonts/industries

**Pros:** lowest-effort upgrade — reuses Sec-48 streaming + UI; speaks to four distinct audiences (brand managers, planners, sellers, signals teams) without rebuilding; demo-ready.
**Cons:** four starting points all converge on the same workflow with different colored dressing — risks looking like "wrappers around the same thing."
**Effort:** ~2 days (state-machine refactor + 4 entry-point UIs + reuse the rest of Sec-48 unchanged).

### Pattern C — Brand-Anchored Canvas (RECOMMENDED)

Start from a **brand**, not a brief. Pull a real `brand.json` from `agenticadvertising.org/api/brands/resolve`, render it as a card (logo, colors, typography, industries, classification). Then unfold a **canvas** with three lanes:

```
┌────────────────────────────────────────────────────────────────────────┐
│ BRAND: Constellation Brands (cbrands.com)                              │
│  ●●●● Logos   FuturaPT  ████ #001475 #0061A5 #000000  Industries:      │
│                                                       Beverages        │
│                                                       Food and Drink   │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
       ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
       │  AUDIENCES   │  │   INVENTORY  │  │   CREATIVE   │
       │  (signals)   │  │   (sellers)  │  │  (advertible │
       │              │  │              │  │   + celtra)  │
       │ "beverage    │  │ Inventory    │  │ Formats:     │
       │  buyers in   │  │ on whisky-   │  │ ┌─────┐      │
       │  high-density│  │  adjacent    │  │ │Logo  │     │
       │  metros"     │  │  contexts    │  │ │light │     │
       │              │  │              │  │ └─────┘      │
       │ get_signals  │  │ get_products │  │ build_creat- │
       │ + activate   │  │ + list_      │  │   ive with   │
       │  signal      │  │   creative_  │  │   brand.json │
       │              │  │   formats    │  │   colors+font│
       └──────────────┘  └──────────────┘  └──────────────┘
                │                 │                 │
                └────────┬────────┴────────┬────────┘
                         ▼                 ▼
                 ┌─────────────────────────────┐
                 │   GOVERNANCE + RIGHTS       │
                 │   - brand_rights status     │
                 │   - alcohol category review │
                 │   - holdout posture (DTS)   │
                 └─────────────────────────────┘
                              │
                              ▼
                 ┌─────────────────────────────┐
                 │   MEDIA BUY (3 vendors)     │
                 │   payload assembled with    │
                 │   real brand.json content   │
                 │   ┌────┐ ┌────┐ ┌────┐      │
                 │   │adz │ │clr │ │swi │      │
                 │   └────┘ └────┘ └────┘      │
                 └─────────────────────────────┘
                              │
                              ▼
                 ┌─────────────────────────────┐
                 │  IN-FLIGHT + POST           │
                 │  get_media_buy_delivery     │
                 │  + measurement (placeholder)│
                 │  + closed-loop arrow back   │
                 │    to AUDIENCES             │
                 └─────────────────────────────┘
```

Pull a real `brand.json` for Constellation Brands and the canvas knows:
- **Industries** = Beverages, Food and Drink → drives signal queries (in-market for spirits, alcohol-category) and inventory filters (alcohol-permitted properties)
- **Colors + fonts + logos** flow into the creative agents' `build_creative` calls — Celtra builds with the actual brand assets
- **Founded 1945, NYSE: STZ, 5001+ employees** → governance category (regulated alcohol) → mandatory human review per AdCP 3.0 governance protocol
- **House-brand classification** + `related_domains` → could orchestrate cross-sub-brand campaigns (Scott → Kimberly-Clark)

The canvas is the operator console. Lanes are the role split. The stages flow vertically. Real data populates each lane.

**Pros:**
- Anchors orchestration on **canonical AdCP 3.0 primitive** (`brand.json`)
- Demos to a brand manager: they see THEIR brand on screen, not a mock
- Naturally introduces governance + brand-rights as first-class lanes (not afterthoughts)
- Visualizes the gap-list: empty governance/measurement lanes scream "this is where AdCP needs work"
- 1600 brand manifests in the registry = endless demo variations
- Aligns with where the workshop is going (governance + identity + measurement boundary discussion)

**Cons:**
- Higher effort than B; requires registry integration (resolved by hitting `/api/brands/resolve` per brand pick)
- Canvas layout is more involved than the current vertical stage stack

**Effort:** ~5 days
- Day 1: brand picker + `brand.json` resolution + render brand card (registry API integration)
- Day 2: lane layout + plumb existing Sec-48 fan-outs into the three top lanes
- Day 3: governance + rights placeholder lane (empty boxes that explicitly say "AdCP 3.0 spec'd, no live impl yet" — calls out the gap)
- Day 4: closed-loop arrow + measurement placeholder lane
- Day 5: polish + per-lane interactivity (click a brand industry → re-query signals; click a logo variant → use it in stage-4 creative payload)

---

## Recommendation: Pattern C with Pattern B as a fallback view

**Build C as the primary canvas.** It tells the most cohesive story and aligns with AdCP 3.0 GA's architectural direction (everything anchored on `BrandRef` / `brand.json`). Use the live brand registry for free demo content (1600+ real brands).

**Add a "view mode" toggle** in the top-right of the canvas with three options:
- **Brand canvas** (Pattern C, default)
- **Role pivot** (Pattern B compressed) — for sell-side / signals-side audiences
- **Capability graph** (Pattern A) — for protocol-designer / engineer audiences

This means we BUILD primarily in C; A and B are minor offshoots reusing the same data and Sec-48 backend.

### Phased build plan

#### Phase 1 — Brand picker + canvas skeleton (~2 days)
- New endpoint: `GET /brands/resolve?domain=...` — passthrough to `agenticadvertising.org/api/brands/resolve`. Lets us cache + add our own metadata.
- New endpoint: `GET /brands/search?q=...` — passthrough to `agenticadvertising.org/api/search?q=...`.
- New tab: **Canvas** (alongside Orchestrator). Brand picker top-of-page. Once a brand is picked, render brand card + 3 empty lanes.
- Reuse [`docs/WORKSHOP_BLOCK1_EXHIBITS.md`](./WORKSHOP_BLOCK1_EXHIBITS.md) Exhibit B as a layered view in the lanes.

#### Phase 2 — Wire Sec-48 fan-outs into lanes (~2 days)
- Audiences lane: `get_signals` filtered by brand `industries[]`. Brief auto-derived from the brand description (e.g. "Beverages buyers in high-density metros" for Constellation).
- Inventory lane: `get_products` with the brand's industries as `filters`.
- Creative lane: `build_creative` (Celtra) with brand colors + fonts + logo URL. Format selection from `list_creative_formats` filtered by brief intent (Sec-48q-style).
- Stage-4 media buy: synthesized from picked nodes in each lane, vendor adapter applied, "Simulate live fire" button per buying agent (existing).

#### Phase 3 — Governance + rights lane (~1 day)
- Static "AdCP 3.0 spec'd, no live agents yet" placeholder cards for `check_governance`, `get_rights`, `report_plan_outcome`.
- Each placeholder shows the spec's expected request/response shape (pulled from 3.0 GA docs).
- Visually present as part of the canvas — makes the gap *obvious* not hidden.

#### Phase 4 — Closed-loop measurement arrow + view-mode toggle (~1 day)
- Stage-5 lane: `get_media_buy_delivery` for fired buys + a "post-campaign learning would close this loop" placeholder.
- Animated arrow back to Audiences lane explicitly drawn.
- View-mode toggle (Pattern B / Pattern A modes reusing same data).

**Total: 5 days to a demo-ready Brand-Anchored Canvas.**

---

## What we'd retire from v1

Nothing. The Sec-48 Orchestrator stays as a tab — it's the **transport-and-fan-out reference**. Pattern C is a higher layer that calls into the same backend. Workshop attendees who want to see the raw protocol see v1; brand managers / planners see Pattern C.

---

## Memory references

- Live agent capability dump: [`memory/agent_capability_dump_2026_04_27.md`](../memory/agent_capability_dump_2026_04_27.md)
- AdCP 3.0 GA whats-new: `docs.adcontextprotocol.org/docs/reference/whats-new-in-v3` (fetched 2026-04-27)
- Brand registry API: `agenticadvertising.org/api/brands/resolve?domain={domain}`, `agenticadvertising.org/api/search?q={query}` (no auth required)
- Workshop prep: [`docs/WORKSHOP_BLOCK1_EXHIBITS.md`](./WORKSHOP_BLOCK1_EXHIBITS.md), [`docs/WORKSHOP_DEMO_SCRIPT.md`](./WORKSHOP_DEMO_SCRIPT.md)
