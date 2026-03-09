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
}