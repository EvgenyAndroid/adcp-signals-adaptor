# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol with IAB Data Transparency Standard v1.2 labeling, a UCP (User Context Protocol) embedding bridge, real OpenAI embedding vectors, a concept-level cross-taxonomy registry, and natural language audience query — the first reference implementation combining the AdCP-UCP Bridge Profile with all four UCP v5.2-draft extensions.

**Live:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`  
**MCP:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`  
**GitHub:** `https://github.com/EvgenyAndroid/adcp-signals-adaptor`

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6 — 8 MCP tools:

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions: [2, 3]` + `ucp` capability block |
| `get_signals` | ✅ | `signal_spec` + `deliver_to` (required) + relevance ranking + `x_dts` + `x_ucp` on every signal |
| `activate_signal` | ✅ | `deliver_to` required. Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Aliases: `get_task_status`, `get_signal_status`. `destinations` field. |
| `get_similar_signals` | ✅ | UCP vector cosine similarity search. New in v1.1. |
| `query_signals_nl` | ✅ | NL audience query → AudienceQueryAST → scored signals. New in v2.0. |
| `get_concept` | ✅ | Concept registry lookup by concept_id. New in v2.0. |
| `search_concepts` | ✅ | Semantic search over concept registry. New in v2.0. |

Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Standards Coverage

Three IAB Tech Lab standards bridged in a single implementation:

| Standard | Coverage |
|---|---|
| AdCP Signals Activation Protocol v2.6 | Full — all 4 core tools + `get_similar_signals` + NL query + concept registry extensions |
| IAB Data Transparency Standard v1.2 | Full — `x_dts` on every signal, all field types, onboarder section |
| UCP (User Context Protocol) v5.1/v5.2-draft | `x_ucp` on every signal, real VAC embeddings, concept registry, NL query spec |

---

## What's New in v2.0

- **Real embedding vectors** — all catalog signals carry genuine OpenAI `text-embedding-3-small` (512-dim) vectors. `space_id: openai-te3-small-d512-v1` is semantically valid. VAC handshake is no longer pseudo.
- **`POST /signals/query`** — natural language audience query. Decomposes via Claude into a boolean AST, resolves against the catalog, returns ranked matches with `exclude_signals[]` for NOT nodes.
- **`GET /ucp/concepts`** — concept-level VAC registry. 19 canonical advertising concepts with cross-taxonomy member node mappings to IAB, LiveRamp, TradeDesk, Experian, and Samba.
- **3 new MCP tools** — `query_signals_nl`, `get_concept`, `search_concepts` — callable natively from Claude.ai.

---

## Key Design Decisions

**`signal_spec` not `brief`** — canonical AdCP spec parameter name. `brief` accepted as alias.

**`deliver_to` required** — spec-compliant object with `deployments[]` and `countries[]` on both `get_signals` and `activate_signal`.

**Relevance ranking** — when `signal_spec` is present, fetches up to 200 signals, scores by keyword overlap (name +4, description +2, category hint +3, derived/dynamic bonus), sorts before applying `max_results`.

**Deterministic dynamic IDs** — `sig_dyn_{slug}_{djb2hash}`. Same rules → same ID → upsert idempotency. No duplicates.

**`destinations` not `deployments`** — spec-aligned response field name in both `activate_signal` and `get_operation_status`.

**`x_dts` + `x_ucp`** — every signal carries both extension fields. Non-breaking to conformance tests via AdCP `x_` extension mechanism.

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

### Example `x_ucp` (same signal — pseudo-v1 / pre-v2.0)

```json
{
  "x_ucp": {
    "schema_version": "ucp-1.0",
    "embedding": {
      "model_id": "adcp-ucp-bridge-pseudo-v1.0",
      "space_id": "adcp-bridge-space-v1.0",
      "dimensions": 512,
      "encoding": "float32",
      "normalization": "l2",
      "distance_metric": "cosine",
      "phase": "pseudo-v1",
      "vector_endpoint": "/signals/sig_acs_graduate_high_income/embedding"
    },
    "legacy_fallback": {
      "signal_agent_segment_id": "sig_acs_graduate_high_income",
      "segment_ids": ["11"],
      "taxonomy_version": "iab_audience_1.1"
    },
    "privacy": {
      "privacy_compliance_mechanisms": ["GPP", "MSPA"],
      "permitted_uses": ["audience_matching", "frequency_capping", "measurement"],
      "ttl_seconds": 31536000,
      "gpp_applicable": true,
      "tcf_applicable": false
    },
    "signal_type": "identity",
    "signal_strength": "medium",
    "classification_rationale": "signal_type=identity derived from data_sources=[Public Record: Census]. signal_strength=medium derived from audience_inclusion_methodology=\"Derived\"."
  }
}
```

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
    "signal_strength": "low",
    "classification_rationale": "signal_type=identity derived from data_sources=[Online Survey]. signal_strength=low derived from audience_inclusion_methodology=\"Modeled\"."
  }
}
```

