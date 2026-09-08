// src/domain/webhookSigning.ts
//
// RFC 9421 HTTP Message Signatures for outbound webhooks — the AdCP
// `adcp/webhook-signing/v1` profile. Closes #248: replaces the
// HMAC-SHA256 `X-AdCP-Signature: t=…,v1=…` scheme this module used to
// implement, which the GA capability profile never permitted
// (`webhook_signing.algorithms` is ed25519 / ecdsa-p256-sha256 only) and
// which AdCP 4.0 removes outright (`legacy_hmac_fallback` deleted).
//
// WIRE FORMAT (what a receiver sees on every delivery):
//
//   Content-Digest:  sha-256=:<base64 SHA-256 of the exact body>:
//   Signature-Input: sig1=("@method" "@target-uri" "@authority"
//                          "content-type" "content-digest")
//                    ;created=<unix>;expires=<unix+300>;nonce="<22 chars>"
//                    ;keyid="<kid>";alg="ed25519"
//                    ;tag="adcp/webhook-signing/v1"
//   Signature:       sig1=:<base64url Ed25519 over the signature base>:
//
// Those five covered components are the profile's mandatory minimum; the
// `tag` is what separates a webhook signature from a request signature
// made with the same key. The public half of the key is served at
// /.well-known/jwks.json, discovered via /.well-known/brand.json
// `agents[].jwks_uri`, which `get_adcp_capabilities` points at through
// `identity.brand_json_url` (see src/routes/brandJson.ts).
//
// WHY THE SDK'S CANONICALIZER AND OUR OWN CRYPTO. Two halves, deliberately
// split:
//
//   1. Canonicalization — the signature base, `Content-Digest`, and the
//      exact `Signature-Input` serialization — comes from
//      `@adcp/sdk/signing/client`'s `prepareWebhookSignature` /
//      `finalizeRequestSignature`. That is the same code the AAO grader's
//      verifier is built against, and byte-exactness is the whole game:
//      one stray space in the base and every signature is invalid. Verified
//      against the official conformance vectors in tests/webhookSigning.test.ts
//      — every Ed25519 positive vector reproduces base, digest, input, and
//      signature bit-for-bit.
//
//   2. The Ed25519 signature itself comes from Web Crypto
//      (`crypto.subtle.sign("Ed25519", …)`), not the SDK's sync `signWebhook`.
//      That helper calls Node's `crypto.sign`, which we don't want a
//      Cloudflare Worker to depend on even under nodejs_compat; Web Crypto
//      Ed25519 is native in workerd and in Node ≥ 18, so the same code path
//      runs in production and under vitest. This is exactly the shape the
//      SDK designed for KMS/HSM deployments (`signWebhookAsync` + a
//      `SigningProvider`), minus the async indirection.
//
// KEY PROVISIONING. One Worker secret, `WEBHOOK_SIGNING_PRIVATE_JWK`: a
// JSON private JWK —
//
//   { "kid": "…", "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA",
//     "use": "sig", "key_ops": ["sign"], "adcp_use": "request-signing",
//     "x": "<base64url>", "d": "<base64url>" }
//
// The public JWK served at jwks.json is DERIVED from it (drop `d`, flip
// key_ops to ["verify"]) so no key material is ever committed — rotation is
// a secret update with a new `kid`. `adcp_use` is "request-signing" per the
// spec's webhook-signing README: webhooks sign with the request-signing
// key and rely on the `tag` for domain separation; "webhook-signing" is the
// deprecated value (adcontextprotocol/adcp#5555) and is still accepted here
// so an older key keeps working.
//
// TWO LAYERS OF VALIDATION, and why both. `loadWebhookSigningKey` is a
// synchronous SHAPE check (JSON, kty/crv, kid, 32-byte x and d, purpose).
// `resolveWebhookSigning` additionally PROVES the pair: it signs a fixed
// probe with `d` and verifies it with `x`. Without that, a secret assembled
// from two different keys — x from one, d from another — would load, be
// published at jwks.json, and advertise `supported: true` while every
// signature it produced failed at the receiver. The proof is memoized per
// secret for the life of the isolate (one sign + one verify, ever), which
// also means the Web Crypto import happens once rather than per request.
// Every production caller goes through `resolveWebhookSigning`; the sync
// loader is for tests and for callers that only need the shape.
//
// Unset ⇒ deliveries go out unsigned, jwks.json serves `keys: []`, and
// get_adcp_capabilities declares `webhook_signing.supported: false` — the
// honest posture, and the storyboard's `signing_keys_published` phase says
// so loudly. A PRESENT-but-unusable secret (malformed, or a mismatched
// pair) is logged as `webhook_signing_key_invalid` and yields the same
// unsigned posture rather than an exception on every request; the deploy
// workflow (.github/workflows/deploy.yml) fails closed on a malformed
// secret before deploying, and its post-deploy smoke test turns a
// provisioned-but-unpublished kid into a red run (visible, not a rollback).

