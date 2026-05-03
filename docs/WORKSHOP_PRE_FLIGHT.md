# Workshop Pre-Flight — Morning of May 7, 2026

**Companion to:** [WORKSHOP_DEMO_SCRIPT.md](./WORKSHOP_DEMO_SCRIPT.md), [WORKSHOP_BLOCK1_EXHIBITS.md](./WORKSHOP_BLOCK1_EXHIBITS.md).

This is the runbook for the morning of. Everything is copy-paste; nothing requires writing fresh code.

---

## T-90 minutes — environment check

```bash
# 1. Smoke the prod surface (68 checks)
API_KEY=demo-key-adcp-signals-v1 node scripts/pre-demo-audit.mjs
# Expected: TOTAL: 68 | PASS: 68 | FAIL: 0

# 2. Run the @adcp/client compliance suite (7 scenarios)
API_KEY=demo-key-adcp-signals-v1 npm run compliance
# Expected: 7 passed, 0 failed out of 7 scenario(s)

# 3. AdCP envelope + body schema validator (6 surfaces)
node tmp-mining/validate_against_spec.mjs
# Expected:
#   Body schema:     6/6 passed
#   MCP envelope:    6/6 passed
#   Combined:        6/6 passed
```

If any fails: the worker rolled back, or a dependency drifted overnight. Fall back to the recorded screencast (see §"Fallbacks" below).

---

## T-60 minutes — visual smoke (the demo itself)

Open https://adcp-signals-adaptor.evgeny-193.workers.dev/demo. Click through:

