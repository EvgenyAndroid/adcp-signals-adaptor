// tests/webhookSigning.test.ts
//
// RFC 9421 webhook signing under the AdCP `adcp/webhook-signing/v1` profile
// (closes #248; replaces the HMAC-SHA256 tests that lived here).
//
// Three layers, in order of how much they prove:
//   1. CONFORMANCE VECTORS — every Ed25519 positive vector shipped in the
//      vendored spec cache is re-signed with the vector's own (published)
//      private key at the vector's pinned clock and nonce, and MUST
//      reproduce the signature base, Content-Digest, Signature-Input, and
//      Signature byte-for-byte. Ed25519 is deterministic, so this is an
//      exact equality, not a "verifies" check. This is the canonicalization
//      lock the issue asked for first.
//   2. ROUND TRIP through the official verifier (`@adcp/sdk/signing/server`)
//      with a freshly minted key — proves a real receiver accepts what we
//      emit, and rejects tampering and replay.
//   3. KEY LOADING — the secret format is validated strictly and loudly.

import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWebhookVerifier, StaticJwksResolver, CLOCK_SKEW_TOLERANCE_SECONDS } from "@adcp/sdk/signing/server";
import {
  loadWebhookSigningKey,
  webhookSigningFromEnv,
  publicJwk,
  signWebhookRequest,
  SIGNATURE_WINDOW_SECONDS,
  WEBHOOK_SIGNING_TAG,
  WebhookSigningKeyError,
  resolveWebhookSigning,
  proveWebhookSigningKey,
  type WebhookSigningKey,
} from "../src/domain/webhookSigning";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = resolve(HERE, "../node_modules/@adcp/sdk/compliance/cache");

// ── helpers ─────────────────────────────────────────────────────────────────

interface VectorKey {
  kid: string;
  x: string;
  adcp_use: string;
  _private_d_for_test_only?: string;
}

interface Vector {
  name: string;
  reference_now?: number;
  request: { method: string; url: string; headers: Record<string, string>; body: string };
  expected_signature_base: string;
}

/** Every cache line that ships webhook-signing vectors (skips *.previous). */
function vectorDirs(): string[] {
  if (!existsSync(CACHE_ROOT)) return [];
  return readdirSync(CACHE_ROOT)
    .filter((d) => !d.endsWith(".previous"))
    .map((d) => join(CACHE_ROOT, d, "test-vectors", "webhook-signing"))
    .filter((p) => existsSync(join(p, "keys.json")) && existsSync(join(p, "positive")));
}

function loadKeys(dir: string): Map<string, VectorKey> {
  const raw = JSON.parse(readFileSync(join(dir, "keys.json"), "utf8")) as { keys?: VectorKey[] } | VectorKey[];
  const list = Array.isArray(raw) ? raw : (raw.keys ?? []);
  return new Map(list.map((k) => [k.kid, k]));
}

function parseSignatureInput(h: string): { created: number; expires: number; nonce: string; keyid: string; alg: string } {
  const m = h.match(/created=(\d+);expires=(\d+);nonce="([^"]+)";keyid="([^"]+)";alg="([^"]+)"/);
  if (!m) throw new Error(`unparseable Signature-Input: ${h}`);
  return { created: Number(m[1]), expires: Number(m[2]), nonce: m[3]!, keyid: m[4]!, alg: m[5]! };
}

/** Turn a published conformance key (public + `_private_d_for_test_only`) into our secret format. */
function secretFromVectorKey(k: VectorKey): string {
  return JSON.stringify({
    kid: k.kid,
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    use: "sig",
    key_ops: ["sign"],
    adcp_use: k.adcp_use,
    x: k.x,
    d: k._private_d_for_test_only,
  });
}

/** Mint a fresh Ed25519 key in the exact shape the production secret takes. */
async function mintKey(kid = "test-signal-stack-2026"): Promise<{ secret: string; key: WebhookSigningKey }> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  const secret = JSON.stringify({
    kid,
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    use: "sig",
    key_ops: ["sign"],
    adcp_use: "request-signing",
    x: jwk.x,
    d: jwk.d,
  });
  const key = loadWebhookSigningKey(secret);
  if (!key) throw new Error("minted key failed to load");
  return { secret, key };
}

// ── 1. conformance vectors ──────────────────────────────────────────────────

