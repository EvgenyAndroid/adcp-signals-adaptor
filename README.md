# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol: signal discovery, dynamic segment generation, and mock activation for agentic advertising workflows.

**Live endpoint:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`
**MCP endpoint:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6:

| Endpoint | Status |
|---|---|
| `get_adcp_capabilities` | ✅ |
| `get_signals` | ✅ |
| `activate_signal` | ✅ |
| `generate_custom_signal` | ✅ (extension) |

Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Architecture

```
Cloudflare Worker (src/index.ts)
  │
  ├── /mcp              MCP Streamable HTTP (JSON-RPC 2.0)
  │     src/mcp/server.ts    — protocol handler
  │     src/mcp/tools.ts     — tool definitions + schemas
  │
  ├── /capabilities     AdCP capabilities envelope
  ├── /signals/search   Signal discovery + filtering
  ├── /signals/activate Signal activation
  ├── /signals/generate Dynamic segment generation
  ├── /operations/:id   Activation status
  └── /seed             Force re-seed

Domain Layer (src/domain/)
  signalService.ts        — search, generate, destinations filter
  activationService.ts    — activate, get operation status
  capabilityService.ts    — capabilities (KV-cached 1hr)
  ruleEngine.ts           — dynamic segment rule engine
  signalModel.ts          — base seeded + derived signal catalog
  enrichedSignalModel.ts  — Census ACS, Nielsen DMA, cross-taxonomy signals
  seedPipeline.ts         — D1 ingestion pipeline (all catalogs)

Connectors (src/connectors/)
  iabTaxonomyLoader.ts    — IAB Audience Taxonomy 1.1 TSV parser
  demographicLoader.ts    — US demographics CSV parser
  interestLoader.ts       — Entertainment affinity CSV parser
  geoLoader.ts            — US city/metro CSV parser
  censusLoader.ts         — Census ACS 5-year estimates parser
  dmaLoader.ts            — Nielsen DMA parser
  taxonomyBridgeLoader.ts — IAB Audience 1.1 × Content Taxonomy 3.0 bridge

Storage (Cloudflare D1 + KV)
  signalRepo.ts         — signal CRUD + search
  activationRepo.ts     — activation job lifecycle
```

---

## Signal Catalog (49 signals)

### Base Catalog — 33 signals

**Seeded (25)** — Age bands, income brackets, education, household types, entertainment genres, purchase intent, geo segments, urban professionals, conformance fixture.

**Derived (6)** — Pre-built multi-dimensional composites: High Income Entertainment Enthusiasts, Urban Young Professionals, Affluent Families, Metro Sci-Fi Fans, College Educated Heavy Streamers, Affluent Urban Entertainment Fans.

**Dynamic** — Unlimited, generated on-demand via `generate_custom_signal`.

### Enriched Catalog — 16 signals (3 new data sources)

**Census ACS-Derived (5)**
Source: US Census Bureau ACS 2022 5-year estimates (tables B01001 × B19001 × B15003 × B11001). Each signal tagged with ACS table references and margin of error at 90% confidence.

| Signal | ACS Tables | Size |
|---|---|---|
| Affluent College Educated Households | B19001 × B15003 | 3.85M |
| Middle Income Families with Children | B11001 × B19001 | 5.24M |
| Young Single Adults 18-34 | B01001 × B11001 | 4.51M |
| Graduate Educated High Income | B15003 × B19001 | 1.29M |
| Senior Households with Income | B01001 × B11001 × B19001 | 2.10M |

**Nielsen DMA-Derived (6)**
Source: Nielsen 2023-24 DMA universe estimates. Proper DMA codes (501, 802, 602...) with TV household counts. Geography field carries real `DMA-501` style codes.

| Signal | DMA Codes | TV HH |
|---|---|---|
| New York DMA (501) | DMA-501 | 7.5M |
| Top 5 US DMA Markets | DMA-501,802,602,504,618 | 24.7M |
| Top 10 US DMA Markets | DMAs 1-10 | 37.5M |
| Top 25 US DMA Markets | DMAs 1-25 | 59.9M |
| Sunbelt Growth Markets | DMA-618,623,561,753,527,539,543,616 | 17.5M |
| Midwest DMA Markets | DMA-602,637,641,517,609,619,545,558 | 9.9M |

**Cross-Taxonomy Bridge (5)**
Source: IAB Audience Taxonomy 1.1 × IAB Content Taxonomy 3.0 semantic bridge. Bidirectional mappings where content consumption validates audience membership. Premium CPMs ($3–$5) reflecting composite signal value.

| Signal | Audience Node | Content Nodes | CPM |
|---|---|---|---|
| Sci-Fi & Tech Content Audience | IAB AUD 104 | IAB1-7, IAB19 | $3.00 |
| Affluent Travel Content Audience | IAB AUD 17 | IAB23, IAB21 | $4.00 |
| Families + Education Content | IAB AUD 20 | IAB5, IAB4 | $2.80 |
| BDM + Business News Content | IAB AUD 401 | IAB3, IAB12 | $5.00 |
| Streaming + Entertainment Content | IAB AUD 109 | IAB1-5, IAB1-1, IAB1-7 | $3.20 |

All signals are AdCP spec-compliant with `signal_agent_segment_id`, `signal_type`, `coverage_percentage`, `deployments[]`, and `pricing_options[]`.

---

## Datasets

| File | Source | Use |
|---|---|---|
| `seed/iab-audience-1.1.tsv` | IAB Tech Lab | Audience Taxonomy 1.1 — semantic classification backbone |
| `seed/demographics-sample.csv` | Hand-curated | Age, income, education, household, geography buckets |
| `seed/interests-sample.csv` | MovieLens genre structure | Genre affinity scores |
| `seed/geo-sample.csv` | US Census city data | Top 50 US cities with metro tier |
| `seed/census-acs-sample.csv` | US Census ACS 2022 5-yr | Cross-tabulated household estimates with MOE |
| `seed/dma-nielsen.csv` | Nielsen 2023-24 | DMA codes, ranks, TV household universe |
| `seed/taxonomy-bridge.csv` | IAB Tech Lab | Audience Taxonomy 1.1 × Content Taxonomy 3.0 mappings |

---

## AdCP Response Shapes

### `get_signals`

```json
{
  "message": "Found 5 signal(s) in category demographic...",
  "context_id": "req_...",
  "signals": [
    {
      "signal_agent_segment_id": "sig_acs_affluent_college_educated",
      "name": "Affluent College Educated Households (ACS)",
      "signal_type": "marketplace",
      "data_provider": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
      "coverage_percentage": 1.6,
      "deployments": [
        {
          "type": "platform",
          "platform": "mock_dsp",
          "is_live": true,
          "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_acs_affluent_college_educated" },
          "activation_supported": true
        }
      ],
      "pricing_options": [
        { "pricing_option_id": "opt-mock_cpm-...", "pricing_model": "cpm", "cpm": 2.5, "currency": "USD" }
      ],
      "category_type": "demographic",
      "estimated_audience_size": 3850000
    }
  ],
  "count": 5,
  "totalCount": 49,
  "hasMore": true
}
```

### `activate_signal`

```json
{
  "message": "Signal sig_dma_top_10_markets successfully activated on 1 platform(s).",
  "context_id": "ctx_...",
  "deployments": [
    {
      "type": "platform",
      "platform": "mock_dsp",
      "is_live": true,
      "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_dma_top_10_markets" },
      "estimated_activation_duration_minutes": 0
    }
  ]
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

