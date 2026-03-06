# Architecture Note: AdCP Signals Adaptor

## Design Philosophy

Thin protocol-compliant orchestration layer. Routes validate and dispatch — all business logic lives in domain services. Both HTTP and MCP surfaces call the same domain functions with no duplication.

## Layer Map

```
HTTP / MCP request
       │
       ▼
src/index.ts          Router + auth + CORS + auto-seed
       │
       ├── src/routes/          HTTP handlers (validate → call domain → respond)
       └── src/mcp/server.ts    JSON-RPC 2.0 dispatcher (tools/list, tools/call)
                │
                ▼
       src/domain/              All business logic
         signalService.ts       search, generate, destinations filter
         activationService.ts   activate, get operation status
         capabilityService.ts   capabilities (KV-cached 1hr)
         ruleEngine.ts          rule validation + segment generation
         signalModel.ts         seeded + derived signal catalog (33 signals)
         seedPipeline.ts        D1 ingestion (runs once, idempotent)
                │
                ├── src/connectors/    Raw data parsers (no protocol knowledge)
                ├── src/mappers/       Canonical model → AdCP response shape
                └── src/storage/      D1 queries (signalRepo, activationRepo)
```

## AdCP Protocol Compliance (v2.6)

### Capabilities response
```
adcp.major_versions + supported_protocols + signals{} envelope
```

### Signal object (get_signals)
Required fields: `signal_agent_segment_id`, `signal_type`, `data_provider`, `coverage_percentage`, `deployments[]`, `pricing_options[]`

Deployment objects use discriminated union: `type: "platform"` or `type: "agent"`. When `is_live: true`, `activation_key: { type: "segment_id", segment_id }` is included.

Pricing uses `pricing_options` array with `pricing_option_id`, `pricing_model`, `cpm`, `currency`.

### Activation response (activate_signal)
Top-level: `message`, `context_id`, `deployments[]` only. No status/operationId at top level.

Deployment objects preserve input type — agent deployments return `agent_url` and `adcp_{signalId}` segment ID; platform deployments return `platform` and `{platform}_{signalId}` segment ID.

Input normalization accepts all field name variants: `destinations[]`, `deployments[]`, `destination{}` (object), `destination` (string), plus external platform name mapping (trade-desk → mock_dsp, etc.).

## Key Design Decisions

**Taxonomy as metadata, not segments.** IAB taxonomy nodes are classification handles. `CanonicalSignal` wraps them with operational context (pricing, destinations, freshness, activation status).

**`coverage_percentage` derivation.** Computed as `(estimatedAudienceSize / 240M) * 100`, capped at 99. All estimates carry `heuristic_demo` methodology marker.

**`signal_type` classification.** `seeded` and `derived` → `"marketplace"`. `dynamic` (rule engine output) → `"custom"`. No `"owned"` type in this demo.

**Destinations filtering in get_signals.** When `destinations: [{ type: "platform", platform }]` is passed, each signal's deployments array is filtered to matching platforms only. Signals with zero matches are dropped. If only `type: "agent"` destinations are passed, filter is skipped (agent = the provider itself, supports all deployments).

**KV for capabilities only.** Capabilities are static per deployment — KV cache avoids unnecessary D1 reads. All queryable data stays in D1.

**Auto-seed on first request.** `ctx.waitUntil()` runs seed pipeline in background. Idempotent — skips if signals already present. Force via `POST /seed`.

**Platform name normalization.** External DSP names (trade-desk, ttd, dv360, index-exchange, liveramp) are mapped to internal destination IDs at the MCP layer. REST API still requires internal IDs.

## Conformance Test Fixture

`test-signal-001` is a stable fixture signal with a hardcoded ID (bypasses the `sig_` prefix convention) included specifically for AdCP conformance test runners that use static segment IDs rather than dynamic ones from `get_signals`.

## Extensibility

| Change | Touch |
|---|---|
| Add real data provider | `src/connectors/` + `src/domain/seedPipeline.ts` |
| Add new signal category | `src/types/signal.ts`, `src/utils/estimation.ts`, `src/utils/validation.ts` |
| Add new destination | `src/utils/validation.ts`, `src/domain/capabilityService.ts`, `src/mcp/server.ts` PLATFORM_MAP |
| Add MCP auth (API key per client) | `src/mcp/server.ts` handleInitialize |
| Real async activation | Replace synchronous status updates in `activationService.ts` with Cloudflare Queue + Consumer Worker |
| Add A2A transport | New `src/a2a/` directory, same domain services |
