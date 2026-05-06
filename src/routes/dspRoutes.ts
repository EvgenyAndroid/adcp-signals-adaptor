// src/routes/dspRoutes.ts
//
// Buy-side / DSP Canvas endpoints. Six routes covering the missing
// AdCP buy-side primitives (mocked locally via src/domain/dspMock.ts):
//
//   GET /dsp/campaigns                         — list demo campaigns
//   GET /dsp/campaigns/:id                     — single campaign card
//   GET /dsp/campaigns/:id/strategy            — bid strategy
//   GET /dsp/campaigns/:id/bid-stream          — recent bid stream samples
//   GET /dsp/campaigns/:id/inventory           — per-SSP performance
//   GET /dsp/campaigns/:id/brand-safety        — pre-bid filter stats
//   GET /dsp/campaigns/:id/pacing              — burn rate vs target
//   GET /dsp/campaigns/:id/attribution         — conversions + optimization signals
//
// Workshop framing: "every endpoint here mocks an AdCP buy-side
// primitive that doesn't exist yet — submit_bid_strategy,
// get_bid_opportunities, get_pacing_status, optimize_strategy. Same
// playbook as governanceMock + brandRightsMock — when upstream lands,
// swap to passthrough."
//
// All endpoints are GET-only and unauth — same posture as the
// governance/brand-rights preview routes.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import {
  listCampaigns,
  getCampaign,
  generateBidStrategy,
  generateBidStream,
  generateSspPerformance,
  generateBrandSafety,
  generatePacing,
  generateAttribution,
} from "../domain/dspMock";
import { AGENT_REGISTRY } from "../domain/agentRegistry";
import { callAgentTool, callAgentToolWithCircuit, probeAgent, getCircuitSnapshot } from "../federation/genericMcpClient";
import { buildCreateMediaBuyPayload, applyVendorAdapter, getDemoProviderAttestations } from "../domain/workflowOrchestration";
import { ensureSelfHooksInstalled } from "./agentsEndpoints";

// The 11 buy-side primitives we care about. The first 7 are AdCP-spec'd
// lifecycle tools (get_media_buy_delivery is in 3.0 GA; the rest are
// implied by media-buy mutability). The last 4 are completely unspec'd
// in 3.0 GA — none of the live directory agents advertise them.
const BUY_SIDE_TOOLS = [
  "create_media_buy",
  "update_media_buy",
  "cancel_media_buy",
  "pause_media_buy",
  "resume_media_buy",
  "get_media_buy_delivery",
  "get_media_buys",
  // Unspec'd primitives — 0 agents advertise these. Workshop-cite-able.
  "submit_bid_strategy",
  "get_bid_opportunities",
  "get_pacing_status",
  "optimize_strategy",
] as const;
const BUY_SIDE_LIFECYCLE_TOOLS = BUY_SIDE_TOOLS.slice(0, 7);
const BUY_SIDE_UNSPEC_TOOLS = BUY_SIDE_TOOLS.slice(7);

function parseCampaignIdFromPath(path: string): string | null {
  // /dsp/campaigns/<id>[/...]
  const m = path.match(/^\/dsp\/campaigns\/(cmp_[a-z0-9_]+)(?:\/[a-z-]+)?$/i);
  return m ? m[1]! : null;
}

// ── Phase 1: live coverage probe ────────────────────────────────────────────
//
// Probes every live buying agent for the 11 buy-side primitives. Returns
// a matrix that the Canvas surfaces as a live coverage strip.
// Cached 5 min — probe is non-trivial.

const COVERAGE_TTL_SEC = 300;
const COVERAGE_KEY = "dsp_coverage:v1";

interface CoverageEntry {
  agent_id: string;
  agent_name: string;
  vendor: string;
  mcp_url: string;
  alive: boolean;
  latency_ms?: number | null;
  tools_supported: string[];
  tools_missing: string[];
  error?: string;
}

interface CoverageReport {
  probed_at: string;
  cache: "hit" | "miss";
  buy_side_tools: typeof BUY_SIDE_TOOLS;
  spec_status: {
    spec_lifecycle: typeof BUY_SIDE_LIFECYCLE_TOOLS;
    unspec_primitives: typeof BUY_SIDE_UNSPEC_TOOLS;
  };
  coverage_summary: Record<string, { supported_count: number; total_buying_agents: number }>;
  agents: CoverageEntry[];
}

