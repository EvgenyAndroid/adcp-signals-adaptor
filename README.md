# AdCP Signals Adaptor Agent

A production-structured reference implementation of an **AdCP (Ad Context Protocol) Signals Provider**, built on Cloudflare Workers. Demonstrates signal discovery, dynamic segment generation, and mock activation for agentic advertising workflows.

---

## What This Is

The AdCP Signals Adaptor exposes a protocol-compliant Signals Provider that:

- **Discovers** audience signals via keyword search, taxonomy filtering, and category/destination filters
- **Generates** custom composite segments dynamically from rule combinations
- **Activates** signals to mock destinations (DSP, cleanroom, CDP, measurement) with lifecycle tracking
- **Classifies** all signals using the **IAB Audience Taxonomy 1.1** as the semantic backbone

This is a **demo/reference implementation**. All audience sizes are modeled estimates. No real user-level data is included.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Cloudflare Worker                       │
│                                                          │
│   ┌─────────────┐    ┌──────────────────────────────┐   │
│   │  Protocol   │───▶│  Domain Services              │   │
│   │  Layer      │    │  signalService                │   │
│   │  (routes/)  │    │  activationService            │   │
│   └─────────────┘    │  capabilityService            │   │
│         │            │  ruleEngine                   │   │
│         │            └──────────────┬───────────────┘   │
│         │                           │                    │
│         │            ┌──────────────▼───────────────┐   │
│         │            │  Data Connectors              │   │
│         │            │  iabTaxonomyLoader            │   │
│         │            │  demographicLoader            │   │
│         │            │  interestLoader               │   │
│         │            │  geoLoader                    │   │
│         │            └──────────────┬───────────────┘   │
│         │                           │                    │
│         │            ┌──────────────▼───────────────┐   │
│         │            │  Storage (D1 + KV)            │   │
│         │            │  signalRepo                   │   │
│         │            │  activationRepo               │   │
│         │            └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Layers

| Layer | Location | Responsibility |
|---|---|---|
| Protocol | `src/routes/` | HTTP routing, auth, validation, request/response mapping |
| Domain | `src/domain/` | Business logic: signal search, generation, activation |
| Connectors | `src/connectors/` | Seed data parsing - no protocol knowledge |
| Mappers | `src/mappers/` | Canonical model ↔ API shape transformations |
| Storage | `src/storage/` | D1 queries, KV caching |
| Types | `src/types/` | Shared TypeScript types |
| Utils | `src/utils/` | IDs, logging, estimation, validation |

---

## Datasets

| Dataset | Source | Use |
|---|---|---|
| IAB Audience Taxonomy 1.1 | `seed/iab-audience-1.1.tsv` | Semantic classification backbone for all signals |
| US Demographics Sample | `seed/demographics-sample.csv` | Age, income, education, household, geography buckets |
| Entertainment Affinity | `seed/interests-sample.csv` | Genre affinity scores (derived from MovieLens genre taxonomy) |
| US Metro Geography | `seed/geo-sample.csv` | Top 50 US cities with metro tier and region |

All datasets are small, curated samples for demo purposes. Total seed data: ~200 rows.

---

## Signal Catalog

### Seeded Signals (~24)
Static signals loaded from seed data during initialization:
- Age bands (18-24 through 65+)
- Income brackets (Middle, Upper Middle, High)
- Education (College, Graduate Educated)
- Household types (Families, Senior Households)
- Entertainment genres (Action, Sci-Fi, Drama, Comedy, Documentary, Streaming)
- Purchase intent (Tech Buyers, Streaming Subscribers, Premium Content)
- Geographic (Urban, Top 10 Metro, Top 25 Metro)
- Professional (Urban Professionals)

### Derived Signals (~6)
Multi-dimensional combinations built at seed time:
- High Income Entertainment Enthusiasts
- Urban Young Professionals
- Affluent Families Interested in Travel
- Metro Sci-Fi Enthusiasts
- College Educated Heavy Streamers
- Affluent Urban Entertainment Fans

### Dynamic Signals (∞)
Generated on-demand via `POST /signals/generate` using the rule engine.

---

## Canonical Signal Model

