# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol: signal discovery, brief-driven custom segment proposals, async activation with webhook support, and task polling.

**Live endpoint:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`
**MCP endpoint:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6 — 4 tools:

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions` + `supported_protocols` envelope |
| `get_signals` | ✅ | Catalog + inline custom proposals via `brief` param |
| `activate_signal` | ✅ | Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Lazy state machine + webhook firing |

`generate_custom_signal` was intentionally not implemented — proposals surface via `get_signals` brief parameter per protocol spec.

Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Architecture

```
Cloudflare Worker (src/index.ts)
  │
  ├── /mcp              MCP Streamable HTTP (JSON-RPC 2.0)
  │     src/mcp/server.ts    — 4-tool protocol handler
  │     src/mcp/tools.ts     — tool definitions + JSON schemas
  │
  ├── /capabilities     AdCP capabilities envelope
  ├── /signals/search   Signal discovery + brief proposals
  ├── /signals/activate Signal activation (REST)
  ├── /operations/:id   Task status polling (REST)
  └── /seed             Force re-seed

Domain Layer (src/domain/)
  signalService.ts        — search, brief parsing, proposal generation + D1 persistence
  activationService.ts    — async activate, lazy state machine, webhook firing
  capabilityService.ts    — capabilities (KV-cached 1hr)
  ruleEngine.ts           — rule validation + segment generation
  signalModel.ts          — base seeded + derived catalog
  enrichedSignalModel.ts  — Census ACS, Nielsen DMA, cross-taxonomy signals
  seedPipeline.ts         — D1 ingestion (all catalogs, idempotent)

Connectors (src/connectors/)
  iabTaxonomyLoader.ts    — IAB Audience Taxonomy 1.1 TSV parser
  demographicLoader.ts    — US demographics CSV parser
  interestLoader.ts       — Entertainment affinity CSV parser
  geoLoader.ts            — US city/metro CSV parser
  censusLoader.ts         — Census ACS 5-year estimates parser + MOE handling
  dmaLoader.ts            — Nielsen DMA parser + tier aggregation
  taxonomyBridgeLoader.ts — IAB Audience 1.1 × Content Taxonomy 3.0 bridge

Storage (Cloudflare D1 + KV)
  signalRepo.ts           — signal CRUD + search
  activationRepo.ts       — activation jobs, webhook_url, webhook_fired flag
```

---

## Signal Catalog (49 signals)

### Base Catalog — 33 signals

**Seeded (25):** Age bands, income brackets, education, household types, entertainment genres, purchase intent, geo segments, urban professionals, conformance fixture (`test-signal-001`).

**Derived (6):** Pre-built multi-dimensional composites.

**Dynamic:** Unlimited — generated on-demand via `get_signals` brief parameter, persisted to D1.

### Enriched Catalog — 16 signals

**Census ACS-Derived (5)** — Source: US Census ACS 2022 5-year estimates (B01001 × B19001 × B15003 × B11001). ACS table references and MOE at 90% confidence included.

**Nielsen DMA-Derived (6)** — Source: Nielsen 2023-24 DMA universe. Proper DMA codes (DMA-501 etc.), TV household counts, Sunbelt/Midwest composites.

**Cross-Taxonomy Bridge (5)** — IAB Audience Taxonomy 1.1 × IAB Content Taxonomy 3.0. Bidirectional mappings. Premium CPMs ($3–$5).

---

## Key Protocol Flows

### Natural Language Brief → Custom Proposal

```
get_signals(brief: "affluent parents in top metros who love sci-fi")
  → signals: [...catalog results...]
  → proposals: [{
      signal_agent_segment_id: "sig_dyn_...",
      name: "High Income $150K+, Families w/ Children, Sci-Fi Fans",
      signal_type: "custom",
      is_live: false,           ← not yet activated
      estimated_audience_size: 1393920,
      coverage_percentage: 0.6,
      cpm: $4.00
    }]
```

Proposals are persisted to D1 on generation — the ID is stable and immediately usable for activation.

### Async Activation Flow

