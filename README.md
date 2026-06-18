# AdCP Signals Adaptor

A production-structured, AdCP 3.1-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol with IAB Data Transparency Standard v1.2 labeling, a UCP (User Context Protocol) embedding bridge, real OpenAI embedding vectors, a concept-level cross-taxonomy registry, natural language audience query, and a complete three-phase Vector Alignment Handshake — the first reference implementation combining the AdCP-UCP Bridge Profile with all UCP v0.2-draft extensions including GTS, Projector, and Handshake Simulator.

**Live:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`  
**MCP:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`  
**GitHub:** `https://github.com/EvgenyAndroid/adcp-signals-adaptor`  
**Trust model:** this is a single-operator demo — see [SECURITY_MODEL.md](SECURITY_MODEL.md) for the shared-LinkedIn-token constraint and when to revisit it.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-01-15 | Initial AdCP 2.6 implementation — 4 core MCP tools, D1 signal catalog, async activation |
| v1.1 | 2026-01-28 | IAB DTS v1.2 labeling — `x_dts` on every signal, all field types, onboarder section |
| v2.0 | 2026-02-15 | UCP embedding bridge — `x_ucp` on every signal, real OpenAI vectors, concept registry (19 concepts, 5 vendors), 3 new MCP tools (`query_signals_nl`, `get_concept`, `search_concepts`) |
| v2.1 | 2026-03-08 | Hybrid NL resolver — true three-pass pipeline (exact_rule → embedding_similarity → lexical_fallback), MIN_EMBEDDING_SCORE=0.45, cord_cutter archetype, SemanticResolver class, `_embedding_mode` transparency field |
| v3.0-rc | 2026-03-12 | Phase 2b + Phase 3 — GTS endpoint (15 pairs), Projector (Procrustes/SVD, simulated), Handshake Simulator (3-outcome negotiation), updated MCP initialize serverInfo |
| v3.0-rc.1 | 2026-04-19 | AdCP v3 capabilities schema conformance — `get_adcp_capabilities` now accepts the `protocols` filter parameter, UCP block moved from top-level to `ext.ucp` (schema-sanctioned extension slot) |
| v3.0 GA | 2026-04-23 | Sec-48 multi-agent orchestrator — fan-out across the live AdCP directory (12 agents); 4-stage workflow (signals → creative → products → media-buy); per-vendor `applyVendorAdapter` covering brand-schema-family split (BrandManifest vs `brand: BrandRef`), `packages[].buyer_ref`, `pricing_option_id`, scalar `budget`. Auth-posture finding: 5/8 buying agents auth-gate; the 3 default-trio also auth-gate at `create_media_buy`. Sec-48 docs in [memory/agent_capability_dump_2026_04_27.md](https://github.com/EvgenyAndroid/adcp-signals-adaptor/tree/master/memory). |
| v3.0.1 | 2026-04-29 | **Registry integration (Phase A-D)** — SWR brand-resolve cache (24h hard / 1h fresh / etag-revalidate) · `/registry/agents` passthrough with URL-normalized diff against local `AGENT_REGISTRY` · `/registry/policies` snapshot of 14 policies (8 regulations / 6 standards · alcohol / tobacco / pharma / gambling / GDPR / CSBS / etc.) · **DTS v1.2 extended with `policy_attestations[]`** (proposed v1.3 — declares signal's compliance posture against agentic-advertising registry policies) · Canvas brand-anchored view with brand.json from agenticadvertising.org registry · auth-gate detection regex + per-vendor inline rejection callout. |
| v3.0.2 | 2026-04-29 | **7 MVPs across all priority tiers** — idempotency tokens (FNV-1a hash) on every `create_media_buy` (HEAD-spec future-proof) · `signal_attestations[]` propagation into wire payload · partial-result rebalance ("X auth-gated · Y live · $perAgent → $rebalancedPerSuccess") · history/replay (KV-backed permalinks · `?wf=<id>` deep-link auto-replay) · measurement lane stub (closes the AdCP 4-stage loop) · daily auto-backfill cron (`0 4 * * *`) · multi-brand A/B (Coca-Cola vs DraftKings side-by-side compare with delta table) · governance preview enforcement (block fire button on must-violation with override link) · cost/impression estimation in dry-run cells · brand-rights mock surface (parallel to governance preview, closes 3.0.1 governance + brand-rights domain pair). |
| v3.0.3 | 2026-04-29 | **Brand industry enrichment** — registry's industry taxonomy is coarse (Pfizer tagged "Heavy Industry", Heineken tagged "Food and Drink"). 11 pattern groups (alcohol · tobacco · cannabis · gambling · pharma · children · financial · fast_food · confectionery · political · ai_generated) supplement registry tags via brand-name regex. Provenance-tracked: `industries_meta.added_by_override[]` lists what we added; chips get dashed-accent border + `+` prefix on Canvas. |
| v3.0.4 | 2026-04-30 | **Campaign Canvas (DSP buy-side control loop)** — new tab parallel to brand-anchored Canvas. Mocks the 4 unspec'd buy-side primitives (`submit_bid_strategy` · `get_bid_opportunities` · `get_pacing_status` · `optimize_strategy`) PLUS LIVE-ORCHESTRATES every primitive any directory agent advertises: `/dsp/agents/coverage` (KV-cached probe of 11 buy-side tools across 8 buying agents) · `/dsp/media-buys/live` (fan-out `get_media_buys` aggregator) · `/dsp/media-buys/:id/delivery-live` · `/dsp/campaigns/:id/fire-live` (real `create_media_buy` from Campaign card) · `/dsp/media-buys/:id/update-live` (real `update_media_buy` from Lane 5 strategy diff) · `/dsp/campaigns/:id/signals-live` (real `get_signals` against campaign's audience brief) · `/dsp/campaigns/:id/products-live` (real `get_products` fan-out) · `/dsp/agents/:id/capabilities-live` (real `get_adcp_capabilities` deep-probe). Per-lane LIVE/MOCK/0-of-N provenance pills. **Coverage finding: 8/8 buying agents advertise lifecycle tools (create/update/delivery/buys); 0/8 advertise any of the 4 unspec'd primitives — workshop-cite-able as the largest spec surface gap remaining in 3.0 GA.** |
| v3.0.5 | 2026-04-30 | **Agentic Canvas** — chat-driven brief expander + tool-selection planner + NDJSON-streamed reasoning trace. Two-mode: **live LLM** (Claude Sonnet 4 via Anthropic API when `ANTHROPIC_API_KEY` is set) or **rule-based templates** that produce structurally identical output deterministically. 8 endpoints: `/agentic/brief/expand` · `/agentic/plan` · `/agentic/execute` (stream) · `/agentic/explain` · `/agentic/chat` · `/agentic/recover` · `/agentic/remediate` · `/agentic/memory/recall`. Streaming UX: skeleton pulses on submit, sections cascade-fade-in as data lands, reasoning trace types char-by-char with blinking cursor, active stage gets accent-glow loop. Reusable "Explain this" overlay badges any decision surface. |
| v3.0.6 | 2026-04-30 | **SDK bump `@adcp/client` 5.21.1 → 5.25.1** — picks up upstream fixes for two issues we filed (closed within 36h): adcp-client#1060 (`get_products` gate dropped on protocol-wide scenarios) + adcp-client#1062 (`past_start_enforcement` storyboard required-tools pre-flight). Compliance scenarios passed: **4 → 7** (`error_handling`, `validation`, `schema_compliance` now run on signals-only agents). Plus 5.25 version-negotiation hardening (#1073, #1075) — caller-supplied `adcp_major_version` no longer SDK-overridden; single-field `VERSION_UNSUPPORTED` server check. |
| v3.1.0 GA | 2026-06-18 | **AdCP 3.1 GA promotion.** Re-vendored the schema corpus `3.0.15 → v3.1.0`; bumped `SPEC_VERSION → 3.1.0` and `ADCP_MAJOR_LINE → "3.1 GA"` (X-AdCP-Spec-Version now `3.1.0`); serve release-precision `adcp_version: "3.1"` + re-added `adcp.supported_versions: ["3.0","3.1"]`; reject cross-major `adcp_version` pins (e.g. `"4.0"`) with `VERSION_UNSUPPORTED`. Passes the v3.1.0 GA storyboard suite **7/7** (`@adcp/sdk@9.0.0`) — every schema-required signals constraint already satisfied (`cache_scope`, mutating-only idempotency, flat MCP envelope, required signal-item fields). `adagents.json` validated compliant against the 3.1 schema. (The `3.0.7 → 3.0.19` patches in between were storyboard-only / no-wire-change batch refreshes — folded in here, not given per-version rows.) Upstream this cycle: authored `last_updated` on `signal-definition` (adcp#5249, in 3.1), shipped the merged AAO grader fix (adcp#5429/#5444), and posted the `runtime_attestations` RFC (adcp#5418, 3.2 candidate). |

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol 3.1 GA — 8 MCP tools. Capabilities response conforms to the [v3 schema](https://adcontextprotocol.org/schemas/v3/protocol/get-adcp-capabilities-response.json):

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions: [3]` + `adcp.supported_versions: ["3.0", "3.1"]` + `supported_protocols: ["signals"]` + UCP block under `ext.ucp` + `adcp.idempotency.{supported, replay_ttl_seconds}` + `governance.mode` (advisory/audit/enforce). Accepts `protocols` filter param. |
| `get_signals` | ✅ | `signal_spec` + `deliver_to` (required) + relevance ranking + `x_dts` (with v3.0.1 `policy_attestations[]`) + `x_ucp` on every signal |
| `activate_signal` | ✅ | `deliver_to` required. Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Aliases: `get_task_status`, `get_signal_status`. `destinations` field. |
| `get_similar_signals` | ✅ | UCP vector cosine similarity search |
| `query_signals_nl` | ✅ | Hybrid NL audience query — exact_rule → embedding_similarity → lexical_fallback. v2.1 |
| `get_concept` | ✅ | Concept registry exact lookup by concept_id |
| `search_concepts` | ✅ | Semantic search over concept registry |

Passes the AdCP conformance test suite at `@adcp/client@5.25.1`: **7 / 7 scenarios** (health · discovery · capability_discovery · signals_flow · error_handling · validation · schema_compliance — last 3 unblocked by upstream fixes for our filed issues #1060 + #1062).

### Adapter-side capabilities (v3.0.1+)

Beyond the 8 MCP signal tools above, this adaptor also exposes **federation, registry, governance, and agentic-orchestration surfaces** via REST endpoints. These are NOT in the spec but are workshop-visible value-adds and most are mocked locally where the spec is silent.

| Surface | Endpoint(s) | Spec status |
|---|---|---|
| Brand resolve / search / logo | `/brands/resolve` · `/brands/search` · `/brands/logo` | passthrough to agentic-advertising registry |
| Registry agents diff | `/registry/agents` | passthrough + URL-normalized diff vs local AGENT_REGISTRY |
| Registry policies | `/registry/policies` | local snapshot of 14 policies (upstream `/api/registry/policies` 404'd as of 2026-04-30) |
| Governance preview (mock) | `/registry/governance-preview` | predictive `check_governance` — no live vendor advertises |
| Brand-rights preview (mock) | `/registry/brand-rights-preview` | predictive `get_rights` — no live vendor advertises |
| Live DSP coverage | `/dsp/agents/coverage` · `/dsp/media-buys/live` · `/dsp/campaigns/:id/{strategy,bid-stream,inventory,brand-safety,pacing,attribution}` | live MCP fan-out where advertised; mocked for the 4 unspec'd buy-side primitives |
| Live DSP mutations | `/dsp/campaigns/:id/fire-live` · `/dsp/media-buys/:id/{update,delivery}-live` · `/dsp/campaigns/:id/{signals,products}-live` · `/dsp/agents/:id/capabilities-live` | live MCP calls; auth-gated by vendor where applicable |
| Agentic orchestrator | `/agentic/{brief/expand,plan,execute,explain,chat,recover,remediate,memory/recall}` | LLM-driven (Claude Sonnet 4 in live mode; rule-based templates as fallback) |
| Watcher cron | `0 4 * * *` daily | diffs registry vs local AGENT_REGISTRY; reports staleness in registry-sync bar |

---

## Standards Coverage

| Standard | Coverage |
|---|---|
| AdCP Signals Activation Protocol v3.0 GA | Full — all 4 core tools + `get_similar_signals` + NL query + concept registry extensions. Capabilities response conforms to v3 schema (UCP under `ext.ucp`, `protocols` filter, `adcp.idempotency` block, `governance.mode` field). |
| AdCP 3.0.1 spec extensions | Governance `mode` field on capabilities · paginated `max_results` enforcement |
| IAB Data Transparency Standard v1.2 | Full — `x_dts` on every signal, all field types, onboarder section |
| **DTS v1.3 proposal** | `policy_attestations[]` extension on every DTS label (8 default claims for our demo provider; bridges IAB content-trust to AdCP governance layer) |
| UCP (User Context Protocol) v0.1/v0.2-draft | `x_ucp` on every signal, real VAC embeddings, concept registry, NL query, GTS, Projector |
| HEAD-spec compliance (FNV-1a) | `idempotency_key` on every `create_media_buy` payload (HEAD requires; published rc.3 doesn't enforce; vendors that support replay return cached canonical responses) |

---

## What's New since v3.0-rc.1 (2026-04-19 → 2026-04-30)

Detailed protocol-level changes are in [docs/PROTOCOL_CHANGELOG.md](docs/PROTOCOL_CHANGELOG.md). High-level highlights:

**Trust pipeline closed end-to-end** (v3.0.1 + v3.0.2)
- DTS v1.2 extended with `policy_attestations[]` (proposed v1.3) — 8 default claims propagated through every `get_signals` and `create_media_buy` payload
- Governance preview mock + brand-rights preview mock fill the AdCP 3.0.1 governance + brand-rights domain pair on the Canvas
- Idempotency keys (FNV-1a) on every fire-buy — HEAD-spec future-proof
- Compliance auto-remediation: when governance predicts BLOCK, system suggests signal swaps that would unblock

**Buy-side / DSP control loop** (v3.0.4)
- New "Campaign Canvas" tab parallel to brand-anchored Canvas
- Mocks the 4 unspec'd buy-side primitives (`submit_bid_strategy` · `get_bid_opportunities` · `get_pacing_status` · `optimize_strategy`) — coverage probe shows **0/8 buying agents advertise these**, the largest spec gap remaining in 3.0 GA
- Live-orchestrates every primitive any directory agent advertises (8/8 agents support `create_media_buy` · `update_media_buy` · `get_media_buy_delivery` · `get_media_buys`)
- Per-lane LIVE/MOCK provenance pills + `0/N agents advertise X` callouts for honesty

**Agentic orchestration** (v3.0.5)
- "Agentic Canvas" tab with chat input → LLM brief expander → tool-selection planner → NDJSON streaming reasoning trace
- Two-mode: **live LLM** (Claude Sonnet 4) when `ANTHROPIC_API_KEY` is set, or rule-based templates as deterministic fallback
- 8 endpoints; reasoning trace types char-by-char; sections cascade-fade-in as data lands

**Conformance jump** (v3.0.6)
- SDK bumped 5.21.1 → 5.25.1 picks up upstream fixes for two issues we filed (closed within 36h)
- Compliance scenarios passed: **4 → 7** (`error_handling`, `validation`, `schema_compliance` now run on signals-only agents)
- Plus 5.25 version-negotiation hardening

## What's New in v3.0-rc

- **GET /ucp/gts** — Golden Test Set endpoint. 15 curated signal pairs (identity/related/orthogonal) with pre-computed cosine similarities from real v1 vectors. Buyer agents call this during Phase 1 to verify semantic alignment before the VAC handshake.
- **GET /ucp/projector** — Procrustes/SVD alignment matrix. Maps `openai-te3-small-d512-v1` → `ucp-space-v1.0`. Status `"simulated"` (IAB reference model pending). R ≈ I until IAB publishes.
- **POST /ucp/simulate-handshake** — Phase 1 buyer-side negotiation demo. Returns `direct_match` / `projector_required` / `legacy_fallback` outcome with full `negotiation_trace`.
- **MCP `initialize` serverInfo.ucp** updated to advertise GTS, projector, and handshake_simulator to connecting buyer agents.

## What's New in v2.1

- **Hybrid resolver** — `POST /signals/query` now runs a true three-pass pipeline: `exact_rule` → `embedding_similarity` (OpenAI cosine, threshold 0.45) → `lexical_fallback` (Jaccard). Pass 2 is semantically valid with real vectors.
- **MIN_EMBEDDING_SCORE = 0.45** — weak embedding matches (e.g. "coffee" → "College Educated Streamers" at 0.30) are rejected as noise; leaf falls through to unresolved rather than producing misleading results.
- **`cord_cutter` archetype** — added to ARCHETYPE_TABLE; resolves to `streaming_affinity:high` via embedding similarity.
- **Age band Rule 7** — "35+" in queryParser maps to `age_band: "35-44"` only. No multi-band expansion unless the query explicitly names a range.
- **Lexical threshold raised** — Pass 3 Jaccard threshold raised from 0.05 to 0.15 to reduce token-noise matches on unrelated dimensions.
- **`_embedding_mode` + `_embedding_space`** in every `/signals/query` response for operational transparency.

## What's New in v2.0

- **Real embedding vectors** — all catalog signals carry genuine OpenAI `text-embedding-3-small` (512-dim) vectors. `space_id: openai-te3-small-d512-v1` is semantically valid.
- **`POST /signals/query`** — natural language audience query with boolean AST decomposition.
- **`GET /ucp/concepts`** — concept-level VAC registry, 19 concepts, 7 categories, 5 vendor cross-taxonomy maps.
- **3 new MCP tools** — `query_signals_nl`, `get_concept`, `search_concepts`.

---

## Key Design Decisions

**`signal_spec` not `brief`** — canonical AdCP spec parameter name. `brief` accepted as alias.

**`deliver_to` required** — spec-compliant object with `deployments[]` and `countries[]` on both `get_signals` and `activate_signal`.

**Relevance ranking** — when `signal_spec` is present, fetches up to 200 signals, scores by keyword overlap (name +4, description +2, category hint +3, derived/dynamic bonus), sorts before applying `max_results`.

**Deterministic dynamic IDs** — `sig_dyn_{slug}_{djb2hash}`. Same rules → same ID → upsert idempotency. No duplicates.

**`destinations` not `deployments`** — spec-aligned response field name in both `activate_signal` and `get_operation_status`.

**`x_dts` + `x_ucp`** — every signal carries both extension fields. Non-breaking to conformance tests via AdCP `x_` extension mechanism.

**Request-scoped embedding engine** — `createEmbeddingEngine(env)` called once per NLAQ request. Query vectors and candidate vectors always use the same model instance. No mixed-space comparisons.

---

## UCP Phase 2b + Phase 3 (v3.0-rc)

### GET /ucp/gts — Golden Test Set

Before two agents exchange embeddings they independently encode a shared concept-pair set and verify their vectors land in the same semantic neighbourhoods. This endpoint exposes the provider's GTS so a buyer agent can validate geometric + semantic compatibility before the VAC handshake.

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/gts \
  | jq '{overall_pass, pass_rate, summary}'
```

Response shape:
```json
{
  "gts_version": "adcp-gts-v1.0",
  "space_id": "openai-te3-small-d512-v1",
  "engine_phase": "llm-v1",
  "overall_pass": true,
  "pass_rate": 1.0,
  "must_pass_pairs": 10,
  "passed_must_pass": 10,
  "summary": {
    "identity_pairs":   { "count": 6, "passing": 6 },
    "related_pairs":    { "count": 5, "passing": 5 },
    "orthogonal_pairs": { "count": 4, "passing": 4 }
  }
}
```

Pass criteria: thresholds are calibrated empirically from real `text-embedding-3-small` vectors — all signals share the "audience segment" domain, producing cosine inflation vs general-purpose NLP benchmarks. Identity pair minimums range from 0.50–0.72 per pair; orthogonal pair maximums range from 0.55–0.78 per pair. See individual pair `expected_min`/`expected_max` fields in the full `/ucp/gts` response. `overall_pass: true` requires `engine_phase: "llm-v1"` and all 10 `must_pass` pairs passing.

### GET /ucp/projector — Procrustes/SVD Alignment Matrix

Returns a 512×512 orthogonal rotation matrix mapping `openai-te3-small-d512-v1` → `ucp-space-v1.0`. Status is `"simulated"` — IAB Tech Lab has not yet published reference model vectors, so R ≈ I (identity). Endpoint shape is fully spec-compliant and will carry the real matrix on IAB publication. Requires auth.

> **API key:** gated routes require `Authorization: Bearer $DEMO_API_KEY`. Export the value you provisioned via `wrangler secret put DEMO_API_KEY` into your shell before running the examples below — e.g. `export DEMO_API_KEY=...`. The key is a Worker secret, not a checked-in constant.

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/projector \
  -H "Authorization: Bearer $DEMO_API_KEY" \
  | jq '{from_space, to_space, status, anchor_count, signature}'
```

### POST /ucp/simulate-handshake — Phase 1 Negotiation Demo

Accepts a buyer agent capability payload. Returns the negotiated outcome across the three VAC phases with a step-by-step negotiation trace.

**Three outcomes:**

| Outcome | Condition | Path |
|---|---|---|
| `direct_match` | Buyer declares seller's space_id | Call `/signals/:id/embedding` directly |
| `projector_required` | Buyer uses different space, projector available | Fetch `/ucp/projector`, apply rotation |
| `legacy_fallback` | Incompatible UCP version or no declared spaces | Use `x_ucp.legacy_fallback.segment_ids` |

```bash
# Direct match
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake \
  -H "Content-Type: application/json" \
  -d '{"buyer_space_ids":["openai-te3-small-d512-v1"],"buyer_ucp_version":"ucp-v1"}' \
  | jq '{outcome, matched_space}'

# Projector path (different space)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake \
  -H "Content-Type: application/json" \
  -d '{"buyer_space_ids":["bert-base-uncased-v1"],"buyer_ucp_version":"ucp-v1"}' \
  | jq '{outcome, projector_endpoint, projector_status}'

# Legacy fallback (incompatible version)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake \
  -H "Content-Type: application/json" \
  -d '{"buyer_space_ids":[],"buyer_ucp_version":"ucp-v0"}' \
  | jq '{outcome, fallback_mechanism}'
```

---

## Data Transparency Standard v1.2

Every signal carries an `x_dts` object — IAB DTS v1.2 ("Privacy Update", April 2024). Generated in `src/mappers/signalMapper.ts` via `buildDtsLabel()`.

### DTS by signal type

| Signal type | `data_sources` | `methodology` | `refresh` | Onboarder |
|---|---|---|---|---|
| Seeded demographic/interest | `["Online Survey"]` | `"Modeled"` | `"Static"` | N/A |
| Derived composite | `["Online Survey"]` | `"Derived"` | `"Static"` | N/A |
| Dynamic (brief proposal) | `["Online Survey"]` | `"Modeled"` | `"Static"` | N/A |
| Census ACS-derived | `["Public Record: Census"]` | `"Derived"` | `"Annually"` | Populated |
| Nielsen DMA-derived | `["Geo Location"]` | `"Observed/Known"` | `"Annually"` | N/A |
| Cross-taxonomy bridge | `["Web Usage", "App Behavior"]` | `"Derived"` | `"Static"` | N/A |
| CTV/ACR (future) | `["TV OTT or STB Device"]` | `"Observed/Known"` | `"Weekly"` | N/A |

### Example `x_dts` (Census ACS signal)

```json
{
  "x_dts": {
    "dts_version": "1.2",
    "provider_name": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
    "provider_domain": "adcp-signals-adaptor.evgeny-193.workers.dev",
    "provider_email": "evgeny@evgeny.dev",
    "audience_id": "sig_acs_graduate_high_income",
    "taxonomy_id_list": "11",
    "audience_criteria": "Households with graduate degree and HHI $150K+. Source: ACS 2022 B15003 × B19001.",
    "audience_precision_levels": ["Household"],
    "audience_scope": "Cross-domain outside O&O",
    "audience_size": 1290000,
    "id_types": ["Platform ID"],
    "geocode_list": "USA",
    "privacy_compliance_mechanisms": ["GPP", "MSPA"],
    "iab_techlab_compliant": "No",
    "data_sources": ["Public Record: Census"],
    "audience_inclusion_methodology": "Derived",
    "audience_expansion": "No",
    "device_expansion": "No",
    "audience_refresh": "Annually",
    "lookback_window": "Annually",
    "onboarder_match_keys": "Postal / Geographic Code",
    "onboarder_audience_expansion": "No",
    "onboarder_device_expansion": "No",
    "onboarder_audience_precision_level": "Geography"
  }
}
```

### DTS → UCP normative field mappings (AdCP-UCP Bridge Profile)

| DTS field | Value | UCP field | Mapped value |
|---|---|---|---|
| `data_sources` | `["Public Record: Census"]` | `signal_type` | `"identity"` |
| `data_sources` | `["TV OTT or STB Device"]` | `signal_type` | `"reinforcement"` |
| `data_sources` | `["Web Usage", "App Behavior"]` | `signal_type` | `"contextual"` |
| `audience_inclusion_methodology` | `"Observed/Known"` | `signal_strength` | `"high"` |
| `audience_inclusion_methodology` | `"Derived"` | `signal_strength` | `"medium"` |
| `audience_inclusion_methodology` | `"Modeled"` | `signal_strength` | `"low"` |
| `taxonomy_id_list` | `"11"` | `legacy_fallback.segment_ids` | `["11"]` |
| `privacy_compliance_mechanisms` | `["GPP","MSPA"]` | `privacy.privacy_compliance_mechanisms` | `["GPP","MSPA"]` |
| `audience_refresh` | `"Annually"` | `privacy.ttl_seconds` | `31536000` |

---

## UCP Embedding Bridge

Every signal carries an `x_ucp` object — UCP HybridPayload per the AdCP-UCP Bridge Profile.

### Example `x_ucp` (v2.0 — real OpenAI vector)

```json
{
  "x_ucp": {
    "schema_version": "ucp-1.0",
    "embedding": {
      "model_id":        "text-embedding-3-small",
      "model_family":    "openai/text-embedding-3",
      "space_id":        "openai-te3-small-d512-v1",
      "dimensions":      512,
      "encoding":        "float32",
      "normalization":   "l2",
      "distance_metric": "cosine",
      "phase":           "v1",
      "vector_endpoint": "/signals/sig_drama_viewers/embedding"
    },
    "legacy_fallback": {
      "signal_agent_segment_id": "sig_drama_viewers",
      "segment_ids": ["105"],
      "taxonomy_version": "iab_audience_1.1"
    },
    "privacy": {
      "privacy_compliance_mechanisms": ["GPP", "MSPA"],
      "permitted_uses": ["audience_matching", "frequency_capping"],
      "ttl_seconds": 63072000,
      "gpp_applicable": true,
      "tcf_applicable": false
    },
    "signal_type": "identity",
    "signal_strength": "low"
  }
}
```

### Embedding engine phases

| Phase | `space_id` | Model | Notes |
|---|---|---|---|
| `v1` (current) | `openai-te3-small-d512-v1` | `text-embedding-3-small` 512d | Real semantic vectors. Active when `EMBEDDING_ENGINE=llm`. |
| `pseudo-v1` (fallback) | `adcp-bridge-space-v1.0` | DJB2 hash | Dynamic segments or missing OPENAI_API_KEY. Not semantically valid. |
| Phase 2b | `ucp-space-v1.0` | IAB reference model (TBD) | Procrustes/SVD projector at `/ucp/projector`. Status: simulated. |

### GET /signals/:id/embedding

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/sig_drama_viewers/embedding \
  -H "Authorization: Bearer $DEMO_API_KEY"
```

---

## Natural Language Audience Query (v2.1 — Hybrid Resolver)

```
POST /signals/query
Authorization: Bearer $DEMO_API_KEY
Content-Type: application/json

{
  "query": "soccer moms 35+ in Nashville who don't drink coffee but watch Desperate Housewives in the afternoon",
  "limit": 10
}
```

**Pipeline:**  
Claude API → `AudienceQueryAST` → `QueryResolver` (Pass 1: exact_rule → Pass 2: embedding_similarity → Pass 3: lexical_fallback) → `CompositeScorer` (AND/OR/NOT set arithmetic) → `CompositeAudienceResult`

**Match methods (v2.1):**
- `exact_rule` — dimension+value directly maps to catalog rule (score: 0.95)
- `embedding_similarity` — OpenAI cosine similarity ≥ 0.45 (semantically valid with real vectors)
- `lexical_fallback` — Jaccard token overlap ≥ 0.15 (structural fallback, used when no embedding available)
- `title_genre_inference` — content title → TITLE_GENRE_MAP → genre signal (score: ~0.855)
- `archetype_expansion` — weighted constituent dimension aggregation

**Confidence tiers:** `high` / `medium` / `low` / `narrow`

**Production-verified examples:**

| Query | confidence | tier |
|---|---|---|
| "affluent families 35-44 who stream heavily" | 0.8075 | `medium` |
| "streaming heavy watchers cord cutters" | 0.5415 | `low` |
| "soccer moms 35+ Nashville no coffee Desperate H." | 0.307 | `narrow` |

**Spec:** Implements UCP v0.2-draft Appendix D (NLAQ).

---

## Concept Registry

```
GET /ucp/concepts/SOCCER_MOM_US
GET /ucp/concepts?q=afternoon+drama
GET /ucp/concepts?category=archetype
POST /ucp/concepts/seed    (auth required)
```

19 concepts, 7 categories, 5-vendor cross-taxonomy member_nodes (IAB, LiveRamp, TradeDesk, Experian, Mastercard). **Spec:** UCP v0.2-draft §4 (Concept-Level VAC).

---

## Architecture

```
Cloudflare Worker (src/index.ts)
  │
  ├── /mcp                         MCP Streamable HTTP (JSON-RPC 2.0)
  │     src/mcp/server.ts          — 8-tool handler + alias resolution
  │     src/mcp/tools.ts           — canonical AdCP spec + extensions
  │
  ├── /capabilities                AdCP capabilities + UCP capability block
  ├── /signals/search              Signal discovery + relevance ranking + brief proposals
  ├── /signals/query               Hybrid NL audience query (v2.1)
  ├── /signals/:id/embedding       UCP VAC-compliant float32 vector (KV-cached)
  ├── /signals/activate            Signal activation (REST)
  ├── /ucp/gts                     Golden Test Set validation (v3.0-rc, public)
  ├── /ucp/projector               Procrustes/SVD alignment matrix (v3.0-rc, auth required)
  ├── /ucp/simulate-handshake      Phase 1 negotiation demo (v3.0-rc, public)
  ├── /ucp/concepts                Concept-level VAC registry (v2.0)
  ├── /operations/:id              Task status polling (REST)
  └── /seed                        Force re-seed (auth-gated)

Domain Layer (src/domain/)
  signalService.ts        — search, relevance ranking, brief parsing, catalog adapter
  activationService.ts    — async activate, lazy state machine, webhook
  capabilityService.ts    — AdCP v3 capabilities envelope (KV-cached 1hr). `protocols` filter. UCP under `ext.ucp`.
  ruleEngine.ts           — deterministic segment generation
  signalModel.ts          — base seeded + derived catalog (33 signals)
  enrichedSignalModel.ts  — Census ACS + Nielsen DMA + cross-taxonomy (16 signals)
  seedPipeline.ts         — D1 ingestion pipeline
  queryParser.ts          — NL → AudienceQueryAST via Claude API (v2.0; Rule 7 in v2.1)
  queryResolver.ts        — Hybrid Pass 1→2→3 resolver with SemanticResolver (v2.1)
  semanticResolver.ts     — Embedding-based Pass 2: SemanticResolver class (v2.1)
  compositeScorer.ts      — AND/OR/NOT set arithmetic + audience estimation
  nlQueryHandler.ts       — Route handler + engine injection + shape adapter
  embeddingStore.ts       — 26 real OpenAI text-embedding-3-small vectors (v2.0)
  conceptRegistry.ts      — 19-concept VAC registry with cross-taxonomy maps (v2.0)
  conceptHandler.ts       — /ucp/concepts routes + MCP tool handlers (v2.0)

Route Handlers (src/routes/)
  gts.ts                  — GET /ucp/gts (v3.0-rc)
  handshake.ts            — POST /ucp/simulate-handshake (v3.0-rc)
  getEmbedding.ts         — GET /signals/:id/embedding
  searchSignals.ts        — POST /signals/search
  activateSignal.ts       — POST /signals/activate
  getOperation.ts         — GET /operations/:id
  capabilities.ts         — GET /capabilities

Mappers
  signalMapper.ts         — CanonicalSignal → AdCP response shape
                            buildDtsLabel()       → x_dts (DTS v1.2)
                            toUcpHybridPayload()  → x_ucp (UCP bridge)

UCP Layer (src/ucp/)
  vacDeclaration.ts       — VAC constants + UCP_CAPABILITY block (v3.0-rc: GTS + projector fields)
  embeddingEngine.ts      — PseudoEmbeddingEngine + LlmEmbeddingEngine
                            embedText() added in v2.1 for query leaf embedding
                            createEmbeddingEngine() factory (env-config driven)
  ucpMapper.ts            — assembles UCP HybridPayload
  privacyBridge.ts        — DTS privacy fields → UCP privacy object
  legacyFallback.ts       — signal_agent_segment_id + taxonomy → legacy_fallback

Storage (Cloudflare D1 + KV)
  signalRepo.ts           — signal CRUD + search
  activationRepo.ts       — activation jobs + webhook state
  KV: capabilities cache (1hr), embedding vector cache (24hr), concept registry (24hr)
```

---

## Signal Catalog (49+ signals)

**Base — 33 signals:** 25 seeded (age, income, education, household, genre, purchase intent, geo) + 6 derived composites + conformance fixture.

**Enriched — 16 signals:**
- Census ACS-Derived (5): DTS `Public Record: Census` + `Derived` + `Annually`
- Nielsen DMA-Derived (6): DTS `Geo Location` + `Observed/Known` + `Annually`. `geocode_list: "USA|DMA-{code}"`
- Cross-Taxonomy Bridge (5): IAB AT 1.1 × CT 3.0. DTS `Web Usage` + `App Behavior`

**Dynamic:** Unlimited via `signal_spec` brief. Deterministic IDs (`sig_dyn_{slug}_{djb2hash}`).

---

## Parameter Reference

### `get_signals`

| Parameter | Required | Notes |
|---|---|---|
| `signal_spec` | Yes* | Natural language brief. `brief` alias accepted. |
| `deliver_to` | Yes | `{ deployments: [...], countries: ["US"] }` |
| `max_results` | No | Default 20, max 100. `limit` alias accepted. |
| `filters` | No | `{ category_type, generation_mode, taxonomy_id, query }` |

### `query_signals_nl`

| Parameter | Required | Notes |
|---|---|---|
| `query` | Yes | Free-form audience description. Max 2000 chars. |
| `limit` | No | Max matched signals returned (1–50, default 10). |

### `get_similar_signals`

| Parameter | Required | Notes |
|---|---|---|
| `signal_agent_segment_id` | Yes | Reference signal. |
| `deliver_to` | Yes | `{ deployments, countries }` |
| `top_k` | No | Default 5, max 20. |
| `min_similarity` | No | Cosine threshold 0–1. Default 0.7. |

### `activate_signal`

| Parameter | Required | Notes |
|---|---|---|
| `signal_agent_segment_id` | Yes | Also accepts `signal_id`. |
| `deliver_to` | Yes | `{ deployments, countries }` |
| `webhook_url` | No | POST callback on completion. Signed with HMAC-SHA256 when `WEBHOOK_SIGNING_SECRET` is provisioned — see [Webhook signatures](#webhook-signatures). |

### `get_concept` / `search_concepts`

| Parameter | Required | Notes |
|---|---|---|
| `concept_id` | Yes (get) | e.g. `SOCCER_MOM_US` |
| `q` | Yes (search) | Free text. e.g. `"afternoon drama viewer"` |
| `category` | No | `demographic` / `interest` / `behavioral` / `geo` / `archetype` / `content` / `purchase_intent` |
| `limit` | No | 1–50, default 10 |

### `/ucp/simulate-handshake`

| Parameter | Required | Notes |
|---|---|---|
| `buyer_space_ids` | No | Array of space IDs the buyer supports. e.g. `["openai-te3-small-d512-v1"]` |
| `buyer_ucp_version` | No | e.g. `"ucp-v1"`. Mismatch forces legacy_fallback. |
| `buyer_agent_id` | No | Optional identifier for the buyer agent. |

---

## Webhook signatures

When `WEBHOOK_SIGNING_SECRET` is set as a Worker secret, outbound activation webhooks carry an `X-AdCP-Signature` header the receiver can verify.

**Header format**

    X-AdCP-Signature: t=<unix-seconds>,v1=<hex-sha256>

**Signed string**

    "<t>.<exact-request-body>"

**Algorithm** — HMAC-SHA256 over UTF-8 bytes, hex-encoded.

**Receiver pseudocode** (Node):

```js
import crypto from "crypto";

function verify(secret, body, header) {
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  const t = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - t) > 300) return false; // 5 min window
  const expected = crypto.createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
```

Receivers should re-sign the **raw request body** (not a re-serialized JSON object) and reject if the timestamp is more than 5 minutes off wall-clock. The `v1=` prefix is intentional — future versions (e.g. `v2=<ed25519...>`) can be added without breaking receivers pinned to v1.

Unset secret ⇒ deliveries go out unsigned. Enabling it is a one-way decision in the sense that receivers who verify will start rejecting unsigned replays against a compromised URL.

## Running Locally

```bash
npm install
wrangler login
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev

# Seed concept registry
curl -X POST http://localhost:8787/ucp/concepts/seed \
  -H "Authorization: Bearer $DEMO_API_KEY"
```

## Deploying

```bash
npm run deploy

# Required secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
# The demo API key that gates /signals/*, /mcp tools/call, and the
# LinkedIn OAuth admin routes. Stored as a secret — NOT a checked-in
# wrangler.toml [vars] entry — because [vars] are baked into the public
# Worker bundle and retrievable by anyone with the Worker URL.
wrangler secret put DEMO_API_KEY

# Optional: enable HMAC-SHA256 signatures on outbound activation webhooks.
# Without it, deliveries go out unsigned. See "Webhook signatures" above.
wrangler secret put WEBHOOK_SIGNING_SECRET

# Optional: AES-GCM encrypt LinkedIn OAuth tokens at rest in KV.
# IMPORTANT: must be a HIGH-ENTROPY RANDOM SECRET, at least 32 chars.
# The Worker derives the AES key via SHA-256 — a short or human-chosen
# passphrase would be trivially brute-forceable against a KV dump.
# Generate with:
#   openssl rand -base64 24
# (That's 32 chars of base64 carrying ~192 bits of entropy.) The Worker
# throws WeakPassphraseError on any value under 32 chars.
# Unset ⇒ tokens stored plaintext (legacy, backwards-compatible).
wrangler secret put TOKEN_ENCRYPTION_KEY

# Required wrangler.toml var for real embeddings
# [vars]
# EMBEDDING_ENGINE = "llm"

# Seed concept registry after deploy
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts/seed \
  -H "Authorization: Bearer $DEMO_API_KEY"
```

### Rollback note — capability cache key

`/capabilities` responses are cached in KV under a versioned key
(`adcp_capabilities_v10` at the time of writing, see
`src/domain/capabilityService.ts`). The key is bumped on every
capability shape change so a deploy serves the new shape immediately
without a manual cache flush.

Rolling back **across** a cache-key bump (e.g. reverting from v10 to
v9 shape) is NOT free: KV entries at the old version key may still
be in the cache for up to `CACHE_TTL_SECONDS` (1 hour) and will be
served to callers that hit the old code path. Either:

- wait out the TTL before validating the rollback, or
- flush the namespace explicitly:

  ```bash
  wrangler kv key delete --binding=SIGNALS_CACHE adcp_capabilities_v10
  ```

(`adcp_capabilities_vN` — substitute the key the rolled-forward code
wrote.) A rollback to a shape that removes a field that callers
started depending on is the failure mode; everyone else is fine with
staleness under 1 hour.

### Upgrading `@adcp/client`

`@adcp/client` is pinned with a caret range (current: `^5.21.1`).
Compliance-runner behavior can drift under us on `npm install`, so
the discipline is to re-run compliance whenever the lockfile shifts.
Before bumping the floor:

1. Read the upstream release notes:
   `https://github.com/adcontextprotocol/adcp-client/releases`.
2. Re-run `npm run compliance` before merging the bump — any storyboard
   regression on a version bump is usually new spec / new probe
   behavior, not our code. Three historical examples:
   - 5.2.0 → 5.6.0 (adcp#2535): the `validateErrorCode` extractor
     tightened to read `data.errors[0].code` only when
     `taskResult.success === false`. That requires the agent's MCP
     tool responses to set `isError: true` when returning error
     envelopes — which `callCreateMediaBuy` already does. An agent
     returning errors[] with the default `isError: false` would
     silently regress on this bump.
   - 5.6.0 → 5.13.0: the `comply()` API was renamed to
     `testAllScenarios()` (with `formatSuiteResults*` formatters)
     and the suite restructured from track-based (core/signals/
     error_handling) to 24 tool-gated scenarios. Any harness script
     using the old import shape breaks silently with
     `SyntaxError: Named export 'comply' not found`.
   - 5.13.0 → 5.21.1: scenario count expanded 24 → 48 (governance,
     brand-rights, SI, creative-lifecycle, error-codes split into
     codes/structure/transport). The signals_flow scenario also
     fixed two long-standing storyboard bugs: it used to send
     `signal_id` (object) and `destination` (singular) to
     `activate_signal`; 5.21 sends `signal_agent_segment_id`
     (string) and `destinations` (array) per 3.0 GA. Agents pinned
     on 5.13 will see signals_flow 3/5 from those bugs alone.
   - Any bump that adds a new storyboard track (e.g. 5.2.0 added
     security_baseline + signals_baseline) will surface new probes
     as either advisory items or real failures.

## Regenerating Embedding Vectors

```bash
# 1. Open scripts/embed-signals.html in browser, paste OpenAI key, click Embed All
# 2. Copy JSON output → scripts/embeddings.json (wrap in {} if needed)
# 3. node scripts/generate-embedding-store.js embeddings.json > src/domain/embeddingStore.ts
# 4. wrangler deploy
```

---

## Tests

```bash
npm test                                                # unit (no API key)
ANTHROPIC_API_KEY=sk-ant-... npm run test:integration  # integration
bash test-nlaq-live.sh                                 # live smoke tests
npm run test:live                                       # full live API suite (35 checks against the deployed Worker)
# Override target/key for staging:
BASE=https://staging.example.workers.dev API_KEY=xxx npm run test:live
```

57 unit tests + NLAQ test suite covering: ID utilities, estimation, taxonomy loader, rule engine, signal catalog, DTS v1.2, MCP tool definitions (8 tools), NL query AST, three-pass resolver, archetype expansion, title inference, unresolved handling, cosine similarity, mixed-space detection.

---

## Spec Contributions

1. **`x_dts` extension field** — PR to `adcontextprotocol/adcp`: add `x_dts` to `static/schemas/signals/signal.json`
2. **`x_ucp` extension field** — PR to `adcontextprotocol/adcp`: add `x_ucp` alongside `x_dts`
3. **AdCP-UCP Bridge Profile** — Appendix to UCP v0.2: normative DTS→UCP field mappings, `legacy_fallback.signal_agent_segment_id` pattern, taxonomy node embedding endpoint spec
4. **NLAQ (Natural Language Audience Query)** — UCP v0.2 Appendix D: `AudienceQueryAST`, `POST /signals/query`, hybrid three-pass resolver, MIN_EMBEDDING_SCORE threshold, Concept-Level VAC, temporal behavioral signal definition
5. **GTS (Golden Test Set)** — UCP v0.2 §5.2: 15-pair identity/related/orthogonal validation spec, `adcp-gts-v1.0` format, empirically-calibrated per-pair thresholds for domain-specific embedding spaces
6. **Projector** — UCP v0.2 §5.2 Phase 2b: Procrustes/SVD algorithm spec, `from_space`/`to_space`/`signature` response shape, simulated bootstrap approach pending IAB reference model
7. **Handshake Simulator** — Phase 1 negotiation protocol: 3-outcome flow (direct_match / projector_required / legacy_fallback), `negotiation_trace` transparency field

Full spec draft: `src/domain/ucp-v0.2-nlaq-spec.md`

---

## License

MIT — Reference implementation for AdCP protocol development, IAB DTS v1.2 integration, and UCP embedding bridge.