# Architecture

AdCP Signals Adaptor — Cloudflare Worker implementing AdCP 2.6 Signals Activation Protocol with UCP v5.1/v5.2-draft extensions.

---

## Request Flow

```
Client (Claude / curl / buyer agent)
        │
        ▼
Cloudflare Worker (src/index.ts)
        │
        ├── Auth check (DEMO_API_KEY)
        │     Public (no auth): /health, /capabilities, /mcp, /ucp/concepts (read)
        │     Auth required:    /signals/*, /ucp/concepts/seed, /seed
        │
        ├── Auto-seed (ctx.waitUntil) — D1 seeded on first cold request
        │
        └── Route dispatch
              │
              ├── GET  /capabilities              → capabilityService
              ├── POST /signals/search            → signalService.searchSignalsService
              ├── POST /signals/activate          → activationService
              ├── POST /signals/generate          → ruleEngine + signalService
              ├── POST /signals/query             → queryParser → queryResolver → compositeScorer
              ├── GET  /signals/:id/embedding     → embeddingStore (real v1) or pseudo fallback
              ├── GET  /ucp/concepts              → conceptHandler (list / search / filter)
              ├── GET  /ucp/concepts/:concept_id  → conceptHandler (exact lookup)
              ├── POST /ucp/concepts/seed         → conceptRegistry.seedConceptsToKV
              └── POST /mcp                       → mcpServer → tools dispatch
```

---

## Domain Layer

### Core (v1.0)

| File | Purpose |
|---|---|
| `signalService.ts` | Search, generate, brief ranking, catalog adapter for NL query. Exports `getAllSignalsForCatalog()` and `inferRulesFromSignalId()`. |
| `activationService.ts` | Activation job lifecycle, lazy state machine, webhook callback |
| `capabilityService.ts` | AdCP capabilities envelope (KV-cached 1hr) |
| `ruleEngine.ts` | Dynamic segment generation from dimension rules |
| `signalModel.ts` | Base seeded + derived catalog (33 signals) |
| `enrichedSignalModel.ts` | Census ACS-derived (5), Nielsen DMA-derived (6), cross-taxonomy bridge (5) = 16 enriched signals |
| `seedPipeline.ts` | D1 ingestion pipeline (4-phase, idempotent) |

#### `inferRulesFromSignalId()` — signal ID → dimension rule map

Used by `queryResolver.ts` Pass 1 (exact rule match). Maps actual D1 signal IDs to structured dimension rules:

```typescript
sig_age_18_24              → { dimension: "age_band",           value: "18-24" }
sig_age_25_34              → { dimension: "age_band",           value: "25-34" }
sig_age_35_44              → { dimension: "age_band",           value: "35-44" }
sig_age_45_54              → { dimension: "age_band",           value: "45-54" }
sig_age_55_64              → { dimension: "age_band",           value: "55-64" }
sig_age_65_plus            → { dimension: "age_band",           value: "65+" }
sig_high_income_households → { dimension: "income_band",        value: "150k+" }
sig_upper_middle_income    → { dimension: "income_band",        value: "100k-150k" }
sig_middle_income_households→{ dimension: "income_band",        value: "50k-100k" }
sig_college_educated_adults→ { dimension: "education",          value: "college" }
sig_graduate_educated_adults→{ dimension: "education",          value: "graduate" }
sig_families_with_children → { dimension: "household_type",     value: "family_with_kids" }
sig_senior_households      → { dimension: "household_type",     value: "senior" }
sig_urban_professionals    → { dimension: "household_type",     value: "urban_professional" }
sig_streaming_enthusiasts  → { dimension: "streaming_affinity", value: "high" }
sig_drama_viewers          → { dimension: "content_genre",      value: "drama" }
sig_comedy_fans            → { dimension: "content_genre",      value: "comedy" }
sig_action_movie_fans      → { dimension: "content_genre",      value: "action" }
sig_documentary_viewers    → { dimension: "content_genre",      value: "documentary" }
sig_sci_fi_enthusiasts     → { dimension: "content_genre",      value: "sci_fi" }
```

#### `getAllSignalsForCatalog()` — D1 CanonicalSignal[] → CatalogSignal[]