describe("conformance vectors — adcp/webhook-signing/v1 positive set", () => {
  const dirs = vectorDirs();

  it("finds at least one vendored cache line with webhook-signing vectors", () => {
    expect(dirs.length).toBeGreaterThan(0);
  });

  for (const dir of dirs) {
    const line = dir.split(/[\\/]/).slice(-3)[0];
    const keys = loadKeys(dir);
    const files = readdirSync(join(dir, "positive")).filter((f) => f.endsWith(".json")).sort();

    describe(`line ${line}`, () => {
      for (const file of files) {
        const vec = JSON.parse(readFileSync(join(dir, "positive", file), "utf8")) as Vector;
        const pinned = parseSignatureInput(vec.request.headers["Signature-Input"]!);
        if (pinned.alg !== "ed25519") {
          it.skip(`${file} (${pinned.alg} — we sign Ed25519 only)`, () => {});
          continue;
        }

        it(`${file}: reproduces base, digest, input and signature byte-for-byte`, async () => {
          const vk = keys.get(pinned.keyid);
          expect(vk, `vector key ${pinned.keyid} missing from keys.json`).toBeDefined();
          const key = loadWebhookSigningKey(secretFromVectorKey(vk!));
          expect(key).not.toBeNull();

          const signed = await signWebhookRequest(
            key!,
            {
              method: vec.request.method,
              url: vec.request.url,
              headers: { "Content-Type": vec.request.headers["Content-Type"]! },
              body: vec.request.body,
            },
            {
              now: () => pinned.created,
              windowSeconds: pinned.expires - pinned.created,
              nonce: pinned.nonce,
            },
          );

          expect(signed.signatureBase).toBe(vec.expected_signature_base);
          expect(signed.headers["Content-Digest"]).toBe(vec.request.headers["Content-Digest"]);

          // Multi-signature vectors carry a second, unrelated label (a
          // relay's signature) alongside sig1, as a dictionary member list.
          // A sender only ever emits its own, so the exact-equality target
          // is the vector's FIRST member (`sig1=…`), which for single-label
          // vectors is the whole header. Strict equality either way — no
          // prefix loophole.
          const expectedInput = vec.request.headers["Signature-Input"]!.split(", ")[0]!;
          const expectedSig = vec.request.headers["Signature"]!.split(", ")[0]!;
          expect(signed.headers["Signature-Input"]).toBe(expectedInput);
          expect(signed.headers["Signature"]).toBe(expectedSig);
        });
      }
    });
  }
});

// ── 2. round trip through the official verifier ─────────────────────────────

describe("round trip — official @adcp/sdk webhook verifier", () => {
  const URL_ = "https://buyer.example.com/adcp/webhook/activate_signal/agent_1/op_9";
  const BODY = JSON.stringify({ idempotency_key: "whk_0123456789ABCDEF", task_id: "op_9", status: "completed" });
  const NOW = 1_800_000_000;

  it("a receiver verifies what we emit — status verified, keyid = kid", async () => {
    const { key } = await mintKey();
    const signed = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });

    const verify = createWebhookVerifier({
      jwks: new StaticJwksResolver([publicJwk(key)]),
      now: () => NOW + 5,
    });
    const result = await verify({ method: "POST", url: URL_, headers: signed.headers, body: BODY });
    expect(result.status).toBe("verified");
    expect(result.keyid).toBe(key.kid);
  });

  it("emits the five mandatory components, the webhook tag, alg ed25519, and a 300s window", async () => {
    const { key } = await mintKey();
    const signed = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    const input = signed.headers["Signature-Input"]!;

    expect(input.startsWith('sig1=("@method" "@target-uri" "@authority" "content-type" "content-digest")')).toBe(true);
    expect(input).toContain(`created=${NOW}`);
    expect(input).toContain(`expires=${NOW + SIGNATURE_WINDOW_SECONDS}`);
    expect(input).toContain(`keyid="${key.kid}"`);
    expect(input).toContain('alg="ed25519"');
    expect(input).toContain(`tag="${WEBHOOK_SIGNING_TAG}"`);
    expect(input).toMatch(/nonce="[A-Za-z0-9_-]{22}"/);
    expect(signed.headers["Content-Digest"]).toMatch(/^sha-256=:[A-Za-z0-9+/]+=*:$/);
    expect(signed.headers["Signature"]).toMatch(/^sig1=:[A-Za-z0-9_-]+:$/);
    // Content-Type is a covered component and must be on the wire.
    expect(signed.headers["Content-Type"]).toBe("application/json");
    // Nothing from the old scheme survives.
    expect(signed.headers["X-AdCP-Signature"]).toBeUndefined();
  });

  it("draws a fresh nonce per signature", async () => {
    const { key } = await mintKey();
    const a = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    const b = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    expect(a.params.nonce).not.toBe(b.params.nonce);
    expect(a.headers["Signature"]).not.toBe(b.headers["Signature"]);
  });

  it("preserves caller headers and adds exactly the signing headers", async () => {
    const { key } = await mintKey();
    const signed = await signWebhookRequest(
      key,
      { url: URL_, body: BODY, headers: { "Content-Type": "application/json", "User-Agent": "adcp-signals-adaptor/1.0" } },
      { now: () => NOW },
    );
    expect(signed.headers["User-Agent"]).toBe("adcp-signals-adaptor/1.0");
    expect(Object.keys(signed.headers).sort()).toEqual(
      ["Content-Digest", "Content-Type", "Signature", "Signature-Input", "User-Agent"].sort(),
    );
  });

  it("a tampered body fails the digest check (step 11)", async () => {
    const { key } = await mintKey();
    const signed = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    const verify = createWebhookVerifier({ jwks: new StaticJwksResolver([publicJwk(key)]), now: () => NOW + 5 });
    await expect(
      verify({ method: "POST", url: URL_, headers: signed.headers, body: BODY.replace("completed", "cancelled") }),
    ).rejects.toMatchObject({ code: "webhook_signature_digest_mismatch" });
  });

  it("a different key in the JWKS fails the signature check (step 10)", async () => {
    const { key } = await mintKey("kid-a");
    const other = await mintKey("kid-a"); // same kid, different key material
    const signed = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    const verify = createWebhookVerifier({ jwks: new StaticJwksResolver([publicJwk(other.key)]), now: () => NOW + 5 });
    await expect(verify({ method: "POST", url: URL_, headers: signed.headers, body: BODY })).rejects.toMatchObject({
      code: "webhook_signature_invalid",
    });
  });

  it("the same delivery replayed is rejected by the receiver's nonce store (step 12)", async () => {
    const { key } = await mintKey();
    const signed = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    const verify = createWebhookVerifier({ jwks: new StaticJwksResolver([publicJwk(key)]), now: () => NOW + 5 });
    const req = { method: "POST", url: URL_, headers: signed.headers, body: BODY };
    await expect(verify(req)).resolves.toMatchObject({ status: "verified" });
    await expect(verify(req)).rejects.toMatchObject({ code: "webhook_signature_replayed" });
  });

  it("an expired signature is rejected once past the window plus the verifier's skew allowance (step 5)", async () => {
    const { key } = await mintKey();
    const signed = await signWebhookRequest(key, { url: URL_, body: BODY }, { now: () => NOW });
    const verify = createWebhookVerifier({
      jwks: new StaticJwksResolver([publicJwk(key)]),
      now: () => NOW + SIGNATURE_WINDOW_SECONDS + CLOCK_SKEW_TOLERANCE_SECONDS + 1,
    });
    await expect(verify({ method: "POST", url: URL_, headers: signed.headers, body: BODY })).rejects.toMatchObject({
      code: "webhook_signature_window_invalid",
    });
  });
});

