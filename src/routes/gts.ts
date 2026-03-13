/**
 * src/routes/ucp/gts.ts
 *
 * GET /ucp/gts — UCP Ground Truth Similarity (GTS) test suite.
 *
 * The GTS validates that the active embedding engine produces semantically
 * meaningful cosine similarities between known signal pairs.
 *
 * Phase-awareness fix:
 *   The GTS thresholds (expected_min ≥ 0.9 for identity pairs, expected_max ≤ 0.4
 *   for orthogonal pairs) are calibrated for REAL OpenAI text-embedding-3-small
 *   vectors (phase = "llm-v1").
 *
 *   Pseudo-hash vectors (phase = "pseudo-v1") produce random-ish cosine similarities
 *   in the range ~0.45–0.82, which will always fail the identity and orthogonal pair
 *   checks. This is NOT a signal quality bug — it's an expected limitation of the
 *   hash-based engine.
 *
 *   Fix: When EMBEDDING_ENGINE != "llm" (or OPENAI_API_KEY is missing), the GTS:
 *     1. Reports overall_pass: false (correct — pseudo vectors don't meet the bar)
 *     2. Adds engine_phase: "pseudo-v1" and a clear engine_note to the response
 *     3. Sets must_pass = false on all pairs (they're informational only in pseudo mode)
 *     4. Computes actual_similarity from the embeddingStore (real vectors) where available,
 *        falling back to the pseudo engine otherwise
 *
 *   This makes the GTS honest: it reports what it measured and WHY it failed,
 *   rather than silently returning garbage pass/fail numbers.
 *
 * seller_phase fix:
 *   The /ucp/simulate-handshake route was hardcoding seller_phase: "v1".
 *   It now reads from the active engine (see handshake.ts).
 */

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse } from "./shared";
import { getSignalEmbedding, cosineSimilarity } from "../domain/embeddingStore";
import { createEmbeddingEngine } from "../ucp/embeddingEngine";
import { UCP_GTS_VERSION } from "../ucp/vacDeclaration";

// ── GTS pair definitions ──────────────────────────────────────────────────────

interface GtsPair {
  pair_id: string;
  concept_a: string;
  concept_b: string;
  type: "identity" | "related" | "orthogonal";
  rationale: string;
  expected_min?: number;
  expected_max?: number;
  must_pass: boolean;
}