```
activate_signal(signal_agent_segment_id, destinations)
  → { task_id: "op_...", status: "pending", is_live: false }

get_operation_status(task_id)
  → { status: "completed", is_live: true, activation_key: { segment_id: "..." } }
```

Webhook support: pass `webhook_url` to `activate_signal` — a POST callback fires on first `get_operation_status` poll that reaches `completed`.

---

## AdCP Response Shapes

### `get_signals`

```json
{
  "message": "Found 20 signal(s) matching brief...",
  "context_id": "req_...",
  "signals": [
    {
      "signal_agent_segment_id": "sig_high_income_households",
      "name": "High Income Households",
      "signal_type": "marketplace",
      "data_provider": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
      "coverage_percentage": 0.5,
      "deployments": [
        {
          "type": "platform",
          "platform": "mock_dsp",
          "is_live": true,
          "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_high_income_households" },
          "activation_supported": true
        }
      ],
      "pricing_options": [
        { "pricing_option_id": "opt-mock_cpm-...", "pricing_model": "cpm", "cpm": 2.5, "currency": "USD" }
      ],
      "category_type": "demographic",
      "estimated_audience_size": 1200000
    }
  ],
  "proposals": [
    {
      "signal_agent_segment_id": "sig_dyn_...",
      "name": "High Income $150K+, Families w/ Children, Sci-Fi Fans",
      "signal_type": "custom",
      "is_live": false,
      "estimated_audience_size": 1393920,
      "generation_rationale": "Generated from 3 rule(s)..."
    }
  ],
  "count": 20,
  "totalCount": 37,
  "hasMore": true
}
```

### `activate_signal`

```json
{
  "task_id": "op_1772905632696_6d0bpy12o",
  "status": "pending",
  "signal_agent_segment_id": "sig_dyn_...",
  "deployments": [
    {
      "type": "platform",
      "platform": "mock_dsp",
      "is_live": false,
      "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_dyn_..." },
      "estimated_activation_duration_minutes": 1
    }
  ]
}
```

### `get_operation_status`

Status lifecycle: `pending → working → completed` (aligned with `ADCP_STATUS` from `@adcp/client`)

```json
{
  "task_id": "op_1772905632696_6d0bpy12o",
  "status": "completed",
  "signal_agent_segment_id": "sig_dyn_...",
  "deployments": [
    {
      "type": "platform",
      "platform": "mock_dsp",
      "is_live": true,
      "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_dyn_..." },
      "estimated_activation_duration_minutes": 0
    }
  ],
  "submittedAt": "2026-03-07T17:24:49.806Z",
  "completedAt": "2026-03-07T17:25:12.946Z"
}
```

### `get_adcp_capabilities`

```json
{
  "adcp": { "major_versions": [2] },
  "supported_protocols": ["signals"],
  "signals": {
    "signal_categories": ["demographic", "interest", "purchase_intent", "geo", "composite"],
    "dynamic_segment_generation": true,
    "activation_mode": "async",
    "destinations": [...]
  }
}
```

---

## Datasets

| File | Source | Use |
|---|---|---|
| `seed/iab-audience-1.1.tsv` | IAB Tech Lab | Audience Taxonomy 1.1 backbone |
| `seed/demographics-sample.csv` | Hand-curated | Age × income × education × household buckets |
| `seed/interests-sample.csv` | MovieLens genre structure | Genre affinity scores |
| `seed/geo-sample.csv` | US Census city data | Top 50 US cities |
| `seed/census-acs-sample.csv` | US Census ACS 2022 5-yr | Cross-tabulated household estimates with MOE |
| `seed/dma-nielsen.csv` | Nielsen 2023-24 | DMA codes, ranks, TV household universe |
| `seed/taxonomy-bridge.csv` | IAB Tech Lab | Audience 1.1 × Content Taxonomy 3.0 mappings |

---

## Dynamic Segment Generation (via brief)

The brief parser extracts these dimensions from natural language:

