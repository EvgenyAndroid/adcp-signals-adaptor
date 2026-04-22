// src/routes/shared.ts
// Shared HTTP helpers for route handlers.

import type { ApiError } from "../types/api";

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-AdCP-Provider": "adcp-signals-adaptor-demo",
      "X-AdCP-Version": "3.0",
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  const body: ApiError = {
    error: message,
    code,
    ...(details !== undefined ? { details } : {}),
  };
  return jsonResponse(body, status);
}

/**
 * Result of attempting to parse a JSON request body. Three distinct cases:
 *   - empty   : caller sent no body (e.g. GET, or POST with content-length 0)
 *   - parsed  : body was valid JSON, returned as `data`
 *   - invalid : body was non-empty but didn't parse — caller probably has a bug
 *
 * The caller decides what to do per-case. Most search/list routes treat
 * empty as "no filters" and parsed as "use these filters"; both should
 * succeed. invalid is the case that previously got silently coerced to
 * empty (returning unfiltered results for malformed POSTs) — the new
 * shape forces routes to handle it explicitly, typically as 400.
 */
export type JsonBodyResult<T> =
  | { kind: "empty" }
  | { kind: "parsed"; data: T }
  | { kind: "invalid"; reason: string };

export async function readJsonBody<T>(request: Request): Promise<JsonBodyResult<T>> {
  const cl = request.headers.get("content-length");
  if (cl === "0") return { kind: "empty" };

  // Read the raw text once so we can tell empty-but-no-content-length apart
  // from non-empty-but-malformed. request.json() throws on both, which is
  // why the old parseJsonBody collapsed them.
  let raw: string;
  try {
    raw = await request.text();
  } catch (e) {
    return { kind: "invalid", reason: `body read failed: ${String(e)}` };
  }
  if (raw.length === 0) return { kind: "empty" };

  try {
    return { kind: "parsed", data: JSON.parse(raw) as T };
  } catch (e) {
    return { kind: "invalid", reason: `body is not valid JSON: ${String(e)}` };
  }
}

/**
 * @deprecated Use `readJsonBody` to distinguish empty vs malformed. This
 * helper silently treats a malformed body as `null` (same as no body),
 * which can cause routes to ignore caller bugs. Kept for back-compat
 * during the migration window.
 */
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function requireAuth(request: Request, expectedKey: string): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  // Support both "Bearer <key>" and "ApiKey <key>"
  const match = authHeader.match(/^(?:Bearer|ApiKey)\s+(.+)$/i);
  if (!match) return false;
  return constantTimeEqual(match[1] ?? "", expectedKey);
}

/**
 * Length-independent constant-time string compare.
 * Compares against the longer of the two strings (zero-padded conceptually
 * via XOR of indexed bytes) so both length and content leak no information.
 * Sufficient for short shared-secret tokens; not a substitute for HMAC.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
