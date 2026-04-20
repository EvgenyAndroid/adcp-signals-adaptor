// tests/operatorId.test.ts
// Sec-18: bearer-token → operator_id derivation. Three properties matter:
//   1. Determinism — same token always produces the same ID.
//   2. Isolation  — different tokens produce different IDs (no collision
//      in any plausible operator count).
//   3. One-way    — the ID can be logged / used as a KV key suffix
//      without leaking the bearer token.

import { describe, it, expect } from "vitest";
import { deriveOperatorId, operatorIdFromRequest } from "../src/utils/operatorId";

describe("deriveOperatorId", () => {
  it("is deterministic — same token, same ID, every call", async () => {
    const id1 = await deriveOperatorId("demo-key-adcp-signals-v1");
    const id2 = await deriveOperatorId("demo-key-adcp-signals-v1");
    const id3 = await deriveOperatorId("demo-key-adcp-signals-v1");
    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it("returns 12 base64url chars (72 bits, no padding)", async () => {
    const id = await deriveOperatorId("any-token");
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("different tokens → different IDs", async () => {
    const a = await deriveOperatorId("operator-A-key");
    const b = await deriveOperatorId("operator-B-key");
    const c = await deriveOperatorId("operator-C-key");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("near-identical tokens produce avalanche-different IDs", async () => {
    // SHA-256 cascade — single-byte change should redistribute every output bit.
    const a = await deriveOperatorId("demo-key-adcp-signals-v1");
    const b = await deriveOperatorId("demo-key-adcp-signals-v2"); // last char different
    expect(a).not.toBe(b);
    // Strong-property check: at least 4 chars differ in the 12-char output.
    let diffChars = 0;
    for (let i = 0; i < 12; i++) if (a[i] !== b[i]) diffChars++;
    expect(diffChars).toBeGreaterThanOrEqual(4);
  });

  it("does NOT contain the bearer token (one-way)", async () => {
    const bearer = "secret-bearer-do-not-leak";
    const id = await deriveOperatorId(bearer);
    expect(id).not.toContain(bearer);
    expect(id).not.toContain("secret");
    expect(id).not.toContain("bearer");
  });

  it("rejects empty / non-string input", async () => {
    await expect(deriveOperatorId("")).rejects.toThrow(/non-empty string/);
    await expect(deriveOperatorId(undefined as unknown as string)).rejects.toThrow();
  });
});

describe("operatorIdFromRequest", () => {
  function makeReq(authHeader?: string): Request {
    const headers = new Headers();
    if (authHeader) headers.set("Authorization", authHeader);
    return new Request("https://example.com/", { headers });
  }

  it("derives ID from a Bearer header", async () => {
    const id = await operatorIdFromRequest(makeReq("Bearer demo-key-adcp-signals-v1"));
    const expected = await deriveOperatorId("demo-key-adcp-signals-v1");
    expect(id).toBe(expected);
  });

  it("accepts ApiKey scheme too (matches requireAuth semantics)", async () => {
    const id = await operatorIdFromRequest(makeReq("ApiKey demo-key-adcp-signals-v1"));
    const expected = await deriveOperatorId("demo-key-adcp-signals-v1");
    expect(id).toBe(expected);
  });

  it("returns null when Authorization header is absent", async () => {
    expect(await operatorIdFromRequest(makeReq())).toBe(null);
  });

  it("returns null on malformed Authorization header", async () => {
    expect(await operatorIdFromRequest(makeReq("Basic abc"))).toBe(null);
    expect(await operatorIdFromRequest(makeReq("just-a-token"))).toBe(null);
  });
});
