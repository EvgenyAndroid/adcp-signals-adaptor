# AdCP Signals Workshop — Live Demo Script

**For:** "Mini Governance & Signals Workshop — AAO" · May 7, 2026 · 9–12 NYC · iHeartMedia (in-person + remote)
**Live reference:** https://adcp-signals-adaptor.evgeny-193.workers.dev/ → **Orchestrator** tab
**Companion:** [WORKSHOP_BLOCK1_EXHIBITS.md](./WORKSHOP_BLOCK1_EXHIBITS.md) — signal-definition card, boundary diagram, trust contract strawman.

---

## 0. Pre-flight + room calibration

Before opening the orchestrator:

- The audience is **measurement + verification + identity-heavy** (DV, IAS, Comscore, Nielsen, Human, Samba, LiveRamp, Triton, Mediaocean, Peer39) plus buy-side (Horizon Media) and agency (OMG, WPP). **Few will care about MCP transport detail.** Lead with substance, not plumbing.
- **What we lead on:** signal definition + boundaries + DTS-labels-as-trust-strawman + 6-gap implementation data + the live multi-vendor pre-buy ceremony.
- **What we listen on:** measurement / attribution / lift (DV/IAS/Comscore/Nielsen own the floor), identity resolution (LiveRamp), attention measurement (Triton), IVT/fraud (Human/DV).
- **What we volunteer to own** in the working committee: response-shape convention (gap #5) + brand-context primitive harmonization (gap #2). Both are concrete, scoped, and we can lead on a draft spec.

Open the Orchestrator tab. Header chrome reads: **19 agents** in directory · **12 alive** · **~2s avg latency**. That's the credibility opener — we are speaking from interop reality, not slideware.

---

## 1. Block 1 opener — "what is a signal" (anchored on Exhibit A)

**Action:** open the Orchestrator tab; expand the **Evgeny Signals** card. The 8 tools render with descriptions + parameter tables. Walk the room through one tool — `get_signals` is the canonical one — pulling out:

- The 5 trust fields from [Exhibit C](./WORKSHOP_BLOCK1_EXHIBITS.md#exhibit-c--trust-contract-strawman): `data_provider`, `x_consent.category`, `x_freshness.window_days`, `coverage_percentage` + `estimated_audience_size`, `deployments[]`.
- The producer/consumer split via `x_cross_taxonomy[]`: same signal, 9 vendor namespaces (IAB, LiveRamp, TTD, AppNexus, ...).

**One-liner for the room:** *"A trusted signal is five fields: provenance, consent, freshness, coverage, deployment metadata. They're on the wire today. Which of those five would YOU remove? Which would you add before putting budget behind it?"*

That's the Block 1 trust-requirements provocation, anchored on something concrete instead of a blank whiteboard.

---

## 2. Block 1 boundary exercise — "what signals are NOT"

**Action:** put up [Exhibit B](./WORKSHOP_BLOCK1_EXHIBITS.md#exhibit-b--what-signals-are-not-boundary-map) (boundary diagram). Open the floor.

Likely live disagreements to surface:

- **Brand suitability score** → call this a signal (it's a metadata attribute the buyer reads pre-buy)
- **"Don't run next to alcohol"** → NOT a signal; it's a governance directive that travels alongside one
- **Attention score** → probably a signal but real-time, different architecture from batch audience signals — sets up the Block 2 cross-cutting cut
- **Brand lift result** → NOT a signal (it's measurement output); but the *hypothesis input* might be
- **IVT-clean inventory** → NOT a signal; fraud filters operate on inventory before signals attach

Use these to draw lines on the diagram live. Disagreements seed the gap list for Block 3.

---

## 3. Block 1 honest assessment — "what's good, what's missing"

**Action:** stay on the Orchestrator tab; call attention to the directory header.

| Metric | What it shows |
|---|---|
| 12 of 12 alive | Streamable-HTTP + SSE handshake works across the directory |
| 4 known-issue, 3 roadmap | Not every agent is production-ready — directory documents status |
| Tool-count diff | Directory baseline vs. live probe — exposes which agents add/remove tools post-listing |

**One-liner:** *"Alive doesn't mean interoperable. The directory says 12 agents up; the implementation reality is six different validators on `create_media_buy`, two different schema families on brand-context, no shared auth posture. That's the gap list."*

Then surface the **6 implementation-observed gaps** (canonical, the workshop's gap-list seed):

1. **Auth-posture standard missing.** Five buying agents reject `get_products` with `AUTH_TOKEN_INVALID: Authentication required by tenant policy`. The three "open" agents all reject `create_media_buy` with auth errors too (Adzymic: "Principal ID not found"; Swivel: 401 in result body). **No shared auth contract across signals / creative / buying agents.**
2. **Two distinct schema families for brand context.** Adzymic + Swivel use `brand_manifest: BrandManifest`. Claire + Content Ignite use top-level `brand: BrandReference` with `{domain, name}` — Claire's rejection cited the AdCP spec by URL. Not field-name drift; entirely different object contracts.
3. **`packages[].buyer_ref`, `pricing_option_id`, scalar `budget`** — required by every known buying vendor's validator, NOT in the spec's required list. Implementation drift hardened.
4. **`filters.format_ids` shape.** Spec wants `FormatId{agent_url, id}`; only `adzymic_apx` tolerates `string[]`. Five other agents reject Sec-48q's strings.
5. **MCP response-shape optionality.** Celtra wraps JSON inside text blocks; most use `structuredContent`; Swivel embeds errors in a structured result. All three are spec-compliant. Naive extractors miss data.
6. **Creative-agent surfaces beyond `list_creative_formats` are bespoke.** Celtra builds, Advertible previews. No shared creative-tool contract.

Each maps to a Block 2 / Block 3 thread.

---

## 4. Block 1 lifecycle map

| Phase | What we have live | Gap to flag |
|---|---|---|
| **Pre-buy** | `get_signals`, `query_signals_nl`, `/signals/estimate`, `/signals/overlap`, cross-taxonomy bridge, Audience Composer (set ops + AST), Journey (cumulative reach) | None major — this is the solved phase |
| **In-flight** | `get_media_buy_delivery` exposed by buying agents (we can pull); pre-clamp reach warnings; privacy-gate holdout | **No real-time push/subscribe primitive in AdCP.** Optimization triggers can't fire from a signals provider. |
| **Post-campaign** | Snapshots + Freshness + portfolio optimizer (client-side) | **No closed-loop spec for performance → next-cycle signals.** Biggest unclaimed gap. |
| **Real-time vs batch** | All batch (`get_signals` is sync request-response) | Cuts across all three lifecycle phases. Architecture, privacy, vendor roles all different. |
| **Buy-side perspective** | We're sell-side flavored (signals provider) | Horizon Media will fill this gap in the discussion. |

---

## 5. Block 2 — live walkthrough of pre-buy scenario

**Brief to use:** `luxury travelers planning APAC trips`

**Expected behavior:**

| Stage | Agents (parallel within stage) | What the room sees |
|---|---|---|
| 1. Signals | evgeny + Dstillery | ~10 merged signals; top-3 auto-picked for `targeting_overlay.required_axe_signals` |
| 2. Creative | Advertible + Celtra | 2 + ~33-79 = ~80 formats (filtered by brief intent if "video" is in brief) |
| 3. Products | adzymic_apx + claire_scope3 + swivel | Adzymic 2, Claire-Scope3 1, Swivel 0 (legit empty) |
| 4. Media buy | same 3 buying agents | Dry-run payload previews assembled; chosen signals + chosen formats + chosen product all visible inline |

**Discussion pause points** (use to drive Block 2 #1 + the boundary conversation):

- **After stage 1's "Chosen for targeting":** *"We picked 3 signals. Looking at this set — is each one a signal, governance directive, identity primitive, or measurement output?"*
- **After stage 2:** *"Celtra returned 79 format variants for one canonical 'creative format' concept. Is that catalog-shape itself a signal? Where does creative-format vocabulary live in the spec?"*
- **After stage 3:** *"Same brief, three buying agents, three different product responses with three different validators on the next stage. Where's the protocol drawing lines?"*

**Try-this-live:** click a signal row to toggle; watch all 3 stage-4 payloads' `targeting_overlay` re-serialize. Click a format pill — `packages[0].creatives` updates. **Click "Simulate live fire"** — vendor rejection reason renders in-card; for auth-rejecting vendors, an amber **"Auth-gated vendor"** callout teaches the room: *"Payload shape passed; the wall is auth — AdCP has no shared auth-posture contract."*

That auth-callout IS the gap-#1 punchline visible.

---

## 6. Block 2 — in-flight scenario (PARTIAL)

**Status:** `get_media_buy_delivery` exists on buying agents' tool lists; we can pull mid-flight pacing data on demand. But **there's no push/subscribe primitive** for a signals provider to fire an optimization trigger.

**Action:** expand the `adzymic_apx` or `claire_scope3` card; show `get_media_buy_delivery` in the tool drawer. Frame:

*"Buyer sees pacing slip. Wants an optimization signal to fire to the signals agent — 'send me audiences responding to weather conditions in the next 30 minutes'. Today there's no API for that. Three open questions:*
- *New `subscribe_signals` SSE channel on the signals agent? (push from signals)*
- *Or does buying agent poll? (pull on a schedule)*
- *Or is this a measurement-agent-fires-trigger pattern? (different agent type)"*

Drives Block 2 cross-cutting real-time-vs-batch conversation. Triton's input critical here.

---

## 7. Block 2 — post-campaign scenario (GAP)

**Status:** Client-side we have **Snapshots** + **Freshness** + portfolio optimizer. **Nothing at the protocol layer** defines how performance feeds back into the next-cycle signal handshake.

**Action:** briefly show the Snapshots tab (Composer view). Frame:

*"Within our adaptor we can diff snapshots and optimize the next brief. What's missing: a standard way for a buyer agent to publish 'these signals underperformed' BACK to the signals provider so the next brief gets better options. The closed loop is the spec gap."*

Open question for the room (DV / IAS / Nielsen primary audience here): *"What measurement output, in what shape, would you push back into the next cycle's signals query?"* Their answer is a candidate spec.

---

## 8. Block 2 — cross-cutting real-time vs. batch

**Action:** frame the synchronous-batch nature of `get_signals` explicitly:

- `get_signals` today: synchronous, one-shot, batch.
- Attention signals (Triton's territory): real-time, streaming.
- Brand lift (Nielsen / DV territory): post-hoc, batch.
- They flow through entirely different architectures, privacy regimes, vendor roles.

Open question: *"Are these all 'signals' under one contract, or do attention-streaming and lift-post-hoc need their own agent types?"* Maps directly to Block 1's "adjacent areas" question.

---

## 9. Block 3 — committee + concrete deliverables I can commit to

If the room wants a working committee with named deliverables, here's what I can own from this seat:

| Deliverable | Scope | Target |
|---|---|---|
| **Signals tool-call response-shape convention** (gap #5) | Spec proposal: signals tools MUST emit results under a single canonical key in `structuredContent`; if using `content[].text`, must be parseable JSON without prefix wrapping. | Reviewable draft within 30 days of workshop |
| **Brand-context primitive harmonization** (gap #2) | Spec proposal: choose `brand_manifest: BrandManifest` OR `brand: BrandReference` as the single contract. Reference Adzymic + Claire shapes as priors. | Reviewable draft within 30 days |
| **Live reference adaptor stays public** | `adcp-signals-adaptor` continues to host the orchestrator + interactive workflow as a working-committee testbed. PRs welcome. | Indefinite |

For everything else (auth posture, real-time primitive, post-campaign feedback) I'm a contributor, not the driver — those need the measurement + identity attendees in the lead.

---

## 10. Curl-only fallback (if UI is slow or room prefers raw)

```bash
# Probe directory + per-agent tool surface
curl -s https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/probe-all \
  | jq '.alive_count, .results[] | {id, alive: .probe.alive, tools: (.probe.tools | length)}'

# Run the workflow stream (one event per line)
curl -s -N -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/workflow/run/stream \
  -H "Content-Type: application/json" \
  -d '{"brief":"luxury travel APAC","timeout_ms":20000}'

# Inspect the assembled create_media_buy payload (per-agent vendor adapter applied)
curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/workflow/fire-buy \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"adzymic_apx","product_id":"prod_X","signal_ids":["sig_X"],"format_ids":["fmt_X"],"brief":"demo"}' \
  | jq .
```

All endpoints public, no auth on our side. Fire-buy reaches the vendor's real `create_media_buy` — safe to narrate, you'll see auth rejections from the vendor side surface in the response.

---

## 11. What I will NOT demo

- **Activation via TTD OAuth** — out of scope for a signals-definition session.
- **UCP embedding-space visualizations** (Embedding Lab) — too deep in the tool chain.
- **Audience Composer's expression-AST tab** — interesting but distracts from the lifecycle conversation.

---

**Questions / changes / dry-run requests → ping me before May 7.**