Both `x_dts` and `x_ucp` travel on every signal. Non-breaking `x_` extensions — conformance tests ignore them, UCP-aware consumers use them.

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

Every signal also carries an `x_ucp` object — UCP HybridPayload per the AdCP-UCP Bridge Profile. This is the first working reference implementation of the bridge between AdCP and UCP.

### What `x_ucp` contains

```json
{
  "x_ucp": {
    "schema_version": "ucp-1.0",
    "embedding": {
      "model_id": "adcp-ucp-bridge-pseudo-v1.0",
      "space_id": "adcp-bridge-space-v1.0",
      "dimensions": 512,
      "encoding": "float32",
      "normalization": "l2",
      "distance_metric": "cosine",
      "phase": "pseudo-v1",
      "vector_endpoint": "/signals/sig_acs_graduate_high_income/embedding"
    },
    "legacy_fallback": {
      "signal_agent_segment_id": "sig_acs_graduate_high_income",
      "segment_ids": ["11"],
      "taxonomy_version": "iab_audience_1.1"
    },
    "privacy": {
      "privacy_compliance_mechanisms": ["GPP", "MSPA"],
      "permitted_uses": ["audience_matching", "frequency_capping", "measurement"],
      "ttl_seconds": 31536000,
      "gpp_applicable": true,
      "tcf_applicable": false
    },
    "signal_type": "identity",
    "signal_strength": "medium",
    "classification_rationale": "signal_type=identity derived from data_sources=[Public Record: Census]. signal_strength=medium derived from audience_inclusion_methodology=\"Derived\"."
  }
}
```

### DTS → UCP normative mappings (AdCP-UCP Bridge Profile)

| DTS field | UCP field | Mapping |
|---|---|---|
| `data_sources: ["TV OTT or STB Device"]` | `signal_type` | `"reinforcement"` |
| `data_sources: ["Web Usage", "App Behavior"]` | `signal_type` | `"contextual"` |
| `data_sources: ["Public Record: Census"]` | `signal_type` | `"identity"` |
| `audience_inclusion_methodology: "Observed/Known"` | `signal_strength` | `"high"` |
| `audience_inclusion_methodology: "Derived"` | `signal_strength` | `"medium"` |
| `audience_inclusion_methodology: "Modeled"` | `signal_strength` | `"low"` |
| `taxonomy_id_list` | `legacy_fallback.segment_ids` | direct |
| `privacy_compliance_mechanisms` | `privacy.privacy_compliance_mechanisms` | direct |
| `audience_refresh` | `privacy.ttl_seconds` | cadence → seconds |

### Embedding engine phases

| Phase | `space_id` | Model | Notes |
|---|---|---|---|
| `pseudo-v1` | `adcp-bridge-space-v1.0` | deterministic taxonomy hash | No external deps. Pre-v2.0 default. |
| `v1` (current) | `openai-te3-small-d512-v1` | `text-embedding-3-small` 512d | Real semantic vectors. Hardcoded at build time. Ships in v2.0. |
| `llm-v1` | `openai-te3-small-d512-v1` | `text-embedding-3-small` (512d) | Live API call per request. Activate via `EMBEDDING_ENGINE=llm`. |
| `llm-v1` | TBD | Claude embeddings | Scaffolded, activate when Anthropic API ships. |
| Phase 2b | `ucp-space-v1.0` | IAB reference model (TBD) | Procrustes/SVD projector at `/ucp/projector`. |

