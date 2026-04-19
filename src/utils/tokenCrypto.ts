// src/utils/tokenCrypto.ts
//
// AES-GCM envelope encryption for secrets stored in KV at rest.
//
// Threat model: a KV dump (misconfigured binding, a compromised dashboard
// session, a read-only dev binding accidentally bound to prod) would
// otherwise expose the LinkedIn access/refresh tokens in plaintext. We
// can't keep a KV binding from being readable, but we can make what's
// inside useless without the Worker secret.
//
// Format on disk:
//   "enc:v1:" + base64url(iv || ciphertext)
//
// * `enc:v1:` prefix — lets the reader distinguish encrypted values from
//   legacy plaintext written before this helper shipped, and lets us rotate
//   the scheme (enc:v2:…) without ambiguity.
// * iv — 12 random bytes, required by AES-GCM, generated per write.
// * ciphertext — includes the 128-bit auth tag appended by Web Crypto's
//   AES-GCM implementation, so we don't store a separate tag.
//
// The caller passes a raw passphrase (env.TOKEN_ENCRYPTION_KEY). We derive
// a 256-bit AES key via SHA-256 so operators can `wrangler secret put`
// any string they like rather than having to produce 32 raw bytes.

const PREFIX = "enc:v1:";

declare const crypto: Crypto;

/**
 * Returns true if `raw` looks like a value previously written by
 * `encryptToken`. Anything else is assumed to be legacy plaintext.
 */
export function isEncrypted(raw: string | null | undefined): boolean {
  return !!raw && raw.startsWith(PREFIX);
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passphrase),
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(plaintext: string, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);

  return PREFIX + bytesToBase64Url(combined);
}

/**
 * Decrypt a value produced by `encryptToken`. Throws if the value isn't
 * encrypted, if the passphrase is wrong, or if the ciphertext is tampered
 * (AES-GCM integrity check fails).
 */
export async function decryptToken(encrypted: string, passphrase: string): Promise<string> {
  if (!isEncrypted(encrypted)) {
    throw new Error("Value is not enc:v1: — cannot decrypt");
  }
  const combined = base64UrlToBytes(encrypted.slice(PREFIX.length));
  if (combined.length < 13) {
    // 12-byte IV + at least one byte of ciphertext (plus tag)
    throw new Error("Encrypted payload truncated");
  }
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await deriveKey(passphrase);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * Convenience read: decrypt an enc:v1: value, or return a legacy plaintext
 * value unchanged. Used during the one-time migration window where KV may
 * contain values written before the encryption patch landed.
 *
 * Pass `null`/`undefined` through unchanged so callers can keep their
 * existing null-checks.
 */
export async function decryptIfNeeded(
  raw: string | null | undefined,
  passphrase: string | undefined,
): Promise<string | null> {
  if (raw == null || raw === "") return null;
  if (!isEncrypted(raw)) return raw; // legacy plaintext — return as-is
  if (!passphrase) {
    throw new Error(
      "KV value is encrypted but TOKEN_ENCRYPTION_KEY is not configured",
    );
  }
  return decryptToken(raw, passphrase);
}

/**
 * Convenience write: encrypt when a passphrase is configured, otherwise
 * write plaintext. Pairing with `decryptIfNeeded` means the feature is
 * opt-in via `wrangler secret put TOKEN_ENCRYPTION_KEY` — unset ⇒ legacy
 * behavior.
 */
export async function encryptIfConfigured(
  plaintext: string,
  passphrase: string | undefined,
): Promise<string> {
  if (!passphrase) return plaintext;
  return encryptToken(plaintext, passphrase);
}

// ─── base64url (standard base64 minus padding, URL-safe charset) ─────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  // Restore padding and standard alphabet
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
