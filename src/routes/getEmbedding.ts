/**
 * src/routes/getEmbedding.ts
 *
 * Serves per-signal embedding vectors for UCP VAC compliance.
 * Returns real OpenAI text-embedding-3-small 512-dim vectors from embeddingStore.
 * Falls back to pseudo-hash for signals not yet in the store.
 *
 * GET /signals/:id/embedding
 *
 * Response shape (UCP v0.2 §2, VAC-compliant):
 * {
 *   signal_agent_segment_id: string,
 *   embedding: {
 *     model_id:        string,
 *     model_family:    string,
 *     space_id:        string,
 *     dimensions:      512,
 *     encoding:        "float32",
 *     normalization:   "l2",
 *     distance_metric: "cosine",
 *     phase:           "llm-v1" | "pseudo-v1",
 *     vector:          number[],
 *     vector_endpoint: "/signals/{id}/embedding"
 *   }
 * }
 *
 * Bug #2 fix: import UCP_MODEL_FAMILY (and sibling constants) from vacDeclaration
 * instead of hardcoding string literals, so there is a single source of truth.
 */

import type { Env }          from "../types/env";
import type { Logger }       from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { getSignalEmbedding, EMBEDDING_MODEL_ID, EMBEDDING_SPACE_ID, EMBEDDING_DIMENSIONS }
  from "../domain/embeddingStore";
import { findSignalById }    from "../storage/signalRepo";
import { getDb }             from "../storage/db";
import {
  UCP_MODEL_ID as PSEUDO_MODEL_ID,
  UCP_MODEL_FAMILY as PSEUDO_MODEL_FAMILY,
  UCP_SPACE_ID as PSEUDO_SPACE_ID,
  UCP_DIMENSIONS as PSEUDO_DIMENSIONS,
} from "../ucp/vacDeclaration";

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
        phase:           "llm-v1",
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
      model_id:        PSEUDO_MODEL_ID,
      model_family:    PSEUDO_MODEL_FAMILY,
      space_id:        PSEUDO_SPACE_ID,
      dimensions:      PSEUDO_DIMENSIONS,
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

// ── Pseudo-hash fallback (matches PseudoEmbeddingEngine algorithm) ────────────

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

function generatePseudoVector(signalId: string, description?: string): number[] {
  const text = (description ?? signalId).toLowerCase().trim();
  const seed = djb2(text);
  const dims = 512;
  const vec: number[] = [];
  let rng = seed;
  for (let i = 0; i < dims; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    vec.push((rng / 0xffffffff) * 2 - 1);
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map(x => x / norm);
}
