// src/storage/vendorHealthHistory.ts
//
// Wave 5 — KV-backed ring buffer for per-vendor health history.
//
// Each `/vendor-health/snapshot` call appends one datapoint per probed
// vendor. The ring buffer keeps the last N points (default 24) so the
// dashboard can render a sparkline showing recent health trend.
//
// Storage layout:
//   key:  vendor_health:v1:<agent_id>
//   val:  JSON array of HealthDatapoint, oldest first, max 24 entries
//   ttl:  7 days (re-set on every write, so frequently probed vendors
//         stay around indefinitely while abandoned ones expire)
//
// Why per-vendor key (vs one big "all" key):
//   - KV write granularity: when one vendor's history grows, we don't
//     rewrite the other 16. Cheaper.
//   - Read parallelism: the dashboard fans out reads when it needs to
//     show all sparklines. Each read is small.
//
// Ring-buffer trim: we drop the OLDEST entry on overflow. New points
// always go to the end of the array; the dashboard reads in order.

import type { Env } from "../types/env";
import type { VendorHealthRow } from "../domain/vendorHealthSnapshot";

export interface HealthDatapoint {
  ts: string;            // ISO-8601
  alive: boolean;
  latency_ms: number | null;
  health_bucket: string; // healthy | degraded | down | unknown
  circuit_state: string | null;
}

const KEY_PREFIX = "vendor_health:v1:";
const HISTORY_MAX = 24;
const HISTORY_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function keyFor(agent_id: string): string {
  return KEY_PREFIX + agent_id;
}

/**
 * Read history for one vendor. Returns [] if nothing stored yet.
 */
export async function readHistory(env: Env, agent_id: string): Promise<HealthDatapoint[]> {
  try {
    const raw = await env.SIGNALS_CACHE.get(keyFor(agent_id), "json");
    if (!Array.isArray(raw)) return [];
    return (raw as HealthDatapoint[]).slice(-HISTORY_MAX);
  } catch {
    return [];
  }
}

/**
 * Read history for many vendors in parallel. Returns a map keyed by
 * agent_id; vendors with no history map to [].
 */
export async function readHistories(env: Env, agent_ids: string[]): Promise<Record<string, HealthDatapoint[]>> {
  const out: Record<string, HealthDatapoint[]> = {};
  const results = await Promise.all(agent_ids.map((id) => readHistory(env, id).then((h) => ({ id, h }))));
  for (const { id, h } of results) out[id] = h;
  return out;
}

/**
 * Append one datapoint to a vendor's history, trim to HISTORY_MAX,
 * write back with TTL refresh. Best-effort — failures are logged
 * but don't propagate (the dashboard works without history).
 */
export async function appendDatapoint(env: Env, agent_id: string, dp: HealthDatapoint): Promise<void> {
  try {
    const existing = await readHistory(env, agent_id);
    const updated = [...existing, dp].slice(-HISTORY_MAX);
    await env.SIGNALS_CACHE.put(keyFor(agent_id), JSON.stringify(updated), {
      expirationTtl: HISTORY_TTL_SECONDS,
    });
  } catch {
    // Best-effort — history is decorative.
  }
}

/**
 * After a snapshot, write one datapoint per probed vendor in parallel.
 * Skips rows that weren't probed in this snapshot.
 */
export async function appendSnapshotDatapoints(env: Env, rows: VendorHealthRow[]): Promise<void> {
  const tasks = rows
    .filter((r) => r.probed)
    .map((r) => {
      const dp: HealthDatapoint = {
        ts: r.snapshot_ts,
        alive: r.alive,
        latency_ms: r.latency_ms,
        health_bucket: r.health_bucket,
        circuit_state: r.circuit_state,
      };
      return appendDatapoint(env, r.agent_id, dp);
    });
  // Don't await — fire and forget so the snapshot route returns fast.
  // The Workers runtime will resolve in the background.
  await Promise.allSettled(tasks);
}