| Dimension | Example phrases |
|---|---|
| `age_band` | "18-24", "millennials", "gen z", "boomers" |
| `income_band` | "affluent", "high income", "$150k", "upper middle" |
| `education` | "college", "graduate", "MBA", "university degree" |
| `household_type` | "families", "parents", "kids", "single", "couple" |
| `metro_tier` | "top metros", "urban", "major city", "New York" |
| `content_genre` | "sci-fi", "action", "documentary", "comedy" |
| `streaming_affinity` | "streaming", "cord cutters", "CTV", "OTT" |

Up to 6 dimensions per segment. Audience size uses heuristic intersection against 240M US adult baseline with 50K floor.

---

## Running Locally

```bash
npm install
wrangler login
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev

# Trigger auto-seed (happens automatically on first request)
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/health
```

---

## Deploying

```bash
npm run deploy

# Run migrations if schema changed
wrangler d1 migrations apply adcp-signals-db --remote
```

`wrangler.toml` bindings required:
- D1: `DB` → `adcp-signals-db` (ID: `70b0049e-7012-4c3a-8bd2-0f0a9c74d79c`)
- KV: `SIGNALS_CACHE` → your KV namespace

---

## API Quick Reference

Auth required: `Authorization: Bearer demo-key-adcp-signals-v1`

```
GET  /health
GET  /capabilities
POST /signals/search
POST /signals/activate
GET  /operations/:id
POST /mcp
POST /seed   (requires ENVIRONMENT=development)
```

### Example curls

Brief-driven discovery:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_signals\",\"arguments\":{\"brief\":\"affluent parents in top metros who love sci-fi\"}}}"
```

Activate a proposal:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_signal\",\"arguments\":{\"signal_agent_segment_id\":\"PROPOSAL_ID\",\"destinations\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}]}}}"
```

Poll task status:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"get_operation_status\",\"arguments\":{\"task_id\":\"TASK_ID\"}}}"
```

Activate with webhook:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_signal\",\"arguments\":{\"signal_agent_segment_id\":\"sig_high_income_households\",\"destinations\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}],\"webhook_url\":\"https://webhook.site/YOUR-UUID\"}}}"
```

Search DMA signals:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer demo-key-adcp-signals-v1" -H "Content-Type: application/json" -d "{\"query\":\"DMA\",\"categoryType\":\"geo\"}"
```

---

## Connecting to Claude.ai

Settings → Integrations → Add MCP Server:
```
https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp
```

Claude can then describe a target audience in natural language, get proposals, activate them, and poll status — all natively in conversation.

---

## Tests

```bash
npm test
```

45 tests: ID utilities, estimation, taxonomy loader, demographic loader, rule engine validation + generation, signal catalog integrity, request validation, signal mapper, MCP tool definitions (4 tools, task_id, brief param, webhook param, signal_id alias).

## SDK Integration (@adcp/client)

`@adcp/client` is a dev dependency. It is a **client library only** — no server framework. We use it for:

| What | Where | Why |
|---|---|---|
| `createOperationId()` | `src/utils/ids.ts` | Spec-compliant op ID format with nanoid suffix |
| `ADCP_STATUS` constants | `src/domain/activationService.ts` | Status values: `submitted → working → completed` |
| `COMPATIBLE_ADCP_VERSIONS` | `src/domain/capabilityService.ts` | `major_versions: [2, 3]` per SDK compatibility matrix |
| `SIGNALS_TOOLS` reference | `src/mcp/tools.ts` | Confirms `get_signals` + `activate_signal` as core tools |

### SDK test suite compatibility

The `@adcp/client` conformance test suite uses different field names than our spec. We normalize all variants:

| SDK sends | Our field | Resolved |
|---|---|---|
| `signal_id` | `signal_agent_segment_id` | Both accepted |
| `destination: {platform}` | `destinations: [{type, platform}]` | Both accepted |
| `dv360`, `trade-desk`, `meta`, `ttd` | Internal platform ID | Mapped via `PLATFORM_MAP` |

Test directly with the SDK CLI:
```bash
npx @adcp/client https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp get_signals "{"brief":"high income streaming fans"}"
```

---

## License

MIT — Reference implementation for AdCP protocol development.