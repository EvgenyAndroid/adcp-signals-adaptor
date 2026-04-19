// tests/conceptHandler-auth.test.ts
// Sec-5: /ucp/concepts/seed now authenticates via requireAuth(request, env.DEMO_API_KEY).
// Previously the route hardcoded a string literal, so rotating the secret
// via `wrangler secret put DEMO_API_KEY` silently broke the route.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the registry's KV writer — we only care about the auth check here.
vi.mock("../src/domain/conceptRegistry.js", async () => {
  const actual = await vi.importActual<typeof import("../src/domain/conceptRegistry.js")>(
    "../src/domain/conceptRegistry.js",
  );
  return {
    ...actual,
    seedConceptsToKV: vi.fn(async () => 42),
  };
});

import { handleConceptRoute } from "../src/domain/conceptHandler";

function makeEnv(demoApiKey: string) {
  return {
    SIGNALS_CACHE: {
      async put() {},
      async get() { return null; },
      async delete() {},
    } as unknown as KVNamespace,
    DB: {} as unknown as D1Database,
    DEMO_API_KEY: demoApiKey,
  };
}

function seedRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  return new Request("https://example.com/ucp/concepts/seed", {
    method: "POST",
    headers,
  });
}

describe("/ucp/concepts/seed auth — uses env.DEMO_API_KEY", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without Authorization header", async () => {
    const env = makeEnv("secret-value-A");
    const res = await handleConceptRoute(seedRequest(), env, "/ucp/concepts/seed");
    expect(res.status).toBe(401);
  });

  it("401 with wrong key", async () => {
    const env = makeEnv("secret-value-A");
    const res = await handleConceptRoute(
      seedRequest("Bearer wrong-value"),
      env,
      "/ucp/concepts/seed",
    );
    expect(res.status).toBe(401);
  });

  it("200 with the key matching env.DEMO_API_KEY", async () => {
    const env = makeEnv("secret-value-A");
    const res = await handleConceptRoute(
      seedRequest("Bearer secret-value-A"),
      env,
      "/ucp/concepts/seed",
    );
    expect(res.status).toBe(200);
  });

  it("pins the rotation behavior: changing env.DEMO_API_KEY changes which key works", async () => {
    // Same Authorization header, two different env.DEMO_API_KEY values.
    // Regression for the old hardcoded-string bug: if the auth check were
    // still comparing against a literal, rotating the env secret wouldn't
    // change the outcome here.
    const req = seedRequest("Bearer rotated-value-B");

    const envOld = makeEnv("secret-value-A");
    const resOld = await handleConceptRoute(req, envOld, "/ucp/concepts/seed");
    expect(resOld.status).toBe(401); // old key doesn't match

    const envNew = makeEnv("rotated-value-B");
    const resNew = await handleConceptRoute(req, envNew, "/ucp/concepts/seed");
    expect(resNew.status).toBe(200); // rotated key now accepted
  });

  it("accepts ApiKey scheme too (matches requireAuth semantics)", async () => {
    const env = makeEnv("secret-value-A");
    const res = await handleConceptRoute(
      seedRequest("ApiKey secret-value-A"),
      env,
      "/ucp/concepts/seed",
    );
    expect(res.status).toBe(200);
  });
});
