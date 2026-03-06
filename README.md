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

Response shapes are validated against the AdCP JSON schemas. Passes the AdCP conformance test suite (health, discovery, capability_discovery, signals_flow).

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
  └── /seed             Force re-seed (dev)

Domain Layer (src/domain/)
  signalService.ts      — search, generate
  activationService.ts  — activate, status
  capabilityService.ts  — capabilities (KV-cached)
  ruleEngine.ts         — dynamic segment rule engine
  signalModel.ts        — seeded + derived signal catalog
  seedPipeline.ts       — D1 ingestion pipeline

Storage (Cloudflare D1 + KV)
  signalRepo.ts         — signal CRUD + search
  activationRepo.ts     — activation job lifecycle
```

---

## Signal Catalog

33 signals across 3 generation modes:

**Seeded (static catalog)** — 25 signals
Age bands, income brackets, education, household types, entertainment genres, purchase intent, geo segments, urban professionals, plus one conformance test fixture (`test-signal-001`).

**Derived (pre-built combinations)** — 6 signals
Multi-dimensional composites: High Income Entertainment Enthusiasts, Urban Young Professionals, Affluent Families, Metro Sci-Fi Fans, College Educated Heavy Streamers, Affluent Urban Entertainment Fans.

**Dynamic** — unlimited
Generated on-demand via `generate_custom_signal` using the rule engine. Persisted to D1.

All signals are IAB Audience Taxonomy 1.1 aligned with `signal_agent_segment_id`, `signal_type`, `coverage_percentage`, `deployments[]`, and `pricing_options[]`.

---

## AdCP Response Shapes

### `get_signals`

```json
{
  "message": "Found 5 signal(s) in category demographic...",
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
        { "pricing_option_id": "opt-mock_cpm-sig_high_income_households", "pricing_model": "cpm", "cpm": 2.5, "currency": "USD" }
      ],
      "category_type": "demographic",
      "estimated_audience_size": 1200000
    }
  ],
  "count": 5,
  "totalCount": 33,
  "hasMore": true
}
```

### `activate_signal`

```json
{
  "message": "Signal sig_high_income_households successfully activated on 1 platform(s).",
  "context_id": "ctx_...",
  "deployments": [
    {
      "type": "platform",
      "platform": "mock_dsp",
      "is_live": true,
      "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_high_income_households" },
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

Up to 6 rules per segment. Audience size uses heuristic intersection against a 240M US adult baseline with a 50K floor.

---

## Datasets

| File | Use |
|---|---|
| `seed/iab-audience-1.1.tsv` | IAB Audience Taxonomy 1.1 — semantic classification backbone |
| `seed/demographics-sample.csv` | Age, income, education, household, geography buckets |
| `seed/interests-sample.csv` | Genre affinity scores (MovieLens genre taxonomy structure) |
| `seed/geo-sample.csv` | Top 50 US cities with metro tier |

All are small curated samples (~200 rows total). Not real user data.

---

## Running Locally

```bash
npm install
wrangler login

# Create D1 database
wrangler d1 create adcp-signals-db
# Update wrangler.toml with the returned database_id

# Create KV namespace (or use existing)
wrangler kv namespace list
# Update wrangler.toml with your KV namespace id

# Run migrations
wrangler d1 migrations apply adcp-signals-db --remote

# Start dev server
npm run dev

# Force seed
curl -X POST http://localhost:8787/seed -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

---

## Deploying

```bash
npm run deploy
# Then apply migrations if schema changed:
wrangler d1 migrations apply adcp-signals-db --remote
```

Bindings (set in Cloudflare dashboard or wrangler.toml):
- D1: `DB` → `adcp-signals-db`
- KV: `SIGNALS_CACHE` → your KV namespace

---

## API Quick Reference

All write endpoints require `Authorization: Bearer demo-key-adcp-signals-v1`

```
GET  /health
GET  /capabilities
POST /signals/search
POST /signals/activate
POST /signals/generate
GET  /operations/:id
POST /mcp                    (MCP Streamable HTTP)
POST /seed                   (force re-seed)
```

### Curl examples

Search demographics:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer demo-key-adcp-signals-v1" -H "Content-Type: application/json" -d "{\"categoryType\":\"demographic\",\"limit\":5}"
```

Generate custom segment:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/generate -H "Authorization: Bearer demo-key-adcp-signals-v1" -H "Content-Type: application/json" -d "{\"name\":\"Urban Sci-Fi Adults 25-34\",\"rules\":[{\"dimension\":\"age_band\",\"operator\":\"eq\",\"value\":\"25-34\"},{\"dimension\":\"metro_tier\",\"operator\":\"eq\",\"value\":\"top_10\"},{\"dimension\":\"content_genre\",\"operator\":\"eq\",\"value\":\"sci_fi\"}]}"
```

MCP tools list:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

MCP get_signals:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_signals\",\"arguments\":{\"categoryType\":\"interest\",\"limit\":3}}}"
```

MCP activate_signal:
```
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_signal\",\"arguments\":{\"signal_agent_segment_id\":\"sig_high_income_households\",\"destinations\":[{\"type\":\"platform\",\"platform\":\"mock_dsp\"}]}}}"
```

---

## Connecting to Claude.ai

Settings → Integrations → Add MCP Server:
```
https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp
```

Once connected, Claude can call all 5 tools natively in conversation.

---

## Tests

```bash
npm test
```

44 tests covering: ID utilities, estimation, taxonomy loader, demographic loader, rule engine validation, rule engine generation, signal catalog integrity, request validation, signal mapper, MCP tool definitions.

---

## License

MIT — Reference implementation for AdCP protocol development.
