# AdCP Signals Workshop — Live Demo Script

**For:** May 7, 2026 · iHeartMedia NYC · AdCP signals workshop
**Live reference:** https://adcp-signals-adaptor.evgeny-193.workers.dev/ → **Orchestrator** tab
**Fallback:** all endpoints reachable via `curl` + `application/x-ndjson` streaming — see section 5.

---

## 0. Before you start

- Open the Orchestrator tab. Top chrome: **19 agents** in directory · **12 alive** · **~2s avg latency** across the fleet.
- Expand any live agent card to show tool + parameter surface — same shape our `/capabilities` page emits, now served per-peer.
- The shipped default workflow fleet:
  - **Signals** (2): `evgeny_signals` (us) + `dstillery`
  - **Creative** (2): `advertible` + `celtra`
  - **Buying** (3): `adzymic_apx` + `claire_scope3` + `swivel`

All overridable via request body if the room wants to substitute peers.

---

## 1. Block-1 opener — "what is a signal"

**Purpose:** ground the abstract definition in concrete wire data.

**Action:** expand the **Evgeny Signals** card on the Orchestrator tab. Walk the room through one tool at a time:

- `get_signals` → 6 props, 2 required (`signal_spec`, `deliver_to`)
- `activate_signal` → 5 props, 2 required
- `query_signals_nl` → 2 props, 1 required
- `search_concepts` → concept registry vocabulary (what behavior is being described)

Call out:
- Signal has **coverage_percentage**, **estimated_audience_size**, **pricing.cpm**
- Signal has **`deployments[]`** — same signal carries activation metadata per platform (TTD segment id, GAM line id, etc.)
- Signal has **`x_cross_taxonomy[]`** — same concept, nine vendor taxonomies (IAB, LiveRamp, TTD, AppNexus, ...)
- Signal has **DTS v1.2 labels** — `data_provider`, `x_consent.category`, `x_freshness.window_days`, `x_dts_version`

**One-liner for the room:** *"A trusted signal is five things: provenance, consent, freshness, coverage, and deployment metadata. All five are on-the-wire in the adaptor today."*

---

## 2. Block-1 midpoint — "what's in the directory vs. what actually works"

**Purpose:** honest assessment, not marketing.

**Action:** stay on the Orchestrator tab. Call attention to the header summary + agent grid:

| Metric | What it shows |
|---|---|
| 12 of 12 alive | Handshake works (Streamable-HTTP + SSE) across the directory |
| 4 known-issue, 3 roadmap | Not every agent is production — directory documents status |
| Tool-count diff | Directory baseline vs. live probe — shows which agents added/removed tools post-listing |

**One-liner:** *"Alive doesn't mean interoperable. Directory presence means the handshake works — tool-surface compatibility is a separate story. That's what Block 2 traces."*

---

## 3. Block-2 scenarios — live walkthrough

### Scenario A — Pre-buy (buyer evaluates inventory + audience fit)

**Brief to use:** `luxury travelers planning APAC trips`

**Expected behavior:**

| Stage | Agents | What the room sees |
|---|---|---|
| 1. Signals | evgeny + dstillery (parallel) | ~10 merged signals; top-3 auto-picked for targeting |
| 2. Creative | advertible + celtra (parallel) | 2 + 79 = 81 formats; one format auto-picked per vendor |
| 3. Products | 3 buying agents | Adzymic 2 products, Claire-Scope3 1, Swivel 0 legit empty |
| 4. Media buy | same 3 | Dry-run payload previews assembled with chosen signals in `targeting_overlay.required_axe_signals` + chosen formats in `packages[0].creatives` + chosen product in `packages[0].product_id` |

**Discussion pause points:**
- **After stage 1 "Chosen for targeting":** *"We picked 3 signals. Is that a signal, governance (did consent allow it?), or identity (how did we know these audiences match)?"*
- **After stage 2:** *"Celtra returned 79 format variants; Advertible 2. Is creative-catalog shape itself a signal? A measurement concern?"*
- **After stage 3 products:** *"Same brief, three vendors, three different product shapes. Where's the protocol drawing lines?"*

**Try-this-live:** click a signal row to toggle; watch all 3 stage-4 payloads' `targeting_overlay` update in place. Then click "Simulate live fire" on one card — watch the vendor rejection reason surface verbatim.