import {
  prepareWebhookSignature,
  finalizeRequestSignature,
  type AdcpJsonWebKey,
  type SignedRequest,
} from "@adcp/sdk/signing/client";

// Workers expose `crypto` globally; Node ≥ 18 does too via the Web Crypto
// API. Declared explicitly rather than read off globalThis, which TS narrows
// poorly under --lib webworker.
declare const crypto: Crypto;

/** Signature validity window. The spec's verifier rejects anything > 300s. */
export const SIGNATURE_WINDOW_SECONDS = 300;

/** The webhook profile tag — verifiers reject any other value. */
export const WEBHOOK_SIGNING_TAG = "adcp/webhook-signing/v1";

/** Purposes a webhook-signing key may carry. Canonical first. */
const WEBHOOK_VALID_ADCP_USE = ["request-signing", "webhook-signing"] as const;
export type WebhookAdcpUse = (typeof WEBHOOK_VALID_ADCP_USE)[number];

/** 32 raw bytes as unpadded base64url — the only legal length for Ed25519 x/d. */
const ED25519_COORD = /^[A-Za-z0-9_-]{43}$/;
const KID = /^[A-Za-z0-9_.:-]{1,200}$/;

export interface PrivateEd25519Jwk {
  kid: string;
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  d: string;
  adcp_use: WebhookAdcpUse;
  alg?: string;
  use?: string;
  key_ops?: string[];
}

/**
 * Extends the SDK's JWK type so the published key drops straight into a
 * `StaticJwksResolver` / `createWebhookVerifier` on the receiving side.
 */
export interface PublicEd25519Jwk extends AdcpJsonWebKey {
  kid: string;
  kty: "OKP";
  crv: "Ed25519";
  alg: "EdDSA";
  use: "sig";
  key_ops: ["verify"];
  adcp_use: WebhookAdcpUse;
  x: string;
}

/**
 * A loaded, shape-validated signing key. Opaque on purpose: the private
 * scalar lives only inside `privateJwk`, which nothing here logs or
 * serializes. Shape-valid is not yet proven — see `resolveWebhookSigning`.
 */
export interface WebhookSigningKey {
  readonly kid: string;
  readonly adcpUse: WebhookAdcpUse;
  readonly privateJwk: PrivateEd25519Jwk;
}

export class WebhookSigningKeyError extends Error {
  constructor(message: string) {
    super(`WEBHOOK_SIGNING_PRIVATE_JWK: ${message}`);
    this.name = "WebhookSigningKeyError";
  }
}

type KeyLogger = { error(event: string, fields?: Record<string, unknown>): void };

/**
 * Parse and shape-validate the `WEBHOOK_SIGNING_PRIVATE_JWK` secret.
 *
 * Returns null when the secret is absent or empty (unsigned posture).
 * THROWS `WebhookSigningKeyError` when it is present but not a
 * well-formed Ed25519 private JWK — a misconfigured production secret must
 * not degrade silently into "unsigned". Does NOT prove x matches d; use
 * `resolveWebhookSigning` for that.
 */
