/**
 * src/routes/simulateHandshake.ts
 *
 * POST /ucp/simulate-handshake — Phase 1 buyer-side handshake simulator.
 *
 * Accepts a buyer agent's capability payload and returns the negotiated
 * outcome across the three UCP VAC phases described in the article:
 *
 *  Phase 1 — Capability Discovery
 *    Buyer declares its supported models and UCP version.
 *    Seller checks for a direct space match.
 *
 *  Phase 2 — Signal Exchange (Embeddings)
 *    If spaces match, buyer can query /signals/:id/embedding directly.
 *    If spaces differ but a projector exists, buyer fetches /ucp/projector.
 *
 *  Phase 3 — Legacy Fallback
 *    If neither direct match nor projector is available, fall back to
 *    AdCOM Segment IDs via the legacy_fallback block in x_ucp.
 *
 * Request body:
 * {
 *   "buyer_space_ids":   ["openai-te3-small-d512-v1", "bert-base-uncased-v1"],
 *   "buyer_ucp_version": "ucp-v1",
 *   "buyer_agent_id":    "optional-string"
 * }
 *
 * Response:
 * {
 *   "outcome":              "direct_match" | "projector_required" | "legacy_fallback",
 *   "outcome_description":  string,
 *   "matched_space":        string | null,
 *   "projector_endpoint":   string | null,
 *   "projector_status":     "simulated" | "official" | null,
 *   "fallback_mechanism":   string | null,
 *   "fallback_example":     object | null,
 *   "seller_space_id":      string,
 *   "seller_phase":         "v1" | "pseudo-v1",
 *   "gts_endpoint":         string,
 *   "embedding_endpoint_template": string,
 *   "negotiation_trace":    NegotiationStep[]
 * }
 *
 * Public endpoint — no auth required.
 */

import { jsonResponse, errorResponse } from "./shared";

// ─── Seller constants (this provider) ────────────────────────────────────────

const SELLER_SPACE_ID   = "openai-te3-small-d512-v1";
const SELLER_PHASE      = "v1" as const;
const SELLER_UCP_VER    = "ucp-v1";
const PROJECTOR_STATUS  = "simulated" as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type Outcome = "direct_match" | "projector_required" | "legacy_fallback";

interface NegotiationStep {
  step:   number;
  check:  string;
  result: string;
  pass:   boolean;
}

interface HandshakeRequest {
  buyer_space_ids?:   string[];
  buyer_ucp_version?: string;
  buyer_agent_id?:    string;
}

