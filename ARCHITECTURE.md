# Architecture Note: AdCP Signals Adaptor

## Design Philosophy

Thin protocol-compliant orchestration layer. Routes validate and dispatch — all business logic in domain services. Both HTTP and MCP surfaces call the same domain functions. No logic duplication.

## Layer Map

```
HTTP / MCP request
       │
       ▼
src/index.ts              Router + auth + CORS + auto-seed
       │
       ├── src/routes/         HTTP handlers (validate → domain → respond)
       └── src/mcp/server.ts   JSON-RPC 2.0 dispatcher (4 tools)
                │
                ▼
       src/domain/
         signalService.ts        search, brief parsing, proposal gen + D1 persistence
         activationService.ts    async activate, lazy state machine, webhook
         capabilityService.ts    capabilities (KV-cached 1hr)
         ruleEngine.ts           rule validation + segment generation
         signalModel.ts          base seeded + derived catalog (33 signals)
         enrichedSignalModel.ts  Census ACS + DMA + cross-taxonomy (16 signals)
         seedPipeline.ts         D1 ingestion — 4-phase, idempotent
                │
                ├── src/connectors/     Raw data parsers
                ├── src/mappers/        Canonical → AdCP response shape
                └── src/storage/        D1 (signalRepo, activationRepo)
```

## Tool Surface (4 tools — AdCP spec compliant)

`generate_custom_signal` was deliberately not implemented as a standalone tool. The correct AdCP pattern is:

1. **`get_signals(brief)`** — natural language brief drives inline custom segment proposals. Proposals are persisted to D1 at generation time so their IDs are stable.
2. **`activate_signal`** — if the ID belongs to a proposal (not yet live), the segment is created on activation. No separate creation step.

This matches how real signal providers work: discovery and proposal happen in one step, commitment (activation) in a second.

## Async Activation Pattern

```
activate_signal()
  1. Validate signal exists (catalog or persisted proposal)
  2. Create activation_jobs row (status: "submitted")
  3. Return { task_id, status: "pending" } immediately
  ↓
get_operation_status(task_id)
  1. Load job row
  2. Lazy state machine:
     submitted → processing → completed (on first poll)
  3. If webhook_url present and not fired:
     POST payload to webhook_url
     Mark webhook_fired = 1
  4. Return { status, deployments with is_live: true }
```

No Cloudflare Queues or Durable Objects needed for demo. The lazy state machine on poll is a clean pattern that correctly models async behavior without infrastructure complexity.

## Brief Parsing → Proposal Generation

`signalService.ts` extracts targeting dimensions from free-form text using keyword detection:

```
"affluent parents in top metros who love sci-fi"
  → income_band: 150k_plus    (affluent)
  → household_type: family_with_kids    (parents)
  → metro_tier: top_10, top_25    (top metros)
  → content_genre: sci_fi    (sci-fi)
```

Rules are validated, passed to `ruleEngine.ts`, which generates a `CanonicalSignal` and estimates audience size via independent probability intersection (heuristic, 240M baseline, 50K floor). The signal is upserted to D1 immediately — the proposal ID in the response is a real D1 record, activatable instantly.

Proposals appear in `get_signals` response under `proposals[]`, distinct from `signals[]`. They have `signal_type: "custom"` and `is_live: false` on all deployments.

## Webhook Delivery

When `webhook_url` is provided to `activate_signal`:
- URL stored in `activation_jobs.webhook_url`
- On first `get_operation_status` poll that completes the job, `fireWebhook()` is called
- Payload: `{ task_id, status: "completed", signal_agent_segment_id, deployments }`
- `webhook_fired` flag set to prevent duplicate delivery
- Non-fatal: webhook failure is logged but doesn't fail the status call

## AdCP Protocol Compliance (v2.6)

### Capabilities envelope
```
adcp.major_versions + supported_protocols + signals{} nested object
```

### Signal object
- `signal_type`: `"marketplace"` (seeded/derived) or `"custom"` (dynamic/proposals)
- `coverage_percentage`: `(estimatedAudienceSize / 240M) * 100`, capped at 99
- `deployments[]`: discriminated union `type: "platform" | "agent"`, `activation_key` when `is_live: true`
- `pricing_options[]`: array with `pricing_option_id`, `pricing_model`, `cpm`, `currency`

### Activation response
Top-level: `task_id`, `status: "pending"`, `signal_agent_segment_id`, `deployments[]`

### Operation status response
Top-level: `task_id`, `status`, `signal_agent_segment_id`, `deployments[]` (with `is_live: true` when completed)

### Input normalization (activate_signal)
Accepts all field name variants the spec and test runners send:
- `destinations: [{ type, platform, account_id }]` — spec array
- `deployments: [{ type, platform }]` — alternate name
- `destination: { platform }` — singular object
- `destination: "mock_dsp"` — legacy string

External platform names mapped to internal IDs: `trade-desk`, `ttd`, `dv360`, `index-exchange`, `liveramp`, etc.

## Data Sources

