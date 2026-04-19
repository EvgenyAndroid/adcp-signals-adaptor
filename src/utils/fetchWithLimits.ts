// src/utils/fetchWithLimits.ts
//
// Bounded outbound fetch helper — timeout, response size cap, optional MIME
// allow-list. Used for outbound calls that talk to URLs the caller supplied
// (webhook_url on activation, creative.image_url on LinkedIn activation)
// where a remote can otherwise make the worker hang, download unbounded
// data, or hand us the wrong content type.
//
// Not a substitute for full SSRF defence. The Cloudflare edge already blocks
// worker egress to RFC1918 / loopback ranges, so the attacker-chosen URL
// can't reach internal services. What this guards against is the outbound
// side: a slow or oversized response chewing up worker CPU budget on a
// paid-egress path.

export interface FetchWithLimitsOptions extends RequestInit {
  /** Hard timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
}

/**
 * fetch() with a per-request AbortController timeout.
 *
 * Callers can bring their own `signal` — we chain it so either the external
 * cancellation or the timeout aborts the request.
 */
export async function fetchWithTimeout(
  url: string,
  opts: FetchWithLimitsOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`fetch timeout after ${timeoutMs}ms`)), timeoutMs);

  // Chain caller's signal, if any, into our controller.
  if (opts.signal) {
    if (opts.signal.aborted) {
      controller.abort(opts.signal.reason);
    } else {
      opts.signal.addEventListener("abort", () => controller.abort(opts.signal!.reason), { once: true });
    }
  }

  try {
    const { timeoutMs: _ignore, signal: _ignoreSignal, ...rest } = opts;
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface BoundedBufferOptions {
  /** Hard cap on body bytes read. Rejects (throws) past this size. */
  maxBytes: number;
  /** Allow-listed content-type prefixes, e.g. ["image/jpeg", "image/png"]. Optional. */
  allowedContentTypes?: string[];
}

export class BoundedFetchError extends Error {
  constructor(
    message: string,
    public readonly reason: "size_exceeded" | "bad_content_type" | "missing_content_type",
  ) {
    super(message);
    this.name = "BoundedFetchError";
  }
}

/**
 * Read an HTTP response into an ArrayBuffer, but refuse to load more than
 * `maxBytes` and optionally require the Content-Type to start with one of
 * `allowedContentTypes`.
 *
 * Two defences compose:
 *   1. Content-Length pre-check — reject upfront without reading the body.
 *   2. Streaming read with running byte count — catches servers that lie
 *      about Content-Length (or omit it entirely, e.g. chunked transfer).
 *
 * On violation we cancel the body reader so we don't continue draining the
 * socket. The caller gets a typed BoundedFetchError to distinguish size
 * vs MIME problems from regular HTTP errors.
 */
export async function readBoundedArrayBuffer(
  response: Response,
  opts: BoundedBufferOptions,
): Promise<ArrayBuffer> {
  if (opts.allowedContentTypes && opts.allowedContentTypes.length > 0) {
    const ct = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!ct) {
      throw new BoundedFetchError(
        `Response has no Content-Type (expected one of: ${opts.allowedContentTypes.join(", ")})`,
        "missing_content_type",
      );
    }
    const allowed = opts.allowedContentTypes.some((a) => ct.startsWith(a.toLowerCase()));
    if (!allowed) {
      throw new BoundedFetchError(
        `Unexpected Content-Type "${ct}" (expected one of: ${opts.allowedContentTypes.join(", ")})`,
        "bad_content_type",
      );
    }
  }

  // Pre-check on Content-Length if the server supplied one.
  const lenHeader = response.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > opts.maxBytes) {
      throw new BoundedFetchError(
        `Response size ${len} exceeds limit ${opts.maxBytes}`,
        "size_exceeded",
      );
    }
  }

  // Stream the body. If the server lied about Content-Length (or omitted it,
  // which is legal for chunked encoding), we still catch oversize here.
  if (!response.body) {
    return new ArrayBuffer(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        // Best-effort cancel so we don't keep draining the socket.
        await reader.cancel().catch(() => undefined);
        throw new BoundedFetchError(
          `Response body exceeds limit ${opts.maxBytes} (read ${total} bytes)`,
          "size_exceeded",
        );
      }
      chunks.push(value);
    }
  } finally {
    // releaseLock can throw if the reader is already canceled; ignore.
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}
