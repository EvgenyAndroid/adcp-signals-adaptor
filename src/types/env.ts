// src/types/env.ts
// Cloudflare Worker environment bindings

export interface Env {
  DB: D1Database;
  SIGNALS_CACHE: KVNamespace;
  ENVIRONMENT: string;
  API_VERSION: string;
  DEMO_API_KEY: string;
}