```typescript
type CanonicalSignal = {
  signalId: string;                    // "sig_high_income_households"
  externalTaxonomyId?: string;         // "17" (IAB Taxonomy node ID)
  taxonomySystem: "iab_audience_1_1";
  name: string;
  description: string;
  categoryType: "demographic" | "interest" | "purchase_intent" | "geo" | "composite";
  sourceSystems: string[];             // ["iab_taxonomy_loader", "demographics_seed"]
  destinations: string[];             // ["mock_dsp", "mock_cleanroom", ...]
  activationSupported: boolean;
  estimatedAudienceSize?: number;     // Modeled estimate
  pricing?: { model, value, currency };
  generationMode: "seeded" | "derived" | "dynamic";
  rules?: SegmentRule[];              // Only for derived/dynamic
  status: "available" | "inactive" | "pending";
  accessPolicy: "public_demo" | "restricted_demo";
};
```

---

## Dynamic Segment Generation

The rule engine supports these dimensions:

| Dimension | Valid Values |
|---|---|
| `age_band` | `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+` |
| `income_band` | `under_50k`, `50k_100k`, `100k_150k`, `150k_plus` |
| `education` | `high_school`, `some_college`, `bachelors`, `graduate` |
| `household_type` | `single`, `couple_no_kids`, `family_with_kids`, `senior_household` |
| `metro_tier` | `top_10`, `top_25`, `top_50`, `other` |
| `content_genre` | `action`, `sci_fi`, `drama`, `comedy`, `documentary`, `thriller`, `animation`, `romance` |
| `streaming_affinity` | `high`, `medium`, `low` |

Audience size estimation uses independent probability intersection against a US adult internet baseline of 240M, then applies a 50K floor. All estimates are marked as `heuristic_demo`.

---

## Activation Lifecycle

```
POST /signals/activate
  → submitted
  → processing
  → completed (or failed)

GET /operations/:id
  → returns current status + signal details
```

In this demo, activations complete synchronously within the request for simplicity. A production implementation would use a Cloudflare Queue or Durable Object to manage async state.

---

## Running Locally

### Prerequisites
- Node.js 18+
- Wrangler CLI v3+
- Cloudflare account (free tier is fine)

### Setup

```bash
npm install

# Create D1 database
wrangler d1 create adcp-signals-db

# Update wrangler.toml with the returned database_id

# Run migrations
wrangler d1 migrations apply adcp-signals-db --local

# Start local dev server
npm run dev
```

The Worker auto-seeds the database on first request.

Force re-seed (dev only):
```bash
curl -X POST http://localhost:8787/seed
```

### Running Tests

```bash
npm test
```

---

## Deploying to Cloudflare Workers

```bash
# Create KV namespace
wrangler kv:namespace create SIGNALS_CACHE

# Update wrangler.toml with the returned KV namespace IDs (id and preview_id)

# Deploy
npm run deploy

# Apply migrations to production D1
wrangler d1 migrations apply adcp-signals-db
```

---

## API Reference

All write endpoints require:
```
Authorization: Bearer demo-key-adcp-signals-v1
```

### GET /capabilities

Returns provider capabilities and supported operations.

```bash
curl http://localhost:8787/capabilities
```

### POST /signals/search

Search and filter available signals.

```bash
curl -X POST http://localhost:8787/signals/search \
  -H "Authorization: Bearer demo-key-adcp-signals-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryType": "demographic",
    "limit": 10
  }'
```

Search by keyword:
```bash
curl -X POST http://localhost:8787/signals/search \
  -H "Authorization: Bearer demo-key-adcp-signals-v1" \
  -H "Content-Type: application/json" \
  -d '{ "query": "sci-fi" }'
```

Filter by generation mode:
```bash
curl -X POST http://localhost:8787/signals/search \
  -H "Authorization: Bearer demo-key-adcp-signals-v1" \
  -H "Content-Type: application/json" \
  -d '{ "generationMode": "derived" }'
```

### POST /signals/activate

Activate a signal to a destination.

```bash
curl -X POST http://localhost:8787/signals/activate \
  -H "Authorization: Bearer demo-key-adcp-signals-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "signalId": "sig_high_income_households",
    "destination": "mock_dsp",
    "accountId": "acct_demo_001",
    "campaignId": "camp_q4_2025"
  }'
```

