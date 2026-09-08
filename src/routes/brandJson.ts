// src/routes/brandJson.ts
//
// Signing-key discovery for RFC 9421 webhooks (#248):
//
//   /.well-known/brand.json — brand identity + the trust root a verifier
//                             walks to find our signing key
//   /.well-known/jwks.json  — the public key set itself
//
// The chain the spec prescribes (security.mdx §Discovering an agent's
// signing keys) and the storyboard runner literally executes
// (webhook-emission.yaml `signing_keys_published`):
//
//   get_adcp_capabilities.identity.brand_json_url
//     → brand.json  agents[]  (find the entry whose url is our /mcp)
//       → agents[].jwks_uri
//         → jwks.json  keys[]  (kid from Signature-Input; adcp_use must be
//                               "request-signing" or the deprecated
//                               "webhook-signing"; key_ops must include
//                               "verify"; not revoked)
//
// WHICH brand.json VARIANT. The house domain (nofluffadvisory.com) already
// publishes a HOUSE-PORTFOLIO brand.json, where agents live under
// `house.agents[]` / `brands[].agents[]`. Two reasons not to point there:
// the runner reads TOP-LEVEL `agents[]` only, and it would couple this
// Worker's key rotation to another repo's deploy. So this Worker serves the
// schema's SELF-PUBLISHED BRAND variant (`allOf: [wrapper, #/definitions/
// brand]`), whose `agents[]` is top-level — exactly what the runner probes
// and what the SDK's BrandJsonJwksResolver accepts. It is a standalone brand
// (no `house_domain`): asserting membership in the house would require the
// house's brand.json to reciprocate via `brand_refs[]`, which it doesn't,
// and a one-sided assertion is worse than none.
//
// Both documents derive their URLs from the request origin — like
// adagents.json — so a preview deploy self-describes correctly. The
// capabilities response, which is KV-cached across requests, points at
// CANONICAL_ORIGIN instead (src/constants/origin.ts).
//
// The JWKS is DERIVED from the private secret at request time (strip `d`,
// flip key_ops to ["verify"]) — and only after the pair has been PROVEN
// (resolveWebhookSigning signs a probe with d and verifies with x), so a
// key that can't produce verifiable signatures is never published. Nothing
// is stored; nothing is committed; rotation is a secret update with a new
// kid.
//
// ROTATION CAVEAT. The set holds ONE key. When the secret rotates, the old
// public key disappears from jwks.json at once, so a signature made with
// the old key in the ~300s before the switch stops verifying at receivers
// that re-fetch (the 5-minute cache only delays that on receivers holding
// a stale copy). Carrying the previous public key through the overlap
// window would need a second, public-only secret — not built; rotate in a
// quiet window and accept that in-flight deliveries may need a retry.

import type { Env } from "../types/env";
import { Validator } from "@cfworker/json-schema";
import { loadAdcpCorpus, ADCP_SPEC_VERSION } from "../schemas/adcp";
import { SPEC_VERSION } from "../constants/specVersion";
import { publicJwk, resolveWebhookSigning, type PublicEd25519Jwk } from "../domain/webhookSigning";

export const BRAND_JSON_PATH = "/.well-known/brand.json";
export const JWKS_PATH = "/.well-known/jwks.json";


/** Self-published brand document (schema variant: `#/definitions/brand`). */
export interface BrandDocument {
  $schema: string;
  version: string;
  id: string;
  names: Array<Record<string, string>>;
  description: string;
  privacy_policy_url: string;
  contact: { email: string };
  agents: Array<{
    type: "signals";
    url: string;
    id: string;
    jwks_uri: string;
  }>;
  last_updated: string;
}

export interface JwksDocument {
  keys: PublicEd25519Jwk[];
}

/**
 * Build the brand.json for the origin the request arrived on. The agent
 * `url` MUST match the URL a verifier is resolving keys for — the SDK's
 * resolver matches one agents[] entry to one agent URL and rejects
 * ambiguity — so it is exactly `${origin}/mcp`, the registered endpoint.
 */
