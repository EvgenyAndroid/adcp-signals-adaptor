# Architecture

AdCP Signals Adaptor — Cloudflare Worker implementing AdCP 2.6 Signals Activation Protocol with UCP v0.1/v0.2-draft extensions.

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

Value normalization: `normalizeValue()` canonicalizes Claude output variants (e.g. `"150k+"` ↔ `"150k_plus"`, `"50k-100k"` ↔ `"50k_100k"`) so Pass 1 matches regardless of which form the LLM produces.

#### `getAllSignalsForCatalog()` — D1 CanonicalSignal[] → CatalogSignal[]

Adapter that transforms the full D1 catalog into the flat `CatalogSignal[]` shape consumed by `queryResolver.ts`. Handles both `signal.id` and `signal.signal_agent_segment_id` field variants from D1.

---

### NL Query Pipeline (v2.1 — Hybrid Resolver)

```
POST /signals/query
  │
  ├── queryParser.ts
  │     Input:  free-form query string
  │     Output: AudienceQueryAST (boolean tree)
  │     Model:  Claude API (claude-sonnet-4-20250514)
  │     Handles: archetypes, negation, geo, temporal scope, content titles
  │     Key rule (v2.1): "35+" maps to age_band "35-44" only — no multi-band expansion
  │
  ├── queryResolver.ts  ← HYBRID three-pass pipeline
  │     Input:  AudienceQueryAST root + CatalogSignal[] + EmbeddingEngine (injected)
  │     Output: ResolvedLeaf[] + pseudoEmbeddingWarning flag
  │
  │     PASS 1 — Exact rule match (always runs first, zero latency)
  │       inferRulesFromSignalId() map + normalizeValue() → direct dimension/value hit
  │       match_method: "exact_rule", match_score: 0.95
  │       If Pass 1 hits → Pass 2 and 3 are SKIPPED for this leaf
  │
  │     PASS 2 — Embedding similarity (runs if Pass 1 misses, engine available)
  │       SemanticResolver embeds leaf.description via EmbeddingEngine.embedText()
  │       Embeds all catalog signals via EmbeddingEngine.embedSignal() (parallel Promise.all)
  │       Ranks by cosine similarity; filters at MIN_EMBEDDING_SCORE = 0.45
  │       match_method: "embedding_similarity"
  │       Threshold rationale: scores < 0.45 are noise not signal (e.g. "coffee" →
  │       "College Educated Streamers" at 0.30 — semantically wrong, correctly rejected)
  │       If Pass 2 hits → Pass 3 is SKIPPED
  │
  │     PASS 3 — Lexical fallback (runs if Pass 1+2 both miss)
  │       Jaccard token overlap between leaf description/value and signal semantic text
  │       buildSignalSemanticText(): description → name → category → taxonomy_id (priority)
  │       Lexical score threshold: 0.15 (raised from 0.05 to reduce noise on unrelated dims)
  │       match_method: "lexical_fallback", score: Jaccard × 1.5 capped at 0.75
  │
  │     TITLE_GENRE_MAP (content_title leaves, pre-Pass 1):
  │       desperate_housewives → drama → sig_drama_viewers (score × 0.90 discount)
  │       grey_s_anatomy / the_crown / succession / breaking_bad → drama
  │       the_office / friends / seinfeld → comedy
  │       star_wars / the_mandalorian / stranger_things → sci_fi
  │       planet_earth / free_solo → documentary
  │       avengers / john_wick → action
  │       match_method: "title_genre_inference"
  │
  │     ARCHETYPE_TABLE (archetype leaves, runs all 3 passes per constituent):
  │       soccer_mom:
  │         age_band:35-44 (w=0.35), household_type:family_with_kids (w=0.40),
  │         income_band:50k-100k (w=0.15), interest:youth_sports (w=0.10)
  │       urban_professional:
  │         education:college (w=0.30), household_type:urban_professional (w=0.35),
  │         income_band:100k-150k (w=0.35)
  │       affluent_family / affluent_families:
  │         income_band:150k+ (w=0.40), household_type:family_with_kids (w=0.35),
  │         education:graduate (w=0.25)
  │       cord_cutter:
  │         streaming_affinity:high (w=0.60), age_band:25-34 (w=0.25),
  │         income_band:50k-100k (w=0.15)
  │       Weight applied ONCE in aggregation loop (double-weight bug fixed in v2.0)
  │       match_method: "archetype_expansion"
  │
  │     REQUEST-SCOPED ENGINE:
  │       EmbeddingEngine injected by nlQueryHandler — ONE instance per request
  │       Query vectors and candidate vectors always use same model/space
  │       Never mix pseudo↔llm spaces within one request
  │       pseudoEmbeddingWarning flag set if pseudo engine is active
  │
  │     UNRESOLVED LEAF HANDLING:
  │       Pass 1+2+3 all miss → unresolved: true, matches: []
  │       Examples: geo:Nashville (no DMA signal), interest:coffee (no beverage signal)
  │       Excluded from Math.min confidence chain in scoreAND()
  │       Apply 0.85^n penalty per unresolved leaf
  │       NOT leaves with unresolved child → exclude_signals: [] (no fabrication)
  │
  ├── nlQueryHandler.ts
  │     Orchestrates the full pipeline
  │     Instantiates ONE EmbeddingEngine per request via createEmbeddingEngine(env)
  │     Adapts ResolvedLeaf[] (new shape) → LeafResolution[] (CompositeScorer shape)
  │     via adaptToLeafResolutions() + toCatalogSignalForScorer()
  │     defaultCoverage() provides fallback coverage_percentage by signal ID
  │     Surfaces pseudoEmbeddingWarning in warnings[]
  │     Adds _embedding_mode and _embedding_space to response for transparency
  │
  └── compositeScorer.ts
        Input:  Map<string, LeafResolution> + AudienceQueryAST
        Output: CompositeAudienceResult

        scoreAND():
          Splits resolved vs unresolved children before scoring
          Resolved:   confidence = Math.min(scores) × ∏(coverage_i) × 0.70^(n-1)
          Unresolved: apply 0.85^n penalty (excluded from Math.min chain)
          Confidence floor: Math.max(topMatch.match_score × leaf.confidence,
                                      topMatch.match_score × 0.55)

        scoreOR():
          Union with pairwise overlap deduction
          coverage = Σ(coverage_i) - Σ(overlap_pairs)

        scoreNOT():
          Produces exclude_signals[] for DSP-side suppression
          Applies 0.80 confidence penalty to AND parent
          Unresolved NOT child → exclude_signals: [], warning appended
```