### Scenario B — Pre-buy with brief-narrowing

**Brief:** `luxury travel APAC video`

**Expected behavior:**
- Creative stage narrows Celtra from 79 → 33 formats (the video subset)
- Chosen formats are video-only
- `create_media_buy` payload carries video format IDs in `packages[0].creatives`

**Discussion point:** *"The brief is interpreted client-side and pushed as filter args. Should signal selection itself inform this, or should it stay declarative?"*

### Scenario C — In-flight (optimization trigger) — **GAP**

**Status:** `get_media_buy_delivery` exists on the buying agents' tool lists; we can pull mid-flight data on demand. But **there's no push/subscribe signal primitive** in AdCP today.

**Action:** expand the adzymic_apx or claire_scope3 card, show `get_media_buy_delivery` in the tool drawer. Talk through the hypothetical:

*"Buyer sees pacing slip. Wants an optimization signal to fire to the signals agent. What's the API? A new `subscribe_signals` tool? An SSE channel on the signals agent? Batch poll? This is a gap worth scoping."*

### Scenario D — Post-campaign (performance feeds next cycle) — **GAP**

**Status:** We have **Snapshots** + **Freshness** tabs on our adaptor, plus portfolio optimizer. Nothing at the protocol layer defines how performance data flows back into the next-cycle signal handshake.

**Action:** briefly show the Snapshots tab (Composer view). Then:

*"Client-side we can diff snapshots and optimize within our adaptor. What's missing: a standard way for a buyer agent to publish 'these signals underperformed' back to the signals provider so the next brief gets better options. The closed loop."*

### Cross-cutting — real-time vs. batch

**Status:** `get_signals` is synchronous batch. Attention signals would need a stream. Brand lift is post-hoc batch.

**Action:** frame as open questions for the committee to scope.

---

## 4. Gap list (prepared for the converge/ranking session)

Five gaps captured during Sec-48 interop work across 11 live peers. Good seed for the ranked gap list:

1. **No shared brand-manifest contract.** Adzymic requires `brand_manifest.name`; Claire accepts only top-level `buyer_ref`; Swivel silently rejects. Three live validators, no harmonization.
2. **Signal → product compatibility is a void.** `filters.targeting_signals` on `get_products` honored, required, or ignored depending on vendor.
3. **MCP response-shape optionality bites interop.** `structuredContent` vs. `content[].text` both spec-compliant. Signals-specific convention would help.
4. **`list_creative_formats` is the only tool every creative + buying agent implements.** Beyond that the surface is bespoke.
5. **Measurement → signals feedback loop is implicit.** No spec for how `get_media_buy_delivery` output feeds back into the next-cycle `get_signals` handshake.

---

## 5. Fallback — curl-only replay

If the UI is slow or the room prefers raw:

```bash
# Probe directory
curl -s https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/probe-all | jq '.alive_count, .results[] | {id, alive: .probe.alive, tools: (.probe.tools | length)}'

# Run the workflow stream, one event per line
curl -s -N -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/workflow/run/stream \
  -H "Content-Type: application/json" \
  -d '{"brief":"luxury travel APAC","timeout_ms":20000}'

# Fire a specific buy (dry-run payload preview only unless activate_agents is set)
curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/workflow/fire-buy \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"adzymic_apx","product_id":"prod_3d5ae13b","signal_ids":["sig_1"],"format_ids":["celtra_format_xyz"],"brief":"demo"}' | jq .
```

All endpoints are public (no auth). The fire-buy call only hits the vendor's real `create_media_buy` when invoked explicitly per-agent — safe to narrate.

---

## 6. What I will NOT demo live (and why)

- **Activation via TTD OAuth** — our activation service is LinkedIn-oriented in the current deploy; TTD handoff is documented but not the critical path for a signals-definition workshop.
- **UCP embedding space visualizations** (Embedding Lab) — too deep in the tool chain for this audience. Happy to show afterwards if folks stay.

---

## 7. Post-workshop artifacts I can commit to

- Extend the adaptor with a dedicated `/workshop/scenarios` endpoint that packages the three live scenarios as a single reproducible call.
- Draft spec proposal for **"signals tool-call response-shape convention"** (gap #3) within 30 days.
- Join the standing committee as a named member with that deliverable.

---

**Questions or changes to this script → ping me before May 7 and I'll update + redeploy.**