Adapter that transforms the full D1 catalog into the flat `CatalogSignal[]` shape consumed by `queryResolver.ts`. Called once per NL query request; result is passed through the resolver pipeline without re-fetching.

---

### NL Query Pipeline (v2.0)

```
POST /signals/query
  │
  ├── queryParser.ts
  │     Input:  free-form query string
  │     Output: AudienceQueryAST (boolean tree)
  │     Model:  Claude API (claude-sonnet-4-20250514)
  │     Handles: archetypes, negation, geo, temporal scope, content titles
  │
  ├── queryResolver.ts
  │     Input:  AudienceQueryAST + CatalogSignal[]
  │     Output: LeafResolution[] (one per LEAF node)
  │
  │     Pass 1 — Exact rule match
  │       inferRulesFromSignalId() map → direct dimension/value hit
  │       match_method: "exact_rule", match_score: 0.808–0.95
  │
  │     Pass 2 — Description similarity
  │       Jaccard token overlap between leaf description and signal description
  │       match_method: "description_similarity"
  │       TITLE_GENRE_MAP: content title → genre inference
  │         desperate_housewives → drama → sig_drama_viewers (0.78)
  │         grey_s_anatomy       → drama
  │         the_crown            → drama
  │         succession           → drama
  │         the_office           → comedy
  │         friends              → comedy
  │         star_wars            → sci_fi
  │         (+ 20 more titles)
  │
  │     Pass 3 — Archetype expansion
  │       ARCHETYPE_TABLE maps concept → constituent dimension leaves:
  │         soccer_mom         → [age_band:35-44, household_type:family_with_kids,
  │                               income_band:50k-100k, interest:sports/family]
  │         urban_professional → [education:college, household_type:urban_professional,
  │                               income_band:100k+]
  │         affluent_family    → [income_band:150k+, household_type:family_with_kids,
  │                               education:graduate]
  │       Each archetype pseudo-leaf: confidence=1.0, weight applied once
  │       (Bug fixed: prior double-weight where archetype confidence was multiplied twice)
  │
  │     Unresolved leaves (geo:Nashville, interest:coffee, content_title without map entry):
  │       match_score: 0 → flagged as unresolved
  │       NOT leaves with unresolved signals → exclude_signals: [] (empty, honest)
  │
  ├── compositeScorer.ts
  │     Input:  AudienceQueryAST + LeafResolution[]
  │     Output: CompositeAudienceResult
  │
  │     scoreAND():
  │       Splits resolved vs unresolved children before scoring
  │       Resolved:   confidence = Math.min(scores) × ∏(coverage_i) × 0.70^(n-1)
  │       Unresolved: apply 0.85^n penalty per unresolved leaf (additive, not chained)
  │       Unresolved leaves EXCLUDED from Math.min chain (avoids vetoing resolved dims)
  │       Confidence floor: Math.max(topMatch.match_score × leaf.confidence,
  │                                   topMatch.match_score × 0.55)
  │
  │     scoreOR():
  │       Union with pairwise overlap deduction
  │       coverage = Σ(coverage_i) - Σ(overlap_pairs)
  │
  │     scoreNOT():
  │       Produces exclude_signals[] list for DSP-side suppression
  │       Applies 0.80 confidence penalty to AND parent
  │       If referenced signal unresolved → exclude_signals: [], warning appended
  │
  └── nlQueryHandler.ts
        Route handler wiring all three layers
        Exports QUERY_SIGNALS_NL_TOOL MCP tool definition
        Returns CompositeAudienceResult:
          matched_signals[], exclude_signals[], estimated_size,
          confidence_tier, warnings[], query_ast (debug)
```

---

### Embedding Store (v2.0)

