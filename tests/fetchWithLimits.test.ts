// tests/fetchWithLimits.test.ts
// Unit tests for the bounded outbound fetch helpers introduced in Sec-2.
//
// We don't hit the network — the tests construct in-memory Response objects
// with ReadableStream bodies and feed them through readBoundedArrayBuffer.
// fetchWithTimeout is tested against a mocked global fetch.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchWithTimeout,
  readBoundedArrayBuffer,
  BoundedFetchError,
} from "../src/utils/fetchWithLimits";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

function responseWith(
  body: ReadableStream<Uint8Array> | ArrayBuffer | string | null,
  init: ResponseInit & { headers?: Record<string, string> } = {},
): Response {
  return new Response(body as BodyInit | null, init);
}

describe("readBoundedArrayBuffer", () => {
  it("reads a small body within the cap", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const res = responseWith(streamOf([bytes]), {
      headers: { "content-type": "image/jpeg", "content-length": String(bytes.length) },
    });
    const buf = await readBoundedArrayBuffer(res, { maxBytes: 100 });
    expect(new Uint8Array(buf)).toEqual(bytes);
  });

  it("rejects upfront when Content-Length exceeds maxBytes", async () => {
    const res = responseWith(streamOf([new Uint8Array(10)]), {
      headers: { "content-type": "image/jpeg", "content-length": "999999" },
    });
    await expect(
      readBoundedArrayBuffer(res, { maxBytes: 100 }),
    ).rejects.toMatchObject({
      name: "BoundedFetchError",
      reason: "size_exceeded",
    });
  });

  it("catches servers that lie about Content-Length (streams past the cap)", async () => {
    // Server says 10 bytes but sends 1000. The streaming counter catches it.
    const big = new Uint8Array(1000);
    const res = responseWith(streamOf([big]), {
      headers: { "content-type": "image/jpeg", "content-length": "10" },
    });
    await expect(
      readBoundedArrayBuffer(res, { maxBytes: 100 }),
    ).rejects.toMatchObject({ reason: "size_exceeded" });
  });

  it("catches chunked-encoding responses with no Content-Length header", async () => {
    const chunks = [new Uint8Array(60), new Uint8Array(60), new Uint8Array(60)];
    const res = responseWith(streamOf(chunks), {
      headers: { "content-type": "image/png" }, // no content-length
    });
    await expect(
      readBoundedArrayBuffer(res, { maxBytes: 100 }),
    ).rejects.toMatchObject({ reason: "size_exceeded" });
  });

  it("enforces Content-Type allow-list (exact prefix match)", async () => {
    const res = responseWith(streamOf([new Uint8Array(5)]), {
      headers: { "content-type": "application/octet-stream" },
    });
    await expect(
      readBoundedArrayBuffer(res, {
        maxBytes: 100,
        allowedContentTypes: ["image/jpeg", "image/png"],
      }),
    ).rejects.toMatchObject({
      reason: "bad_content_type",
    });
  });

  it("allows content types with charset/parameter suffix", async () => {
    const res = responseWith(streamOf([new Uint8Array(5)]), {
      headers: { "content-type": "image/jpeg; charset=binary" },
    });
    const buf = await readBoundedArrayBuffer(res, {
      maxBytes: 100,
      allowedContentTypes: ["image/jpeg"],
    });
    expect(buf.byteLength).toBe(5);
  });

  it("rejects missing Content-Type when an allow-list is provided", async () => {
    const res = responseWith(streamOf([new Uint8Array(5)]), {
      headers: {},
    });
    await expect(
      readBoundedArrayBuffer(res, {
        maxBytes: 100,
        allowedContentTypes: ["image/jpeg"],
      }),
    ).rejects.toMatchObject({ reason: "missing_content_type" });
  });

  it("handles an empty body cleanly", async () => {
    const res = responseWith(null, { headers: { "content-type": "image/jpeg" } });
    const buf = await readBoundedArrayBuffer(res, {
      maxBytes: 100,
      allowedContentTypes: ["image/jpeg"],
    });
    expect(buf.byteLength).toBe(0);
  });
});

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the response when fetch resolves within the timeout", async () => {
    const expected = new Response("hello");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(expected);
    const res = await fetchWithTimeout("https://example.com/", { timeoutMs: 5000 });
    expect(await res.text()).toBe("hello");
    // Verify the upstream fetch received our signal
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("aborts and propagates when the timer expires before fetch resolves", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener("abort", () => {
            reject(signal.reason ?? new Error("aborted"));
          });
        }),
    );
    await expect(
      fetchWithTimeout("https://example.com/", { timeoutMs: 20 }),
    ).rejects.toThrow(/timeout after 20ms/);
  });

  it("honours a caller-supplied signal that is already aborted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const signal = (init as RequestInit).signal!;
      if (signal.aborted) {
        return Promise.reject(signal.reason ?? new Error("aborted"));
      }
      return new Promise((_r, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    });
    const ac = new AbortController();
    ac.abort(new Error("caller cancelled"));
    await expect(
      fetchWithTimeout("https://example.com/", { timeoutMs: 5000, signal: ac.signal }),
    ).rejects.toThrow(/caller cancelled/);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("does not leak the timer into the returned promise on success", async () => {
    // Regression for clearTimeout in finally. If we forgot it, this test
    // would hang — the event loop wouldn't exit until 10_000 ms elapsed.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const start = Date.now();
    await fetchWithTimeout("https://example.com/", { timeoutMs: 10_000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

describe("BoundedFetchError", () => {
  it("preserves reason on the typed error", () => {
    const err = new BoundedFetchError("too big", "size_exceeded");
    expect(err.name).toBe("BoundedFetchError");
    expect(err.reason).toBe("size_exceeded");
    expect(err.message).toBe("too big");
  });
});