export function buildBrandDocument(request: Request): BrandDocument {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  return {
    $schema: "https://adcontextprotocol.org/schemas/v3/brand.json",
    version: "1.0",
    id: "signal_stack_demo_provider",
    names: [{ en: "Signal Stack — AdCP Signals Adaptor (Demo Provider)" }],
    description:
      "AdCP signals data provider: the MIT-licensed reference signals adaptor, serving audience and outcome signals across 14 verticals over MCP. Operated by No Fluff Advisory / Evgeny Popov.",
    privacy_policy_url: `${origin}/privacy`,
    // Same contact as the adagents.json discovery anchor on this origin.
    contact: { email: "Evgeny@gmail.com" },
    agents: [
      {
        type: "signals",
        url: `${origin}/mcp`,
        id: "adcp_signals_adaptor",
        jwks_uri: `${origin}${JWKS_PATH}`,
      },
    ],
    last_updated: new Date().toISOString(),
  };
}

/**
 * GET /.well-known/brand.json — public, CORS-open, cached for an hour.
 */
export function handleBrandJson(request: Request, _env: Env): Response {
  const doc = buildBrandDocument(request);
  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-AdCP-Spec-Version": SPEC_VERSION,
    },
  });
}

/**
 * The published key set. Exactly the public half of the configured signing
 * key, and only once the pair has proven itself; `keys: []` when no usable
 * key is configured — which is what the storyboard's
 * `webhook_signing_keys_unpublished` failure code exists to report, and
 * what the post-deploy smoke test flags as a red run when a kid was
 * provisioned but is not published here.
 */
export async function buildJwksDocument(env: Pick<Env, "WEBHOOK_SIGNING_PRIVATE_JWK">): Promise<JwksDocument> {
  const key = await resolveWebhookSigning(env);
  return { keys: key ? [publicJwk(key)] : [] };
}

/**
 * GET /.well-known/jwks.json — public, CORS-open, cached for 5 minutes
 * (see the rotation caveat in the header comment).
 */
export async function handleJwks(_request: Request, env: Env): Promise<Response> {
  const doc = await buildJwksDocument(env);
  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "X-AdCP-Spec-Version": SPEC_VERSION,
    },
  });
}

// ── Validator (cached) ────────────────────────────────────────────────────
//
// Same pattern as routes/adagents.ts: lazy-init a Validator rooted at the
// vendored brand.json schema with the rest of the corpus registered for
// $ref resolution. Used by tests/brand-json-jwks.test.ts so the served
// document can't drift from the schema without failing CI.

let _brandValidator: Validator | null = null;
function getBrandValidator(): Validator | null {
  if (_brandValidator) return _brandValidator;
  try {
    const corpus = loadAdcpCorpus() as Array<Record<string, unknown> & { $id?: string }>;
    const root = corpus.find((s) => s.$id === `/schemas/${ADCP_SPEC_VERSION}/brand.json`);
    if (!root) return null;
    const v = new Validator(root, "7", false);
    for (const s of corpus) {
      if (s.$id && s.$id !== root.$id) {
        try { v.addSchema(s); } catch { /* tolerate duplicates */ }
      }
    }
    _brandValidator = v;
    return v;
  } catch {
    return null;
  }
}

export interface BrandValidationResult {
  valid: boolean;
  schema_id: string;
  errors: Array<{ path: string; message: string; keyword: string }>;
}

export function validateBrandDocument(doc: unknown): BrandValidationResult {
  const schemaId = `/schemas/${ADCP_SPEC_VERSION}/brand.json`;
  const validator = getBrandValidator();
  if (!validator) {
    return {
      valid: false,
      schema_id: schemaId,
      errors: [{ path: "(meta)", message: "brand.json schema not found in vendored corpus", keyword: "missing_schema" }],
    };
  }
  const r = validator.validate(doc);
  return {
    valid: r.valid,
    schema_id: schemaId,
    errors: r.errors.map((e) => ({
      path: e.instanceLocation,
      message: e.error,
      keyword: e.keyword,
    })),
  };
}
