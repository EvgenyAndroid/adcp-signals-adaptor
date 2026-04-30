# Workshop evidence — May 7 iHeartMedia NYC

Captured artifacts from the live deploy at
`https://adcp-signals-adaptor.evgeny-193.workers.dev` for use in the
Mini Governance & Signals Workshop.

## Files

| # | File | What it shows | Slide-fit |
|---|---|---|---|
| 01 | [registry_diff.md](./01_registry_diff.md) | Before/after the URL-normalization + 3-vendor backfill — registry-sync 22/22 (zero diff) | Phase B opener — "the registry is the source of truth, here's how we keep ourselves in sync" |
| 02 | [dts_attestations_sample.md](./02_dts_attestations_sample.md) | Live DTS v1.2 label with the v1.3-proposal `policy_attestations[]` extension (8 claims) | Phase D core — "trust contract = DTS + attestation" |
| 03 | [policy_hits_by_brand.md](./03_policy_hits_by_brand.md) | 6 brand scenarios (Coca-Cola / Anheuser-Busch / GSK / Lego / DraftKings / Tesla) + post-#118 enrichment showing Heineken/Pfizer | Phase C core — brand-anchored governance pre-filter |
| 04 | [auth_gated_fire_buy.md](./04_auth_gated_fire_buy.md) | Live fire-buy response showing payload-PASSED but auth-FAILED on Adzymic APX | Sec-48 vendor-audit punchline — "auth posture is the actual ceiling, not shape" |
| 05 | [agentic_canvas_demo.md](./05_agentic_canvas_demo.md) | Coca-Cola end-to-end on Agentic Canvas — Claude Sonnet 4 brief expansion → tool plan → streaming reasoning → execution | The "WOW" moment — "type the brief, watch the agent think" |
| 06 | [dsp_live_coverage.md](./06_dsp_live_coverage.md) | Buy-side coverage matrix: 8/8 lifecycle tools live; 0/8 advertise the 4 unspec'd primitives | The largest 3.0 GA spec gap, made visible |
| 07 | [demo_runbook.md](./07_demo_runbook.md) | Scene-by-scene walk-through: 8 demo moves across the 3 Canvases | Day-of script |

## Numbers worth memorizing for the Q&A

### Registry + agents
- **22 buying-eligible agents** in the agentic-advertising registry (post-#114 backfill: registry 22 / local 22 / +0 new)
- **8 buying agents** advertise the spec lifecycle tools (`create_media_buy` · `update_media_buy` · `get_media_buy_delivery` · `get_media_buys`)
- **3 agents** advertise `create_media_buy` without auth wall on the discovery side; **all 3** still require auth at fire time

### Spec gap (workshop punchline)
- **0 / 8** buying agents advertise any of the 4 unspec'd buy-side primitives: `submit_bid_strategy` · `get_bid_opportunities` · `get_pacing_status` · `optimize_strategy`
- **6 protocol domains** in AdCP 3.0 GA; **3 of them** (governance · brand-rights · sponsored_intelligence) are still greenfield in the directory — visible on Canvas as "spec'd · no live impl" cards
- **0 vendors** advertise live `check_governance` (3.0.1 added the spec; no vendor implements yet) — our Canvas mocks the predictive overlay

### Trust contract
- **14 policies** in the registry policy table (8 regulations / 6 standards; 8 `must` / 6 `should`)
- **8 policy_attestations** emitted by our DTS label as the v1.3 strawman
- **2 catch-all policies** apply to every brand regardless of industry: GDPR Advertising Requirements + Common Sense Brand Standards (CSBS)

### Compliance (post-SDK 5.25.1)
- **7 / 7 scenarios passing** (jumped from 4 / 4 after upstream merged the 2 issues we filed yesterday — both closed within 36h)
- **Compliance newly passing**: `error_handling`, `validation`, `schema_compliance` — these were skipped before because of `SCENARIO_REQUIREMENTS` gating bugs

### Agentic
- **8 endpoints** under `/agentic/*` — chat, brief expand, plan, execute (NDJSON stream), explain, recover, remediate, memory recall
- **2 modes** — live LLM (Claude Sonnet 4 via `ANTHROPIC_API_KEY`) or rule-based templates (deterministic fallback)

## Live URLs to drop into the deck

```
https://adcp-signals-adaptor.evgeny-193.workers.dev/

# Brand Canvas (sell-side)
  → ?wf=<id>                                              # permalink replay
  /brands/resolve?domain=coca-cola.com                    # SWR brand resolve
  /registry/agents                                        # 22-agent diff
  /registry/policies                                      # 14-policy snapshot
  /registry/governance-preview?industries=alcohol         # mock governance
  /registry/brand-rights-preview?kind=master&...          # mock brand rights

# Campaign Canvas (buy-side / DSP)
  /dsp/agents/coverage                                    # 11-tool coverage matrix
  /dsp/campaigns                                          # 3 demo campaigns
  /dsp/campaigns/cmp_cocacola_summer/{strategy,bid-stream,inventory,brand-safety,pacing,attribution}
  /dsp/media-buys/live                                    # live get_media_buys aggregator

# Agentic Canvas
  /agentic/chat (POST)                                    # full streaming pipeline
  /agentic/brief/expand (POST)                            # Claude brief expansion
```

## Refreshing the artifacts

The numbers above were captured against deploy version `8a1a1048` (2026-04-30 post-#124 SDK bump). Refresh by hitting the curl pipelines in each evidence file — they're commented inline at the top.

## Memorable demo flow

1. **Open Canvas tab** → search "coca-cola" → click → registry-sync bar shows **22 / 22 / 0 new** (post-#114 normalization)
2. **Brand card resolves** with SWR cache, real Coca-Cola brand.json, palette + fonts + classification (master), industries enriched only if needed
3. **Policy hits row** appears: GDPR + CSBS catch-alls (Coca-Cola has no industry-specific must hits — clean ALLOW)
4. **Governance preview banner**: ✓ ALLOW (8 attestations cover all applicable policies)
5. **"Run workflow"** → 4 stages cascade: signals (Evgeny + Dstillery) → creative (Celtra + Advertible) → products (Adzymic + Claire + Swivel) → media-buy (dry-run cells + per-vendor predicted CPM/impressions)
6. **Auth-gating** surfaces inline on fired agents — amber callout on Adzymic ("auth-gated — payload shape passed; vendor requires credentials we do not have")
7. **Click Campaign tab** → Coca-Cola Summer campaign → 5-lane control-loop view; coverage strip at top shows **0/8** for unspec'd primitives in red
8. **Click Agentic tab** → click "Coca-Cola summer · Gen Z" suggestion → watch Claude expand the brief, plan the call sequence, and stream reasoning trace char-by-char — the "WOW" moment

Total demo time: 8–10 minutes. Backup beats per scene in [`07_demo_runbook.md`](./07_demo_runbook.md).