const GTS_PAIRS: GtsPair[] = [
  // Identity pairs — should be highly similar (≥ 0.9 with real vectors)
  {
    pair_id: "age-adjacent-young",
    concept_a: "sig_age_18_24",
    concept_b: "sig_age_25_34",
    type: "identity",
    rationale: "Adjacent young-adult age bands share strong demographic signal overlap",
    expected_min: 0.9,
    must_pass: true,
  },
  {
    pair_id: "age-adjacent-midlife",
    concept_a: "sig_age_35_44",
    concept_b: "sig_age_45_54",
    type: "identity",
    rationale: "Adjacent mid-life age bands — core advertiser target demo",
    expected_min: 0.9,
    must_pass: true,
  },
  {
    pair_id: "income-adjacent-high",
    concept_a: "sig_high_income_households",
    concept_b: "sig_upper_middle_income",
    type: "identity",
    rationale: "Adjacent high income bands should cluster tightly in embedding space",
    expected_min: 0.9,
    must_pass: true,
  },
  {
    pair_id: "content-streaming-affinity",
    concept_a: "sig_drama_viewers",
    concept_b: "sig_streaming_enthusiasts",
    type: "identity",
    rationale: "Drama viewers are a subset of streaming enthusiasts — high overlap expected",
    expected_min: 0.9,
    must_pass: true,
  },
  {
    pair_id: "education-high",
    concept_a: "sig_college_educated_adults",
    concept_b: "sig_graduate_educated_adults",
    type: "identity",
    rationale: "Graduate-educated is a strict superset of college-educated",
    expected_min: 0.9,
    must_pass: true,
  },
  {
    pair_id: "acs-affluent-crosswalk",
    concept_a: "sig_acs_affluent_college_educated",
    concept_b: "sig_acs_graduate_high_income",
    type: "identity",
    rationale: "Two ACS-derived high-income educated segments — semantic neighbours",
    expected_min: 0.9,
    must_pass: true,
  },
  // Related pairs — moderate similarity (0.5–0.89)
  {
    pair_id: "content-genres-related",
    concept_a: "sig_drama_viewers",
    concept_b: "sig_documentary_viewers",
    type: "related",
    rationale: "Drama and documentary share long-form, narrative viewing behaviour",
    expected_min: 0.5,
    expected_max: 0.89,
    must_pass: false,
  },
  {
    pair_id: "income-education-related",
    concept_a: "sig_high_income_households",
    concept_b: "sig_graduate_educated_adults",
    type: "related",
    rationale: "Income and education are correlated but distinct dimensions",
    expected_min: 0.5,
    expected_max: 0.89,
    must_pass: false,
  },
  {
    pair_id: "families-seniors-related",
    concept_a: "sig_families_with_children",
    concept_b: "sig_senior_households",
    type: "related",
    rationale: "Both are household-type signals — related but distinct life stages",
    expected_min: 0.5,
    expected_max: 0.89,
    must_pass: false,
  },
  {
    pair_id: "urban-income-related",
    concept_a: "sig_urban_professionals",
    concept_b: "sig_high_income_households",
    type: "related",
    rationale: "Urban professionals skew high-income but are not identical",
    expected_min: 0.5,
    expected_max: 0.89,
    must_pass: false,
  },
  {
    pair_id: "scifi-action-related",
    concept_a: "sig_sci_fi_enthusiasts",
    concept_b: "sig_action_movie_fans",
    type: "related",
    rationale: "Genre overlap — sci-fi and action share audience but are distinct",
    expected_min: 0.5,
    expected_max: 0.89,
    must_pass: false,
  },
  // Orthogonal pairs — should be maximally distant (≤ 0.4 with real vectors)
  {
    pair_id: "young-vs-senior",
    concept_a: "sig_age_18_24",
    concept_b: "sig_age_65_plus",
    type: "orthogonal",
    rationale: "Youngest and oldest age bands — maximally distant demographics",
    expected_max: 0.4,
    must_pass: true,
  },
  {
    pair_id: "action-vs-documentary",
    concept_a: "sig_action_movie_fans",
    concept_b: "sig_documentary_viewers",
    type: "orthogonal",
    rationale: "High-intensity genre vs reflective/informational — distinct audiences",
    expected_max: 0.4,
    must_pass: true,
  },
  {
    pair_id: "low-income-vs-affluent",
    concept_a: "sig_middle_income_households",
    concept_b: "sig_acs_affluent_college_educated",
    type: "orthogonal",
    rationale: "Middle income and affluent college-educated are opposing income segments",
    expected_max: 0.4,
    must_pass: true,
  },
  {
    pair_id: "young-single-vs-seniors",
    concept_a: "sig_acs_young_single_adults",
    concept_b: "sig_acs_senior_households_income",
    type: "orthogonal",
    rationale: "Young single adults and senior households are life-stage opposites",
    expected_max: 0.4,
    must_pass: true,
  },
];

// ── Similarity computation ────────────────────────────────────────────────────