---

### Semantic Resolver (v2.1 — new module)

```
semanticResolver.ts
  Class: SemanticResolver
  Purpose: embedding-based Pass 2 for NLAQ leaf resolution

  Constructor:
    engine: EmbeddingEngine   — injected, same instance for entire request
    topN:   number            — max candidates to return (default 5)
    minScore: number          — minimum cosine to include (default 0.0, filtered by caller)

  resolve(leaf, catalog) → SemanticMatch[]
    1. Embed leaf query text via engine.embedText(buildQueryText(leaf))
    2. Embed all catalog signals via engine.embedSignal(id, semanticText) — parallel Promise.all
    3. Compute cosine similarity for each candidate
    4. Return top-N sorted descending by score

  buildQueryText(leaf):
    Priority: leaf.description (>10 chars) → "dimension: value" → dimension

  buildSignalSemanticText(signal):  [exported pure function]
    Priority: description → name → "Category: X" → "Taxonomy: X" → id
    Deterministic: same inputs → same string → same embedding → testable

  cosineSimilarity(a, b):  [exported pure function]
    Dot product of l2-normalized vectors (both engines return l2-normalized)
    Clamps to [-1, 1] for float precision safety

  SemanticMatch:
    { signalId, signalName, score, match_method: "embedding_similarity" }
```

---

### Embedding Engine (v2.1 — extended)

```
src/ucp/embeddingEngine.ts

  Interface EmbeddingEngine:
    spaceId: string
    phase:   "v1" | "pseudo-v1"
    embedSignal(signalId, description) → Promise<number[]>
    embedText(text)                    → Promise<number[]>   ← NEW in v2.1

  PseudoEmbeddingEngine (phase: "pseudo-v1", spaceId: "adcp-bridge-space-v1.0"):
    embedSignal: DJB2 hash of description → 512-dim pseudo-vector, l2-normalized
    embedText:   DJB2 hash of text → same process
    No external deps. Cosine similarity is NOT semantically meaningful.
    Triggers pseudoEmbeddingWarning in response when used for Pass 2.

  LlmEmbeddingEngine (phase: "v1", spaceId: "openai-te3-small-d512-v1"):
    embedSignal: checks embeddingStore first (stored vectors for 26 catalog signals)
                 Falls back to OpenAI API for dynamic/unknown signals
    embedText:   Always calls OpenAI API (leaf descriptions are unique per query)
    Requires: OPENAI_API_KEY secret + EMBEDDING_ENGINE=llm in wrangler.toml

  createEmbeddingEngine(env):
    EMBEDDING_ENGINE=llm + OPENAI_API_KEY → LlmEmbeddingEngine
    Otherwise                             → PseudoEmbeddingEngine

  Re-exports cosineSimilarity from semanticResolver.ts for backward compatibility
  with server.ts imports.
```

