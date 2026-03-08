# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol with IAB Data Transparency Standard v1.2 labeling and a UCP (User Context Protocol) embedding bridge — the first reference implementation of the AdCP-UCP Bridge Profile.

**Live:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`  
**MCP:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`  
**GitHub:** `https://github.com/EvgenyAndroid/adcp-signals-adaptor`

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6 — 5 MCP tools:

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions: [2, 3]` + `ucp` capability block |
| `get_signals` | ✅ | `signal_spec` + `deliver_to` (required) + relevance ranking + `x_dts` + `x_ucp` on every signal |
| `activate_signal` | ✅ | `deliver_to` required. Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Aliases: `get_task_status`, `get_signal_status`. `destinations` field. |
| `get_similar_signals` | ✅ | UCP vector cosine similarity search. New in v1.1. |

Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Standards Coverage

Three IAB Tech Lab standards bridged in a single implementation:

| Standard | Coverage |
|---|---|
| AdCP Signals Activation Protocol v2.6 | Full — all 4 core tools + `get_similar_signals` extension |
| IAB Data Transparency Standard v1.2 | Full — `x_dts` on every signal, all field types, onboarder section |
| UCP (User Context Protocol) v1.0 | Phase 1 — `x_ucp` on every signal, VAC declaration, embedding endpoint, legacy fallback |

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

| Phase | Config | Model | Notes |
|---|---|---|---|
| `pseudo-v1` | default | deterministic taxonomy hash | No external deps. Ships today. |
| `llm-v1` | `EMBEDDING_ENGINE=llm` + `OPENAI_API_KEY` | `text-embedding-3-small` (512d) | Real semantic vectors. |
| `llm-v1` | `EMBEDDING_ENGINE=llm` + `ANTHROPIC_API_KEY` | Claude embeddings | Scaffolded, activate when API ships. |

To upgrade to LLM embeddings (no code change):
```bash
# wrangler.toml: EMBEDDING_ENGINE = "llm"
wrangler secret put OPENAI_API_KEY
npm run deploy
```

### New endpoint: GET /signals/:id/embedding

Returns the full VAC-compliant float32 vector. KV-cached 24hr.

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/sig_acs_graduate_high_income/embedding
```

### New tool: get_similar_signals

Vector cosine similarity search — finds semantically related signals:

```bash
curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_similar_signals\",\"arguments\":{\"signal_agent_segment_id\":\"sig_acs_graduate_high_income\",\"top_k\":5,\"deliver_to\":{\"deployments\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}],\"countries\":[\"US\"]}}}}"
```

---

## Architecture

```
Cloudflare Worker (src/index.ts)
  │
  ├── /mcp              MCP Streamable HTTP (JSON-RPC 2.0)
  │     src/mcp/server.ts    — 5-tool handler + alias resolution
  │     src/mcp/tools.ts     — canonical AdCP spec + get_similar_signals
  │
  ├── /capabilities     AdCP capabilities + UCP capability block
  ├── /signals/search   Signal discovery + relevance ranking + brief proposals
  ├── /signals/:id/embedding  UCP VAC-compliant float32 vector (KV-cached)
  ├── /signals/activate Signal activation (REST)
  ├── /operations/:id   Task status polling (REST)
  └── /seed             Force re-seed (auth-gated)

Domain Layer (src/domain/)
  signalService.ts        — search, relevance ranking, brief parsing, proposals
  activationService.ts    — async activate, lazy state machine, webhook
  capabilityService.ts    — capabilities + UCP block (KV-cached 1hr)
  ruleEngine.ts           — deterministic segment generation
  signalModel.ts          — base seeded + derived catalog (33 signals)
  enrichedSignalModel.ts  — Census ACS + Nielsen DMA + cross-taxonomy (16 signals)
  seedPipeline.ts         — D1 ingestion pipeline (4-phase, idempotent)

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
  KV: capabilities cache, embedding vector cache (24hr TTL)
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

## Upgrading to LLM Embeddings

```bash
# 1. Set in wrangler.toml:
#    EMBEDDING_ENGINE = "llm"
# 2. Add secret:
wrangler secret put OPENAI_API_KEY
# 3. Deploy
npm run deploy
```

---

## Tests

```bash
npm test
```

**57 tests** — ID utilities, estimation, taxonomy loader, demographic loader, rule engine, signal catalog, request validation, signal mapper, DTS v1.2 (12 tests), MCP tool definitions (5 tools), async activation.

---

## Spec Contributions

This implementation is the reference basis for three pending IAB Tech Lab contributions:

1. **`x_dts` extension field** — PR to `adcontextprotocol/adcp`: add `x_dts` to `static/schemas/signals/signal.json`
2. **`x_ucp` extension field** — PR to `adcontextprotocol/adcp`: add `x_ucp` alongside `x_dts`
3. **AdCP-UCP Bridge Profile** — Appendix to UCP v5.2: normative mappings between DTS fields and UCP HybridPayload, `legacy_fallback.signal_agent_segment_id` pattern, taxonomy node embedding endpoint spec

---

## License

MIT — Reference implementation for AdCP protocol development, IAB DTS v1.2 integration, and UCP embedding bridge.