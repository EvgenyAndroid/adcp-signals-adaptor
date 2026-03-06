# Architecture Note: AdCP Signals Adaptor

## Design Philosophy

This adaptor is intentionally a **thin orchestration layer**, not a data warehouse or a signal marketplace. The protocol surface (HTTP routes, future MCP tool wrappers) does minimal work — it validates inputs, calls domain services, and maps outputs. All business logic lives in the domain layer.

## Key Separations

### Protocol ↔ Domain
Routes in `src/routes/` never import from `src/storage/` directly. They call `src/domain/` services, which own all D1 interaction. This means adding an MCP interface later is additive — new tool handlers call the same domain functions.

### Domain ↔ Data
Domain services don't know what format raw data came in. Connectors (`src/connectors/`) do all parsing and output clean intermediate types. Domain services consume those types. Swapping a CSV for a real API call only requires touching the connector.

### Taxonomy as Metadata
IAB Taxonomy nodes are **classification handles**, not commercial audience segments. A taxonomy node like "Science Fiction & Fantasy (IAB-104)" tells you *how to classify* a segment. The `CanonicalSignal` wraps that with operational context: pricing, destinations, freshness, activation status. This is intentional — the taxonomy is a stable public reference, not a vendor construct.

### Dynamic vs. Seeded
`generationMode` is a first-class signal attribute because buyers and downstream systems need to know whether a segment is a stable catalog entry (`seeded`), a pre-built combination (`derived`), or freshly synthesized from rules (`dynamic`). Freshly generated signals have a 4.0 CPM floor (vs 2.5 for seeded) and a `7d` freshness indicator.

## Storage Strategy

**D1** handles all durable state: the taxonomy tree, signal catalog, activation jobs, and audit events. D1's SQLite semantics make it easy to add JOIN-based queries later without schema migration pain.

**KV** is used only for the capabilities endpoint response, which is static per deployment and can be safely cached for 1 hour. Avoid putting signal data in KV — row-based querying requires D1.

## Audience Size Estimation

The heuristic model uses **independent probability intersection** against a 240M US adult internet-connected baseline. This is conservative (assumes independence, which narrows too aggressively in practice) but produces plausible numbers for demo purposes. A `50K` floor prevents absurdly small numbers from highly specific multi-rule segments.

All estimates carry `methodology: "heuristic_demo"` and a human-readable `note` field. Production implementations would replace this with measured panel data or modeled population counts from the actual data provider.

## Activation Lifecycle

The current implementation completes activations synchronously (submitted → processing → completed in one request). This is appropriate for a demo. A real implementation would:

1. Write `submitted` status to D1
2. Enqueue to a Cloudflare Queue
3. Return `submitted` to the caller
4. Process asynchronously in a Queue Consumer Worker
5. Update status to `completed` or `failed` with error message
6. Optionally webhook the caller

The `activation_events` table is already designed for this — it's a chronological log of status transitions per operation, suitable for audit, billing, and debug.

## Extensibility Checklist

| Change | File(s) to Touch |
|---|---|
| Add new signal category | `src/types/signal.ts`, `src/utils/estimation.ts`, `src/utils/validation.ts` |
| Add new destination | `src/utils/validation.ts`, `src/domain/capabilityService.ts` |
| Add new rule dimension | `src/domain/ruleEngine.ts`, `src/utils/estimation.ts`, `src/utils/validation.ts` |
| Replace CSV seed with real API | `src/connectors/`, `src/domain/seedPipeline.ts` |
| Add MCP tool surface | New `src/mcp/` directory, import domain services |
| Add webhook for activation | `src/domain/activationService.ts`, new Queue Consumer |
| Add per-account entitlements | `src/routes/shared.ts` (auth), `src/storage/signalRepo.ts` (access_policy filter) |
