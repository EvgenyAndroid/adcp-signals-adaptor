// tests/request-signing.test.ts
//
// RFC 9421 inbound request verification (signed_requests) — see
// src/domain/requestSigning.ts. Five layers:
//   1. CONFORMANCE VECTORS — every 3.1.24 root vector through OUR wrapper
//      (checkRequestSignature) with OUR capability and the real D1 replay
//      store, at the vector's pinned clock.
//   2. REPLAY STORE — replay, per-keyid cap, concurrency, expiry and the
//      weekly purge, against SQLite (D1's engine) via node:sqlite with
//      migration 0009 applied, so the atomic statement itself is exercised.
//   3. AUTH COMPOSITION through handleMcpRequest — bearer and Bearer
//      challenge unchanged, signature-only callers are sandbox, the payload
//      rule, batches, the real-length body cap, fail-closed D1.
//   4. CAPABILITY — get_adcp_capabilities serves the posture constant.
//   5. THE workerd CRYPTO SHIM's P1363 → DER conversion. Node accepts the
//      SDK's own ES256 call shape, so nothing else here would exercise it.
//
// Signing in layer 3 uses the conformance test keys' published private
// halves, read from the SDK's compliance cache at test time — never copied
// into the repo.

import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash, createPublicKey, generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from "node:crypto";
import { signRequest, type AdcpJsonWebKey } from "@adcp/sdk/signing/client";
import {
  checkRequestSignature,
  carriesWebhookAuthentication,
  hasDuplicateObjectKeys,
  signerOperatorId,
  REQUEST_SIGNING_CAPABILITY,
  type SignatureCheck,
} from "../src/domain/requestSigning";
import { D1ReplayStore, REPLAY_CAP_PER_KEYID } from "../src/storage/replayRepo";
import { runScheduledPurge } from "../src/storage/scheduledPurge";
import { handleMcpRequest } from "../src/mcp/server";
import { verify as shimVerify } from "../src/shims/crypto";
import { createLogger } from "../src/utils/logger";
import { deriveOperatorId } from "../src/utils/operatorId";
import type { Env } from "../src/types/env";

// Loaded at runtime: vite's builtin list predates node:sqlite (prefix-only).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS = resolve(HERE, "../node_modules/@adcp/sdk/compliance/cache/3.1.24/test-vectors/request-signing");
const MIGRATION = resolve(HERE, "../migrations/0009_request_signing_replay.sql");
const logger = createLogger("request-signing-test");

// ── helpers ─────────────────────────────────────────────────────────────────

