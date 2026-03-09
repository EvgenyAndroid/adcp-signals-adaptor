/**
 * src/routes/getEmbedding.ts  (replace existing file)
 *
 * Serves real OpenAI text-embedding-3-small vectors for each signal.
 * Falls back to pseudo-hash for signals not yet in the store.
 *
 * GET /signals/:id/embedding
 *
 * Response shape (UCP v0.2 §2, VAC-compliant):
 * {
 *   signal_agent_segment_id: string,
 *   embedding: {
 *     model_id:        "text-embedding-3-small",
 *     model_family:    "openai/text-embedding-3",
 *     space_id:        "openai-te3-small-d512-v1",
 *     dimensions:      512,
 *     encoding:        "float32",
 *     normalization:   "l2",
 *     distance_metric: "cosine",
 *     phase:           "v1",               ← was "pseudo-v1"
 *     vector:          number[],
 *     vector_endpoint: "/signals/{id}/embedding"
 *   }
 * }
 */

import type { Env }          from "../types/env";
import type { Logger }       from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { getSignalEmbedding, EMBEDDING_MODEL_ID, EMBEDDING_SPACE_ID, EMBEDDING_DIMENSIONS }
  from "../domain/embeddingStore";
import { findSignalById }    from "../storage/signalRepo";
import { getDb }             from "../storage/db";

export async function handleGetEmbedding(
  signalId: string,
  env: Env,
  logger: Logger
): Promise<Response> {
  logger.info("get_embedding", { signalId });

  // Verify signal exists in D1
  const db     = getDb(env);
  const signal = await findSignalById(db, signalId);
  if (!signal) {
    return errorResponse("NOT_FOUND", `Signal '${signalId}' not found`, 404);
  }

  // Try real embedding store first
  const stored = getSignalEmbedding(signalId);

  if (stored) {
    // Real vector — space_id is semantically valid
    return jsonResponse({
      signal_agent_segment_id: signalId,
      embedding: {
        model_id:        stored.model_id,
        model_family:    "openai/text-embedding-3",
        space_id:        stored.space_id,
        dimensions:      stored.dimensions,
        encoding:        "float32",
        normalization:   "l2",
        distance_metric: "cosine",
        phase:           "v1",
        vector:          stored.vector,
        vector_endpoint: `/signals/${signalId}/embedding`,
      },
    });
  }

  // Fallback: pseudo-hash for signals not yet in the store
  // (dynamic segments generated after the embedding run)
  logger.info("embedding_fallback_pseudo", { signalId });
  const pseudoVector = generatePseudoVector(signalId, signal.description);

  return jsonResponse({
    signal_agent_segment_id: signalId,
    embedding: {
      model_id:        "adcp-ucp-bridge-pseudo-v1.0",
      model_family:    "adcp-bridge/deterministic-taxonomy-v1",
      space_id:        "adcp-bridge-space-v1.0",
      dimensions:      512,
      encoding:        "float32",
      normalization:   "l2",
      distance_metric: "cosine",
      phase:           "pseudo-v1",
      vector:          pseudoVector,
      vector_endpoint: `/signals/${signalId}/embedding`,
      _note:           "Pseudo-hash vector. Re-run embed-signals.html to upgrade to real embeddings.",
    },
  });
}

// ─── Pseudo-hash fallback (unchanged from original) ──────────────────────────

function generatePseudoVector(signalId: string, description: string): number[] {
  const seed   = signalId + (description ?? "");
  const vector = new Array(512).fill(0);
  let   hash   = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  for (let i = 0; i < 512; i++) {
    hash = ((hash << 5) + hash) ^ i;
    hash = hash & hash;
    vector[i] = (hash % 10000) / 10000 - 0.5;
  }
  // L2 normalise
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return vector.map((v) => (norm === 0 ? 0 : v / norm));
}