To upgrade to live LLM embeddings (no code change):
```bash
# wrangler.toml: EMBEDDING_ENGINE = "llm"
wrangler secret put OPENAI_API_KEY
npm run deploy
```

### GET /signals/:id/embedding

Returns the full VAC-compliant float32 vector. KV-cached 24hr.

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/sig_acs_graduate_high_income/embedding \
  -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

### get_similar_signals (MCP tool)

Vector cosine similarity search — finds semantically related signals:

```bash
curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_similar_signals\",\"arguments\":{\"signal_agent_segment_id\":\"sig_acs_graduate_high_income\",\"top_k\":5,\"deliver_to\":{\"deployments\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}],\"countries\":[\"US\"]}}}}"
```

---

## Natural Language Audience Query

```
POST /signals/query
Authorization: Bearer demo-key-adcp-signals-v1
Content-Type: application/json

{
  "query": "soccer moms 35+ in Nashville who don't drink coffee but watch Desperate Housewives in the afternoon",
  "limit": 10
}
```

**Pipeline:** Claude API → `AudienceQueryAST` (AND/OR/NOT/LEAF boolean tree) → catalog resolver (exact rule match → archetype expansion → description similarity) → compositional scorer (probabilistic set arithmetic) → `CompositeAudienceResult`

**Supports:** archetypes ("soccer moms"), negation → `exclude_signals[]` for DSP suppression, geo → DMA resolution, content title → genre inference, temporal daypart, confidence tiers (`high` / `medium` / `low` / `narrow`).

**Spec:** Implements UCP v5.2-draft Appendix D (NLAQ) — first normative NL audience query definition in the AdCP/UCP ecosystem.

---

## Concept Registry

```
GET /ucp/concepts/SOCCER_MOM_US
GET /ucp/concepts?q=afternoon+drama
GET /ucp/concepts?category=archetype
POST /ucp/concepts/seed    (auth required — re-seeds KV)
```

19 concepts across 7 categories: `demographic`, `interest`, `behavioral`, `geo`, `archetype`, `content`, `purchase_intent`.

Each concept carries `constituent_dimensions` (weighted breakdown for archetype expansion in the NL query resolver) and `member_nodes` (cross-taxonomy equivalents: IAB, LiveRamp, TradeDesk, Experian, Samba).

**Spec:** Implements UCP v5.2-draft §4 (Concept-Level VAC) — cross-taxonomy alignment without bilateral crosswalk agreements.

---

## Architecture

