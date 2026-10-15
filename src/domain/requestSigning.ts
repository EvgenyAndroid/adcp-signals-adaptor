// src/domain/requestSigning.ts
//
// RFC 9421 INBOUND REQUEST VERIFICATION (signed_requests) — built 2026-10-10.
//
// Verifies the `adcp/request-signing/v1` profile on POST /mcp with the
// already-locked @adcp/sdk 13.1.3 server verifier. The posture below is one
// constant shared by get_adcp_capabilities and the verifier, so the
// declaration can never run ahead of the code that enforces it.
//
// POSTURE. supported: true, every operation list empty, digest coverage
// "either" (the 3.1 posture; 3.2 makes "required" mandatory, so with
// SERVE_ADCP_3_2 ON the endpoint uses "required" — see THE 3.2 PROFILE
// below). Empty lists mean no operation REQUIRES a
// signature — bearer callers are untouched, except for the webhook
// `authentication` payload rule below — but any signature that IS
// presented is verified on its merits, and a failure is a 401, never a
// fall-back to the bearer. The 401 carries exactly
// `WWW-Authenticate: Signature error="<code>"` (security.mdx @ v3.1.27,
// "Transport error taxonomy" :1362 and "WWW-Authenticate format" :1389).
// Empty lists also mean identity.key_origins carries no request_signing
// entry (every key_origins entry needs a non-empty list).
//
// TRUSTED KEYS. Only the public AdCP conformance test counterparty: the four
// keys published at
//   https://adcontextprotocol.org/compliance/3.1.24/test-vectors/request-signing/keys.json
// (public halves here; the file also publishes the private halves). Anyone can
// sign with them, so a verified signature from them is a SANDBOX principal no
// stronger than the public DEMO key — src/mcp/server.ts never maps it to live
// mode. test-gov-2026 (wrong adcp_use) and test-revoked-2026 (pre-revoked) are
// loaded so vectors 009 and 017 reach the checks they test instead of failing
// as unknown keys. Two 3.1.27 verifier MUSTs are deliberately skipped while
// supported is true: step-7 key discovery (capabilities → brand_json_url →
// brand.json → jwks_uri, :1227) for real counterparties, so every other keyid
// is request_signature_key_unknown; and revocation-list polling (:1324), for
// which the static snapshot below stands in. Discovery is being redesigned
// upstream (Web Bot Auth, DR-0023, proposed for 3.3; adcp#8118 retires the
// brand.json path in 4.0), so it is deferred to 4.0 / settled discovery.
//
// ORDER. The SDK runs checklist steps 1–13, including the step-13 replay
// insert into the D1 store (src/storage/replayRepo.ts) — not quite in spec
// order: 13.1.3 looks the nonce up (step 12) before crypto verify (step 10),
// so a forged signature reusing a seen nonce reads request_signature_replayed
// rather than request_signature_invalid (:1235, :1249). 13.1.3 has no step 14,
// so after it returns "verified" we reject duplicate object keys ourselves with
// request_body_malformed, a 401 like every transport code (security.mdx @
// v3.1.27: step 13 :1236, step 14 :1237, taxonomy row :1381). That is the
// spec order: the nonce is burned before the body check.
//
// UNSIGNED REQUESTS. No SDK call and no D1. The one payload rule: a seller
// that supports request signing MUST require a signature when the request
// carries webhook `authentication` at the sites 3.1.27 names —
// `push_notification_config.authentication` and
// `accounts[].notification_configs[].authentication` (security.mdx @
// v3.1.27, "Downgrade and injection resistance" :1456, and the
// request_signature_required taxonomy row :1366) — regardless of
// required_for and of any bearer (vector negative/027). adcp main (:1743)
// adds two sync_* sites that 3.1.27 does not name; they are not checked.
// Checked inside tools/call arguments only, per batch element, at exactly
// those two sites. Deliberately NOT the SDK's any-depth heuristic, which
// would also fire on unrelated `authentication` objects.
//
// THE 3.2 PROFILE — added 2026-10-15, selected by SERVE_ADCP_3_2. An endpoint
// that advertises a 3.2 release verifies EVERY signed request under the 3.2
// profile, whatever the request pins (adcp main security.mdx "Request-profile
// binary value encoding" :1213-1215; 3-1-to-3-2.mdx "Mixed-version request
// signing"), and the 3.2.4 capabilities schema requires covers_content_digest
// "required" whenever supported is true. So the profile is chosen by the flag,
// never by the request: OFF keeps REQUEST_SIGNING_CAPABILITY and the exact
// SDK call above; ON uses REQUEST_SIGNING_CAPABILITY_3_2 and two step-1
// pre-checks in front of the same 13.1.3 verifier, which accepts both of
// these: a Base64URL token (`-`/`_`) inside the sf-binary of Signature or
// Content-Digest (3.2 MUST reject it; vector profile-3.2/negative/001), and a
// Signature dictionary that repeats a label (RFC 8941 §3.2 keys are unique;
// vector 029). Both are request_signature_header_malformed before the SDK
// runs, so no nonce is burned. Everything the pre-checks cannot parse is left
// to the SDK's own step-1 parser. Offline, every wire-graded profile-3.2
// vector of the 3.2.4 bundle then matches; the remaining differences (002,
// 026, 031: Host defects no request can carry through Cloudflare's edge) are
// pinned in tests/request-signing.test.ts. A 15.x verifier would add only
// those codes, at the cost of a two-major SDK bump that also moves the
// flag-OFF path; the replay-store interface is unchanged there, so that
// upgrade stays open as its own change.

