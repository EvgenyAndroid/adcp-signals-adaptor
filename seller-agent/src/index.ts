// Cloudflare Worker entry for the Signal Ledger Media seller agent.
// Routes:
//   GET  /health  → liveness, version, agent metadata, auth posture
//   POST /mcp     → AdCP MCP Streamable HTTP (JSON-RPC 2.0)
//   *             → 404
//
// Auth posture is resolved before any route runs. A misconfigured worker
// (no ADCP_TEST_TOKEN and no explicit dev opt-in) refuses every request with
// 503 instead of serving media-buy endpoints unauthenticated. /health also
// returns 503 in that state so uptime checks fail loudly rather than
// reporting a green agent that anyone can transact against.

import type { Env } from "./env";
import { resolveAuthPosture } from "./auth";
import { handleMcp } from "./mcp/server";

const VERSION = "0.1.0";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const posture = resolveAuthPosture(env);

        if (posture.mode === "misconfigured") {
            return misconfiguredResponse(env, posture.reason, url.pathname);
        }

        if (url.pathname === "/health" || url.pathname === "/") {
            return json(200, {
                status: "ok",
                agent: env.PUBLISHER,
                role: "seller",
                version: VERSION,
                environment: env.ENVIRONMENT,
                adcp: { major_versions: [3], supported_protocols: ["media_buy", "creative"] },
                auth: posture.mode === "enforced" ? "bearer_required" : "open_dev_mode",
            });
        }

        if (url.pathname === "/mcp") return handleMcp(request, env, posture);

        return new Response("Not Found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;

function misconfiguredResponse(env: Env, reason: string, pathname: string): Response {
    return json(503, {
        status: "misconfigured",
        agent: env.PUBLISHER,
        role: "seller",
        version: VERSION,
        environment: env.ENVIRONMENT,
        error: {
            code: "AUTH_NOT_CONFIGURED",
            message:
                "Agent is refusing to serve because its authentication is not " +
                "configured. This is deliberate: serving media-buy endpoints " +
                "without auth is worse than being down.",
            reason,
        },
        path: pathname,
    }, { "Retry-After": "3600" });
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...extraHeaders },
    });
}