export async function handleDspCoverage(
  _request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  // KV cache first.
  try {
    const cached = await env.SIGNALS_CACHE.get(COVERAGE_KEY, "json");
    if (cached) return jsonResponse({ ...(cached as object), cache: "hit" });
  } catch { /* fall through */ }

  const buyingAgents = AGENT_REGISTRY.filter((a) => a.role === "buying" && a.stage === "live" && a.mcp_url);

  const entries: CoverageEntry[] = await Promise.all(buyingAgents.map(async (a): Promise<CoverageEntry> => {
    const probe = await probeAgent(a.mcp_url!, { timeoutMs: 8000 });
    const toolNames = (probe.tools || []).map((t) => t.name);
    const supported = BUY_SIDE_TOOLS.filter((t) => toolNames.includes(t));
    const missing = BUY_SIDE_TOOLS.filter((t) => !toolNames.includes(t));
    const out: CoverageEntry = {
      agent_id: a.id,
      agent_name: a.name,
      vendor: a.vendor,
      mcp_url: a.mcp_url!,
      alive: probe.alive,
      latency_ms: probe.latency_ms ?? null,
      tools_supported: supported,
      tools_missing: missing,
    };
    if (probe.error) out.error = probe.error;
    return out;
  }));

  // Per-tool support counts across all live buying agents.
  const summary: CoverageReport["coverage_summary"] = {};
  for (const t of BUY_SIDE_TOOLS) {
    summary[t] = {
      supported_count: entries.filter((e) => e.tools_supported.includes(t)).length,
      total_buying_agents: entries.length,
    };
  }

  const report: CoverageReport = {
    probed_at: new Date().toISOString(),
    cache: "miss",
    buy_side_tools: BUY_SIDE_TOOLS,
    spec_status: {
      spec_lifecycle: BUY_SIDE_LIFECYCLE_TOOLS,
      unspec_primitives: BUY_SIDE_UNSPEC_TOOLS,
    },
    coverage_summary: summary,
    agents: entries,
  };

  try {
    const { cache: _c, ...store } = report;
    void _c;
    await env.SIGNALS_CACHE.put(COVERAGE_KEY, JSON.stringify(store), { expirationTtl: COVERAGE_TTL_SEC });
  } catch (e) {
    logger.warn("dsp_coverage_kv_write_failed", { error: String((e as Error).message || e) });
  }

  return jsonResponse(report);
}

// ── Phase 2: live media-buys aggregator ─────────────────────────────────────
//
// Fans out get_media_buys across every agent that advertises it. Returns
// a flat aggregated list with per-buy provenance (which agent owns it).
// Auth-gated agents surface as `ok: false` with the same regex detection
// the Brand Canvas uses.

const AUTH_GATE_RE = /principal id not found|authentication required|auth_token_invalid|unauthorized|\b401\b|tenant policy/i;

interface MediaBuyLite {
  media_buy_id?: string;
  buyer_ref?: string;
  brand?: { domain?: string; name?: string };
  brand_manifest?: { brand?: string; advertiser?: string };
  status?: string;
  total_budget?: { amount?: number } | number;
  start_time?: string;
  end_time?: string;
  // Vendors return arbitrary additional fields — we pass through.
}

interface MediaBuyOwned extends MediaBuyLite {
  source_agent_id: string;
  source_agent_name: string;
  source_vendor: string;
}

