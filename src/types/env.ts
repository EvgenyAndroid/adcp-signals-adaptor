// src/types/env.ts
// Cloudflare Worker environment bindings

export interface Env {
  // ── Storage ──────────────────────────────────────────────────────────────────
  DB: D1Database;
  SIGNALS_CACHE: KVNamespace;

  // ── App config (wrangler.toml [vars]) ────────────────────────────────────────
  ENVIRONMENT: string;
  API_VERSION: string;
  DEMO_API_KEY: string;
  LINKEDIN_REDIRECT_URI: string;

  // ── Embedding engine (wrangler.toml [vars]) ───────────────────────────────────
  // Set EMBEDDING_ENGINE=llm to activate LLM mode
  EMBEDDING_ENGINE?: string;

  // AdCP 3.2 serving flag (wrangler.toml [vars], "false" there). ON only when
  // exactly "true": the agent then advertises supported_versions
  // ["3.0","3.1","3.2"], defaults unpinned callers to 3.2, implements the
  // seed_account controller scenario, and verifies request signatures under
  // the 3.2 profile (covers_content_digest "required", RFC 8941 Base64).
  // Anything else is today's 3.1 agent, byte for byte. Flipping it moves
  // hosted grading to the 3.2 bundle and replaces the 3.1 card, so the flip
  // is its own reviewed PR. See src/constants/specVersion.ts.
  SERVE_ADCP_3_2?: string;

  // Optional override for the federated publisher synaptic-audience catalog
  // (src/connectors/synapticLoader.ts). Defaults to
  // https://sell.nofluffadvisory.com/synaptic/catalog when unset.
  SYNAPTIC_CATALOG_URL?: string;

  // ── Secrets (npx wrangler secret put ...) ────────────────────────────────────
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;

  // LinkedIn OAuth + Ads
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_AD_ACCOUNT_ID: string;

  // Optional — RFC 9421 webhook signing key (AdCP `adcp/webhook-signing/v1`
  // profile). A JSON private Ed25519 JWK:
  //   {"kid":"…","kty":"OKP","crv":"Ed25519","alg":"EdDSA","use":"sig",
  //    "key_ops":["sign"],"adcp_use":"request-signing","x":"…","d":"…"}
  // When set, outbound webhooks carry Content-Digest / Signature-Input /
  // Signature headers, /.well-known/jwks.json publishes the public half,
  // and get_adcp_capabilities declares webhook_signing.supported: true.
  // Unset ⇒ unsigned deliveries, empty JWKS, supported: false (honest).
  // Provisioned by .github/workflows/deploy.yml from the repo secret of
  // the same name (wrangler isn't authenticated locally); to set by hand:
  //   printf '%s' "$JWK_JSON" | wrangler secret put WEBHOOK_SIGNING_PRIVATE_JWK
  // See src/domain/webhookSigning.ts for the format and validation rules.
  WEBHOOK_SIGNING_PRIVATE_JWK?: string;

  // Optional — when set, LinkedIn access/refresh tokens stored in KV are
  // AES-GCM encrypted at rest. Unset ⇒ tokens stored plaintext (legacy,
  // backwards-compatible during rollout). Reads auto-detect the enc:v1:
  // prefix and decrypt; plaintext values are returned unchanged. Provision:
  //   wrangler secret put TOKEN_ENCRYPTION_KEY
  TOKEN_ENCRYPTION_KEY?: string;
}