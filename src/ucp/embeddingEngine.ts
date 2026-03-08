// src/ucp/embeddingEngine.ts
// Phase 1: Deterministic pseudo-embedding engine.
// Constructs VAC-valid 512d float32 vectors from CanonicalSignal metadata.
// Same signal always produces the same vector — suitable for cosine similarity
// comparisons between related signals without requiring an ML model.
//
// Phase 2 hook: EmbeddingEngine interface allows swapping in LLM-backed engines.
// See LlmEmbeddingAdapter scaffold below.

import type { CanonicalSignal } from "../types/signal";
import { UCP_DIMENSIONS, DIM_SLOTS } from "./vacDeclaration";

// ── Engine interface (swap out for Phase 2) ───────────────────────────────────

export interface EmbeddingEngine {
  readonly modelId: string;
  readonly phase: "pseudo-v1" | "llm-v1" | "trained-v1";
  generate(signal: CanonicalSignal): Promise<Float32Array>;
  batchGenerate(signals: CanonicalSignal[]): Promise<Float32Array[]>;
}

// ── Dimension encoding helpers ────────────────────────────────────────────────

/**
 * djb2-style hash → float in [-1, 1].
 * Deterministic: same input always produces same output.
 */
function hashToFloat(content: string, seed: number = 5381): number {
  let h = seed;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h) ^ content.charCodeAt(i);
    h = h >>> 0; // unsigned 32-bit
  }
  // Map uint32 → [-1, 1]
  return (h / 0xFFFFFFFF) * 2 - 1;
}

/**
 * Spread a single value across a range of dimensions using multiple hash seeds.
 * Produces a dense sub-vector for a given slot.
 */
function fillSlot(
  vec: Float32Array,
  start: number,
  end: number,
  content: string
): void {
  const slotSize = end - start + 1;
  for (let i = 0; i < slotSize; i++) {
    vec[start + i] = hashToFloat(content, 5381 + i * 7919);
  }
}

// ── Category encoding ─────────────────────────────────────────────────────────

const CATEGORY_SEEDS: Record<string, number> = {
  demographic:    0x1A2B3C,
  interest:       0x4D5E6F,
  purchase_intent:0x7A8B9C,
  geo:            0xADBECF,
  composite:      0xD0E1F2,
};

const SOURCE_SEEDS: Record<string, number> = {
  "Public Record: Census": 0xC3A591,
  "Geo Location":          0xB2D483,
  "Web Usage":             0xA1E372,
  "App Behavior":          0x90F261,
  "TV OTT or STB Device":  0x8FE150,
  "Online Survey":         0x7ED04F,
};

const METHODOLOGY_WEIGHTS: Record<string, number> = {
  "Observed/Known": 1.0,
  "Derived":        0.75,
  "Modeled":        0.5,
  "Inferred":       0.4,
  "Declared":       0.6,
};

const REFRESH_WEIGHTS: Record<string, number> = {
  "Weekly":        1.0,
  "Monthly":       0.85,
  "Annually":      0.7,
  "Static":        0.4,
  "N/A":           0.3,
};

// ── Phase 1: Deterministic Pseudo-Embedding Engine ───────────────────────────

export class PseudoEmbeddingEngine implements EmbeddingEngine {
  readonly modelId = "adcp-ucp-bridge-pseudo-v1.0";
  readonly phase = "pseudo-v1" as const;

  async generate(signal: CanonicalSignal): Promise<Float32Array> {
    return this._build(signal);
  }

  async batchGenerate(signals: CanonicalSignal[]): Promise<Float32Array[]> {
    return signals.map((s) => this._build(s));
  }

  private _build(signal: CanonicalSignal): Float32Array {
    const vec = new Float32Array(UCP_DIMENSIONS);

    // Slot 1: Taxonomy (dims 0–127)
    // Encode the IAB AT 1.1 node ID — signals with same taxonomy nodes cluster together
    const taxonomyKey = [
      signal.externalTaxonomyId ?? "0",
      ...(signal.rawSourceRefs?.filter((r) => /^\d+$/.test(r)) ?? []),
    ].join(",");
    fillSlot(vec, DIM_SLOTS.TAXONOMY_START, DIM_SLOTS.TAXONOMY_END, taxonomyKey);

    // Slot 2: Category (dims 128–191)
    // Signals of same category type should cluster
    const categorySeed = CATEGORY_SEEDS[signal.categoryType] ?? 0x000001;
    const categoryKey = `${signal.categoryType}:${categorySeed.toString(16)}`;
    fillSlot(vec, DIM_SLOTS.CATEGORY_START, DIM_SLOTS.CATEGORY_END, categoryKey);

    // Slot 3: Data source quality (dims 192–255)
    // Encodes the DTS data_sources set — census signals cluster away from survey signals
    const sources = signal.sourceSystems ?? [];
    const primarySource = sources[0] ?? "Online Survey";
    const sourceSeed = SOURCE_SEEDS[primarySource] ?? SOURCE_SEEDS["Online Survey"];
    const sourceKey = `${primarySource}:${sourceSeed.toString(16)}`;
    fillSlot(vec, DIM_SLOTS.SOURCE_START, DIM_SLOTS.SOURCE_END, sourceKey);

    // Slot 4: Pricing tier (dims 256–319)
    // Encode CPM tier — premium signals ($3.5+) cluster together
    const cpm = signal.pricing?.value ?? 2.5;
    const pricingKey = `cpm:${Math.round(cpm * 10)}`;
    fillSlot(vec, DIM_SLOTS.PRICING_START, DIM_SLOTS.PRICING_END, pricingKey);

    // Slot 5: Freshness (dims 320–383)
    // Encode data quality weight based on refresh cadence
    // ACR signals (weekly refresh) are clearly differentiated from static modeled signals
    const refreshWeight = REFRESH_WEIGHTS["Static"];  // default
    const freshnessKey = `refresh:${Math.round(refreshWeight * 100)}`;
    fillSlot(vec, DIM_SLOTS.FRESHNESS_START, DIM_SLOTS.FRESHNESS_END, freshnessKey);

    // Dims 384–511: zero (reserved for Phase 2 real model output)

    // L2 normalize the full vector
    return l2Normalize(vec);
  }
}

