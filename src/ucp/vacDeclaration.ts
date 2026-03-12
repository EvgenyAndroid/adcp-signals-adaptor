// src/ucp/vacDeclaration.ts
// VAC (Vector Alignment Contract) constants and builders for the AdCP-UCP Bridge.
//
// CHANGELOG (fix):
//   - Split constants into LLM engine (real OpenAI) vs pseudo engine (hash fallback)
//   - buildVacDeclaration() now accepts a phase param → emits correct model/space/family
//   - Replaced static UCP_CAPABILITY export with buildUcpCapability(engine) factory
//     so capabilities block reflects the active engine rather than always emitting
//     pseudo-v1 values regardless of EMBEDDING_ENGINE env var.
//   - Legacy constant aliases kept for backward compatibility with callers that
//     import UCP_MODEL_ID / UCP_SPACE_ID directly (ucpMapper.ts, etc.)

import type {
  UcpEmbeddingDeclaration,
  UcpCapabilityDeclaration,
  UcpEmbeddingPhase,
} from "../types/ucp";

// ── LLM engine constants (active when EMBEDDING_ENGINE=llm + OPENAI_API_KEY) ──
export const LLM_MODEL_ID     = "text-embedding-3-small";
export const LLM_MODEL_FAMILY = "openai/text-embedding-3";
export const LLM_SPACE_ID     = "openai-te3-small-d512-v1";

// ── Pseudo engine constants (fallback — no OpenAI key, or EMBEDDING_ENGINE≠llm) ─
export const PSEUDO_MODEL_ID     = "adcp-ucp-bridge-pseudo-v1.0";
export const PSEUDO_MODEL_FAMILY = "adcp-bridge/deterministic-taxonomy-v1";
export const PSEUDO_SPACE_ID     = "adcp-bridge-space-v1.0";

// ── Shared constants ──────────────────────────────────────────────────────────
export const UCP_DIMENSIONS  = 512;
export const UCP_GTS_VERSION = "adcp-gts-v1.0";

// ── Legacy aliases — kept for callers that import these names directly ────────
// Remove once ucpMapper.ts and any other callers are updated to use
// LLM_* / PSEUDO_* names or call buildVacDeclaration() with explicit phase.
export const UCP_MODEL_ID    = PSEUDO_MODEL_ID;
export const UCP_MODEL_FAMILY_LEGACY = PSEUDO_MODEL_FAMILY;
export const UCP_SPACE_ID    = PSEUDO_SPACE_ID;

// ── Dimension slot layout (must match embeddingEngine.ts) ────────────────────
// Only relevant for pseudo engine. Real LLM vectors have no fixed slot semantics.
export const DIM_SLOTS = {
  TAXONOMY_START:  0,    // 0–127:   IAB AT 1.1 node ID encoding
  TAXONOMY_END:    127,
  CATEGORY_START:  128,  // 128–191: signal category type
  CATEGORY_END:    191,
  SOURCE_START:    192,  // 192–255: DTS data source quality
  SOURCE_END:      255,
  PRICING_START:   256,  // 256–319: CPM tier
  PRICING_END:     319,
  FRESHNESS_START: 320,  // 320–383: refresh cadence
  FRESHNESS_END:   383,
  RESERVED_START:  384,  // 384–511: zero-padded (Phase 2b real model)
  RESERVED_END:    511,
} as const;

// ── VAC declaration factory ───────────────────────────────────────────────────

/**
 * Build a VAC-compliant embedding declaration for a signal.
 *
 * @param signalId  Signal being declared (used for vector_endpoint path).
 * @param phase     "v1" for real LLM vectors, "pseudo-v1" for hash fallback.
 *                  Defaults to "pseudo-v1" to preserve existing behaviour for
 *                  callers that don't yet pass phase.
 */
export function buildVacDeclaration(
  signalId: string,
  phase: UcpEmbeddingPhase = "pseudo-v1",
): UcpEmbeddingDeclaration {
  const isReal = phase === "v1";
  return {
    model_id:        isReal ? LLM_MODEL_ID     : PSEUDO_MODEL_ID,
    model_family:    isReal ? LLM_MODEL_FAMILY  : PSEUDO_MODEL_FAMILY,
    space_id:        isReal ? LLM_SPACE_ID      : PSEUDO_SPACE_ID,
    dimensions:      UCP_DIMENSIONS,
    encoding:        "float32",
    normalization:   "l2",
    distance_metric: "cosine",
    phase,
    vector_endpoint: `/signals/${signalId}/embedding`,
  };
}

// ── Capability declaration factory ────────────────────────────────────────────

/**
 * Build the full UCP capability block for /capabilities.
 *
 * Call with engine="llm" when EMBEDDING_ENGINE=llm + OPENAI_API_KEY are set,
 * otherwise engine="pseudo".
 *
 * GTS pass_threshold values are calibrated to what text-embedding-3-small
 * actually produces at 512 dimensions (see Fix 3 in the analysis doc):
 *   llm:    0.70  — achievable with recalibrated pair thresholds
 *   pseudo: 0.95  — original value; pseudo space has engineered geometry
 */
export function buildUcpCapability(engine: "llm" | "pseudo"): UcpCapabilityDeclaration {
  const isReal = engine === "llm";
  const spaceId = isReal ? LLM_SPACE_ID : PSEUDO_SPACE_ID;

  return {
    supported_spaces:            [spaceId],
    supported_encodings:         ["float32"],
    dimensions:                  [UCP_DIMENSIONS],
    embedding_endpoint_template: "/signals/{signal_id}/embedding",
    similarity_search:           true,
    phase:                       isReal ? "v1" : "pseudo-v1",

    gts: {
      supported:      true,
      endpoint:       "/ucp/gts",
      version:        UCP_GTS_VERSION,
      pair_count:     15,
      // LLM threshold calibrated to text-embedding-3-small 512d actual cosine range.
      // Pseudo threshold kept at original value for the deterministic hash space.
      pass_threshold: isReal ? 0.70 : 0.95,
    },

    projector: {
      available:  true,
      endpoint:   "/ucp/projector",
      algorithm:  "procrustes_svd",
      from_space: spaceId,
      to_space:   "ucp-space-v1.0",
      // Remains "simulated" until IAB publishes the reference model vectors.
      status:     "simulated",
    },

    handshake_simulator: {
      supported: true,
      endpoint:  "/ucp/simulate-handshake",
    },

    nl_query: {
      supported:           true,
      endpoint:            "/signals/query",
      min_embedding_score: 0.45,
      archetype_count:     4,
      concept_count:       19,
    },

    concept_registry: {
      supported:        true,
      endpoint:         "/ucp/concepts",
      concept_count:    19,
      registry_version: "ucp-concept-registry-v1.0",
      categories: [
        "demographic",
        "interest",
        "behavioral",
        "geo",
        "archetype",
        "content",
        "purchase_intent",
      ],
    },
  };
}

// ── Legacy static export — DEPRECATED ────────────────────────────────────────
// Kept so existing imports of UCP_CAPABILITY don't break at compile time.
// capabilityService.ts should be updated to call buildUcpCapability(engine)
// instead of importing this constant.
// Will be removed in the next cleanup pass.
export const UCP_CAPABILITY = buildUcpCapability("pseudo");