/** D1 over an in-memory SQLite with migration 0009 applied. Counts prepares. */
function makeD1(): { db: D1Database; sqlite: DatabaseSync; prepares: () => number } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(MIGRATION, "utf8"));
  let prepares = 0;
  const db = {
    prepare(sql: string) {
      prepares++;
      let args: Array<string | number> = [];
      const stmt = {
        bind(...a: Array<string | number>) { args = a; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, sqlite, prepares: () => prepares };
}

/** The stored form of a nonce (src/storage/replayRepo.ts): hex SHA-256. */
function sha256Hex(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

function seedReplay(sqlite: DatabaseSync, keyid: string, nonce: string, expiresAt: number): void {
  sqlite.prepare("INSERT INTO request_signing_replay (keyid, nonce_sha256, expires_at) VALUES (?, ?, ?)").run(keyid, sha256Hex(nonce), expiresAt);
}

function liveRows(sqlite: DatabaseSync): number {
  return Number((sqlite.prepare("SELECT COUNT(*) AS c FROM request_signing_replay").get() as { c: number }).c);
}

function makeKv(): { kv: KVNamespace; store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    async get(k: string, type?: string) {
      const v = store.get(k);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
  return { kv, store };
}

interface VectorKey extends AdcpJsonWebKey { _private_d_for_test_only?: string }
const TEST_KEYS = (JSON.parse(readFileSync(join(VECTORS, "keys.json"), "utf8")) as { keys: VectorKey[] }).keys;

function privateJwk(kid: string): AdcpJsonWebKey {
  const k = TEST_KEYS.find((key) => key.kid === kid);
  if (!k) throw new Error(`no test key ${kid}`);
  const { _private_d_for_test_only: d, ...pub } = k;
  return { ...pub, d: d! };
}

const MCP_URL = "https://example.com/mcp";
const DEMO_KEY = "demo-key-request-signing-test";
const LIVE_KIT_KEY = "demo-acme-outdoor-live-v1";
const BEARER_CHALLENGE = `Bearer realm="adcp-signals-adaptor", error="invalid_token"`;

/** A POST /mcp signed with a conformance test key, the way the grader signs (Content-Digest covered). */
function signedReq(rpc: unknown, opts: { kid?: string; bearer?: string; rawBody?: string } = {}): Request {
  const kid = opts.kid ?? "test-ed25519-2026";
  const body = opts.rawBody ?? JSON.stringify(rpc);
  const base: Record<string, string> = { "Content-Type": "application/json" };
  const signed = signRequest(
    { method: "POST", url: MCP_URL, headers: base, body },
    { keyid: kid, alg: kid === "test-es256-2026" ? "ecdsa-p256-sha256" : "ed25519", privateKey: privateJwk(kid) },
    { coverContentDigest: true },
  );
  const headers = new Headers(signed.headers);
  if (opts.bearer) headers.set("Authorization", `Bearer ${opts.bearer}`);
  return new Request(MCP_URL, { method: "POST", headers, body });
}

function unsignedReq(rpc: unknown, bearer?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  return new Request(MCP_URL, { method: "POST", headers, body: JSON.stringify(rpc) });
}

function toolCall(name: string, args: Record<string, unknown>, id: number = 1) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

function makeEnv(db?: D1Database) {
  const kv = makeKv();
  const d1 = db ? { db, sqlite: null, prepares: () => 0 } : makeD1();
  const env = { DEMO_API_KEY: DEMO_KEY, SIGNALS_CACHE: kv.kv, DB: d1.db } as unknown as Env;
  return { env, kv: kv.store, d1 };
}

async function call(env: Env, req: Request): Promise<{ status: number; body: any; res: Response }> {
  const res = await handleMcpRequest(req, env, logger);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, res };
}

afterEach(() => {
  vi.useRealTimers();
});

// ── 1. conformance vectors ──────────────────────────────────────────────────

interface Vector {
  reference_now: number;
  request: { method: string; url: string; headers: Record<string, string>; body: string };
  verifier_capability: { required_for: string[] };
  expected_outcome: { success: boolean; error_code?: string };
  test_harness_state?: {
    replay_cache_entries?: Array<{ keyid: string; nonce: string; ttl_seconds: number }>;
    replay_cache_per_keyid_cap_hit?: { keyid: string };
    revocation_list?: { revoked_kids: string[] };
  };
}

// Vectors whose verifier_capability differs from ours (covers_content_digest
// "either", every list empty) in a way that changes the outcome. Each is one
// the hosted grader skips for an agent with our posture, so asserting what
// WE actually do is the honest check. Every other vector's own required_for
// (["create_media_buy"]) makes no difference: a presented signature is
// verified whatever the lists say.
const OUR_POSTURE: Record<string, SignatureCheck["status"] | { code: string }> = {
  // required_for is empty, so an unsigned create_media_buy is not refused here;
  // it goes on to the bearer gate (401 Bearer — see layer 3).
  "001-no-signature-header.json": "unsigned",
  // The vector needs digest policy "required". Under "either" step 6 passes,
  // and its placeholder signature bytes then fail the crypto check.
  "007-missing-content-digest.json": { code: "request_signature_invalid" },
  // The vector needs digest policy "forbidden". Under "either" a
  // digest-covered, genuinely signed request is accepted.
  "018-digest-covered-when-forbidden.json": "verified",
  // Presents a deliberately malformed JWK through jwks_override; our trusted
  // set is static, so its keyid is unknown here. The grader checks 025
  // in-library and never sends it to an agent.
  "025-jwk-alg-crv-mismatch.json": { code: "request_signature_key_unknown" },
  // Needs protocol_methods_required_for: ["tasks/cancel"], which we do not
  // declare, so an unsigned tasks/cancel is not refused by the signing layer.
  "028-unsigned-protocol-method-required.json": "unsigned",
};

function loadVectors(kind: "positive" | "negative"): Array<[string, Vector]> {
  return readdirSync(join(VECTORS, kind))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => [f, JSON.parse(readFileSync(join(VECTORS, kind, f), "utf8")) as Vector]);
}

async function runVector(file: string, v: Vector): Promise<{ result: SignatureCheck; sqlite: DatabaseSync }> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(v.reference_now * 1000);
  const { db, sqlite } = makeD1();
  const state = v.test_harness_state;
  for (const e of state?.replay_cache_entries ?? []) seedReplay(sqlite, e.keyid, e.nonce, v.reference_now + e.ttl_seconds);
  if (state?.replay_cache_per_keyid_cap_hit) {
    for (let i = 0; i < REPLAY_CAP_PER_KEYID; i++) {
      seedReplay(sqlite, state.replay_cache_per_keyid_cap_hit.keyid, `cap-fill-${i}`, v.reference_now + 360);
    }
  }
  // 027 is an unsigned AdCP body; the grader wraps it in an MCP tools/call
  // named after the URL's last path segment (update_media_buy), as here.
  const parsed = file.startsWith("027-")
    ? toolCall(v.request.url.split("/").pop()!, JSON.parse(v.request.body) as Record<string, unknown>)
    : JSON.parse(v.request.body);
  const result = await checkRequestSignature(
    { method: v.request.method, url: v.request.url, headers: new Headers(v.request.headers), body: v.request.body },
    parsed,
    new D1ReplayStore(db),
  );
  return { result, sqlite };
}

describe("conformance vectors 3.1.24 — through checkRequestSignature with our posture", () => {
  it("loads the full 3.1.24 root corpus (12 positive, 28 negative)", () => {
    expect(loadVectors("positive")).toHaveLength(12);
    expect(loadVectors("negative")).toHaveLength(28);
  });

  for (const [file, v] of loadVectors("positive")) {
    it(`positive/${file}: verified, and the nonce is burned (step 13)`, async () => {
      const { result, sqlite } = await runVector(file, v);
      expect(result).toEqual({ status: "verified", keyid: expect.stringMatching(/^test-(ed25519|es256)-2026$/) });
      expect(liveRows(sqlite)).toBe(1);
    });
  }

  for (const [file, v] of loadVectors("negative")) {
    const ours = OUR_POSTURE[file];
    const label = ours === undefined ? v.expected_outcome.error_code : `our posture: ${typeof ours === "string" ? ours : ours.code}`;
    it(`negative/${file}: ${label}`, async () => {
      const { result } = await runVector(file, v);
      if (ours === undefined) {
        expect(result).toMatchObject({ status: "rejected", code: v.expected_outcome.error_code });
      } else if (typeof ours === "string") {
        expect(result.status).toBe(ours);
      } else {
        expect(result).toMatchObject({ status: "rejected", code: ours.code });
      }
    });
  }

  it("our static revocation snapshot covers the vector harness's revoked key", () => {
    const v = loadVectors("negative").find(([f]) => f.startsWith("017-"))![1];
    expect(v.test_harness_state?.revocation_list?.revoked_kids).toEqual(["test-revoked-2026"]);
  });
});

// ── step 14 and the payload-rule sites (pure helpers) ───────────────────────

describe("hasDuplicateObjectKeys (checklist step 14)", () => {
  it.each([
    ['{"a":1,"a":2}', true],
    ['{"a":1,"b":{"c":1,"c":2}}', true],
    ['[{"a":1},{"b":[{"x":1,"x":1}]}]', true],
    ['{"a":1,"\\u0061":2}', true],
    ['{"a":{"a":1},"b":{"a":2}}', false],
    ['[{"a":1},{"a":1}]', false],
    ['{"a":"{\\"a\\":1,\\"a\\":2}","b":["a","a"]}', false],
    ['﻿{"k":1}', false],
  ])("%s → %s", (text, dup) => {
    expect(hasDuplicateObjectKeys(text)).toBe(dup);
  });
});

describe("carriesWebhookAuthentication — exactly the two 3.1.27 sites, inside tools/call arguments", () => {
  const auth = { scheme: "HMAC-SHA256", credentials: "x".repeat(32) };
  it.each([
    ["push_notification_config.authentication", toolCall("get_signals", { push_notification_config: { url: "https://b.example/h", authentication: auth } }), true],
    ["accounts[].notification_configs[].authentication", toolCall("sync_accounts", { accounts: [{ notification_configs: [{ url: "https://b.example/h", authentication: auth }] }] }), true],
    ["one batch element carries it", [toolCall("get_signals", {}, 1), toolCall("get_signals", { push_notification_config: { authentication: auth } }, 2)], true],
    ["empty authentication object", toolCall("get_signals", { push_notification_config: { url: "https://b.example/h", authentication: {} } }), false],
    ["push_notification_config without authentication", toolCall("get_signals", { push_notification_config: { url: "https://b.example/h" } }), false],
    ["an unrelated authentication object (not one of the sites)", toolCall("sync_governance", { governance_agents: [{ url: "https://g.example", authentication: auth }] }), false],
    ["a non-tools/call method", { jsonrpc: "2.0", id: 1, method: "initialize", params: { arguments: { push_notification_config: { authentication: auth } } } }, false],
  ])("%s → %s", (_label, body, expected) => {
    expect(carriesWebhookAuthentication(body)).toBe(expected);
  });
});

// ── 2. replay store ─────────────────────────────────────────────────────────

describe("D1ReplayStore — (keyid, nonce) replay cache with a per-keyid cap", () => {
  const T = 1_800_000_000;
  const K = "test-ed25519-2026";

  it("the same nonce twice → ok, then replayed; the scope argument is ignored", async () => {
    const store = new D1ReplayStore(makeD1().db);
    expect(await store.insert(K, "https://a.example/mcp", "n1", 360, T)).toBe("ok");
    expect(await store.insert(K, "https://a.example/mcp?x=2", "n1", 360, T + 1)).toBe("replayed");
    expect(await store.has(K, "https://other.example/mcp", "n1", T + 1)).toBe(true);
    expect(await store.has("test-es256-2026", "https://a.example/mcp", "n1", T + 1)).toBe(false);
  });

  it(`cap: ${REPLAY_CAP_PER_KEYID} live entries per keyid, the next is rate_abuse — varying scope does not escape it`, async () => {
    const store = new D1ReplayStore(makeD1().db);
    for (let i = 0; i < REPLAY_CAP_PER_KEYID; i++) {
      expect(await store.insert(K, `https://a.example/mcp?x=${i}`, `n${i}`, 360, T)).toBe("ok");
    }
    expect(await store.isCapHit(K, "https://a.example/mcp?fresh", T)).toBe(true);
    expect(await store.insert(K, "https://a.example/mcp?x=fresh", "n-next", 360, T)).toBe("rate_abuse");
    // A replayed nonce at the cap still reads as a replay.
    expect(await store.insert(K, "https://a.example/mcp", "n0", 360, T)).toBe("replayed");
    // Other keyids are unaffected.
    expect(await store.isCapHit("test-es256-2026", "https://a.example/mcp", T)).toBe(false);
    expect(await store.insert("test-es256-2026", "https://a.example/mcp", "n-next", 360, T)).toBe("ok");
  });

  it("concurrent inserts of one nonce: exactly one ok, the rest replayed", async () => {
    const { db, sqlite } = makeD1();
    const store = new D1ReplayStore(db);
    const results = await Promise.all(Array.from({ length: 10 }, () => store.insert(K, "s", "race", 360, T)));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "replayed")).toHaveLength(9);
    expect(liveRows(sqlite)).toBe(1);
  });

  it("expiry: an expired row is neither a replay nor counted against the cap", async () => {
    const { db, sqlite } = makeD1();
    const store = new D1ReplayStore(db);
    for (let i = 0; i < REPLAY_CAP_PER_KEYID; i++) await store.insert(K, "s", `n${i}`, 360, T);
    expect(await store.isCapHit(K, "s", T + 359)).toBe(true);
    // expires_at = T + 360 is dead at T + 360.
    expect(await store.isCapHit(K, "s", T + 360)).toBe(false);
    expect(await store.has(K, "s", "n0", T + 360)).toBe(false);
    expect(await store.insert(K, "s", "n0", 360, T + 360)).toBe("ok"); // overwritten, not a replay
    expect(await store.insert(K, "s", "n0", 360, T + 361)).toBe("replayed");
    expect((sqlite.prepare("SELECT expires_at FROM request_signing_replay WHERE nonce_sha256 = ?").get(sha256Hex("n0")) as { expires_at: number }).expires_at).toBe(T + 720);
  });

  it("stores a fixed-size digest, never the nonce as sent (a 16 KB nonce is still a 64-char row key)", async () => {
    const { db, sqlite } = makeD1();
    const store = new D1ReplayStore(db);
    const huge = "A".repeat(16_000);
    expect(await store.insert(K, "s", huge, 360, T)).toBe("ok");
    expect(await store.insert(K, "s", huge, 360, T + 1)).toBe("replayed");
    expect(sqlite.prepare("SELECT nonce_sha256 FROM request_signing_replay").all()).toEqual([{ nonce_sha256: sha256Hex(huge) }]);
  });

  it("the weekly purge deletes expired rows only", async () => {
    const { db, sqlite } = makeD1();
    const nowSec = Math.floor(Date.now() / 1000);
    seedReplay(sqlite, K, "dead-1", nowSec - 10);
    seedReplay(sqlite, K, "dead-2", nowSec - 5000);
    seedReplay(sqlite, K, "live", nowSec + 3600);
    // The double only has this table; the other purge steps record errors.
    const result = await runScheduledPurge({ DB: db } as unknown as Env, logger);
    expect(result.deleted.request_signing_replay).toBe(2);
    expect(result.errors.filter((e) => e.startsWith("request_signing_replay"))).toEqual([]);
    expect(sqlite.prepare("SELECT nonce_sha256 FROM request_signing_replay").all()).toEqual([{ nonce_sha256: sha256Hex("live") }]);
  });
});

