/**
 * src/routes/getGts.ts
 *
 * GET /ucp/gts — Golden Test Set (GTS) validation endpoint.
 *
 * UCP v0.2 §5 (Phase 2b prerequisite): Before two agents exchange embeddings,
 * they independently encode a shared concept-pair set and verify their vectors
 * land in the same semantic neighbourhoods. This endpoint exposes the provider's
 * GTS so a buyer agent can validate geometric + semantic compatibility before
 * committing to the full VAC handshake.
 *
 * Pair taxonomy
 * ─────────────
 *  identity   – same concept, expected cosine ≥ 0.90  (must_pass = true)
 *  related    – adjacent concepts, expected cosine 0.50–0.89
 *  orthogonal – unrelated concepts, expected cosine < 0.40  (must_pass = true)
 *
 * Pass criteria (normative, UCP v0.2-draft):
 *  • identity pairs:    cosine ≥ 0.90
 *  • orthogonal pairs:  cosine < 0.40
 *  • overall pass_rate: ≥ 0.95 across all must_pass pairs
 *
 * Public endpoint — no auth required.
 * Called by buyer agents during Phase 1 capability discovery to verify semantic
 * alignment before the projector negotiation in Phase 2b.
 */

import { SIGNAL_EMBEDDINGS, cosineSimilarity } from "../domain/embeddingStore";
import { jsonResponse } from "./shared";

// ─── Pair definitions ─────────────────────────────────────────────────────────

type PairType = "identity" | "related" | "orthogonal";

interface GtsPairDef {
  pair_id:       string;
  concept_a:     string;
  concept_b:     string;
  type:          PairType;
  rationale:     string;
  expected_min?: number;   // inclusive lower bound (identity / related)
  expected_max?: number;   // exclusive upper bound (orthogonal / related)
  must_pass:     boolean;
}

const GTS_PAIRS: GtsPairDef[] = [
  // ── Identity pairs (same semantic cluster) ───────────────────────────────
  {
    pair_id:      "age-adjacent-young",
    concept_a:    "sig_age_18_24",
    concept_b:    "sig_age_25_34",
    type:         "identity",
    rationale:    "Adjacent young-adult age bands share strong demographic signal overlap",
    expected_min: 0.90,
    must_pass:    true,
  },
  {
    pair_id:      "age-adjacent-midlife",
    concept_a:    "sig_age_35_44",
    concept_b:    "sig_age_45_54",
    type:         "identity",
    rationale:    "Adjacent mid-life age bands — core advertiser target demo",
    expected_min: 0.90,
    must_pass:    true,
  },
  {
    pair_id:      "income-adjacent-high",
    concept_a:    "sig_high_income_households",
    concept_b:    "sig_upper_middle_income",
    type:         "identity",
    rationale:    "Adjacent high income bands should cluster tightly in embedding space",
    expected_min: 0.90,
    must_pass:    true,
  },
  {
    pair_id:      "content-streaming-affinity",
    concept_a:    "sig_drama_viewers",
    concept_b:    "sig_streaming_enthusiasts",
    type:         "identity",
    rationale:    "Drama viewers are a subset of streaming enthusiasts — high overlap expected",
    expected_min: 0.90,
    must_pass:    true,
  },
  {
    pair_id:      "education-high",
    concept_a:    "sig_college_educated_adults",
    concept_b:    "sig_graduate_educated_adults",
    type:         "identity",
    rationale:    "Graduate-educated is a strict superset of college-educated",
    expected_min: 0.90,
    must_pass:    true,
  },
  {
    pair_id:      "acs-affluent-crosswalk",
    concept_a:    "sig_acs_affluent_college_educated",
    concept_b:    "sig_acs_graduate_high_income",
    type:         "identity",
    rationale:    "Two ACS-derived high-income educated segments — semantic neighbours",
    expected_min: 0.90,
    must_pass:    true,
  },

  // ── Related pairs (adjacent concepts) ────────────────────────────────────
  {
    pair_id:      "content-genres-related",
    concept_a:    "sig_drama_viewers",
    concept_b:    "sig_documentary_viewers",
    type:         "related",
    rationale:    "Drama and documentary share long-form, narrative viewing behaviour",
    expected_min: 0.50,
    expected_max: 0.89,
    must_pass:    false,
  },
  {
    pair_id:      "income-education-related",
    concept_a:    "sig_high_income_households",
    concept_b:    "sig_graduate_educated_adults",
    type:         "related",
    rationale:    "Income and education are correlated but distinct dimensions",
    expected_min: 0.50,
    expected_max: 0.89,
    must_pass:    false,
  },
  {
    pair_id:      "families-seniors-related",
    concept_a:    "sig_families_with_children",
    concept_b:    "sig_senior_households",
    type:         "related",
    rationale:    "Both are household-type signals — related but distinct life stages",
    expected_min: 0.50,
    expected_max: 0.89,
    must_pass:    false,
  },
  {
    pair_id:      "urban-income-related",
    concept_a:    "sig_urban_professionals",
    concept_b:    "sig_high_income_households",
    type:         "related",
    rationale:    "Urban professionals skew high-income but are not identical",
    expected_min: 0.50,
    expected_max: 0.89,
    must_pass:    false,
  },
  {
    pair_id:      "scifi-action-related",
    concept_a:    "sig_sci_fi_enthusiasts",
    concept_b:    "sig_action_movie_fans",
    type:         "related",
    rationale:    "Genre overlap — sci-fi and action share audience but are distinct",
    expected_min: 0.50,
    expected_max: 0.89,
    must_pass:    false,
  },

  // ── Orthogonal pairs (semantically unrelated, must score < 0.40) ─────────
  {
    pair_id:      "young-vs-senior",
    concept_a:    "sig_age_18_24",
    concept_b:    "sig_age_65_plus",
    type:         "orthogonal",
    rationale:    "Youngest and oldest age bands — maximally distant demographics",
    expected_max: 0.40,
    must_pass:    true,
  },
  {
    pair_id:      "action-vs-documentary",
    concept_a:    "sig_action_movie_fans",
    concept_b:    "sig_documentary_viewers",
    type:         "orthogonal",
    rationale:    "High-intensity genre vs reflective/informational — distinct audiences",
    expected_max: 0.40,
    must_pass:    true,
  },
  {
    pair_id:      "low-income-vs-affluent",
    concept_a:    "sig_middle_income_households",
    concept_b:    "sig_acs_affluent_college_educated",
    type:         "orthogonal",
    rationale:    "Middle income and affluent college-educated are opposing income segments",
    expected_max: 0.40,
    must_pass:    true,
  },
  {
    pair_id:      "young-single-vs-seniors",
    concept_a:    "sig_acs_young_single_adults",
    concept_b:    "sig_acs_senior_households_income",
    type:         "orthogonal",
    rationale:    "Young single adults and senior households are life-stage opposites",
    expected_max: 0.40,
    must_pass:    true,
  },
];

