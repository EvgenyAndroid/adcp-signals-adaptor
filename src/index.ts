// src/index.ts
// Cloudflare Worker entrypoint for the AdCP Signals Adaptor Agent.

import type { Env } from "./types/env";
import { handleGetCapabilities } from "./routes/capabilities";
import { handleSearchSignals } from "./routes/searchSignals";
import { handleActivateSignal } from "./routes/activateSignal";
import { handleGenerateSignal } from "./routes/generateSignal";
import { handleGetOperation } from "./routes/getOperation";
import { handleMcpRequest } from "./mcp/server";
import { jsonResponse, errorResponse, requireAuth } from "./routes/shared";
import { createLogger } from "./utils/logger";
import { requestId } from "./utils/ids";
import { runSeedPipeline } from "./domain/seedPipeline";
import { getDb } from "./storage/db";

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

    // Auth check - /mcp, /capabilities, /health are public
    const publicPaths = ["/capabilities", "/health", "/mcp"];
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
          {
            taxonomyTsv,
            demographicsCsv,
            interestsCsv,
            geoCsv,
          },
          logger
        ).catch((err) => logger.error("auto_seed_failed", { error: String(err) }))
      );

      let response: Response;

      // ── Route matching ───────────────────────────────────────────────────────

      if (method === "GET" && path === "/capabilities") {
        response = await handleGetCapabilities(env, logger);
      } else if (method === "GET" && path === "/health") {
        response = jsonResponse({ status: "ok", provider: "adcp-signals-adaptor" });
      } else if (path === "/mcp" || path.startsWith("/mcp/")) {
        // MCP Streamable HTTP endpoint - no auth, protocol handles sessions
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
      } else if (
        (method === "POST" || method === "GET") &&
        path === "/signals/search"
      ) {
        response = await handleSearchSignals(request, env, logger);
      } else if (method === "POST" && path === "/signals/activate") {
        response = await handleActivateSignal(request, env, logger);
      } else if (method === "POST" && path === "/signals/generate") {
        response = await handleGenerateSignal(request, env, logger);
      } else if (method === "POST" && path === "/seed") {
        const result = await runSeedPipeline(
          getDb(env),
          { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
          logger,
          true
        );
        response = jsonResponse({ message: "Seed complete", ...result });
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
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