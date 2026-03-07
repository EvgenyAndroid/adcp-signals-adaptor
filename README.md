# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol: signal discovery with relevance ranking, brief-driven custom segment proposals, async activation with webhook support, task polling, and IAB Data Transparency Standard v1.2 labeling via the AdCP `x_dts` extension field.

**Live:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`  
**MCP:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`  
**GitHub:** `https://github.com/EvgenyAndroid/adcp-signals-adaptor`

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6 — 4 tools with canonical spec parameter names:

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions: [2, 3]` + `supported_protocols` envelope |
| `get_signals` | ✅ | `signal_spec` + `deliver_to` (required) + relevance ranking + DTS v1.2 on every signal |
| `activate_signal` | ✅ | `deliver_to` required. Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Also accepts `get_task_status` / `get_signal_status` aliases. `destinations` field. |

`generate_custom_signal` not implemented — proposals surface inline via `get_signals` `signal_spec` parameter per protocol spec. Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Key Design Decisions

**`signal_spec` not `brief`** — canonical AdCP spec parameter name. `brief` accepted as alias for backward compatibility.

**`deliver_to` required on `get_signals` and `activate_signal`** — spec-compliant object with `deployments[]` and `countries[]`. The `destinations` alias also accepted.

**Relevance ranking** — when `signal_spec` is present, fetches up to 200 signals from D1, scores each by keyword overlap with the brief (name match +4, description +2, category hint +3, derived/dynamic bonus), then sorts before applying `max_results`. Alphabetical fallback when no brief.

**Deterministic dynamic IDs** — `sig_dyn_{slug}_{djb2hash}`. Same rules always produce the same segment ID. Repeated brief calls upsert the same row — no duplicates accumulate.

**`destinations` not `deployments`** — response field name aligned to spec in both `activate_signal` and `get_operation_status` responses.

---

## Data Transparency Standard v1.2

Every signal returned by `get_signals` carries an `x_dts` object — a full IAB Tech Lab Data Transparency Standard v1.2 ("Privacy Update", April 2024) label. Generated automatically in `src/mappers/signalMapper.ts` via `buildDtsLabel()`. Uses the AdCP v2.5+ `x_` extension field mechanism — non-breaking to conformance tests.

### DTS by signal type

| Signal type | `data_sources` | `audience_inclusion_methodology` | `audience_refresh` | Onboarder |
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

### Spec contribution

This implementation bridges three IAB Tech Lab standards with no current formal linkage: AdCP Signals Activation Protocol, DTS v1.2, and IAB Audience Taxonomy 1.1. Intended as the reference basis for a formal `x_dts` extension proposal to the AdCP working group (`adcontextprotocol/adcp`).

---

## Architecture

```
Cloudflare Worker (src/index.ts)
  │
  ├── /mcp              MCP Streamable HTTP (JSON-RPC 2.0)
  │     src/mcp/server.ts    — 4-tool protocol handler + alias resolution
  │     src/mcp/tools.ts     — canonical AdCP spec tool definitions
  │
  ├── /capabilities     AdCP capabilities envelope
  ├── /signals/search   Signal discovery + relevance ranking + brief proposals
  ├── /signals/activate Signal activation (REST)
  ├── /operations/:id   Task status polling (REST)
  └── /seed             Force re-seed (auth-gated)

Domain Layer (src/domain/)
  signalService.ts        — search, relevance ranking, brief parsing, proposals + D1 persistence
  activationService.ts    — async activate, lazy state machine, webhook firing
  capabilityService.ts    — capabilities (KV-cached 1hr)
  ruleEngine.ts           — rule validation + deterministic segment generation
  signalModel.ts          — base seeded + derived catalog (33 signals)
  enrichedSignalModel.ts  — Census ACS + Nielsen DMA + cross-taxonomy (16 signals)
  seedPipeline.ts         — D1 ingestion pipeline (4-phase, idempotent)

Mappers
  signalMapper.ts         — CanonicalSignal → AdCP response shape
                            buildDtsLabel() → x_dts DTS v1.2 on every signal

Connectors (src/connectors/)
  iabTaxonomyLoader.ts    — IAB Audience Taxonomy 1.1 TSV parser
  censusLoader.ts         — ACS 5-yr estimates parser + MOE handling
  dmaLoader.ts            — Nielsen DMA parser + tier aggregation
  taxonomyBridgeLoader.ts — IAB Audience 1.1 × Content CT3 bridge

Storage (Cloudflare D1 + KV)
  signalRepo.ts           — signal CRUD + search
  activationRepo.ts       — activation jobs, webhook_url, webhook_fired
