# Architecture Note: AdCP Signals Adaptor

## Design Philosophy

Thin protocol-compliant orchestration layer. Routes validate and dispatch — all business logic lives in domain services. Both HTTP and MCP surfaces call the same domain functions with no duplication.

## Layer Map

```
HTTP / MCP request
       │
       ▼
src/index.ts              Router + auth + CORS + auto-seed
       │
       ├── src/routes/         HTTP handlers (validate → domain → respond)
       └── src/mcp/server.ts   JSON-RPC 2.0 dispatcher
                │
                ▼
       src/domain/
         signalService.ts        search, generate, destinations filter
         activationService.ts    activate, get operation status
         capabilityService.ts    capabilities (KV-cached 1hr)
         ruleEngine.ts           rule validation + segment generation
         signalModel.ts          base seeded + derived catalog (33 signals)
         enrichedSignalModel.ts  Census ACS + DMA + cross-taxonomy (16 signals)
         seedPipeline.ts         D1 ingestion — runs all catalogs in sequence
                │
                ├── src/connectors/     Raw data parsers (no protocol knowledge)
                │     iabTaxonomyLoader.ts
                │     demographicLoader.ts
                │     interestLoader.ts
                │     geoLoader.ts
                │     censusLoader.ts        ACS 5-yr estimates parser + MOE handling
                │     dmaLoader.ts           Nielsen DMA parser + tier aggregation
                │     taxonomyBridgeLoader.ts  Audience 1.1 × Content CT3 bridge
                │
                ├── src/mappers/        Canonical model → AdCP response shape
                └── src/storage/        D1 queries (signalRepo, activationRepo)
```

## Data Sources

### IAB Audience Taxonomy 1.1
Semantic classification backbone for all signals. Taxonomy nodes are metadata handles, not commercial segments. `CanonicalSignal` wraps taxonomy IDs with operational context: pricing, destinations, freshness, activation status.

### US Demographics Sample
Hand-curated 25-row CSV for base demographic signals. Age × income × education × household × geography buckets.

### Entertainment Affinity (MovieLens Genre Structure)
Genre affinity scores derived from MovieLens genre taxonomy. Not real user data — models genre interest profiles by demographic cross-section.

### US Census ACS 2022 5-Year Estimates
Real public data from Census Bureau. Tables used:
- **B01001** — Age/sex by single year (source for age bands)
- **B19001** — Household income in past 12 months (source for income brackets)
- **B15003** — Educational attainment (source for education segments)
- **B11001** — Household type by presence of own children (source for household types)

Census signals include margin of error at 90% confidence, ACS table references, and data year. This replaces vibes-based size estimates with defensible public statistics.

### Nielsen DMA Universe 2023-24
Nielsen Designated Market Areas are the standard US advertising geographic unit. This data is public and widely used for media planning. Geography fields carry proper `DMA-{code}` identifiers (e.g., DMA-501 for New York) matching industry conventions. Signals include TV household counts and percent-of-US coverage.

### IAB Audience × Content Taxonomy Bridge
Semantic bridge between IAB Audience Taxonomy 1.1 and IAB Content Taxonomy 3.0. Three mapping types:
- **Strong** — Direct genre/topic correspondence (bidirectional)
- **Moderate** — Audience over-indexes on content type (directional)
- **Contextual** — Behavioral correlation without direct semantic match

Cross-taxonomy signals are composites where audience membership is validated by content consumption — the most advanced signal type in AdCP's architecture.

## AdCP Protocol Compliance (v2.6)

### Capabilities response envelope
```
adcp.major_versions + supported_protocols + signals{} nested object
```

### Signal object fields (get_signals)
- `signal_agent_segment_id` — stable string ID
- `signal_type` — `"marketplace"` (seeded/derived) or `"custom"` (dynamic)
- `data_provider` — provider attribution string
- `coverage_percentage` — `(estimatedAudienceSize / 240M) * 100`, capped at 99
- `deployments[]` — discriminated union: `type: "platform"` or `type: "agent"`
  - When `is_live: true`: `activation_key: { type: "segment_id", segment_id }` included
- `pricing_options[]` — array with `pricing_option_id`, `pricing_model`, `cpm`, `currency`

### Activation response (activate_signal)
Top-level: `message`, `context_id`, `deployments[]` only.

Deployment objects preserve input type. Agent deployments: `agent_url` + `adcp_{signalId}` segment ID. Platform deployments: `platform` + `{platform}_{signalId}` segment ID.

Input normalization accepts: `destinations[]`, `deployments[]`, `destination{}` (object), `destination` (string). External platform names (trade-desk, ttd, dv360, liveramp) map to internal IDs via PLATFORM_MAP.

### destinations filter in get_signals
When `destinations: [{ type: "platform", platform }]` is passed, each signal's deployments are filtered to matching platforms and signals with zero matches are dropped. If only `type: "agent"` destinations are passed, filter is skipped (agent type = provider itself, all deployments valid).

## Seed Pipeline Sequence

```
runSeedPipeline()
  1. Parse IAB Taxonomy 1.1 TSV → upsert taxonomy_nodes
  2. Insert SEEDED_SIGNALS (25 base signals)
  3. Insert DERIVED_SIGNALS (6 composite signals)
  4. Insert ALL_ENRICHED_SIGNALS (16 signals: 5 ACS + 6 DMA + 5 cross-taxonomy)

Total: 49 signals (+ test-signal-001 fixture = 50 entries)
Idempotent: skips if signals already present (unless force=true)
```

## Key Implementation Decisions

**ACS MOE handling.** Census margins of error combine in quadrature when aggregating across geographies (standard ACS methodology). The `censusLoader.ts` implements `Math.sqrt(sum of squared MOEs)` for combined estimates.

**DMA tier classification.** Nielsen's official tiers are used: top_10, top_25, top_50, top_100. The `dmaLoader.ts` preserves the rank field so downstream consumers can implement custom tier thresholds.

**Cross-taxonomy bridge directionality.** Bidirectional mappings (`bidirectional: true`) mean the content consumption signal implies audience membership — useful for probabilistic audience extension. Directional mappings only flow from audience → content.

**conformance test fixture.** `test-signal-001` has a stable hardcoded ID (bypassing the `sig_` prefix convention) for AdCP conformance test runners that use static IDs rather than dynamic ones from `get_signals`.

**KV cache key versioning.** Capabilities cache key includes a version suffix (`adcp_capabilities_v3`). Increment this when capabilities change to force cache invalidation without waiting for TTL.

## Extensibility

| Change | Files to touch |
|---|---|
| Add real ACS data via Census API | `src/connectors/censusLoader.ts` + `src/enrichedSeedData.ts` |
| Add real Nielsen DMA data | `src/connectors/dmaLoader.ts` + `src/enrichedSeedData.ts` |
| Add IAB Content Taxonomy 3.0 full bridge | `src/connectors/taxonomyBridgeLoader.ts` + `src/enrichedSeedData.ts` |
| Add CTV/ACR signal category | `src/types/signal.ts` + `src/domain/enrichedSignalModel.ts` |
| Add exclusion signals (negative targeting) | `src/domain/ruleEngine.ts` (add `exclude` operator) |
| Add real DSP activation | `src/domain/activationService.ts` + Cloudflare Queue |
| Add A2A transport | New `src/a2a/` directory, same domain services |
| Add per-account entitlements | `src/routes/shared.ts` (auth) + `accessPolicy` filter in `signalRepo.ts` |
