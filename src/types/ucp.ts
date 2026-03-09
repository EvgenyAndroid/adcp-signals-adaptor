// src/types/ucp.ts
// UCP (User Context Protocol) TypeScript types.
// Defines the HybridPayload — the bridge between AdCP signal objects and
// UCP embedding exchange. Embedded in AdCP responses as x_ucp extension field.
// Spec reference: IABTechLab/agentic-audiences v0.1

// ── VAC (Vector Alignment Contract) ──────────────────────────────────────────

export type UcpEncoding = "float32" | "float16" | "int8" | "binary";
export type UcpNormalization = "l2" | "none";
export type UcpDistanceMetric = "cosine" | "dot_product" | "euclidean";
export type UcpSignalType = "identity" | "contextual" | "reinforcement";
export type UcpSignalStrength = "high" | "medium" | "low";
export type UcpEmbeddingPhase = "pseudo-v1" | "llm-v1" | "trained-v1";

/**
 * VAC-compliant embedding declaration.
 * Per spec: every embedding exchange MUST include model_id, space_id, dimensions,
 * encoding, normalization, distance_metric.
 * The vector itself is NOT included in bulk get_signals responses (too large).
 * Use vector_endpoint to fetch on demand.
 */
export interface UcpEmbeddingDeclaration {
  model_id: string;             // e.g. "adcp-ucp-bridge-pseudo-v1.0"
  model_family: string;         // e.g. "adcp-bridge/deterministic-taxonomy-v1"
  space_id: string;             // e.g. "adcp-bridge-space-v1.0"
  dimensions: number;           // 256 | 384 | 512 | 768 | 1024
  encoding: UcpEncoding;
  normalization: UcpNormalization;
  distance_metric: UcpDistanceMetric;
  phase: UcpEmbeddingPhase;     // which engine produced this
  vector_endpoint: string;      // "/signals/{id}/embedding" — fetch full vector on demand
}

/**
 * Full embedding response — returned by GET /signals/:id/embedding.
 * Contains the actual float32 vector, base64-encoded.
 */
export interface UcpEmbeddingVector extends UcpEmbeddingDeclaration {
  vector: string;               // base64-encoded float32[] per spec
  generated_at: string;         // ISO timestamp
  cache_ttl_seconds: number;
}

// ── Legacy Fallback ───────────────────────────────────────────────────────────

/**
 * UCP legacy_fallback — bridges UCP consumers back to AdCP identifiers.
 * This is the normative "AdCP-UCP Bridge" mapping:
 *   signal_agent_segment_id  ← AdCP primary key
 *   segment_ids              ← from x_dts.taxonomy_id_list (IAB AT 1.1 node IDs)
 */
export interface UcpLegacyFallback {
  signal_agent_segment_id: string;   // AdCP primary key
  segment_ids: string[];             // IAB Audience Taxonomy 1.1 node IDs
  taxonomy_version: "iab_audience_1.1";
  data_provider: string;
}

// ── Privacy (bridged from DTS v1.2) ──────────────────────────────────────────

export interface UcpPrivacy {
  privacy_compliance_mechanisms: string[];  // from x_dts.privacy_compliance_mechanisms
  permitted_uses: string[];                 // derived from signal access policy
  ttl_seconds: number;                      // derived from x_dts.audience_refresh
  gpp_applicable: boolean;
  tcf_applicable: boolean;
}

// ── UCP Hybrid Payload ────────────────────────────────────────────────────────

/**
 * The full UCP Hybrid Payload — embedded in AdCP signal responses as x_ucp.
 * Combines VAC declaration, legacy fallback, privacy, and signal classification.
 *
 * Design decisions:
 *   - Vector NOT included here (bulk response optimization)
 *   - signal_type derived from DTS data_sources
 *   - signal_strength derived from DTS audience_inclusion_methodology
 *   - This object is the normative "AdCP-UCP Bridge Profile" payload
 */
export interface UcpHybridPayload {
  schema_version: "ucp-1.0";

  // VAC declaration (vector fetched separately via vector_endpoint)
  embedding: UcpEmbeddingDeclaration;

  // AdCP → UCP identity bridge
  legacy_fallback: UcpLegacyFallback;

  // Privacy bridged from DTS v1.2
  privacy: UcpPrivacy;

  // UCP signal classification
  signal_type: UcpSignalType;
  signal_strength: UcpSignalStrength;

  // Human-readable rationale for signal_type + signal_strength selection
  classification_rationale: string;
}

// ── VAC Capability (for get_adcp_capabilities) ────────────────────────────────

export interface UcpCapabilityDeclaration {
  supported_spaces: string[];
  supported_encodings: UcpEncoding[];
  dimensions: number[];
  embedding_endpoint_template: string;    // "/signals/{signal_id}/embedding"
  similarity_search: boolean;             // true when get_similar_signals tool present
  phase: UcpEmbeddingPhase;
  gts_version?: string;                   // Golden Test Set version if available
}

// ── Similarity Search ─────────────────────────────────────────────────────────

export interface SimilarSignalResult {
  signal_agent_segment_id: string;
  name: string;
  cosine_similarity: number;
  signal_type: UcpSignalType;
  signal_strength: UcpSignalStrength;
}

export interface SimilarSignalsResponse {
  reference_signal_id: string;
  model_id: string;
  space_id: string;
  results: SimilarSignalResult[];
  context_id: string;
}
