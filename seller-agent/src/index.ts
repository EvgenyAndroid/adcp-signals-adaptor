// Cloudflare Worker entry for the Signal Ledger Media seller agent.
// Routes:
//   GET  /health  → liveness, version, agent metadata
//   POST /mcp     → AdCP MCP Streamable HTTP (JSON-RPC 2.0)
//   *             → 404

import type { Env } from "./env";
import { handleMcp } from "./mcp/server";

const VERSION = "0.1.0";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/health" || url.pathname === "/") {
            return new Response(
                JSON.stringify({
                    status: "ok",
                    agent: env.PUBLISHER,
                    role: "seller",
                    version: VERSION,
                    adcp: { major_versions: [3], supported_protocols: ["media_buy", "creative"] },
                    auth: env.ADCP_TEST_TOKEN ? "bearer_required" : "open_dev_mode",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }

        if (url.pathname === "/mcp") return handleMcp(request, env);

        return new Response("Not Found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;
