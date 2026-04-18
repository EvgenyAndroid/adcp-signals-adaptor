// src/routes/shared.ts
// Shared HTTP helpers for route handlers.

import type { ApiError } from "../types/api";

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-AdCP-Provider": "adcp-signals-adaptor-demo",
      "X-AdCP-Version": "3.0-rc",
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