## Dynamic Segment Generation

The rule engine supports 7 dimensions:

| Dimension | Values |
|---|---|
| `age_band` | `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+` |
| `income_band` | `under_50k`, `50k_100k`, `100k_150k`, `150k_plus` |
| `education` | `high_school`, `some_college`, `bachelors`, `graduate` |
| `household_type` | `single`, `couple_no_kids`, `family_with_kids`, `senior_household` |
| `metro_tier` | `top_10`, `top_25`, `top_50`, `other` |
| `content_genre` | `action`, `sci_fi`, `drama`, `comedy`, `documentary`, `thriller`, `animation`, `romance` |
| `streaming_affinity` | `high`, `medium`, `low` |

Up to 6 rules per segment. Audience size uses heuristic intersection against 240M US adult baseline with 50K floor.

---

## Running Locally

```bash
npm install
wrangler login

# Create D1 and KV (or reuse existing)
wrangler d1 create adcp-signals-db
wrangler kv namespace list

# Update wrangler.toml with IDs, then:
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev

# Seed (auto-runs on first request, or force:)
curl -X POST http://localhost:8787/seed -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

---

## Deploying

```bash
npm run deploy
wrangler d1 migrations apply adcp-signals-db --remote  # only if schema changed

# Force re-seed after deploy (if new signals added):
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/seed -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

---

## API Quick Reference

Auth required: `Authorization: Bearer demo-key-adcp-signals-v1`

```
GET  /health
GET  /capabilities
POST /signals/search
POST /signals/activate
POST /signals/generate
GET  /operations/:id
POST /mcp
POST /seed
```

### Example curls

Search DMA signals:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer demo-key-adcp-signals-v1" -H "Content-Type: application/json" -d "{\"query\":\"DMA\",\"categoryType\":\"geo\"}"
```

Search Census ACS signals:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer demo-key-adcp-signals-v1" -H "Content-Type: application/json" -d "{\"query\":\"ACS\"}"
```

Search cross-taxonomy signals:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer demo-key-adcp-signals-v1" -H "Content-Type: application/json" -d "{\"query\":\"Cross-Taxonomy\",\"categoryType\":\"composite\"}"
```

MCP get_signals (interest category):
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_signals\",\"arguments\":{\"categoryType\":\"interest\",\"limit\":5}}}"
```

MCP activate Top 10 DMA signal:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_signal\",\"arguments\":{\"signal_agent_segment_id\":\"sig_dma_top_10_markets\",\"destinations\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}]}}}"
```

---

## Connecting to Claude.ai

Settings → Integrations → Add MCP Server:
```
https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp
```

Claude can then use all 5 tools natively: `get_adcp_capabilities`, `get_signals`, `activate_signal`, `generate_custom_signal`, `get_operation_status`.

---

## Tests

```bash
npm test
```

44 tests: ID utilities, estimation, taxonomy loader, demographic loader, rule engine, signal catalog integrity, request validation, signal mapper, MCP tool definitions.

---

## License

MIT — Reference implementation for AdCP protocol development.
