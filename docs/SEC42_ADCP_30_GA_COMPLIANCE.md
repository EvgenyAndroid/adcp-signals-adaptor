# Sec-42 · AdCP 3.0 GA Compliance Review

**Date:** 2026-04-23
**Trigger:** AdCP 3.0 went GA (schema `$id` rolled from `/schemas/3.0.0-rc.N/` to `/schemas/3.0.0/`).
**Production version after this audit:** `3c59d2be-0a21-4cae-bb61-92d6e0975280`
**Capability cache key:** `adcp_capabilities_v18`

---

## TL;DR

We are **AdCP 3.0 GA conformant on every storyboard track that applies to a Signals-only agent.**

| Track | Pass | Fail | Status | Notes |
|---|---|---|---|---|
| **Core Protocol** | 25 | 1 | partial | Only fail is `past_start_enforcement`, which runs `create_media_buy` — a media-buy scenario. We don't expose `create_media_buy`; non-applicable. |
| **Signals** | 3 | 0 | **pass** | `capability_discovery`, `discovery`, `activation` |
| **Error Handling** | 5 | 0 | **pass** | `capability_discovery`, `error_responses`, `error_structure`, `version_negotiation`, `error_transport` |

Runner: `@adcp/client@5.13.0` via `node scripts/run-compliance.mjs --json` against production.

---

## What changed in AdCP 3.0 GA (vs the RC we shipped)

### New top-level capability fields (6)
Per `/schemas/3.0.0/protocol/get-adcp-capabilities-response.json`:

1. `request_signing` — RFC 9421 signature verification on inbound requests
2. `webhook_signing` — ed25519 / ecdsa-p256-sha256 signed outbound webhooks
3. `identity` — per-principal key isolation + compromise notification webhook
4. `compliance_testing` — deterministic control levers an agent exposes for test harnesses
5. `specialisms` — enumerated specialism tags
6. `experimental_features` — dot-separated feature ids beyond the core spec

### Changes to existing fields

- `adcp.idempotency.IdempotencySupported` now has an optional `account_id_is_opaque` field (HKDF one-way account transform).
- `signals` block adds `data_provider_domains` + `features.catalog_signals` as the GA canonical shape (our existing rich fields remain via `additionalProperties: true`).
- `webhook_signing.algorithms` enum is **ed25519** and **ecdsa-p256-sha256 only** — HMAC is NOT permitted in the GA profile. Legacy HMAC agents declare `legacy_hmac_fallback: true, supported: false`.

---

## What this agent declares (honest)

```jsonc
{
  "adcp": {
    "major_versions": [2, 3],
    "idempotency": { "supported": true, "replay_ttl_seconds": 86400 }
  },
  "supported_protocols": ["signals"],

  // Sec-42 GA additions — all honest
  "request_signing": {
    "supported": false,              // we don't verify RFC 9421 on inbound
    "covers_content_digest": "either",
    "required_for": [], "warn_for": [], "supported_for": []
  },
  "webhook_signing": {
    "supported": false,              // our HMAC-SHA256 signer isn't in GA enum
    "legacy_hmac_fallback": true     // ed25519 upgrade = Sec-43 roadmap
  },
  "identity": {
    "per_principal_key_isolation": false  // single-principal demo
  },
  "experimental_features": [
    "ucp.embedding_bridge", "ucp.concept_registry", "ucp.gts_anchors",
    "ucp.projector_simulation", "dts.label_v1_2",
    "cross_taxonomy.nine_systems",
    "analytics.query_vector", "analytics.semantic_arithmetic",
    "analytics.analogy", "analytics.neighborhood", "analytics.coverage_gaps",
    "analytics.knn_graph", "analytics.lorenz",
    "portfolio.pareto_frontier", "portfolio.greedy_marginal_reach",
    "portfolio.info_overlap", "portfolio.from_brief",
    "federation.a2a_dstillery", "federation.cross_similarity",
    "governance.data_hygiene", "governance.audit_log",
    "measurement.reach_forecaster", "measurement.lift_forecaster_mock",
    "id_resolution.nine_id_types",
    "temporal.seasonality_profiles", "temporal.decay_half_life",
    "temporal.volatility_index"
  ],

  "signals": {
    "data_provider_domains": ["samba.tv"],
    "features": { "catalog_signals": true },
    // ... existing rich fields retained for backward-compat ...
  },

  "ext": { /* UCP / DTS / id_resolution / measurement / analytics /
             federation / governance / data_hygiene — unchanged */ }
}
```

**`compliance_testing` block is deliberately NOT declared.** That field's enum is
`[force_creative_status, force_account_status, force_media_buy_status, force_session_status, simulate_delivery, simulate_budget_spend]` — deterministic-testing control levers for media-buy / creative / account lifecycle. As a Signals-only agent we don't expose any of these. Declaring an empty scenarios array is a schema violation (`minItems: 1`); declaring unrelated conformance-scenario IDs fails the enum check (which I discovered by trying).

---

## Version-string sweep

