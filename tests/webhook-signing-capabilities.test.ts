// tests/webhook-signing-capabilities.test.ts
//
// get_adcp_capabilities must advertise the webhook-signing posture the
// delivery path actually has (#248). `webhook_signing` and `identity` are
// DERIVED from whether WEBHOOK_SIGNING_PRIVATE_JWK loads AND proves, and
// the posture is part of the KV cache key so provisioning or rotating the
// key can never serve a stale declaration.
//
// Covers the whole path, not just the builder: the MCP tools/call handler
// and the REST /capabilities handler must actually forward the secret —
// a dropped field there would advertise supported:false forever.

import { describe, it, expect } from "vitest";
import { getCapabilities } from "../src/domain/capabilityService";
import { handleMcpRequest } from "../src/mcp/server";
import { handleGetCapabilities } from "../src/routes/capabilities";
import { createLogger } from "../src/utils/logger";
import { CANONICAL_ORIGIN } from "../src/constants/origin";
import type { Env } from "../src/types/env";

function makeKv(): { kv: KVNamespace; store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [], list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
  return { kv, store };
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
  } as unknown as Env["DB"];
}

async function mintSecret(kid: string): Promise<string> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return JSON.stringify({ kid, kty: "OKP", crv: "Ed25519", adcp_use: "request-signing", x: jwk.x, d: jwk.d });
}

type Caps = {
  webhook_signing: Record<string, unknown>;
  identity: Record<string, unknown>;
  request_signing: Record<string, unknown>;
};

const API_KEY = "caps-test-key";
const logger = createLogger("caps-test");

function fullEnv(kv: KVNamespace, jwk?: string): Env {
  return {
    DEMO_API_KEY: API_KEY,
    SIGNALS_CACHE: kv,
    DB: makeEmptyDb(),
    ...(jwk !== undefined ? { WEBHOOK_SIGNING_PRIVATE_JWK: jwk } : {}),
  } as unknown as Env;
}

