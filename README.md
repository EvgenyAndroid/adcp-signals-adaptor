# AdCP Signals Adaptor

A production-structured, AdCP 2.6-compliant Signals Provider built on Cloudflare Workers. Implements the full AdCP Signals Activation Protocol: signal discovery, brief-driven custom segment proposals, async activation with webhook support, task polling, and IAB Data Transparency Standard v1.2 labeling via the AdCP `x_dts` extension field.

**Live:** `https://adcp-signals-adaptor.evgeny-193.workers.dev`  
**MCP:** `https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp`  
**GitHub:** `https://github.com/EvgenyAndroid/adcp-signals-adaptor`

---

## Protocol Compliance

Implements AdCP Signals Activation Protocol v2.6 — 4 tools:

| Tool | Status | Notes |
|---|---|---|
| `get_adcp_capabilities` | ✅ | `adcp.major_versions: [2, 3]` + `supported_protocols` envelope |
| `get_signals` | ✅ | Catalog + inline custom proposals via `brief` param + `x_dts` on every signal |
| `activate_signal` | ✅ | Async — returns `task_id + pending` immediately |
| `get_operation_status` | ✅ | Lazy state machine + webhook firing |

`generate_custom_signal` was intentionally not implemented — proposals surface via `get_signals` brief parameter per protocol spec. Passes the AdCP conformance test suite: health, discovery, capability_discovery, signals_flow.

---

## Data Transparency Standard v1.2

Every signal returned by `get_signals` carries an `x_dts` object — a full IAB Tech Lab Data Transparency Standard v1.2 ("Privacy Update", April 2024) label. This is generated automatically in `src/mappers/signalMapper.ts` via `buildDtsLabel()` and embedded using the AdCP v2.5+ `x_` extension field mechanism.

DTS v1.2 is the "nutrition label" for audience data: standardized disclosure of segment provenance, inclusion methodology, refresh cadence, geographic coverage, and privacy compliance posture.

### Why `x_dts` and why non-breaking

The AdCP schema explicitly supports `x_` prefixed fields as extension fields since v2.5.0. The conformance test suite validates only required fields — extra fields are ignored. Embedding DTS v1.2 here bridges two IAB Tech Lab standards with no current formal linkage: AdCP Signals Activation Protocol and DTS v1.2. This implementation is the basis for a proposed contribution to the AdCP working group.

### DTS v1.2 fields implemented

**Core section — always present:**

| DTS 1.2 field | Description | Derived from |
|---|---|---|
| `dts_version` | Spec version | `"1.2"` (hardcoded) |
| `provider_name` | Business entity name | Constant |
| `provider_domain` | Provider domain | Constant |
| `provider_email` | Contact email | Constant |
| `audience_name` | Segment name | `signal.name` |
| `audience_id` | Provider's internal ID | `signal.signalId` |
| `taxonomy_id_list` | IAB AT 1.1 node IDs, comma-separated | `signal.externalTaxonomyId` + `rawSourceRefs` |
| `audience_criteria` | Inclusion logic, 500 char max | `signal.rules` or `signal.description` + source refs |
| `audience_precision_levels` | Granularity multiselect | `"Geography"` for geo signals, `"Household"` otherwise |
| `audience_scope` | Collection context | `"Cross-domain outside O&O"` |
| `originating_domain` | Source domain | `"N/A (Cross-domain)"` |
| `audience_size` | Estimated addressable units | `signal.estimatedAudienceSize` |
| `id_types` | ID currencies | `["Platform ID"]` |
| `geocode_list` | ISO-3166-1-alpha-3, pipe-separated | `"USA"` + DMA codes from `rawSourceRefs` |
| `privacy_compliance_mechanisms` | Consent/opt-out tools | `["GPP", "MSPA"]` |
| `privacy_policy_url` | Privacy policy link | `https://{provider_domain}/privacy` |
| `iab_techlab_compliant` | Compliance audit status | `"No"` (demo) |

**Audience Details section — always present:**

