# UCP v0.2 Contribution — Natural Language Audience Query (NLAQ)

**Proposed by:** Evgeny Popov, IAB Tech Lab Principal Spec Editor  
**Status:** Draft — v0.4  
**Target:** UCP v0.2, new normative Appendix D  
**Reference implementation:** adcp-signals-adaptor (https://github.com/EvgenyAndroid/adcp-signals-adaptor)

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v0.1 | 2026-02-01 | Initial draft — NLAQ endpoint, AST schema, three-layer model, concept registry stub |
| v0.2 | 2026-02-15 | Concept registry live (19 concepts, 7 categories, cross-taxonomy member_nodes) |
| v0.3 | 2026-03-08 | Real OpenAI embedding vectors deployed (`openai-te3-small-d512-v1`). VAC `space_id` semantically valid. Added: TITLE_GENRE_MAP (§3.2.2), content_title leaf type (§3.1 R5), unresolved dimension penalty model (§3.2.4, §3.3.1), double-weight archetype fix (§3.2.3), `is_exclusion` on NOT leafs (§3.1 R1), `phase` field in VAC (§5.2), production-verified confidence examples (§3.3.4), DTS 1.2 gaps (§7), implementation status table (§8) |
| v0.4 | 2026-03-08 | Hybrid resolver live with real embeddings. Added: MIN_EMBEDDING_SCORE normative threshold (§3.2.2), lexical threshold floor (§3.2.3), `embedding_similarity` and `lexical_fallback` match_method values (§2.4), age band lower-bound parsing rule R8 (§3.1), `cord_cutter` to normative ARCHETYPE_TABLE (§3.2.3), `embedText()` requirement on EmbeddingEngine interface (§5.2), updated production confidence table (§3.3.4), SemanticResolver normative description (§3.2.2) |

---

## Abstract

UCP v0.1 defines signal discovery via structured queries (category, taxonomy ID, keyword filter).
This appendix specifies **Natural Language Audience Query (NLAQ)**: a mechanism by which a buyer
agent may express a target audience as free-form text, and a signal provider MUST return ranked
matching signals with compositional audience estimates.

NLAQ addresses the gap between how humans specify targeting intent ("soccer moms in Nashville who
watch drama in the afternoon") and the structured vocabularies required by existing protocol
endpoints. It is not a replacement for structured queries — it is a translation layer above them.

---

## 1. Problem Statement

### 1.1 Compositional Audience Complexity

Real advertising targeting intent is compositional. A single audience description may simultaneously express:

| Dimension | Example | Challenge |
|---|---|---|
| Demographic | "women aged 35+" | Multi-value age band range |
| Archetype | "soccer moms" | Cultural composite, not a taxonomy node |
| Geo | "live in Nashville" | DMA resolution, cultural context |
| Negation | "don't like coffee" | Exclusion signal — not a filter |
| Content affinity | "watch Desperate Housewives" | Title-level, below genre taxonomy |
| Temporal | "in the afternoon" | Daypart-scoped behavioral signal |

No existing UCP endpoint handles this as a single request. Buyers must decompose manually,
issue multiple `get_signals` calls, and reassemble — a brittle, non-portable pattern that
breaks interoperability between buyer agents with different decomposition logic.

### 1.2 Taxonomy Fragmentation

Different signal providers use different taxonomies (IAB AT 1.1, LiveRamp proprietary,
TTD proprietary). NLAQ sidesteps bilateral crosswalk agreements by anchoring on semantic
meaning expressed in natural language, which any provider can independently resolve against
their own taxonomy.

---

## 2. Protocol Definition

### 2.1 Endpoint

Signal providers that support NLAQ MUST expose:

```
POST /signals/query
Content-Type: application/json
Authorization: Bearer {token}
```

### 2.2 Request Object (`NLQueryRequest`)

```json
{
  "query": "string",      // REQUIRED. Natural language audience description. Max 2000 chars.
  "limit": 10             // OPTIONAL. Max matched_signals returned. Range 1–50. Default 10.
}
```

### 2.3 Response Object (`NLQueryResponse`)

```json
{
  "nl_query": "string",
  "estimated_size": 1700,
  "confidence": 0.72,
  "confidence_tier": "low",
  "matched_signals": [ /* RankedSignal[] — see §2.4 */ ],
  "exclude_signals":  [ /* RankedSignal[] — signals to suppress at activation */ ],
  "dimension_breakdown": [ /* DimensionBreakdown[] — per-dimension transparency */ ],
  "warnings": [ "string" ],
  "cross_taxonomy": [ /* CrossTaxonomyEntry[] — see §4 */ ],
  "_embedding_mode": "v1 | pseudo-v1",     // transparency field
  "_embedding_space": "openai-te3-small-d512-v1 | adcp-bridge-space-v1.0"
}
```

**confidence_tier** MUST be one of:

| Tier | Conditions |
|---|---|
| `high` | confidence ≥ 0.75 AND estimated_size ≥ 1,000,000 |
| `medium` | confidence ≥ 0.55 |
| `low` | confidence < 0.55 |
| `narrow` | estimated_size < 50,000 OR confidence < 0.40 |

Buyers MUST NOT activate `narrow` tier results without explicit user confirmation.

### 2.4 RankedSignal Object

```json
{
  "signal_agent_segment_id": "sig_drama_viewers",
  "name": "Drama Viewers",
  "match_score": 0.87,
  "match_method": "exact_rule | embedding_similarity | lexical_fallback | archetype_expansion | title_genre_inference | category_fallback",
  "estimated_audience_size": 14400000,
  "coverage_percentage": 0.06,
  "temporal_scope": {
    "daypart": "afternoon",
    "hours_utc": [17, 22],
    "timezone_inference": "geo"
  },
  "concept_id": "DRAMA_VIEWER_US",
  "is_exclusion": false
}
```

**`match_method` normative values (v0.4):**

| Value | Description | Score range |
|---|---|---|
| `exact_rule` | `dimension`+`value` directly maps to a signal generation rule | 0.95 |
| `embedding_similarity` | cosine similarity ≥ MIN_EMBEDDING_SCORE via declared embedding model | MIN_EMBEDDING_SCORE–1.0 |
| `lexical_fallback` | Jaccard token overlap ≥ lexical threshold; used only when embedding unavailable | 0.075–0.75 |
| `title_genre_inference` | content title resolved via TITLE_GENRE_MAP to genre signal, then exact_rule × 0.90 | ~0.855 |
| `archetype_expansion` | weighted constituent dimension aggregation via ARCHETYPE_TABLE | 0.10–0.95 |
| `category_fallback` | broad category match | 0.3–0.5 |

Note: `description_similarity` (v0.1–v0.2) is deprecated in favor of `embedding_similarity` and `lexical_fallback`.

### 2.5 Capability Declaration

Providers that support NLAQ MUST declare it in `get_adcp_capabilities`:

```json
{
  "signals": {
    "nl_query": {
      "supported": true,
      "max_query_length": 2000,
      "decomposition_model": "claude-sonnet-4-20250514",
      "archetype_concepts_supported": 4,
      "temporal_scope_supported": true,
      "negation_supported": true,
      "title_genre_inference_supported": true,
      "embedding_pass_supported": true,
      "min_embedding_score": 0.45
    }
  }
}
```

---

## 3. Normative Processing Model

Providers MUST implement NLAQ in three layers. The layers are specified normatively;
implementations are free to use any mechanism that produces conformant output.

### 3.1 Layer 1 — LLM Decomposition

The provider MUST parse the natural language query into an **AudienceQueryAST** — a boolean
tree of typed leaf nodes. The AST MUST conform to the following schema:

```typescript
type AudienceQueryNode = AudienceQueryLeaf | AudienceQueryBranch;

interface AudienceQueryLeaf {
  op: "LEAF";
  dimension: "age_band" | "income_band" | "education" | "household_type" |
             "metro_tier" | "content_genre" | "streaming_affinity" | "geo" |
             "interest" | "archetype" | "content_title" | "behavioral_absence";
  value:        string;
  description:  string;       // rich natural language for embedding resolution
  concept_id?:  string;       // concept registry anchor (§4)
  temporal?:    TemporalScope;
  confidence:   number;       // 0–1, provider-assessed
  is_exclusion?: boolean;     // MUST be true when leaf appears inside a NOT branch
}

interface AudienceQueryBranch {
  op:       "AND" | "OR" | "NOT";
  children: AudienceQueryNode[];
}

interface TemporalScope {
  daypart?:           "morning" | "afternoon" | "primetime" | "latenight" | "overnight";
  hours_utc?:         [number, number];
  days?:              string[];
  timezone_inference: "geo" | "utc" | "local";
}
```

**Normative decomposition rules:**

- **R1.** Negations ("don't like X", "excluding", "not interested in") MUST produce `NOT` nodes. The child leaf MUST carry `is_exclusion: true`.
- **R2.** Archetypes ("soccer moms", "urban professionals", "affluent families", "cord cutters") MUST produce `LEAF` nodes with `dimension: "archetype"`. Providers MAY expand archetypes internally; they MUST NOT silently drop them.
- **R3.** Temporal qualifiers MUST attach as `temporal` on the associated LEAF node. Example: "watch drama in the afternoon" → `content_genre` leaf with `temporal.daypart: "afternoon"`.
- **R4.** Conjunctions ("and") MUST produce `AND` branches; disjunctions ("or", "either") MUST produce `OR` branches.
- **R5.** Content titles ("Desperate Housewives", "Grey's Anatomy") MUST produce `LEAF` nodes with `dimension: "content_title"`. Providers resolve titles to genre signals via TITLE_GENRE_MAP (§3.2.2).
- **R6.** Unparseable phrases MUST be collected in `unresolved_hints` and surfaced in `warnings[]`.
- **R7.** Geo references ("in Nashville", "in Austin") MUST produce `LEAF` nodes with `dimension: "geo"` and a `description` containing the resolved DMA identifier where known.
- **R8.** Age lower bounds: "35+" or "over 35" MUST produce a single `age_band: "35-44"` leaf. Providers MUST NOT expand a lower-bound expression into multiple older bands. Additional bands MUST only be added when the query explicitly names a range (e.g. "35 to 54" → two leaves: "35-44" and "45-54"). Rationale: multi-band expansion from a single lower bound over-constrains AND scoring and inflates the catalog match surface.

**Example AST — "soccer moms 35+ in Nashville, don't like coffee, watch Desperate Housewives afternoon":**

```json
{
  "op": "AND",
  "children": [
    { "op": "LEAF", "dimension": "archetype",     "value": "soccer_mom",
      "concept_id": "SOCCER_MOM_US", "confidence": 0.95 },
    { "op": "LEAF", "dimension": "age_band",      "value": "35-44", "confidence": 0.90 },
    { "op": "LEAF", "dimension": "geo",           "value": "nashville",
      "description": "Nashville Tennessee DMA-659", "confidence": 0.85 },
    { "op": "LEAF", "dimension": "content_title", "value": "desperate_housewives",
      "temporal": { "daypart": "afternoon", "timezone_inference": "geo" },
      "confidence": 0.80 },
    { "op": "NOT", "children": [
      { "op": "LEAF", "dimension": "interest", "value": "coffee",
        "is_exclusion": true, "confidence": 0.90 }
    ]}
  ]
}
```

### 3.2 Layer 2 — Leaf Resolution

Each `LEAF` node MUST be resolved against the provider's signal catalog using exactly one of the following three passes, in strict priority order. If a higher-priority pass produces results, lower passes MUST NOT run for that leaf.

#### 3.2.1 Pass 1 — Exact Rule Match

`dimension` + `value` directly maps to a signal's generation rule via a provider-maintained
dimension-to-signal mapping. Score: 0.95 (fixed).

Providers MUST implement value normalization to handle LLM output variants (e.g. `"150k+"` ↔ `"150k_plus"`, `"50k-100k"` ↔ `"50k_100k"`). Reference normalizer:
```
normalizeValue(v) = v.toLowerCase().replace(/\+/g, "_plus").replace(/[-\s]/g, "_")
```

Reference implementation dimension rule map:
```
{ dimension: "age_band",           value: "35-44" }           → sig_age_35_44
{ dimension: "age_band",           value: "45-54" }           → sig_age_45_54
{ dimension: "household_type",     value: "family_with_kids" } → sig_families_with_children
{ dimension: "streaming_affinity", value: "high" }            → sig_streaming_enthusiasts
{ dimension: "content_genre",      value: "drama" }           → sig_drama_viewers
{ dimension: "content_genre",      value: "comedy" }          → sig_comedy_fans
{ dimension: "content_genre",      value: "sci_fi" }          → sig_sci_fi_enthusiasts
{ dimension: "income_band",        value: "150k+" }           → sig_high_income_households
{ dimension: "income_band",        value: "100k-150k" }       → sig_upper_middle_income
{ dimension: "education",          value: "graduate" }        → sig_graduate_educated_adults
```

#### 3.2.2 Pass 2 — Embedding Similarity

When Pass 1 misses, providers SHOULD embed `leaf.description` using the declared EmbeddingEngine
and compare against all catalog signals by cosine similarity.

**EmbeddingEngine interface requirements (v0.4):**

```typescript
interface EmbeddingEngine {
  readonly spaceId: string;
  readonly phase:   "v1" | "pseudo-v1";
  embedSignal(signalId: string, description: string): Promise<number[]>;
  embedText(text: string): Promise<number[]>;   // NEW: embeds arbitrary query text
}
```

`embedText()` is required so that query leaf descriptions can be embedded using the SAME engine
instance as catalog signals. Providers MUST NOT embed query text with one model and catalog signals
with another — this produces incoherent cosine comparisons.

**SemanticResolver pattern (normative reference):**

```
resolve(leaf, catalog):
  1. queryVec = engine.embedText(buildQueryText(leaf))
  2. [candidateVecs] = await Promise.all(catalog.map(s => engine.embedSignal(s.id, buildSignalSemanticText(s))))
  3. score_i = cosineSimilarity(queryVec, candidateVec_i)
  4. return top-N candidates where score_i >= MIN_EMBEDDING_SCORE, sorted descending
```

**buildSignalSemanticText(signal) — canonical signal text derivation:**
```
Priority: description → name → "Category: {category}" → "Taxonomy: {taxonomy_id}" → signal_id
```
Must be deterministic: same inputs → same string → same vector → reproducible results.

**MIN_EMBEDDING_SCORE = 0.45 (NORMATIVE)**

Providers MUST apply a minimum embedding similarity threshold before accepting a Pass 2 result.
The RECOMMENDED value is 0.45 for `text-embedding-3-small` 512-dim vectors.

Rationale: without a threshold, semantically unrelated signals produce low but non-zero cosine
scores and appear as matches. Example: "coffee" interest leaf → "College Educated Heavy Streamers"
at cosine 0.30 — factually wrong. At threshold 0.45 this is correctly rejected and the leaf
falls through to unresolved. Providers SHOULD tune this value based on their embedding model and
catalog density; values below 0.35 risk semantic noise.

**TITLE_GENRE_MAP** — for `content_title` leafs, providers MUST consult this map before
running general embedding similarity:

```
desperate_housewives  → drama      grey_s_anatomy    → drama
the_crown             → drama      succession        → drama
breaking_bad          → drama      better_call_saul  → drama
the_office            → comedy     friends           → comedy
seinfeld              → comedy     parks_and_recreation → comedy
star_wars             → sci_fi     the_mandalorian   → sci_fi
stranger_things       → sci_fi     the_expanse       → sci_fi
planet_earth          → documentary  free_solo       → documentary
avengers              → action     john_wick         → action
```

Title-matched signals receive `match_method: "title_genre_inference"` and a 0.90× score
discount vs the underlying exact_rule score to reflect the indirect inference.

#### 3.2.3 Pass 3 — Lexical Fallback

When Pass 1 and Pass 2 both miss (no results above MIN_EMBEDDING_SCORE), providers MAY
apply token-based similarity (e.g. Jaccard) as a structural fallback.

**Lexical threshold floor (RECOMMENDED): 0.15**

Matches below this threshold are noise-level and SHOULD be discarded. Rationale: a threshold
of 0.05 (pre-v0.4) allowed dimensions like "coffee" to match age signals via shared common tokens
("adults", "households"), producing misleading `exclude_signals` entries.

`match_method` for lexical results MUST be `"lexical_fallback"`.

**ARCHETYPE_TABLE (Pass 3 for archetype leafs):**

`archetype` leafs MUST be expanded via ARCHETYPE_TABLE regardless of which pass is used for
constituent resolution. Each constituent is resolved independently through Passes 1–2–3.

Normative ARCHETYPE_TABLE (v0.4 — includes `cord_cutter`):

```
soccer_mom:
  { dimension: "age_band",           value: "35-44",           weight: 0.35 }
  { dimension: "household_type",     value: "family_with_kids", weight: 0.40 }
  { dimension: "income_band",        value: "50k-100k",         weight: 0.15 }
  { dimension: "interest",           value: "youth_sports",     weight: 0.10 }

urban_professional:
  { dimension: "education",          value: "college",          weight: 0.30 }
  { dimension: "household_type",     value: "urban_professional",weight: 0.35 }
  { dimension: "income_band",        value: "100k-150k",        weight: 0.35 }

affluent_family:
  { dimension: "income_band",        value: "150k+",            weight: 0.40 }
  { dimension: "household_type",     value: "family_with_kids", weight: 0.35 }
  { dimension: "education",          value: "graduate",         weight: 0.25 }

cord_cutter:  [NEW in v0.4]
  { dimension: "streaming_affinity", value: "high",             weight: 0.60 }
  { dimension: "age_band",           value: "25-34",            weight: 0.25 }
  { dimension: "income_band",        value: "50k-100k",         weight: 0.15 }
```

**Archetype expansion requirements:**
- Each constituent pseudo-leaf MUST carry `confidence: 1.0` before weighting.
- Weight MUST be applied exactly once in the aggregation step.
- Providers MUST NOT apply weight in both the leaf resolver and the aggregation loop (double-weight bug: inflates archetype confidence 3× — observed in pre-v0.3 implementations).

#### 3.2.4 Unresolved Leaf Handling

A leaf is **unresolved** when: Pass 1 produces no match AND Pass 2 produces no result ≥ MIN_EMBEDDING_SCORE AND Pass 3 produces no result ≥ lexical threshold.

Providers MUST:

1. **Exclude** unresolved leaves from `Math.min` confidence chain in AND scoring (§3.3.1).
2. **Apply** `× 0.85` confidence penalty per unresolved leaf.
3. **Append** a descriptive entry to `warnings[]`.
4. For `NOT` branches with unresolved child: return `exclude_signals: []`. Do not fabricate.

### 3.3 Layer 3 — Compositional Scoring

#### 3.3.1 AND (Intersection)

```
resolved_confidence  = Math.min(match_scores of resolved children only)
unresolved_penalty   = 0.85 ^ (count of unresolved children)
estimated_size       = baseline × ∏(coverage_i for resolved children) × 0.70^(n-1)
confidence           = resolved_confidence × unresolved_penalty
```

Where: `baseline` = 240,000,000, `overlap_factor` = 0.70 (RECOMMENDED), `n` = total AND children.

**Confidence floor per leaf:**
```
leaf_confidence = Math.max(topMatch.match_score × leaf.confidence,
                            topMatch.match_score × 0.55)
```

#### 3.3.2 OR (Union)

```
estimated_size = Σ(size_i) - Σ(expected_pairwise_overlap_ij)
```
Expected pairwise overlap: `size_i × (size_j / baseline)`.

#### 3.3.3 NOT (Negation)

```
estimated_size = baseline - child.estimated_size
confidence     = child.confidence × 0.80
```

The 0.80 penalty is REQUIRED. NOT nodes MUST produce `exclude_signals` entries, not positive matches.

#### 3.3.4 Production-Verified Confidence Examples (v0.4)

Reference implementation results with `EMBEDDING_ENGINE=llm`, `openai-te3-small-d512-v1`:

| Query | confidence | tier | Resolver passes used |
|---|---|---|---|
| "affluent families 35-44 who stream heavily" | 0.76 | `medium` | 4× exact_rule |
| "streaming heavy watchers cord cutters" | 0.568 | `medium` | exact_rule + embedding_similarity (cord_cutter→streaming 0.668) |
| "soccer moms 35+ Nashville no coffee watch Desperate Housewives" | 0.051–0.206 | `narrow` | exact_rule + title_genre_inference + archetype_expansion; Nashville lexical proxy; coffee unresolved (< 0.45) |

---

## 4. Concept-Level VAC (Concept Registry)

### 4.1 Motivation

The model-level Vector Alignment Contract (UCP v0.1 §6) aligns embedding spaces between agents.
Taxonomy fragmentation requires a parallel alignment at the concept level: a shared registry that
maps semantically equivalent nodes from different vendor taxonomies to a canonical concept with a
stable ID and canonical embedding.

### 4.2 Concept Registry Entry

```json
{
  "concept_id": "SOCCER_MOM_US",
  "label": "Soccer Mom (US)",
  "category": "archetype",
  "concept_description": "US female adult 35-54 with school-age children, suburban, high vehicle miles driven, active in youth sports scheduling, prime-time and afternoon TV viewer",
  "canonical_embedding": {
    "vector": "[...float32 array...]",
    "space_id": "openai-te3-small-d512-v1",
    "model_id": "text-embedding-3-small"
  },
  "constituent_dimensions": [
    { "dimension": "household_type",     "value": "family_with_kids",  "weight": 0.40 },
    { "dimension": "age_band",           "value": "35-44",             "weight": 0.35 },
    { "dimension": "income_band",        "value": "50k-100k",          "weight": 0.15 },
    { "dimension": "interest",           "value": "youth_sports",      "weight": 0.10 }
  ],
  "member_nodes": [
    { "vendor": "iab",       "node_id": "17",                    "similarity": 0.71, "source": "mapped" },
    { "vendor": "liveramp",  "node_id": "LR_SUBURBAN_MOM_35_50", "similarity": 0.94, "source": "exact" },
    { "vendor": "tradedesk", "node_id": "TTD_FAMILY_DRIVER",     "similarity": 0.88, "source": "mapped" },
    { "vendor": "experian",  "node_id": "EXP_FAMILY_FEMALE_35",  "similarity": 0.82, "source": "inferred" },
    { "vendor": "samba",     "node_id": "sig_families_with_children", "similarity": 0.91, "source": "exact" }
  ],
  "similarity_threshold": 0.85,
  "validated_at": "2026-03-08T00:00:00Z"
}
```

### 4.3 Registry Endpoint

```
GET /ucp/concepts/{concept_id}
GET /ucp/concepts?q={search_term}&category={category}&limit={n}
POST /ucp/concepts/seed    // admin only
```

Categories: `demographic`, `interest`, `behavioral`, `geo`, `archetype`, `content`, `purchase_intent`

Reference implementation: 19 concepts live across all 7 categories.

### 4.4 Temporal Behavioral Signals

```json
{
  "signal_agent_segment_id": "sig_afternoon_drama_viewer",
  "temporal_scope": {
    "daypart": "afternoon",
    "hours_utc": [17, 22],
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "timezone_inference": "geo"
  },
  "data_sources": ["TV OTT or STB Device"],
  "methodology": "Observed/Known",
  "refresh_cadence": "Weekly"
}
```

First normative definition of `temporal_scope` at the signal level in UCP. ACR-derived temporal behavioral signals are a first-class signal type. CTV data providers are the canonical source.

---

## 5. MCP Layer Integration

### 5.1 Tool Definitions

**`query_signals_nl`** — REQUIRED if `nl_query.supported: true`

```json
{
  "name": "query_signals_nl",
  "description": "Find audience signals matching a natural language description. Decomposes the query into a boolean AST, resolves each dimension using a hybrid rule+embedding+lexical pipeline, and returns ranked matches with compositional audience size estimate.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "maxLength": 2000 },
      "limit": { "type": "number", "minimum": 1, "maximum": 50, "default": 10 }
    },
    "required": ["query"]
  }
}
```

**`get_concept`** — RECOMMENDED

```json
{
  "name": "get_concept",
  "description": "Look up a canonical advertising concept by concept_id. Returns constituent dimensions, cross-taxonomy member nodes, and canonical embedding vector.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "concept_id": { "type": "string" }
    },
    "required": ["concept_id"]
  }
}
```

**`search_concepts`** — RECOMMENDED

```json
{
  "name": "search_concepts",
  "description": "Search the concept registry by natural language or category filter.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "q":        { "type": "string" },
      "category": { "type": "string", "enum": ["demographic","interest","behavioral","geo","archetype","content","purchase_intent"] },
      "limit":    { "type": "number", "minimum": 1, "maximum": 50, "default": 10 }
    },
    "required": []
  }
}
```

### 5.2 VAC Negotiation

During MCP `initialize`, providers MUST declare:

```json
{
  "serverInfo": {
    "ucp": {
      "space_id":            "openai-te3-small-d512-v1",
      "phase":               "v1",
      "projector_available": false,
      "nl_query": {
        "supported":          true,
        "min_embedding_score": 0.45,
        "archetype_count":    4,
        "concept_count":      19
      },
      "concept_registry": {
        "supported":     true,
        "endpoint":      "/ucp/concepts",
        "concept_count": 19
      }
    }
  }
}
```

**`phase` normative values:**

| Value | Meaning |
|---|---|
| `"v1"` | Real vectors from declared model. Cosine between same-model agents is valid without projector. |
| `"pseudo-v1"` | Hash-based vectors. Not semantically grounded. Cosine not guaranteed meaningful. |

Providers MUST NOT declare `"v1"` unless vectors were generated from the declared `space_id` model.

**Phase 2b — Projector:**

```
GET /ucp/projector → { from_space, to_space: "ucp-space-v1.0", algorithm: "procrustes_svd", matrix, signed_at, signature }
```

Pending IAB Tech Lab reference model publication.

---

## 6. Spec Gaps Closed by This Appendix

| Gap | Status in v0.1 | Resolution |
|---|---|---|
| Taxonomy-anchored fallback | Undefined | §3.2 three-pass leaf resolution |
| Archetype resolution | Undefined | §3.2.3 ARCHETYPE_TABLE (4 archetypes), double-weight prohibition |
| Negation handling | Undefined | §3.1 R1, §3.3.3 NOT scoring, `exclude_signals`, `is_exclusion` |
| Content title resolution | Undefined | §3.1 R5, §3.2.2 TITLE_GENRE_MAP |
| Temporal behavioral signals | Undefined | §4.4, `temporal_scope` at signal level |
| Concept-level VAC | Undefined | §4 (19 concepts, 5 vendors live) |
| NLAQ endpoint + MCP tools | Undefined | §2, §5.1 (3 tools) |
| Compositional audience estimation | Undefined | §3.3 AND/OR/NOT formulas |
| Unresolved dimension handling | Undefined | §3.2.4, §3.3.1 penalty model |
| Confidence floor per leaf | Undefined | §3.3.1 |
| Phase declaration in VAC | Undefined | §5.2 `phase` field |
| Projector algorithm | Format defined, algorithm undefined | §5.2 Phase 2b |
| Embedding similarity threshold | Undefined | §3.2.2 MIN_EMBEDDING_SCORE = 0.45 |
| Lexical fallback threshold | Undefined | §3.2.3 floor = 0.15 |
| Age band lower-bound parsing | Undefined | §3.1 R8 |
| embedText() on EmbeddingEngine | Undefined | §5.2 interface requirement |

---

## 7. DTS 1.2 Gaps Found During Implementation

| Gap | Current DTS 1.2 | Proposed resolution |
|---|---|---|
| `"Derived"` methodology not in spec | Enum does not list `"Derived"` | Add; distinguish from `"Modeled"` (rule-based cross-tab vs statistical extrapolation) |
| No `temporal_scope` field | No daypart/days scope mechanism | Add optional `temporal_scope` object to signal schema |
| `"Public Record: Census"` not in data_sources enum | No compliant value for ACS-derived signals | Add `"Public Record: Census"` to enum |

---

## 8. Reference Implementation Status (v0.4)

| Component | File | Status |
|---|---|---|
| `POST /signals/query` (§2.1) | `src/index.ts` | ✅ live |
| LLM decomposition (§3.1) | `src/domain/queryParser.ts` | ✅ live — Rule 7+8 in system prompt |
| Pass 1 exact rule (§3.2.1) | `src/domain/queryResolver.ts` | ✅ live — 20 signal mappings + normalizeValue() |
| Pass 2 embedding similarity (§3.2.2) | `src/domain/queryResolver.ts` + `semanticResolver.ts` | ✅ live — MIN_EMBEDDING_SCORE=0.45 |
| TITLE_GENRE_MAP (§3.2.2) | `src/domain/queryResolver.ts` | ✅ live — 25+ titles |
| ARCHETYPE_TABLE + double-weight fix (§3.2.3) | `src/domain/queryResolver.ts` | ✅ live — 4 archetypes incl. cord_cutter |
| Pass 3 lexical fallback (§3.2.3) | `src/domain/queryResolver.ts` | ✅ live — threshold 0.15 |
| Unresolved leaf penalty (§3.2.4) | `src/domain/compositeScorer.ts` | ✅ live |
| AND/OR/NOT scoring (§3.3) | `src/domain/compositeScorer.ts` | ✅ live |
| Confidence floor (§3.3.1) | `src/domain/compositeScorer.ts` | ✅ live |
| SemanticResolver class (§3.2.2) | `src/domain/semanticResolver.ts` | ✅ live — new module v2.1 |
| embedText() on EmbeddingEngine (§5.2) | `src/ucp/embeddingEngine.ts` | ✅ live |
| Request-scoped engine injection | `src/domain/nlQueryHandler.ts` | ✅ live |
| `/ucp/concepts` registry (§4.3) | `src/domain/conceptRegistry.ts` | ✅ live — 19 concepts |
| Cross-taxonomy member_nodes (§4.2) | `src/domain/conceptRegistry.ts` | ✅ live — 5 vendors |
| MCP tools (§5.1) | `src/domain/nlQueryHandler.ts` + `conceptHandler.ts` | ✅ live — 3 tools |
| Real embeddings `phase: "v1"` (§5.2) | `src/domain/embeddingStore.ts` | ✅ live — 26 signals |
| VAC declaration with `phase` field (§5.2) | `src/ucp/vacDeclaration.ts` | ✅ live |
| `/ucp/projector` (§5.2 Phase 2b) | — | ⬜ pending IAB reference model |

---

*End of Appendix D — Natural Language Audience Query (NLAQ) v0.4*