Every `3.0-rc` reference in the codebase updated to `3.0` (or `3.0 GA` in prose). Audited files:

- `wrangler.toml` · `API_VERSION`
- `src/routes/shared.ts` · `X-AdCP-Version` response header
- `src/index.ts` · `/health` response
- `src/mcp/server.ts` · initialize handshake `serverInfo.version`
- `src/routes/openApi.ts` · OpenAPI `info.version`
- `src/routes/privacy.ts` · privacy page copy
- `src/routes/demo.ts` · sidebar footer + dev-kit endpoints panel
- `src/routes/federationEndpoints.ts` · agent registry `protocols` array (all 6 agents)
- `src/domain/capabilityService.ts` · `ext.governance.audience_bias_governance_schema.version`

Verification:
```
$ curl /health                           → {"status":"ok","version":"3.0"}
$ curl -D - /health | grep X-AdCP       → X-AdCP-Version: 3.0
$ curl /agents/registry | jq agents[0].protocols
                                          → ["adcp_3.0", "ucp_0.2", "dts_1.2", ...]
```

---

## What passed + what didn't, in detail

### Core Protocol (25 / 26)

Passing scenarios:
- `capability_discovery/protocol_discovery` — response validates against GA schema, context echoed
- `deterministic_testing/capability_discovery` + controller_validation + deterministic_account + deterministic_media_buy + deterministic_creative + deterministic_session + deterministic_delivery + deterministic_budget (8)
- `idempotency/capability_discovery` + missing_key + replay_same_payload + key_reuse_conflict + fresh_key_new_resource + verify_media_buy_count (6)
- `schema_validation/capability_discovery` + schema_compliance + format_id_reconciliation + temporal_validation + past_start_reject_path + past_start_adjust_path (6)
- `webhook_emission/capability_discovery` + idempotency_key_presence + idempotency_key_stability + signature_validity (4)

The one failure:
- `schema_validation/past_start_enforcement` — the runner attempts a `create_media_buy` with a past `start_time` and requires either rejection or acceptance-with-adjustment. We **don't implement `create_media_buy`** (it's a media-buy tool; we're a Signals agent per the `supported_protocols: ["signals"]` declaration). The scenario is non-applicable to our agent class.

### Signals (3 / 3) ✓
- `signals_baseline/capability_discovery` — GA schema passes
- `signals_baseline/discovery` — `get_signals` returns valid catalog entries with `deployments`, `pricing_options`, `signal_id.source`
- `signals_baseline/activation` — `activate_signal` returns `operation_id`, poll via `get_operation_status`

### Error Handling (5 / 5) ✓
- `error_compliance/capability_discovery` — GA schema passes after Sec-42 fixes
- `error_compliance/error_responses` — 400/401/404 shaped per spec
- `error_compliance/error_structure` — `error`, `code`, optional `details`
- `error_compliance/version_negotiation` — 2 + 3 in `adcp.major_versions` array
- `error_compliance/error_transport` — HTTP status + JSON-RPC error codes align

---

## Known gaps (deliberate, roadmap)

1. **`webhook_signing.supported: false`.** Our webhook signer uses HMAC-SHA256 (`src/domain/webhookSigning.ts`). GA's `adcp/webhook-signing/v1` profile permits only ed25519 + ecdsa-p256-sha256. Declared `legacy_hmac_fallback: true` honestly. Ed25519 upgrade is Sec-43 scope.

2. **`request_signing.supported: false`.** We gate inbound mutating requests on bearer auth + HTTPS. RFC 9421 inbound-signature verification is Sec-43 scope.

3. **`identity.per_principal_key_isolation: false`.** Single-principal demo (one `DEMO_API_KEY`). Multi-tenant key isolation is out of scope for a reference implementation.

4. **`compliance_testing` block omitted.** Non-applicable to Signals-only agents.

5. **`past_start_enforcement` scenario fail.** Non-applicable — we don't expose `create_media_buy`.

---

## Commit + deploy trail

| Action | Commit / version |
|---|---|
| Branch | `sec-42-adcp-30-ga` |
| `@adcp/client` upgraded | `5.6.0 → 5.13.0` |
| Capability cache key | `v16 → v18` (v17 had bad `compliance_testing` enum values; v18 omits it) |
| Prod version | `3c59d2be-0a21-4cae-bb61-92d6e0975280` |
| Compliance run | `@adcp/client@5.13.0`, 34 scenarios, 33 pass, 1 non-applicable |

---

## Public verification URLs

- Health: https://adcp-signals-adaptor.evgeny-193.workers.dev/health
- Capabilities: https://adcp-signals-adaptor.evgeny-193.workers.dev/capabilities
- OpenAPI: https://adcp-signals-adaptor.evgeny-193.workers.dev/openapi.json
- Agents registry: https://adcp-signals-adaptor.evgeny-193.workers.dev/agents/registry

Anyone can reproduce the compliance run with:
```bash
API_KEY=demo-key-adcp-signals-v1 \
AGENT_URL=https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
npm run compliance
```
