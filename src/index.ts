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
import { handleUcpProjection, handleUcpSimilarity } from "./routes/ucpProjection";
import {
  handleQueryVector,
  handleArithmetic,
  handleAnalogy,
  handleNeighborhood,
  handleCoverageGaps,
  handleAnalyticsSummary,
} from "./routes/analyticsEndpoints";
import {
  handleLorenz,
  handleKnnGraph,
  handleSeasonality,
  handleBestForWindow,
  handleOptimize,
  handlePareto,
  handleInfoOverlap,
  handleHitTarget,
  handleWhatIf,
  handleFromBrief,
} from "./routes/portfolioEndpoints";
import {
  handleAgentsRegistry,
  handleFederatedSearch,
  handleCrossSimilarity,
  handleTaxonomyReverse,
} from "./routes/federationEndpoints";
import {
  handleAudienceCompose,
  handleAudienceSaturation,
  handleAffinityAudit,
  handleAudienceJourney,
  handleAudiencePrivacyCheck,
  handleAudienceHoldout,
  handleAudienceComposeAst,
} from "./routes/audienceAnalytics";
import {
  handleSnapshotSave,
  handleSnapshotList,
  handleSnapshotGet,
  handleSnapshotDelete,
  handleSnapshotDiff,
} from "./routes/snapshots";
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
import { operatorIdFromRequest } from "./utils/operatorId";
import {
    handleProtectedResourceMetadata,
    handleAuthorizationServerMetadata,
    handleOAuthTokenStub,
} from "./routes/wellKnown";
import { handleAdminReseed } from "./routes/adminReseed";
import { handleAdminPurge } from "./routes/adminPurge";
import { runScheduledPurge } from "./storage/scheduledPurge";
import { handleDemo } from "./routes/demo";
import { handleEstimate } from "./routes/estimate";
import { handleListOperations } from "./routes/listOperations";
import { handleGenerateSegment } from "./routes/generateSegment";
import { handlePrivacy } from "./routes/privacy";
import { handleToolLog } from "./routes/toolLog";
import { handleOverlap } from "./routes/overlap";
import { handleOpenApi } from "./routes/openApi";

// Seed data imported as text modules via wrangler assets
import { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv } from "./seedData";

// KV flag + module-level memoization gate the auto-seed.
// Workers isolates persist across requests; the module-level boolean short-circuits
// the KV read after the first successful check. The KV flag covers isolate recycling.
const KV_SEED_COMPLETE = "seed:complete";
let seedCheckedInIsolate = false;

