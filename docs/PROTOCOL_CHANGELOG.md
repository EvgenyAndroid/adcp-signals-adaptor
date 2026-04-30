# Protocol Changelog — since v3.0-rc.1

Protocol-level changes shipped to this adaptor between **2026-04-19** (v3.0-rc.1) and **2026-04-30** (v3.0.6). UI-level work (Canvas tabs, Campaign Canvas, Agentic Canvas) has its own changelog inline in [README.md](../README.md); this file focuses on **wire-format / capability / compliance** changes.

---

## v3.0 GA — 2026-04-23

**Sec-48: multi-agent orchestrator**

The directory's first end-to-end fan-out across all live AdCP agents.

### Added
- `POST /agents/orchestrate` — fan-out a signals search to all live signals agents; merges results
- `POST /agents/workflow/run` + `/run/stream` — 4-stage workflow (signals → creative → products → media-buy) with progressive NDJSON event stream
- `POST /agents/workflow/fire-buy` — fire `create_media_buy` on a chosen agent post-orchestration
- `GET /agents/probe-all` — live probe of every agent in `AGENT_REGISTRY`; returns liveness + tools/list per agent
- `GET /agents/capability-matrix` — declarative matrix of which agents advertise which tools
- Per-vendor adapter rules: `applyVendorAdapter()` with vendor-id branching for Adzymic / Claire / Swivel / Content Ignite

### Findings (workshop-relevant)
- **Auth-posture is the actual ceiling, not shape.** 5/8 buying agents auth-gate at `get_products`. 3/8 (Adzymic APX, Claire Scope3, Swivel) accept `get_products` without auth but **all 3 require auth at `create_media_buy`** with vendor-specific error messages (`Principal ID not found in context` etc.). No shared auth-posture standard in AdCP.
- **Two distinct schema families for brand context.** Adzymic + Swivel use `brand_manifest: BrandManifest`. Claire + Content Ignite use top-level `brand: BrandReference`. Not field-name drift; entirely different contracts. Sec-48r6 vendor-adapter table consolidates the rules.
- **`packages[].buyer_ref`, `pricing_option_id`, scalar `budget`** all required by every known buying vendor — not in the spec's required list. Implementation drift hardened into validators.

---

## v3.0.1 — 2026-04-29

**Registry integration (Phase A-D)** + DTS extension.

### Added
- **`/brands/resolve`** — SWR-cached passthrough to agentic-advertising registry's brand-resolve API. 24h hard TTL · 1h soft "fresh" window. Past 1h, conditional GET upstream with `If-None-Match`. 304 → bump `fetched_at` + return cached body. Upstream-error → return stale body (`cache: "swr-stale-fallback"`).
- **`/registry/agents`** — passthrough + diff. URL-normalized comparison against local `AGENT_REGISTRY` (collapses `/mcp` vs `/mcp/` vs bare-root variants). Reports `only_in_registry[]` + `only_in_local[]` + freshness from daily cron.
- **`/registry/policies`** — local snapshot of 14 policies from agentic-advertising registry (8 regulations / 6 standards · alcohol / tobacco / cannabis / gambling / pharma / GDPR / HFSS / COPPA / CSBS / etc.). Upstream `/api/registry/policies` returned 404 as of 2026-04-30; this snapshot is the local mirror.

### Wire-format extension
- **`DtsV12Label.policy_attestations?: PolicyAttestation[]`** — proposed DTS v1.3 extension. Each attestation declares the signal provider's claim against a registry policy:
  ```json
  {
    "policy_id": "us_coppa",
    "claim": "compliant" | "exempt" | "out_of_scope" | "not_applicable" | "unknown",
    "attested_at": "2026-04-29T13:00:00Z",
    "attestor": "AdCP Signals Adaptor - Demo Provider",
    "evidence_url": "https://example.com/compliance",
    "notes": "..."
  }
  ```
- **8 default attestations** emitted by our demo provider on every `get_signals` response: us_coppa (compliant), csbs (compliant), eu_gdpr_advertising (out_of_scope), uk_hfss (not_applicable), ca_sb_942 / tobacco_nicotine / us_cannabis / political_advertising (out_of_scope).

### Industry enrichment
- Brand industries from the registry are coarse (Pfizer tagged "Heavy Industry"; Heineken tagged "Food and Drink"). 11-pattern overlay supplements via brand-name regex match. Provenance tracked: `industries_meta.added_by_override[]`. Override layer is purely additive + idempotent — no replacement, never lossy.