export async function handleDspMediaBuysLive(
  _request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const coverage = await getCoverageInternal(env, logger);
  const capable = coverage.agents.filter((e) => e.tools_supported.includes("get_media_buys"));

  const results = await Promise.all(capable.map(async (a) => {
    const start = Date.now();
    // Wave 2: circuit-breaker wrapped for fan-out resilience.
    const r = await callAgentToolWithCircuit(a.mcp_url, "get_media_buys", {}, { timeoutMs: 12_000 });
    const latency = Date.now() - start;
    let buys: MediaBuyOwned[] = [];
    let authGated = false;
    let errorText: string | undefined;
    if (r.ok && r.structured_content) {
      const sc = r.structured_content as { media_buys?: MediaBuyLite[]; results?: MediaBuyLite[] };
      const list = sc.media_buys ?? sc.results ?? [];
      buys = list.map((b) => ({
        ...b,
        source_agent_id: a.agent_id,
        source_agent_name: a.agent_name,
        source_vendor: a.vendor,
      }));
    } else {
      // Look at content[].text for auth-gate detection.
      const blocks = (r.content as Array<{ type?: string; text?: string }> | undefined) || [];
      for (const blk of blocks) {
        if (blk?.type === "text" && typeof blk.text === "string") {
          if (AUTH_GATE_RE.test(blk.text)) authGated = true;
          if (!errorText) errorText = blk.text.slice(0, 200);
          break;
        }
      }
      if (!errorText && r.error) errorText = r.error;
    }
    return {
      agent_id: a.agent_id,
      agent_name: a.agent_name,
      vendor: a.vendor,
      ok: r.ok,
      auth_gated: authGated,
      error: errorText ?? null,
      latency_ms: latency,
      buys,
    };
  }));

  const allBuys = results.flatMap((r) => r.buys);
  const okCount = results.filter((r) => r.ok).length;
  const authCount = results.filter((r) => r.auth_gated).length;

  return jsonResponse({
    fetched_at: new Date().toISOString(),
    capable_agent_count: capable.length,
    ok_count: okCount,
    auth_gated_count: authCount,
    total_media_buys: allBuys.length,
    media_buys: allBuys,
    per_agent: results,
  });
}

// ── Phase 3: live delivery for a specific media_buy ─────────────────────────
//
// Calls get_media_buy_delivery on the owning agent. The Canvas pacing
// lane uses this when a real campaign is selected; falls back to mock
// when no agent owns a buy for the campaign's brand.

export async function handleDspDeliveryLive(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/dsp\/media-buys\/([^/]+)\/delivery-live$/);
  if (!m) return errorResponse("INVALID_INPUT", "expected /dsp/media-buys/<id>/delivery-live", 400);
  const mediaBuyId = decodeURIComponent(m[1]!);
  const agentId = url.searchParams.get("agent_id");
  if (!agentId) return errorResponse("INVALID_INPUT", "agent_id query param required", 400);

  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent || !agent.mcp_url) return errorResponse("UNKNOWN_AGENT", "no agent " + agentId, 404);

  const start = Date.now();
  const r = await callAgentTool(
    agent.mcp_url,
    "get_media_buy_delivery",
    { media_buy_id: mediaBuyId },
    { timeoutMs: 12_000 },
  );
  const latency = Date.now() - start;

  let authGated = false;
  let errorText: string | undefined;
  if (!r.ok) {
    const blocks = (r.content as Array<{ type?: string; text?: string }> | undefined) || [];
    for (const blk of blocks) {
      if (blk?.type === "text" && typeof blk.text === "string") {
        if (AUTH_GATE_RE.test(blk.text)) authGated = true;
        if (!errorText) errorText = blk.text.slice(0, 280);
        break;
      }
    }
    if (!errorText && r.error) errorText = r.error;
  }

  return jsonResponse({
    media_buy_id: mediaBuyId,
    agent_id: agentId,
    agent_name: agent.name,
    vendor: agent.vendor,
    ok: r.ok,
    auth_gated: authGated,
    error: errorText ?? null,
    latency_ms: latency,
    delivery: r.structured_content ?? null,
    content: r.content ?? null,
  });
}

async function getCoverageInternal(env: Env, logger: Logger): Promise<CoverageReport> {
  // Reuse the coverage handler's body via a synthetic fake request.
  const req = new Request("http://internal/dsp/agents/coverage", { method: "GET" });
  const res = await handleDspCoverage(req, env, logger);
  return await res.json<CoverageReport>();
}

