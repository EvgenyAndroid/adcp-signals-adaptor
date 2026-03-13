# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol with IAB Data Transparency Standard v1.2 labeling, a UCP (User Context Protocol) embedding bridge, real OpenAI embedding vectors, a concept-level cross-taxonomy registry, natural language audience query, and a complete three-phase Vector Alignment Handshake — the first reference implementation combining the AdCP-UCP Bridge Profile with all UCP v0.2-draft extensions including GTS, Projector, and Handshake Simulator.

**Live:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`  
**MCP:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`  
**GitHub:** `https://github.com/EvgenyAndroid/adcp-signals-adaptor`

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-01-15 | Initial AdCP 2.6 implementation — 4 core MCP tools, D1 signal catalog, async activation |
| v1.1 | 2026-01-28 | IAB DTS v1.2 labeling — `x_dts` on every signal, all field types, onboarder section |
| v2.0 | 2026-02-15 | UCP embedding bridge — `x_ucp` on every signal, real OpenAI vectors, concept registry (19 concepts, 5 vendors), 3 new MCP tools (`query_signals_nl`, `get_concept`, `search_concepts`) |
| v2.1 | 2026-03-08 | Hybrid NL resolver — true three-pass pipeline (exact_rule → embedding_similarity → lexical_fallback), MIN_EMBEDDING_SCORE=0.45, cord_cutter archetype, SemanticResolver class, `_embedding_mode` transparency field |
| v3.0-rc | 2026-03-12 | Phase 2b + Phase 3 — GTS endpoint (15 pairs), Projector (Procrustes/SVD, simulated), Handshake Simulator (3-outcome negotiation), updated MCP initialize serverInfo |

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6 — 8 MCP tools:

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions: [2, 3]` + full UCP capability block incl. GTS + projector |
| `get_signals` | ✅ | `signal_spec` + `deliver_to` (required) + relevance ranking + `x_dts` + `x_ucp` on every signal |
| `activate_signal` | ✅ | `deliver_to` required. Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Aliases: `get_task_status`, `get_signal_status`. `destinations` field. |
| `get_similar_signals` | ✅ | UCP vector cosine similarity search |
| `query_signals_nl` | ✅ | Hybrid NL audience query — exact_rule → embedding_similarity → lexical_fallback. v2.1 |
| `get_concept` | ✅ | Concept registry exact lookup by concept_id |
| `search_concepts` | ✅ | Semantic search over concept registry |

Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Standards Coverage

| Standard | Coverage |
|---|---|
| AdCP Signals Activation Protocol v2.6 | Full — all 4 core tools + `get_similar_signals` + NL query + concept registry extensions |
| IAB Data Transparency Standard v1.2 | Full — `x_dts` on every signal, all field types, onboarder section |
| UCP (User Context Protocol) v0.1/v0.2-draft | `x_ucp` on every signal, real VAC embeddings, concept registry, NL query, GTS, Projector |

---

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

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/projector \
  -H "Authorization: Bearer demo-key-adcp-signals-v1" \
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
    "provider_email": "evgeny@samba.tv",
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
  -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

---

## Natural Language Audience Query (v2.1 — Hybrid Resolver)

```
POST /signals/query
Authorization: Bearer demo-key-adcp-signals-v1
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

19 concepts, 7 categories, 5-vendor cross-taxonomy member_nodes (IAB, LiveRamp, TradeDesk, Experian, Samba). **Spec:** UCP v0.2-draft §4 (Concept-Level VAC).

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
  capabilityService.ts    — capabilities + UCP block (KV-cached 1hr)
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
| `webhook_url` | No | POST callback on completion. |

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

## Running Locally

```bash
npm install
wrangler login
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev

# Seed concept registry
curl -X POST http://localhost:8787/ucp/concepts/seed \
  -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

## Deploying

```bash
npm run deploy

# Required secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY

# Required wrangler.toml var for real embeddings
# [vars]
# EMBEDDING_ENGINE = "llm"

# Seed concept registry after deploy
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts/seed \
  -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

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
Samba TV is a founding member of AgenticAdvertising.org (AdCP) and IAB Tech Lab UCP working group.