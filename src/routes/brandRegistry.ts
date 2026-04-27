// src/routes/brandRegistry.ts
//
// Canvas v2 Phase 1: passthrough + KV-cached endpoints for the public AdCP
// agentic-advertising brand registry. Lets our orchestrator hand brand
// context (BrandRef + brand_manifest) into downstream signals/creative/
// product calls instead of synthesizing placeholder values.
//
//   GET  /brands/search?q=<query>    — passthrough to /api/search, cached 10min
//   GET  /brands/resolve?domain=...  — passthrough to /api/brands/resolve, cached 1hr
//
// Why we proxy instead of the UI calling the registry directly:
//   - Single CORS origin (avoid registry-CORS surprises in browser)
//   - KV cache for repeat lookups (the same 5–10 brands get hit a lot in demos)
//   - Future: enrich with our own metadata (e.g. which signal/creative agents
//     have inventory matching the brand's industries)
//
// No auth on these endpoints — same posture as the registry itself.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";

const REGISTRY_BASE = "https://agenticadvertising.org/api";
const SEARCH_TTL_SEC = 600;     // 10 min — search results change with new brand additions
const RESOLVE_TTL_SEC = 3600;   // 1 hr — resolved brand manifests change less often
const SEARCH_KEY_PREFIX = "brand_search:";
const RESOLVE_KEY_PREFIX = "brand_resolve:";

interface BrandSearchResult {
  domain: string;
  brand_name: string;
  keller_type?: string;        // master | sub_brand | independent
  house_domain?: string | null;
  agent_url?: string | null;
}

interface BrandResolved {
  canonical_id: string;
  canonical_domain: string;
  brand_name: string;
  source?: string;
  brand_manifest?: Record<string, unknown>;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Accept": "application/json" },
  });
}

// ── /brands/search ──────────────────────────────────────────────────────────

export async function handleBrandSearch(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return errorResponse("INVALID_INPUT", "q (query) required", 400);
  if (q.length > 80) return errorResponse("INVALID_INPUT", "q max 80 chars", 400);

  const cacheKey = SEARCH_KEY_PREFIX + q.toLowerCase();
  try {
    const cached = await env.SIGNALS_CACHE.get(cacheKey, "json");
    if (cached) {
      return jsonResponse({ ...(cached as object), cache: "hit" });
    }
  } catch { /* cache miss/error → fetch fresh */ }

  const upstream = REGISTRY_BASE + "/search?q=" + encodeURIComponent(q);
  let body: { brands?: BrandSearchResult[] } = { brands: [] };
  try {
    const res = await fetchWithTimeout(upstream, 8000);
    if (!res.ok) {
      logger.warn("brand_search_upstream_status", { status: res.status });
      return errorResponse("UPSTREAM_ERROR", "Registry search failed: " + res.status, 502);
    }
    body = (await res.json()) as { brands?: BrandSearchResult[] };
  } catch (e) {
    logger.warn("brand_search_upstream_error", { error: String((e as Error).message || e) });
    return errorResponse("UPSTREAM_ERROR", "Registry unreachable", 502);
  }

  const out = {
    query: q,
    count: body.brands?.length ?? 0,
    brands: body.brands ?? [],
    fetched_at: new Date().toISOString(),
    cache: "miss",
  };
  // Cache the response without the cache field — we re-add it on hit.
  try {
    const { cache: _c, ...store } = out;
    void _c;
    await env.SIGNALS_CACHE.put(cacheKey, JSON.stringify(store), {
      expirationTtl: SEARCH_TTL_SEC,
    });
  } catch { /* cache-write failure is non-fatal */ }

  return jsonResponse(out);
}

// ── /brands/resolve ─────────────────────────────────────────────────────────

export async function handleBrandResolve(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return errorResponse("INVALID_INPUT", "domain required", 400);
  // Loose validation — registry accepts most TLDs. Reject obvious junk.
  if (domain.length > 200 || !/^[a-z0-9.-]+$/i.test(domain)) {
    return errorResponse("INVALID_INPUT", "domain has invalid characters", 400);
  }

  const cacheKey = RESOLVE_KEY_PREFIX + domain;
  try {
    const cached = await env.SIGNALS_CACHE.get(cacheKey, "json");
    if (cached) {
      return jsonResponse({ ...(cached as object), cache: "hit" });
    }
  } catch { /* fall through to fresh fetch */ }

  const upstream = REGISTRY_BASE + "/brands/resolve?domain=" + encodeURIComponent(domain);
  let body: BrandResolved | null = null;
  try {
    const res = await fetchWithTimeout(upstream, 8000);
    if (res.status === 404) {
      // Don't cache 404s — brand might be added later. Fast-fail.
      return errorResponse("BRAND_NOT_FOUND", `No brand found for domain '${domain}'`, 404);
    }
    if (!res.ok) {
      logger.warn("brand_resolve_upstream_status", { status: res.status });
      return errorResponse("UPSTREAM_ERROR", "Registry resolve failed: " + res.status, 502);
    }
    body = (await res.json()) as BrandResolved;
  } catch (e) {
    logger.warn("brand_resolve_upstream_error", { error: String((e as Error).message || e) });
    return errorResponse("UPSTREAM_ERROR", "Registry unreachable", 502);
  }

  const out = {
    ...body,
    fetched_at: new Date().toISOString(),
    cache: "miss",
  };
  try {
    const { cache: _c, ...store } = out;
    void _c;
    await env.SIGNALS_CACHE.put(cacheKey, JSON.stringify(store), {
      expirationTtl: RESOLVE_TTL_SEC,
    });
  } catch { /* non-fatal */ }

  return jsonResponse(out);
}
