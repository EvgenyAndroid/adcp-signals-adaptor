// src/index.ts
// Cloudflare Worker entrypoint for the AdCP Signals Adaptor Agent.

import type { Env } from "./types/env";
import { handleGetCapabilities } from "./routes/capabilities";
import { handleSearchSignals } from "./routes/searchSignals";
import { handleActivateSignal } from "./routes/activateSignal";
import { handleGetOperation } from "./routes/getOperation";
import { handleGetEmbedding } from "./routes/getEmbedding";
import { handleMcpRequest } from "./mcp/server";
import { jsonResponse, errorResponse, requireAuth } from "./routes/shared";
import { createLogger } from "./utils/logger";
import { requestId } from "./utils/ids";
import { runSeedPipeline } from "./domain/seedPipeline";
import { getDb } from "./storage/db";
import { getAllSignalsForCatalog } from "./domain/signalService";
import { handleConceptRoute } from "./domain/conceptHandler";
import { handleNLQuery } from "./domain/nlQueryHandler";
import {
  handleLinkedInAuthInit,
  handleLinkedInAuthCallback,
  handleLinkedInAuthStatus,
} from "./activations/auth/linkedin";
import { handleActivateDispatch } from "./activations/routes/activate";

// Seed data imported as text modules via wrangler assets
import { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv } from "./seedData";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const reqId = requestId();
    const logger = createLogger(reqId);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Public paths — no auth required
    // LinkedIn auth routes must be public so OAuth flow works without a token
    const publicPaths = [
      "/capabilities",
      "/health",
      "/mcp",
      "/ucp/concepts",
      "/auth/linkedin/init",
      "/auth/linkedin/callback",
      "/auth/linkedin/status",
      '/auth/linkedin/token-debug',
    ];
    const isPublic = publicPaths.some((p) => path === p || path.startsWith(p + "/"));

    if (!isPublic && !requireAuth(request, env.DEMO_API_KEY)) {
      return withCors(
        errorResponse("UNAUTHORIZED", "Valid API key required (Authorization: Bearer <key>)", 401)
      );
    }

    logger.info("request_received", { method, path });

    try {
      // Auto-seed on first request if DB is empty
      ctx.waitUntil(
        runSeedPipeline(
          getDb(env),
          { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
          logger
        ).catch((err) => logger.error("auto_seed_failed", { error: String(err) }))
      );

      let response: Response;

      // ── Route matching ───────────────────────────────────────────────────────

      if (method === "GET" && path === "/health") {
        response = jsonResponse({ status: "ok", provider: "adcp-signals-adaptor" });

      } else if (method === 'GET' && path === '/auth/linkedin/token-debug') {
          const token = await env.SIGNALS_CACHE.get('linkedin:access_token');
          response = jsonResponse({ token });

      } else if (method === "GET" && path === "/capabilities") {
        response = await handleGetCapabilities(env, logger);

      // ── LinkedIn OAuth (public — no auth required) ───────────────────────────
      } else if (method === "GET" && path === "/auth/linkedin/init") {
        response = handleLinkedInAuthInit(env);

      } else if (method === "GET" && path === "/auth/linkedin/callback") {
        response = await handleLinkedInAuthCallback(request, env);

      } else if (method === "GET" && path === "/auth/linkedin/status") {
        response = await handleLinkedInAuthStatus(env);

      // ── UCP Concept Registry ─────────────────────────────────────────────────
      } else if (path.startsWith("/ucp/concepts")) {
        response = await handleConceptRoute(request, env, path);

      // ── NL Audience Query ────────────────────────────────────────────────────
      } else if (method === "POST" && path === "/signals/query") {
        const body = await request.json() as { query: string; limit?: number };
        const catalog = await getAllSignalsForCatalog(getDb(env));
        response = await handleNLQuery(body, catalog, env);

      // ── Platform Activation (auth required) ──────────────────────────────────
      } else if (method === "POST" && path.startsWith("/signals/activate/")) {
        const platform = path.replace("/signals/activate/", "").split("/")[0];
        response = await handleActivateDispatch(request, env as any, platform);

      // ── MCP ───────────────────────────────────────────────────────────────────
      } else if (path === "/mcp" || path.startsWith("/mcp")) {
        if (method === "OPTIONS") {
          response = new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
            },
          });
        } else {
          response = await handleMcpRequest(request, env, logger);
        }

      // ── Signal search ────────────────────────────────────────────────────────
      } else if (
        (method === "POST" || method === "GET") &&
        path === "/signals/search"
      ) {
        response = await handleSearchSignals(request, env, logger);

      // ── Signal activate (legacy AdCP flow) ───────────────────────────────────
      } else if (method === "POST" && path === "/signals/activate") {
        response = await handleActivateSignal(request, env, logger);

      // ── Dev seed force endpoint ───────────────────────────────────────────────
      } else if (
        method === "POST" &&
        path === "/seed" &&
        env.ENVIRONMENT === "development"
      ) {
        const result = await runSeedPipeline(
          getDb(env),
          { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
          logger,
          true
        );
        response = jsonResponse({ message: "Seed complete", ...result });

      // ── Signal embedding ─────────────────────────────────────────────────────
      } else if (method === "GET" && path.match(/^\/signals\/[^/]+\/embedding$/)) {
        const signalId = path.split("/")[2];
        response = await handleGetEmbedding(signalId, env, logger);

      // ── Operations polling ───────────────────────────────────────────────────
      } else if (method === "GET" && path.startsWith("/operations/")) {
        const opId = path.replace("/operations/", "");
        response = await handleGetOperation(opId, env, logger);

      } else {
        response = errorResponse(
          "NOT_FOUND",
          `Route not found: ${method} ${path}`,
          404
        );
      }

      return withCors(response);
    } catch (err) {
      logger.error("unhandled_error", { error: String(err) });
      return withCors(
        errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500)
      );
    }
  },
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}