| DTS 1.2 field | Description | Derived from |
|---|---|---|
| `data_sources` | Raw data origin(s) | `signal.sourceSystems` + `rawSourceRefs` (see mapping table below) |
| `audience_inclusion_methodology` | How attributes determined | `signal.sourceSystems` + `generationMode` |
| `audience_expansion` | Look-alike modeling used | `"No"` |
| `device_expansion` | Cross-device expansion | `"No"` |
| `audience_refresh` | Refresh cadence | Inferred from source systems |
| `lookback_window` | Qualifying event lookback | Matches `audience_refresh`, `"N/A"` if `Static` |

**Onboarder Details section — conditional:**

Present with real values when `data_sources` includes `"Public Record: Census"` or other offline-adjacent sources. `"N/A"` otherwise.

| DTS 1.2 field | Offline-adjacent signals | All others |
|---|---|---|
| `onboarder_match_keys` | `"Postal / Geographic Code"` | `"N/A"` |
| `onboarder_audience_expansion` | `"No"` | `"N/A"` |
| `onboarder_device_expansion` | `"No"` | `"N/A"` |
| `onboarder_audience_precision_level` | `"Geography"` | `"N/A"` |

### DTS values by signal type

| Signal type | `data_sources` | `audience_inclusion_methodology` | `audience_refresh` |
|---|---|---|---|
| Seeded demographic/interest | `["Online Survey"]` | `"Modeled"` | `"Static"` |
| Derived composite | `["Online Survey"]` | `"Derived"` | `"Static"` |
| Dynamic (brief proposal) | `["Online Survey"]` | `"Modeled"` | `"Static"` |
| Census ACS-derived | `["Public Record: Census"]` | `"Derived"` | `"Annually"` |
| Nielsen DMA-derived | `["Geo Location"]` | `"Observed/Known"` | `"Annually"` |
| Cross-taxonomy bridge | `["Web Usage", "App Behavior"]` | `"Derived"` | `"Static"` |
| CTV/ACR (future) | `["TV OTT or STB Device"]` | `"Observed/Known"` | `"Weekly"` |

### Full `x_dts` example — Census ACS signal