describe("get_adcp_capabilities — webhook_signing / identity posture (builder)", () => {
  it("with a key: supported, the v1 profile, ed25519, no HMAC fallback, brand_json_url + key_origins", async () => {
    const caps = (await getCapabilities(makeKv().kv, undefined, {
      WEBHOOK_SIGNING_PRIVATE_JWK: await mintSecret("caps-on"),
    })) as unknown as Caps;

    expect(caps.webhook_signing).toEqual({
      supported: true,
      profile: "adcp/webhook-signing/v1",
      algorithms: ["ed25519"],
      legacy_hmac_fallback: false,
    });
    expect(caps.identity).toEqual({
      brand_json_url: `${CANONICAL_ORIGIN}/.well-known/brand.json`,
      per_principal_key_isolation: false,
      key_origins: { webhook_signing: CANONICAL_ORIGIN },
    });
  });

  it("without a key: unsupported, no HMAC fallback, brand_json_url still published, no key_origins", async () => {
    const caps = (await getCapabilities(makeKv().kv, undefined, {})) as unknown as Caps;

    expect(caps.webhook_signing).toEqual({ supported: false, legacy_hmac_fallback: false });
    expect(caps.identity).toEqual({
      brand_json_url: `${CANONICAL_ORIGIN}/.well-known/brand.json`,
      per_principal_key_isolation: false,
    });
  });

  it("a malformed key degrades to the unsigned posture rather than a 500", async () => {
    const caps = (await getCapabilities(makeKv().kv, undefined, {
      WEBHOOK_SIGNING_PRIVATE_JWK: '{"kty":"EC"}',
    })) as unknown as Caps;
    expect(caps.webhook_signing["supported"]).toBe(false);
  });

  it("a shape-valid but MISMATCHED pair (x from another key) is not advertised", async () => {
    const a = JSON.parse(await mintSecret("mm")) as Record<string, string>;
    const b = JSON.parse(await mintSecret("mm")) as Record<string, string>;
    const caps = (await getCapabilities(makeKv().kv, undefined, {
      WEBHOOK_SIGNING_PRIVATE_JWK: JSON.stringify({ ...a, x: b["x"] }),
    })) as unknown as Caps;
    expect(caps.webhook_signing["supported"]).toBe(false);
    expect(caps.identity["key_origins"]).toBeUndefined();
  });

  it("a protocols-filtered response still carries the signing posture (identity is load-bearing for verifiers)", async () => {
    const env = { WEBHOOK_SIGNING_PRIVATE_JWK: await mintSecret("caps-filtered") };
    const filtered = (await getCapabilities(makeKv().kv, ["signals"], env)) as unknown as Caps & { signals?: unknown; media_buy?: unknown };
    expect(filtered.signals).toBeDefined();
    expect(filtered.media_buy).toBeUndefined(); // the filter itself still works
    expect(filtered.webhook_signing["supported"]).toBe(true);
    expect(filtered.identity["brand_json_url"]).toBe(`${CANONICAL_ORIGIN}/.well-known/brand.json`);
    expect(filtered.request_signing["supported"]).toBe(false);
  });

  it("request_signing stays unsupported — the key signs webhooks, we don't verify inbound requests", async () => {
    const caps = (await getCapabilities(makeKv().kv, undefined, {
      WEBHOOK_SIGNING_PRIVATE_JWK: await mintSecret("caps-rs"),
    })) as unknown as Caps;
    expect(caps.request_signing["supported"]).toBe(false);
    expect((caps.identity["key_origins"] as Record<string, unknown>)["request_signing"]).toBeUndefined();
  });

  it("the posture is part of the KV cache key: off → kid A → kid B are three distinct entries", async () => {
    const { kv, store } = makeKv();

    const off = (await getCapabilities(kv, undefined, {})) as unknown as Caps;
    expect(off.webhook_signing["supported"]).toBe(false);

    const on = (await getCapabilities(kv, undefined, {
      WEBHOOK_SIGNING_PRIVATE_JWK: await mintSecret("caps-rot-1"),
    })) as unknown as Caps;
    expect(on.webhook_signing["supported"]).toBe(true);

    await getCapabilities(kv, undefined, { WEBHOOK_SIGNING_PRIVATE_JWK: await mintSecret("caps-rot-2") });

    const keys = [...store.keys()];
    expect(keys).toHaveLength(3);
    expect(keys.some((k) => k.endsWith("_ws-off"))).toBe(true);
    expect(keys.some((k) => k.endsWith("_ws-caps-rot-1"))).toBe(true);
    expect(keys.some((k) => k.endsWith("_ws-caps-rot-2"))).toBe(true);
    // And the "off" blob is genuinely the unsigned one, untouched by later calls.
    const offBlob = JSON.parse(store.get(keys.find((k) => k.endsWith("_ws-off"))!)!) as Caps;
    expect(offBlob.webhook_signing["supported"]).toBe(false);
  });
});

describe("get_adcp_capabilities — the secret reaches the builder through the real handlers", () => {
  it("MCP tools/call get_adcp_capabilities advertises supported:true when env carries the key", async () => {
    const env = fullEnv(makeKv().kv, await mintSecret("mcp-path"));
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "get_adcp_capabilities", arguments: {} },
      }),
    });
    const res = await handleMcpRequest(req, env, logger);
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text()) as { result: { structuredContent: Caps } };
    const caps = body.result.structuredContent;
    expect(caps.webhook_signing["supported"]).toBe(true);
    expect(caps.identity["brand_json_url"]).toBe(`${CANONICAL_ORIGIN}/.well-known/brand.json`);
  });

  it("MCP tools/call get_adcp_capabilities advertises supported:false when env has no key", async () => {
    const env = fullEnv(makeKv().kv);
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "get_adcp_capabilities", arguments: {} },
      }),
    });
    const body = JSON.parse(await (await handleMcpRequest(req, env, logger)).text()) as { result: { structuredContent: Caps } };
    expect(body.result.structuredContent.webhook_signing["supported"]).toBe(false);
  });

  it("REST GET /capabilities advertises supported:true when env carries the key", async () => {
    const env = fullEnv(makeKv().kv, await mintSecret("rest-path"));
    const res = await handleGetCapabilities(new Request("https://example.com/capabilities"), env, logger);
    expect(res.status).toBe(200);
    const caps = JSON.parse(await res.text()) as Caps;
    expect(caps.webhook_signing["supported"]).toBe(true);
    expect((caps.identity["key_origins"] as Record<string, unknown>)["webhook_signing"]).toBe(CANONICAL_ORIGIN);
  });
});