```

---

## Signal Catalog (49 signals)

### Base Catalog — 33 signals

**Seeded (25):** Age bands, income brackets, education, household types, entertainment genres, purchase intent, geo, urban professionals, conformance fixture `test-signal-001`.

**Derived (6):** Multi-dimensional composites — High Income Entertainment Enthusiasts, Urban Young Professionals, Affluent Families, Metro Sci-Fi Fans, College Educated Heavy Streamers, Affluent Urban Entertainment Fans.

**Dynamic:** Unlimited — generated on-demand via `signal_spec`, persisted to D1 with deterministic IDs.

### Enriched Catalog — 16 signals

**Census ACS-Derived (5)** — US Census ACS 2022 5-yr estimates. DTS: `data_sources: ["Public Record: Census"]`, `methodology: "Derived"`, `refresh: "Annually"`, onboarder section populated.

**Nielsen DMA-Derived (6)** — Nielsen 2023-24 DMA universe. DMA codes in `geocode_list` (e.g. `"USA|DMA-501"`). DTS: `data_sources: ["Geo Location"]`, `methodology: "Observed/Known"`.

**Cross-Taxonomy Bridge (5)** — IAB Audience 1.1 × Content Taxonomy 3.0. CPMs $2.80–$5.00.

---

## Key Protocol Flows

### `get_signals` with relevance ranking

```
get_signals(
  signal_spec: "high income households interested in luxury goods",
  max_results: 3,
  deliver_to: { deployments: [{type: "platform", platform: "mock_dsp"}], countries: ["US"] }
)
→ signals: [
    "Graduate Educated High Income Households (ACS)",  ← scores: "high"×4 + "income"×4 + "luxury"×2
    "High Income Households",                           ← scores: "high"×4 + "income"×4
    "High Income Entertainment Enthusiasts"             ← scores: "high"×4 + "income"×4 + derived bonus
  ]
→ proposals: [{
    signal_agent_segment_id: "sig_dyn_high_income_150k_{deterministic_hash}",
    signal_type: "custom", is_live: false, cpm: $4.00
  }]
```

### Async Activation Flow

```
activate_signal(signal_agent_segment_id, deliver_to)
  → { task_id: "op_...", status: "pending", destinations: [{is_live: false}] }

get_operation_status(task_id)  OR  get_task_status(task_id)
  → { status: "completed", destinations: [{is_live: true, activation_key: {...}}] }