```
embeddingStore.ts
  Source:     OpenAI text-embedding-3-small API
  Generation: scripts/embed-signals.html (browser tool) → scripts/embeddings.json
              → scripts/generate-embedding-store.js → src/domain/embeddingStore.ts
  Storage:    hardcoded TypeScript at build time (no runtime API calls)

  model_id:   "text-embedding-3-small"
  model_family: "openai/text-embedding-3"
  space_id:   "openai-te3-small-d512-v1"   ← semantically valid VAC declaration
  dimensions: 512
  encoding:   float32, l2-normalized, cosine distance

  Coverage (19 signals with real vectors):
    sig_age_18_24, sig_age_25_34, sig_age_35_44, sig_age_45_54,
    sig_age_55_64, sig_age_65_plus, sig_high_income_households,
    sig_upper_middle_income, sig_middle_income_households,
    sig_college_educated_adults, sig_graduate_educated_adults,
    sig_families_with_children, sig_senior_households, sig_urban_professionals,
    sig_acs_affluent_college_educated, sig_acs_graduate_high_income,
    sig_acs_middle_income_families, sig_acs_senior_households_income,
    sig_acs_young_single_adults,
    sig_action_movie_fans, sig_comedy_fans, sig_documentary_viewers,
    sig_drama_viewers, sig_sci_fi_enthusiasts, sig_streaming_enthusiasts,
    test-signal-001

  Fallback:   Dynamic signals and non-stored IDs → deterministic pseudo-hash
              phase: "pseudo-v1", space_id: "adcp-bridge-space-v1.0"

  Exports:
    SIGNAL_EMBEDDINGS: Record<string, SignalEmbedding>
    getSignalEmbedding(id)    → SignalEmbedding | null
    cosineSimilarity(a, b)    → number (-1 to 1)
    findSimilarSignals(id, n) → { id, similarity }[] top-N ranked

  Phase 2b (pending):
    /ucp/projector — Procrustes/SVD alignment matrix
    Maps openai-te3-small-d512-v1 → ucp-space-v1.0
    Unblocked: requires IAB to publish reference model vectors
```

---

### Concept Registry (v2.0)

```
conceptRegistry.ts
  19 canonical advertising concepts
  Categories: demographic | interest | behavioral | geo | archetype | content | purchase_intent

  Schema per concept:
    concept_id:             string   — stable anchor (e.g. SOCCER_MOM_US)
    label:                  string   — human-readable display name
    category:               string   — one of 7 categories above
    concept_description:    string   — rich text for semantic search / similarity
    constituent_dimensions: Array<{  — weighted breakdown (used by archetype expander)
      dimension: string
      value:     string
      weight:    number              — sum to 1.0
    }>
    member_nodes: Array<{            — cross-taxonomy equivalents
      vendor:     "iab"|"liveramp"|"tradedesk"|"experian"|"samba"
      node_id:    string
      label:      string
      similarity: number             — 0.0–1.0 semantic match to concept
      source:     "exact"|"mapped"|"inferred"
    }>

  Example — SOCCER_MOM_US:
    constituent_dimensions:
      { dimension: "age_band",       value: "35-44",          weight: 0.35 }
      { dimension: "household_type", value: "family_with_kids",weight: 0.40 }
      { dimension: "income_band",    value: "50k-100k",        weight: 0.15 }
      { dimension: "interest",       value: "youth_sports",    weight: 0.10 }
    member_nodes:
      { vendor: "iab",       node_id: "IAB_AUD_1_1_123", similarity: 0.88 }
      { vendor: "liveramp",  node_id: "LR_SEG_45892",    similarity: 0.82 }
      { vendor: "samba",     node_id: "sig_families_with_children", similarity: 0.91 }

  Storage:
    Cold start: in-memory from conceptRegistry.ts static data
    After /ucp/concepts/seed: written to KV under concept:{concept_id}, TTL 24h
    Index stored at concept:__index__ (array of all concept_ids)

conceptHandler.ts
  Routes:
    GET  /ucp/concepts                — list all; ?q= search; ?category= filter; ?limit=
    GET  /ucp/concepts/:concept_id    — exact lookup by ID
    POST /ucp/concepts/seed           — auth required; writes all 19 to KV
  MCP tools:
    get_concept      { concept_id }
    search_concepts  { q, category?, limit? }
```

---

## MCP Layer

```
src/mcp/
  server.ts    JSON-RPC 2.0 dispatcher, Streamable HTTP transport (POST /mcp)
  tools.ts     8 tool definitions with full input schemas

Tools:
  get_adcp_capabilities    — AdCP protocol envelope
  get_signals              — signal discovery + relevance ranking
  activate_signal          — async signal activation
  get_operation_status     — activation job polling (aliases: get_task_status, get_signal_status)
  get_similar_signals      — cosine similarity search via embeddingStore
  query_signals_nl         — NL audience query → CompositeAudienceResult
  get_concept              — concept registry exact lookup
  search_concepts          — concept registry semantic search
```

