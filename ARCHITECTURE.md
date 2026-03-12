# Architecture

AdCP Signals Adaptor — Cloudflare Worker implementing AdCP 2.6 Signals Activation Protocol with UCP v0.1/v0.2-draft extensions including GTS, Projector, and Handshake Simulator (v3.0-rc).

---

## Request Flow

```
Client (Claude / curl / buyer agent)
        │
        ▼
Cloudflare Worker (src/index.ts)
        │
        ├── Auth check (DEMO_API_KEY)
        │     Public (no auth): /health, /capabilities, /mcp,
        │                       /ucp/concepts (read), /ucp/gts,
        │                       /ucp/projector, /ucp/simulate-handshake,
        │                       /auth/linkedin/*
        │     Auth required:    /signals/*, /ucp/concepts/seed, /seed
        │
        ├── Auto-seed (ctx.waitUntil) — D1 seeded on first cold request
        │
        └── Route dispatch
              │
              ├── GET  /health                       → version check
              ├── GET  /capabilities                 → capabilityService
              ├── POST /mcp                          → mcpServer (JSON-RPC 2.0)
              │
              ├── GET  /ucp/gts                      → getGts (Phase 2b prerequisite)
              ├── GET  /ucp/projector                → getProjector (Procrustes/SVD, simulated)
              ├── POST /ucp/simulate-handshake       → simulateHandshake (Phase 1 demo)
              ├── GET  /ucp/concepts                 → conceptHandler (list / search / filter)
              ├── GET  /ucp/concepts/:concept_id     → conceptHandler (exact lookup)
              ├── POST /ucp/concepts/seed            → conceptRegistry.seedConceptsToKV
              │
              ├── POST /signals/query                → queryParser → queryResolver → compositeScorer
              ├── POST /signals/search               → signalService.searchSignalsService
              ├── POST /signals/activate             → activationService
              ├── GET  /signals/:id/embedding        → embeddingStore (v1) or pseudo fallback
              │
              ├── GET  /operations/:id               → activationService.getOperationService
              ├── POST /seed                         → seedPipeline (dev only)
              └── GET  /auth/linkedin/*              → LinkedIn OAuth flow
```

---

## Domain Layer

### Core (v1.0)

| File | Purpose |
|---|---|
| `signalService.ts` | Search, generate, brief ranking, catalog adapter for NL query. Exports `getAllSignalsForCatalog()` and `inferRulesFromSignalId()`. |
| `activationService.ts` | Activation job lifecycle, lazy state machine, webhook callback |
| `capabilityService.ts` | AdCP capabilities envelope (KV-cached 1hr). Imports `UCP_CAPABILITY` from `vacDeclaration.ts`. |
| `ruleEngine.ts` | Dynamic segment generation from dimension rules |
| `signalModel.ts` | Base seeded + derived catalog (33 signals) |
| `enrichedSignalModel.ts` | Census ACS-derived (5), Nielsen DMA-derived (6), cross-taxonomy bridge (5) = 16 enriched signals |
| `seedPipeline.ts` | D1 ingestion pipeline (4-phase, idempotent) |

### NL Query (v2.0 → v2.1)

| File | Purpose |
|---|---|
| `queryParser.ts` | NL → `AudienceQueryAST` via Claude API. Rule 7 (age band lower-bound) + Rule 8 in system prompt. |
| `queryResolver.ts` | Hybrid Pass 1→2→3 resolver. Exports `QueryResolver` class + `inferRulesFromSignalId()`. |
| `semanticResolver.ts` | Pass 2 embedding similarity via `SemanticResolver` class. `cosineSimilarity()` re-exported for server.ts. |
| `compositeScorer.ts` | AND/OR/NOT boolean set arithmetic + audience size estimation |
| `nlQueryHandler.ts` | Route handler + embedding engine injection + shape adapter (bridges new resolver → old scorer input) |

#### `inferRulesFromSignalId()` — signal ID → dimension rule map

Maps actual D1 signal IDs to structured dimension rules:

```
sig_age_18_24               → { dimension: "age_band",           value: "18-24" }
sig_age_25_34               → { dimension: "age_band",           value: "25-34" }
sig_age_35_44               → { dimension: "age_band",           value: "35-44" }
sig_age_45_54               → { dimension: "age_band",           value: "45-54" }
sig_age_55_64               → { dimension: "age_band",           value: "55-64" }
sig_age_65_plus             → { dimension: "age_band",           value: "65+" }
sig_high_income_households  → { dimension: "income_band",        value: "150k+" }
sig_upper_middle_income     → { dimension: "income_band",        value: "100k-150k" }
sig_middle_income_households→ { dimension: "income_band",        value: "50k-100k" }
sig_college_educated_adults → { dimension: "education",          value: "college" }
sig_graduate_educated_adults→ { dimension: "education",          value: "graduate" }
sig_families_with_children  → { dimension: "household_type",     value: "family_with_kids" }
sig_senior_households       → { dimension: "household_type",     value: "senior" }
sig_urban_professionals     → { dimension: "household_type",     value: "urban_professional" }
sig_streaming_enthusiasts   → { dimension: "streaming_affinity", value: "high" }
sig_drama_viewers           → { dimension: "content_genre",      value: "drama" }
sig_comedy_fans             → { dimension: "content_genre",      value: "comedy" }
sig_action_movie_fans       → { dimension: "content_genre",      value: "action" }
sig_documentary_viewers     → { dimension: "content_genre",      value: "documentary" }
sig_sci_fi_enthusiasts      → { dimension: "content_genre",      value: "sci_fi" }
```

Value normalization: `normalizeValue()` canonicalizes LLM output variants (e.g. `"150k+"` ↔ `"150k_plus"`, `"50k-100k"` ↔ `"50k_100k"`).

### UCP Layer (v2.0 → v3.0-rc)

| File | Purpose |
|---|---|
| `embeddingStore.ts` | 26 real OpenAI `text-embedding-3-small` vectors (auto-generated, do not edit manually) |
| `embeddingEngine.ts` | `LlmEmbeddingEngine` (real, requires `OPENAI_API_KEY`) + `PseudoEmbeddingEngine` (hash fallback) |
| `vacDeclaration.ts` | VAC constants + `UCP_CAPABILITY` block. v3.0-rc: adds GTS, projector, handshake_simulator fields. |
| `legacyFallback.ts` | Builds `x_ucp.legacy_fallback` from AdCP signal fields |

#### Embedding Engine Selection

```
createEmbeddingEngine(env):
  EMBEDDING_ENGINE=llm + OPENAI_API_KEY → LlmEmbeddingEngine (phase: "v1")
  Otherwise                             → PseudoEmbeddingEngine (phase: "pseudo-v1")

LlmEmbeddingEngine:
  embedSignal: checks embeddingStore first (26 catalog signals, no API call)
               Falls back to OpenAI API for dynamic/unknown signals
  embedText:   Always calls OpenAI API (query leaf descriptions are unique per request)
  Requires:    OPENAI_API_KEY secret + EMBEDDING_ENGINE=llm in wrangler.toml

PseudoEmbeddingEngine:
  DJB2 hash → deterministic pseudo-vector
  Cosine similarity is NOT semantically meaningful
  Triggers pseudoEmbeddingWarning in /signals/query response
```

### Concept Registry (v2.0)

| File | Purpose |
|---|---|
| `conceptRegistry.ts` | 19 canonical advertising concepts, 7 categories, 5-vendor cross-taxonomy `member_nodes` |
| `conceptHandler.ts` | HTTP routes + MCP tool handlers (`get_concept`, `search_concepts`) |

```
conceptRegistry.ts
  19 concepts, 7 categories: demographic | interest | behavioral | geo | archetype | content | purchase_intent
  5 vendors per concept: iab | liveramp | tradedesk | experian | samba
  Storage: in-memory on cold start; KV (TTL 24h) after POST /ucp/concepts/seed
```

### Route Handlers (v3.0-rc)