export async function handleDspCampaigns(
  request: Request,
  _env: Env,
  _logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // GET /dsp/campaigns
  if (path === "/dsp/campaigns") {
    const list = listCampaigns().map((c) => ({
      campaign_id: c.campaign_id,
      name: c.name,
      brand_name: c.brand_name,
      brand_domain: c.brand_domain,
      kpi: c.kpi,
      kpi_target: c.kpi_target,
      kpi_unit: c.kpi_unit,
      budget_total_usd: c.budget_total_usd,
      flight_start: c.flight_start,
      flight_end: c.flight_end,
    }));
    return jsonResponse({ count: list.length, campaigns: list });
  }

  const id = parseCampaignIdFromPath(path);
  if (!id) {
    return errorResponse("INVALID_INPUT", "expected /dsp/campaigns/<id>[/<sub>]", 400);
  }
  const c = getCampaign(id);
  if (!c) return errorResponse("CAMPAIGN_NOT_FOUND", "no campaign with id " + id, 404);

  // GET /dsp/campaigns/:id  (full card)
  if (path === `/dsp/campaigns/${id}`) {
    return jsonResponse(c);
  }

  if (path.endsWith("/strategy")) {
    return jsonResponse({ mode: "stub", campaign_id: id, strategy: generateBidStrategy(c) });
  }
  if (path.endsWith("/bid-stream")) {
    return jsonResponse({ mode: "stub", campaign_id: id, samples: generateBidStream(c, 60) });
  }
  if (path.endsWith("/inventory")) {
    return jsonResponse({ mode: "stub", campaign_id: id, ssps: generateSspPerformance(c) });
  }
  if (path.endsWith("/brand-safety")) {
    return jsonResponse({ mode: "stub", campaign_id: id, brand_safety: generateBrandSafety(c) });
  }
  if (path.endsWith("/pacing")) {
    return jsonResponse({ mode: "stub", campaign_id: id, pacing: generatePacing(c) });
  }
  if (path.endsWith("/attribution")) {
    const pacing = generatePacing(c);
    const attribution = generateAttribution(c, pacing);
    return jsonResponse({ mode: "stub", campaign_id: id, attribution });
  }

  return errorResponse("NOT_FOUND", "unknown DSP sub-resource at " + path, 404);
}

// ── B: /dsp/campaigns/:id/fire-live ────────────────────────────────────────
//
// Picks a buying agent (default: adzymic_apx) and fires create_media_buy
// with a synthesized payload from the campaign brief + live get_signals
// against the campaign's audience_brief. Reuses sell-side
// buildCreateMediaBuyPayload + applyVendorAdapter so vendor-adapter
// rules (Sec-48r6) are applied identically.

interface FireLiveBody {
  agent_id?: string;
  signal_ids?: string[];
}

export async function handleDspCampaignFireLive(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/dsp\/campaigns\/(cmp_[a-z0-9_]+)\/fire-live$/);
  if (!m) return errorResponse("INVALID_INPUT", "expected /dsp/campaigns/<id>/fire-live", 400);
  const c = getCampaign(m[1]!);
  if (!c) return errorResponse("CAMPAIGN_NOT_FOUND", "no campaign with id " + m[1], 404);

  let body: FireLiveBody = {};
  try { body = await request.json(); } catch { /* default agent below */ }

  const agentId = body.agent_id || "adzymic_apx";
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent || !agent.mcp_url) return errorResponse("UNKNOWN_AGENT", "no agent " + agentId, 404);

  const workflowId = "wf_dsp_" + Math.random().toString(36).slice(2, 10);
  const chosenSignals = (Array.isArray(body.signal_ids) ? body.signal_ids : []).filter((s) => typeof s === "string");

  const payload = buildCreateMediaBuyPayload({
    workflowId,
    agentId: agent.id,
    brief: c.audience_brief,
    chosenProductId: null,
    chosenSignalIds: chosenSignals,
    chosenFormatIds: [],
    brandContext: { domain: c.brand_domain, name: c.brand_name },
    totalBudgetUsd: c.budget_total_usd,
    attestations: chosenSignals.length > 0 ? getDemoProviderAttestations() : [],
  });
  const wirePayload = applyVendorAdapter(agent.id, payload, { brandDomain: c.brand_domain });

  const start = Date.now();
  const r = await callAgentTool(agent.mcp_url, "create_media_buy", wirePayload as unknown as Record<string, unknown>, { timeoutMs: 15_000 });
  const latency = Date.now() - start;

  let authGated = false;
  let errorText: string | undefined;
  if (!r.ok) {
    const blocks = (r.content as Array<{ type?: string; text?: string }> | undefined) || [];
    for (const blk of blocks) {
      if (blk?.type === "text" && typeof blk.text === "string") {
        if (AUTH_GATE_RE.test(blk.text)) authGated = true;
        if (!errorText) errorText = blk.text.slice(0, 280);
        break;
      }
    }
    if (!errorText && r.error) errorText = r.error;
  }

  logger.info("dsp_fire_live", {
    campaign_id: c.campaign_id, agent_id: agent.id, ok: r.ok, latency_ms: latency, auth_gated: authGated,
  });

  return jsonResponse({
    campaign_id: c.campaign_id,
    workflow_id: workflowId,
    agent_id: agent.id,
    agent_name: agent.name,
    vendor: agent.vendor,
    ok: r.ok,
    auth_gated: authGated,
    error: errorText ?? null,
    latency_ms: latency,
    payload_preview: payload,
    result: r.structured_content ?? null,
    content: r.content ?? null,
  });
}

