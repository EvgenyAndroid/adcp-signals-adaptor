# Demo runbook — May 7 iHeartMedia NYC

8-scene live walk-through, ~10 min total. Coca-Cola is the carry-through example. Backup beats inline so a slow agent or auth-gate doesn't derail.

## Pre-flight (5 min before stage)

1. Open https://adcp-signals-adaptor.evgeny-193.workers.dev/ in a browser. Confirm the page loads.
2. Click **Canvas** tab → search "coca" → confirm Coca-Cola appears in suggestions.
3. Click **Campaign** tab → confirm 3 demo campaigns + coverage strip render.
4. Click **Agentic** tab → confirm mode pill says "live · Claude" (green). If it says "template · no API key", the live mode isn't active — you'll still demo, just won't have the open-ended brief surprise.
5. Have a 2nd tab open to https://github.com/EvgenyAndroid/adcp-signals-adaptor for live-code reference if questions get deep.

## Scene 1 — "What's the registry, and why does it matter?" (60s)

**Tab: Canvas**

1. Type "coca" in the search box → click "Coca-Cola" suggestion.
2. Brand card resolves with logo, palette, fonts, classification (master), industries (Food and Drink, Beverages).
3. Point at the **registry-sync bar** at the top of canvas-bottom: `agents: 22 upstream / 22 local · policies: 14 (local snapshot) · cron Xh ago`.
4. **Talking point:** "The agentic-advertising registry has 22 buying-eligible agents and 14 published policies. Our adaptor mirrors them and reports any drift. The daily cron at 04:00 UTC keeps us fresh — yesterday I had a +3 mismatch when Setupad and Mamamia got added; today we're 22/22."

## Scene 2 — "Brand → policy: pre-fire compliance check" (60s)

**Tab: Canvas (still on Coca-Cola)**

1. Scroll down on the brand card. Point at the **Policy hits** chip row.
2. For Coca-Cola: only catch-alls fire (GDPR + CSBS). Both are `must` regulations but the signal pre-attests to them.
3. Point at the **Governance preview banner**: `✓ ALLOW`.
4. **Talking point:** "Before I fire any media buy, the Canvas tells me which of the 14 registry policies apply, and predicts the governance outcome. Coca-Cola → only the universal GDPR + CSBS apply, both pre-attested → ALLOW."
5. **Demo flip:** click the "vs another brand" button → search "draftkings" → click. Side-by-side appears: Coca-Cola → ALLOW; DraftKings → adds `gambling_advertising` should-policy + `eu_ai_act` block-prediction → outcome WARN/BLOCK.
6. **Talking point:** "Same brief, different brand → different policy stack → different governance outcome. This is brand-anchored compliance, not plan-anchored."

**Backup if browser is slow:** skip the compare; mention the screenshot in [`03_policy_hits_by_brand.md`](./03_policy_hits_by_brand.md).

## Scene 3 — "Run the workflow — sell-side fan-out" (90s)

**Tab: Canvas**

1. Click **"Run workflow with this brand"** button.
2. The 4 stages (signals → creative → products → media-buy) cascade in real time. Each lane fills with vendor pills.
3. Point at the **DTS attestation chips** that appear under any signal card (collapsed by default — click to expand).
4. **Talking point:** "Behind the scenes I just fanned out across 11 agents in parallel. Signals from Evgeny + Dstillery (we picked the top 3 by coverage). Creative formats from Celtra + Advertible. Products from the buying trio. Each carries a DTS v1.2 label with our v1.3 `policy_attestations[]` extension — 8 default claims that the buyer-side governance enforcer can act on at fire-time."
5. **The auth-gating moment:** the media-buy row shows mostly `dry run` cells; clicking `simulate fire` on any of them produces an amber callout: *"auth-gated — payload shape passed; vendor requires credentials we do not have."*
6. **Talking point:** "This is the canonical Sec-48 finding. The payload shape is correct — every per-vendor adapter rule applied. The wall is at the auth boundary. There's no shared auth posture in AdCP 3.0 GA. That's not a bug in our adaptor; that's a spec gap, and surfacing it inline is the workshop's first finding."

**Backup if vendors are slow:** skip the fire button; the dry-run pills with predicted CPM/impressions inline are sufficient evidence.

## Scene 4 — "Trust pipeline — DTS + attestation + governance" (45s)

**Tab: Canvas (still on Coca-Cola post-workflow)**