### US Census ACS 2022 5-Year Estimates
Tables B01001 (age) × B19001 (income) × B15003 (education) × B11001 (household). MOE combines in quadrature for aggregated estimates. Signals carry `rawSourceRefs` with ACS table codes.

### Nielsen DMA Universe 2023-24
Top 50 DMAs with official codes (DMA-501 = New York), ranks, TV household counts, and percent-of-US. Geography field carries `DMA-{code}` identifiers matching industry conventions.

### IAB Audience × Content Taxonomy Bridge
Semantic bridge between IAB Audience Taxonomy 1.1 and Content Taxonomy 3.0. Three mapping types: strong (bidirectional), moderate (directional), contextual. Cross-taxonomy signals carry `rawSourceRefs` with both taxonomy node IDs.

## Seed Pipeline Sequence

```
runSeedPipeline()
  1. Parse IAB Taxonomy 1.1 TSV → taxonomy_nodes
  2. Insert SEEDED_SIGNALS (25)
  3. Insert DERIVED_SIGNALS (6)
  4. Insert ALL_ENRICHED_SIGNALS (16: 5 ACS + 6 DMA + 5 cross-taxonomy)

Total: 49 signals + test-signal-001 fixture = 50 D1 rows
Force re-seed: POST /seed (requires ENVIRONMENT=development)
```

## D1 Schema

```
taxonomy_nodes      — IAB taxonomy tree
signals             — canonical signal catalog (all 50)
signal_rules        — rules for derived/dynamic signals
source_records      — raw loader reference records
activation_jobs     — async activation tasks (+ webhook_url, webhook_fired)
activation_events   — audit log per task transition
```

Migration history:
- `0001_initial_schema.sql` — initial 6-table schema
- `0002_webhook_taskid.sql` — added `webhook_url`, `webhook_fired` to `activation_jobs`

## KV Cache

`SIGNALS_CACHE` KV namespace used only for capabilities response (key: `adcp_capabilities_v3`, TTL: 1hr). All queryable data stays in D1. Increment cache key version when capabilities change.

## @adcp/client SDK Integration

`@adcp/client@^4.5.2` is a dev dependency. It is a **client-only library** with no server-side MCP framework.

### What we use

- **`createOperationId()`** → `src/utils/ids.ts` — replaces local `operationId()`. Format: `op_{timestamp}_{nanoid}` (e.g. `op_1772905632696_6d0bpy12o`). Falls back to local impl if Worker bundler can't resolve the require.

- **`ADCP_STATUS` constants** → status values aligned in `activationService.ts`:
  - `"submitted"` → `"working"` → `"completed"` (SDK uses `"working"`, not `"processing"`)
  - `OperationStatus` type extended with `"working"`, `"canceled"`, `"rejected"`

- **`COMPATIBLE_ADCP_VERSIONS`** → `['v2.5', 'v2.6', 'v3', ...]` informs `major_versions: [2, 3]` in capabilities

- **`SIGNALS_TOOLS`** → `['get_signals', 'activate_signal']` confirms core protocol tools (we also expose `get_adcp_capabilities` + `get_operation_status`)

### What we don't use

No server framework, no MCP dispatcher, no type generation. `src/mcp/server.ts` stays hand-rolled — it's 393 lines covering the full Streamable HTTP / JSON-RPC 2.0 lifecycle with all edge cases we need.

### SDK test suite field normalization

The `@adcp/client` conformance test suite sends different field names than the spec. Handled in `callActivateSignal()`:

```typescript
// All accepted aliases for signal ID
const signalId = args["signal_agent_segment_id"] ?? args["signal_id"] ?? args["signalId"]

// All accepted destination shapes
const raw = args["destinations"] ?? args["deployments"] ?? args["destination"]
// handles: array, singular object, legacy string

// External platform → internal ID
const PLATFORM_MAP = { dv360: "mock_dsp", "trade-desk": "mock_dsp",
  meta: "mock_dsp", liveramp: "mock_cleanroom", ... }
```

### Known issue (fixed)

The `"processing"` status was written directly by old code before SDK alignment. The lazy state machine now handles it:
```
"submitted" → "working"  (on first poll)
"processing" → "working"  (legacy alias, same poll)  
"working" → "completed"   (on same poll)
```

## Extensibility

| Change | Files |
|---|---|
| Add real data provider | `src/connectors/` + `src/enrichedSeedData.ts` + `src/domain/enrichedSignalModel.ts` |
| Add CTV/ACR signal type | `src/types/signal.ts` + `src/domain/enrichedSignalModel.ts` |
| Add exclusion/negative targeting | `src/domain/ruleEngine.ts` (add `exclude` operator) |
| Add real async activation | `activationService.ts` + Cloudflare Queue + Consumer Worker |
| Replace hand-rolled MCP | No server utilities in `@adcp/client` — Worker MCP server stays as-is |
| Add A2A transport | New `src/a2a/` directory, same domain services |
| Add per-account entitlements | `src/routes/shared.ts` + `accessPolicy` filter in `signalRepo.ts` |