| Tab | What to verify | Time-box |
|---|---|---|
| **Discover** | Type the brief `luxury travelers planning APAC trips` → click `get_signals`. ~10 results render. Click first row → detail panel opens with deployments + DTS labels. | 30s |
| **Activations** | Hit "Demo activate" on the detail panel. Task moves submitted → working → completed in ~5s. Tab counter updates. | 30s |
| **Orchestrator** | Header reads "**19 agents**, **12 alive**, **~2s avg latency**". This is the single most important headline number — if it reads anything else, federation probe failed (call out as known issue, don't lead with it). | 30s |
| **Capabilities** | `adcp.major_versions` shows 2 + 3. `specialisms: ["signal-owned"]`. **`status: "completed"` at top of structuredContent** (post-adcp#3999). | 30s |
| **Tool Log** | At least 5 recent calls visible. If empty, the Worker just cold-started — make a few calls in Discover first. | 15s |
| **Embedding Lab** | 512-dim scatter renders. Hover shows signal names. (Skip if room is short on time — flagged "what I will NOT demo" in main script.) | optional |

---

## T-30 minutes — kill-switches ready

Have these tabs/windows pre-opened so you can pivot mid-demo:

1. **Demo URL** in browser, on Orchestrator tab — the credibility opener
2. **Terminal #1** — `pre-demo-audit.mjs` output frozen (proof of state)
3. **Terminal #2** — empty, ready for live curl (the §10 fallback in the main script)
4. **GitHub PR list** — for the "we ship to spec" beat (#171–#184 arc visible)
5. **AdCP issues #3999, #4005, #4009** — the upstream-driving evidence

---

## Anticipated Q&A — pre-loaded answers

### "Are you AAO Verified?"
**Yes.** AAO's `evaluate_agent_quality` runner: 21/21 core scenarios + 9/9 signals_flow steps, all silent. Drove and contributed to two upstream issues during the certification: [adcp#3999](https://github.com/adcontextprotocol/adcp/issues/3999) (envelope binding clarification — bokelley ruling) and [adcp#4009](https://github.com/adcontextprotocol/adcp/issues/4009) (storyboard runner bug, currently in triage).

### "Why does your `agent_url` come back as `mock_dsp` on synthetic activations?"
Cosmetic gotcha when `destinations` is absent (a malformed-request shape AAO's storyboard sends pending #4009). The fallback uses our `destination` default which is `"mock_dsp"`. The `type: "agent"` assertion is correct. We can fix the URL to be URL-shaped in a follow-up — flagged but not blocking.

### "Doesn't passing AJV against the body schemas mean you're conformant?"
**Necessary but not sufficient.** That was the lesson from the AAO arc. The body schemas (`get-signals-response.json`, `activate-signal-response.json`, etc.) describe only the *payload* portion. The MCP transport binding lives in `mcp-response-extraction.mdx` + `static/test-vectors/mcp-response-extraction.json` — neither is a JSON Schema. Naive validators miss `status` and the envelope-merge requirement. Our validator now checks both.

### "How is this different from a standard DMP / signals catalog?"
- **Standard DMP**: closed catalog, vendor-specific IDs, manual integration per consumer.
- **AdCP**: agent-to-agent protocol over MCP/A2A/REST. Same agent serves any consumer that speaks the protocol. Cross-taxonomy mapping (`x_cross_taxonomy[]`) means the *same* signal is queryable in IAB, LiveRamp, TTD, AppNexus, Comscore, Nielsen, and 3 other namespaces from one call.

### "Where does Triton's attention data fit?"
Real-time / streaming axis — see Block 2 cross-cutting (§8). `get_signals` today is sync batch. Attention data probably needs its own primitive (subscribe? push notification?). Open question for the room — likely best for Triton + measurement vendors to lead.

### "Brand suitability vs. signal — which side?"
Probably a signal (it's a metadata attribute). But "don't run next to alcohol" is NOT — that's a governance directive carried alongside. See [Exhibit B](./WORKSHOP_BLOCK1_EXHIBITS.md#exhibit-b--what-signals-are-not-boundary-map).

### "If I'm an iHeart audio buyer, what would I integrate?"
- **Discovery**: `get_signals` with audio-specific brief ("podcast listeners 25-44 cooking content") → returns audio-eligible signals with deployments mapping to your audio DSPs.
- **Activation**: `activate_signal` against the audio DSP destination → returns `task_id` + deployment record. Poll or webhook.
- **Cross-pollination**: `x_cross_taxonomy[]` lets you reuse the same audience descriptor in CTV/display campaigns without rebuilding it. That's where iHeart audio + simulcast / CTV stories converge.
- iHeartMedia is **measurement + identity heavy** in this room (see opening calibration). Lead on the trust contract (Exhibit C), not on tool count.

### "What about TTD activation specifically?"
`ttd_sandbox` is roadmap-stage in our destinations registry. We'd activate via `activate_signal` → segment CSV upload via TTD Partner API. Real OAuth not wired (stage: sandbox). For live demo, use `mock_dsp` which always succeeds in ~5s.

### "Does this work for cookieless?"
Yes — `id_resolution.cookieless_ready: true`, with `id_types_supported` covering UID2, ID5, RampID, Yahoo ConnectID, hashed_email, MAID iOS/Android, CTV device. See `/capabilities` `ext.id_resolution`.

### "What's `_message` doing in your responses?"
That's [AAO/Addie's runner display layer](https://github.com/adcontextprotocol/adcp/issues/3999), not us. Verified bytes: our `structuredContent` has `{status, deployments, context}` only. AAO's eval surface adds `_message` for human display. Codebase grep: 0 hits for `_message` in our source. Three-time confirmation across the AAO arc.

---

## Fallback if prod is down

1. **Recorded screencast**: see `docs/workshop-evidence/` (run-through + key tab walks). Not yet recorded — TODO before May 6.
2. **`curl-only fallback`**: see §10 of `WORKSHOP_DEMO_SCRIPT.md` — every flow has a one-line curl reproduction. Show the JSON, narrate as if the UI were rendering it.
3. **Slide deck of the orchestrator screenshots**: `docs/workshop-evidence/` should contain frozen screenshots of headline tabs. TODO before May 6.

---

## Post-workshop hygiene

- Share repo link in the chat: https://github.com/EvgenyAndroid/adcp-signals-adaptor
- Reference the upstream issues: adcp#3999, #4005, #4009 (your fingerprint on the spec)
- Offer the working-committee deliverables from §9 of the main script (gap #5 follow-up + brand-context harmonization)

---

## Pre-flight checklist (one-line summary)

```
□ pre-demo-audit.mjs — 68/68 PASS
□ npm run compliance  — 7/7 PASS
□ validate_against_spec.mjs — 6/6 + 6/6 PASS
□ Demo URL loads, Orchestrator shows 12+ alive agents
□ Discover → activates → completes (5s sanity loop)
□ Tabs/windows pre-arranged for mid-demo pivots
□ Q&A answers reviewed
□ Fallback materials known to be where you expect them
```

If all 8 boxes check, you're shippable. Go run it.
