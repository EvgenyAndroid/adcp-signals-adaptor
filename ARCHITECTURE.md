# Architecture: AdCP Signals Adaptor

## Design Philosophy

Thin protocol-compliant orchestration layer. Routes validate and dispatch — all business logic in domain services. Both HTTP and MCP surfaces call the same domain functions. DTS v1.2 labels generated centrally in the mapper. No logic duplication.

---

## Layer Map

```
HTTP / MCP request
       │
       ▼
src/index.ts                    Router + auth + CORS + auto-seed
       │
       ├── src/routes/               HTTP handlers (validate → domain → respond)
       └── src/mcp/server.ts         JSON-RPC 2.0 dispatcher
                                     Tool alias resolution (get_task_status → get_operation_status)
                │
                ▼
       src/domain/
         signalService.ts            search, relevance ranking, brief parsing, proposals + D1
         activationService.ts        async activate, lazy state machine, webhook
         capabilityService.ts        capabilities (KV-cached 1hr)
         ruleEngine.ts               rule validation + deterministic segment generation
         signalModel.ts              base seeded + derived catalog (33 signals)
         enrichedSignalModel.ts      Census ACS + DMA + cross-taxonomy (16 signals)
         seedPipeline.ts             D1 ingestion — 4-phase, idempotent
                │
                ├── src/connectors/       Raw data parsers
                │
                ├── src/mappers/
                │     signalMapper.ts     CanonicalSignal → AdCP response shape
                │                        buildDtsLabel()  → x_dts DTS v1.2 label
                │
                └── src/storage/
                      signalRepo.ts       signal CRUD + search
                      activationRepo.ts   activation jobs + webhook state
```

---

## Tool Surface (4 tools — AdCP spec compliant)

`generate_custom_signal` deliberately not implemented. Correct AdCP pattern:

1. `get_signals(signal_spec)` — brief generates proposals inline, persisted to D1 on generation
2. `activate_signal` — creates unactivated proposals lazily on activation

### Parameter name alignment

All tools use canonical AdCP spec parameter names. Aliases accepted for backward compatibility:

| Spec name | Alias(es) accepted |
|---|---|
| `signal_spec` | `brief` |
| `deliver_to` | `destinations`, `deployments`, `destination` |
| `max_results` | `limit` |
| `signal_agent_segment_id` | `signal_id`, `signalId` |
| `task_id` | `operationId` |

### Tool name aliases

`get_operation_status` is the canonical tool name. `get_task_status` and `get_signal_status` are resolved via `TOOL_ALIASES` map in `handleToolCall()` before `getToolByName()` validation.

---

## Relevance Ranking

When `signal_spec` is present, `signalService.ts` fetches up to 200 signals (4× `max_results`), scores each via `rankByRelevance()`, then slices to `max_results`.

### Scoring (`rankByRelevance`)

```
+4  per brief keyword found in signal name
+2  per brief keyword found in signal description
+3  category bonus (if brief implies a category matching signal.categoryType)
+1  if generationMode === "derived"
+2  if generationMode === "dynamic"
tie-break: larger estimatedAudienceSize first
```

Stop words filtered. Keywords extracted from brief after lowercasing and stripping punctuation.

Category hints:

| Category | Brief keywords that trigger bonus |
|---|---|
| `demographic` | age, income, education, household, family, senior, adult... |
| `interest` | fan, viewer, streaming, content, genre, movie, gaming... |
| `purchase_intent` | buy, purchase, intent, shopping, luxury, goods, brand... |
| `geo` | dma, city, metro, market, area, region, national... |
| `composite` | affluent, high income, premium, professional, educated... |

### Example: "high income households interested in luxury goods"

Keywords: `high`, `income`, `households`, `interested`, `luxury`, `goods`

| Signal | Score | Why |
|---|---|---|
| Graduate Educated High Income Households (ACS) | 18 | name: high+4, income+4, households+4; desc: luxury+2; derived+1 |
| High Income Households | 12 | name: high+4, income+4, households+4 |
| High Income Entertainment Enthusiasts | 9 | name: high+4, income+4; derived+1 |
| Action Movie Fans | 0 | no keyword overlap |

---

## Deterministic Dynamic Signal IDs

`dynamicSignalId(name, rulesKey)` in `src/utils/ids.ts`:

```typescript
// rulesKey = JSON.stringify(rules sorted by dimension)
// Hash = djb2-style 32-bit → 8-char hex
function deterministicHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}
```

Same brief → same rules → same hash → same `signal_agent_segment_id`. Upsert hits existing row, no duplicates.

---

## DTS v1.2 Implementation

### What is DTS v1.2

IAB Tech Lab Data Transparency Standard v1.2 (April 2024 "Privacy Update") — ~25 standardized fields across four sections: Core, Audience Details, Onboarder Details (conditional), Privacy.

### Extension mechanism

