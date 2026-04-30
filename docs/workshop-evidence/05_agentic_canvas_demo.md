# Agentic Canvas — Coca-Cola end-to-end (live LLM mode)

Captured 2026-04-30 against `https://adcp-signals-adaptor.evgeny-193.workers.dev/agentic/chat` with `ANTHROPIC_API_KEY` set in production. **Mode: live · Claude Sonnet 4.**

## The streaming envelope (NDJSON over HTTP)

```bash
curl -N -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/agentic/chat \
  -H "Content-Type: application/json" \
  -d '{"input":"Plan a $50K Coca-Cola summer campaign for Gen Z urban — ROAS 3.5x"}'
```

Returns NDJSON. Each line is one event the Canvas progressively renders:

```json
{"event":"session_start","input":"Plan a $50K Coca-Cola summer campaign for Gen Z urban — ROAS 3.5x","mode":"live","ts":"2026-04-30T19:05:54.250Z"}
{"event":"stage_start","stage":"brief","label":"Asking Claude to decompose the brief…"}
{"event":"reasoning","step":{"step_id":"rs_jgqoxoyg","kind":"analyze","message":"Received brief: ... Length 65 chars; mode = live."}}
{"event":"reasoning","step":{"step_id":"rs_buq63mic","kind":"decide","message":"Claude expanded the brief in 2761ms with confidence 0.85.","latency_ms":2761}}
{"event":"reasoning","step":{"step_id":"rs_3ws73iu1","kind":"complete","message":"Expansion done. KPI=BRAND_LIFT@12, geo=US, 1 industries.","latency_ms":2761}}
{"event":"stage_complete","stage":"brief","payload":{...full ExpandedBrief...}}
{"event":"stage_start","stage":"coverage","label":"Probing live MCP agents to learn what tools are advertised…"}
{"event":"reasoning","step":{"kind":"observe","message":"Probed 11 live agent(s) — 28 tool(s) total in coverage."}}
{"event":"stage_complete","stage":"coverage","payload":{...}}
{"event":"stage_start","stage":"plan","label":"Asking Claude to choose the call sequence…"}
{...several reasoning steps...}
{"event":"stage_complete","stage":"plan","payload":{...full ExecutionPlan with 4 steps...}}
{"event":"stage_start","stage":"governance","label":"Predictive check_governance against brand industries × signal attestations…"}
{"event":"reasoning","step":{"kind":"decide","message":"Outcome: ALLOW. 0 block(s), 0 warn(s), 3 allow(s)."}}
{"event":"stage_complete","stage":"governance","payload":{...advisory + remediations...}}
{"event":"stage_start","stage":"memory","label":"Recalling similar past workflows from KV…"}
{"event":"reasoning","step":{"kind":"observe","message":"No prior similar workflows in memory."}}
{"event":"stage_complete","stage":"memory","payload":{"matches":[],"hint":"..."}}
{"event":"reasoning","step":{"kind":"complete","message":"Brief: brand=\"Coca-Cola\", industries=[food_beverage], KPI=BRAND_LIFT@12. Plan: 4 steps — get_signals → list_creative_formats → get_products → create_media_buy. Governance: ALLOW. Mode: live."}}
{"event":"session_complete","mode":"live","ts":"2026-04-30T19:05:58.150Z"}
```

## What Claude actually did

Input: `"Plan a $50K Coca-Cola summer campaign for Gen Z urban — ROAS 3.5x"` (65 chars).

### Stage 1 — Brief expansion (2.7s)
Claude returned a structured `ExpandedBrief` with confidence **0.85**:

```json
{
  "brand_name": "Coca-Cola",
  "brand_domain": null,
  "industries": ["food_beverage"],
  "audience_descriptors": ["Gen Z", "urban"],
  "kpi": "BRAND_LIFT",
  "kpi_target": 12,
  "budget_usd_estimate": 50000,
  "geo": ["US"],
  "flight_days": 90,
  "dayparting_hint": "peak_evening",
  "confidence": 0.85,
  "source": "live_llm"
}
```

