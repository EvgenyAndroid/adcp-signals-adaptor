/**
 * src/domain/semanticResolver.ts
 *
 * Embedding-based semantic resolver for NLAQ Pass 2.
 *
 * Responsibility: given a single AudienceQueryLeaf and a catalog of signals,
 * return ranked SemanticMatch[] by cosine similarity between the leaf's
 * description embedding and each signal's semantic text embedding.
 *
 * Design rules:
 * - Accepts an EmbeddingEngine instance injected by the caller (nlQueryHandler).
 * - Query vector and candidate vectors use the SAME engine → same vector space → valid cosine.
 * - Never mixes pseudo and llm vectors in the same comparison set.
 * - Never calls the /signals/:id/embedding HTTP route; uses the engine directly.
 * - Stateless; safe to reuse across leaves within one request.
 * - Candidate signal vectors are batch-fetched per resolve() call. No shared cache.
 *   (Callers may wrap in a per-request cache if performance requires it.)
 */

import type { AudienceQueryLeaf } from './queryParser';
import type { EmbeddingEngine } from '../ucp/embeddingEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CatalogSignalForSemantic {
  id: string;
  name: string;
  description?: string;
  category?: string;
  taxonomy_id?: string;
  // D1 wire-name alias. Production catalog rows carry both — semanticResolver
  // uses `id` exclusively, but the object shape passed through the pipeline
  // mirrors the D1 row. Declared here so consumers don't need to cast.
  signal_agent_segment_id?: string;
  category_type?: string;
  estimated_audience_size?: number;
  coverage_percentage?: number;
  iab_taxonomy_ids?: string[];
  rules?: Array<{ dimension: string; operator: string; value: string | number | string[] }>;
}

export interface SemanticMatch {
  signalId: string;
  signalName: string;
  score: number;          // cosine similarity 0..1, already normalized
  match_method: 'embedding_similarity';
}

// ─── Semantic text derivation ─────────────────────────────────────────────────

/**
 * buildSignalSemanticText — canonical way to derive a signal's semantic text for embedding.
 *
 * Priority (highest to lowest):
 *   1. description (richest content)
 *   2. name
 *   3. category hint if present
 *   4. taxonomy ID suffix if present
 *
 * Deterministic: same inputs → same string → same embedding vector.
 * Easy to test: pure function, no side effects.
 */
export function buildSignalSemanticText(signal: CatalogSignalForSemantic): string {
  const parts: string[] = [];

  if (signal.description && signal.description.trim().length > 0) {
    parts.push(signal.description.trim());
  }

  if (signal.name && signal.name.trim().length > 0) {
    parts.push(signal.name.trim());
  }

  if (signal.category && signal.category.trim().length > 0) {
    parts.push(`Category: ${signal.category.trim()}`);
  }

  if (signal.taxonomy_id && signal.taxonomy_id.trim().length > 0) {
    parts.push(`Taxonomy: ${signal.taxonomy_id.trim()}`);
  }

  // Fallback: should never happen if catalog is valid
  if (parts.length === 0) {
    return signal.id;
  }

  return parts.join('. ');
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

/**
 * cosineSimilarity — dot product of two l2-normalized vectors.
 * Both engines (pseudo and LLM) return l2-normalized vectors, so dot product == cosine.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  // Length-check above guarantees both indices in bounds; the `?? 0`
  // satisfies noUncheckedIndexedAccess without changing the math.
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  // Clamp to [-1, 1] to handle float rounding
  return Math.max(-1, Math.min(1, dot));
}

// ─── SemanticResolver ─────────────────────────────────────────────────────────

export interface SemanticResolverOptions {
  topN?: number;          // max candidates to return (default 5)
  minScore?: number;      // minimum cosine similarity to include (default 0.0)
}

export class SemanticResolver {
  private readonly topN: number;
  private readonly minScore: number;

  constructor(
    private readonly engine: EmbeddingEngine,
    opts: SemanticResolverOptions = {},
  ) {
    this.topN = opts.topN ?? 5;
    this.minScore = opts.minScore ?? 0.0;
  }

  /**
   * resolve — embed the leaf description and compare against all catalog signals.
   *
   * Returns top-N SemanticMatch[] sorted descending by score.
   *
   * If the engine is pseudo (phase=pseudo-v1), semantic similarity is not
   * mathematically valid. The caller (QueryResolver) should treat pseudo results
   * as a structural fallback and surface a warning in the response.
   *
   * Concurrency: all candidate signal embeddings are fetched in parallel via
   * Promise.all. For the LLM engine this avoids N sequential API calls.
   * For the pseudo engine it's effectively synchronous.
   */
  async resolve(
    leaf: AudienceQueryLeaf,
    catalog: CatalogSignalForSemantic[],
  ): Promise<SemanticMatch[]> {
    const queryText = this.buildQueryText(leaf);

    // Embed query leaf and all candidates in parallel
    const [queryVec, ...candidateVecs] = await Promise.all([
      this.engine.embedText(queryText),
      ...catalog.map(s => this.engine.embedSignal(s.id, buildSignalSemanticText(s))),
    ]);

    const matches: SemanticMatch[] = [];
    if (!queryVec) return matches; // engine yielded no vector — skip scoring
    for (let i = 0; i < catalog.length; i++) {
      const candidate = catalog[i];
      const candidateVec = candidateVecs[i];
      if (!candidate || !candidateVec) continue; // shouldn't happen; index guard
      const score = cosineSimilarity(queryVec, candidateVec);
      if (score >= this.minScore) {
        matches.push({
          signalId: candidate.id,
          signalName: candidate.name,
          score: Math.max(0, score),
          match_method: 'embedding_similarity',
        });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topN);
  }

  /**
   * buildQueryText — derive what to embed for the leaf.
   *
   * Priority:
   *   1. leaf.description (rich NL text from Claude parser) — preferred
   *   2. leaf.value (structured token, e.g. "desperate_housewives")
   *   3. leaf.dimension + leaf.value
   */
  private buildQueryText(leaf: AudienceQueryLeaf): string {
    if (leaf.description && leaf.description.trim().length > 10) {
      return leaf.description.trim();
    }
    if (leaf.value && leaf.value.trim().length > 0) {
      return `${leaf.dimension}: ${leaf.value.trim()}`;
    }
    return leaf.dimension;
  }
}
