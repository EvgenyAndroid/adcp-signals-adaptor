// src/storage/replayRepo.ts
//
// REQUEST-SIGNING REPLAY STORE — built 2026-10-10. The D1 implementation of
// @adcp/sdk 13.1.3's ReplayStore, used by src/domain/requestSigning.ts for
// checklist steps 9a (per-keyid cap), 12 (replay) and 13 (insert).
// Table: migrations/0009_request_signing_replay.sql.
//
// Why D1: the store must be shared across Worker isolates — a per-isolate
// in-memory store lets the second copy of a replayed request through on a
// different isolate. KV is eventually consistent and caches negative lookups,
// so it cannot hold a replay cache. D1 serialises writes, so one statement is
// one atomic check-and-insert.
//
// Keyed on (keyid, nonce) only, as the spec keys it. The SDK also passes a
// `scope` (the canonical @target-uri) and documents partitioning by it; that
// is ignored on purpose, for the replay key AND for the cap — /mcp routes
// any path and query string, so a cap per (keyid, scope) could be bypassed by
// varying ?x=N with the public test key.
//
// The nonce is stored as its SHA-256 (hex), never as sent. 13.1.3 checks
// only that the nonce is a string (no length or format check), and anyone
// can sign with the public test keys, so a raw column would let a caller
// write multi-KB rows into the shared database at the cap's full rate.
// Review fix 2026-10-10.
//
// Cap: REPLAY_CAP_PER_KEYID UNEXPIRED entries per keyid, the test kit's
// grading target (test-kits/signed-requests-runner.yaml, rate_abuse:
// 100). The only trusted keys are the public test counterparty's, so the
// grading cap is also the production cap. Entries live for the TTL the SDK
// passes (at least 360 s), so after the grader's 100-request rate-abuse fill a
// keyid stays capped for about six minutes; re-grading inside that window
// reads rate_abuse.
//
// Expired rows are swept by the weekly purge (src/storage/scheduledPurge.ts).
// Until then they are ignored: every read and the cap count only rows with
// expires_at > now, and an expired row with the same nonce is overwritten
// rather than counted as a replay.
//
// Any D1 error propagates; the MCP handler fails closed with a 503.

import type { ReplayInsertResult, ReplayStore } from "@adcp/sdk/signing/server";

export const REPLAY_CAP_PER_KEYID = 100;

async function nonceDigest(nonce: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class D1ReplayStore implements ReplayStore {
  constructor(private readonly db: D1Database) {}

  async has(keyid: string, _scope: string, nonce: string, now: number): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS hit FROM request_signing_replay WHERE keyid = ? AND nonce_sha256 = ? AND expires_at > ?")
      .bind(keyid, await nonceDigest(nonce), now)
      .first();
    return row !== null;
  }

  async isCapHit(keyid: string, _scope: string, now: number): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS live FROM request_signing_replay WHERE keyid = ? AND expires_at > ?")
      .bind(keyid, now)
      .first<{ live: number }>();
    return (row?.live ?? 0) >= REPLAY_CAP_PER_KEYID;
  }

  async insert(keyid: string, scope: string, nonce: string, ttlSeconds: number, now: number): Promise<ReplayInsertResult> {
    // One statement: insert only while the keyid is under the cap; a live row
    // with the same nonce conflicts and stays untouched, an expired one is
    // overwritten. changes === 1 exactly when this request claimed the nonce.
    const res = await this.db
      .prepare(
        `INSERT INTO request_signing_replay (keyid, nonce_sha256, expires_at)
         SELECT ?1, ?2, ?3
          WHERE (SELECT COUNT(*) FROM request_signing_replay WHERE keyid = ?1 AND expires_at > ?4) < ?5
         ON CONFLICT (keyid, nonce_sha256) DO UPDATE SET expires_at = excluded.expires_at
          WHERE request_signing_replay.expires_at <= ?4`,
      )
      .bind(keyid, await nonceDigest(nonce), now + ttlSeconds, now, REPLAY_CAP_PER_KEYID)
      .run();
    if (res.meta.changes > 0) return "ok";
    return (await this.has(keyid, scope, nonce, now)) ? "replayed" : "rate_abuse";
  }
}