```json
{
  "signal_agent_segment_id": "sig_acs_high_income_educated_hh",
  "name": "ACS: High Income + College Educated Households",
  "signal_type": "marketplace",
  "coverage_percentage": 0.8,
  "deployments": [...],
  "pricing_options": [...],

  "x_dts": {
    "dts_version": "1.2",
    "provider_name": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
    "provider_domain": "adcp-signals-adaptor.evgeny-193.workers.dev",
    "provider_email": "evgeny@samba.tv",
    "audience_name": "ACS: High Income + College Educated Households",
    "audience_id": "sig_acs_high_income_educated_hh",
    "taxonomy_id_list": "17,10",
    "audience_criteria": "Derived: census_acs. Source refs: ACS_B19001, ACS_B01001. HHI > $100K AND bachelor's or graduate degree.",
    "audience_precision_levels": ["Household"],
    "audience_scope": "Cross-domain outside O&O",
    "originating_domain": "N/A (Cross-domain)",
    "audience_size": 1960000,
    "id_types": ["Platform ID"],
    "geocode_list": "USA",
    "privacy_compliance_mechanisms": ["GPP", "MSPA"],
    "privacy_policy_url": "https://adcp-signals-adaptor.evgeny-193.workers.dev/privacy",
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

### Spec contribution note

This implementation bridges three IAB Tech Lab standards with no current formal linkage: AdCP Signals Activation Protocol, DTS v1.2, and IAB Audience Taxonomy 1.1. The author serves as Principal Spec Editor at IAB Tech Lab (UCP/Agentic Audiences) and Samba TV is a named AdCP launch member. The `x_dts` implementation is the reference basis for a formal extension proposal to the AdCP working group, which would add `x_dts` as a documented optional field to `static/schemas/signals/signal.json` in the `adcontextprotocol/adcp` repo.

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
  signalModel.ts          — base seeded + derived catalog (33 signals)
  enrichedSignalModel.ts  — Census ACS + Nielsen DMA + cross-taxonomy (16 signals)
  seedPipeline.ts         — D1 ingestion pipeline (all catalogs, idempotent)

Mappers
  signalMapper.ts         — CanonicalSignal → AdCP response shape
                            buildDtsLabel() → x_dts DTS v1.2 object on every signal

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

**Dynamic:** Unlimited — generated on-demand via `get_signals` brief parameter, persisted to D1 on first request.

### Enriched Catalog — 16 signals

**Census ACS-Derived (5)** — US Census ACS 2022 5-yr estimates (B01001 × B19001 × B15003 × B11001). DTS: `data_sources: ["Public Record: Census"]`, `audience_inclusion_methodology: "Derived"`, `audience_refresh: "Annually"`.

**Nielsen DMA-Derived (6)** — Nielsen 2023-24 DMA universe. Proper DMA codes (DMA-501 etc.), TV household counts. DTS: `data_sources: ["Geo Location"]`, `audience_inclusion_methodology: "Observed/Known"`, `geocode_list` includes `DMA-{code}`.

**Cross-Taxonomy Bridge (5)** — IAB Audience 1.1 × Content Taxonomy 3.0. CPMs $2.80–$5.00. DTS: `data_sources: ["Web Usage", "App Behavior"]`, `taxonomy_id_list` carries both taxonomy node IDs.

---

## Key Protocol Flows

### Natural Language Brief → Custom Proposal

```
get_signals(brief: "affluent parents in top metros who love sci-fi")
  → signals: [...catalog results, each with x_dts...]
  → proposals: [{
      signal_agent_segment_id: "sig_dyn_...",
      name: "High Income $150K+, Families w/ Children, Sci-Fi Fans",
      signal_type: "custom",
      is_live: false,
      estimated_audience_size: 1393920,
      x_dts: {
        dts_version: "1.2",
        data_sources: ["Online Survey"],
        audience_inclusion_methodology: "Modeled",
        audience_criteria: "Rule-based: income_band=150k_plus ∩ household_type=family_with_kids ∩ content_genre=sci_fi. Modeled estimate.",
        audience_refresh: "Static"
      }
    }]
```

### Async Activation Flow

```
activate_signal(signal_agent_segment_id, destinations)
  → { task_id: "op_...", status: "pending", is_live: false }

get_operation_status(task_id)
  → { status: "completed", is_live: true, activation_key: { segment_id: "..." } }
