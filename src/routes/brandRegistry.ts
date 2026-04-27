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

// ── /brands/logo ────────────────────────────────────────────────────────────
//
// Phase 2 follow-up: proxy brand-logo image bytes through our worker so the
// UI doesn't depend on third-party CDN render reliability. Brandfetch.io
// (the actual host for many registry entries — e.g. Coca-Cola) returns a
// valid SVG over HTTPS, but browser <img> rendering of that origin can
// fail silently in our context (suspected hotlink-detect / referrer
// policy). Proxying through us makes logos render uniformly: we own the
// response headers, the cache, and the failure-mode (404 fallback).
//
// SSRF guard: only allow URLs from a known set of brand-logo origins.

const LOGO_TTL_SEC = 86400;       // 24h — logos rarely change
const LOGO_KEY_PREFIX = "brand_logo:";
const LOGO_ALLOWED_HOSTS = new Set<string>([
  "agenticadvertising.org",
  "cdn.brandfetch.io",
  "asset.brandfetch.io",
  "logos.brandfetch.io",
]);

export async function handleBrandLogo(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  if (!target) return errorResponse("INVALID_INPUT", "u (target url) required", 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return errorResponse("INVALID_INPUT", "malformed url", 400);
  }
  if (parsed.protocol !== "https:") {
    return errorResponse("INVALID_INPUT", "https only", 400);
  }
  if (!LOGO_ALLOWED_HOSTS.has(parsed.hostname)) {
    return errorResponse("HOST_NOT_ALLOWED", `logo host ${parsed.hostname} not allowlisted`, 403);
  }

  const cacheKey = LOGO_KEY_PREFIX + target;
  try {
    const ctMeta = await env.SIGNALS_CACHE.getWithMetadata<{ ct?: string }>(cacheKey, "stream");
    if (ctMeta.value) {
      const contentType = (ctMeta.metadata && ctMeta.metadata.ct) || "image/svg+xml";
      return new Response(ctMeta.value, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=" + LOGO_TTL_SEC,
          "X-Cache": "hit",
        },
      });
    }
  } catch { /* fall through to fresh fetch */ }

  let upstream: Response;
  try {
    // Spoof a real-browser User-Agent. Brandfetch (and other CDNs) put
    // Cloudflare bot-protection in front; the worker's default
    // workers-runtime UA gets cf:1010-banned. A vanilla Chrome UA
    // passes through. We're not scraping — just fetching public images
    // the same way a browser would if it could load the URL directly.
    upstream = await fetch(target, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "Accept": "image/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://" + parsed.hostname + "/",
      },
    });
  } catch (e) {
    logger.warn("brand_logo_upstream_error", { url: target, error: String((e as Error).message || e) });
    return errorResponse("UPSTREAM_ERROR", "logo unreachable", 502);
  }
  if (!upstream.ok) {
    logger.warn("brand_logo_upstream_status", { url: target, status: upstream.status });
    return errorResponse("UPSTREAM_ERROR", "logo upstream " + upstream.status, 502);
  }

  const contentType = upstream.headers.get("content-type") || "image/svg+xml";
  const arrayBuf = await upstream.arrayBuffer();
  if (arrayBuf.byteLength > 1_000_000) {
    return errorResponse("UPSTREAM_TOO_LARGE", "logo > 1MB; not cached", 413);
  }

  try {
    await env.SIGNALS_CACHE.put(cacheKey, arrayBuf, {
      expirationTtl: LOGO_TTL_SEC,
      metadata: { ct: contentType },
    });
  } catch { /* non-fatal */ }

  return new Response(arrayBuf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=" + LOGO_TTL_SEC,
      "X-Cache": "miss",
    },
  });
}

