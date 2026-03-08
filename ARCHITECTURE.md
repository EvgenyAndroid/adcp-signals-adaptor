# Architecture: AdCP Signals Adaptor

## Design Philosophy

Thin protocol-compliant orchestration layer. Routes validate and dispatch — all business logic in domain services. Both HTTP and MCP surfaces call the same domain functions. DTS v1.2 and UCP labels generated centrally in the mapper. No logic duplication across protocol layers.

---

## Layer Map

```
HTTP / MCP request
       │
       ▼
src/index.ts                    Router + auth + CORS + auto-seed
       │
       ├── src/routes/               HTTP handlers (validate → domain → respond)
       │     capabilities.ts         GET /capabilities
       │     searchSignals.ts        POST /signals/search
       │     activateSignal.ts       POST /signals/activate
       │     getOperation.ts         GET /operations/:id
       │     getEmbedding.ts         GET /signals/:id/embedding  ← UCP
       │
       └── src/mcp/server.ts         JSON-RPC 2.0 dispatcher
             5 tools: get_adcp_capabilities, get_signals, activate_signal,
                      get_operation_status, get_similar_signals
             Tool alias resolution (get_task_status → get_operation_status)
                │
                ▼
       src/domain/
         signalService.ts            search, relevance ranking, brief parsing, proposals
         activationService.ts        async activate, lazy state machine, webhook
         capabilityService.ts        capabilities + UCP block (KV-cached 1hr)
         ruleEngine.ts               deterministic segment generation
         signalModel.ts              base seeded + derived catalog (33 signals)
         enrichedSignalModel.ts      Census ACS + DMA + cross-taxonomy (16 signals)
         seedPipeline.ts             D1 ingestion — 4-phase, idempotent
                │
                ├── src/connectors/       Raw data parsers (IAB TSV, Census CSV, DMA CSV)
                │
                ├── src/mappers/
                │     signalMapper.ts     CanonicalSignal → AdCP response shape
                │                        buildDtsLabel()       → x_dts (DTS v1.2)
                │                        toUcpHybridPayload()  → x_ucp (UCP bridge)
                │
                ├── src/ucp/              UCP Embedding Bridge (new in v1.1)
                │     vacDeclaration.ts   VAC constants + capability declaration
                │     embeddingEngine.ts  Phase 1 pseudo + Phase 2 LLM shell adapter
                │     ucpMapper.ts        assembles UCP HybridPayload
                │     privacyBridge.ts    DTS privacy → UCP privacy
                │     legacyFallback.ts   AdCP IDs → UCP legacy_fallback
                │
                └── src/storage/
                      signalRepo.ts       signal CRUD + search
                      activationRepo.ts   activation jobs + webhook state
                      KV: capabilities (1hr), embeddings (24hr)
```

---

## Signal Mapper: Two Extension Objects

`toSignalSummary()` in `signalMapper.ts` calls both label builders for every signal:

```typescript
return {
  signal_agent_segment_id: signal.signalId,
  // ... all AdCP required fields ...
  x_dts: buildDtsLabel(signal),           // DTS v1.2
  x_ucp: toUcpHybridPayload(signal, dts), // UCP HybridPayload
};
```

Both are non-breaking `x_` extensions — AdCP conformance tests only validate required fields.

---

## UCP Layer

### Embedding Engine Architecture

```
createEmbeddingEngine(env)
  ├── EMBEDDING_ENGINE=llm + OPENAI_API_KEY   → LlmEmbeddingAdapter("openai")
  ├── EMBEDDING_ENGINE=llm + ANTHROPIC_API_KEY → LlmEmbeddingAdapter("anthropic")
  └── default                                  → PseudoEmbeddingEngine
```

All engines implement the `EmbeddingEngine` interface:
```typescript
interface EmbeddingEngine {
  readonly modelId: string;
  readonly phase: "pseudo-v1" | "llm-v1" | "trained-v1";
  generate(signal: CanonicalSignal): Promise<Float32Array>;
  batchGenerate(signals: CanonicalSignal[]): Promise<Float32Array[]>;
}
```

### Phase 1: PseudoEmbeddingEngine (512d deterministic)

Dimension slot layout — each slot populated by `hashToFloat(content, seed_i)` with per-dimension seeds:

```
Dims 0–127:   Taxonomy slot    IAB AT 1.1 node ID encoding
Dims 128–191: Category slot    demographic / interest / purchase_intent / geo / composite
Dims 192–255: Source slot      census / dma / survey / acr / web-usage
Dims 256–319: Pricing slot     CPM tier encoding
Dims 320–383: Freshness slot   Static / Annually / Weekly refresh cadence
Dims 384–511: Reserved         Zero-padded — Phase 2 real model output goes here
```

Final vector is L2-normalized. Same signal → same vector. Cosine similarity between related signals (same taxonomy, same category, same source) is meaningfully higher than between unrelated signals.

### Phase 2: LlmEmbeddingAdapter

Input text constructed from signal metadata:
```
"{name}. {description}. Category: {categoryType}. Data source: {sourceSystems}. 
 Geography: {geography}. Estimated audience: {size}M. Source refs: {rawSourceRefs}."
```

Truncated to 2000 chars. OpenAI `text-embedding-3-small` with native `dimensions: 512`. Truncated to 512d and L2-normalized. Falls back to `PseudoEmbeddingEngine` on any API error.

### VAC Constants

```typescript
UCP_MODEL_ID    = "adcp-ucp-bridge-pseudo-v1.0"
UCP_MODEL_FAMILY = "adcp-bridge/deterministic-taxonomy-v1"
UCP_SPACE_ID    = "adcp-bridge-space-v1.0"
UCP_DIMENSIONS  = 512
```

No projector required — buyer agents that share the same `space_id` can compare vectors directly. For cross-space interoperability, a projector artifact will be added in Phase 2b.

### DTS → UCP Normative Mappings

**`signal_type` (from `data_sources`):**

| DTS `data_sources` | UCP `signal_type` | Rationale |
|---|---|---|
| `TV OTT or STB Device` | `reinforcement` | Direct behavioral observation of ad response |
| `Web Usage`, `App Behavior` | `contextual` | Real-time behavioral context |
| `Public Record: Census`, `Geo Location` | `identity` | Stable demographic/geographic identity |
| `Online Survey` | `identity` | Declared identity attributes |

**`signal_strength` (from `audience_inclusion_methodology`):**

| DTS `methodology` | UCP `signal_strength` |
|---|---|
| `Observed/Known` | `high` |
| `Declared` | `high` |
| `Derived` | `medium` |
| `Inferred` | `medium` |
| `Modeled` | `low` |

**`privacy.ttl_seconds` (from `audience_refresh`):**

| DTS `audience_refresh` | TTL |
|---|---|
| `Weekly` | 604,800 (7 days) |
| `Monthly` | 2,592,000 (30 days) |
| `Annually` | 31,536,000 (365 days) |
| `Static` | 63,072,000 (2 years) |

**`permitted_uses` (from `methodology`):**

| Methodology | Permitted uses |
|---|---|
| `Observed/Known` | matching, frequency_capping, measurement, attribution |
| `Derived` | matching, frequency_capping, measurement |
| `Modeled` | matching, frequency_capping |

---

## Relevance Ranking

When `signal_spec` present, `signalService.ts` fetches up to 200 signals, scores via `rankByRelevance()`, slices to `max_results`.

```
+4  per brief keyword in signal name
+2  per brief keyword in signal description
+3  category bonus (brief implies category matching signal.categoryType)
+1  if generationMode === "derived"
+2  if generationMode === "dynamic"
tie-break: larger estimatedAudienceSize first
```

Stop words filtered. Category hints map brief terms to signal categories (e.g. "luxury" → `purchase_intent`, "dma/metro" → `geo`, "affluent" → `composite`).

---

## Deterministic Dynamic IDs

```typescript
dynamicSignalId(name, rulesKey):
  slug = normalize(name).slice(0, 40)
  hash = djb2(JSON.stringify(rules.sort(by_dimension))).toString(16).slice(0, 8)
  return `sig_dyn_${slug}_${hash}`
```

Same brief → same rules → same hash → same `signal_agent_segment_id`. Upsert on conflict — no duplicates accumulate in D1.

---

## DTS v1.2 Implementation

### `buildDtsLabel()` derivation

**`inferDataSources(signal)`** — maps `sourceSystems` + `rawSourceRefs`:

| Source systems | DTS `data_sources` |
|---|---|
| `census` / `rawSourceRefs` has `ACS_` prefix | `["Public Record: Census"]` |
| `dma`, `geo`, `nielsen` | `["Geo Location"]` |
| `taxonomy_bridge`, `content` | `["Web Usage", "App Behavior"]` |
| `acr`, `ctv`, `stb` | `["TV OTT or STB Device"]` |
| default | `["Online Survey"]` |