import {
  verifyRequestSignature,
  StaticJwksResolver,
  InMemoryRevocationStore,
  RequestSignatureError,
  type AdcpJsonWebKey,
  type ReplayStore,
  type VerifierCapability,
} from "@adcp/sdk/signing/server";

/** The request_signing posture: served verbatim by get_adcp_capabilities and enforced below. */
export const REQUEST_SIGNING_CAPABILITY: VerifierCapability & { warn_for: string[]; supported_for: string[] } = {
  supported: true,
  covers_content_digest: "either",
  required_for: [],
  warn_for: [],
  supported_for: [],
};

/** The 3.2 posture (SERVE_ADCP_3_2): every signed body must cover content-digest. */
export const REQUEST_SIGNING_CAPABILITY_3_2: typeof REQUEST_SIGNING_CAPABILITY = {
  ...REQUEST_SIGNING_CAPABILITY,
  covers_content_digest: "required",
};

export type SigningProfile = "3.1" | "3.2";

/** The posture for a profile — one source for the capability and the verifier. */
export function requestSigningCapability(profile: SigningProfile): typeof REQUEST_SIGNING_CAPABILITY {
  return profile === "3.2" ? REQUEST_SIGNING_CAPABILITY_3_2 : REQUEST_SIGNING_CAPABILITY;
}

// Public halves of the conformance test counterparty keys (see header).
const TEST_COUNTERPARTY_KEYS: AdcpJsonWebKey[] = [
  {
    kid: "test-ed25519-2026", kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", key_ops: ["verify"],
    adcp_use: "request-signing", x: "gWUqzATUcUco5Q8fZZXn8aWwb7DQbYGBiqUzLiSDDJo",
  },
  {
    kid: "test-es256-2026", kty: "EC", crv: "P-256", alg: "ES256", use: "sig", key_ops: ["verify"],
    adcp_use: "request-signing", x: "vGSQmjzPN1txgDY-oBb108gMsRETA9J5IPxqlBczQOY",
    y: "JGIbsHoOnHLL_LFqGYUW43BYDAqGYrNRZUylkE7rqSU",
  },
  {
    kid: "test-gov-2026", kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", key_ops: ["verify"],
    adcp_use: "governance-signing", x: "rkUcKP5oMd7YjV4yy5mVS5S8fA3LDXcf5jk1P1_52EA",
  },
  {
    kid: "test-revoked-2026", kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", key_ops: ["verify"],
    adcp_use: "request-signing", x: "r8wqMpVCLKzLSRNBtNmI1g71pPzQcwkATJHcyHK1lXg",
  },
];

const jwks = new StaticJwksResolver(TEST_COUNTERPARTY_KEYS);

// The test kit's pre-revoked key (test-kits/signed-requests-runner.yaml).
// A static snapshot: InMemoryRevocationStore consults revoked_kids only.
// next_update is already past and nothing refreshes it. 13.1.3 never reads
// it, but an SDK that enforces step-9 staleness (request_signature_revocation_stale)
// would reject every signed request — revisit on any SDK upgrade.
const revocationStore = new InMemoryRevocationStore({
  issuer: "https://adcontextprotocol.org/compliance/3.1.24/test-kits/signed-requests-runner.yaml",
  updated: "2026-10-10T00:00:00Z",
  next_update: "2026-10-10T00:00:00Z",
  revoked_kids: ["test-revoked-2026"],
  revoked_jtis: [],
});

export type SignatureCheck =
  | { status: "unsigned" }
  | { status: "verified"; keyid: string }
  | { status: "rejected"; code: string; detail: string };

/**
 * The whole request-signing decision for one HTTP request. `body` is the
 * decoded raw body (exact bytes, BOM kept — Content-Digest covers them);
 * `parsed` is that body after JSON.parse, which the caller has already done.
 * `profile` is the endpoint's (SERVE_ADCP_3_2), never the request's pin.
 * Throws only when the replay store fails; the caller must fail closed.
 */