// ─── Response types ───────────────────────────────────────────────────────────

interface GtsPairResult {
  pair_id:           string;
  concept_a:         string;
  concept_b:         string;
  type:              PairType;
  rationale:         string;
  actual_similarity: number;
  expected_min?:     number;
  expected_max?:     number;
  must_pass:         boolean;
  pass:              boolean;
}

interface GtsResponse {
  gts_version:      string;
  space_id:         string;
  model_id:         string;
  generated_at:     string;
  total_pairs:      number;
  must_pass_pairs:  number;
  passed_must_pass: number;
  pass_rate:        number;
  overall_pass:     boolean;
  pairs:            GtsPairResult[];
  summary: {
    identity_pairs:   { count: number; passing: number };
    related_pairs:    { count: number; passing: number };
    orthogonal_pairs: { count: number; passing: number };
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function handleGetGts(): Response {
  const results: GtsPairResult[] = [];

  for (const def of GTS_PAIRS) {
    const embA = SIGNAL_EMBEDDINGS[def.concept_a];
    const embB = SIGNAL_EMBEDDINGS[def.concept_b];

    // Skip pairs where either signal lacks a real (v1) vector
    if (!embA || !embB) continue;

    const similarity = Math.round(cosineSimilarity(embA.vector, embB.vector) * 10000) / 10000;

    let pass: boolean;
    if (def.type === "orthogonal") {
      pass = similarity < (def.expected_max ?? 0.40);
    } else if (def.type === "identity") {
      pass = similarity >= (def.expected_min ?? 0.90);
    } else {
      const aboveMin = def.expected_min !== undefined ? similarity >= def.expected_min : true;
      const belowMax = def.expected_max !== undefined ? similarity <  def.expected_max : true;
      pass = aboveMin && belowMax;
    }

    results.push({
      pair_id:           def.pair_id,
      concept_a:         def.concept_a,
      concept_b:         def.concept_b,
      type:              def.type,
      rationale:         def.rationale,
      actual_similarity: similarity,
      ...(def.expected_min !== undefined ? { expected_min: def.expected_min } : {}),
      ...(def.expected_max !== undefined ? { expected_max: def.expected_max } : {}),
      must_pass:         def.must_pass,
      pass,
    });
  }

  const mustPassResults  = results.filter(r => r.must_pass);
  const passedMustPass   = mustPassResults.filter(r => r.pass).length;
  const passRate         = mustPassResults.length > 0
    ? Math.round((passedMustPass / mustPassResults.length) * 10000) / 10000
    : 1.0;

  const body: GtsResponse = {
    gts_version:      "adcp-gts-v1.0",
    space_id:         "openai-te3-small-d512-v1",
    model_id:         "text-embedding-3-small",
    generated_at:     new Date().toISOString(),
    total_pairs:      results.length,
    must_pass_pairs:  mustPassResults.length,
    passed_must_pass: passedMustPass,
    pass_rate:        passRate,
    overall_pass:     passRate >= 0.95,
    pairs:            results,
    summary: {
      identity_pairs:   { count: results.filter(r => r.type === "identity").length,   passing: results.filter(r => r.type === "identity"   && r.pass).length },
      related_pairs:    { count: results.filter(r => r.type === "related").length,    passing: results.filter(r => r.type === "related"    && r.pass).length },
      orthogonal_pairs: { count: results.filter(r => r.type === "orthogonal").length, passing: results.filter(r => r.type === "orthogonal" && r.pass).length },
    },
  };

  return jsonResponse(body);
}
