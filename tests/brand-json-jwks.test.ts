// tests/brand-json-jwks.test.ts
//
// The signing-key discovery chain (#248):
//   identity.brand_json_url → brand.json agents[].jwks_uri → jwks.json
//
// Pins: the served brand.json validates against the vendored 3.1.0
// brand.json schema (self-published brand variant), its agents[] entry
// points a verifier at OUR /mcp and OUR jwks.json on the same origin, and
// jwks.json publishes exactly the public half of the configured key —
// never the private scalar — or `keys: []` when unconfigured.

import { describe, it, expect } from "vitest";
import {
  buildBrandDocument,
  validateBrandDocument,
  handleBrandJson,
  buildJwksDocument,
  handleJwks,
  JWKS_PATH,
} from "../src/routes/brandJson";
import type { Env } from "../src/types/env";

const ORIGIN = "https://adcp-signals-adaptor.evgeny-193.workers.dev";
const req = (path: string) => new Request(`${ORIGIN}${path}`, { method: "GET" });
const envWith = (jwk?: string) => ({ WEBHOOK_SIGNING_PRIVATE_JWK: jwk }) as unknown as Env;

async function mintSecret(kid = "brand-test-key"): Promise<{ secret: string; x: string }> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return {
    secret: JSON.stringify({ kid, kty: "OKP", crv: "Ed25519", adcp_use: "request-signing", x: jwk.x, d: jwk.d }),
    x: jwk.x!,
  };
}

describe("/.well-known/brand.json", () => {
  it("validates against the vendored 3.1.0 brand.json schema", () => {
    const doc = buildBrandDocument(req("/.well-known/brand.json"));
    const r = validateBrandDocument(doc);
    if (!r.valid) {
      // eslint-disable-next-line no-console
      console.log("brand.json validation errors:", JSON.stringify(r.errors, null, 2));
    }
    expect(r.schema_id).toBe("/schemas/3.1.0/brand.json");
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("declares exactly one signals agent: our /mcp with a same-origin jwks_uri", () => {
    const doc = buildBrandDocument(req("/.well-known/brand.json"));
    expect(doc.agents).toHaveLength(1);
    const agent = doc.agents[0]!;
    expect(agent.type).toBe("signals");
    expect(agent.url).toBe(`${ORIGIN}/mcp`);
    expect(agent.jwks_uri).toBe(`${ORIGIN}${JWKS_PATH}`);
    expect(new URL(agent.jwks_uri).origin).toBe(new URL(agent.url).origin);
  });

  it("is a standalone self-published brand — no house/portfolio keys that would change the schema variant", () => {
    const doc = buildBrandDocument(req("/.well-known/brand.json")) as unknown as Record<string, unknown>;
    for (const k of ["house", "brands", "brand_refs", "authorized_operators", "authoritative_location", "house_domain"]) {
      expect(k in doc).toBe(false);
    }
  });

  it("adapts to the request origin (preview vs prod)", () => {
    const prod = buildBrandDocument(req("/.well-known/brand.json"));
    const preview = buildBrandDocument(new Request("https://preview-1.example.workers.dev/.well-known/brand.json"));
    expect(prod.agents[0]!.url).toBe(`${ORIGIN}/mcp`);
    expect(preview.agents[0]!.url).toBe("https://preview-1.example.workers.dev/mcp");
    expect(preview.agents[0]!.jwks_uri).toBe(`https://preview-1.example.workers.dev${JWKS_PATH}`);
  });

  it("is served public, JSON, CORS-open, cacheable", async () => {
    const res = handleBrandJson(req("/.well-known/brand.json"), envWith());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    const body = (await res.json()) as { agents: Array<{ jwks_uri: string }> };
    expect(body.agents[0]!.jwks_uri).toBe(`${ORIGIN}${JWKS_PATH}`);
  });
});

describe("/.well-known/jwks.json", () => {
  it("publishes exactly the public half of the configured key", async () => {
    const { secret, x } = await mintSecret("k-pub");
    const doc = await buildJwksDocument(envWith(secret));
    expect(doc.keys).toHaveLength(1);
    expect(doc.keys[0]).toEqual({
      kid: "k-pub",
      kty: "OKP",
      crv: "Ed25519",
      alg: "EdDSA",
      use: "sig",
      key_ops: ["verify"],
      adcp_use: "request-signing",
      x,
    });
  });

  it("never leaks the private scalar, even through the HTTP surface", async () => {
    const { secret } = await mintSecret();
    const res = await handleJwks(req(JWKS_PATH), envWith(secret));
    const text = await res.text();
    expect(text).not.toContain('"d"');
    expect(text).not.toContain(JSON.parse(secret).d);
  });

  it("serves keys: [] when no key is configured (honest unsigned posture)", async () => {
    await expect(buildJwksDocument(envWith())).resolves.toEqual({ keys: [] });
    await expect(buildJwksDocument(envWith(""))).resolves.toEqual({ keys: [] });
  });

  it("serves keys: [] rather than throwing when the secret is malformed", async () => {
    await expect(buildJwksDocument(envWith('{"kty":"EC"}'))).resolves.toEqual({ keys: [] });
  });

  it("does not publish a shape-valid key whose x is not the public key of its d", async () => {
    const a = JSON.parse((await mintSecret("mm")).secret) as Record<string, string>;
    const b = JSON.parse((await mintSecret("mm")).secret) as Record<string, string>;
    await expect(buildJwksDocument(envWith(JSON.stringify({ ...a, x: b["x"] })))).resolves.toEqual({ keys: [] });
  });

  it("is served public, JSON, CORS-open, cached for 5 minutes", async () => {
    const { secret } = await mintSecret();
    const res = await handleJwks(req(JWKS_PATH), envWith(secret));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
    const body = (await res.json()) as { keys: Array<{ kid: string }> };
    expect(body.keys[0]!.kid).toBe("brand-test-key");
  });
});

// ── through the real Worker entrypoint: both documents are PUBLIC ───────────
//
// A verifier resolving our key has no bearer token. The allowlist in
// src/index.ts must admit exactly these two paths without auth — and must
// not have over-matched anything that should stay gated.

import worker from "../src/index";

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [], list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
}

function makeEmptyDb(): Env["DB"] {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: {} }; },
      };
    },
    // The entrypoint's auto-seed path (ctx.waitUntil) calls db.batch; give
    // it a quiet no-op so the test log isn't an error wall.
    async batch() { return []; },
  } as unknown as Env["DB"];
}