---

### Embedding Store (v2.0)

```
embeddingStore.ts
  Source:     OpenAI text-embedding-3-small API
  Generation: scripts/embed-signals.html (browser tool) → scripts/embeddings.json
              → scripts/generate-embedding-store.js → src/domain/embeddingStore.ts
  Storage:    hardcoded TypeScript at build time (no runtime API calls for catalog signals)

  model_id:   "text-embedding-3-small"
  model_family: "openai/text-embedding-3"
  space_id:   "openai-te3-small-d512-v1"
  dimensions: 512, float32, l2-normalized, cosine distance

  Coverage (26 signals with real vectors):
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

  Fallback:   Dynamic signals → deterministic pseudo-hash
              phase: "pseudo-v1", space_id: "adcp-bridge-space-v1.0"

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
    concept_id, label, category, concept_description
    constituent_dimensions: Array<{ dimension, value, weight }>  — for archetype expansion
    member_nodes: Array<{                                         — cross-taxonomy equivalents
      vendor: "iab"|"liveramp"|"tradedesk"|"experian"|"samba"
      node_id, label, similarity, source: "exact"|"mapped"|"inferred"
    }>

  Storage: in-memory on cold start; KV (TTL 24h) after /ucp/concepts/seed

conceptHandler.ts
  GET  /ucp/concepts                  — list / search / filter
  GET  /ucp/concepts/:concept_id      — exact lookup
  POST /ucp/concepts/seed             — auth required; writes all 19 to KV
  MCP  get_concept, search_concepts
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
  signals table      — canonical signal catalog (49+ signals post-seed)
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
     │                                │  declare space_id: openai-te3-small-d512-v1
     │                                │  phase: "v1"
     │                                │  projector_available: false (Phase 2b)
     │ ◄───────────────────────────── │
     │                                │
     │  GET /signals/X/embedding      │
     │ ─────────────────────────────► │
     │ ◄───────────────────────────── │  512-dim float32 vector
     │                                │  phase: "v1" (real) or "pseudo-v1" (dynamic)
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
  op:           "LEAF";
  dimension:    "age_band" | "income_band" | "education" | "household_type" |
                "metro_tier" | "content_genre" | "streaming_affinity" | "geo" |
                "interest" | "archetype" | "content_title" | "behavioral_absence";
  value:        string;
  description:  string;        // rich text for Pass 2 embedding matching
  concept_id?:  string;        // concept registry anchor
  temporal?:    TemporalScope;
  confidence:   number;        // 0.0–1.0, Claude-assessed
  is_exclusion?: boolean;      // true when inside NOT branch
}

interface AudienceQueryBranch {
  op:       "AND" | "OR" | "NOT";
  children: AudienceQueryNode[];
}
```

Example AST — "soccer moms 35+ in Nashville, don't like coffee, watch Desperate Housewives afternoon":
```json
{
  "op": "AND",
  "children": [
    { "op": "LEAF", "dimension": "archetype",     "value": "soccer_mom",
      "concept_id": "SOCCER_MOM_US" },
    { "op": "LEAF", "dimension": "age_band",      "value": "35-44" },
    { "op": "LEAF", "dimension": "geo",           "value": "nashville",
      "description": "Nashville Tennessee DMA-659" },
    { "op": "LEAF", "dimension": "content_title", "value": "desperate_housewives",
      "temporal": { "daypart": "afternoon", "timezone_inference": "geo" } },
    { "op": "NOT", "children": [
      { "op": "LEAF", "dimension": "interest", "value": "coffee", "is_exclusion": true }
    ]}
  ]
}
```

