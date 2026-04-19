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

  // ── Secrets (npx wrangler secret put ...) ────────────────────────────────────
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;

  // LinkedIn OAuth + Ads
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_AD_ACCOUNT_ID: string;

  // Optional — when set, outbound activation webhooks carry an
  // X-AdCP-Signature: t=<unix-secs>,v1=<hex-hmac-sha256> header so
  // receivers can verify origin and detect tampering. Unset ⇒ unsigned
  // deliveries (backwards-compatible). Provision via:
  //   wrangler secret put WEBHOOK_SIGNING_SECRET
  WEBHOOK_SIGNING_SECRET?: string;

  // Optional — when set, LinkedIn access/refresh tokens stored in KV are
  // AES-GCM encrypted at rest. Unset ⇒ tokens stored plaintext (legacy,
  // backwards-compatible during rollout). Reads auto-detect the enc:v1:
  // prefix and decrypt; plaintext values are returned unchanged. Provision:
  //   wrangler secret put TOKEN_ENCRYPTION_KEY
  TOKEN_ENCRYPTION_KEY?: string;
}