// ── 3. key loading ──────────────────────────────────────────────────────────

describe("loadWebhookSigningKey — the WEBHOOK_SIGNING_PRIVATE_JWK contract", () => {
  it("absent or blank ⇒ null (unsigned posture), never a throw", () => {
    expect(loadWebhookSigningKey(undefined)).toBeNull();
    expect(loadWebhookSigningKey(null)).toBeNull();
    expect(loadWebhookSigningKey("")).toBeNull();
    expect(loadWebhookSigningKey("   \n")).toBeNull();
  });

  it("loads a well-formed private JWK and exposes kid + purpose", async () => {
    const { key } = await mintKey("k-2026-09");
    expect(key.kid).toBe("k-2026-09");
    expect(key.adcpUse).toBe("request-signing");
  });

  it("accepts the deprecated webhook-signing purpose (backward compatible)", async () => {
    const { secret } = await mintKey();
    const alt = JSON.stringify({ ...JSON.parse(secret), adcp_use: "webhook-signing" });
    expect(loadWebhookSigningKey(alt)?.adcpUse).toBe("webhook-signing");
  });

  const cases: Array<[string, (j: Record<string, unknown>) => unknown, RegExp]> = [
    ["not JSON", () => "not-json", /not valid JSON/],
    ["a JSON array", () => [], /JSON object/],
    ["wrong kty", (j) => ({ ...j, kty: "EC" }), /kty must be "OKP"/],
    ["wrong crv", (j) => ({ ...j, crv: "P-256" }), /crv must be "Ed25519"/],
    ["missing kid", (j) => { const c = { ...j }; delete c["kid"]; return c; }, /kid must be/],
    ["kid with illegal characters", (j) => ({ ...j, kid: "has space" }), /kid must be/],
    ["missing x", (j) => { const c = { ...j }; delete c["x"]; return c; }, /x must be 32 bytes/],
    ["missing d", (j) => { const c = { ...j }; delete c["d"]; return c; }, /d \(private scalar\)/],
    ["d of the wrong length", (j) => ({ ...j, d: "short" }), /d \(private scalar\)/],
    ["wrong purpose (response-signing)", (j) => ({ ...j, adcp_use: "response-signing" }), /adcp_use must be one of/],
    ["missing purpose", (j) => { const c = { ...j }; delete c["adcp_use"]; return c; }, /adcp_use must be one of/],
    ["key_ops without sign", (j) => ({ ...j, key_ops: ["verify"] }), /key_ops.*must include "sign"/],
  ];

  for (const [label, mutate, pattern] of cases) {
    it(`rejects ${label} loudly`, async () => {
      const { secret } = await mintKey();
      const mutated = mutate(JSON.parse(secret) as Record<string, unknown>);
      const raw = typeof mutated === "string" ? mutated : JSON.stringify(mutated);
      expect(() => loadWebhookSigningKey(raw)).toThrow(WebhookSigningKeyError);
      expect(() => loadWebhookSigningKey(raw)).toThrow(pattern);
    });
  }

  it("webhookSigningFromEnv turns a malformed secret into a logged error + null, not a throw", async () => {
    const events: Array<{ event: string; fields?: Record<string, unknown> | undefined }> = [];
    const logger = { error: (event: string, fields?: Record<string, unknown>) => { events.push({ event, fields }); } };
    const key = webhookSigningFromEnv({ WEBHOOK_SIGNING_PRIVATE_JWK: '{"kty":"EC"}' }, logger);
    expect(key).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe("webhook_signing_key_invalid");
    expect(String(events[0]!.fields?.["error"])).toMatch(/kty must be "OKP"/);
    // And it must never echo the secret material itself.
    expect(JSON.stringify(events)).not.toContain('"d"');
  });

  it("publicJwk strips the private scalar and flips key_ops to verify", async () => {
    const { key } = await mintKey("pub-test");
    const pub = publicJwk(key) as unknown as Record<string, unknown>;
    expect(pub).toEqual({
      kid: "pub-test",
      kty: "OKP",
      crv: "Ed25519",
      alg: "EdDSA",
      use: "sig",
      key_ops: ["verify"],
      adcp_use: "request-signing",
      x: key.privateJwk.x,
    });
    expect("d" in pub).toBe(false);
  });
});

