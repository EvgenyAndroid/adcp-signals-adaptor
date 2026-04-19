// src/ucp/vacDeclaration.ts
// VAC (Vector Alignment Contract) constants for the AdCP-UCP Bridge.
// Declares the deterministic pseudo-embedding space used in Phase 1.

import type { UcpEmbeddingDeclaration, UcpCapabilityDeclaration } from "../types/ucp";

// ── Model constants ───────────────────────────────────────────────────────────

// Pseudo bridge (hash-based, deterministic, no external deps).
export const UCP_MODEL_ID = "adcp-ucp-bridge-pseudo-v1.0";
export const UCP_MODEL_FAMILY = "adcp-bridge/deterministic-taxonomy-v1";
export const UCP_SPACE_ID = "adcp-bridge-space-v1.0";

// Real LLM engine (OpenAI text-embedding-3-small 512-dim). Must stay in sync
// with LlmEmbeddingEngine.spaceId in src/ucp/embeddingEngine.ts — that class
// is what /ucp/gts, /signals/*/embedding, and /mcp serverInfo.ucp all report
// against when EMBEDDING_ENGINE=llm + OPENAI_API_KEY is set.
export const LLM_SPACE_ID = "openai-te3-small-d512-v1";

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

export function buildVacDeclaration(
  signalId: string,
  phase: UcpEmbeddingDeclaration["phase"] = "pseudo-v1",
): UcpEmbeddingDeclaration {
  return {
    model_id: UCP_MODEL_ID,
    model_family: UCP_MODEL_FAMILY,
    space_id: UCP_SPACE_ID,
    dimensions: UCP_DIMENSIONS,
    encoding: "float32",
    normalization: "l2",
    distance_metric: "cosine",
    phase,
    vector_endpoint: `/signals/${signalId}/embedding`,
  };
}

// ── Capability declaration (for get_adcp_capabilities) ───────────────────────
//
// Historically this was a static `UCP_CAPABILITY` constant that always
// declared the pseudo bridge. That was a lie on any deployment where
// EMBEDDING_ENGINE=llm + OPENAI_API_KEY is set — /capabilities said
// pseudo-v1 / adcp-bridge-space-v1.0 while every other surface
// (/ucp/gts, /signals/*/embedding, /mcp serverInfo.ucp) correctly reported
// the LLM engine. A buyer agent reading /capabilities to decide
// interop would get the wrong answer.
//
// buildUcpCapability(env) now uses the SAME switch that createEmbeddingEngine
// uses in embeddingEngine.ts, so the declaration in /capabilities matches
// what the service will actually produce at runtime.

export interface UcpCapabilityEnv {
  EMBEDDING_ENGINE?: string;
  OPENAI_API_KEY?: string;
}

export function buildUcpCapability(env: UcpCapabilityEnv): UcpCapabilityDeclaration {
  const isLlm = env.EMBEDDING_ENGINE === "llm" && !!env.OPENAI_API_KEY;
  return {
    supported_spaces: [isLlm ? LLM_SPACE_ID : UCP_SPACE_ID],
    supported_encodings: ["float32"],
    dimensions: [UCP_DIMENSIONS],
    embedding_endpoint_template: "/signals/{signal_id}/embedding",
    similarity_search: true,
    phase: isLlm ? "llm-v1" : "pseudo-v1",
    gts_version: UCP_GTS_VERSION,
  };
}

/**
 * @deprecated Static export kept for callers that don't yet thread env
 * through. New callers must use buildUcpCapability(env) to get an
 * engine-accurate declaration. This constant always reports the pseudo
 * bridge, which is usually WRONG on prod deployments.
 */
export const UCP_CAPABILITY: UcpCapabilityDeclaration = {
  supported_spaces: [UCP_SPACE_ID],
  supported_encodings: ["float32"],
  dimensions: [UCP_DIMENSIONS],
  embedding_endpoint_template: "/signals/{signal_id}/embedding",
  similarity_search: true,
  phase: "pseudo-v1",
  gts_version: UCP_GTS_VERSION,
};
