// src/routes/overlap.ts
// Sec-37 B1: POST /signals/overlap — audience overlap estimation across
// 2-4 signals. Public endpoint (read-only, no persist).
//
// The math is heuristic — we don't have real cross-signal audience
// intersections, so we approximate Jaccard as:
//   J(A, B) = category_affinity(A, B) * min(|A|, |B|) / max(|A|, |B|)
// with category_affinity:
//   same category_type + same vertical:   0.85
//   same category_type, different vertical: 0.55
//   different category_type, same vertical: 0.35
//   completely unrelated:                   0.12
// Refinable later with actual embedding cosine between signal vectors,
// but this produces plausibly-shaped UpSet / Venn outputs for a demo.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse, readJsonBody } from "./shared";
import { getDb } from "../storage/db";
import { findSignalById } from "../storage/signalRepo";

interface OverlapRequest { signal_ids?: unknown }

interface OverlapPair {
  a_id: string; a_name: string;
  b_id: string; b_name: string;
  jaccard: number;
  intersection: number;
  union: number;
  category_affinity: number;
  affinity_reason: string;
}

export async function handleOverlap(
  request: Request, env: Env, logger: Logger,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const parsed = await readJsonBody<OverlapRequest>(request);
  const ids = parsed.kind === "parsed" && Array.isArray(parsed.data?.signal_ids)
    ? (parsed.data!.signal_ids as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length < 2) {
    return errorResponse(
      "INVALID_REQUEST",
      "signal_ids must be an array of 2-6 signal_agent_segment_id strings.",
      400,
    );
  }
  if (ids.length > 6) {
    return errorResponse("INVALID_REQUEST", "At most 6 signals per overlap request.", 400);
  }

  const db = getDb(env);
  const sigs = [];
  for (const id of ids) {
    const s = await findSignalById(db, id);
    if (!s) return errorResponse("INVALID_REQUEST", "Unknown signal: " + id, 400);
    sigs.push(s);
  }

  // Pairwise Jaccard
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const a = sigs[i]!;
      const b = sigs[j]!;
      const aSize = a.estimatedAudienceSize ?? 0;
      const bSize = b.estimatedAudienceSize ?? 0;
      const affinity = categoryAffinity(a, b);
      const minSize = Math.min(aSize, bSize);
      const maxSize = Math.max(aSize, bSize);
      const jaccard = maxSize > 0 ? affinity.value * minSize / maxSize : 0;
      // Intersection estimate: J * smaller_side (rough, but preserves ordering).
      const intersection = Math.round(jaccard * minSize);
      const union = aSize + bSize - intersection;
      pairs.push({
        a_id: a.signalId, a_name: a.name,
        b_id: b.signalId, b_name: b.name,
        jaccard: Math.round(jaccard * 1000) / 1000,
        intersection, union,
        category_affinity: Math.round(affinity.value * 100) / 100,
        affinity_reason: affinity.reason,
      });
    }
  }

  // UpSet-style set groupings for 3+ signals. For each non-empty subset,
  // produce an estimated exclusive count. Limited to subsets of size <= 3
  // for readability; 2^6 = 64 subsets is fine but most demos show <=3.
  const upset: Array<{ sets: string[]; names: string[]; estimate: number }> = [];
  if (sigs.length >= 3) {
    for (let mask = 1; mask < (1 << sigs.length); mask++) {
      const members = [];
      for (let k = 0; k < sigs.length; k++) if (mask & (1 << k)) members.push(sigs[k]!);
      if (members.length < 1) continue;
      // N-way intersection ~= product of pairwise Jaccard * smallest cardinality
      let est = Math.min(...members.map((s) => s.estimatedAudienceSize ?? 0));
      if (members.length > 1) {
        let jprod = 1;
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            const aff = categoryAffinity(members[a]!, members[b]!);
            const aS = members[a]!.estimatedAudienceSize ?? 0;
            const bS = members[b]!.estimatedAudienceSize ?? 0;
            const j = (Math.min(aS, bS) * aff.value) / Math.max(aS, bS, 1);
            jprod *= j;
          }
        }
        est = Math.round(est * jprod);
      }
      upset.push({
        sets: members.map((m) => m.signalId),
        names: members.map((m) => m.name),
        estimate: est,
      });
    }
  }

  logger.info("overlap_computed", { signal_count: sigs.length, pair_count: pairs.length });

  return jsonResponse({
    signals: sigs.map((s) => ({
      signal_agent_segment_id: s.signalId,
      name: s.name,
      estimated_audience_size: s.estimatedAudienceSize,
      category_type: s.categoryType,
    })),
    pairwise: pairs,
    upset,
    methodology: "heuristic_category_affinity_jaccard",
    note: "Jaccard approximation: category_affinity(A,B) * min(|A|,|B|) / max(|A|,|B|). Refinable with real embedding cosine.",
  });
}

function categoryAffinity(
  a: { categoryType?: string; sourceSystems?: string[] },
  b: { categoryType?: string; sourceSystems?: string[] },
): { value: number; reason: string } {
  const aCat = a.categoryType;
  const bCat = b.categoryType;
  const aVert = verticalFromSources(a.sourceSystems);
  const bVert = verticalFromSources(b.sourceSystems);
  if (aCat && aCat === bCat && aVert && aVert === bVert) return { value: 0.85, reason: "same category + vertical" };
  if (aCat && aCat === bCat) return { value: 0.55, reason: "same category_type" };
  if (aVert && aVert === bVert) return { value: 0.35, reason: "same vertical" };
  return { value: 0.12, reason: "unrelated" };
}

function verticalFromSources(sources?: string[]): string | null {
  if (!Array.isArray(sources)) return null;
  for (const s of sources) {
    const m = /^marketplace:([a-z_]+)$/.exec(s);
    if (m && m[1]) return m[1];
  }
  return null;
}