```
Cloudflare Worker (src/index.ts)
  │
  ├── /mcp                    MCP Streamable HTTP (JSON-RPC 2.0)
  │     src/mcp/server.ts     — 8-tool handler + alias resolution
  │     src/mcp/tools.ts      — canonical AdCP spec + extensions
  │
  ├── /capabilities           AdCP capabilities + UCP capability block
  ├── /signals/search         Signal discovery + relevance ranking + brief proposals
  ├── /signals/query          NL audience query (v2.0)
  ├── /signals/:id/embedding  UCP VAC-compliant float32 vector (KV-cached)
  ├── /signals/activate       Signal activation (REST)
  ├── /ucp/concepts           Concept-level VAC registry (v2.0)
  ├── /operations/:id         Task status polling (REST)
  └── /seed                   Force re-seed (auth-gated)

Domain Layer (src/domain/)
  signalService.ts        — search, relevance ranking, brief parsing, proposals
  activationService.ts    — async activate, lazy state machine, webhook
  capabilityService.ts    — capabilities + UCP block (KV-cached 1hr)
  ruleEngine.ts           — deterministic segment generation
  signalModel.ts          — base seeded + derived catalog (33 signals)
  enrichedSignalModel.ts  — Census ACS + Nielsen DMA + cross-taxonomy (16 signals)
  seedPipeline.ts         — D1 ingestion pipeline (4-phase, idempotent)
  queryParser.ts          — NL → AudienceQueryAST via Claude API (v2.0)
  queryResolver.ts        — AST leaves → catalog signal matches (v2.0)
  compositeScorer.ts      — AND/OR/NOT set arithmetic + audience estimation (v2.0)
  nlQueryHandler.ts       — /signals/query route + MCP tool (v2.0)
  embeddingStore.ts       — real OpenAI text-embedding-3-small vectors 512d (v2.0)
  conceptRegistry.ts      — 19-concept VAC registry with cross-taxonomy maps (v2.0)
  conceptHandler.ts       — /ucp/concepts routes + MCP tool handlers (v2.0)

Mappers
  signalMapper.ts         — CanonicalSignal → AdCP response shape
                            buildDtsLabel()       → x_dts (DTS v1.2)
                            toUcpHybridPayload()  → x_ucp (UCP bridge)

UCP Layer (src/ucp/)
  vacDeclaration.ts       — VAC constants: model_id, space_id, dimension slots
  embeddingEngine.ts      — Phase 1: PseudoEmbeddingEngine (512d deterministic)
                            Phase 2: LlmEmbeddingAdapter (OpenAI / Anthropic)
                            createEmbeddingEngine() factory (env-config driven)
  ucpMapper.ts            — assembles UCP HybridPayload
  privacyBridge.ts        — DTS privacy fields → UCP privacy object
  legacyFallback.ts       — signal_agent_segment_id + taxonomy → legacy_fallback

Storage (Cloudflare D1 + KV)
  signalRepo.ts           — signal CRUD + search
  activationRepo.ts       — activation jobs + webhook state
  KV: capabilities cache, embedding vector cache (24hr TTL), concept registry (24hr TTL)
```

---

## Signal Catalog (49 signals)

**Base — 33 signals:** 25 seeded (age, income, education, household, genre, purchase intent, geo) + 6 derived composites + conformance fixture.

**Enriched — 16 signals:**
- Census ACS-Derived (5): DTS `Public Record: Census` + `Derived` + `Annually`
- Nielsen DMA-Derived (6): DTS `Geo Location` + `Observed/Known` + `Annually`. `geocode_list: "USA|DMA-{code}"`
- Cross-Taxonomy Bridge (5): IAB AT 1.1 × CT 3.0. DTS `Web Usage` + `App Behavior`

**Dynamic:** Unlimited via `signal_spec` brief. Deterministic IDs — same brief = same segment.

---

## Key Protocol Flows

### `get_signals` with `x_dts` + `x_ucp`

Every signal in the response carries both extension objects:

```
get_signals(signal_spec: "graduate educated high income", deliver_to: {...})
→ signals[0]:
    x_dts.data_sources: ["Public Record: Census"]
    x_dts.audience_inclusion_methodology: "Derived"
    x_ucp.signal_type: "identity"
    x_ucp.signal_strength: "medium"
    x_ucp.embedding.space_id: "openai-te3-small-d512-v1"
    x_ucp.embedding.phase: "v1"
    x_ucp.embedding.vector_endpoint: "/signals/sig_acs_graduate_high_income/embedding"
    x_ucp.legacy_fallback.segment_ids: ["11"]
```

### Async Activation

```
activate_signal(signal_agent_segment_id, deliver_to)
  → { task_id, status: "pending", destinations: [{is_live: false}] }

get_task_status(task_id)
  → { status: "completed", destinations: [{is_live: true, activation_key: {...}}] }
```

### Similarity Search

```
get_similar_signals(signal_agent_segment_id: "sig_acs_graduate_high_income", top_k: 5)
  → [
      { name: "High Income Households", cosine_similarity: 0.923 },
      { name: "Affluent College Educated Households (ACS)", cosine_similarity: 0.891 },
      ...
    ]
```

### NL Query

```
POST /signals/query  {"query": "affluent families 35-44 who stream heavily", "limit": 10}
→ {
    confidence_tier: "medium",
    matched_signals: [
      { name: "Adults 35-44",           match_score: 0.95,  match_method: "exact_rule" },
      { name: "Families with Children", match_score: 0.90,  match_method: "exact_rule" },
      { name: "Streaming Enthusiasts",  match_score: 0.855, match_method: "exact_rule" },
      { name: "High Income Households", match_score: 0.807, match_method: "description_similarity" }
    ],
    exclude_signals: [],
    warnings: []
  }
```