| File | Route | Notes |
|---|---|---|
| `getGts.ts` | `GET /ucp/gts` | 15-pair GTS — identity/related/orthogonal. Pure in-memory, no API calls. |
| `getProjector.ts` | `GET /ucp/projector` | Procrustes/SVD 512×512 matrix. Status: simulated. Exports `applyProjector()`. |
| `simulateHandshake.ts` | `POST /ucp/simulate-handshake` | Phase 1 negotiation — 3 outcomes + negotiation_trace. |
| `getEmbedding.ts` | `GET /signals/:id/embedding` | v1 vector or pseudo fallback |
| `searchSignals.ts` | `POST /signals/search` | Search + relevance ranking |
| `activateSignal.ts` | `POST /signals/activate` | Async activation |
| `getOperation.ts` | `GET /operations/:id` | Job status polling |
| `capabilities.ts` | `GET /capabilities` | AdCP + UCP capabilities envelope |

---

## MCP Layer

```
src/mcp/
  server.ts    JSON-RPC 2.0 dispatcher, Streamable HTTP transport (POST /mcp)
  tools.ts     8 tool definitions with full input schemas

Tools (v3.0-rc):
  get_adcp_capabilities    — AdCP protocol envelope + full UCP capability block
  get_signals              — signal discovery + relevance ranking + brief proposals
  activate_signal          — async signal activation (returns task_id immediately)
  get_operation_status     — activation job polling (aliases: get_task_status, get_signal_status)
  get_similar_signals      — cosine similarity search via embeddingStore
  query_signals_nl         — NL audience query → CompositeAudienceResult
  get_concept              — concept registry exact lookup
  search_concepts          — concept registry semantic search
```

### MCP `initialize` serverInfo.ucp (v3.0-rc)

```json
{
  "ucp": {
    "space_id": "openai-te3-small-d512-v1",
    "phase": "v1",
    "gts": {
      "supported": true, "endpoint": "/ucp/gts",
      "version": "adcp-gts-v1.0", "pair_count": 15, "pass_threshold": 0.95
    },
    "projector": {
      "available": true, "endpoint": "/ucp/projector",
      "algorithm": "procrustes_svd",
      "from_space": "openai-te3-small-d512-v1", "to_space": "ucp-space-v1.0",
      "status": "simulated"
    },
    "handshake_simulator": { "supported": true, "endpoint": "/ucp/simulate-handshake" },
    "nl_query": { "supported": true, "min_embedding_score": 0.45, "archetype_count": 4, "concept_count": 19 },
    "concept_registry": { "supported": true, "endpoint": "/ucp/concepts", "concept_count": 19 }
  }
}
```

---

## UCP VAC Handshake Flow (v3.0-rc)

```
Buyer agent                         AdCP Signals Adaptor
     │                                      │
     │  POST /mcp (initialize)              │
     │ ────────────────────────────────────►│
     │                                      │  space_id: openai-te3-small-d512-v1
     │                                      │  phase: "v1"
     │                                      │  gts.endpoint: /ucp/gts
     │                                      │  projector.available: true (simulated)
     │ ◄──────────────────────────────────── │
     │                                      │
     │  GET /ucp/gts                        │  Phase 1 — verify semantic alignment
     │ ────────────────────────────────────►│
     │ ◄──────────────────────────────────── │  15 pairs, pass_rate, overall_pass
     │                                      │
     │  POST /ucp/simulate-handshake        │  Phase 1 — negotiate outcome
     │ ────────────────────────────────────►│
     │ ◄──────────────────────────────────── │  outcome: direct_match | projector_required
     │                                      │           | legacy_fallback
     │                                      │
     │  ── if direct_match ──               │
     │  GET /signals/X/embedding            │  Phase 2 — exchange embeddings
     │ ────────────────────────────────────►│
     │ ◄──────────────────────────────────── │  512-dim float32 vector (phase: "v1")
     │  cosine_similarity(q, v)             │  VALID: same model, same space
     │                                      │
     │  ── if projector_required ──         │
     │  GET /ucp/projector                  │  Phase 2b — fetch rotation matrix
     │ ────────────────────────────────────►│
     │ ◄──────────────────────────────────── │  512×512 R matrix (status: "simulated")
     │  projected_v = R × v                 │  project into ucp-space-v1.0
     │  cosine_similarity(q, projected_v)   │  compare in projected space
     │                                      │
     │  ── if legacy_fallback ──            │
     │  use x_ucp.legacy_fallback           │  Phase 3 — AdCOM Segment IDs
     │  .segment_ids from any signal        │  coarse labels, no vector semantics
```