---

## v3.0.2 — 2026-04-29

**HEAD-spec idempotency + attestation propagation + governance/brand-rights mocks.**

### Wire-format additions

**Idempotency tokens (HEAD-spec future-proof)**
- `idempotency_key` field added to every `create_media_buy` payload
- FNV-1a hash of `(workflow_id × agent_id × product_id × brand_domain × format_ids)`
- Vendors that support replay (per their `adcp.idempotency.supported` capability) return cached canonical responses for the same key
- Vendors that don't recognize the field ignore it — safe to ship unconditionally

**Attestation propagation**
- New `signal_attestations[]` field on `create_media_buy` payload
- Carries the same 8 demo-provider attestations through to the buying agent
- Buyer-side enforcers can act on signal claims at fire-time without round-tripping `get_signals`

**Predictive governance overlay**
- `/registry/governance-preview` — local mock of `check_governance` (no live vendor advertises this primitive in 3.0 GA)
- Decision matrix: silent + `must` policy → `block`; silent + `should` → `warn`; attested compliant/exempt/out_of_scope → `allow` regardless
- AdCP 3.0.1-shaped advisory: `{ mode, outcome, rights[], advisories[], restricted_attributes[] }`

**Predictive brand-rights overlay**
- `/registry/brand-rights-preview` — local mock of `get_rights` (parallel to governance — no live vendor advertises)
- Decision matrix: classification.kind master → `owned`; sub_brand → `delegated` (with `house_domain`); independent → `self_owned`; missing → `unknown` (would need live `get_rights`)
- Format-level escalations: DOOH → `needs_physical_clearance`; native/sponsored → `needs_disclosure`

### Other
- **History/replay** — KV-backed snapshots of every workflow run. `?wf=<id>` deep-link auto-replays; permalink chip with copy-to-clipboard
- **Measurement lane stub** — `/agents/workflow/measurement-stub` returns deterministic synthetic delivery data so the AdCP 4-stage loop renders end-to-end without requiring `get_media_buy_delivery` from any vendor
- **Auto-backfill cron** — daily `0 4 * * *` cron (added alongside existing weekly purge); diffs registry vs `AGENT_REGISTRY`; reports staleness in Canvas registry-sync bar

---

## v3.0.3 — 2026-04-29

**Brand industry enrichment overlay** (separated from v3.0.1 for clarity).

11 pattern groups:
- alcohol · tobacco · cannabis · gambling · pharma · children · financial · fast_food · confectionery · political · ai_generated

Workshop-relevant smoke results:
- `Heineken USA` → registry: `["Food and Drink", ...]` → enriched: adds `["alcohol", "beer", "wine", "spirits"]` → governance preview now WARNs on `alcohol_advertising`
- `Pfizer` → registry: `["Heavy Industry and Engineering"]` → enriched: adds `["pharma", "healthcare", "medical_devices"]` → governance preview now WARNs on `pharma_us_fda`
- `Coca-Cola` → registry: `["Food and Drink", "Beverages"]` → no override matches → unchanged

---

## v3.0.4 — 2026-04-30

**Campaign Canvas — DSP buy-side control loop.**

### New endpoints (mock + live hybrid)

| Endpoint | Method | Purpose |
|---|---|---|
| `/dsp/campaigns` | GET | List 3 demo campaigns (Coca-Cola Summer · Nike Air Max Drop · Pfizer Brand Lift) |
| `/dsp/campaigns/:id` | GET | Full campaign card |
| `/dsp/campaigns/:id/{strategy,bid-stream,inventory,brand-safety,pacing,attribution}` | GET | Mocked stages — synthetic, deterministic, FNV-seeded |
| `/dsp/agents/coverage` | GET | KV-cached probe of every live buying agent for 11 buy-side primitives |
| `/dsp/media-buys/live` | GET | Fan-out `get_media_buys` aggregator with auth-gate detection |
| `/dsp/media-buys/:id/delivery-live` | GET | Real `get_media_buy_delivery` on owning agent |
| `/dsp/campaigns/:id/fire-live` | POST | Real `create_media_buy` from Campaign card with idempotency + attestations |
| `/dsp/media-buys/:id/update-live` | POST | Real `update_media_buy` from Lane 5 strategy diff |
| `/dsp/campaigns/:id/signals-live` | GET | Real `get_signals` against campaign audience brief |
| `/dsp/campaigns/:id/products-live` | GET | Real `get_products` fan-out |
| `/dsp/agents/:id/capabilities-live` | GET | Real `get_adcp_capabilities` deep-probe per agent |

