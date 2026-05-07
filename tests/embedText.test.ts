// tests/embedText.test.ts
//
// Pin the contract for POST /ucp/embed-text — the text → 512-d vector
// transcoder behind the Embedding Lab "Transcode" button.
//
// Tests target the pseudo engine path (no OPENAI_API_KEY) so the
// vector output is fully deterministic — same input → same vector
// across runs and isolates. The live OpenAI path isn't tested here
// (would need network + key).

import { describe, it, expect } from "vitest";
import { handleEmbedText } from "../src/routes/embedText";
import { createLogger } from "../src/utils/logger";

function fakeEnv(): never {
  // No EMBEDDING_ENGINE / OPENAI_API_KEY → factory returns the
  // PseudoEmbeddingEngine, which is deterministic.
  return {} as never;
}
function fakeRequest(body: unknown, method = "POST"): Request {
  // GET/HEAD can't carry a body per the spec, so omit it for those.
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("https://example.com/ucp/embed-text", init);
}

describe("POST /ucp/embed-text", () => {
  const logger = createLogger("test-req");

  it("happy path: text input → 512-d vector + space_id metadata", async () => {
    const res = await handleEmbedText(fakeRequest({ text: "luxury auto intenders" }), fakeEnv(), logger);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.dim).toBe(512);
    expect(Array.isArray(body.vector)).toBe(true);
    expect((body.vector as number[]).length).toBe(512);
    expect(body.space_id).toBe("adcp-bridge-space-v1.0");
    expect(body.engine_phase).toBe("pseudo-v1");
    expect(body.model_label).toBe("adcp-bridge-pseudo-v1.0");
    expect(body.input_text).toBe("luxury auto intenders");
    expect(typeof body.duration_ms).toBe("number");
  });

  it("pseudo engine is deterministic — same input → same vector across calls", async () => {
    const res1 = await handleEmbedText(fakeRequest({ text: "soccer moms 35-44" }), fakeEnv(), logger);
    const res2 = await handleEmbedText(fakeRequest({ text: "soccer moms 35-44" }), fakeEnv(), logger);
    const v1 = (await res1.json() as { vector: number[] }).vector;
    const v2 = (await res2.json() as { vector: number[] }).vector;
    expect(v1).toEqual(v2);
  });

  it("different inputs produce different vectors (sanity)", async () => {
    const res1 = await handleEmbedText(fakeRequest({ text: "alpha" }), fakeEnv(), logger);
    const res2 = await handleEmbedText(fakeRequest({ text: "beta" }), fakeEnv(), logger);
    const v1 = (await res1.json() as { vector: number[] }).vector;
    const v2 = (await res2.json() as { vector: number[] }).vector;
    expect(v1).not.toEqual(v2);
  });

  it("output vector is L2-normalized (norm ≈ 1.0)", async () => {
    const res = await handleEmbedText(fakeRequest({ text: "norm check" }), fakeEnv(), logger);
    const v = (await res.json() as { vector: number[] }).vector;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });

  it("text input is trimmed before embedding (whitespace doesn't change vector)", async () => {
    const r1 = await handleEmbedText(fakeRequest({ text: "trim me" }), fakeEnv(), logger);
    const r2 = await handleEmbedText(fakeRequest({ text: "  trim me  \n" }), fakeEnv(), logger);
    const v1 = (await r1.json() as { vector: number[] }).vector;
    const v2 = (await r2.json() as { vector: number[] }).vector;
    expect(v1).toEqual(v2);
  });

  it("empty body → 400 INVALID_BODY", async () => {
    const res = await handleEmbedText(fakeRequest({}), fakeEnv(), logger);
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string; error: string };
    expect(body.code).toBe("INVALID_BODY");
  });

  it("whitespace-only text → 400 INVALID_BODY", async () => {
    const res = await handleEmbedText(fakeRequest({ text: "   \n\t" }), fakeEnv(), logger);
    expect(res.status).toBe(400);
  });

  it("text exceeding 4 KB cap → 400 INVALID_BODY", async () => {
    const longText = "x".repeat(4_097);
    const res = await handleEmbedText(fakeRequest({ text: longText }), fakeEnv(), logger);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("text too long");
  });

  it("non-POST → 405", async () => {
    const res = await handleEmbedText(fakeRequest({ text: "x" }, "GET"), fakeEnv(), logger);
    expect(res.status).toBe(405);
  });

  it("input_text > 200 chars is truncated in response (full text still embedded)", async () => {
    const longish = "a".repeat(250);
    const res = await handleEmbedText(fakeRequest({ text: longish }), fakeEnv(), logger);
    const body = await res.json() as { input_text: string; vector: number[] };
    expect(body.input_text.length).toBeLessThanOrEqual(202);  // 200 + ellipsis
    expect(body.input_text.endsWith("…")).toBe(true);
    expect(body.vector.length).toBe(512);  // full text embedded regardless
  });
});
