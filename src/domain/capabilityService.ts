// src/ucp/vacDeclaration.ts
// VAC (Vector Alignment Contract) constants for the AdCP-UCP Bridge.
// Real OpenAI text-embedding-3-small vectors — phase "v1".
// Phase 2b projector aligns this space → ucp-space-v1.0 via Procrustes/SVD.

import type { UcpEmbeddingDeclaration, UcpCapabilityDeclaration } from "../types/ucp";

// ── Model constants ───────────────────────────────────────────────────────────

export const UCP_MODEL_ID = "text-embedding-3-small";
export const UCP_MODEL_FAMILY = "openai/text-embedding-3-small";
export const UCP_SPACE_ID = "openai-te3-small-d512-v1";
export const UCP_DIMENSIONS = 512;
export const UCP_GTS_VERSION = "adcp-gts-v1.0";   // referenced by capabilityService.ts gts block

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
        phase: "v1",
        vector_endpoint: `/signals/${signalId}/embedding`,
    };
}

// ── Base capability declaration ───────────────────────────────────────────────
// Spread into capabilityService.ts ucp block. GTS version/thresholds and all
// sub-blocks (gts, projector, handshake_simulator, nl_query, concept_registry)
// are defined in capabilityService.ts, not here.

export const UCP_CAPABILITY: UcpCapabilityDeclaration = {
    supported_spaces: [UCP_SPACE_ID],
    supported_encodings: ["float32"],
    dimensions: [UCP_DIMENSIONS],
    embedding_endpoint_template: "/signals/{signal_id}/embedding",
    similarity_search: true,
    phase: "v1",
};