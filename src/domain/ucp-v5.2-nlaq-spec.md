# UCP v5.2 Contribution — Natural Language Audience Query (NLAQ)

**Proposed by:** Evgeny Popov, IAB Tech Lab Principal Spec Editor  
**Status:** Draft — v0.3  
**Target:** UCP v5.2, new normative Appendix D  
**Reference implementation:** adcp-signals-adaptor (https://github.com/EvgenyAndroid/adcp-signals-adaptor)

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v0.1 | 2026-02-01 | Initial draft — NLAQ endpoint, AST schema, three-layer model, concept registry stub |
| v0.2 | 2026-02-15 | Concept registry live (19 concepts, 7 categories, cross-taxonomy member_nodes) |
| v0.3 | 2026-03-08 | Real OpenAI embedding vectors deployed (`openai-te3-small-d512-v1`). VAC `space_id` is now semantically valid. Added: TITLE_GENRE_MAP normative mechanism (§3.2.2), content_title leaf type (§3.1 R5), unresolved dimension penalty model (§3.2.4, §3.3.1), double-weight archetype fix (§3.2.3), `is_exclusion` field on NOT-branch leafs (§3.1 R1), `phase` field in VAC declaration (§5.2), production-verified confidence examples (§3.3.4), DTS 1.2 gaps section (§7), full reference implementation status table (§8) |

---

## Abstract

UCP v5.1 defines signal discovery via structured queries (category, taxonomy ID, keyword filter).
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
  "cross_taxonomy": [ /* CrossTaxonomyEntry[] — see §4 */ ]
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
  "match_method": "exact_rule | description_similarity | archetype_expansion | title_genre_inference | category_fallback",
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

`match_method` values:
- `exact_rule` — `dimension`+`value` directly maps to a signal generation rule. Score: 0.808–0.95.
- `description_similarity` — semantic/token comparison between leaf description and signal text.
- `archetype_expansion` — leaf resolved via ARCHETYPE_TABLE constituent dimensions (§3.2.3).
- `title_genre_inference` — content title resolved via TITLE_GENRE_MAP to a genre signal (§3.2.2). Score: 0.70–0.85.
- `category_fallback` — dimension maps to a signal category. Score: 0.3–0.5.

### 2.5 Capability Declaration

Providers that support NLAQ MUST declare it in `get_adcp_capabilities`:

```json
{
  "signals": {
    "nl_query": {
      "supported": true,
      "max_query_length": 2000,
      "decomposition_model": "claude-sonnet-4-20250514",
      "archetype_concepts_supported": 12,
      "temporal_scope_supported": true,
      "negation_supported": true,
      "title_genre_inference_supported": true
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
- **R2.** Archetypes ("soccer moms", "urban professionals", "affluent families") MUST produce `LEAF` nodes with `dimension: "archetype"`. Providers MAY expand archetypes internally; they MUST NOT silently drop them.
- **R3.** Temporal qualifiers MUST attach as `temporal` on the associated LEAF node, not as separate top-level nodes. Example: "watch drama in the afternoon" → single `content_genre` leaf with `temporal.daypart: "afternoon"`.
- **R4.** Conjunctions ("and") MUST produce `AND` branches; disjunctions ("or", "either") MUST produce `OR` branches.
- **R5.** Content titles ("Desperate Housewives", "Grey's Anatomy") MUST produce `LEAF` nodes with `dimension: "content_title"`. Providers resolve titles to genre signals via TITLE_GENRE_MAP (§3.2.2).
- **R6.** Unparseable phrases MUST be collected in `unresolved_hints` and surfaced in `warnings[]`.
- **R7.** Geo references ("in Nashville", "in Austin") MUST produce `LEAF` nodes with `dimension: "geo"` and a `description` containing the resolved DMA identifier where known.

**Example AST — "soccer moms 35+ in Nashville, don't like coffee, watch Desperate Housewives in the afternoon":**

```json
{
  "op": "AND",
  "children": [
    { "op": "LEAF", "dimension": "archetype",     "value": "soccer_mom",
      "concept_id": "SOCCER_MOM_US", "confidence": 0.95 },
    { "op": "LEAF", "dimension": "age_band",      "value": "35+", "confidence": 0.90 },
    { "op": "LEAF", "dimension": "geo",           "value": "Nashville",
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

Each `LEAF` node MUST be resolved against the provider's signal catalog using at least one
of the following methods, in priority order:

#### 3.2.1 Pass 1 — Exact Rule Match

`dimension` + `value` directly maps to a signal's generation rule via a provider-maintained
dimension-to-signal mapping. Score range: 0.808–0.95.

Providers MUST maintain a machine-readable dimension rule map. Reference implementation example:

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

#### 3.2.2 Pass 2 — Description Similarity + TITLE_GENRE_MAP

For leafs that do not match Pass 1, providers SHOULD perform semantic comparison between
`leaf.description` and signal names/descriptions. Providers MAY use embedding cosine similarity;
MAY use token overlap (Jaccard) as fallback.

For `content_title` leafs, providers MUST consult a **TITLE_GENRE_MAP** before falling back to
generic similarity. The TITLE_GENRE_MAP resolves known content titles to genre signals, bypassing
the need for title-level catalog entries:

```
desperate_housewives  → content_genre: drama        → sig_drama_viewers    (score: 0.78)
grey_s_anatomy        → content_genre: drama        → sig_drama_viewers
the_crown             → content_genre: drama        → sig_drama_viewers
succession            → content_genre: drama        → sig_drama_viewers
breaking_bad          → content_genre: drama        → sig_drama_viewers
better_call_saul      → content_genre: drama        → sig_drama_viewers
the_office            → content_genre: comedy       → sig_comedy_fans
friends               → content_genre: comedy       → sig_comedy_fans
star_wars             → content_genre: sci_fi       → sig_sci_fi_enthusiasts
the_mandalorian       → content_genre: sci_fi       → sig_sci_fi_enthusiasts
planet_earth          → content_genre: documentary  → sig_documentary_viewers
march_of_the_penguins → content_genre: documentary  → sig_documentary_viewers
```

Providers SHOULD maintain TITLE_GENRE_MAP as an extensible registry. IAB Tech Lab SHOULD
publish a reference list as part of the Content Taxonomy. `match_method` for title-resolved
signals MUST be `"title_genre_inference"`.

#### 3.2.3 Pass 3 — Archetype Expansion

`archetype` leafs MUST be expanded to weighted constituent dimension leaves using a provider-defined
**ARCHETYPE_TABLE**. Each constituent is resolved independently (Passes 1–2); scores are aggregated
by weighted average.

Normative ARCHETYPE_TABLE (minimum required for conformance):

```
soccer_mom:
  { dimension: "age_band",           value: "35-44",           weight: 0.35 }
  { dimension: "household_type",     value: "family_with_kids", weight: 0.40 }
  { dimension: "income_band",        value: "50k-100k",         weight: 0.15 }
  { dimension: "interest",           value: "youth_sports",     weight: 0.10 }

urban_professional:
  { dimension: "education",          value: "college",          weight: 0.30 }
  { dimension: "household_type",     value: "urban_professional",weight: 0.35 }
  { dimension: "income_band",        value: "100k+",            weight: 0.35 }

affluent_family:
  { dimension: "income_band",        value: "150k+",            weight: 0.40 }
  { dimension: "household_type",     value: "family_with_kids", weight: 0.35 }
  { dimension: "education",          value: "graduate",         weight: 0.25 }
```

**Archetype expansion implementation requirements:**

- Each archetype pseudo-leaf MUST carry `confidence: 1.0` before weighting.
- Weight MUST be applied exactly once to the resolved leaf score.
- Providers MUST NOT apply weight twice. Double-weighting inflates archetype confidence 3×
  (e.g., producing 0.085 instead of correct 0.285 for a soccer_mom archetype expansion in
  pre-v0.3 reference implementations).
- The `concept_id` field on the archetype leaf SHOULD reference the concept registry (§4).

#### 3.2.4 Unresolved Leaf Handling

A leaf is **unresolved** when no catalog signal matches any of the three passes (e.g., a `geo`
leaf for a DMA with no geo signal, an `interest` leaf for a category not in the catalog, or a
`NOT` child whose signal does not exist).

Unresolved leaves MUST NOT cause the entire query to fail. Providers MUST:

1. **Exclude** the unresolved leaf from the `Math.min` confidence chain in AND scoring (§3.3.1). Do not let a single unresolvable dimension veto the confidence of all resolved dimensions.
2. **Apply** a per-unresolved-leaf confidence penalty of `× 0.85` to the final composite score.
3. **Append** a descriptive warning to `warnings[]` identifying the unresolved dimension.
4. For `NOT` branches whose child leaf is unresolved: return `exclude_signals: []` (empty list). Do not fabricate an exclusion signal.

This ensures that a query like "soccer moms in Nashville who don't like coffee" returns a valid,
honest result (confidence ~0.195, tier: `narrow`) rather than a zero-confidence failure or a
fabricated Nashville signal.

### 3.3 Layer 3 — Compositional Scoring

The provider MUST implement set arithmetic over resolved audiences:

#### 3.3.1 AND (Intersection)

```
resolved_confidence  = Math.min(match_scores of resolved children only)
unresolved_penalty   = 0.85 ^ (count of unresolved children)
estimated_size       = baseline × ∏(coverage_i for resolved children) × 0.70^(n-1)
confidence           = resolved_confidence × unresolved_penalty
```

Where:
- `baseline` = 240,000,000 (US adult population)
- `overlap_factor` = 0.70 (RECOMMENDED default; providers MAY tune per vertical)
- `n` = total AND children count (resolved + unresolved)

**Confidence floor per leaf:**
```
leaf_confidence = Math.max(topMatch.match_score × leaf.confidence,
                            topMatch.match_score × 0.55)
```
The 0.55 floor prevents an AST leaf with low parser confidence from zeroing out a high-quality
catalog match.

Rationale for excluding unresolved leaves from `Math.min`: an unresolvable dimension (no
catalog signal) should reduce confidence proportionally, not veto the result. A geo dimension
with no DMA signal should not reduce confidence to zero when age, income, and content affinity
are all well-matched.

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

The 0.80 penalty is REQUIRED. Negation signals carry inherent uncertainty: absence of observed
behavior is not equivalent to absence of preference.

NOT nodes MUST produce `exclude_signals` entries, not positive matches. Activation payloads
carrying NLAQ results SHOULD pass `exclude_signals` to DSPs as segment exclusions.

#### 3.3.4 Production-Verified Confidence Examples

The following outputs from the reference implementation SHOULD be used as conformance test cases:

| Query | confidence | tier | Notes |
|---|---|---|---|
| "affluent families 35-44 who stream heavily" | 0.686 | `medium` | All 4 dims resolved via exact_rule |
| "soccer moms 35+ in Nashville, no coffee, watch Desperate Housewives afternoon" | 0.195 | `narrow` | 3 unresolved (Nashville, coffee, no ACR signal); drama resolved via title_genre_inference |
| "adults 35-44 who are families with children" | 0.808 | `medium` | 2 exact_rule dims, no unresolved |

---

## 4. Concept-Level VAC (Concept Registry)

### 4.1 Motivation

The model-level Vector Alignment Contract (UCP v5.1 §6) aligns embedding spaces between agents.
Taxonomy fragmentation requires a parallel alignment mechanism at the concept level: a shared
registry that maps semantically equivalent nodes from different vendor taxonomies to a canonical
concept with a stable ID and canonical embedding.

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

**`member_nodes.source` values:**
- `exact` — direct one-to-one taxonomy mapping
- `mapped` — semantic mapping with similarity ≥ 0.80
- `inferred` — embedding-based similarity < 0.80 but ≥ threshold

### 4.3 Registry Endpoint

Signal providers MAY expose:

```
GET /ucp/concepts/{concept_id}
GET /ucp/concepts?q={search_term}&category={category}&limit={n}
POST /ucp/concepts/seed    // admin only — re-seeds KV store from in-memory registry
```

**Supported `category` filter values:**
`demographic`, `interest`, `behavioral`, `geo`, `archetype`, `content`, `purchase_intent`

The reference implementation exposes 19 concepts across all 7 categories at production.
IAB Tech Lab SHOULD maintain a canonical registry at a stable URL. Providers import and extend locally.

**Reference implementation concept coverage (v0.3):**

| Category | Count | Examples |
|---|---|---|
| `archetype` | 3 | SOCCER_MOM_US, URBAN_PROFESSIONAL_US, AFFLUENT_FAMILY_US |
| `demographic` | 5 | HIGH_INCOME_HOUSEHOLD_US, GRADUATE_EDUCATED_US, FAMILY_WITH_CHILDREN_US, SENIOR_HOUSEHOLD_US, YOUNG_SINGLE_ADULT_US |
| `interest` | 3 | DRAMA_VIEWER_US, STREAMING_ENTHUSIAST_US, SCI_FI_ENTHUSIAST_US |
| `behavioral` | 2 | AFTERNOON_DRAMA_VIEWER_US, HEAVY_STREAMER_US |
| `geo` | 2 | NASHVILLE_DMA_US, NYC_DMA_US |
| `content` | 2 | DRAMA_CONTENT_US, DOCUMENTARY_CONTENT_US |
| `purchase_intent` | 2 | PREMIUM_CONSUMER_US, FAMILY_CPG_SHOPPER_US |

### 4.4 Temporal Behavioral Signals

Content-title and daypart signals derived from ACR data SHOULD declare `temporal_scope` at the
signal level — not as query-time annotations only. This enables DSPs to select the correct
temporal variant at activation time without relying on the buyer agent to carry temporal context.

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

This is the first normative definition of `temporal_scope` at the signal level in UCP.
ACR-derived temporal behavioral signals are a first-class signal type — not an extension.
CTV data providers (e.g., Samba TV) are the canonical source for this signal class.

**DTS 1.2 gap:** The current DTS 1.2 spec does not include `temporal_scope` as a declared field.
Until resolved, providers SHOULD include `temporal_scope` as an `x_` extension on the DTS envelope.

---

## 5. MCP Layer Integration

### 5.1 Tool Definitions

**`query_signals_nl`** — REQUIRED if `nl_query.supported: true`

```json
{
  "name": "query_signals_nl",
  "description": "Find audience signals matching a natural language description. Decomposes the query into a boolean AST, resolves each dimension against the signal catalog, and returns ranked matches with a compositional audience size estimate. Use when the user describes a target audience in free-form language.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language audience description. E.g. 'soccer moms 35+ who stream heavily', 'urban professionals without children who watch sci-fi'.",
        "maxLength": 2000
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of matched signals to return. Range 1–50.",
        "minimum": 1,
        "maximum": 50,
        "default": 10
      }
    },
    "required": ["query"]
  }
}
```

**`get_concept`** — RECOMMENDED if concept registry is supported

```json
{
  "name": "get_concept",
  "description": "Look up a canonical advertising concept by concept_id. Returns constituent dimensions (for archetype expansion), cross-taxonomy member nodes (IAB, LiveRamp, TradeDesk, Experian, Samba), and the canonical embedding vector.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "concept_id": {
        "type": "string",
        "description": "Stable concept identifier. E.g. SOCCER_MOM_US, HIGH_INCOME_HOUSEHOLD_US, DRAMA_VIEWER_US."
      }
    },
    "required": ["concept_id"]
  }
}
```

**`search_concepts`** — RECOMMENDED if concept registry is supported

```json
{
  "name": "search_concepts",
  "description": "Search the concept registry by natural language query or filter by category. Returns matching concepts with constituent dimensions and cross-taxonomy equivalents.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "q":        { "type": "string", "description": "Free text. E.g. 'afternoon drama viewer'." },
      "category": { "type": "string", "enum": ["demographic","interest","behavioral","geo","archetype","content","purchase_intent"] },
      "limit":    { "type": "number", "minimum": 1, "maximum": 50, "default": 10 }
    },
    "required": []
  }
}
```

### 5.2 VAC Negotiation (from v5.1 §6, extended)

During MCP `initialize`, providers MUST declare embedding space, phase, and NLAQ capability:

```json
{
  "serverInfo": {
    "ucp": {
      "space_id":            "openai-te3-small-d512-v1",
      "phase":               "v1",
      "projector_available": false,
      "nl_query": {
        "supported":       true,
        "archetype_count": 3,
        "concept_count":   19
      },
      "concept_registry": {
        "supported":     true,
        "endpoint":      "/ucp/concepts",
        "concept_count": 19,
        "categories":    ["demographic","interest","behavioral","geo","archetype","content","purchase_intent"]
      }
    }
  }
}
```

**`phase` field — normative values:**

| Value | Meaning |
|---|---|
| `"v1"` | Real embedding vectors from the model declared in `space_id`. Cosine similarity between agents using the same model is mathematically valid without a projector. |
| `"pseudo-v1"` | Deterministic hash-based vectors. `space_id` is declared but not semantically grounded. Cosine similarity is not guaranteed to be meaningful. |

Providers MUST NOT declare `"v1"` unless vectors were generated from the model declared in `space_id`.

**Phase 2b — Projector:**

When `projector_available: true`, providers MUST expose:

```
GET /ucp/projector
→ {
    from_space:  "openai-te3-small-d512-v1",
    to_space:    "ucp-space-v1.0",
    algorithm:   "procrustes_svd",
    matrix:      [...],
    signed_at:   "2026-03-08T00:00:00Z",
    signature:   "..."
  }
```

The projector enables agents using different embedding models to compare vectors by projecting
into the canonical `ucp-space-v1.0`. Algorithm specification (Procrustes/SVD) is pending IAB
Tech Lab reference model publication. Phase 2b is currently unblocked in the reference
implementation pending that publication.

---

## 6. Spec Gaps Closed by This Appendix

| Gap | Status in v5.1 | Resolution in v5.2 NLAQ |
|---|---|---|
| Taxonomy-anchored fallback | Undefined | §3.2 three-pass leaf resolution |
| Archetype resolution | Undefined | §3.1 R2, §3.2.3 ARCHETYPE_TABLE with normative double-weight rule |
| Negation handling | Undefined | §3.1 R1, §3.3.3 NOT scoring, `exclude_signals`, `is_exclusion` field |
| Content title resolution | Undefined | §3.1 R5, §3.2.2 TITLE_GENRE_MAP normative mechanism |
| Temporal behavioral signals | Undefined | §4.4, `temporal_scope` on signals |
| Concept-level VAC | Undefined | §4 (full section, live registry — 19 concepts, 5 vendors) |
| NLAQ endpoint + MCP tools | Undefined | §2, §5.1 (3 tools) |
| Compositional audience estimation | Undefined | §3.3 normative formulas |
| Unresolved dimension handling | Undefined | §3.2.4, §3.3.1 penalty model |
| Confidence floor per leaf | Undefined | §3.3.1 |
| Phase declaration in VAC | Undefined | §5.2 `phase` field + normative values |
| Projector algorithm | Format defined, algorithm undefined | §5.2 Phase 2b (pending IAB reference model) |

---

## 7. DTS 1.2 Gaps Found During Implementation

The following gaps in IAB DTS 1.2 were surfaced during reference implementation and are filed
for the DTS working group:

| Gap | Current DTS 1.2 behavior | Proposed resolution |
|---|---|---|
| `"Derived"` methodology not in spec | `audience_inclusion_methodology` enum does not list `"Derived"` as a valid value | Add `"Derived"` to the enum; distinguish from `"Modeled"` — `"Derived"` = rule-based cross-tabulation of observed data; `"Modeled"` = statistical extrapolation |
| No `temporal_scope` field | No mechanism to declare daypart or days-of-week scope on a signal | Add optional `temporal_scope` object to DTS signal schema (fields: `daypart`, `hours_utc`, `days`, `timezone_inference`) |
| `"Public Record: Census"` not in data_sources enum | Census ACS-derived signals have no compliant `data_sources` value | Add `"Public Record: Census"` to the `data_sources` enum |

---

## 8. Reference Implementation Status

The `adcp-signals-adaptor` Cloudflare Worker implements all normative requirements of this
appendix as of v5.2-draft v0.3:

| Component | File | Status |
|---|---|---|
| `POST /signals/query` (§2.1) | `src/index.ts` | ✅ live |
| LLM decomposition (§3.1) | `src/domain/queryParser.ts` | ✅ live — claude-sonnet-4-20250514 |
| Three-pass leaf resolution (§3.2) | `src/domain/queryResolver.ts` | ✅ live |
| Dimension rule map (§3.2.1) | `src/domain/signalService.ts` | ✅ live — 20 signal mappings |
| TITLE_GENRE_MAP (§3.2.2) | `src/domain/queryResolver.ts` | ✅ live — 20+ titles |
| ARCHETYPE_TABLE + double-weight fix (§3.2.3) | `src/domain/queryResolver.ts` | ✅ live — 3 archetypes |
| Unresolved leaf penalty (§3.2.4) | `src/domain/compositeScorer.ts` | ✅ live |
| AND/OR/NOT scoring (§3.3) | `src/domain/compositeScorer.ts` | ✅ live |
| Confidence floor (§3.3.1) | `src/domain/compositeScorer.ts` | ✅ live |
| `/ucp/concepts` registry (§4.3) | `src/domain/conceptRegistry.ts` | ✅ live — 19 concepts, 7 categories |
| Cross-taxonomy member_nodes (§4.2) | `src/domain/conceptRegistry.ts` | ✅ live — 5 vendors |
| Temporal scope on signals (§4.4) | `src/domain/signalModel.ts` | ✅ live |
| MCP `query_signals_nl` (§5.1) | `src/domain/nlQueryHandler.ts` | ✅ live |
| MCP `get_concept`, `search_concepts` (§5.1) | `src/domain/conceptHandler.ts` | ✅ live |
| Real embeddings `phase: "v1"` (§5.2) | `src/domain/embeddingStore.ts` | ✅ live — `openai-te3-small-d512-v1`, 26 signals |
| `phase` field in VAC declaration (§5.2) | `src/ucp/vacDeclaration.ts` | ✅ live |
| `/ucp/projector` (§5.2 Phase 2b) | — | ⬜ pending IAB reference model publication |

**Archetype coverage:** `soccer_mom`, `urban_professional`, `affluent_family`.
Extension to 500+ concepts requires IAB Tech Lab canonical registry — proposed separately.

**Embedding coverage:** 26 catalog signals carry real `text-embedding-3-small` 512-dim vectors.
Dynamic signals not present in `embeddingStore.ts` fall back to deterministic pseudo-hash
vectors with `phase: "pseudo-v1"` and `space_id: "adcp-bridge-space-v1.0"`.

---

*End of Appendix D — Natural Language Audience Query (NLAQ) v0.3*