```

Status lifecycle: `submitted → working → completed` (aligned with `@adcp/client` `ADCP_STATUS`).

Optional `webhook_url` — POST callback fires on first completed poll.

---

## AdCP Response Shapes

### `get_signals`

```json
{
  "message": "Found 3 signal(s) matching brief...",
  "context_id": "req_...",
  "signals": [{
    "signal_agent_segment_id": "sig_acs_graduate_high_income",
    "signal_type": "marketplace",
    "data_provider": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
    "coverage_percentage": 0.5,
    "deployments": [{ "type": "platform", "platform": "mock_dsp", "is_live": true,
      "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_acs_graduate_high_income" } }],
    "pricing_options": [{ "pricing_model": "cpm", "cpm": 2.5, "currency": "USD" }],
    "x_dts": { "dts_version": "1.2", "data_sources": ["Public Record: Census"], ... }
  }],
  "proposals": [{ "signal_type": "custom", "is_live": false, ... }]
}
```

### `activate_signal`

```json
{
  "task_id": "op_1772919012588_xpjdlzmag",
  "status": "pending",
  "signal_agent_segment_id": "sig_acs_graduate_high_income",
  "destinations": [{ "type": "platform", "platform": "mock_dsp", "is_live": false,
    "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_acs_graduate_high_income" },
    "estimated_activation_duration_minutes": 1 }]
}
```

### `get_operation_status` / `get_task_status`

```json
{
  "task_id": "op_1772919012588_xpjdlzmag",
  "status": "completed",
  "signal_agent_segment_id": "sig_acs_graduate_high_income",
  "destinations": [{ "type": "platform", "platform": "mock_dsp", "is_live": true,
    "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_acs_graduate_high_income" },
    "estimated_activation_duration_minutes": 0 }],
  "submittedAt": "2026-03-07T21:30:12.588Z",
  "completedAt": "2026-03-07T21:49:12.945Z"
}
```

### `get_adcp_capabilities`

```json
{
  "adcp": { "major_versions": [2, 3] },
  "supported_protocols": ["signals"],
  "signals": { "signal_categories": [...], "dynamic_segment_generation": true, "activation_mode": "async" }
}
```

---

## Parameter Reference

### `get_signals`

| Parameter | Required | Type | Notes |
|---|---|---|---|
| `signal_spec` | Yes* | string | Natural language brief. `brief` accepted as alias. |
| `deliver_to` | Yes | object | `{ deployments: [...], countries: ["US"] }` |
| `max_results` | No | number | Default 20, max 100. `limit` accepted as alias. |
| `filters` | No | object | `{ category_type, generation_mode, taxonomy_id, query }` |
| `pagination` | No | object | `{ offset }` |
| `signal_ids` | No | string[] | Retrieve specific signals by ID. |

*`signal_spec` or `signal_ids` required.

### `activate_signal`

| Parameter | Required | Type | Notes |
|---|---|---|---|
| `signal_agent_segment_id` | Yes | string | Also accepts `signal_id` (SDK alias). |
| `deliver_to` | Yes | object | `{ deployments: [...], countries: ["US"] }` |
| `webhook_url` | No | string | POST callback on completion. |
| `pricing_option_id` | No | string | From signal's `pricing_options` array. |

### `get_operation_status`

| Parameter | Required | Notes |
|---|---|---|
| `task_id` | Yes | Also accepts `operationId`. Tool name aliases: `get_task_status`, `get_signal_status`. |

---

## Dynamic Segment Generation (via signal_spec)

| Dimension | Example phrases |
|---|---|
| `age_band` | "18-24", "millennials", "gen z", "boomers" |
| `income_band` | "affluent", "high income", "$150k", "upper middle" |
| `education` | "college", "graduate", "MBA", "university" |
| `household_type` | "families", "parents", "kids", "single", "couple" |
| `metro_tier` | "top metros", "urban", "major city", "New York" |
| `content_genre` | "sci-fi", "action", "documentary", "comedy" |
| `streaming_affinity` | "streaming", "cord cutters", "CTV", "OTT" |

Up to 6 dimensions. Audience size: heuristic intersection against 240M US adult baseline, 50K floor.

---

## Datasets

| File | Source | DTS `data_sources` |
|---|---|---|
| `seed/iab-audience-1.1.tsv` | IAB Tech Lab | N/A (taxonomy backbone) |
| `seed/demographics-sample.csv` | Hand-curated | `["Online Survey"]` |
| `seed/interests-sample.csv` | MovieLens genre structure | `["Online Survey"]` |
| `seed/geo-sample.csv` | US Census city data | `["Public Record: Census"]` |
| `seed/census-acs-sample.csv` | US Census ACS 2022 5-yr | `["Public Record: Census"]` |
| `seed/dma-nielsen.csv` | Nielsen 2023-24 | `["Geo Location"]` |
| `seed/taxonomy-bridge.csv` | IAB Tech Lab | `["Web Usage", "App Behavior"]` |

---

## SDK Integration (@adcp/client)

`@adcp/client@^4.5.2` dev dependency — client-only, no server framework.

| What | Where | Notes |
|---|---|---|
| `createOperationId()` | `src/utils/ids.ts` | Spec-compliant op ID: `op_{timestamp}_{nanoid}` |
| `ADCP_STATUS` | `activationService.ts` | `submitted → working → completed` |
| `COMPATIBLE_ADCP_VERSIONS` | `capabilityService.ts` | `major_versions: [2, 3]` |
| `SIGNALS_TOOLS` | `mcp/tools.ts` | Core tool name reference |

**Field normalization — SDK test suite compatibility:**

| SDK sends | Accepted via |
|---|---|
| `signal_id` | Alias for `signal_agent_segment_id` |
| `destination: {platform}` | Singular object normalized to array |
| `dv360`, `trade-desk`, `meta`, `ttd` | `PLATFORM_MAP` → internal destination IDs |

---

## Running Locally

```bash
npm install
wrangler login
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/health
```

## Deploying

```bash
npm run deploy
wrangler d1 migrations apply adcp-signals-db --remote  # if schema changed
```

After a fresh deploy or schema change, trigger auto-seed:
```bash
npx wrangler d1 execute adcp-signals-db --remote --command "DELETE FROM signals"
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/health
```

---

## API Quick Reference

Auth: `Authorization: Bearer demo-key-adcp-signals-v1`

```
GET  /health
GET  /capabilities
POST /signals/search
POST /signals/activate
GET  /operations/:id
POST /mcp
```

**Relevance-ranked discovery:**
```bash
curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_signals\",\"arguments\":{\"signal_spec\":\"high income households interested in luxury goods\",\"max_results\":3,\"deliver_to\":{\"deployments\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}],\"countries\":[\"US\"]}}}}"
```

**Activate + poll:**
```bash
curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_signal\",\"arguments\":{\"signal_agent_segment_id\":\"sig_acs_graduate_high_income\",\"deliver_to\":{\"deployments\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}],\"countries\":[\"US\"]}}}}"

curl -s -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"get_task_status\",\"arguments\":{\"task_id\":\"PASTE_TASK_ID\"}}}"
```

**SDK CLI:**
```bash
npx @adcp/client https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  get_signals '{"signal_spec":"high income streaming fans","deliver_to":{"deployments":[{"type":"platform","platform":"mock_dsp"}],"countries":["US"]}}'
```

---

## Connecting to Claude.ai

Settings → Integrations → Add MCP Server:
```
https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp
```

---

## Tests

```bash
npm test
```

**57 tests** across: ID utilities (deterministic hash), estimation, taxonomy loader, demographic loader, rule engine validation + generation, signal catalog integrity, request validation, signal mapper, MCP tool definitions, **DTS v1.2 label generation** (12 tests covering all signal types, field derivation, onboarder conditional fields, `x_dts` presence on every signal).

---

## License

MIT — Reference implementation for AdCP protocol development and IAB DTS v1.2 integration.