interface HandshakeResponse {
  outcome:                     Outcome;
  outcome_description:         string;
  matched_space:               string | null;
  projector_endpoint:          string | null;
  projector_status:            "simulated" | "official" | null;
  fallback_mechanism:          string | null;
  fallback_example:            object | null;
  seller_space_id:             string;
  seller_phase:                string;
  gts_endpoint:                string;
  embedding_endpoint_template: string;
  negotiation_trace:           NegotiationStep[];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleSimulateHandshake(request: Request): Promise<Response> {
  let body: HandshakeRequest;
  try {
    body = await request.json() as HandshakeRequest;
  } catch {
    return errorResponse("INVALID_BODY", "Request body must be valid JSON", 400);
  }

  const buyerSpaces  = Array.isArray(body.buyer_space_ids) ? body.buyer_space_ids : [];
  const buyerUcpVer  = typeof body.buyer_ucp_version === "string" ? body.buyer_ucp_version : null;
  const buyerAgentId = typeof body.buyer_agent_id   === "string" ? body.buyer_agent_id   : "unknown-buyer";

  const trace: NegotiationStep[] = [];

  // ── Step 1: UCP version compatibility ─────────────────────────────────────
  const ucpVersionMatch = buyerUcpVer === SELLER_UCP_VER || buyerUcpVer === null;
  trace.push({
    step:   1,
    check:  `UCP version compatibility (buyer: ${buyerUcpVer ?? "not declared"}, seller: ${SELLER_UCP_VER})`,
    result: ucpVersionMatch
      ? "Compatible — proceeding to space negotiation"
      : `Version mismatch. Seller requires ${SELLER_UCP_VER}. Falling back to legacy.`,
    pass:   ucpVersionMatch,
  });

  if (!ucpVersionMatch) {
    return jsonResponse(buildResponse("legacy_fallback", trace, null));
  }

  // ── Step 2: Direct space match ─────────────────────────────────────────────
  const matchedSpace = buyerSpaces.find(s => s === SELLER_SPACE_ID) ?? null;
  trace.push({
    step:   2,
    check:  `Direct space match (seller space: ${SELLER_SPACE_ID}, buyer declares: [${buyerSpaces.join(", ") || "none"}])`,
    result: matchedSpace
      ? `Match found: ${matchedSpace}. Buyer can call /signals/:id/embedding directly.`
      : `No direct match. Checking projector availability.`,
    pass:   matchedSpace !== null,
  });

  if (matchedSpace) {
    return jsonResponse(buildResponse("direct_match", trace, matchedSpace));
  }

  // ── Step 3: Projector availability ────────────────────────────────────────
  // Projector is available (simulated) — maps openai-te3-small-d512-v1 → ucp-space-v1.0
  const projectorAvailable = true;
  trace.push({
    step:   3,
    check:  "Projector availability (GET /ucp/projector)",
    result: projectorAvailable
      ? `Projector available (status: ${PROJECTOR_STATUS}). ` +
        "Buyer can fetch /ucp/projector and apply the rotation matrix to projected vectors. " +
        "Note: status=simulated means IAB reference model not yet published. " +
        "Cosine comparisons in ucp-space-v1.0 are experimental."
      : "No projector available. Falling back to legacy AdCOM Segment IDs.",
    pass:   projectorAvailable,
  });

  if (projectorAvailable) {
    return jsonResponse(buildResponse("projector_required", trace, null));
  }

  // ── Step 4: Legacy fallback ────────────────────────────────────────────────
  trace.push({
    step:   4,
    check:  "Legacy fallback (AdCOM Segment ID)",
    result: "Using x_ucp.legacy_fallback.segment_ids from the signal response. " +
            "Meaning is coarse — segment labels only, no vector semantics.",
    pass:   true,
  });

  return jsonResponse(buildResponse("legacy_fallback", trace, null));
}

// ─── Response builder ─────────────────────────────────────────────────────────

function buildResponse(
  outcome: Outcome,
  trace: NegotiationStep[],
  matchedSpace: string | null
): HandshakeResponse {
  const descriptions: Record<Outcome, string> = {
    direct_match:
      "Buyer and seller share the same embedding space. " +
      "Buyer may call /signals/:id/embedding directly and compute cosine similarity " +
      "without any transformation. This is the optimal path.",
    projector_required:
      "Buyer operates a different embedding space. Seller provides a Procrustes/SVD " +
      "rotation matrix at /ucp/projector to project seller vectors into ucp-space-v1.0. " +
      "Buyer fetches the matrix, applies it to seller vectors, then computes cosine in the " +
      "projected space. Status=simulated: IAB reference model not yet published.",
    legacy_fallback:
      "No embedding-level compatibility. System falls back to AdCOM Segment IDs " +
      "via x_ucp.legacy_fallback in every signal response. Meaning is coarse — " +
      "segment labels only. Rich vector semantics are lost. This is the fallback path.",
  };

  const fallbackExample =
    outcome === "legacy_fallback"
      ? {
          note:    "Every signal response includes x_ucp.legacy_fallback",
          example: {
            signal_agent_segment_id: "sig_drama_viewers",
            segment_ids:             ["105"],
            taxonomy_version:        "iab_audience_1.1",
          },
        }
      : null;

  return {
    outcome,
    outcome_description:         descriptions[outcome],
    matched_space:               matchedSpace,
    projector_endpoint:          outcome === "projector_required" ? "/ucp/projector" : null,
    projector_status:            outcome === "projector_required" ? PROJECTOR_STATUS : null,
    fallback_mechanism:          outcome === "legacy_fallback" ? "x_ucp.legacy_fallback.segment_ids" : null,
    fallback_example:            fallbackExample,
    seller_space_id:             SELLER_SPACE_ID,
    seller_phase:                SELLER_PHASE,
    gts_endpoint:                "/ucp/gts",
    embedding_endpoint_template: "/signals/{signal_id}/embedding",
    negotiation_trace:           trace,
  };
}