**Notable:** Claude correctly identified `BRAND_LIFT` despite the brief mentioning ROAS (workshop story: the LLM made a judgment call — Gen Z urban summer campaigns are typically awareness-led; ROAS targets work better for retargeting). Worth showing as "see, the agent can disagree with the literal text".

(Template mode by contrast would have picked the literal `ROAS @ 3.5x` from the input — that's the deterministic-vs-judgmental difference between the two modes.)

### Stage 2 — Live MCP coverage probe (~80ms)
Probes 11 live buying agents in parallel, returns coverage matrix. (Full data in [`06_dsp_live_coverage.md`](./06_dsp_live_coverage.md).)

### Stage 3 — Tool plan (~3s for Claude)
Claude returned a 4-step plan tailored to the brief and the live coverage:

| Step | Tool | Agents | Rationale |
|---|---|---|---|
| 1 | `get_signals` | dstillery | "Discover Gen Z urban audience signals to inform targeting strategy for Coca-Cola campaign" |
| 2 | `list_creative_formats` | advertible, celtra, adzymic_apx, adzymic_sph, adzymic_tsl, adzymic_mediacorp, content_ignite, claire_pub, swivel | "Identify available creative formats across inventory sources for summer campaign execution" |
| 3 | `get_products` | adzymic_apx, adzymic_sph, adzymic_tsl, adzymic_mediacorp, content_ignite, claire_pub, swivel | "Discover targetable inventory products that can deliver Gen Z urban reach within $50K budget and ROAS 3.5x target" |
| 4 | `create_media_buy` | adzymic_apx, adzymic_sph, adzymic_tsl, adzymic_mediacorp, content_ignite, claire_pub, swivel | "Execute optimized media buy based on discovered signals, formats, and inventory for 90-day summer campaign" |

**Notable:** Claude chose to skip `check_brand_rights` (which the template plan would include). Coca-Cola is a master classification with no DOOH formats requested → rights check is vacuous → Claude correctly elided it.

### Stage 4 — Governance preview (instant, local mock)
Outcome: **ALLOW** · 0 block · 0 warn · 3 allow.

Three applicable policies for `food_beverage` industry: GDPR Advertising Requirements, CSBS, EU AI Act Article 50. All three resolve to ALLOW because our 8 default attestations cover them (`out_of_scope` for GDPR + AI Act, `compliant` for CSBS).

### Stage 5 — Memory recall (instant)
No prior similar workflows in KV (this was the first "Coca-Cola Gen Z" run). Real production at this point likely has 5-10 similar prior runs in memory.

### Final summary
> Brief: brand="Coca-Cola", industries=[food_beverage], KPI=BRAND_LIFT@12. Plan: 4 steps — get_signals → list_creative_formats → get_products → create_media_buy. Governance: ALLOW. Mode: live.

## Visual streaming (the WOW)

In the Canvas, while the JSON above streams in:

1. **All 4 sections appear immediately as pulsing skeleton cards** (gradient shimmer at 50/70/90% widths)
2. **Each section header gets 3 staggered pulsing dots** + descriptive label ("Asking Claude to decompose the brief…")
3. **The active section pulses with an accent-glow box-shadow**
4. **When the section completes, it flashes accent-glow once, slides up, and fills with real data**
5. **The right-pane reasoning trace types each line char-by-char (~800ms reveal) with a blinking ▌ cursor at the typing head**
6. **The cursor disappears when typing completes; the next reasoning step starts a new cursor**

Total wall-clock time: ~6 seconds for the Coca-Cola brief in live mode (Claude does ~2-3s per call × 2 calls + light book-keeping).

## Workshop framing

> **"This is what 'agentic AdCP' looks like — not a tool catalog with pretty buttons, but a planner that reads natural language, thinks aloud, and decides how to call the directory based on what's actually live. Watch the right pane: every decision narrates itself."**

Show:
- Click "Coca-Cola summer · Gen Z" suggestion (or type a different brand)
- All 4 sections appear as pulsing skeletons → fill in cascade
- Reasoning trace types out: ANALYZE → DECIDE → COMPLETE
- Click "Execute plan" → live MCP fan-out streams below

Backup if Claude API is slow:
- Mention that the same surface works in template mode (no API key)
- Output structure is identical; only the brief expansion + tool sequence reasoning differ
