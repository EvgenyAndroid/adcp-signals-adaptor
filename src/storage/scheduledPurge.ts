// src/storage/scheduledPurge.ts
// Sec-40: weekly D1 housekeeping.
//
// This Worker is deployed on a public URL — anyone can hit /signals/search,
// /mcp, /signals/estimate, etc. Even with a required bearer for mutating
// paths, the public read surfaces and the one-click demo inevitably
// accumulate transient data over time:
//
//   • dynamic signals — user-composed segments (generationMode='dynamic')
//     created via /signals/generate-segment or NL brief fallback. These
//     are never cleaned by the seed pipeline (which only touches an
//     empty table) and would grow monotonically without a sweep.
//
//   • activation_jobs + activation_events — every activate_signal call
//     persists a row. Demo traffic can produce thousands per week.
//
//   • mcp_tool_calls — already has opportunistic 1-in-100 cleanup in
//     toolLogRepo.cleanup, but an explicit scheduled sweep guarantees
//     the 7-day retention ceiling declared by ext.governance.audit_log.
//
//   • oauth_state — expired PKCE states (10-min TTL in practice). Not
//     dangerous if they accumulate but the table is append-mostly
//     without this cleanup.
//
// Not purged:
//   • seeded / derived signals (generation_mode in ('seeded','derived'))
//     — these are the canonical catalog shipped with the code. Deleting
//     them would leave the service empty until the next reseed.
//   • taxonomy_nodes — reference data, bounded.
//   • source_records — reference data, small.
//   • operator-owned LinkedIn tokens (if/when oauth_tokens table is
//     added) — user-owned, not demo ephemera.
//
// Invocation paths:
//   1. Cloudflare cron trigger — wired in wrangler.toml `[triggers].crons`
//      on a weekly cadence (Sundays 06:00 UTC). Runs via the `scheduled()`
//      export in src/index.ts.
//   2. Manual admin POST /admin/purge — for ad-hoc maintenance. Bearer
//      auth required (DEMO_API_KEY), so a random visitor can't trigger it.
//
// Both paths call runScheduledPurge() and get the same result shape back.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { getDb, execute, queryAll } from "./db";

// Retention windows. Declared at module scope so they can be referenced by
// /capabilities and /data-hygiene surfaces without drift.
export const RETENTION = {
  dynamic_signals_days: 7,
  activations_days: 30,      // longer than tool-log so post-mortems stay
  tool_calls_days: 7,        // matches ext.governance.audit_log.retention_days
  oauth_state_minutes: 10,   // hard TTL on PKCE flow window
};

export interface PurgeResult {
  started_at: string;
  duration_ms: number;
  deleted: {
    dynamic_signals: number;
    signal_rules: number; // cascaded
    activation_jobs: number;
    activation_events: number;
    mcp_tool_calls: number;
    oauth_state: number;
  };
  retention: typeof RETENTION;
  errors: string[];
}

export async function runScheduledPurge(
  env: Env,
  logger: Logger,
): Promise<PurgeResult> {
  const started = Date.now();
  const result: PurgeResult = {
    started_at: new Date(started).toISOString(),
    duration_ms: 0,
    deleted: {
      dynamic_signals: 0,
      signal_rules: 0,
      activation_jobs: 0,
      activation_events: 0,
      mcp_tool_calls: 0,
      oauth_state: 0,
    },
    retention: RETENTION,
    errors: [],
  };

  const db = getDb(env);
  logger.info("scheduled_purge_start", { retention: RETENTION });

  const dayMs = 86_400_000;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // ── 1. Dynamic signals (user-composed) older than retention window ──
  // Count first so the response can report deletions; rules cascade via FK.
  try {
    const cutoffIso = new Date(nowMs - RETENTION.dynamic_signals_days * dayMs).toISOString();
    const doomedSignals = await queryAll<{ signal_id: string }>(
      db,
      `SELECT signal_id FROM signals
         WHERE generation_mode = 'dynamic'
           AND COALESCE(updated_at, created_at) < ?`,
      [cutoffIso],
    );
    if (doomedSignals.length > 0) {
      // Count child rules before the cascade so we can report them
      const ruleCount = await queryAll<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM signal_rules
           WHERE signal_id IN (${doomedSignals.map(() => "?").join(",")})`,
        doomedSignals.map((s) => s.signal_id),
      );
      result.deleted.signal_rules = ruleCount[0]?.c ?? 0;

      await execute(
        db,
        `DELETE FROM signals
           WHERE generation_mode = 'dynamic'
             AND COALESCE(updated_at, created_at) < ?`,
        [cutoffIso],
      );
      result.deleted.dynamic_signals = doomedSignals.length;
    }
  } catch (e) {
    result.errors.push("dynamic_signals: " + String(e));
  }

  // ── 2. Activation jobs older than retention window ──
  // Child events via FK; delete children first (no ON DELETE CASCADE declared
  // on activation_events, so the parent delete would otherwise fail under
  // strict FK enforcement).
  try {
    const cutoffIso = new Date(nowMs - RETENTION.activations_days * dayMs).toISOString();
    const doomedJobs = await queryAll<{ operation_id: string }>(
      db,
      `SELECT operation_id FROM activation_jobs WHERE submitted_at < ?`,
      [cutoffIso],
    );
    if (doomedJobs.length > 0) {
      const eventCount = await queryAll<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM activation_events
           WHERE operation_id IN (${doomedJobs.map(() => "?").join(",")})`,
        doomedJobs.map((j) => j.operation_id),
      );
      result.deleted.activation_events = eventCount[0]?.c ?? 0;

      await execute(
        db,
        `DELETE FROM activation_events
           WHERE operation_id IN (${doomedJobs.map(() => "?").join(",")})`,
        doomedJobs.map((j) => j.operation_id),
      );
      await execute(
        db,
        `DELETE FROM activation_jobs WHERE submitted_at < ?`,
        [cutoffIso],
      );
      result.deleted.activation_jobs = doomedJobs.length;
    }
  } catch (e) {
    result.errors.push("activation_jobs: " + String(e));
  }

  // ── 3. MCP tool call log (same 7-day ceiling as ext.governance) ──
  try {
    const cutoffMs = nowMs - RETENTION.tool_calls_days * dayMs;
    const before = await queryAll<{ c: number }>(
      db,
      `SELECT COUNT(*) AS c FROM mcp_tool_calls WHERE created_at < ?`,
      [cutoffMs],
    );
    const beforeCount = before[0]?.c ?? 0;
    if (beforeCount > 0) {
      await execute(db, `DELETE FROM mcp_tool_calls WHERE created_at < ?`, [cutoffMs]);
      result.deleted.mcp_tool_calls = beforeCount;
    }
  } catch (e) {
    result.errors.push("mcp_tool_calls: " + String(e));
  }

  // ── 4. Expired OAuth state (PKCE flow window) ──
  try {
    const before = await queryAll<{ c: number }>(
      db,
      `SELECT COUNT(*) AS c FROM oauth_state WHERE expires_at < ?`,
      [nowIso],
    );
    const beforeCount = before[0]?.c ?? 0;
    if (beforeCount > 0) {
      await execute(db, `DELETE FROM oauth_state WHERE expires_at < ?`, [nowIso]);
      result.deleted.oauth_state = beforeCount;
    }
  } catch (e) {
    result.errors.push("oauth_state: " + String(e));
  }

  result.duration_ms = Date.now() - started;
  logger.info("scheduled_purge_complete", {
    duration_ms: result.duration_ms,
    deleted: result.deleted,
    errors: result.errors.length,
  });

  return result;
}
