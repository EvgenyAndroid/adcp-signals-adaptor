// src/domain/runAnnotations.ts
//
// Wave 4 — annotations on saved workflow runs.
//
// Each saved workflow (KV-backed via /agents/workflow/save) can carry
// a thread of plain-text annotations. Workshop attendees can leave
// notes on permalinks ("fired this for Coca-Cola, auth-gated as
// expected"); operators can append observations as a run goes live.
//
// Storage: KV at `wf_annotations:<workflow_id>` — JSON array of
// Annotation objects. 30-day TTL (matches the underlying run TTL).
// Cap of 50 annotations per run.
//
// We don't enforce author identity — this is a demo surface. In
// production we'd require an authenticated operator id.

import type { Env } from "../types/env";

export interface Annotation {
  annotation_id: string;
  workflow_id: string;
  ts: string;          // ISO
  author: string;      // free-text; "anonymous" by default
  text: string;        // ≤ 500 chars
  /** Optional reference to a specific element of the run (e.g. "stage:media_buy" or "agent:adzymic_apx"). */
  ref?: string;
}

const KEY_PREFIX = "wf_annotations:";
const ANNOTATION_TTL = 60 * 60 * 24 * 30; // 30 days
const MAX_PER_RUN = 50;
const MAX_TEXT_LEN = 500;

function key(workflowId: string): string { return KEY_PREFIX + workflowId; }

export async function listAnnotations(env: Env, workflowId: string): Promise<Annotation[]> {
  try {
    const raw = await env.SIGNALS_CACHE.get(key(workflowId), "json");
    if (Array.isArray(raw)) return raw as Annotation[];
  } catch { /* empty */ }
  return [];
}

export async function appendAnnotation(
  env: Env,
  workflowId: string,
  input: { author?: string; text: string; ref?: string },
): Promise<{ annotation: Annotation; total: number }> {
  if (!input.text || input.text.trim().length === 0) {
    throw new Error("annotation text required");
  }
  const text = input.text.trim().slice(0, MAX_TEXT_LEN);
  const annotation: Annotation = {
    annotation_id: "ann_" + Math.random().toString(36).slice(2, 10),
    workflow_id: workflowId,
    ts: new Date().toISOString(),
    author: (input.author ?? "anonymous").slice(0, 80),
    text,
    ...(input.ref ? { ref: input.ref.slice(0, 80) } : {}),
  };
  const existing = await listAnnotations(env, workflowId);
  // Newest first; cap to MAX_PER_RUN.
  const updated = [annotation, ...existing].slice(0, MAX_PER_RUN);
  await env.SIGNALS_CACHE.put(key(workflowId), JSON.stringify(updated), { expirationTtl: ANNOTATION_TTL });
  return { annotation, total: updated.length };
}

export async function deleteAnnotation(env: Env, workflowId: string, annotationId: string): Promise<{ deleted: boolean; total: number }> {
  const existing = await listAnnotations(env, workflowId);
  const filtered = existing.filter((a) => a.annotation_id !== annotationId);
  if (filtered.length === existing.length) {
    return { deleted: false, total: existing.length };
  }
  await env.SIGNALS_CACHE.put(key(workflowId), JSON.stringify(filtered), { expirationTtl: ANNOTATION_TTL });
  return { deleted: true, total: filtered.length };
}