---

## Storage

```
Cloudflare D1 (SQLite)
  signals table      — canonical signal catalog (49 signals post-seed)
  activations table  — job lifecycle

  Actual D1 catalog (21 demographic + 6 interest + dynamic):
    Demographic (21):
      sig_age_18_24, sig_age_25_34, sig_age_35_44, sig_age_45_54, sig_age_55_64,
      sig_age_65_plus, sig_high_income_households, sig_upper_middle_income,
      sig_middle_income_households, sig_college_educated_adults,
      sig_graduate_educated_adults, sig_families_with_children, sig_senior_households,
      sig_urban_professionals, sig_acs_affluent_college_educated,
      sig_acs_graduate_high_income, sig_acs_middle_income_families,
      sig_acs_senior_households_income, sig_acs_young_single_adults,
      test-signal-001, sig_dyn_high_income_150k_70ea9fdf
    Interest (6):
      sig_action_movie_fans, sig_comedy_fans, sig_documentary_viewers,
      sig_drama_viewers, sig_sci_fi_enthusiasts, sig_streaming_enthusiasts

Cloudflare KV (SIGNALS_CACHE)
  capabilities           TTL 5min
  embed:{signal_id}      embedding vector cache   TTL 24h
  concept:{concept_id}   concept registry entries TTL 24h
  concept:__index__      concept ID list          TTL 24h
```

---

## UCP VAC Flow

```
Buyer agent                    AdCP Signals Adaptor
     │                                │
     │  POST /mcp (initialize)        │
     │ ─────────────────────────────► │
     │                                │  capabilities include:
     │                                │    space_id: openai-te3-small-d512-v1
     │                                │    projector_available: false (Phase 2b)
     │ ◄───────────────────────────── │
     │                                │
     │  GET /signals/X/embedding      │
     │ ─────────────────────────────► │
     │ ◄───────────────────────────── │  512-dim float32 vector
     │                                │  phase: "v1" (real) or "pseudo-v1" (dynamic)
     │                                │  space_id: openai-te3-small-d512-v1
     │                                │
     │  cosine_similarity(q, v)       │  VALID: same model, same space
     │  — OR —                        │
     │  fetch /ucp/projector          │  PHASE 2b: project into ucp-space-v1.0
```

---

## NL Query AST Schema

```typescript
type AudienceQueryNode = AudienceQueryLeaf | AudienceQueryBranch;

interface AudienceQueryLeaf {
  op:          "LEAF";
  dimension:   "age_band" | "income_band" | "education" | "household_type" |
               "metro_tier" | "content_genre" | "streaming_affinity" | "geo" |
               "interest" | "archetype" | "content_title" | "behavioral_absence";
  value:       string;
  description: string;       // rich text passed to Pass 2 similarity matching
  concept_id?: string;       // concept registry anchor for Pass 3 archetype expansion
  temporal?:   TemporalScope;// { daypart?: "morning"|"afternoon"|"evening"|"night",
                             //   hours_utc?: [number, number] }
  confidence:  number;       // 0.0–1.0, set by Claude parser
  is_exclusion?: boolean;    // true when leaf is inside NOT branch
}

interface AudienceQueryBranch {
  op:       "AND" | "OR" | "NOT";
  children: AudienceQueryNode[];
}
```

Example — "soccer moms 35+ in Nashville, don't like coffee, watch Desperate Housewives afternoon":
```json
{
  "op": "AND",
  "children": [
    { "op": "LEAF", "dimension": "archetype",      "value": "soccer_mom",
      "concept_id": "SOCCER_MOM_US" },
    { "op": "LEAF", "dimension": "age_band",       "value": "35+" },
    { "op": "LEAF", "dimension": "geo",            "value": "Nashville",
      "description": "Nashville Tennessee DMA-659" },
    { "op": "LEAF", "dimension": "content_title",  "value": "desperate_housewives",
      "temporal": { "daypart": "afternoon" } },
    { "op": "NOT", "children": [
      { "op": "LEAF", "dimension": "interest", "value": "coffee",
        "is_exclusion": true }
    ]}
  ]
}
```