AdCP v2.5+ explicitly supports `x_` prefixed fields. `x_dts` is non-breaking — conformance tests validate only required fields.

### `buildDtsLabel()` derivation logic

**`inferDataSources(signal)`** — maps `signal.sourceSystems` + `rawSourceRefs`:

| Source systems / rawSourceRefs | DTS `data_sources` |
|---|---|
| `"census"` / `rawSourceRefs` starts with `"ACS_"` | `["Public Record: Census"]` |
| `"dma"`, `"geo"`, `"nielsen"` | `["Geo Location"]` |
| `"taxonomy_bridge"`, `"content"` | `["Web Usage", "App Behavior"]` |
| `"acr"`, `"ctv"`, `"stb"` | `["TV OTT or STB Device"]` |
| `"demographics"`, `"interests"`, `"rule_engine"`, `"brief_generator"` | `["Online Survey"]` |

**`inferInclusionMethodology(signal)`**:

| Condition | Methodology |
|---|---|
| ACR/CTV | `"Observed/Known"` |
| `rawSourceRefs` has `ACS_` | `"Derived"` |
| DMA/Nielsen source | `"Observed/Known"` |
| Taxonomy bridge | `"Derived"` |
| `generationMode === "derived"` | `"Derived"` |
| Fallback | `"Modeled"` |

**`inferRefreshCadence(signal)`**: ACR → `"Weekly"`, Census/DMA → `"Annually"`, all others → `"Static"`.

**`buildGeocodeList(signal)`**: Always starts `"USA"`. DMA codes appended from `rawSourceRefs` AND `signal.geography` (e.g. `"USA|DMA-501"`).

**Onboarder section**: Populated with `"Postal / Geographic Code"` / `"Geography"` when `data_sources` includes `"Public Record: Census"`. `"N/A"` otherwise.

### TypeScript types (`src/types/api.ts`)

Full `DtsV12Label` interface with all DTS 1.2 enum types: `DtsRefreshCadence`, `DtsDataSource`, `DtsInclusionMethodology`, `DtsPrecisionLevel`, `DtsPrivacyMechanism`, `DtsAudienceScope`, `DtsIdType`. `SignalSummary` carries `x_dts?: DtsV12Label`.

---

## Async Activation Pattern

```
activate_signal()
  1. Validate signal (catalog or persisted proposal)
  2. Create activation_jobs row (status: "submitted")
  3. Return { task_id, status: "pending", destinations: [{is_live: false}] }

get_operation_status(task_id)  ←  first poll
  1. Load job row
  2. Lazy state machine:
     "submitted"   → "working"
     "working"     → "completed"
     "processing"  → treated as "working" (legacy alias)
  3. If webhook_url set and not yet fired: POST payload, mark webhook_fired = 1
  4. Return { status: "completed", destinations: [{is_live: true, activation_key: {...}}] }
```

Status aligned with `@adcp/client` `ADCP_STATUS`. `destinations` field name in response (not `deployments`).

---

## @adcp/client SDK

`@adcp/client@^4.5.2` dev dependency — client-only.

| Import | Usage |
|---|---|
| `createOperationId()` | `ids.ts` — `op_{timestamp}_{nanoid}` format, local fallback |
| `ADCP_STATUS` | `activationService.ts` — `"working"` not `"processing"` |
| `COMPATIBLE_ADCP_VERSIONS` | `capabilityService.ts` — `major_versions: [2, 3]` |
| `SIGNALS_TOOLS` | `mcp/tools.ts` — core tool name reference |

---

## D1 Schema

```sql
taxonomy_nodes      -- IAB Audience Taxonomy 1.1 tree
signals             -- 49 rows catalog + test-signal-001 fixture = 50
signal_rules        -- rules for derived/dynamic signals
source_records      -- raw loader reference records
activation_jobs     -- async tasks + webhook_url + webhook_fired
activation_events   -- audit log per status transition
```

Migrations: `0001_initial_schema.sql`, `0002_webhook_taskid.sql` (webhook_url, webhook_fired columns).

---

## Extensibility

| Feature | Files | Notes |
|---|---|---|
| CTV/ACR signals (Samba core) | `enrichedSignalModel.ts` + `sourceSystems: ["acr"]` | Auto-maps to `TV OTT or STB Device` + `Observed/Known` + `Weekly` |
| Exclusion/negative targeting | `ruleEngine.ts` — add `exclude` operator | No DTS change |
| Cross-provider composition | New `compose_signals` route | Merge `taxonomy_id_list` from both parents |
| Performance feedback | `POST /signals/:id/feedback` + D1 column | Closes activation → optimization loop |
| `iab_techlab_compliant: "Yes"` | `signalMapper.ts` constant | Complete `datalabel.org` audit program |
| Formal AdCP `x_dts` spec PR | `adcontextprotocol/adcp` repo | Add to `static/schemas/signals/signal.json` |