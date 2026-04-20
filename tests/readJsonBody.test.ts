// tests/readJsonBody.test.ts
// Sec-13: readJsonBody distinguishes empty / parsed / invalid bodies so
// routes can reject malformed POSTs with 400 instead of silently treating
// them as no-body and serving full unfiltered results.

import { describe, it, expect } from "vitest";
import { readJsonBody } from "../src/routes/shared";

function req(body: BodyInit | null, init: RequestInit = {}): Request {
  return new Request("https://example.com/", { method: "POST", body, ...init });
}

describe("readJsonBody", () => {
  it("empty body (POST with no payload) → kind: 'empty'", async () => {
    const result = await readJsonBody(req(null));
    expect(result.kind).toBe("empty");
  });

  it("explicit empty string → kind: 'empty'", async () => {
    const result = await readJsonBody(req(""));
    expect(result.kind).toBe("empty");
  });

  it("Content-Length: 0 short-circuits → kind: 'empty'", async () => {
    const r = new Request("https://example.com/", {
      method: "POST",
      headers: { "content-length": "0" },
    });
    const result = await readJsonBody(r);
    expect(result.kind).toBe("empty");
  });

  it("valid JSON → kind: 'parsed' with data", async () => {
    const result = await readJsonBody<{ q: string }>(req(JSON.stringify({ q: "test" })));
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.data.q).toBe("test");
    }
  });

  it("malformed JSON → kind: 'invalid' with reason", async () => {
    // The bug this pin: previously parseJsonBody returned null here, and
    // search routes treated null the same as empty → returned full
    // unfiltered catalog. Now the route can reject with 400.
    const result = await readJsonBody(req("not json"));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toMatch(/not valid JSON/);
    }
  });

  it("JSON with extra trailing chars → invalid (strict parse)", async () => {
    const result = await readJsonBody(req('{"a":1}garbage'));
    expect(result.kind).toBe("invalid");
  });

  it("a parsed `null` value is still 'parsed', not 'empty'", async () => {
    // null is a valid JSON document; "no body" and "body that says null"
    // are different things and should not collapse.
    const result = await readJsonBody(req("null"));
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.data).toBe(null);
    }
  });

  it("nested objects parse correctly", async () => {
    const payload = { q: "x", filters: { a: 1, b: ["y", "z"] } };
    const result = await readJsonBody<typeof payload>(req(JSON.stringify(payload)));
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.data.filters.b).toEqual(["y", "z"]);
    }
  });
});