function workerEnv(jwk?: string): Env {
  return {
    ENVIRONMENT: "test",
    API_VERSION: "3.0",
    DEMO_API_KEY: "worker-test-key",
    LINKEDIN_CLIENT_ID: "c",
    LINKEDIN_CLIENT_SECRET: "s",
    LINKEDIN_REDIRECT_URI: "https://example.com/cb",
    LINKEDIN_AD_ACCOUNT_ID: "1",
    SIGNALS_CACHE: makeKv(),
    DB: makeEmptyDb(),
    ...(jwk !== undefined ? { WEBHOOK_SIGNING_PRIVATE_JWK: jwk } : {}),
  } as unknown as Env;
}

const ctx = {
  waitUntil(p: Promise<unknown>) { void p.catch(() => {}); },
  passThroughOnException() {},
} as unknown as ExecutionContext;

describe("worker entrypoint — signing-key discovery documents need no auth", () => {
  it("GET /.well-known/brand.json → 200 without Authorization", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/.well-known/brand.json`), workerEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: Array<{ jwks_uri: string }> };
    expect(body.agents[0]!.jwks_uri).toBe(`${ORIGIN}${JWKS_PATH}`);
  });

  it("GET /.well-known/jwks.json → 200 without Authorization, carrying the configured public key", async () => {
    const { secret } = await mintSecret("via-worker");
    const res = await worker.fetch(new Request(`${ORIGIN}${JWKS_PATH}`), workerEnv(secret), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ kid: string; d?: string }> };
    expect(body.keys[0]!.kid).toBe("via-worker");
    expect(body.keys[0]!.d).toBeUndefined();
  });

  it("the allowlist did not over-match: an authenticated tool call without a token is still refused", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_signals", arguments: {} } }),
      }),
      workerEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});
