# UCP v5.2 Contribution — Natural Language Audience Query (NLAQ)

**Proposed by:** Evgeny Popov, IAB Tech Lab Principal Spec Editor  
**Status:** Draft — v0.1  
**Target:** UCP v5.2, new normative Appendix D  
**Reference implementation:** adcp-signals-adaptor (https://github.com/EvgenyAndroid/adcp-signals-adaptor)

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

| Dimension       | Example                                 | Challenge                          |
|----------------|-----------------------------------------|------------------------------------|
| Demographic     | "women aged 35+"                        | Multi-value age band range         |
| Archetype       | "soccer moms"                           | Cultural composite, not a taxonomy node |
| Geo             | "live in Nashville"                     | DMA resolution, cultural context   |
| Negation        | "don't like coffee"                     | Exclusion signal — not a filter    |
| Content affinity| "watch Desperate Housewives"            | Title-level, below genre taxonomy  |
| Temporal        | "in the afternoon"                      | Daypart-scoped behavioral signal   |

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

| Tier     | Conditions                                                              |
|----------|-------------------------------------------------------------------------|
| `high`   | confidence ≥ 0.75 AND estimated_size ≥ 1,000,000                       |
| `medium` | confidence ≥ 0.55                                                       |
| `low`    | confidence < 0.55                                                       |
| `narrow` | estimated_size < 50,000 OR confidence < 0.40                            |

Buyers MUST NOT activate `narrow` tier results without explicit user confirmation.

### 2.4 RankedSignal Object

```json
{
  "signal_agent_segment_id": "sig_drama_viewers",
  "name": "Drama Viewers",
  "match_score": 0.87,
  "match_method": "exact_rule | description_similarity | archetype_expansion | category_fallback",
  "estimated_audience_size": 14400000,
  "coverage_percentage": 0.06,
  "temporal_scope": {             // OPTIONAL — present when query specifies daypart
    "daypart": "afternoon",
    "hours_utc": [17, 22],
    "timezone_inference": "geo"
  },
  "concept_id": "DRAMA_VIEWER_US" // OPTIONAL — concept registry anchor (see §4)
}
```

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
      "negation_supported": true
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
  value: string;
  description: string;  // rich natural language description for embedding resolution
  concept_id?: string;  // concept registry anchor (§4)
  temporal?: TemporalScope;
  confidence: number;   // 0–1, provider-assessed
}

interface AudienceQueryBranch {
  op: "AND" | "OR" | "NOT";
  children: AudienceQueryNode[];
}

interface TemporalScope {
  daypart?: "morning" | "afternoon" | "primetime" | "latenight" | "overnight";
  hours_utc?: [number, number];
  days?: string[];
  timezone_inference: "geo" | "utc" | "local";
}
```

**Normative rules for decomposition:**

- R1. Negations ("don't like X", "excluding", "not interested in") MUST produce `NOT` nodes.
- R2. Archetypes ("soccer moms", "urban professionals") MUST produce `LEAF` nodes with `dimension: "archetype"`. Providers MAY expand archetypes internally; they MUST NOT silently drop them.
- R3. Temporal qualifiers MUST attach as `temporal` on the associated LEAF node, not as separate top-level nodes.
- R4. Conjunctions ("and") MUST produce `AND` branches; disjunctions ("or", "either") MUST produce `OR` branches.
- R5. Unparseable phrases MUST be collected in `unresolved_hints` and surfaced in `warnings`.

### 3.2 Layer 2 — Leaf Resolution

Each `LEAF` node MUST be resolved against the provider's signal catalog using at least one
of the following methods, in priority order:

1. **Exact rule match** — `dimension` + `value` directly maps to a signal's generation rule. Score: 0.85–1.0.
2. **Description similarity** — semantic comparison between `leaf.description` and signal name/description. Providers SHOULD use embedding cosine similarity; MAY use token overlap as fallback. Score: proportional to similarity.
3. **Archetype expansion** — archetype leafs are expanded to weighted constituent dimensions (provider-defined). Each constituent is resolved independently; scores are aggregated by weighted average.
4. **Category fallback** — leaf dimension maps to a signal category (`demographic`, `interest`, `geo`). Score: 0.3–0.5.

Providers MUST return the top-N matches per leaf (N ≥ 3) before applying set arithmetic.

### 3.3 Layer 3 — Compositional Scoring

The provider MUST implement set arithmetic over resolved audiences:

**AND (intersection):**
```
estimated_size = baseline × ∏(coverage_i) × overlap_factor^(n-1)
```
Where `baseline` = 240,000,000, `overlap_factor` = 0.70 (RECOMMENDED default), and `n` = number of AND children.

Rationale: real audience dimensions are positively correlated (income and education co-vary).
The independence assumption overstates intersection; the overlap_factor corrects for this.

**OR (union):**
```
estimated_size = ∑(size_i) - ∑(expected_pairwise_overlap_ij)
```
Expected pairwise overlap: `size_i × (size_j / baseline)`.

**NOT (negation):**
```
estimated_size = baseline - child.estimated_size
confidence = child.confidence × 0.80
```
The 0.80 factor is REQUIRED. Negation signals carry inherent uncertainty because absence of
observed behavior is not equivalent to absence of preference.

**NOT nodes MUST produce `exclude_signals` entries**, not positive matches.
Activation payloads carrying NLAQ results SHOULD pass `exclude_signals` to DSPs as segment exclusions.

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
  "concept_description": "US female adult 35-54 with school-age children, suburban, high vehicle miles driven",
  "canonical_embedding": {
    "vector": "[...float32 array...]",
    "space_id": "ucp-space-v1.0",
    "model_id": "..."
  },
  "constituent_dimensions": [
    { "dimension": "household_type", "value": "family_with_kids", "weight": 0.30 },
    { "dimension": "age_band",       "value": "35-44",            "weight": 0.25 },
    { "dimension": "age_band",       "value": "45-54",            "weight": 0.15 },
    { "dimension": "metro_tier",     "value": "top_50",           "weight": 0.15 },
    { "dimension": "streaming_affinity", "value": "medium",       "weight": 0.15 }
  ],
  "member_nodes": [
    { "vendor": "iab",        "node_id": "17",                   "similarity": 0.71 },
    { "vendor": "liveramp",   "node_id": "LR_SUBURBAN_MOM_35_50","similarity": 0.94 },
    { "vendor": "tradedesk",  "node_id": "TTD_FAMILY_DRIVER",    "similarity": 0.88 }
  ],
  "similarity_threshold": 0.85,
  "validated_at": "2026-03-07T00:00:00Z"
}
```