---

## NL Query Pipeline (v2.1)

```
POST /signals/query
  │
  ├── queryParser.ts
  │     Claude API → AudienceQueryAST (boolean tree of LEAF / AND / OR / NOT nodes)
  │     Rules R1–R8 in system prompt:
  │       R1: negation → is_exclusion: true
  │       R5: content titles → content_title dimension
  │       R7: "35+" → age_band: "35-44" only (no implicit upper range)
  │       R8: age band lower-bound normalization
  │
  ├── QueryResolver (queryResolver.ts + semanticResolver.ts)
  │     Pass 1 — exact_rule:          dimension+value → catalog rule map (score: 0.95)
  │     Pass 2 — embedding_similarity: cosine ≥ MIN_EMBEDDING_SCORE (0.45) via OpenAI
  │               SemanticResolver.resolve(leaf, catalog):
  │                 queryVec = engine.embedText(buildQueryText(leaf))
  │                 candidateVecs = engine.embedSignal(s.id, buildSignalSemanticText(s))
  │                 score = cosineSimilarity(queryVec, candidateVec)
  │                 return top-N where score ≥ 0.45
  │     Pass 3 — lexical_fallback:    Jaccard token overlap ≥ 0.15 (score × 1.5, cap 0.75)
  │     Special: title_genre_inference, archetype_expansion
  │
  └── CompositeScorer (compositeScorer.ts)
        AND: min(scores) × 0.85^(unresolved_count) × 0.70^(n-1) overlap factor
        OR:  Σ(sizes) − expected pairwise overlap
        NOT: baseline − child.size, confidence × 0.80
        confidence_floor: max(topMatch × leaf.confidence, topMatch × 0.55)

Confidence tiers:
  high:   confidence ≥ 0.75 AND estimated_size ≥ 1,000,000
  medium: confidence ≥ 0.55
  low:    confidence < 0.55
  narrow: estimated_size < 50,000 OR confidence < 0.40
  Buyers MUST NOT activate narrow results without explicit user confirmation.
```

---

## Match Method Vocabulary (v2.1)

| Value | Description | Score range |
|---|---|---|
| `exact_rule` | dimension+value maps directly to signal rule | 0.95 |
| `embedding_similarity` | cosine similarity ≥ 0.45 via OpenAI vectors | 0.45–1.0 |
| `lexical_fallback` | Jaccard token overlap ≥ 0.15, score × 1.5 capped at 0.75 | 0.075–0.75 |
| `title_genre_inference` | content title → TITLE_GENRE_MAP → genre signal (× 0.90) | ~0.855 |
| `archetype_expansion` | weighted constituent dimension aggregation | 0.10–0.95 |
| `category_fallback` | broad category match | 0.3–0.5 |

Note: `description_similarity` (v1.0) retired. All semantic matching is now `embedding_similarity` or `lexical_fallback`.

**Production confidence examples (v2.1):**

```
"affluent families 35-44 who stream heavily"           → 0.76   tier: medium  (4 dims exact_rule)
"streaming heavy watchers cord cutters"                → 0.568  tier: medium  (embedding_similarity active)
"soccer moms 35+ Nashville no coffee Desperate H."    → 0.051  tier: narrow  (3+ unresolved)
```

---

## GTS Pair Set (v3.0-rc)

15 pairs across three categories, all computed from real v1 vectors in `embeddingStore.ts`:

**Identity pairs (must pass: cosine ≥ 0.90)**
- `age-adjacent-young` — sig_age_18_24 ↔ sig_age_25_34
- `age-adjacent-midlife` — sig_age_35_44 ↔ sig_age_45_54
- `income-adjacent-high` — sig_high_income_households ↔ sig_upper_middle_income
- `content-streaming-affinity` — sig_drama_viewers ↔ sig_streaming_enthusiasts
- `education-high` — sig_college_educated_adults ↔ sig_graduate_educated_adults
- `acs-affluent-crosswalk` — sig_acs_affluent_college_educated ↔ sig_acs_graduate_high_income

