// src/domain/webhookSigning.ts
//
// HMAC-SHA256 signing for outbound activation webhooks.
//
// Header format:    X-AdCP-Signature: t=<unix-seconds>,v1=<hex-sha256>
// Signed string:    "<t>.<json-body>"
// Algorithm:        HMAC-SHA256 over UTF-8 bytes, hex-encoded output
//
// Why include t in the signed string: prevents trivial replay-by-resigning of
// an old body. Receivers SHOULD reject if `|now - t| > 5 minutes`. The
// timestamp doubles as a freshness check on the receiver side.
//
// Versioning: the `v1=` prefix lets us rotate the algorithm later
// (`v2=ed25519...`) without breaking receivers that pin to v1. Receivers
// that see only v1 today and want to verify SHOULD parse the comma-list
// rather than substring-matching the whole header.
//
// Secret provisioning: WEBHOOK_SIGNING_SECRET is an optional secret on the
// Worker. If unset, no signature header is added (preserves the current
// behavior — backwards compatible). Receivers that require signatures
// should ignore unsigned deliveries; receivers that don't care can verify
// when the header is present.

// Workers expose `crypto` globally; Node ≥18 does too via the Web Crypto API.
// Use the top-level binding (TypeScript's lib.dom types expose it directly)
// instead of dereferencing via globalThis, which TS narrows poorly under
// --lib webworker.
declare const crypto: Crypto;
const SUBTLE = crypto?.subtle;

export interface WebhookSignature {
  /** Header value to set on the outbound request. */
  headerValue: string;
  /** The Unix-seconds timestamp used in the signed string. */
  timestamp: number;
  /** The hex-encoded HMAC-SHA256 digest. */
  v1: string;
}

/**
 * Compute the X-AdCP-Signature header value for a webhook delivery.
 *
 * The body MUST be the exact UTF-8 byte sequence sent on the wire — a
 * receiver re-signs the raw request body and compares. Stringifying the
 * payload twice (once here, once on the wire) is a footgun, so callers
 * should `JSON.stringify` once and pass the same string to both this
 * function and the fetch body.
 *
 * @param secret  WEBHOOK_SIGNING_SECRET (any non-empty string)
 * @param body    The exact request body, as a UTF-8 string
 * @param nowSec  Optional clock override for testing — defaults to Date.now() / 1000
 */
export async function signWebhookBody(
  secret: string,
  body: string,
  nowSec?: number,
): Promise<WebhookSignature> {
  if (!SUBTLE) {
    throw new Error("crypto.subtle is unavailable — webhook signing requires Web Crypto");
  }
  const t = Math.floor(nowSec ?? Date.now() / 1000);
  const signedString = `${t}.${body}`;

  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret);
  const key = await SUBTLE.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await SUBTLE.sign("HMAC", key, encoder.encode(signedString));
  const v1 = bytesToHex(new Uint8Array(sigBuf));

  return {
    headerValue: `t=${t},v1=${v1}`,
    timestamp: t,
    v1,
  };
}

/**
 * Verify an X-AdCP-Signature header. Returns true on a clean match within
 * the freshness window. Provided so the live test runner (and any embedded
 * documentation example) can round-trip the signature without rolling its
 * own parser.
 *
 * @param tolerance Seconds — reject if |now - t| > tolerance. Default 300.
 */
export async function verifyWebhookSignature(
  secret: string,
  body: string,
  headerValue: string,
  opts: { tolerance?: number; nowSec?: number } = {},
): Promise<boolean> {
  const parsed = parseSignatureHeader(headerValue);
  if (!parsed) return false;

  const tolerance = opts.tolerance ?? 300;
  const now = Math.floor(opts.nowSec ?? Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const recomputed = await signWebhookBody(secret, body, parsed.timestamp);
  return constantTimeEqualHex(recomputed.v1, parsed.v1);
}

interface ParsedHeader {
  timestamp: number;
  v1: string;
}

function parseSignatureHeader(raw: string): ParsedHeader | null {
  // Format: t=<int>,v1=<hex>  (other v* schemes may follow in any order)
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of raw.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") {
      const n = Number(v);
      if (Number.isFinite(n)) t = n;
    } else if (k === "v1") {
      v1 = v;
    }
  }
  if (t === undefined || v1 === undefined) return null;
  return { timestamp: t, v1 };
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Length-aware constant-time hex compare. Same shape as routes/shared
 * `constantTimeEqual` but kept local to avoid depending on the routes layer
 * from the domain layer.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
