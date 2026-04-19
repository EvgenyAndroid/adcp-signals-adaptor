/**
 * src/routes/ucp/handshake.ts
 *
 * POST /ucp/simulate-handshake — UCP VAC negotiation simulator.
 *
 * Simulates the three-way handshake between buyer and seller embedding agents:
 *   1. Version compatibility check (buyer ucp_version vs seller ucp-v1)
 *   2. Direct space match (buyer_space_ids ∩ seller supported spaces)
 *   3. Projector fallback (if no direct match)
 *   4. Legacy fallback (if version mismatch)
 *
 * seller_phase fix:
 *   Was hardcoding seller_phase: "v1" regardless of the active engine.
 *   Now reads engine.phase from createEmbeddingEngine(env), so it correctly
 *   reports "pseudo-v1" when OPENAI_API_KEY is missing / EMBEDDING_ENGINE != "llm",
 *   and "llm-v1" when the real engine is active.
 *
 * This fixes the inconsistency between:
 *   GET /capabilities → ucp.phase: "pseudo-v1"
 *   POST /ucp/simulate-handshake → seller_phase: "v1"   ← was wrong
 */

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { createEmbeddingEngine } from "../ucp/embeddingEngine";

// ── Seller configuration ──────────────────────────────────────────────────────

// The seller supports both spaces simultaneously:
//   - LLM space:    active when EMBEDDING_ENGINE=llm + OPENAI_API_KEY present
//   - Pseudo space: always supported as fallback
const SELLER_SUPPORTED_SPACES = [
  "openai-te3-small-d512-v1",   // real vectors
  "adcp-bridge-space-v1.0",     // pseudo fallback
];

const SELLER_UCP_VERSION = "ucp-v1";
const PROJECTOR_STATUS = "simulated"; // IAB ref model not yet published

// ── Handler ───────────────────────────────────────────────────────────────────

interface HandshakeRequest {
  buyer_space_ids: string[];
  buyer_ucp_version: string;
  buyer_agent_id?: string;
}

export async function handleSimulateHandshake(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  let body: HandshakeRequest;
  try {
    body = await request.json() as HandshakeRequest;
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body", 400);
  }

  const { buyer_space_ids = [], buyer_ucp_version, buyer_agent_id } = body;

  // Determine actual engine phase from runtime env — this is the fix
  const engine = createEmbeddingEngine(env);
  const sellerPhase = engine.phase;           // "pseudo-v1" or "llm-v1"
  const sellerSpaceId = engine.spaceId;       // actual active space

  logger.info("ucp_handshake", { buyer_ucp_version, buyer_agent_id, sellerPhase });

  const trace: Array<{ step: number; check: string; result: string; pass: boolean }> = [];

  // ── Step 1: Version compatibility ─────────────────────────────────────────
  const versionCompatible = buyer_ucp_version === SELLER_UCP_VERSION;
  trace.push({
    step: 1,
    check: `UCP version compatibility (buyer: ${buyer_ucp_version}, seller: ${SELLER_UCP_VERSION})`,
    result: versionCompatible
      ? "Compatible — proceeding to space negotiation"
      : `Version mismatch. Seller requires ${SELLER_UCP_VERSION}. Falling back to legacy.`,
    pass: versionCompatible,
  });

  if (!versionCompatible) {
    return jsonResponse({
      outcome: "legacy_fallback",
      outcome_description:
        "No embedding-level compatibility. System falls back to AdCOM Segment IDs via " +
        "x_ucp.legacy_fallback in every signal response. Meaning is coarse — segment labels only. " +
        "Rich vector semantics are lost. This is the fallback path.",
      matched_space: null,
      projector_endpoint: null,
      projector_status: null,
      fallback_mechanism: "x_ucp.legacy_fallback.segment_ids",
      fallback_example: {
        note: "Every signal response includes x_ucp.legacy_fallback",
        example: {
          signal_agent_segment_id: "sig_drama_viewers",
          segment_ids: ["105"],
          taxonomy_version: "iab_audience_1.1",
        },
      },
      seller_space_id: sellerSpaceId,
      seller_phase: sellerPhase,
      gts_endpoint: "/ucp/gts",
      embedding_endpoint_template: "/signals/{signal_id}/embedding",
      negotiation_trace: trace,
    });
  }

  // ── Step 2: Direct space match ────────────────────────────────────────────
  const matchedSpace = buyer_space_ids.find((s) => SELLER_SUPPORTED_SPACES.includes(s));
  trace.push({
    step: 2,
    check: `Direct space match (seller space: ${sellerSpaceId}, buyer declares: [${buyer_space_ids.join(", ")}])`,
    result: matchedSpace
      ? `Match found: ${matchedSpace}. Buyer can call /signals/:id/embedding directly.`
      : "No direct match. Checking projector availability.",
    pass: Boolean(matchedSpace),
  });

  if (matchedSpace) {
    return jsonResponse({
      outcome: "direct_match",
      outcome_description:
        "Buyer and seller share the same embedding space. Buyer may call " +
        "/signals/:id/embedding directly and compute cosine similarity without any " +
        "transformation. This is the optimal path.",
      matched_space: matchedSpace,
      projector_endpoint: null,
      projector_status: null,
      fallback_mechanism: null,
      fallback_example: null,
      seller_space_id: sellerSpaceId,
      seller_phase: sellerPhase,
      gts_endpoint: "/ucp/gts",
      embedding_endpoint_template: "/signals/{signal_id}/embedding",
      negotiation_trace: trace,
    });
  }

  // ── Step 3: Projector ─────────────────────────────────────────────────────
  trace.push({
    step: 3,
    check: "Projector availability (GET /ucp/projector)",
    result:
      `Projector available (status: ${PROJECTOR_STATUS}). Buyer can fetch /ucp/projector ` +
      "and apply the rotation matrix to projected vectors. " +
      `Note: status=${PROJECTOR_STATUS} means IAB reference model not yet published. ` +
      "Cosine comparisons in ucp-space-v1.0 are experimental.",
    pass: true,
  });

  return jsonResponse({
    outcome: "projector_required",
    outcome_description:
      "Buyer operates a different embedding space. Seller provides a Procrustes/SVD rotation " +
      "matrix at /ucp/projector to project seller vectors into ucp-space-v1.0. Buyer fetches " +
      "the matrix, applies it to seller vectors, then computes cosine in the projected space. " +
      `Status=${PROJECTOR_STATUS}: IAB reference model not yet published.`,
    matched_space: null,
    projector_endpoint: "/ucp/projector",
    projector_status: PROJECTOR_STATUS,
    fallback_mechanism: null,
    fallback_example: null,
    seller_space_id: sellerSpaceId,
    seller_phase: sellerPhase,
    gts_endpoint: "/ucp/gts",
    embedding_endpoint_template: "/signals/{signal_id}/embedding",
    negotiation_trace: trace,
  });
}