**Related pairs (expected: 0.50–0.89)**
- `content-genres-related` — sig_drama_viewers ↔ sig_documentary_viewers
- `income-education-related` — sig_high_income_households ↔ sig_graduate_educated_adults
- `families-seniors-related` — sig_families_with_children ↔ sig_senior_households
- `urban-income-related` — sig_urban_professionals ↔ sig_high_income_households
- `scifi-action-related` — sig_sci_fi_enthusiasts ↔ sig_action_movie_fans

**Orthogonal pairs (must pass: cosine < 0.40)**
- `young-vs-senior` — sig_age_18_24 ↔ sig_age_65_plus
- `action-vs-documentary` — sig_action_movie_fans ↔ sig_documentary_viewers
- `low-income-vs-affluent` — sig_middle_income_households ↔ sig_acs_affluent_college_educated
- `young-single-vs-seniors` — sig_acs_young_single_adults ↔ sig_acs_senior_households_income

---

## Embedding Store (v2.0)

```
embeddingStore.ts — AUTO-GENERATED. Do not edit manually.
  Source:     OpenAI text-embedding-3-small API
  Generation: scripts/embed-signals.html (browser tool)
              → scripts/embeddings.json
              → scripts/generate-embedding-store.js
              → src/domain/embeddingStore.ts

  model_id:   text-embedding-3-small
  model_family: openai/text-embedding-3
  space_id:   openai-te3-small-d512-v1
  dimensions: 512, float32, l2-normalized, cosine distance

  Coverage (26 signals with real v1 vectors):
    sig_age_18_24, sig_age_25_34, sig_age_35_44, sig_age_45_54,
    sig_age_55_64, sig_age_65_plus, sig_high_income_households,
    sig_upper_middle_income, sig_middle_income_households,
    sig_college_educated_adults, sig_graduate_educated_adults,
    sig_families_with_children, sig_senior_households, sig_urban_professionals,
    sig_acs_affluent_college_educated, sig_acs_graduate_high_income,
    sig_acs_middle_income_families, sig_acs_senior_households_income,
    sig_acs_young_single_adults, sig_action_movie_fans, sig_comedy_fans,
    sig_documentary_viewers, sig_drama_viewers, sig_sci_fi_enthusiasts,
    sig_streaming_enthusiasts, test-signal-001

  Fallback: Dynamic signals → deterministic DJB2 pseudo-hash
            phase: "pseudo-v1", space_id: "adcp-bridge-space-v1.0"

  Phase 2b:
    /ucp/projector — Procrustes/SVD rotation matrix (simulated)
    Maps openai-te3-small-d512-v1 → ucp-space-v1.0
    R ≈ I until IAB publishes reference model vectors
```

**Regenerating vectors:**
```bash
# 1. Open scripts/embed-signals.html in browser, enter OpenAI key, click Embed All
# 2. Copy output JSON → scripts/embeddings.json (wrap in {} if needed)
# 3. node scripts/generate-embedding-store.js embeddings.json > src/domain/embeddingStore.ts
# 4. wrangler deploy
```

**Known catalog gaps (cause narrow tier on some queries):**
- No DMA/geo signals (Nashville, Chicago, etc.) — add to `seed/geo-sample.csv`
- No beverage/lifestyle signals (coffee, wine, etc.) — no catalog signal → unresolved

---

## Storage

```
Cloudflare D1 (SQLite)
  signals table      — canonical signal catalog (49+ signals post-seed)
  activations table  — job lifecycle

  D1 catalog breakdown:
    Demographic (21): sig_age_18_24...sig_acs_young_single_adults
    Interest (6):     sig_action_movie_fans, sig_comedy_fans, sig_documentary_viewers,
                      sig_drama_viewers, sig_sci_fi_enthusiasts, sig_streaming_enthusiasts
    Dynamic:          sig_dyn_* (generated by ruleEngine, pseudo-v1 phase)

Cloudflare KV (SIGNALS_CACHE)
  capabilities           TTL 1hr
  embed:{signal_id}      embedding vector cache   TTL 24h
  concept:{concept_id}   concept registry entries TTL 24h
  concept:__index__      concept ID list          TTL 24h
```

---

## Seed Data

