# Workshop evidence — May 7 iHeartMedia NYC

Captured artifacts from the live deploy at
`https://adcp-signals-adaptor.evgeny-193.workers.dev` for use in the
Mini Governance & Signals Workshop.

## Files

| # | File | What it shows | Slide-fit |
|---|---|---|---|
| 01 | [registry_diff.md](./01_registry_diff.md) | Before/after the URL-normalization + 3-vendor backfill | Phase B opener — "the registry is the source of truth, here's how we keep ourselves in sync" |
| 02 | [dts_attestations_sample.md](./02_dts_attestations_sample.md) | Live DTS v1.2 label with the Phase D `policy_attestations[]` extension (8 claims) | Phase D core — "trust contract = DTS + attestation" |
| 03 | [policy_hits_by_brand.md](./03_policy_hits_by_brand.md) | 6 brand scenarios (Coca-Cola / Anheuser-Busch / GSK / Lego / DraftKings / Tesla) → applicable policies | Phase C core — brand-anchored governance pre-filter |
| 04 | [auth_gated_fire_buy.md](./04_auth_gated_fire_buy.md) | Live fire-buy response showing payload-PASSED but auth-FAILED on Adzymic APX | Sec-48 vendor-audit punchline — "auth posture is the actual ceiling, not shape" |

## Numbers worth memorizing for the Q&A

- **22 buying-eligible agents** in the agentic-advertising registry (as of 2026-04-29)
- **3 agents** advertise `create_media_buy` without auth wall on the discovery side; **all 3** still require auth at fire time
- **14 policies** in the registry policy table (8 regulations / 6 standards; 8 `must` / 6 `should`)
- **8 policy_attestations** emitted by our DTS label as the workshop strawman for v1.3
- **2 catch-all policies** apply to every brand regardless of industry: GDPR Advertising Requirements + Common Sense Brand Standards (CSBS)
- **6 protocol domains** in AdCP 3.0 GA; **3 of them** (governance, brand, sponsored_intelligence) are greenfield in the directory — visible on the Canvas as "spec'd · no live impl" cards

## Live URLs to drop into the deck

```
https://adcp-signals-adaptor.evgeny-193.workers.dev/                      # Canvas tab
https://adcp-signals-adaptor.evgeny-193.workers.dev/registry/agents       # 22-agent JSON + diff
https://adcp-signals-adaptor.evgeny-193.workers.dev/registry/policies     # 14-policy snapshot
https://adcp-signals-adaptor.evgeny-193.workers.dev/brands/resolve?domain=coca-cola.com
```

Refresh the artifacts before the workshop with:

```bash
# from repo root
bash docs/workshop-evidence/refresh.sh   # (TODO if we want this scripted)
```

For now, regenerate ad-hoc by re-running the curl pipelines that
produced each file (commit history → "deck-ready evidence" commit).