// Paths that don't interact with the signal catalog — skip auto-seed entirely
// to keep the hot path (health, OAuth callbacks, MCP discovery) quick.
// /mcp is skipped here because the discovery methods (initialize, tools/list,
// ping) are public and hot — we don't want every unauth'd probe to kick off
// a KV read + seed-pipeline walk on a cold isolate. Authenticated tools/call
// requests that actually need the catalog hit /signals/* instead.
const SEED_SKIP_PREFIXES = [
    "/health",
    "/auth/",
    "/mcp",
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

        // Public paths — no auth required.
        //
        // /mcp is public at the HTTP layer, but inside the handler the
        // tools/call method gates on requireAuth — discovery methods
        // (initialize, tools/list, ping) stay reachable, paid-egress /
        // state-changing tools do not.
        //
        // /auth/linkedin/init and /auth/linkedin/status are DEMO_API_KEY
        // gated (not listed here). `init` gating is the load-bearing
        // defense: it's the only path that can issue a state UUID, so
        // an unauth'd attacker cannot start a flow whose callback we
        // would later accept. `status` gating prevents a token preview
        // + scope leak to any passerby.
        //
        // /auth/linkedin/callback is public. LinkedIn's 302 back to the
        // worker is a cross-origin top-level navigation — it carries the
        // OAuth `state` query param and nothing else. A bearer token on
        // that request is architecturally impossible without a cookie or
        // signed bootstrap layer, which we don't have. The defense for
        // this route is the OAuth state machine in auth/linkedin.ts:
        // /init writes a random UUID to the `oauth_state` D1 table, and
        // /callback consumes it atomically via
        // `DELETE ... WHERE state = ? AND expires_at > ? RETURNING state`
        // — SQLite serializes writes, so only one DELETE can consume a
        // given state. An attacker can't forge a valid state
        // without first coaxing a legitimate operator to hit /init —
        // which /init's auth gate prevents.
        //
        // Operational dependency: the `oauth_state` table is created by
        // migrations/0003_oauth_state.sql. Run
        // `wrangler d1 migrations apply adcp-signals-db --remote` before
        // deploying this code to any new environment, or /init and
        // /callback will throw on first use.
        const publicPaths = [
            "/",
            "/capabilities",
            "/health",
            "/mcp",
            // Sec-32: /signals/estimate is read-only dry-run sizing,
            // deliberately public for audience-transparency (same posture
            // as /capabilities + /signals/search).
            "/signals/estimate",
            // Sec-37: overlap is read-only sizing like /estimate.
            "/signals/overlap",
            // Sec-33: static privacy page referenced from ext.dts, and
            // public tool-call observability endpoint for agent usage
            // transparency (no arg values leak — see mcp/toolLog.ts).
            "/privacy",
            "/mcp/recent",
            // Sec-37 B9: machine-readable API reference.
            "/openapi.json",
            "/ucp/concepts",
            "/ucp/gts",
            "/ucp/simulate-handshake",
            // Sec-38 B5: 2D projection + pairwise cosine heatmap. Public
            // because the underlying data (real 512-d vectors) is already
            // public via /signals/{id}/embedding.
            "/ucp/projection",
            "/ucp/similarity",
            // Sec-41: Embedding Lab + audience analytics endpoints.
            // All read-only, all driven by public embedding data.
            "/ucp/query-vector",
            "/ucp/arithmetic",
            "/ucp/analogy",
            "/ucp/neighborhood",
            "/analytics/coverage-gaps",
            "/analytics/summary",
            "/analytics/lorenz",
            "/analytics/knn-graph",
            "/analytics/seasonality",
            "/analytics/best-for",
            "/portfolio/optimize",
            "/portfolio/pareto",
            "/portfolio/info-overlap",
            "/portfolio/from-brief",
            "/portfolio/what-if",
            "/portfolio/hit-target",
            "/agents/registry",
            "/agents/federated-search",
            "/agents/cross-similarity",
            "/taxonomy/reverse",
            // Sec-43: audience composer + activation-planning analytics.
            // Read-only — same posture as /portfolio/* and /analytics/*.
            "/audience/compose",
            "/audience/saturation",
            "/audience/affinity-audit",
            // Sec-44: journey funnel + privacy gate + holdout framework.
            "/audience/journey",
            "/audience/privacy-check",
            "/audience/holdout",
            // Sec-47: boolean expression AST composer (arbitrary trees over signals).
            "/audience/compose-ast",
            // Sec-41 seed diagnostic + idempotent incremental seed
            // trigger. /admin/reseed remains auth-gated (force=true path).
            "/admin/seed-status",
            "/admin/seed-now",
            "/auth/linkedin/callback",
            // RFC 9728 + 8414: OAuth discovery metadata MUST be reachable
            // without authentication so clients can bootstrap the flow.
            "/.well-known/oauth-protected-resource",
            "/.well-known/oauth-authorization-server",
            // Sec-24a: OAuth token endpoint is a documented 501 stub — must
            // be reachable without auth so clients following the well-known
            // advertisement get the terminal error rather than 401.
            "/oauth/token",
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

            if (method === "GET" && path === "/privacy") {
                response = handlePrivacy();

            } else if (method === "GET" && path === "/mcp/recent") {
                response = await handleToolLog(request, env, logger);

            } else if (method === "GET" && path === "/") {
                // Sec-31: DSP-style interactive demo UI. Landing at the bare
                // root surfaces a product-quality UI for exec/buyer demos;
                // programmatic clients already know to go to /mcp or /capabilities.
                response = handleDemo(env);

            } else if (method === "GET" && path === "/health") {
                response = jsonResponse({ status: "ok", version: "3.0" });

            } else if (method === "GET" && path.startsWith("/.well-known/oauth-protected-resource")) {
                // RFC 9728: resource path is the suffix after the well-known
                // prefix. `/.well-known/oauth-protected-resource/mcp` advertises
                // metadata for the agent's /mcp endpoint.
                const resourcePath = path.slice("/.well-known/oauth-protected-resource".length) || "/";
                response = handleProtectedResourceMetadata(request, resourcePath);

            } else if (method === "GET" && path === "/.well-known/oauth-authorization-server") {
                response = handleAuthorizationServerMetadata(request);

            } else if (method === "POST" && path === "/oauth/token") {
                response = handleOAuthTokenStub();

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

                // ── UCP 2D Projection (for visualization) ─────────────────────────────
            } else if (method === "GET" && path === "/ucp/projection") {
                response = handleUcpProjection();

                // ── UCP Pairwise Similarity Matrix ────────────────────────────────────
            } else if (method === "GET" && path === "/ucp/similarity") {
                response = handleUcpSimilarity(url);

                // ── Sec-41: Embedding Lab + Analytics endpoints ─────────────────────
            } else if (method === "POST" && path === "/ucp/query-vector") {
                response = await handleQueryVector(request);
            } else if (method === "POST" && path === "/ucp/arithmetic") {
                response = await handleArithmetic(request);
            } else if (method === "POST" && path === "/ucp/analogy") {
                response = await handleAnalogy(request);
            } else if (method === "POST" && path === "/ucp/neighborhood") {
                response = await handleNeighborhood(request);
            } else if (method === "GET" && path === "/analytics/coverage-gaps") {
                response = await handleCoverageGaps();
            } else if (method === "GET" && path === "/analytics/summary") {
                response = await handleAnalyticsSummary();
            } else if (method === "GET" && path === "/analytics/lorenz") {
                response = await handleLorenz(url, env, logger);
            } else if (method === "GET" && path === "/analytics/knn-graph") {
                response = handleKnnGraph(url);
            } else if (method === "GET" && path === "/analytics/seasonality") {
                response = await handleSeasonality(url, env, logger);
            } else if (method === "GET" && path === "/analytics/best-for") {
                response = await handleBestForWindow(url, env, logger);
            } else if (method === "POST" && path === "/portfolio/optimize") {
                response = await handleOptimize(request, env, logger);
            } else if (method === "GET" && path === "/portfolio/pareto") {
                response = await handlePareto(env, logger);
            } else if (method === "POST" && path === "/portfolio/info-overlap") {
                response = await handleInfoOverlap(request, env, logger);
            } else if (method === "POST" && path === "/portfolio/hit-target") {
                response = await handleHitTarget(request, env, logger);
            } else if (method === "POST" && path === "/portfolio/what-if") {
                response = await handleWhatIf(request, env, logger);
            } else if (method === "POST" && path === "/portfolio/from-brief") {
                response = await handleFromBrief(request, env, logger);

                // ── Sec-41 Part 3: Agent Federation (A2A) ───────────────────────────
            } else if (method === "GET" && path === "/agents/registry") {
                response = handleAgentsRegistry();
            } else if (method === "POST" && path === "/agents/federated-search") {
                response = await handleFederatedSearch(request, env, logger);
            } else if (method === "POST" && path === "/agents/cross-similarity") {
                response = await handleCrossSimilarity(request);
            } else if (method === "POST" && path === "/taxonomy/reverse") {
                response = await handleTaxonomyReverse(request, env, logger);

                // ── Sec-43: Audience Composer + activation analytics ────────────────
            } else if (method === "POST" && path === "/audience/compose") {
                response = await handleAudienceCompose(request, env, logger);
            } else if (method === "POST" && path === "/audience/saturation") {
                response = await handleAudienceSaturation(request, env, logger);
            } else if (method === "POST" && path === "/audience/affinity-audit") {
                response = await handleAffinityAudit(request, env, logger);
            } else if (method === "POST" && path === "/audience/journey") {
                response = await handleAudienceJourney(request, env, logger);
            } else if (method === "POST" && path === "/audience/privacy-check") {
                response = await handleAudiencePrivacyCheck(request, env, logger);
            } else if (method === "POST" && path === "/audience/holdout") {
                response = await handleAudienceHoldout(request, env, logger);
            } else if (method === "POST" && path === "/audience/compose-ast") {
                response = await handleAudienceComposeAst(request, env, logger);

                // ── Sec-44: Snapshots (auth-gated, operator-scoped) ───────────────────
            } else if (method === "POST" && path === "/snapshots") {
                response = await handleSnapshotSave(request, env, logger);
            } else if (method === "GET" && path === "/snapshots") {
                response = await handleSnapshotList(request, env, logger);
            } else if (method === "POST" && path === "/snapshots/diff") {
                response = await handleSnapshotDiff(request, env, logger);
            } else if (method === "GET" && path.startsWith("/snapshots/")) {
                const sid = path.replace("/snapshots/", "");
                response = await handleSnapshotGet(request, env, sid, logger);
            } else if (method === "DELETE" && path.startsWith("/snapshots/")) {
                const sid = path.replace("/snapshots/", "");
                response = await handleSnapshotDelete(request, env, sid, logger);

                // ── LinkedIn OAuth ────────────────────────────────────────────────────
                // Only /callback is in publicPaths. /init and /status are
                // DEMO_API_KEY-gated by the top-level auth check above. The
                // callback's safety rests on the atomic D1 state-consume —
                // see the publicPaths comment earlier in this file.
                //
                // Sec-18: token storage is namespaced per operator. We derive
                // the operator_id from the bearer token on /init and /status
                // (which are gated, so the bearer is guaranteed present).
                // /callback can't derive from a bearer (it's public — no
                // header), so it pulls operator_id from the consumed
                // oauth_state row instead. /signals/activate/linkedin gets
                // the operator_id passed through the dispatch.
            } else if (method === "GET" && path === "/auth/linkedin/init") {
                const opId = await operatorIdFromRequest(request);
                if (!opId) {
                    response = errorResponse("UNAUTHORIZED", "Bearer token required", 401);
                } else {
                    response = await handleLinkedInAuthInit(env, opId);
                }

            } else if (method === "GET" && path === "/auth/linkedin/callback") {
                response = await handleLinkedInAuthCallback(request, env);

            } else if (method === "GET" && path === "/auth/linkedin/status") {
                const opId = await operatorIdFromRequest(request);
                if (!opId) {
                    response = errorResponse("UNAUTHORIZED", "Bearer token required", 401);
                } else {
                    response = await handleLinkedInAuthStatus(env, opId);
                }

                // ── UCP Concept Registry ─────────────────────────────────────────────
            } else if (path.startsWith("/ucp/concepts")) {
                response = await handleConceptRoute(request, env, path);

                // ── NL Audience Query ────────────────────────────────────────────────
            } else if (method === "POST" && path === "/signals/query") {
                const body = await request.json() as { query: string; limit?: number };
                const catalog = await getAllSignalsForCatalog(getDb(env));
                response = await handleNLQuery(body, catalog, env);

                // ── Platform Activation (auth required) ──────────────────────────────
                // Sec-18: forward operator_id to the activation dispatch so
                // platform-specific routes (LinkedIn) can scope the calling
                // operator's tokens correctly.
            } else if (method === "POST" && path.startsWith("/signals/activate/")) {
                const platform = path.replace("/signals/activate/", "").split("/")[0] ?? "";
                const opId = await operatorIdFromRequest(request);
                if (!opId) {
                    response = errorResponse("UNAUTHORIZED", "Bearer token required", 401);
                } else {
                    response = await handleActivateDispatch(request, env, platform, opId);
                }

                // ── MCP ───────────────────────────────────────────────────────────────
                // OPTIONS is handled by the early global preflight at the top of fetch.
            } else if (path === "/mcp" || path.startsWith("/mcp")) {
                // Sec-35: pass ctx so the MCP handler can fire D1
                // tool-log writes via waitUntil without blocking the
                // response.
                response = await handleMcpRequest(request, env, logger, ctx);

                // ── Signal search ────────────────────────────────────────────────────
            } else if (
                (method === "POST" || method === "GET") &&
                path === "/signals/search"
            ) {
                response = await handleSearchSignals(request, env, logger);

                // ── Signal activate (legacy AdCP flow) ───────────────────────────────
            } else if (method === "POST" && path === "/signals/activate") {
                response = await handleActivateSignal(request, env, logger);

                // ── Signal estimate (dry-run sizing, public) ─────────────────────────
                // Sec-32: read-only sizer for the builder UI. Does NOT persist and
                // does NOT return a segment_id.
            } else if (method === "POST" && path === "/signals/estimate") {
                response = await handleEstimate(request, env, logger);

                // ── Signal overlap (Sec-37, public, read-only) ───────────────────────
            } else if (method === "POST" && path === "/signals/overlap") {
                response = await handleOverlap(request, env, logger);

                // ── OpenAPI spec (Sec-37 B9) ─────────────────────────────────────────
            } else if (method === "GET" && path === "/openapi.json") {
                response = handleOpenApi(request);

                // ── Signal generate (persist a composite from rules) ─────────────────
                // Sec-32: auth-gated persist counterpart to /estimate. Builder UI
                // calls this after the user commits.
            } else if (method === "POST" && path === "/signals/generate") {
                response = await handleGenerateSegment(request, env, logger);

                // ── Operations list (auth-gated, newest first) ───────────────────────
                // Sec-32: activations tab in the dashboard polls this every 10s.
            } else if (method === "GET" && path === "/operations") {
                response = await handleListOperations(request, env, logger);

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

                // ── Admin reseed (prod-safe, auth-gated) ─────────────────────────────
                // Drops the signals table and re-runs the pipeline with force=true.
                // Needed because shipping new signal definitions via code alone
                // doesn't repopulate the DB — seedPipeline short-circuits when
                // signals already exist.
            } else if (method === "POST" && path === "/admin/reseed") {
                response = await handleAdminReseed(request, env, logger);

                // Sec-41 diagnostic: expose seed state publicly (counts only, no data).
                // Useful to verify auto-incremental-seed is landing new signals
                // after a deploy without needing DEMO_API_KEY.
            } else if (method === "GET" && path === "/admin/seed-status") {
                const { countSignals } = await import("./storage/signalRepo");
                const { SEEDED_SIGNALS, DERIVED_SIGNALS } = await import("./domain/signalModel");
                const { ALL_ENRICHED_SIGNALS } = await import("./domain/enrichedSignalModel");
                const { EXTENDED_VERTICAL_SIGNALS } = await import("./domain/signals");
                const existing = await countSignals(getDb(env));
                const expected = SEEDED_SIGNALS.length + DERIVED_SIGNALS.length + ALL_ENRICHED_SIGNALS.length + EXTENDED_VERTICAL_SIGNALS.length;
                const versionedKey = KV_SEED_COMPLETE + ":v" + expected;
                const kvFlag = await env.SIGNALS_CACHE.get(versionedKey);
                response = jsonResponse({
                    existing,
                    expected,
                    delta: expected - existing,
                    versioned_kv_key: versionedKey,
                    kv_flag_set: kvFlag === "1",
                    auto_incremental_seed_needed: existing < expected,
                });

                // Sec-41: force-trigger the auto-seed from a public endpoint
                // (same code path as ctx.waitUntil(maybeSeed), just synchronous).
                // Safe because the pipeline is idempotent (ON CONFLICT DO UPDATE).
            } else if (method === "POST" && path === "/admin/seed-now") {
                const result = await runSeedPipeline(
                    getDb(env),
                    { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
                    logger,
                    false,
                );
                const { SEEDED_SIGNALS, DERIVED_SIGNALS } = await import("./domain/signalModel");
                const { ALL_ENRICHED_SIGNALS } = await import("./domain/enrichedSignalModel");
                const { EXTENDED_VERTICAL_SIGNALS } = await import("./domain/signals");
                const expected = SEEDED_SIGNALS.length + DERIVED_SIGNALS.length + ALL_ENRICHED_SIGNALS.length + EXTENDED_VERTICAL_SIGNALS.length;
                const versionedKey = KV_SEED_COMPLETE + ":v" + expected;
                if (result.seeded > 0 || result.skipped) {
                    await env.SIGNALS_CACHE.put(versionedKey, "1");
                }
                response = jsonResponse({ ...result, expected });

                // ── Admin purge (Sec-40, auth-gated) ──────────────────────────────────
                // Manual trigger for the weekly D1 housekeeping sweep. Same bearer
                // gate as /admin/reseed. Cron-scheduled counterpart is wired via
                // the `scheduled()` handler below.
            } else if (method === "POST" && path === "/admin/purge") {
                response = await handleAdminPurge(request, env, logger);

                // ── Signal embedding ─────────────────────────────────────────────────
            } else if (method === "GET" && path.match(/^\/signals\/[^/]+\/embedding$/)) {
                const signalId = path.split("/")[2] ?? "";
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

    // Sec-40: weekly D1 housekeeping.
    //
    // Triggered by the cron schedule declared in wrangler.toml under
    // [triggers].crons. Cloudflare invokes this outside the request path with
    // a synthetic ScheduledEvent; anyone hitting the public URL can never
    // reach it (it's not HTTP-addressable), so there's no auth concern here.
    //
    // ctx.waitUntil keeps the isolate alive until the purge finishes without
    // blocking Cloudflare's scheduler callback. Errors are logged but never
    // thrown — a failed housekeeping run must not take down subsequent
    // cron firings.
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        const reqId = requestId();
        const logger = createLogger(reqId);
        logger.info("cron_fired", { cron: event.cron, scheduled: new Date(event.scheduledTime).toISOString() });
        ctx.waitUntil(
            runScheduledPurge(env, logger)
                .then((r) => logger.info("cron_purge_done", { deleted: r.deleted, duration_ms: r.duration_ms, errors: r.errors.length }))
                .catch((err) => logger.error("cron_purge_failed", { error: String(err) }))
        );
    },
};

export function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        // Mcp-Session-Id, Mcp-Protocol-Version and Last-Event-ID are required by
        // the MCP Streamable HTTP transport. Omitting them causes browser-based
        // MCP clients to fail preflight and report it as a generic "blocked"
        // (which LLM-driven probes sometimes mislabel as CSRF).
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
        "Access-Control-Expose-Headers": "Mcp-Session-Id",
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
        // Sec-41: version the KV flag by the expected catalog size so new
        // code-shipped signals auto-land on next request after a deploy.
        // When we ship +85 signals via a code change, the expected count
        // changes → KV flag key changes → maybeSeed re-enters → incremental
        // upsert runs. Previous implementation short-circuited forever on
        // first seed regardless of code changes.
        const { SEEDED_SIGNALS, DERIVED_SIGNALS } = await import("./domain/signalModel");
        const { ALL_ENRICHED_SIGNALS } = await import("./domain/enrichedSignalModel");
        const { EXTENDED_VERTICAL_SIGNALS } = await import("./domain/signals");
        const expected = SEEDED_SIGNALS.length + DERIVED_SIGNALS.length
            + ALL_ENRICHED_SIGNALS.length + EXTENDED_VERTICAL_SIGNALS.length;
        const versionedKey = KV_SEED_COMPLETE + ":v" + expected;

        const flag = await env.SIGNALS_CACHE.get(versionedKey);
        if (flag) return;

        const result = await runSeedPipeline(
            getDb(env),
            { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
            logger
        );

        if (result.seeded > 0 || result.skipped) {
            await env.SIGNALS_CACHE.put(versionedKey, "1");
        }
    } catch (err) {
        seedCheckedInIsolate = false;
        logger.error("auto_seed_failed", { error: String(err) });
    }
}