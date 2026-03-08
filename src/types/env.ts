// src/types/env.ts
// Cloudflare Worker environment bindings

export interface Env {
  DB: D1Database;
  SIGNALS_CACHE: KVNamespace;
  ENVIRONMENT: string;
  API_VERSION: string;
  DEMO_API_KEY: string;
  // UCP embedding engine (optional — defaults to pseudo if not set)
  // Set EMBEDDING_ENGINE=llm in wrangler.toml vars to activate LLM mode
  EMBEDDING_ENGINE?: string;
  // Embedding API keys — set via: wrangler secret put OPENAI_API_KEY
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}