```

Status lifecycle: `submitted → working → completed` (aligned with `@adcp/client` `ADCP_STATUS`).

Optional `webhook_url` — POST callback fires on first completed poll.

---

## AdCP Response Shapes

### `get_signals` (with DTS v1.2)

```json
{
  "message": "Found 20 signal(s)...",
  "context_id": "req_...",
  "signals": [
    {
      "signal_agent_segment_id": "sig_high_income_households",
      "signal_type": "marketplace",
      "data_provider": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
      "coverage_percentage": 0.5,
      "deployments": [{
        "type": "platform", "platform": "mock_dsp", "is_live": true,
        "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_high_income_households" },
        "activation_supported": true
      }],
      "pricing_options": [{ "pricing_model": "cpm", "cpm": 2.5, "currency": "USD" }],
      "category_type": "demographic",
      "estimated_audience_size": 1200000,
      "x_dts": {
        "dts_version": "1.2",
        "provider_name": "AdCP Signals Adaptor - Demo Provider (Evgeny)",
        "audience_id": "sig_high_income_households",
        "taxonomy_id_list": "17",
        "audience_precision_levels": ["Household"],
        "audience_size": 1200000,
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
  ]
}
```

### `activate_signal`

```json
{
  "task_id": "op_1772905632696_6d0bpy12o",
  "status": "pending",
  "signal_agent_segment_id": "sig_high_income_households",
  "deployments": [{
    "type": "platform", "platform": "mock_dsp",
    "is_live": false,
    "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_high_income_households" },
    "estimated_activation_duration_minutes": 1
  }]
}
```

### `get_operation_status`

```json
{
  "task_id": "op_1772905632696_6d0bpy12o",
  "status": "completed",
  "signal_agent_segment_id": "sig_high_income_households",
  "deployments": [{
    "type": "platform", "platform": "mock_dsp",
    "is_live": true,
    "activation_key": { "type": "segment_id", "segment_id": "mock_dsp_sig_high_income_households" },
    "estimated_activation_duration_minutes": 0
  }],
  "submittedAt": "2026-03-07T17:47:12.696Z",
  "completedAt": "2026-03-07T17:54:27.994Z"
}
```

### `get_adcp_capabilities`

```json
{
  "adcp": { "major_versions": [2, 3] },
  "supported_protocols": ["signals"],
  "signals": {
    "signal_categories": ["demographic", "interest", "purchase_intent", "geo", "composite"],
    "dynamic_segment_generation": true,
    "activation_mode": "async"
  }
}
```

---

## Dynamic Segment Generation (via brief)

| Dimension | Example phrases |
|---|---|
| `age_band` | "18-24", "millennials", "gen z", "boomers" |
| `income_band` | "affluent", "high income", "$150k", "upper middle" |
| `education` | "college", "graduate", "MBA", "university" |
| `household_type` | "families", "parents", "kids", "single", "couple" |
| `metro_tier` | "top metros", "urban", "major city", "New York" |
| `content_genre` | "sci-fi", "action", "documentary", "comedy" |
| `streaming_affinity` | "streaming", "cord cutters", "CTV", "OTT" |

Up to 6 dimensions. Audience size uses heuristic intersection against 240M US adult baseline, 50K floor.

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

`@adcp/client@^4.5.2` is a dev dependency (client-only — no server framework).

| What | Where | Why |
|---|---|---|
| `createOperationId()` | `src/utils/ids.ts` | Spec-compliant op ID: `op_{timestamp}_{nanoid}` |
| `ADCP_STATUS` | `src/domain/activationService.ts` | `submitted → working → completed` |
| `COMPATIBLE_ADCP_VERSIONS` | `src/domain/capabilityService.ts` | `major_versions: [2, 3]` |
| `SIGNALS_TOOLS` | `src/mcp/tools.ts` | Core protocol tool name reference |

**Field normalization** — SDK test suite compatibility:

| SDK sends | Normalized to |
|---|---|
| `signal_id` | `signal_agent_segment_id` |
| `destination: {platform}` | `destinations: [{type, platform}]` |
| `dv360`, `trade-desk`, `meta`, `ttd` | Internal destination IDs via `PLATFORM_MAP` |

---

## Running Locally

```bash
npm install
wrangler login
wrangler d1 migrations apply adcp-signals-db --remote
npm run dev
```

---

## Deploying

```bash
npm run deploy
wrangler d1 migrations apply adcp-signals-db --remote  # if schema changed
```

`wrangler.toml` bindings required: D1 `DB` → `adcp-signals-db`, KV `SIGNALS_CACHE`.

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

**Brief discovery with DTS labels:**
```bash
npx @adcp/client https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  get_signals '{"brief":"affluent parents in top metros who love sci-fi"}'
```

**Verify DTS on geo signal:**
```bash
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_signals","arguments":{"categoryType":"geo","limit":1}}}'
```
Look for `x_dts.data_sources: ["Geo Location"]` and `x_dts.geocode_list` containing `DMA-{code}` on Nielsen signals.

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

57 tests: ID utilities, estimation, taxonomy loader, demographic loader, rule engine validation + generation, signal catalog integrity, request validation, signal mapper, MCP tool definitions, **DTS v1.2 label generation** (12 tests covering all signal types, field derivation logic, onboarder conditional fields, and `x_dts` presence on `toSignalSummary`).

---

## License

MIT — Reference implementation for AdCP protocol development and IAB DTS v1.2 integration.