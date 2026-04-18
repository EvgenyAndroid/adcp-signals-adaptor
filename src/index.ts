// src/index.ts
// Cloudflare Worker entrypoint for the AdCP Signals Adaptor Agent.

import type { Env } from "./types/env";
import { handleGetCapabilities } from "./routes/capabilities";
import { handleSearchSignals } from "./routes/searchSignals";
import { handleActivateSignal } from "./routes/activateSignal";
import { handleGetOperation } from "./routes/getOperation";
import { handleGetEmbedding } from "./routes/getEmbedding";
import { handleGetGts } from "./routes/gts";
import { handleSimulateHandshake } from "./routes/handshake";
import { handleGetProjector } from "./routes/getProjector";
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

// KV flag + module-level memoization gate the auto-seed.
// Workers isolates persist across requests; the module-level boolean short-circuits
// the KV read after the first successful check. The KV flag covers isolate recycling.
const KV_SEED_COMPLETE = "seed:complete";
let seedCheckedInIsolate = false;

// Paths that don't interact with the signal catalog — skip auto-seed entirely
// to keep the hot path (health, OAuth callbacks) quick.
const SEED_SKIP_PREFIXES = [
    "/health",
    "/auth/",
];

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
            "/ucp/gts",
            "/ucp/simulate-handshake",
            "/auth/linkedin/init",
            "/auth/linkedin/callback",
            "/auth/linkedin/status",
        ];
        const isPublic = publicPaths.some((p) => path === p || path.startsWith(p + "/"));

        if (!isPublic && !requireAuth(request, env.DEMO_API_KEY)) {
            return withCors(
                errorResponse("UNAUTHORIZED", "Valid API key required (Authorization: Bearer <key>)", 401)
            );
        }

        logger.info("request_received", { method, path });

        try {
            // Auto-seed on first request if DB is empty.
            // Gated by isolate-local + KV flag so it's not a per-request pipeline run.
            if (!seedCheckedInIsolate && !SEED_SKIP_PREFIXES.some((p) => path.startsWith(p))) {
                ctx.waitUntil(maybeSeed(env, logger));
            }

            let response: Response;

            // ── Route matching ────────────────────────────────────────────────────

            if (method === "GET" && path === "/health") {
                response = jsonResponse({ status: "ok", version: "3.0-rc" });

            } else if (method === "GET" && path === "/capabilities") {
                response = await handleGetCapabilities(request, env, logger);

                // ── UCP GTS ──────────────────────────────────────────────────────────
            } else if (method === "GET" && path === "/ucp/gts") {
                response = await handleGetGts(env, logger);

                // ── UCP Handshake Simulator ───────────────────────────────────────────
            } else if (method === "POST" && path === "/ucp/simulate-handshake") {
                response = await handleSimulateHandshake(request, env, logger);

                // ── UCP Projector ─────────────────────────────────────────────────────
            } else if (method === "GET" && path === "/ucp/projector") {
                response = handleGetProjector();

                // ── LinkedIn OAuth (public — no auth required) ───────────────────────
            } else if (method === "GET" && path === "/auth/linkedin/init") {
                response = await handleLinkedInAuthInit(env);

            } else if (method === "GET" && path === "/auth/linkedin/callback") {
                response = await handleLinkedInAuthCallback(request, env);

            } else if (method === "GET" && path === "/auth/linkedin/status") {
                response = await handleLinkedInAuthStatus(env);

                // ── UCP Concept Registry ─────────────────────────────────────────────
            } else if (path.startsWith("/ucp/concepts")) {
                response = await handleConceptRoute(request, env, path);

                // ── NL Audience Query ────────────────────────────────────────────────
            } else if (method === "POST" && path === "/signals/query") {
                const body = await request.json() as { query: string; limit?: number };
                const catalog = await getAllSignalsForCatalog(getDb(env));
                response = await handleNLQuery(body, catalog, env);

                // ── Platform Activation (auth required) ──────────────────────────────
            } else if (method === "POST" && path.startsWith("/signals/activate/")) {
                const platform = path.replace("/signals/activate/", "").split("/")[0];
                response = await handleActivateDispatch(request, env as any, platform);

                // ── MCP ───────────────────────────────────────────────────────────────
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

                // ── Signal search ────────────────────────────────────────────────────
            } else if (
                (method === "POST" || method === "GET") &&
                path === "/signals/search"
            ) {
                response = await handleSearchSignals(request, env, logger);

                // ── Signal activate (legacy AdCP flow) ───────────────────────────────
            } else if (method === "POST" && path === "/signals/activate") {
                response = await handleActivateSignal(request, env, logger);

                // ── Dev seed force endpoint ───────────────────────────────────────────
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

                // ── Signal embedding ─────────────────────────────────────────────────
            } else if (method === "GET" && path.match(/^\/signals\/[^/]+\/embedding$/)) {
                const signalId = path.split("/")[2];
                response = await handleGetEmbedding(signalId, env, logger);

                // ── Operations polling ───────────────────────────────────────────────
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

/**
 * Run the seed pipeline at most once per isolate, and at most once per
 * deployment (KV flag persists across isolates). Safe to call concurrently —
 * runSeedPipeline itself is idempotent.
 */
async function maybeSeed(env: Env, logger: ReturnType<typeof createLogger>): Promise<void> {
    seedCheckedInIsolate = true;
    try {
        const flag = await env.SIGNALS_CACHE.get(KV_SEED_COMPLETE);
        if (flag) return;

        const result = await runSeedPipeline(
            getDb(env),
            { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
            logger
        );

        // Either fresh-seeded or count-check found prior seed — either way,
        // the catalog is populated and we can short-circuit on future requests.
        if (result.seeded > 0 || result.skipped) {
            await env.SIGNALS_CACHE.put(KV_SEED_COMPLETE, "1");
        }
    } catch (err) {
        // Reset isolate flag so a transient failure can be retried on the next request.
        seedCheckedInIsolate = false;
        logger.error("auto_seed_failed", { error: String(err) });
    }
}