| File | Use |
|---|---|
| `seed/iab-audience-1.1.tsv` | IAB Audience Taxonomy 1.1 backbone |
| `seed/demographics-sample.csv` | Age, income, education, household buckets |
| `seed/interests-sample.csv` | Genre affinity scores |
| `seed/geo-sample.csv` | Top 50 US cities with metro tier |
| `scripts/embed-signals.html` | Browser tool: calls OpenAI API, outputs embeddings JSON |
| `scripts/embeddings.json` | Raw OpenAI vectors (wrap in `{}` if copied from browser) |
| `scripts/generate-embedding-store.js` | Transforms embeddings.json → src/domain/embeddingStore.ts |

---

## NL Query AST Schema

```typescript
type AudienceQueryNode = AudienceQueryLeaf | AudienceQueryBranch;

interface AudienceQueryLeaf {
  op:           "LEAF";
  dimension:    "age_band" | "income_band" | "education" | "household_type" |
                "metro_tier" | "content_genre" | "streaming_affinity" | "geo" |
                "interest" | "archetype" | "content_title" | "behavioral_absence";
  value:        string;
  description:  string;       // rich text for Pass 2 embedding matching
  concept_id?:  string;       // concept registry anchor
  temporal?:    TemporalScope;
  confidence:   number;       // 0.0–1.0, Claude-assessed
  is_exclusion?: boolean;     // true for NOT/negation leaves
}

interface AudienceQueryBranch {
  op:       "AND" | "OR" | "NOT";
  children: AudienceQueryNode[];
}

interface TemporalScope {
  daypart?:            "morning" | "afternoon" | "evening" | "late_night";
  hours_utc?:          number[];
  days?:               string[];
  timezone_inference?: "geo" | "device";
}
```

---

## DTS 1.2 Gaps Found During Implementation

| Gap | Current DTS 1.2 | Proposed resolution |
|---|---|---|
| `"Derived"` methodology not in spec | Enum does not list `"Derived"` | Add; distinguish from `"Modeled"` |
| No `temporal_scope` field | No daypart/days scope mechanism | Add optional `temporal_scope` to signal schema |
| `"Public Record: Census"` not in data_sources enum | No compliant value for ACS-derived signals | Add to enum |

---

## Spec Contributions

| Contribution | Spec Location |
|---|---|
| NLAQ — AudienceQueryAST normative schema | UCP v0.2 Appendix D §3.1 |
| NLAQ — Three-pass hybrid leaf resolution | UCP v0.2 Appendix D §3.2 |
| NLAQ — MIN_EMBEDDING_SCORE = 0.45 | UCP v0.2 Appendix D §3.2.2 |
| NLAQ — TITLE_GENRE_MAP normative mechanism | UCP v0.2 Appendix D §3.2.2 |
| NLAQ — ARCHETYPE_TABLE + double-weight prohibition | UCP v0.2 Appendix D §3.2.3 |
| NLAQ — Unresolved dimension penalty model | UCP v0.2 Appendix D §3.2.4 |
| NLAQ — Compositional AND/OR/NOT scoring | UCP v0.2 Appendix D §3.3 |
| NLAQ — Confidence tier definitions | UCP v0.2 Appendix D §3.5 |
| Concept-Level VAC — registry schema | UCP v0.2 Appendix D §4 |
| Concept-Level VAC — cross-taxonomy member_nodes | UCP v0.2 Appendix D §4.2 |
| Temporal behavioral signals — daypart + hours_utc | UCP v0.2 Appendix D §4.4 |
| GTS — 15-pair validation set + pass criteria | UCP v0.2 §5.2 (Phase 2b prerequisite) |
| Projector — Procrustes/SVD algorithm spec | UCP v0.2 §5.2 Phase 2b |
| Handshake Simulator — 3-outcome negotiation protocol | UCP v0.2 §5 Phase 1 |
| VAC space_id + phase declaration in MCP initialize | UCP v0.2 §5.2 |
| DTS 1.2 gaps — "Derived" methodology | IAB DTS issue log |
| DTS 1.2 gaps — temporal_scope field | IAB DTS issue log |
| DTS 1.2 gaps — "Public Record: Census" | IAB DTS issue log |