### 4.3 Registry Endpoint

Signal providers MAY expose:
```
GET /ucp/concepts/{concept_id}
GET /ucp/concepts?q={search_term}    // semantic search over concept registry
```

IAB Tech Lab SHOULD maintain a canonical registry at a stable URL. Providers import and
extend locally. Cross-taxonomy entries discovered via embedding similarity are reported in
`cross_taxonomy` of the NLAQ response (§2.3).

### 4.4 Temporal Behavioral Signals

Content-title and daypart signals derived from ACR data SHOULD be declared with:

```json
{
  "signal_agent_segment_id": "sig_desperate_housewives_afternoon_viewer",
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

---

## 5. MCP Layer Integration

### 5.1 Tool Definition

```json
{
  "name": "query_signals_nl",
  "description": "Find audience signals matching a natural language description...",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "maxLength": 2000 },
      "limit": { "type": "number", "minimum": 1, "maximum": 50 }
    },
    "required": ["query"]
  }
}
```

Providers supporting the `/mcp` endpoint MUST expose `query_signals_nl` if they declare
`nl_query.supported: true` in capabilities.

### 5.2 VAC Negotiation (from v5.1 §6, extended)

During MCP `initialize`, providers SHOULD declare NLAQ capability:

```json
{
  "serverInfo": {
    "ucp": {
      "space_id": "adcp-bridge-space-v1.0",
      "nl_query": { "supported": true },
      "concept_registry": {
        "supported": true,
        "endpoint": "/ucp/concepts",
        "concept_count": 47
      }
    }
  }
}
```

---

## 6. Spec Gaps Closed by This Appendix

| Gap | Status in v5.1 | Resolution in v5.2 NLAQ |
|-----|---------------|--------------------------|
| Taxonomy-anchored fallback | Undefined | §3.2 Layer 2 leaf resolution, §4 concept registry |
| Archetype resolution | Undefined | §3.1 R2, §4.2 constituent_dimensions |
| Negation handling | Undefined | §3.1 R1, §3.3 NOT scoring, `exclude_signals` |
| Temporal behavioral signals | Undefined | §4.4, `temporal_scope` on signals |
| Concept-level VAC | Undefined | §4 (full section) |
| NLAQ endpoint + MCP tool | Undefined | §2, §5 |
| Compositional audience estimation | Undefined | §3.3 normative formulas |

---

## 7. Reference Implementation Notes

The `adcp-signals-adaptor` Cloudflare Worker implements all normative requirements of this
appendix as of v5.2-draft:

- `POST /signals/query` — §2 request/response
- `src/domain/queryParser.ts` — §3.1 LLM decomposition via Claude
- `src/domain/queryResolver.ts` — §3.2 leaf resolution with archetype expansion table
- `src/domain/compositeScorer.ts` — §3.3 AND/OR/NOT set arithmetic
- `GET /ucp/concepts` — §4.3 concept registry (stub, Phase 2b)
- MCP tool `query_signals_nl` — §5.1

Archetype table (§4.2) currently covers: `soccer_mom`, `urban_professional`, `affluent_family`.
Extension to 500 concepts requires IAB Tech Lab registry effort — proposed separately.

---

*End of Appendix D — Natural Language Audience Query (NLAQ)*