### POST /signals/generate

Generate a custom dynamic segment from rules.

```bash
curl -X POST http://localhost:8787/signals/generate \
  -H "Authorization: Bearer demo-key-adcp-signals-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Urban Sci-Fi Adults 25-34",
    "rules": [
      { "dimension": "age_band", "operator": "eq", "value": "25-34" },
      { "dimension": "metro_tier", "operator": "eq", "value": "top_10" },
      { "dimension": "content_genre", "operator": "eq", "value": "sci_fi" }
    ]
  }'
```

### GET /operations/:id

Check activation status.

```bash
curl http://localhost:8787/operations/op_1735000000000_abcd1234 \
  -H "Authorization: Bearer demo-key-adcp-signals-v1"
```

---

## Example Responses

### GET /capabilities
```json
{
  "provider": "AdCP Signals Adaptor - Demo Provider",
  "protocolVersion": "3.0-rc",
  "supportedOperations": ["get_adcp_capabilities", "get_signals", "activate_signal", "generate_custom_signal"],
  "dynamicSegmentGeneration": true,
  "destinations": [
    { "id": "mock_dsp", "name": "Mock DSP", "type": "dsp", "activationSupported": true }
  ]
}
```

### POST /signals/search
```json
{
  "signals": [
    {
      "signalId": "sig_high_income_households",
      "name": "High Income Households",
      "categoryType": "demographic",
      "taxonomySystem": "iab_audience_1_1",
      "externalTaxonomyId": "17",
      "generationMode": "seeded",
      "activationSupported": true,
      "estimatedAudienceSize": 1200000,
      "destinations": ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
      "pricing": { "model": "mock_cpm", "value": 2.5, "currency": "USD" },
      "status": "available"
    }
  ],
  "count": 1,
  "totalCount": 30,
  "offset": 0,
  "hasMore": true
}
```

### POST /signals/activate
```json
{
  "operationId": "op_1735000000000_abcd1234",
  "status": "completed",
  "signalId": "sig_high_income_households",
  "destination": "mock_dsp",
  "submittedAt": "2025-01-01T12:00:00.000Z",
  "estimatedCompletionMs": 3000
}
```

### POST /signals/generate
```json
{
  "signal": {
    "signalId": "sig_dyn_urban_sci_fi_adults_25_34_a1b2c3",
    "name": "Urban Sci-Fi Adults 25-34",
    "categoryType": "composite",
    "generationMode": "dynamic",
    "estimatedAudienceSize": 185000,
    "destinations": ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"]
  },
  "generationNotes": "Generated from 3 rule(s). Category inferred as: composite. Mapped to IAB taxonomy node(s): 4, 104.",
  "ruleCount": 3
}
```

---

## Design Decisions

- **Cloudflare Workers + D1**: Zero cold start, globally distributed, cost-effective for API workloads
- **Auto-seed on first request**: No separate migration step required in dev — `ctx.waitUntil()` handles it
- **Taxonomy as backbone, not segments**: IAB taxonomy nodes are classification metadata, not commercial segments themselves
- **Audience size floor of 50K**: Prevents implausible precision in multi-dimensional narrow segments
- **`operationId` = `op_{timestamp}_{hex}`**: Provides natural sort ordering and easy time-range filtering
- **Dual-path API (HTTP + MCP)**: Both HTTP routes and domain services are separated so MCP tool wrappers can call the same domain functions without duplicating logic
- **KV for capabilities**: Capabilities response is static per deployment, so KV caching avoids unnecessary D1 reads

---

## Extending This Adaptor

To add a real data provider:

1. Add a new loader in `src/connectors/` that outputs `CanonicalSignal[]`
2. Register it in `src/domain/seedPipeline.ts`
3. Map its categories to IAB taxonomy IDs in `src/mappers/taxonomyMapper.ts`

To add a real activation endpoint:

1. Replace `updateJobStatus(db, opId, "completed")` in `activationService.ts` with a real DSP/cleanroom API call
2. Add webhook or polling support via Cloudflare Queues

---

## License

MIT — Reference implementation, not for production advertising use.
