// src/utils/operatorId.ts
//
// Sec-18: derive a stable per-operator identifier from an inbound bearer
// token, used to namespace operator-scoped resources (LinkedIn OAuth
// tokens, OAuth state binding, future per-tenant data).
//
// Threat model: the bearer token IS the operator identity in this auth
// model — anyone holding the token can authenticate as the operator that
// owns it. We extend that to "your token hashes to your operator ID."
// Same token → same ID across all calls. Different tokens → different
// IDs, automatic isolation.
//
// Why this lets us go multi-operator without a registry:
//   - Today: one DEMO_API_KEY → one operator_id. Single-operator
//     deployment behaves as before; tokens land in one namespace.
//   - Tomorrow: provision a second secret with a different value, give
//     it to the second operator. They authenticate, derive their own
//     operator_id, and their LinkedIn tokens land in a separate
//     namespace. No code change, no admin UI.
//
// Why we hash rather than use the bearer directly:
//   - The bearer is the secret. Embedding it in KV keys / logs would
//     leak it sideways (KV dumps, log aggregators).
//   - The hash is one-way; even if leaked, an attacker can't recover
//     the bearer from `operator_id`.
//   - Hash truncated to 12 base64url chars (72 bits) — enough namespace
//     to make collision negligible (2^36 operators before a 50%
//     collision, vastly more than this product will ever support) while
//     keeping KV keys + log lines compact.

declare const crypto: Crypto;

const ID_BYTES = 9; // 9 raw bytes → 12 base64url chars

/**
 * Stable per-operator identifier derived from a bearer token.
 *
 * Returns a 12-character base64url string. Deterministic — same token
 * always produces the same ID. Truncated SHA-256 (72 bits) is enough
 * collision space for any plausible operator count.
 *
 * Use the returned ID as a KV-key suffix or DB column to scope
 * per-operator resources. NEVER log the bearer; the operator_id is
 * safe to log because it's a one-way derivative.
 */
export async function deriveOperatorId(bearerToken: string): Promise<string> {
  if (!bearerToken || typeof bearerToken !== "string") {
    throw new Error("deriveOperatorId: bearer token must be a non-empty string");
  }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearerToken));
  const bytes = new Uint8Array(buf, 0, ID_BYTES);
  return bytesToBase64Url(bytes);
}

/**
 * Convenience: pull the bearer from `Authorization: Bearer <token>` and
 * derive the operator ID. Returns null if the header is missing or
 * malformed (caller should already have rejected unauth requests via
 * the top-level auth gate; this is a defensive null).
 */
export async function operatorIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^(?:Bearer|ApiKey)\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return deriveOperatorId(match[1]);
}

// ─── base64url helper ────────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