export function loadWebhookSigningKey(raw: string | undefined | null): WebhookSigningKey | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new WebhookSigningKeyError("not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WebhookSigningKeyError("must be a JSON object (a private JWK)");
  }
  const j = parsed as Record<string, unknown>;

  if (j["kty"] !== "OKP") throw new WebhookSigningKeyError(`kty must be "OKP" (got ${JSON.stringify(j["kty"])})`);
  if (j["crv"] !== "Ed25519") throw new WebhookSigningKeyError(`crv must be "Ed25519" (got ${JSON.stringify(j["crv"])})`);
  const kid = j["kid"];
  if (typeof kid !== "string" || !KID.test(kid)) {
    throw new WebhookSigningKeyError("kid must be a non-empty string of [A-Za-z0-9_.:-], ≤ 200 chars");
  }
  const x = j["x"];
  if (typeof x !== "string" || !ED25519_COORD.test(x)) {
    throw new WebhookSigningKeyError("x must be 32 bytes as unpadded base64url (43 chars)");
  }
  const d = j["d"];
  if (typeof d !== "string" || !ED25519_COORD.test(d)) {
    throw new WebhookSigningKeyError("d (private scalar) must be 32 bytes as unpadded base64url (43 chars)");
  }
  const adcpUse = j["adcp_use"];
  if (typeof adcpUse !== "string" || !(WEBHOOK_VALID_ADCP_USE as readonly string[]).includes(adcpUse)) {
    throw new WebhookSigningKeyError(
      `adcp_use must be one of ${WEBHOOK_VALID_ADCP_USE.map((u) => JSON.stringify(u)).join(", ")} ` +
        `(got ${JSON.stringify(adcpUse)}) — verifiers reject other purposes at step 8`,
    );
  }
  if (j["key_ops"] !== undefined) {
    const ops = j["key_ops"];
    if (!Array.isArray(ops) || !ops.includes("sign")) {
      throw new WebhookSigningKeyError('key_ops, when present, must include "sign"');
    }
  }

  const privateJwk: PrivateEd25519Jwk = {
    kid,
    kty: "OKP",
    crv: "Ed25519",
    x,
    d,
    adcp_use: adcpUse as WebhookAdcpUse,
    ...(typeof j["alg"] === "string" ? { alg: j["alg"] } : {}),
    ...(typeof j["use"] === "string" ? { use: j["use"] } : {}),
    ...(Array.isArray(j["key_ops"])
      ? { key_ops: (j["key_ops"] as unknown[]).filter((o): o is string => typeof o === "string") }
      : {}),
  };
  return { kid, adcpUse: adcpUse as WebhookAdcpUse, privateJwk };
}

/**
 * Sync, shape-only, fail-safe: absent ⇒ null; malformed ⇒ logged error and
 * null. Does not prove the pair — production code should prefer
 * `resolveWebhookSigning`. Kept for callers that cannot await and for tests.
 */
export function webhookSigningFromEnv(
  env: { WEBHOOK_SIGNING_PRIVATE_JWK?: string | undefined },
  logger?: KeyLogger,
): WebhookSigningKey | null {
  try {
    return loadWebhookSigningKey(env.WEBHOOK_SIGNING_PRIVATE_JWK);
  } catch (err) {
    reportInvalid(err instanceof Error ? err.message : String(err), logger);
    return null;
  }
}

/**
 * THE resolver for production paths. Shape-validates, then PROVES the
 * secret's `x` is the public key of its `d` (memoized per secret). Absent,
 * malformed, or mismatched ⇒ logged `webhook_signing_key_invalid` and null,
 * so capabilities, jwks.json, and deliveries all agree on one posture:
 * signed only with a key we have demonstrated can produce signatures a
 * holder of jwks.json will accept.
 */
export async function resolveWebhookSigning(
  env: { WEBHOOK_SIGNING_PRIVATE_JWK?: string | undefined },
  logger?: KeyLogger,
): Promise<WebhookSigningKey | null> {
  const key = webhookSigningFromEnv(env, logger);
  if (!key) return null;
  if (await proveWebhookSigningKey(key)) return key;
  reportInvalid(`public x is not the public key of private d (kid ${key.kid}) — secret assembled from two different keys?`, logger);
  return null;
}

/**
 * True iff `x` verifies a signature made with `d`. Memoized per secret for
 * the life of the isolate, sharing the imported CryptoKey with the signer.
 */
export async function proveWebhookSigningKey(key: WebhookSigningKey): Promise<boolean> {
  return (await provenPrivateKey(key)) !== null;
}

/**
 * The public JWK to publish at /.well-known/jwks.json. Mirrors the shape of
 * the spec's own conformance keys: `alg` EdDSA, `use` sig, `key_ops`
 * ["verify"], and the AdCP purpose discriminator. Never includes `d`.
 */
export function publicJwk(key: WebhookSigningKey): PublicEd25519Jwk {
  return {
    kid: key.kid,
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    use: "sig",
    key_ops: ["verify"],
    adcp_use: key.adcpUse,
    x: key.privateJwk.x,
  };
}

export interface WebhookRequestToSign {
  /** Defaults to POST. */
  method?: string;
  /** The exact URL the request is sent to — `@target-uri` and `@authority` derive from it. */
  url: string;
  /**
   * Headers that will go on the wire. `Content-Type` is a covered component
   * and defaults to application/json if absent. The returned header set is
   * this map plus `Content-Digest`, `Signature-Input`, and `Signature`.
   */
  headers?: Record<string, string>;
  /**
   * The exact byte sequence sent as the body. Stringify once and pass the
   * same string here and to fetch — `Content-Digest` covers these bytes and
   * a receiver re-hashes the raw body it got.
   */
  body: string;
}