**`buildGeocodeList(signal)`** — starts `"USA"`, appends DMA codes from both `rawSourceRefs` AND `signal.geography` arrays. Result: `"USA|DMA-501"`.

**Onboarder section** — populated with `"Postal / Geographic Code"` / `"Geography"` when `data_sources` includes `"Public Record: Census"`. `"N/A"` otherwise.

---

## Async Activation Pattern

```
activate_signal()
  1. Validate signal + destination
  2. Create D1 activation_jobs row (status: "submitted")
  3. Return { task_id, status: "pending", destinations: [{is_live: false}] }

get_operation_status(task_id)  ← first poll
  1. Load job row
  2. Lazy state machine:
     "submitted" → "working" → "completed"
  3. Fire webhook if configured + not yet fired
  4. Return { status: "completed", destinations: [{is_live: true, activation_key}] }
```

Status aligned with `@adcp/client` `ADCP_STATUS`. `destinations` field (not `deployments`) in all responses.

---

## Tool Alias Resolution

`handleToolCall()` resolves aliases before `getToolByName()` validation:

```typescript
const TOOL_ALIASES: Record<string, string> = {
  "get_task_status":   "get_operation_status",
  "get_signal_status": "get_operation_status",
};
const resolvedName = TOOL_ALIASES[name] ?? name;
const toolDef = getToolByName(resolvedName);  // validates against ADCP_TOOLS array
```

Parameter aliases handled in normalization layer:

| Spec name | Aliases accepted |
|---|---|
| `signal_spec` | `brief` |
| `deliver_to` | `destinations`, `deployments`, `destination` |
| `max_results` | `limit` |
| `signal_agent_segment_id` | `signal_id`, `signalId` |
| `task_id` | `operationId` |

---

## @adcp/client SDK

`@adcp/client@^4.5.2` dev dependency:

| Import | Usage |
|---|---|
| `createOperationId()` | `ids.ts` — `op_{timestamp}_{nanoid}` |
| `ADCP_STATUS` | `activationService.ts` — `submitted → working → completed` |
| `COMPATIBLE_ADCP_VERSIONS` | `capabilityService.ts` — `major_versions: [2, 3]` |
| `SIGNALS_TOOLS` | `mcp/tools.ts` — core tool name reference |

---

## D1 Schema

```sql
taxonomy_nodes      -- IAB AT 1.1 tree
signals             -- 49 catalog rows + test-signal-001 = 50
signal_rules        -- rules for derived/dynamic signals
source_records      -- raw loader reference records
activation_jobs     -- async tasks + webhook_url + webhook_fired
activation_events   -- audit log per status transition
```

KV namespaces:
- `adcp_capabilities_v4` — capabilities response (1hr TTL)
- `ucp_embedding_v1:{signal_id}` — float32 vectors (24hr TTL)

---

## Extensibility

| Feature | Files | What to do |
|---|---|---|
| LLM embeddings | `embeddingEngine.ts` | Set `EMBEDDING_ENGINE=llm` + `wrangler secret put OPENAI_API_KEY` |
| Anthropic embeddings | `embeddingEngine.ts` | Uncomment `_callAnthropic()` when API ships |
| CTV/ACR signals | `enrichedSignalModel.ts` | Add `sourceSystems: ["acr"]` — auto-maps to `TV OTT or STB Device` + `reinforcement` + `Weekly` |
| VAC projector | `src/ucp/projector.ts` (new) | Procrustes alignment matrix, Ed25519 signed, published at `/ucp/projector` |
| Concept registry | `src/ucp/conceptRegistry.ts` (new) | 500 canonical concepts with embeddings, cross-taxonomy mapping |
| Composite audiences | `briefParser.ts` upgrade | LLM → `AudienceQueryAST` with AND/OR/NOT + temporal scope |
| Negation signals | `activate_signal` + `deliver_to` | Add `exclude_signals[]` array to activation payload |
| `iab_techlab_compliant: "Yes"` | `signalMapper.ts` | Complete `datalabel.org` audit |
| `x_dts` spec PR | `adcontextprotocol/adcp` | Add to `static/schemas/signals/signal.json` |
| `x_ucp` spec PR | `adcontextprotocol/adcp` | Add alongside `x_dts` |
| UCP Bridge Profile | UCP v5.2 appendix | Normative DTS→UCP mappings, `legacy_fallback.signal_agent_segment_id` pattern |