// ── A: /dsp/media-buys/:id/update-live ─────────────────────────────────────
//
// Calls update_media_buy on the owning agent with a synthesized strategy
// diff (e.g. budget reallocation, signal swap). Mirrors the optimization-
// signals output from Lane 5 — turns the visualized feedback into a real
// vendor call. Even when auth-gated, the response surfaces the boundary.

interface UpdateLiveBody {
  agent_id?: string;
  // The diff body is opaque to us; vendors define their own update shape.
  // We ship a minimal one that's broadly accepted.
  patch?: Record<string, unknown>;
}

export async function handleDspMediaBuyUpdateLive(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/dsp\/media-buys\/([^/]+)\/update-live$/);
  if (!m) return errorResponse("INVALID_INPUT", "expected /dsp/media-buys/<id>/update-live", 400);
  const mediaBuyId = decodeURIComponent(m[1]!);

  let body: UpdateLiveBody = {};
  try { body = await request.json(); } catch { /* default below */ }

  const agentId = body.agent_id;
  if (!agentId) return errorResponse("INVALID_INPUT", "agent_id required in body", 400);
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent || !agent.mcp_url) return errorResponse("UNKNOWN_AGENT", "no agent " + agentId, 404);

  // Default patch — workshop-realistic strategy-diff: pause + bump budget +
  // swap signals. Vendors that don't accept all keys ignore extras.
  const patch = body.patch ?? {
    status: "paused",
    targeting_overlay: { required_axe_signals: ["sig_int_market_beverages", "sig_aff_qsr_visitors"] },
    notes: "Applied optimization signals: boost PubMatic; decay OpenX; suppress dayparting 02-05.",
  };

  const args: Record<string, unknown> = { media_buy_id: mediaBuyId, ...patch };
  const start = Date.now();
  const r = await callAgentTool(agent.mcp_url, "update_media_buy", args, { timeoutMs: 12_000 });
  const latency = Date.now() - start;

  let authGated = false;
  let errorText: string | undefined;
  if (!r.ok) {
    const blocks = (r.content as Array<{ type?: string; text?: string }> | undefined) || [];
    for (const blk of blocks) {
      if (blk?.type === "text" && typeof blk.text === "string") {
        if (AUTH_GATE_RE.test(blk.text)) authGated = true;
        if (!errorText) errorText = blk.text.slice(0, 280);
        break;
      }
    }
    if (!errorText && r.error) errorText = r.error;
  }

  logger.info("dsp_update_live", {
    media_buy_id: mediaBuyId, agent_id: agent.id, ok: r.ok, latency_ms: latency, auth_gated: authGated,
  });

  return jsonResponse({
    media_buy_id: mediaBuyId,
    agent_id: agent.id,
    agent_name: agent.name,
    vendor: agent.vendor,
    ok: r.ok,
    auth_gated: authGated,
    error: errorText ?? null,
    latency_ms: latency,
    patch_sent: args,
    result: r.structured_content ?? null,
    content: r.content ?? null,
  });
}

