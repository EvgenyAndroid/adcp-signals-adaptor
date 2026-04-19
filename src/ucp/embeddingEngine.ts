/**
 * src/ucp/embeddingEngine.ts
 *
 * EmbeddingEngine abstraction for UCP VAC compliance.
 *
 * Two implementations:
 *   PseudoEmbeddingEngine  – deterministic hash, no external deps, space_id: adcp-bridge-space-v1.0
 *   LlmEmbeddingEngine     – OpenAI text-embedding-3-small 512-dim, space_id: openai-te3-small-d512-v1
 *
 * v2.1 adds: embedText(text) so the NLAQ semantic resolver can embed a free-form query leaf
 * description using the SAME engine instance it uses for catalog signals.
 * This is the only safe way to compare — query vector and candidate vectors must come from
 * the same engine instance per request (never cross pseudo↔llm spaces).
 *
 * Bug #4 fix: EmbeddingPhase is now re-exported from types/ucp.ts (UcpEmbeddingPhase)
 * so the two types are identical and no cross-import mismatch exists.
 */

// ── Re-export canonical phase type from types/ucp ─────────────────────────────
// This eliminates the duplicate local type and ensures embeddingEngine.phase
// is always assignable to UcpEmbeddingDeclaration.phase without casting.
export type { UcpEmbeddingPhase as EmbeddingPhase } from "../types/ucp";
import type { UcpEmbeddingPhase } from "../types/ucp";
import { fetchWithTimeout } from "../utils/fetchWithLimits";

export interface SignalEmbedding {
  model_id: string;
  model_family?: string;
  space_id: string;
  dimensions: number;
  encoding: 'float32';
  normalization: 'l2';
  distance_metric: 'cosine';
  phase: UcpEmbeddingPhase;
  vector: number[];
  description?: string;
}

/**
 * Core engine interface.
 *
 * embedSignal(id, description) – embed a catalog signal by its stable ID.
 *   Implementations may cache by ID.
 *
 * embedText(text) – embed arbitrary free-form text (e.g. a leaf.description from the query AST).
 *   Added in v2.1 to enable hybrid NLAQ resolving without HTTP round-trips.
 *   Implementations must use the SAME model as embedSignal so vectors are comparable.
 *
 * spaceId / phase – declare the vector space this engine operates in.
 *   The SemanticResolver enforces that all comparisons within one request use one engine instance.
 */
export interface EmbeddingEngine {
  readonly spaceId: string;
  readonly phase: UcpEmbeddingPhase;
  embedSignal(signalId: string, description: string): Promise<number[]>;
  embedText(text: string): Promise<number[]>;
}

// ─── Pseudo engine (deterministic, no external deps) ────────────────────────

/**
 * Deterministic 512-dim pseudo-embedding derived from DJB2 hash of the input text.
 * Not semantically meaningful — cosine similarity between pseudo vectors does not reflect
 * semantic similarity. Used as a safe fallback so the pipeline stays runnable in
 * environments without an OpenAI key.
 *
 * IMPORTANT: SemanticResolver will warn in the response when this engine is active,
 * because pseudo-vector cosine comparisons are not semantically valid.
 */
export class PseudoEmbeddingEngine implements EmbeddingEngine {
  readonly spaceId = 'adcp-bridge-space-v1.0';
  readonly phase: UcpEmbeddingPhase = 'pseudo-v1';

  private djb2(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h = h >>> 0;
    }
    return h;
  }

  private pseudoVec(text: string): number[] {
    const seed = this.djb2(text.toLowerCase().trim());
    const dims = 512;
    const vec: number[] = [];
    let rng = seed;
    for (let i = 0; i < dims; i++) {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      vec.push((rng / 0xffffffff) * 2 - 1);
    }
    return this.l2Normalize(vec);
  }

  private l2Normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm === 0 ? v : v.map(x => x / norm);
  }

  async embedSignal(signalId: string, description: string): Promise<number[]> {
    return this.pseudoVec(description || signalId);
  }

  async embedText(text: string): Promise<number[]> {
    return this.pseudoVec(text);
  }
}

// ─── LLM engine (OpenAI text-embedding-3-small 512-dim) ──────────────────────

/**
 * Real semantic embedding via OpenAI text-embedding-3-small at 512 dimensions.
 * Requires OPENAI_API_KEY.
 *
 * For catalog signals the engine checks embeddingStore first to avoid API calls.
 * For free-text query embeddings (embedText) it always calls the API.
 *
 * Both paths use the same model → vectors are in the same space → cosine is valid.
 */

// Lazy import so embeddingStore is not bundled when LLM engine is not used
let _embeddingStoreModule: typeof import('../domain/embeddingStore') | null = null;
async function getEmbeddingStore() {
  if (!_embeddingStoreModule) {
    _embeddingStoreModule = await import('../domain/embeddingStore');
  }
  return _embeddingStoreModule;
}

export class LlmEmbeddingEngine implements EmbeddingEngine {
  readonly spaceId = 'openai-te3-small-d512-v1';
  readonly phase: UcpEmbeddingPhase = 'llm-v1';

  constructor(private readonly apiKey: string) {}

  private l2Normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm === 0 ? v : v.map(x => x / norm);
  }

  private async callOpenAI(text: string): Promise<number[]> {
    // 15s timeout — OpenAI embeddings typically return in <1s; a 15s cap
    // is generous for p99 while still well under the Worker CPU budget.
    const res = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 512,
      }),
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI embeddings API error ${res.status}: ${err}`);
    }
    const json = (await res.json()) as { data: [{ embedding: number[] }] };
    return this.l2Normalize(json.data[0].embedding);
  }

  /**
   * For catalog signals: check the hardcoded embeddingStore first.
   * If the signal has a pre-built vector (phase llm-v1), use it — no API call.
   * If not (dynamic signals, test fixtures), fall through to live API.
   */
  async embedSignal(signalId: string, description: string): Promise<number[]> {
    try {
      const store = await getEmbeddingStore();
      const stored = store.getSignalEmbedding(signalId);
      // embeddingStore's SignalEmbedding doesn't carry a `phase` field —
      // by construction the static store only holds llm-v1 vectors
      // (generated once via scripts/embed-signals.html with te3-small).
      // A non-empty return here means we have a real vector.
      if (stored && stored.vector.length > 0) {
        return stored.vector;
      }
    } catch {
      // embeddingStore unavailable — fall through
    }
    return this.callOpenAI(description);
  }

  /**
   * Embed arbitrary free-form text — used by SemanticResolver to embed leaf.description.
   * Always calls the OpenAI API; no caching (leaf descriptions are unique per query).
   */
  async embedText(text: string): Promise<number[]> {
    return this.callOpenAI(text);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export type EmbeddingEngineMode = 'pseudo' | 'llm';

export interface EmbeddingEngineEnv {
  EMBEDDING_ENGINE?: string;
  OPENAI_API_KEY?: string;
}

/**
 * createEmbeddingEngine — factory used by both the embedding route and the NLAQ pipeline.
 *
 * Mode selection:
 *   EMBEDDING_ENGINE=llm + OPENAI_API_KEY present → LlmEmbeddingEngine
 *   Otherwise                                     → PseudoEmbeddingEngine
 *
 * The returned instance is passed through the entire NLAQ request so query vectors
 * and candidate vectors always come from the same space.
 */
export function createEmbeddingEngine(env: EmbeddingEngineEnv): EmbeddingEngine {
  if (env.EMBEDDING_ENGINE === 'llm' && env.OPENAI_API_KEY) {
    return new LlmEmbeddingEngine(env.OPENAI_API_KEY);
  }
  return new PseudoEmbeddingEngine();
}
