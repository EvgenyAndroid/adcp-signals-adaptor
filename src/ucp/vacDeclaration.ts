// src/ucp/vacDeclaration.ts
// VAC (Vector Alignment Contract) constants for the AdCP-UCP Bridge.
// Declares the deterministic pseudo-embedding space used in Phase 1.

import type { UcpEmbeddingDeclaration, UcpCapabilityDeclaration } from "../types/ucp";

// ── Model constants ───────────────────────────────────────────────────────────

export const UCP_MODEL_ID = "adcp-ucp-bridge-pseudo-v1.0";
export const UCP_MODEL_FAMILY = "adcp-bridge/deterministic-taxonomy-v1";
export const UCP_SPACE_ID = "adcp-bridge-space-v1.0";
export const UCP_DIMENSIONS = 512;
export const UCP_GTS_VERSION = "adcp-gts-v1.0";

// Dimension slot layout (must match embeddingEngine.ts)
export const DIM_SLOTS = {
  TAXONOMY_START: 0,      // 0–127:   IAB AT 1.1 node ID encoding
  TAXONOMY_END: 127,
  CATEGORY_START: 128,    // 128–191: signal category type
  CATEGORY_END: 191,
  SOURCE_START: 192,      // 192–255: DTS data source quality
  SOURCE_END: 255,
  PRICING_START: 256,     // 256–319: CPM tier
  PRICING_END: 319,
  FRESHNESS_START: 320,   // 320–383: refresh cadence
  FRESHNESS_END: 383,
  RESERVED_START: 384,    // 384–511: zero-padded (Phase 2 real model)
  RESERVED_END: 511,
} as const;

// ── VAC declaration factory ───────────────────────────────────────────────────

export function buildVacDeclaration(signalId: string): UcpEmbeddingDeclaration {
  return {
    model_id: UCP_MODEL_ID,
    model_family: UCP_MODEL_FAMILY,
    space_id: UCP_SPACE_ID,
    dimensions: UCP_DIMENSIONS,
    encoding: "float32",
    normalization: "l2",
    distance_metric: "cosine",
    phase: "pseudo-v1",
    vector_endpoint: `/signals/${signalId}/embedding`,
  };
}

// ── Capability declaration (for get_adcp_capabilities) ───────────────────────

export const UCP_CAPABILITY: UcpCapabilityDeclaration = {
  supported_spaces: [UCP_SPACE_ID],
  supported_encodings: ["float32"],
  dimensions: [UCP_DIMENSIONS],
  embedding_endpoint_template: "/signals/{signal_id}/embedding",
  similarity_search: true,
  phase: "pseudo-v1",
  gts_version: UCP_GTS_VERSION,
};