// ── C: /dsp/campaigns/:id/signals-live ─────────────────────────────────────
//
// Calls get_signals on every live signals agent with the campaign's
// audience_brief. Returns merged + ranked top results so Lane 1 can
// show real signals being targeted, not synthetic.

export async function handleDspCampaignSignalsLive(
  _request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(_request.url);
  const m = url.pathname.match(/^\/dsp\/campaigns\/(cmp_[a-z0-9_]+)\/signals-live$/);
  if (!m) return errorResponse("INVALID_INPUT", "expected /dsp/campaigns/<id>/signals-live", 400);
  const c = getCampaign(m[1]!);
  if (!c) return errorResponse("CAMPAIGN_NOT_FOUND", "no campaign with id " + m[1], 404);

  const signalsAgents = AGENT_REGISTRY.filter((a) => a.role === "signals" && a.stage === "live" && a.mcp_url);

  interface SignalLite { source_agent_id: string; source_agent_name: string; signal_agent_segment_id: string; name?: string; coverage_percentage?: number; estimated_audience_size?: number }

  const results = await Promise.all(signalsAgents.map(async (a) => {
    const start = Date.now();
    // Wave 2: circuit-breaker wrapped — closes briefly on flapping vendors.
    const r = await callAgentToolWithCircuit(a.mcp_url!, "get_signals", {
      signal_spec: c.audience_brief,
      max_results: 10,
      // pagination envelope intentionally NOT sent — see agentsEndpoints
      // comment about Pydantic-strict vendors rejecting unknown keywords.
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
    }, { timeoutMs: 10_000, env });
    const latency = Date.now() - start;
    interface SignalShape { signal_agent_segment_id?: string; id?: string; name?: string; coverage_percentage?: number; estimated_audience_size?: number }
    const sc = (r.structured_content as { signals?: SignalShape[] } | undefined) ?? {};
    const signals: SignalLite[] = (sc.signals ?? []).slice(0, 10).map((s) => {
      const item: SignalLite = {
        source_agent_id: a.id,
        source_agent_name: a.name,
        signal_agent_segment_id: s.signal_agent_segment_id ?? s.id ?? "",
      };
      if (s.name !== undefined) item.name = s.name;
      if (s.coverage_percentage !== undefined) item.coverage_percentage = s.coverage_percentage;
      if (s.estimated_audience_size !== undefined) item.estimated_audience_size = s.estimated_audience_size;
      return item;
    });
    return { agent_id: a.id, agent_name: a.name, ok: r.ok, latency_ms: latency, signal_count: signals.length, signals, error: r.error };
  }));

  // Merge + rank top-5 by coverage.
  const merged: SignalLite[] = results.flatMap((r) => r.signals);
  merged.sort((a, b) => (b.coverage_percentage ?? 0) - (a.coverage_percentage ?? 0));

  return jsonResponse({
    campaign_id: c.campaign_id,
    audience_brief: c.audience_brief,
    per_agent: results,
    top_signals: merged.slice(0, 5),
  });
}

// ── D: /dsp/campaigns/:id/products-live ────────────────────────────────────
//
// Calls get_products on every capable buying agent with the campaign's
// audience_brief + brand context. Aggregates real product candidates
// the campaign could target — workshop story: "the inventory side IS
// live and discoverable; only the bid-time primitives are unspec'd".