export async function checkRequestSignature(
  request: { method: string; url: string; headers: Headers; body: string },
  parsed: unknown,
  replayStore: ReplayStore,
  profile: SigningProfile = "3.1",
): Promise<SignatureCheck> {
  if (!request.headers.has("signature") && !request.headers.has("signature-input")) {
    return carriesWebhookAuthentication(parsed)
      ? {
          status: "rejected",
          code: "request_signature_required",
          detail: "webhook authentication present on an unsigned request",
        }
      : { status: "unsigned" };
  }

  // Present but blank (both, after trimming) reads as absent to the SDK,
  // which would then run its own any-depth payload heuristic and return
  // "unsigned". A signature header that is present never falls back to
  // unsigned, so reject it here, before the SDK.
  if (!request.headers.get("signature")?.trim() && !request.headers.get("signature-input")?.trim()) {
    return { status: "rejected", code: "request_signature_header_malformed", detail: "empty Signature and Signature-Input headers" };
  }

  // 3.2 profile step-1 pre-checks — see the THE 3.2 PROFILE note above.
  const defect = profile === "3.2" ? profile32HeaderDefect(request.headers) : null;
  if (defect) return { status: "rejected", code: "request_signature_header_malformed", detail: defect };

  let result;
  try {
    result = await verifyRequestSignature(
      { method: request.method, url: request.url, headers: Object.fromEntries(request.headers), body: request.body },
      { capability: requestSigningCapability(profile), jwks, replayStore, revocationStore },
    );
  } catch (err) {
    if (err instanceof RequestSignatureError) return { status: "rejected", code: err.code, detail: err.message };
    throw err;
  }
  // Unreachable after the blank-header check above; kept as the type guard,
  // and it still rejects rather than falling back to unsigned.
  if (result.status !== "verified") {
    return { status: "rejected", code: "request_signature_header_malformed", detail: "empty Signature or Signature-Input header" };
  }
  if (hasDuplicateObjectKeys(request.body)) {
    return { status: "rejected", code: "request_body_malformed", detail: "duplicate object keys in a signed body" };
  }
  return { status: "verified", keyid: result.keyid };
}

// `label=:token:` members of an RFC 8941 dictionary (Signature, Content-Digest).
const SF_BINARY_MEMBER = /(?:^|,)\s*([a-z*][a-z0-9_.*-]*)\s*=\s*:([^:]*):/g;
const SF_BINARY_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * The 3.2 profile's two step-1 defects the 13.1.3 parser lets through, or
 * null. Rejects only on positive evidence: a binary token outside the standard
 * Base64 alphabet in Signature or Content-Digest, or a Signature label that
 * appears twice.
 */
export function profile32HeaderDefect(headers: Headers): string | null {
  for (const name of ["signature", "content-digest"]) {
    const value = headers.get(name);
    if (!value) continue;
    const labels: string[] = [];
    for (const [, label, token] of value.matchAll(SF_BINARY_MEMBER)) {
      if (!SF_BINARY_BASE64.test(token ?? "")) return `${name}: ${label} is not standard Base64 (RFC 8941 sf-binary)`;
      labels.push(label ?? "");
    }
    if (name === "signature" && new Set(labels).size !== labels.length) return "signature: a label appears more than once";
  }
  return null;
}

/**
 * operatorId for a caller authenticated by signature alone. Bearer-derived
 * ids are exactly 12 base64url characters (src/utils/operatorId.ts); ':' is
 * outside that alphabet, so the two namespaces cannot collide.
 */
export function signerOperatorId(keyid: string): string {
  return `rs:${keyid}`;
}

function isNonEmptyObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 0;
}

/** The 3.1.27 payload rule's two sites, inside tools/call arguments, per batch element. */
export function carriesWebhookAuthentication(parsed: unknown): boolean {
  const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  return messages.some((msg) => {
    const m = msg as { method?: unknown; params?: { arguments?: unknown } } | null;
    if (!m || typeof m !== "object" || m.method !== "tools/call") return false;
    const args = m.params?.arguments as
      | { push_notification_config?: { authentication?: unknown }; accounts?: unknown }
      | undefined;
    if (!args || typeof args !== "object") return false;
    if (isNonEmptyObject(args.push_notification_config?.authentication)) return true;
    return Array.isArray(args.accounts) && args.accounts.some((account: { notification_configs?: unknown } | null) =>
      Array.isArray(account?.notification_configs) &&
      account.notification_configs.some((nc: { authentication?: unknown } | null) => isNonEmptyObject(nc?.authentication)),
    );
  });
}

/**
 * Step 14: does this JSON text contain an object with a repeated key?
 * JSON.parse silently keeps the last one, so this walks the text itself and
 * compares keys after unescaping ("a" and "a" are the same key). The
 * text must already have parsed as JSON.
 */
export function hasDuplicateObjectKeys(text: string): boolean {
  const stack: Array<{ keys: Set<string>; expectKey: boolean } | null> = []; // null = array
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (ch === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      if (top && top.expectKey) {
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        if (top.keys.has(key)) return true;
        top.keys.add(key);
        top.expectKey = false;
      }
    } else if (ch === "{") {
      stack.push({ keys: new Set(), expectKey: true });
    } else if (ch === "[") {
      stack.push(null);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    } else if (ch === "," && top) {
      top.expectKey = true;
    }
  }
  return false;
}
