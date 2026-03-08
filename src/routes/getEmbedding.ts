// src/routes/getEmbedding.ts
// GET /signals/:id/embedding
// Returns the full VAC-compliant float32 vector for a single signal.
// Cached in KV. Falls back to pseudo-embedding engine.

import type { Env } from "../types/env";
import { findSignalById } from "../storage/signalRepo";
import { getDb } from "../storage/db";
import { createEmbeddingEngine, vectorToBase64 } from "../ucp/embeddingEngine";
import { buildVacDeclaration } from "../ucp/vacDeclaration";
import { jsonResponse, errorResponse } from "./shared";
import type { Logger } from "../utils/logger";
import type { UcpEmbeddingVector } from "../types/ucp";

const KV_PREFIX = "ucp_embedding_v1:";
const KV_TTL_SECONDS = 86_400; // 24hr cache

export async function handleGetEmbedding(
  signalId: string,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (!signalId) {
    return errorResponse("INVALID_SIGNAL_ID", "Signal ID is required", 400);
  }

  // Check KV cache first
  const cacheKey = `${KV_PREFIX}${signalId}`;
  const cached = await env.SIGNALS_CACHE.get(cacheKey);
  if (cached) {
    logger.info("embedding_cache_hit", { signalId });
    return jsonResponse(JSON.parse(cached));
  }

  // Load signal from D1
  const db = getDb(env);
  const signal = await findSignalById(db, signalId);
  if (!signal) {
    return errorResponse("NOT_FOUND", `Signal not found: ${signalId}`, 404);
  }

  // Generate embedding
  const engine = createEmbeddingEngine(env as unknown as Record<string, string>);
  const vector = await engine.generate(signal);
  const vac = buildVacDeclaration(signalId);

  const response: UcpEmbeddingVector = {
    ...vac,
    vector: vectorToBase64(vector),
    generated_at: new Date().toISOString(),
    cache_ttl_seconds: KV_TTL_SECONDS,
  };

  // Cache in KV
  await env.SIGNALS_CACHE.put(cacheKey, JSON.stringify(response), {
    expirationTtl: KV_TTL_SECONDS,
  });

  logger.info("embedding_generated", { signalId, engine: engine.modelId });
  return jsonResponse(response);
}