Production-verified resolution (v2.1 with LLM embeddings):
```
sig_age_35_44:              exact_rule           0.95    resolved ✓ (single band — Rule 7 fix)
sig_drama_viewers:          title_genre_inference 0.855  resolved ✓ (desperate_housewives → drama)
sig_families_with_children: archetype_expansion  0.38   resolved ✓
sig_middle_income_households:archetype_expansion 0.1425  resolved ✓ (soccer_mom constituent)
Nashville geo:              lexical_fallback → urban proxy  honest proxy (no DMA signal)
coffee interest:            unresolved (< 0.45 threshold)  exclude_signals: [] ✓
confidence: 0.051–0.206     tier: narrow                   correct: 2–3 dims unresolved
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
- Unresolved leaves excluded from `Math.min` confidence chain in `scoreAND()`
- Each unresolved leaf: `composite × 0.85` penalty
- Multiple: `composite × 0.85^n`
- Confidence floor per leaf: `Math.max(topMatch.match_score × leaf.confidence, topMatch.match_score × 0.55)`

**Production confidence examples (v2.1):**
```
"affluent families 35-44 who stream heavily"           → 0.76   tier: medium  (4 dims exact_rule)
"streaming heavy watchers cord cutters"                → 0.568  tier: medium  (embedding_similarity active)
"soccer moms 35+ Nashville no coffee Desperate H."    → 0.051  tier: narrow  (3+ unresolved)
```

---

## Match Method Vocabulary (v2.1)

| Value | Description | Score range |
|---|---|---|
| `exact_rule` | dimension+value maps directly to signal rule | 0.95 |
| `embedding_similarity` | cosine similarity ≥ 0.45 via OpenAI vectors | 0.45–1.0 |
| `lexical_fallback` | Jaccard token overlap ≥ 0.15, score × 1.5 capped at 0.75 | 0.075–0.75 |
| `title_genre_inference` | content title → genre via TITLE_GENRE_MAP, then exact_rule × 0.90 | ~0.855 |
| `archetype_expansion` | weighted constituent dimension aggregation | 0.10–0.95 |
| `category_fallback` | broad category match | 0.3–0.5 |

Note: `description_similarity` (v1.0) is retired. All semantic matching is now `embedding_similarity` or `lexical_fallback`.

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

**Regenerating vectors:**
```bash
# 1. Open embed-signals.html in browser, enter OpenAI key, click Embed All
# 2. Copy output JSON, wrap in { } if missing outer braces → save as scripts/embeddings.json
# 3. node scripts/generate-embedding-store.js scripts/embeddings.json > src/domain/embeddingStore.ts
# 4. wrangler deploy
```

**Known catalog gaps (cause narrow tier on some queries):**
- No DMA/geo signals (Nashville, Chicago, etc.) — add to seed/geo-sample.csv
- No beverage/lifestyle interest signals (coffee, wine, etc.) — no catalog signal → unresolved
- No content title signals — resolved via TITLE_GENRE_MAP inference only

---

## Spec Contributions

| Contribution | Location |
|---|---|
| NLAQ — AudienceQueryAST normative schema | `ucp-v0.2-nlaq-spec.md` §3.1 |
| NLAQ — Three-pass hybrid leaf resolution | `ucp-v0.2-nlaq-spec.md` §3.2 |
| NLAQ — Embedding similarity threshold (MIN_EMBEDDING_SCORE=0.45) | `ucp-v0.2-nlaq-spec.md` §3.2.2 |
| NLAQ — TITLE_GENRE_MAP normative mechanism | `ucp-v0.2-nlaq-spec.md` §3.2.2 |
| NLAQ — ARCHETYPE_TABLE + double-weight prohibition | `ucp-v0.2-nlaq-spec.md` §3.2.3 |
| NLAQ — Unresolved dimension penalty model | `ucp-v0.2-nlaq-spec.md` §3.2.4 |
| NLAQ — Compositional AND/OR/NOT scoring formulas | `ucp-v0.2-nlaq-spec.md` §3.3 |
| NLAQ — Confidence tier definitions | `ucp-v0.2-nlaq-spec.md` §3.5 |
| NLAQ — Age band lower-bound parsing rule | `ucp-v0.2-nlaq-spec.md` §3.1 R7 |
| Concept-Level VAC — registry schema | `ucp-v0.2-nlaq-spec.md` §4 |
| Concept-Level VAC — cross-taxonomy member_nodes | `ucp-v0.2-nlaq-spec.md` §4.2 |
| Temporal behavioral signals — daypart + hours_utc | `ucp-v0.2-nlaq-spec.md` §4.4 |
| VAC space_id + phase declaration in MCP initialize | `ucp-v0.2-nlaq-spec.md` §5.2 |
| MCP tool schemas for NLAQ + concept registry | `ucp-v0.2-nlaq-spec.md` §5.1 |
| DTS 1.2 gaps — "Derived" methodology undocumented | IAB DTS issue log |
| DTS 1.2 gaps — temporal_scope field missing | IAB DTS issue log |
| DTS 1.2 gaps — "Public Record: Census" not in data_sources enum | IAB DTS issue log |