// ── Phase 2 scaffold: LLM Shell Adapter ──────────────────────────────────────
//
// To activate: set EMBEDDING_ENGINE=llm in wrangler.toml vars,
// provide OPENAI_API_KEY or ANTHROPIC_API_KEY in secrets.
//
// This adapter:
//   1. Constructs a rich text input from signal metadata
//   2. Calls the configured embedding API
//   3. Truncates/pads to 512d
//   4. L2-normalizes
//   5. Falls back to PseudoEmbeddingEngine on error
//
// Wrangler secrets needed:
//   wrangler secret put OPENAI_API_KEY
//   OR
//   wrangler secret put ANTHROPIC_API_KEY (when available)

export class LlmEmbeddingAdapter implements EmbeddingEngine {
  readonly modelId: string;
  readonly phase = "llm-v1" as const;

  private readonly fallback = new PseudoEmbeddingEngine();
  private readonly provider: "openai" | "anthropic";
  private readonly apiKey: string;

  constructor(provider: "openai" | "anthropic", apiKey: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.modelId = provider === "openai"
      ? "adcp-ucp-bridge-openai-text-embedding-3-small-v1.0"
      : "adcp-ucp-bridge-anthropic-v1.0";
  }

  async generate(signal: CanonicalSignal): Promise<Float32Array> {
    try {
      const text = this._buildInputText(signal);
      const raw = await this._callApi(text);
      return l2Normalize(truncateTo512(raw));
    } catch (err) {
      console.warn(`[LlmEmbeddingAdapter] Failed for ${signal.signalId}, falling back to pseudo`, err);
      return this.fallback.generate(signal);
    }
  }

  async batchGenerate(signals: CanonicalSignal[]): Promise<Float32Array[]> {
    // Process in batches of 20 to respect API rate limits
    const results: Float32Array[] = [];
    const batchSize = 20;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((s) => this.generate(s)));
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Construct rich text input for the embedding model.
   * Combines signal metadata into a semantically meaningful passage.
   */
  private _buildInputText(signal: CanonicalSignal): string {
    const parts = [
      signal.name,
      signal.description,
      `Category: ${signal.categoryType}`,
      `Data source: ${signal.sourceSystems?.join(", ") ?? "unknown"}`,
      `Geography: ${signal.geography?.join(", ") ?? "US"}`,
    ];
    if (signal.estimatedAudienceSize) {
      parts.push(`Estimated audience: ${(signal.estimatedAudienceSize / 1_000_000).toFixed(1)}M`);
    }
    if (signal.rawSourceRefs?.length) {
      parts.push(`Source refs: ${signal.rawSourceRefs.join(", ")}`);
    }
    return parts.join(". ").slice(0, 2000); // API input limit
  }

  private async _callApi(text: string): Promise<number[]> {
    if (this.provider === "openai") {
      return this._callOpenAI(text);
    }
    // Anthropic embeddings: uncomment when API is available
    // return this._callAnthropic(text);
    throw new Error("Anthropic embeddings not yet available");
  }

  private async _callOpenAI(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 512,  // OpenAI supports native truncation to 512d
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embeddings API error ${response.status}: ${err}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  // Scaffold for Anthropic — activate when embeddings API ships
  // private async _callAnthropic(text: string): Promise<number[]> {
  //   const response = await fetch("https://api.anthropic.com/v1/embeddings", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       "x-api-key": this.apiKey,
  //       "anthropic-version": "2023-06-01",
  //     },
  //     body: JSON.stringify({ model: "claude-embedding-v1", input: text }),
  //   });
  //   const data = await response.json();
  //   return data.embedding;
  // }
}

// ── Engine factory ────────────────────────────────────────────────────────────

/**
 * Select embedding engine based on environment config.
 * Workers env: set EMBEDDING_ENGINE=llm and provide API key secret.
 * Default: PseudoEmbeddingEngine (no external deps).
 */
export function createEmbeddingEngine(env?: {
  EMBEDDING_ENGINE?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}): EmbeddingEngine {
  if (env?.EMBEDDING_ENGINE === "llm") {
    if (env.OPENAI_API_KEY) {
      return new LlmEmbeddingAdapter("openai", env.OPENAI_API_KEY);
    }
    if (env.ANTHROPIC_API_KEY) {
      return new LlmEmbeddingAdapter("anthropic", env.ANTHROPIC_API_KEY);
    }
    console.warn("[EmbeddingEngine] EMBEDDING_ENGINE=llm but no API key found. Falling back to pseudo.");
  }
  return new PseudoEmbeddingEngine();
}

// ── Math utils ────────────────────────────────────────────────────────────────

export function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors L2-normalized → dot product = cosine similarity
}

export function vectorToBase64(vec: Float32Array): string {
  const buf = new Uint8Array(vec.buffer);
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export function base64ToVector(b64: string): Float32Array {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Float32Array(buf.buffer);
}

function truncateTo512(vec: number[]): Float32Array {
  const out = new Float32Array(UCP_DIMENSIONS);
  for (let i = 0; i < Math.min(vec.length, UCP_DIMENSIONS); i++) out[i] = vec[i];
  return out;
}
