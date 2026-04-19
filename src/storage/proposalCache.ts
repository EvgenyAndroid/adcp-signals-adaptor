// src/storage/proposalCache.ts
//
// Short-lived KV cache for brief-generated signal proposals.
//
// Why KV (not D1) on the search path:
//   /signals/search with a `brief` previously upserted every generated
//   proposal into the D1 `signals` catalog so that a follow-up activation
//   could resolve it by ID. That made a read-path do a write-path's job
//   and leaked stale dynamic IDs into the catalog forever (one per unique
//   brief). The cache here is the smaller, time-bounded equivalent — KV
//   write per generated proposal, TTL ~1 hour, used only as a stepping
//   stone between search and activate.
//
// Lifecycle:
//   search   -> generate proposals -> putProposal(kv, signal) per proposal
//   activate -> findSignalById(db) MISS -> getProposal(kv) HIT
//            -> upsertSignal(db) (lazy create — only proposals that get
//               activated land in D1) -> proceed with activation
//
// Key shape: `proposal:{signalId}`. Values are CanonicalSignal JSON.

import type { CanonicalSignal } from "../types/signal";

const KEY_PREFIX = "proposal:";

// 1 hour. Long enough for an interactive search→activate session, short
// enough that abandoned briefs don't accumulate in KV. Activation will
// fail with NOT_FOUND if a client tries to activate a stale proposal,
// which mirrors the pre-existing 404 behaviour for unknown signals.
const PROPOSAL_TTL_SECONDS = 60 * 60;

function key(signalId: string): string {
  return KEY_PREFIX + signalId;
}

export async function putProposal(
  kv: KVNamespace,
  signal: CanonicalSignal,
): Promise<void> {
  await kv.put(key(signal.signalId), JSON.stringify(signal), {
    expirationTtl: PROPOSAL_TTL_SECONDS,
  });
}

/**
 * Look up a previously-generated proposal by signal ID.
 * Returns null on miss or on parse failure (treat corrupt cache as miss).
 */
export async function getProposal(
  kv: KVNamespace,
  signalId: string,
): Promise<CanonicalSignal | null> {
  const raw = await kv.get(key(signalId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CanonicalSignal;
  } catch {
    return null;
  }
}

/**
 * Drop a proposal from the cache. Called after a successful activation
 * so the now-promoted proposal isn't served from cache on subsequent calls
 * (D1 is the source of truth once it lands there).
 */
export async function deleteProposal(
  kv: KVNamespace,
  signalId: string,
): Promise<void> {
  await kv.delete(key(signalId));
}