Resolution outcome for this query (production-verified):
```
sig_age_35_44:              exact_rule    0.808   resolved ✓
sig_age_45_54:              exact_rule    0.808   resolved ✓
sig_families_with_children: archetype     0.285   resolved ✓  (was 0.085 before double-weight fix)
sig_drama_viewers:          similarity    0.760   resolved ✓  (desperate_housewives → drama)
Nashville:                  unresolved    0.000   no DMA signals in catalog
coffee:                     unresolved    0.000   no beverage signal → exclude_signals: []
confidence_tier: "narrow"  ← correct: 3 unresolved dimensions
```

---

## Confidence Tiers

| Tier | Conditions |
|---|---|
| `high` | confidence ≥ 0.75 AND estimated_size ≥ 1,000,000 |
| `medium` | confidence ≥ 0.55 |
| `low` | confidence < 0.55 |
| `narrow` | estimated_size < 50,000 OR confidence < 0.40 |

**Unresolved dimension handling:**
- Unresolved leaves are excluded from the `Math.min` confidence chain in `scoreAND()`
- Each unresolved leaf applies `× 0.85` penalty to the final composite score
- Multiple unresolved leaves: `composite × 0.85^n` (n = unresolved count)
- This prevents a single unresolvable dimension (e.g. a geo with no catalog signal) from zeroing out an otherwise high-confidence match
- Confidence floor per leaf: `Math.max(topMatch.match_score × leaf.confidence, topMatch.match_score × 0.55)`

**Production confidence examples:**
```
"affluent families 35-44 who stream heavily"  → 0.686  tier: medium  (all 4 dims resolved)
"soccer moms in Nashville..."                  → 0.195  tier: narrow  (3 dims unresolved)
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
| `scripts/embeddings.json` | Raw OpenAI vectors (must wrap in `{}` if copied from browser) |
| `scripts/generate-embedding-store.js` | Transforms embeddings.json → src/domain/embeddingStore.ts |

**Regenerating vectors:**
```bash
# 1. Open embed-signals.html in browser, enter OpenAI key, click Embed All
# 2. Copy output JSON, wrap in { } if missing outer braces, save as scripts/embeddings.json
# 3. node scripts/generate-embedding-store.js scripts/embeddings.json > src/domain/embeddingStore.ts
# 4. wrangler deploy
```

**Known catalog gaps (cause narrow tier on some queries):**
- No DMA/geo signals (Nashville, Chicago, etc.) — add to seed/geo-sample.csv
- No beverage/lifestyle interest signals (coffee, wine, etc.)
- No content title signals (resolved via TITLE_GENRE_MAP inference only)

---

## Spec Contributions

| Contribution | Location |
|---|---|
| NLAQ — AudienceQueryAST normative schema | `ucp-v5.2-nlaq-spec.md` §3.1 |
| NLAQ — Three-pass leaf resolution algorithm | `ucp-v5.2-nlaq-spec.md` §3.2 |
| NLAQ — Compositional AND/OR/NOT scoring formulas | `ucp-v5.2-nlaq-spec.md` §3.3 |
| NLAQ — Unresolved dimension penalty model | `ucp-v5.2-nlaq-spec.md` §3.4 |
| NLAQ — Confidence tier definitions | `ucp-v5.2-nlaq-spec.md` §3.5 |
| Concept-Level VAC — registry schema | `ucp-v5.2-nlaq-spec.md` §4 |
| Concept-Level VAC — cross-taxonomy member_nodes | `ucp-v5.2-nlaq-spec.md` §4.2 |
| Temporal behavioral signals — daypart + hours_utc | `ucp-v5.2-nlaq-spec.md` §4.4 |
| VAC space_id declaration in MCP initialize | `ucp-v5.2-nlaq-spec.md` §5.1 |
| MCP tool schemas for NLAQ + concept registry | `ucp-v5.2-nlaq-spec.md` §5.2 |
| DTS 1.2 gaps — "Derived" methodology undocumented | IAB DTS issue log |
| DTS 1.2 gaps — temporal_scope field missing | IAB DTS issue log |
| DTS 1.2 gaps — "Public Record: Census" not in data_sources enum | IAB DTS issue log |