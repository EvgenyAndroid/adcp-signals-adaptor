#!/usr/bin/env node
/**
 * generate-embedding-store.js
 * Run: node scripts/generate-embedding-store.js embeddings.json > src/domain/embeddingStore.ts
 *
 * Input:  the JSON blob from embed-signals.html (paste to embeddings.json)
 * Output: embeddingStore.ts with all vectors hardcoded
 */

const fs   = require("fs");
const path = require("path");

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node generate-embedding-store.js <embeddings.json>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const signals = Object.entries(data);

const lines = [];

lines.push(`/**`);
lines.push(` * embeddingStore.ts — AUTO-GENERATED. Do not edit manually.`);
lines.push(` * Run: node scripts/generate-embedding-store.js embeddings.json > src/domain/embeddingStore.ts`);
lines.push(` *`);
lines.push(` * model_id:   text-embedding-3-small`);
lines.push(` * space_id:   openai-te3-small-d512-v1`);
lines.push(` * dimensions: 512`);
lines.push(` * signals:    ${signals.length}`);
lines.push(` *`);
lines.push(` * UCP v0.2 §2 — VAC space_id declaration.`);
lines.push(` * Phase 2b: /ucp/projector aligns this space → ucp-space-v1.0 via Procrustes/SVD.`);
lines.push(` */`);
lines.push(``);
lines.push(`export const EMBEDDING_MODEL_ID   = "text-embedding-3-small";`);
lines.push(`export const EMBEDDING_SPACE_ID   = "openai-te3-small-d512-v1";`);
lines.push(`export const EMBEDDING_DIMENSIONS = 512;`);
lines.push(``);
lines.push(`export interface SignalEmbedding {`);
lines.push(`  vector:      number[];`);
lines.push(`  model_id:    string;`);
lines.push(`  space_id:    string;`);
lines.push(`  dimensions:  number;`);
lines.push(`  description: string;`);
lines.push(`}`);
lines.push(``);
lines.push(`export const SIGNAL_EMBEDDINGS: Record<string, SignalEmbedding> = {`);

for (const [id, entry] of signals) {
  const vecStr = JSON.stringify(entry.vector);
  const desc   = entry.description.replace(/'/g, "\\'");
  lines.push(`  "${id}": {`);
  lines.push(`    vector:      ${vecStr},`);
  lines.push(`    model_id:    "${entry.model_id}",`);
  lines.push(`    space_id:    "${entry.space_id}",`);
  lines.push(`    dimensions:  ${entry.dimensions},`);
  lines.push(`    description: "${desc}",`);
  lines.push(`  },`);
}

lines.push(`};`);
lines.push(``);
lines.push(`/** Exact lookup — returns null if signal has no stored embedding */`);
lines.push(`export function getSignalEmbedding(signalId: string): SignalEmbedding | null {`);
lines.push(`  return SIGNAL_EMBEDDINGS[signalId] ?? null;`);
lines.push(`}`);
lines.push(``);
lines.push(`/**`);
lines.push(` * Cosine similarity between two equal-length vectors.`);
lines.push(` * Returns -1 to 1. Requires same space_id on both sides for valid comparison.`);
lines.push(` */`);
lines.push(`export function cosineSimilarity(a: number[], b: number[]): number {`);
lines.push(`  if (a.length !== b.length) throw new Error(\`Dimension mismatch: \${a.length} vs \${b.length}\`);`);
lines.push(`  let dot = 0, normA = 0, normB = 0;`);
lines.push(`  for (let i = 0; i < a.length; i++) {`);
lines.push(`    dot   += a[i] * b[i];`);
lines.push(`    normA += a[i] * a[i];`);
lines.push(`    normB += b[i] * b[i];`);
lines.push(`  }`);
lines.push(`  const denom = Math.sqrt(normA) * Math.sqrt(normB);`);
lines.push(`  return denom === 0 ? 0 : dot / denom;`);
lines.push(`}`);
lines.push(``);
lines.push(`/**`);
lines.push(` * Top-N most similar signals by cosine similarity.`);
lines.push(` * Powers /signals/:id/similar and Phase 2b projector GTS validation.`);
lines.push(` */`);
lines.push(`export function findSimilarSignals(`);
lines.push(`  targetId: string,`);
lines.push(`  topN = 5`);
lines.push(`): Array<{ signal_id: string; similarity: number }> {`);
lines.push(`  const target = SIGNAL_EMBEDDINGS[targetId];`);
lines.push(`  if (!target) return [];`);
lines.push(`  return Object.entries(SIGNAL_EMBEDDINGS)`);
lines.push(`    .filter(([id]) => id !== targetId)`);
lines.push(`    .map(([id, emb]) => ({`);
lines.push(`      signal_id: id,`);
lines.push(`      similarity: cosineSimilarity(target.vector, emb.vector),`);
lines.push(`    }))`);
lines.push(`    .sort((a, b) => b.similarity - a.similarity)`);
lines.push(`    .slice(0, topN);`);
lines.push(`}`);

process.stdout.write(lines.join("\n") + "\n");
console.error(`✓ Generated ${signals.length} signals → embeddingStore.ts`);
