// src/ucp/vacDeclaration.ts
// VAC (Vector Alignment Contract) constants for the AdCP-UCP Bridge.
// Updated for Phase 2b: projector_available = true (simulated), GTS endpoint declared.

import type { UcpEmbeddingDeclaration, UcpCapabilityDeclaration } from "../types/ucp";

// ── Model constants ───────────────────────────────────────────────────────────

export const UCP_MODEL_ID     = "text-embedding-3-small";
export const UCP_MODEL_FAMILY = "openai/text-embedding-3";
export const UCP_SPACE_ID     = "openai-te3-small-d512-v1";
export const UCP_DIMENSIONS   = 512;
export const UCP_GTS_VERSION  = "adcp-gts-v1.0";

// ── VAC declaration factory ───────────────────────────────────────────────────

export function buildVacDeclaration(signalId: string): UcpEmbeddingDeclaration {
  return {
    model_id:        UCP_MODEL_ID,
    model_family:    UCP_MODEL_FAMILY,
    space_id:        UCP_SPACE_ID,
    dimensions:      UCP_DIMENSIONS,
    encoding:        "float32",
    normalization:   "l2",
    distance_metric: "cosine",
    phase:           "v1",
    vector_endpoint: `/signals/${signalId}/embedding`,
  };
}

// ── Capability declaration (for get_adcp_capabilities + MCP initialize) ───────

export const UCP_CAPABILITY: UcpCapabilityDeclaration = {
  supported_spaces:            [UCP_SPACE_ID],
  supported_encodings:         ["float32"],
  dimensions:                  [UCP_DIMENSIONS],
  embedding_endpoint_template: "/signals/{signal_id}/embedding",
  similarity_search:           true,
  phase:                       "v1",

  // GTS — Phase 2b prerequisite (live)
  gts: {
    supported:      true,
    endpoint:       "/ucp/gts",
    version:        UCP_GTS_VERSION,
    pair_count:     15,
    pass_threshold: 0.95,
  },

  // Projector — Phase 2b (simulated; awaiting IAB reference model)
  projector: {
    available:  true,
    endpoint:   "/ucp/projector",
    algorithm:  "procrustes_svd",
    from_space: UCP_SPACE_ID,
    to_space:   "ucp-space-v1.0",
    status:     "simulated",
  },

  // Handshake simulator
  handshake_simulator: {
    supported: true,
    endpoint:  "/ucp/simulate-handshake",
  },

  // NL query
  nl_query: {
    supported:          true,
    endpoint:           "/signals/query",
    min_embedding_score: 0.45,
    archetype_count:    4,
    concept_count:      19,
  },

  // Concept registry
  concept_registry: {
    supported:        true,
    endpoint:         "/ucp/concepts",
    concept_count:    19,
    registry_version: "ucp-concept-registry-v1.0",
    categories:       ["demographic","interest","behavioral","geo","archetype","content","purchase_intent"],
  },
};