// ── 3. auth composition through handleMcpRequest ────────────────────────────

describe("handleMcpRequest — bearer OR verified signature", () => {
  it("unsigned and unauthenticated: the Bearer challenge text is unchanged, and D1 is never touched", async () => {
    const { env, d1 } = makeEnv();
    const { status, body, res } = await call(env, unsignedReq(toolCall("create_media_buy", { plan_id: "p" })));
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(BEARER_CHALLENGE);
    expect(body.error.code).toBe(-32001);
    expect(d1.prepares()).toBe(0);
  });

  it("unsigned with the DEMO bearer: works as before, D1 never touched", async () => {
    const { env, d1 } = makeEnv();
    const { status, body } = await call(env, unsignedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }), DEMO_KEY));
    expect(status).toBe(200);
    expect(body.result.structuredContent.success).toBe(true);
    expect(d1.prepares()).toBe(0);
  });

  it("signature-only tools/call → 200 (the grader's create_media_buy shape answers Unknown tool, isError)", async () => {
    const { env } = makeEnv();
    const { status, body } = await call(env, signedReq(toolCall("create_media_buy", { plan_id: "plan_001" })));
    expect(status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.adcp_error.code).toBe("UNSUPPORTED_FEATURE");
  });

  it("signature-only with the ES256 test key → 200 too", async () => {
    const { env } = makeEnv();
    const { status, body } = await call(env, signedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }), { kid: "test-es256-2026" }));
    expect(status).toBe(200);
    expect(body.result.structuredContent.success).toBe(true);
  });

  it("a signature-only caller is SANDBOX at comply_test_controller, in its own rs: operator namespace", async () => {
    const { env, kv } = makeEnv();
    const listed = await call(env, signedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } })));
    expect(listed.body.result.structuredContent.success).toBe(true); // live would be FORBIDDEN
    await call(env, signedReq(toolCall("comply_test_controller", {
      scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "rs_arm" },
    })));
    expect(signerOperatorId("test-ed25519-2026")).toBe("rs:test-ed25519-2026");
    expect([...kv.keys()]).toContain("compliance:arm:get_signals:rs:test-ed25519-2026");
  });

  it("bearer + verified signature: the bearer wins (its operatorId, its mode)", async () => {
    const { env, kv } = makeEnv();
    await call(env, signedReq(toolCall("comply_test_controller", {
      scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "bearer_arm" },
    }), { bearer: DEMO_KEY }));
    expect([...kv.keys()]).toContain(`compliance:arm:get_signals:${await deriveOperatorId(DEMO_KEY)}`);
    expect([...kv.keys()].some((k) => k.includes("rs:"))).toBe(false);

    const live = await call(env, signedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }), { bearer: LIVE_KIT_KEY }));
    expect(live.status).toBe(200);
    expect(live.body.result.structuredContent.error).toBe("FORBIDDEN"); // the live key stays live
  });

  it("an invalid bearer does not spoil a verified signature (signature-only principal)", async () => {
    const { env } = makeEnv();
    const { status } = await call(env, signedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }), { bearer: "not-the-key" }));
    expect(status).toBe(200);
  });

  it("vector 027 shape: unsigned update_media_buy carrying push_notification_config.authentication + a VALID bearer → 401 Signature request_signature_required", async () => {
    const { env } = makeEnv();
    const { status, body, res } = await call(env, unsignedReq(toolCall("update_media_buy", {
      media_buy_id: "mb_001",
      push_notification_config: { url: "https://buyer.example.com/webhook", authentication: { scheme: "HMAC-SHA256", credentials: "shared-secret-placeholder" } },
    }), DEMO_KEY));
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_required"');
    expect(body.error.code).toBe(-32001);
    expect(body.id).toBe(1);
  });

  it("the same webhook authentication on a SIGNED request is accepted, and logged (3.1.27 :1455)", async () => {
    const { env } = makeEnv();
    const info = vi.spyOn(logger, "info");
    const { status } = await call(env, signedReq(toolCall("update_media_buy", {
      media_buy_id: "mb_001",
      push_notification_config: { url: "https://buyer.example.com/webhook", authentication: { scheme: "HMAC-SHA256", credentials: "shared-secret-placeholder" } },
    })));
    expect(status).toBe(200);
    expect(info).toHaveBeenCalledWith("mcp_webhook_authentication_present", { keyid: "test-ed25519-2026" });
    info.mockRestore();
  });

  it("a lone Signature header on the public capabilities tool → 401 Signature request_signature_header_malformed", async () => {
    const { env } = makeEnv();
    const req = unsignedReq(toolCall("get_adcp_capabilities", {}));
    req.headers.set("Signature", "sig1=:AAAA:");
    const { status, res } = await call(env, req);
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_header_malformed"');
  });

  it("a lone Signature-Input header, even beside a valid bearer → 401 header_malformed (never falls back to bearer)", async () => {
    const { env } = makeEnv();
    const req = unsignedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }), DEMO_KEY);
    req.headers.set("Signature-Input", 'sig1=("@method");created=1;expires=2;nonce="x";keyid="test-ed25519-2026";alg="ed25519";tag="adcp/request-signing/v1"');
    const { status, res } = await call(env, req);
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_header_malformed"');
  });

  it("a blank Signature header → 401 header_malformed, never the SDK's any-depth payload heuristic", async () => {
    const { env } = makeEnv();
    // authentication at a site the 3.1.27 rule does not name: the SDK's own
    // unsigned path would answer request_signature_required here.
    const req = unsignedReq(toolCall("sync_governance", { governance_agents: [{ url: "https://g.example", authentication: { scheme: "Bearer", credentials: "x".repeat(32) } }] }), DEMO_KEY);
    req.headers.set("Signature", "  ");
    const { status, res } = await call(env, req);
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_header_malformed"');
  });

  it("an unknown keyid → 401 request_signature_key_unknown (no discovery for real counterparties)", async () => {
    const { env } = makeEnv();
    const req = signedReq(toolCall("get_adcp_capabilities", {}));
    req.headers.set("Signature-Input", req.headers.get("Signature-Input")!.replace('keyid="test-ed25519-2026"', 'keyid="someone-else-2026"'));
    const { status, res } = await call(env, req);
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_key_unknown"');
  });

  it("replaying a signed request → 200, then 401 request_signature_replayed", async () => {
    const { env } = makeEnv();
    const first = signedReq(toolCall("create_media_buy", { plan_id: "p" }));
    const second = first.clone();
    expect((await call(env, first)).status).toBe(200);
    const { status, res } = await call(env, second);
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_replayed"');
  });

  it("step 14: a validly signed body with duplicate keys → 401 request_body_malformed, and its nonce is already burned", async () => {
    const { env } = makeEnv();
    const rawBody = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_adcp_capabilities","arguments":{},"name":"create_media_buy"}}';
    const first = signedReq(null, { rawBody });
    const second = first.clone();
    const r1 = await call(env, first);
    expect(r1.status).toBe(401);
    expect(r1.res.headers.get("WWW-Authenticate")).toBe('Signature error="request_body_malformed"');
    const r2 = await call(env, second);
    expect(r2.res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_replayed"');
  });

  it("a signed body with a UTF-8 BOM verifies against the exact bytes and still parses", async () => {
    const { env } = makeEnv();
    const rawBody = "﻿" + JSON.stringify(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }));
    const { status, body } = await call(env, signedReq(null, { rawBody }));
    expect(status).toBe(200);
    expect(body.result.structuredContent.success).toBe(true);
  });

  it("unsigned batch: unchanged — per-message results, HTTP 200, no D1", async () => {
    const { env, d1 } = makeEnv();
    const { status, body } = await call(env, unsignedReq([
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }, 2),
    ]));
    expect(status).toBe(200);
    const byId = Object.fromEntries((body as any[]).map((m) => [m.id, m]));
    expect(byId[1].result.tools).toBeDefined();
    expect(byId[2].error.code).toBe(-32001);
    expect(d1.prepares()).toBe(0);
  });

  it("signed batch: verified once for the whole request, every message authenticated", async () => {
    const d1 = makeD1();
    const { env } = makeEnv(d1.db);
    const { status, body } = await call(env, signedReq([
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }, 2),
      toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } }, 3),
    ]));
    expect(status).toBe(200);
    const byId = Object.fromEntries((body as any[]).map((m) => [m.id, m]));
    expect(byId[2].result.structuredContent.success).toBe(true);
    expect(byId[3].result.structuredContent.success).toBe(true);
    expect(liveRows(d1.sqlite)).toBe(1);
  });

  it("an unsigned batch with webhook authentication in one element → 401 Signature request_signature_required", async () => {
    const { env } = makeEnv();
    const { status, res } = await call(env, unsignedReq([
      toolCall("get_signals", {}, 1),
      toolCall("get_signals", { push_notification_config: { url: "https://b.example/h", authentication: { scheme: "Bearer", credentials: "x".repeat(32) } } }, 2),
    ], DEMO_KEY));
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Signature error="request_signature_required"');
  });

  it("body cap is enforced on the REAL length, not the Content-Length header", async () => {
    const { env } = makeEnv();
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(1_000_001) } });
    const req = new Request(MCP_URL, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "10" }, body: big });
    const { status, body } = await call(env, req);
    expect(status).toBe(200);
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toMatch(/too large/i);
  });

  it("a body that fails to read is still -32700 (HTTP 200), as it was under request.json()", async () => {
    const { env } = makeEnv();
    const body = new ReadableStream({ start(c) { c.error(new Error("client aborted")); } });
    const req = new Request(MCP_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit);
    const { status, body: out } = await call(env, req);
    expect(status).toBe(200);
    expect(out.error.code).toBe(-32700);
  });

  it("D1 failure on the signed path fails closed with 503, never accepts", async () => {
    const broken = { prepare() { throw new Error("D1_ERROR: unavailable"); } } as unknown as D1Database;
    const { env } = makeEnv(broken);
    const { status, body } = await call(env, signedReq(toolCall("comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } })));
    expect(status).toBe(503);
    expect(body.result).toBeUndefined();
    expect(body.error.code).toBe(-32603);
  });
});

// ── 4. capability ───────────────────────────────────────────────────────────

describe("get_adcp_capabilities serves the verifier's posture constant", () => {
  it("request_signing over MCP equals REQUEST_SIGNING_CAPABILITY", async () => {
    const { env } = makeEnv();
    const { body } = await call(env, unsignedReq(toolCall("get_adcp_capabilities", {})));
    expect(body.result.structuredContent.request_signing).toEqual(REQUEST_SIGNING_CAPABILITY);
    expect(REQUEST_SIGNING_CAPABILITY).toEqual({
      supported: true, covers_content_digest: "either", required_for: [], warn_for: [], supported_for: [],
    });
  });
});

// ── 5. the workerd crypto shim ──────────────────────────────────────────────

describe("src/shims/crypto.ts — P1363 → DER for ES256", () => {
  function b64urlDecode(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }

  it("verifies the ES256 conformance vector through the converted call shape", () => {
    const v = JSON.parse(readFileSync(join(VECTORS, "positive", "003-es256-post.json"), "utf8")) as Vector & { expected_signature_base: string };
    const es = TEST_KEYS.find((k) => k.kid === "test-es256-2026")!;
    const key = createPublicKey({ key: { kty: es.kty, crv: es.crv!, x: es.x!, y: es.y! }, format: "jwk" });
    const sig = b64urlDecode(/sig1=:([^:]+):/.exec(v.request.headers["Signature"]!)![1]!);
    expect(sig.length).toBe(64);
    const data = Buffer.from(v.expected_signature_base, "utf8");
    expect(shimVerify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    const tampered = Buffer.from(sig);
    tampered[10] = (tampered[10] ?? 0) ^ 0xff;
    expect(shimVerify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, tampered)).toBe(false);
  });

  it("round-trips 200 fresh P-256 signatures (covers high-bit padding and leading zero bytes)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    for (let i = 0; i < 200; i++) {
      const data = Buffer.from(`message ${i}`);
      const sig = nodeSign("sha256", data, { key: privateKey, dsaEncoding: "ieee-p1363" });
      expect(shimVerify("sha256", data, { key: publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    }
  });

  it("rejects a P1363 signature that is not exactly 64 bytes, as Node does (zero-padded r and s)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const data = Buffer.from("padded");
    const sig = nodeSign("sha256", data, { key: privateKey, dsaEncoding: "ieee-p1363" });
    const padded = Buffer.concat([Buffer.from([0]), sig.subarray(0, 32), Buffer.from([0]), sig.subarray(32)]);
    expect(nodeVerify("sha256", data, { key: publicKey, dsaEncoding: "ieee-p1363" }, padded)).toBe(false);
    expect(shimVerify("sha256", data, { key: publicKey, dsaEncoding: "ieee-p1363" }, padded)).toBe(false);
    expect(shimVerify("sha256", data, { key: publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });

  it("passes every other call shape through unchanged (Ed25519)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const data = Buffer.from("ed25519 message");
    expect(shimVerify(null, data, publicKey, nodeSign(null, data, privateKey))).toBe(true);
  });
});