// ── 4. the pair must PROVE itself before it is published or used ────────────

describe("resolveWebhookSigning — x must be the public key of d", () => {
  async function mismatchedSecret(): Promise<string> {
    // x from one freshly minted key, d from another — shape-valid, unusable.
    const a = JSON.parse((await mintKey("mismatch")).secret) as Record<string, string>;
    const b = JSON.parse((await mintKey("mismatch")).secret) as Record<string, string>;
    return JSON.stringify({ ...a, x: b["x"] });
  }

  it("a matched pair proves and resolves", async () => {
    const { secret, key } = await mintKey("proven");
    expect(await proveWebhookSigningKey(key)).toBe(true);
    const resolved = await resolveWebhookSigning({ WEBHOOK_SIGNING_PRIVATE_JWK: secret });
    expect(resolved?.kid).toBe("proven");
  });

  it("a mismatched pair passes the shape check but fails the proof, is logged, and resolves to null", async () => {
    const raw = await mismatchedSecret();
    const shapeOnly = loadWebhookSigningKey(raw);
    expect(shapeOnly).not.toBeNull(); // shape is fine — that is exactly the trap
    expect(await proveWebhookSigningKey(shapeOnly!)).toBe(false);

    const events: Array<{ event: string; fields?: Record<string, unknown> | undefined }> = [];
    const resolved = await resolveWebhookSigning(
      { WEBHOOK_SIGNING_PRIVATE_JWK: raw },
      { error: (event, fields) => { events.push({ event, fields }); } },
    );
    expect(resolved).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe("webhook_signing_key_invalid");
    expect(String(events[0]!.fields?.["error"])).toMatch(/not the public key of private d/);
    // The log must carry the kid (public) and never the scalar.
    expect(String(events[0]!.fields?.["error"])).toContain("mismatch");
    expect(JSON.stringify(events)).not.toContain(JSON.parse(raw).d);
  });

  it("signing with a mismatched pair throws rather than emitting an unverifiable signature", async () => {
    const key = loadWebhookSigningKey(await mismatchedSecret())!;
    await expect(
      signWebhookRequest(key, { url: "https://buyer.example.com/hook", body: "{}" }),
    ).rejects.toBeInstanceOf(WebhookSigningKeyError);
  });

  it("absent ⇒ null without logging; malformed ⇒ null with the no-logger console fallback", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await resolveWebhookSigning({})).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      expect(await resolveWebhookSigning({ WEBHOOK_SIGNING_PRIVATE_JWK: "{" })).toBeNull();
      expect(spy).toHaveBeenCalledWith("webhook_signing_key_invalid", expect.stringMatching(/not valid JSON/));
    } finally {
      spy.mockRestore();
    }
  });
});