export interface SignedWebhookRequest {
  /** Complete outbound header set — send these, verbatim. */
  headers: Record<string, string>;
  /** The RFC 9421 §2.5 signature base that was signed (for tests/logging). */
  signatureBase: string;
  params: SignedRequest["params"];
}

export interface SignWebhookOptions {
  /** Clock override, seconds since epoch. Tests pin this; production uses Date.now(). */
  now?: () => number;
  /** Nonce override. Tests pin this; production draws 16 random bytes. */
  nonce?: string;
  /** Validity window; the spec caps it at 300. */
  windowSeconds?: number;
}

/**
 * Sign an outbound webhook under `adcp/webhook-signing/v1`.
 *
 * Covers `@method`, `@target-uri`, `@authority`, `content-type`,
 * `content-digest`; emits `Content-Digest`, `Signature-Input`, `Signature`.
 * Throws `WebhookSigningKeyError` if the key's pair does not prove.
 */
export async function signWebhookRequest(
  key: WebhookSigningKey,
  request: WebhookRequestToSign,
  options: SignWebhookOptions = {},
): Promise<SignedWebhookRequest> {
  const headers: Record<string, string> = { ...(request.headers ?? {}) };
  if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";

  const prepared = prepareWebhookSignature(
    { method: request.method ?? "POST", url: request.url, headers, body: request.body },
    { keyid: key.kid, alg: "ed25519" },
    {
      label: "sig1",
      windowSeconds: options.windowSeconds ?? SIGNATURE_WINDOW_SECONDS,
      nonce: options.nonce ?? randomNonce(),
      ...(options.now ? { now: options.now } : {}),
    },
  );

  const cryptoKey = await provenPrivateKey(key);
  if (!cryptoKey) {
    throw new WebhookSigningKeyError(`public x is not the public key of private d (kid ${key.kid})`);
  }
  const sigBuf = await crypto.subtle.sign("Ed25519", cryptoKey, new TextEncoder().encode(prepared.base));
  const signed = finalizeRequestSignature(prepared, new Uint8Array(sigBuf));

  return { headers: signed.headers, signatureBase: signed.signatureBase, params: signed.params };
}

// ── internals ───────────────────────────────────────────────────────────────

function reportInvalid(message: string, logger?: KeyLogger): void {
  if (logger) logger.error("webhook_signing_key_invalid", { error: message });
  else console.error("webhook_signing_key_invalid", message);
}

const SELF_CHECK_PROBE = new TextEncoder().encode("adcp-signals-adaptor:webhook-signing:key-self-check:v1");

// One import + one proof per secret per isolate. Keyed by the secret's own
// material (kid, x, d) — these strings already live in memory as env, and
// the map is never serialized or logged. Bounded so a pathological caller
// cycling secrets can't grow it.
const provenKeys = new Map<string, Promise<CryptoKey | null>>();
const PROVEN_KEYS_MAX = 8;

function provenPrivateKey(key: WebhookSigningKey): Promise<CryptoKey | null> {
  const id = `${key.kid} ${key.privateJwk.x} ${key.privateJwk.d}`;
  let p = provenKeys.get(id);
  if (!p) {
    if (provenKeys.size >= PROVEN_KEYS_MAX) provenKeys.clear();
    p = importAndProve(key);
    provenKeys.set(id, p);
  }
  return p;
}

/**
 * Import the private key, then prove `x` belongs to `d`: sign a fixed probe
 * with the private half and verify with a public key imported from `x`
 * alone. Any failure — import rejects the JWK, or the verify comes back
 * false — is a mismatch and yields null. Never throws.
 */
async function importAndProve(key: WebhookSigningKey): Promise<CryptoKey | null> {
  try {
    const priv = await crypto.subtle.importKey(
      "jwk",
      { kty: "OKP", crv: "Ed25519", x: key.privateJwk.x, d: key.privateJwk.d },
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const pub = await crypto.subtle.importKey(
      "jwk",
      { kty: "OKP", crv: "Ed25519", x: key.privateJwk.x },
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const sig = await crypto.subtle.sign("Ed25519", priv, SELF_CHECK_PROBE);
    const ok = await crypto.subtle.verify("Ed25519", pub, sig, SELF_CHECK_PROBE);
    return ok ? priv : null;
  } catch {
    return null;
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}

/** 16 random bytes, unpadded base64url — same size the SDK's own signer draws. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