1. Click the DTS pill on any signal in the signals lane → DTS panel expands.
2. Scroll to the bottom: **Privacy & compliance section** now contains the merged attestation chips (post-#113 cleanup; not two separate blocks).
3. Show the 8 attestations: `us_coppa: compliant`, `csbs: compliant`, `eu_gdpr_advertising: out_of_scope`, etc.
4. **Talking point:** "Trust contract = DTS coverage PLUS attestation. The IAB DTS layer covers what the audience IS; the v1.3 policy_attestations layer covers what the signal CLAIMS. Together they let a buyer-side enforcer reject a signal that's silent on a `must` policy without round-tripping `check_governance`. We're proposing this for v1.3."

## Scene 5 — "Buy-side: where the spec breaks" (90s)

**Tab: Campaign**

1. Click **Coca-Cola Summer Refresh** in the campaign selector.
2. Point at the **coverage strip at the top**: 4 green pills (lifecycle: create / update / get_delivery / get_media_buys), 7 red pills (3 unimplemented lifecycle + 4 unspec'd primitives).
3. Walk through the 5 lanes top-to-bottom. Lane 1 (bid strategy) and Lane 2 (bid stream) are MOCKED — point at the data-source pill on each: "MOCK · 0 live agents".
4. **Talking point:** "AdCP 3.0 GA covers sell-side discovery and plan-level buy. The buy-side real-time control loop — bid strategy, bid stream, pacing status, optimization signals — is unspecified. **Zero of eight buying agents advertise any of the four primitives.** This is the largest spec gap remaining."
5. Switch to **live (from agents)** mode in the toggle. The live media-buys panel appears with per-agent state.
6. **Talking point:** "But the LIFECYCLE is live — every buying agent that responds advertises the post-buy primitives. So the buy-side has the surfaces; we're missing the pre-buy layer. Same posture as governance and brand-rights."

**Backup if get_media_buys returns 0:** that's expected if no real fires have succeeded yet (auth-gating); use the per-agent state grid as evidence (most agents return `OK (0 buys)` not auth-gated).

## Scene 6 — "Agentic: type a brief, watch the agent think" (90s — THE WOW)

**Tab: Agentic**

1. Click the **"Coca-Cola summer · Gen Z"** suggestion button.
2. Watch ALL 4 section cards appear immediately as pulsing skeletons.
3. Watch the right-pane reasoning trace TYPE OUT char-by-char with the blinking ▌ cursor.
4. Sections cascade-fade-in as Claude's responses land.
5. **Talking point:** "I'm not telling the agent which tools to call. I'm typing a sentence. Claude reads it, decomposes it into a structured brief — see the BRAND_LIFT KPI it picked, despite the input saying ROAS, because Gen-Z-urban-summer is awareness-led — then it queries the live coverage matrix and plans the call sequence. The reasoning trace on the right narrates every decision."
6. After all sections fill, click **"Execute plan"**. Reasoning trace continues with live tool-call results streaming in.
7. **Talking point:** "Same architecture, no API key falls back to rule-based templates that produce structurally identical output. Live mode adds open-ended understanding the templates can't anticipate."

**Backup if Claude API is slow (>5s per call):** narrate over the wait — "what you're watching is Claude Sonnet 4 thinking through the tool plan. Live LLM mode trades latency for adaptability." The skeleton-pulse fills the visual gap.

## Scene 7 — "Explain this decision" (30s)

**Tab: Canvas (any post-workflow state)**

1. Click the small **"?"** badge next to any decision (governance banner, fire-buy result, signal pick).
2. Modal appears with prose explanation calling Claude or template (depending on mode).
3. **Talking point:** "Every decision in this UI is inspectable. Claude-powered explanations on demand, falling back to deterministic templates. Workshop attendees can audit any choice in real time."

## Scene 8 — "What's left in the spec?" (60s)

Bring up [`06_dsp_live_coverage.md`](./06_dsp_live_coverage.md) coverage table on screen.

**Talking points:**

1. "Six AdCP protocol domains in 3.0 GA. Three live across the directory: media_buy + creative + signals. Three greenfield: governance, brand-rights, sponsored_intelligence. Plus the buy-side bid-time control loop that has no domain at all yet."
2. "Two issues we filed yesterday at 17:34 and 18:02 UTC closed within 36 hours. Both fixes shipped in `@adcp/sdk@5.25.0`. Our compliance scenario count went from 4 to 7. The feedback loop is fast and credible."
3. "Workshop ask: which of these gaps does the working group want to prioritize? We have working mocks for governance, brand-rights, AND the four bid-time primitives — they can become reference implementations whenever the WG is ready."

## Q&A backup material

**"How does the auth boundary work today?"**
- Each vendor has its own auth posture. No shared standard. Some auth-gate at discovery (5/8 buying agents), some at mutation (the 3 unauthenticated default-trio still auth-gate at create_media_buy).
- Workshop-cite-able as gap #1 in the Sec-48 vendor audit.

**"How big is the policy registry?"**
- 14 published policies as of 2026-04-30. 8 regulations / 6 standards. 8 `must` / 6 `should`. Mix of US-specific (COPPA, CA SB-942), EU-specific (GDPR Advertising, EU AI Act), UK-specific (HFSS), and global (CSBS, alcohol/tobacco/gambling/pharma standards).

**"What's the path to live `check_governance`?"**
- Spec'd in 3.0.1 (added `mode` field for advisory/audit/enforce posture). No vendor implements yet. Our `predictGovernance()` mock derives the same shape from policy hits × signal attestations. When a vendor lights up, we swap our mock for the live call — single one-line change.

**"Why is the SDK conformance only at 7/35?"**
- 28 scenarios skipped because they require tools we don't advertise (we're a signals-only agent). All 7 of the 7 protocol-LEVEL scenarios that should run on us, do. The 28 skipped are buy-side-specific scenarios (`create_media_buy`, `pricing_edge_cases`, `creative_lifecycle`, etc.) that don't apply to a signals provider.