### Coverage probe finding (workshop punchline)

| Buy-side primitive | Live coverage |
|---|---|
| `create_media_buy` | **8/8** buying agents |
| `update_media_buy` | **8/8** |
| `get_media_buy_delivery` | **8/8** |
| `get_media_buys` | **7/8** |
| `cancel_media_buy` / `pause_media_buy` / `resume_media_buy` | **0/8** |
| **`submit_bid_strategy`** (unspec'd in 3.0 GA) | **0/8** |
| **`get_bid_opportunities`** (unspec'd) | **0/8** |
| **`get_pacing_status`** (unspec'd) | **0/8** |
| **`optimize_strategy`** (unspec'd) | **0/8** |

The four `0/8` rows are the largest spec gap remaining in 3.0 GA. Workshop-cite-able as: *"buy-side discovery + plan-level buy is in the spec; real-time bid + optimization is not."*

---

## v3.0.5 — 2026-04-30

**Agentic Canvas — chat-driven planner.** Not strictly a wire-format change but introduces 8 new HTTP endpoints + a streaming pattern.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /agentic/brief/expand` | Natural language → structured `ExpandedBrief` (industries · KPI · budget · geo · flight · audience descriptors · dayparting hint) |
| `POST /agentic/plan` | `ExpandedBrief` × coverage matrix → `ExecutionPlan` (ordered tool-call sequence with rationale) |
| `POST /agentic/execute` | NDJSON-stream execution of a plan with progressive reasoning + per-step tool results |
| `POST /agentic/explain` | Explain any decision in prose |
| `POST /agentic/chat` | Unified: expand + plan + governance + memory in one streaming pipeline |
| `POST /agentic/recover` | Suggest retry strategy on tool failure (alternate agent / simplified payload / fallback dry-run) |
| `POST /agentic/remediate` | Suggest signal swaps + attestation hints to unblock governance BLOCK |
| `GET  /agentic/memory/recall` | KV-backed top-K similar past workflows |

### Two-mode design
- **Live LLM** — Claude Sonnet 4 via Anthropic API when `ANTHROPIC_API_KEY` is set
- **Templates** — rule-based deterministic fallback that produces structurally identical output (16 brand patterns + budget/KPI/geo/flight regex)

The Canvas surface is identical in either mode; live mode adds open-ended brief understanding the templates can't anticipate.

---

## v3.0.6 — 2026-04-30

**SDK bump `@adcp/client` 5.21.1 → 5.25.1.**

### Conformance fixes (we filed these)
- **`adcp-client#1060` → PR #1061** (closed 2026-04-30): `get_products` gate dropped on protocol-wide scenarios — `error_handling`, `validation`, `schema_compliance` now run on signals-only agents
- **`adcp-client#1062` → PR #1063** (closed 2026-04-30): `past_start_enforcement` storyboard required-tools pre-flight gate enforced in runner

Both shipped in `@adcp/sdk@5.25.0`. Both filed 2026-04-29; both closed within 36h.

### Compliance impact

| Metric | Before | After |
|---|---|---|
| Scenarios passed | 4 | **7** |
| Scenarios skipped | 35 | 32 |
| New runs | — | error_handling (1) · validation (1) · schema_compliance (4) |

### Other 5.25 hardening (#1073 + #1075)
- Caller-supplied `adcp_major_version` / `adcp_version` no longer overridden by SDK pin (restores pre-5.24 caller-wins contract)
- Single-field `VERSION_UNSUPPORTED` server-side check (closes spec gap from PR #1067 review)

---

## Reference

- **Memory: filed-issue closure cycle** — `memory/recent_shipped_2026_04.md`
- **Memory: agent capability deep-mine** — `memory/agent_capability_dump_2026_04_27.md`
- **Memory: Sec-48 vendor-adapter rules** — `memory/recent_shipped_2026_04.md` (Sec-48r6 table)
- **Memory: AdCP daily watcher** — `memory/reference_adcp_watcher.md`