---

## Parameter Reference

### `get_signals`

| Parameter | Required | Type | Notes |
|---|---|---|---|
| `signal_spec` | Yes* | string | Natural language brief. `brief` alias accepted. |
| `deliver_to` | Yes | object | `{ deployments: [...], countries: ["US"] }` |
| `max_results` | No | number | Default 20, max 100. `limit` alias accepted. |
| `filters` | No | object | `{ category_type, generation_mode, taxonomy_id, query }` |
| `pagination` | No | object | `{ offset }` |

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
| `pricing_option_id` | No | From signal's `pricing_options`. |

### `get_operation_status`

| Parameter | Required | Notes |
|---|---|---|
| `task_id` | Yes | Tool name aliases: `get_task_status`, `get_signal_status`. |

### `query_signals_nl`

| Parameter | Required | Notes |
|---|---|---|
| `query` | Yes | Free-form audience description. Max 2000 chars. |
| `limit` | No | Max matched signals returned (1–50, default 10). |

### `get_concept` / `search_concepts`

| Parameter | Required | Notes |
|---|---|---|
| `concept_id` | Yes (get) | e.g. `SOCCER_MOM_US`, `HIGH_INCOME_HOUSEHOLD_US` |
| `q` | Yes (search) | Free text. e.g. `"afternoon drama viewer"` |
| `category` | No | `demographic` / `interest` / `behavioral` / `geo` / `archetype` / `content` / `purchase_intent` |
| `limit` | No | 1–50, default 10 |

---

## Running Locally

```bash
npm install
wrangler login
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev
```

## Deploying

```bash
npm run deploy
```

After fresh deploy, trigger seed:
```bash
npx wrangler d1 execute adcp-signals-db --remote --command "DELETE FROM signals"
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/health
```

Seed concept registry to KV:
```bash
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts/seed \
  -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

## Upgrading to LLM Embeddings

```bash
# 1. Set in wrangler.toml:
#    EMBEDDING_ENGINE = "llm"
# 2. Add secret:
wrangler secret put OPENAI_API_KEY
# 3. Deploy
npm run deploy
```

## Regenerating Hardcoded Embedding Vectors (v2.0)

```bash
# 1. Open scripts/embed-signals.html in browser, paste OpenAI key, click Embed
# 2. Copy JSON output → scripts/embeddings.json (wrap in { } if needed)
# 3. Generate TypeScript store:
node scripts/generate-embedding-store.js scripts/embeddings.json > src/domain/embeddingStore.ts
# 4. Deploy
npm run deploy
```

---

## Tests

```bash
npm test
```

**57 tests** — ID utilities, estimation, taxonomy loader, demographic loader, rule engine, signal catalog, request validation, signal mapper, DTS v1.2 (12 tests), MCP tool definitions (8 tools), async activation, NL query AST, resolver, scorer, confidence tiers.

---

## Spec Contributions

This implementation is the reference basis for four pending IAB Tech Lab contributions:

1. **`x_dts` extension field** — PR to `adcontextprotocol/adcp`: add `x_dts` to `static/schemas/signals/signal.json`
2. **`x_ucp` extension field** — PR to `adcontextprotocol/adcp`: add `x_ucp` alongside `x_dts`
3. **AdCP-UCP Bridge Profile** — Appendix to UCP v5.2: normative mappings between DTS fields and UCP HybridPayload, `legacy_fallback.signal_agent_segment_id` pattern, taxonomy node embedding endpoint spec
4. **NLAQ (Natural Language Audience Query)** — UCP v5.2 Appendix D: `AudienceQueryAST`, `POST /signals/query`, Concept-Level VAC (`/ucp/concepts`), temporal behavioral signal definition

Full spec draft: `ucp-v5.2-nlaq-spec.md`

---

## License

MIT — Reference implementation for AdCP protocol development, IAB DTS v1.2 integration, and UCP embedding bridge.