async function getSimilarity(
  idA: string,
  idB: string,
  pseudoEngine: ReturnType<typeof createEmbeddingEngine>,
  usePseudo: boolean
): Promise<number> {
  // Prefer real stored vectors (embeddingStore) for accuracy
  const storedA = getSignalEmbedding(idA);
  const storedB = getSignalEmbedding(idB);

  if (storedA && storedB) {
    return cosineSimilarity(storedA.vector, storedB.vector);
  }

  // Fall back to pseudo engine for signals not in embeddingStore
  const [vecA, vecB] = await Promise.all([
    pseudoEngine.embedSignal(idA, idA),
    pseudoEngine.embedSignal(idB, idB),
  ]);
  return cosineSimilarity(vecA, vecB);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleGetGts(env: Env, logger: Logger): Promise<Response> {
  logger.info("ucp_gts_requested");

  const engine = createEmbeddingEngine(env as any);
  const enginePhase = engine.phase; // "pseudo-v1" or "llm-v1"
  const isPseudo = enginePhase === "pseudo-v1";

  // Active space_id and model_id come from the engine
  const spaceId = engine.spaceId;
  const modelId = isPseudo
    ? "adcp-ucp-bridge-pseudo-v1.0"
    : "text-embedding-3-small";

  const pairs = await Promise.all(
    GTS_PAIRS.map(async (pair) => {
      const actualSimilarity = await getSimilarity(pair.concept_a, pair.concept_b, engine, isPseudo);
      const rounded = Math.round(actualSimilarity * 10000) / 10000;

      // In pseudo mode: must_pass pairs are downgraded to informational
      // because pseudo vectors don't have semantic meaning
      const effectiveMustPass = isPseudo ? false : pair.must_pass;

      let pass: boolean;
      if (pair.type === "identity") {
        pass = rounded >= (pair.expected_min ?? 0.9);
      } else if (pair.type === "orthogonal") {
        pass = rounded <= (pair.expected_max ?? 0.4);
      } else {
        // related
        pass =
          (pair.expected_min === undefined || rounded >= pair.expected_min) &&
          (pair.expected_max === undefined || rounded <= pair.expected_max);
      }

      return {
        pair_id: pair.pair_id,
        concept_a: pair.concept_a,
        concept_b: pair.concept_b,
        type: pair.type,
        rationale: pair.rationale,
        actual_similarity: rounded,
        expected_min: pair.expected_min,
        expected_max: pair.expected_max,
        must_pass: effectiveMustPass,
        pass,
        ...(isPseudo && pair.must_pass
          ? { pseudo_note: "Threshold downgraded to informational — pseudo vectors are not semantically grounded." }
          : {}),
      };
    })
  );

  const mustPassPairs = pairs.filter((p) => p.must_pass);
  const passedMustPass = mustPassPairs.filter((p) => p.pass).length;

  // overall_pass requires ALL must_pass pairs to pass AND engine must be real
  const overallPass = !isPseudo && passedMustPass === mustPassPairs.length;

  const byType = (type: string) => pairs.filter((p) => p.type === type);

  const result = {
    gts_version: UCP_GTS_VERSION,
    space_id: spaceId,
    model_id: modelId,
    engine_phase: enginePhase,
    generated_at: new Date().toISOString(),
    total_pairs: pairs.length,
    must_pass_pairs: mustPassPairs.length,
    passed_must_pass: passedMustPass,
    pass_rate: pairs.length > 0 ? Math.round((pairs.filter((p) => p.pass).length / pairs.length) * 1000) / 1000 : 0,
    overall_pass: overallPass,
    ...(isPseudo
      ? {
          engine_note:
            "GTS running in PSEUDO mode. Hash-based vectors are not semantically grounded — " +
            "cosine similarity between pseudo vectors does not reflect audience semantic proximity. " +
            "All must_pass thresholds are downgraded to informational. " +
            "Set EMBEDDING_ENGINE=llm and configure OPENAI_API_KEY to run GTS with real vectors.",
        }
      : {}),
    pairs,
    summary: {
      identity_pairs: {
        count: byType("identity").length,
        passing: byType("identity").filter((p) => p.pass).length,
      },
      related_pairs: {
        count: byType("related").length,
        passing: byType("related").filter((p) => p.pass).length,
      },
      orthogonal_pairs: {
        count: byType("orthogonal").length,
        passing: byType("orthogonal").filter((p) => p.pass).length,
      },
    },
  };

  return jsonResponse(result);
}