export async function handleDspCampaignProductsLive(
  _request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(_request.url);
  const m = url.pathname.match(/^\/dsp\/campaigns\/(cmp_[a-z0-9_]+)\/products-live$/);
  if (!m) return errorResponse("INVALID_INPUT", "expected /dsp/campaigns/<id>/products-live", 400);
  const c = getCampaign(m[1]!);
  if (!c) return errorResponse("CAMPAIGN_NOT_FOUND", "no campaign with id " + m[1], 404);

  const coverage = await getCoverageInternal(env, logger);
  const capable = coverage.agents.filter((e) => e.tools_supported.includes("create_media_buy"));

  const results = await Promise.all(capable.map(async (a) => {
    const start = Date.now();
    // Wave 2: circuit-breaker wrapped.
    const r = await callAgentToolWithCircuit(a.mcp_url, "get_products", {
      brief: c.audience_brief,
      brand: { domain: c.brand_domain, name: c.brand_name },
    }, { timeoutMs: 12_000 });
    const latency = Date.now() - start;
    interface ProductShape { product_id?: string; id?: string; name?: string; description?: string; cpm_floor?: number; pricing_options?: Array<{ id?: string; cpm?: number }> }
    const sc = (r.structured_content as { products?: ProductShape[] } | undefined) ?? {};
    const products = (sc.products ?? []).slice(0, 5).map((p) => ({
      source_agent_id: a.agent_id,
      source_agent_name: a.agent_name,
      product_id: p.product_id ?? p.id ?? "",
      name: p.name,
      description: p.description,
      cpm_floor: p.cpm_floor ?? (p.pricing_options?.[0]?.cpm),
    }));
    let authGated = false;
    let errorText: string | undefined;
    if (!r.ok) {
      const blocks = (r.content as Array<{ type?: string; text?: string }> | undefined) || [];
      for (const blk of blocks) {
        if (blk?.type === "text" && typeof blk.text === "string") {
          if (AUTH_GATE_RE.test(blk.text)) authGated = true;
          if (!errorText) errorText = blk.text.slice(0, 200);
          break;
        }
      }
    }
    return { agent_id: a.agent_id, agent_name: a.agent_name, vendor: a.vendor, ok: r.ok, auth_gated: authGated, error: errorText ?? null, latency_ms: latency, products };
  }));

  const merged = results.flatMap((r) => r.products);

  return jsonResponse({
    campaign_id: c.campaign_id,
    audience_brief: c.audience_brief,
    capable_agent_count: capable.length,
    ok_count: results.filter((r) => r.ok).length,
    auth_gated_count: results.filter((r) => r.auth_gated).length,
    total_products: merged.length,
    per_agent: results,
    top_products: merged.slice(0, 8),
  });
}

// ── E: /dsp/agents/:id/capabilities-live ───────────────────────────────────
//
// Calls get_adcp_capabilities on the agent. Returns the full declared
// capabilities object so the UI can show idempotency support, supported
// protocols, governance flags, etc. Closes the "what does this agent
// actually claim to support" question.

export async function handleDspAgentCapabilities(
  _request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(_request.url);
  const m = url.pathname.match(/^\/dsp\/agents\/([a-z0-9_]+)\/capabilities-live$/i);
  if (!m) return errorResponse("INVALID_INPUT", "expected /dsp/agents/<id>/capabilities-live", 400);
  const agentId = m[1]!;
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent || !agent.mcp_url) return errorResponse("UNKNOWN_AGENT", "no agent " + agentId, 404);

  const start = Date.now();
  const r = await callAgentTool(agent.mcp_url, "get_adcp_capabilities", {}, { timeoutMs: 10_000 });
  const latency = Date.now() - start;

  return jsonResponse({
    agent_id: agent.id,
    agent_name: agent.name,
    vendor: agent.vendor,
    ok: r.ok,
    latency_ms: latency,
    error: r.error ?? null,
    capabilities: r.structured_content ?? null,
  });
}

// ── Wave 2: GET /dsp/circuits — diagnostic snapshot of circuit-breaker state
//
// Read-only view of which agent URLs have open / half-open / closed
// circuits. Useful in the workshop to demonstrate the resilience
// layer in action ("see, when adzymic times out 3 times, the circuit
// trips and we stop hitting it for 60s").

export async function handleDspCircuits(
  _request: Request,
  _env: Env,
  _logger: Logger,
): Promise<Response> {
  const snap = getCircuitSnapshot();
  // Annotate with agent_id where we recognize the URL.
  const annotated = snap.map((s) => {
    const agent = AGENT_REGISTRY.find((a) => a.mcp_url === s.url);
    return {
      ...s,
      agent_id: agent?.id ?? null,
      agent_name: agent?.name ?? null,
      vendor: agent?.vendor ?? null,
    };
  });
  return jsonResponse({
    threshold: 3,
    open_duration_ms: 60_000,
    retry_max: 1,
    retry_backoff_base_ms: 250,
    circuits: annotated,
  });
}
