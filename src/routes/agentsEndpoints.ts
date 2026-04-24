// src/routes/agentsEndpoints.ts
// Sec-48: agent syndication — directory listing, live probe fan-out,
// and cross-agent orchestration over the generic MCP client.
//
//   GET  /agents/directory      — static registry (no network)
//   GET  /agents/probe-all      — probe every live agent in parallel
//   POST /agents/orchestrate    — fan-out a signals search to all live
//                                  signals agents; merge results
//
// Existing Sec-41 endpoints stay in place:
//   GET  /agents/registry       — legacy-shape list (kept for back-compat)
//   POST /agents/federated-search — Dstillery-specific; the new
//                                  /agents/orchestrate is its superset

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse, readJsonBody } from "./shared";
import {
  AGENT_REGISTRY,
  getLiveAgents,
  getAgentsByRole,
  findAgent,
  SELF_URL,
  SELF_AGENT_ID,
  type RegisteredAgent,
} from "../domain/agentRegistry";
import {
  probeAgents,
  callAgentTool,
  installSelfProbeHook,
  installSelfToolHook,
  type ProbeResult,
  type ToolCallResult,
} from "../federation/genericMcpClient";
import { searchSignalsService } from "../domain/signalService";
import { getDb } from "../storage/db";
import {
  pickTopSignals,
  pickTopFormatIds,
  pickProductPerAgent,
  buildCreateMediaBuyPayload,
  newWorkflowId,
  productId as productIdOf,
  signalId as signalIdOf,
  extractMcpToolArray,
  describeToolResult,
  deriveCreativeFilter,
  deriveProductFilter,
  type SignalLite,
  type ProductLite,
  type MediaBuyPayload,
  type CreativeFilter,
  type ProductFilter,
} from "../domain/workflowOrchestration";
import { ADCP_TOOLS } from "../mcp/tools";

// Sec-48b: hook the generic MCP client with a self-detector. When the orchestrator
// probes or fans-out to our own URL, Cloudflare Workers refuse self-fetch; we
// short-circuit and return our real tool list / dispatch the call in-process.
let _envHookInstalled = false;
function ensureSelfHooksInstalled(env: Env, logger: Logger): void {
  if (_envHookInstalled) return;
  _envHookInstalled = true;
  installSelfProbeHook((url) => {
    if (!isSelfUrl(url)) return null;
    const self = AGENT_REGISTRY.find((a) => a.id === SELF_AGENT_ID);
    // Sec-48e: emit the same shape as a real tools/list — every external
    // agent's probe returns description + inputSchema, and the Orchestrator
    // UI renders a params table from those. Without this, the self card
    // showed 8 tools with "No parameter schema advertised" while Claire and
    // Adzymic rendered full schemas. Source ADCP_TOOLS is the single tool
    // registry also served at POST /mcp tools/list.
    return {
      server_info: { name: self?.name ?? "evgeny-signals", version: "48.0" },
      tools: ADCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });
  installSelfToolHook((url, name, args) => {
    if (!isSelfUrl(url)) return null;
    return selfToolDispatch(name, args, env, logger);
  });
}

function isSelfUrl(url: string): boolean {
  const a = url.replace(/\/+$/, "");
  const b = (SELF_URL + "/mcp").replace(/\/+$/, "");
  return a === b || a === SELF_URL.replace(/\/+$/, "");
}

/** Direct-dispatch our own signals tools without the HTTP roundtrip.
 * Covers get_signals (the only tool orchestrate currently fans to); other
 * tools fall through to "tool_not_self_dispatchable" so a bug can be caught
 * rather than silently returning empty. */
async function selfToolDispatch(name: string, args: Record<string, unknown>, env: Env, logger: Logger): Promise<ToolCallResult> {
  const start = Date.now();
  void logger;
  try {
    if (name === "get_signals") {
      const brief = String(args.signal_spec ?? args.brief ?? "");
      const maxResults = Math.max(1, Math.min(50, Number(args.max_results) || 10));
      const db = getDb(env);
      // searchSignalsService needs a KVNamespace; env.SIGNALS_CACHE is the
      // operator-scoped KV used elsewhere in the codebase.
      const result = await searchSignalsService(db, env.SIGNALS_CACHE, {
        brief,
        limit: maxResults,
      });
      return {
        ok: true,
        latency_ms: Date.now() - start,
        structured_content: { signals: result.signals, count: result.count },
      };
    }
    return {
      ok: false,
      error: `tool_not_self_dispatchable: ${name}`,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e), latency_ms: Date.now() - start };
  }
}

// ── GET /agents/directory ───────────────────────────────────────────────────

export function handleAgentsDirectory(): Response {
  const byRole: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  for (const a of AGENT_REGISTRY) {
    byRole[a.role] = (byRole[a.role] ?? 0) + 1;
    byStage[a.stage] = (byStage[a.stage] ?? 0) + 1;
  }
  return jsonResponse({
    version: "sec_48_v1",
    count: AGENT_REGISTRY.length,
    by_role: byRole,
    by_stage: byStage,
    agents: AGENT_REGISTRY,
    note: "Static directory snapshot. Hit /agents/probe-all for live liveness + tool-list per agent.",
  });
}

// ── GET /agents/probe-all ───────────────────────────────────────────────────

export async function handleAgentsProbeAll(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role");
  const timeoutMs = Math.max(1000, Math.min(30_000, Number(url.searchParams.get("timeout_ms")) || 8000));

  let targets: RegisteredAgent[] = getLiveAgents();
  if (roleFilter) targets = targets.filter((a) => a.role === roleFilter);

  const withUrls = targets.filter((a): a is RegisteredAgent & { mcp_url: string } => !!a.mcp_url);
  const urls = withUrls.map((a) => a.mcp_url);
  const probeResults = await probeAgents(urls, { timeoutMs });

  const results = withUrls.map((agent, i) => {
    const r = probeResults[i]!;
    const diff: { baseline?: number; observed?: number; delta?: number } = {};
    if (agent.directory_tool_count !== undefined) diff.baseline = agent.directory_tool_count;
    if (r.tools) diff.observed = r.tools.length;
    if (diff.baseline !== undefined && diff.observed !== undefined) diff.delta = diff.observed - diff.baseline;
    return {
      id: agent.id,
      name: agent.name,
      vendor: agent.vendor,
      role: agent.role,
      mcp_url: agent.mcp_url,
      probe: r,
      tool_count_diff: diff,
    };
  });

  const aliveCount = results.filter((r) => r.probe.alive).length;
  const avgLatency = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.probe.latency_ms, 0) / results.length)
    : 0;

  logger.info("agents_probe_all", {
    probed: results.length,
    alive: aliveCount,
    role_filter: roleFilter ?? null,
  });

  return jsonResponse({
    probed_at: new Date().toISOString(),
    timeout_ms: timeoutMs,
    ...(roleFilter ? { role_filter: roleFilter } : {}),
    count: results.length,
    alive_count: aliveCount,
    avg_latency_ms: avgLatency,
    results,
    note: "Per-agent probe result. tool_count_diff compares directory baseline vs live tools/list — negative delta means fewer tools than directory declared.",
  });
}

// ── POST /agents/orchestrate ────────────────────────────────────────────────
// Fan-out a signal-discovery brief to all live signals agents in parallel.
// Each agent gets called with tools/call on its declared signals tool;
// results are merged and tagged with source_agent for provenance.

interface OrchestrateBody {
  brief?: string;
  tool?: string;
  max_results_per_agent?: number;
  include_agents?: string[];   // optional allowlist
  exclude_agents?: string[];   // optional denylist
  timeout_ms?: number;
}

interface OrchestratePerAgent {
  id: string;
  name: string;
  vendor: string;
  url: string;
  ok: boolean;
  error?: string;
  latency_ms: number;
  signal_count: number;
  signals: unknown[];
}

export async function handleAgentsOrchestrate(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const parsed = await readJsonBody<OrchestrateBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: OrchestrateBody = parsed.kind === "parsed" ? parsed.data : {};
  if (!body.brief || body.brief.trim().length === 0) return errorResponse("INVALID_INPUT", "brief required", 400);
  if (body.brief.length > 500) return errorResponse("INVALID_INPUT", "brief max 500 chars", 400);

  const tool = body.tool ?? "get_signals";
  const maxResults = Math.max(1, Math.min(50, body.max_results_per_agent ?? 10));
  const timeoutMs = Math.max(1000, Math.min(30_000, body.timeout_ms ?? 12_000));

  let targets: RegisteredAgent[] = getAgentsByRole("signals").filter((a) => a.stage === "live" && a.mcp_url);
  if (body.include_agents?.length) {
    const allow = new Set(body.include_agents);
    targets = targets.filter((a) => allow.has(a.id));
  }
  if (body.exclude_agents?.length) {
    const deny = new Set(body.exclude_agents);
    targets = targets.filter((a) => !deny.has(a.id));
  }
  if (targets.length === 0) return errorResponse("NO_TARGETS", "No live signals agents matched filters.", 400);

  const perAgent: OrchestratePerAgent[] = await Promise.all(targets.map(async (a): Promise<OrchestratePerAgent> => {
    const res = await callAgentTool(a.mcp_url!, tool, {
      signal_spec: body.brief,
      max_results: maxResults,
    }, { timeoutMs });
    const structured = res.structured_content as { signals?: unknown[] } | undefined;
    const signals = structured?.signals ?? [];
    const out: OrchestratePerAgent = {
      id: a.id,
      name: a.name,
      vendor: a.vendor,
      url: a.mcp_url!,
      ok: res.ok,
      latency_ms: res.latency_ms,
      signal_count: signals.length,
      signals: signals.map((s) => ({ source_agent: a.id, ...(s as object) })),
    };
    if (res.error) out.error = res.error;
    return out;
  }));

  const merged = perAgent.flatMap((p) => p.signals);
  const agentsQueried = perAgent.map((p) => p.id);
  const agentsSucceeded = perAgent.filter((p) => p.ok).map((p) => p.id);
  const agentsFailed = perAgent.filter((p) => !p.ok).map((p) => ({ id: p.id, error: p.error ?? "unknown" }));

  logger.info("agents_orchestrate", {
    brief_chars: body.brief.length,
    agents_queried: agentsQueried.length,
    agents_succeeded: agentsSucceeded.length,
    total_signals: merged.length,
    max_per_agent: maxResults,
  });

  return jsonResponse({
    brief: body.brief,
    tool,
    agents_queried: agentsQueried,
    agents_succeeded: agentsSucceeded,
    agents_failed: agentsFailed,
    per_agent: perAgent.map((p) => ({
      id: p.id, name: p.name, vendor: p.vendor,
      ok: p.ok, ...(p.error ? { error: p.error } : {}),
      latency_ms: p.latency_ms, signal_count: p.signal_count,
    })),
    total_signals: merged.length,
    signals: merged,
    method: "parallel_mcp_tools_call_per_live_signals_agent",
    note: "Signals from each agent carry source_agent to preserve provenance. Failed agents don't block the merge. For schema-normalized signals use the existing /agents/federated-search which applies a Dstillery-specific mapper; this endpoint is transport-level only.",
  });
}

// ── GET /agents/capability-matrix ────────────────────────────────────────────
// Side-by-side comparison: row per tool name, column per live agent, cell
// shows whether the agent declares it (from probe-all). Useful to see
// which agents cluster on the same tool set.

export async function handleAgentsCapabilityMatrix(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const url = new URL(request.url);
  const timeoutMs = Math.max(1000, Math.min(30_000, Number(url.searchParams.get("timeout_ms")) || 8000));
  const roleFilter = url.searchParams.get("role");

  let targets: RegisteredAgent[] = getLiveAgents().filter((a) => a.mcp_url);
  if (roleFilter) targets = targets.filter((a) => a.role === roleFilter);

  const urls = targets.map((a) => a.mcp_url!);
  const probeResults = await probeAgents(urls, { timeoutMs });

  // Collect union of all tool names observed.
  const allTools = new Set<string>();
  const perAgentTools: Map<string, Set<string>> = new Map();
  for (let i = 0; i < targets.length; i++) {
    const agent = targets[i]!;
    const probe: ProbeResult = probeResults[i]!;
    const toolNames = new Set((probe.tools ?? []).map((t) => t.name));
    perAgentTools.set(agent.id, toolNames);
    for (const t of toolNames) allTools.add(t);
  }

  const toolList = Array.from(allTools).sort();
  const matrix = toolList.map((tool) => ({
    tool,
    supported_by: targets.filter((a) => perAgentTools.get(a.id)?.has(tool)).map((a) => a.id),
  }));

  // Per-agent summary: tool count, unique tools (only this agent declares them).
  const summary = targets.map((agent) => {
    const mine = perAgentTools.get(agent.id) ?? new Set<string>();
    const unique = Array.from(mine).filter((t) => {
      // Unique = no other agent declares this tool.
      for (const [otherId, otherTools] of perAgentTools) {
        if (otherId !== agent.id && otherTools.has(t)) return false;
      }
      return true;
    });
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tool_count: mine.size,
      unique_tools: unique,
      alive: probeResults[targets.indexOf(agent)]!.alive,
    };
  });

  logger.info("agents_capability_matrix", {
    agents: targets.length,
    tools_total: toolList.length,
    role_filter: roleFilter ?? null,
  });

  return jsonResponse({
    probed_at: new Date().toISOString(),
    ...(roleFilter ? { role_filter: roleFilter } : {}),
    agents: summary,
    tools: matrix,
    tool_count: toolList.length,
    note: "Matrix rows = tool names (union across probed agents), columns = supported_by list. Summary shows each agent's tool count + tools unique to it.",
  });
}

// ── POST /agents/workflow/run ───────────────────────────────────────────────
// Sec-48f: four-stage end-to-end orchestration across 2+ signals agents,
// 2+ creative agents, and 3+ buying agents. Stages 1-3 always fire live
// (read-only tools). Stage 4 always emits a dry-run payload preview
// per buying agent; any agent ID listed in `activate_agents` also gets
// its create_media_buy fired for real.
//
// Default target fleet (demo diversity by design):
//   signals  → evgeny_signals + dstillery           (2)
//   creative → advertible + celtra                  (2)
//   buying   → adzymic_apx + claire_pub + swivel    (3 — one per fleet)
//
// Request shape (POST body, JSON):
//   {
//     brief:               string   required
//     signal_agent_ids?:   string[] default = live signals agents
//     creative_agent_ids?: string[] default = live creative agents
//     buying_agent_ids?:   string[] default = 3 diverse buying agents
//     max_signals_per_agent?:   number  default 5
//     max_products_per_agent?:  number  default 3
//     activate_agents?:    string[] buying agents to ACTUALLY fire
//                                   create_media_buy on (default = []
//                                   = dry-run preview only)
//     timeout_ms?:         number  default 15000
//   }

// Sec-48n: default trio picked for live-demo completeness. Ground-truth
// probe 2026-04-24 across all 8 live buying agents with the same brief:
//   adzymic_apx        → ok, 2 products   ✓
//   claire_scope3      → ok, 1 product    ✓
//   swivel             → ok, 0 (legit)    ✓ (workflow still advances)
//   adzymic_{sph,tsl,mediacorp} → isError:true, vendor-side (Sec-48m
//                                  diagnostic unwraps the cause)
//   claire_pub         → isError:true
//   content_ignite     → isError:true
// Claire-Scope3 is the most product-diverse of the Claire fleet; swapping
// claire_pub out of the default makes stage 3 land 3/3 OK in the demo.
const DEFAULT_BUYING_TRIO = ["adzymic_apx", "claire_scope3", "swivel"] as const;
const DEFAULT_CREATIVE_PAIR = ["advertible", "celtra"] as const;

interface WorkflowRunBody {
  brief?: string;
  signal_agent_ids?: string[];
  creative_agent_ids?: string[];
  buying_agent_ids?: string[];
  max_signals_per_agent?: number;
  max_products_per_agent?: number;
  activate_agents?: string[];
  timeout_ms?: number;
}

interface StageAgentResult<TPayload> {
  id: string;
  name: string;
  vendor: string;
  url: string;
  ok: boolean;
  error?: string;
  latency_ms: number;
  payload: TPayload;
}

type SignalsStageAgent = StageAgentResult<{ signals: SignalLite[]; count: number }>;
type CreativeStageAgent = StageAgentResult<{ formats: unknown[]; count: number }>;
type ProductsStageAgent = StageAgentResult<{ products: ProductLite[]; count: number }>;

interface MediaBuyStageAgent {
  id: string;
  name: string;
  vendor: string;
  url: string;
  dry_run: boolean;
  payload_preview: MediaBuyPayload;
  fired: boolean;
  ok?: boolean;
  error?: string;
  latency_ms?: number;
  result?: unknown;
}

function resolveAgents(ids: string[] | undefined, fallback: readonly string[]): RegisteredAgent[] {
  const candidateIds = (ids && ids.length > 0 ? ids : fallback.slice()) as string[];
  const out: RegisteredAgent[] = [];
  for (const id of candidateIds) {
    const a = findAgent(id);
    if (a && a.stage === "live" && a.mcp_url) out.push(a);
  }
  return out;
}

async function runSignalsStage(
  agents: RegisteredAgent[],
  brief: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SignalsStageAgent[]> {
  return Promise.all(agents.map(async (a): Promise<SignalsStageAgent> => {
    const res = await callAgentTool(
      a.mcp_url!,
      "get_signals",
      { signal_spec: brief, max_results: maxResults },
      { timeoutMs },
    );
    const signals = extractMcpToolArray<SignalLite>(res.structured_content, res.content, ["signals"])
      .map((s) => ({ source_agent: a.id, ...s }));
    const out: SignalsStageAgent = {
      id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
      ok: res.ok, latency_ms: res.latency_ms,
      payload: { signals, count: signals.length },
    };
    if (res.error) out.error = res.error;
    return out;
  }));
}

async function runCreativeStage(
  agents: RegisteredAgent[],
  creativeFilter: CreativeFilter,
  timeoutMs: number,
): Promise<CreativeStageAgent[]> {
  // Sec-48q: pass brief-derived filter args so the catalog is narrowed by
  // intent (video vs display, mobile width cap, etc.). Empty filter == all.
  return Promise.all(agents.map(async (a): Promise<CreativeStageAgent> => {
    const res = await callAgentTool(
      a.mcp_url!, "list_creative_formats",
      creativeFilter as unknown as Record<string, unknown>,
      { timeoutMs },
    );
    const formats = extractMcpToolArray(res.structured_content, res.content, ["formats", "creative_formats", "items"]);
    const out: CreativeStageAgent = {
      id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
      ok: res.ok, latency_ms: res.latency_ms,
      payload: { formats, count: formats.length },
    };
    if (res.error) out.error = res.error;
    return out;
  }));
}

async function runProductsStage(
  agents: RegisteredAgent[],
  brief: string,
  productFilter: ProductFilter,
  maxResults: number,
  timeoutMs: number,
): Promise<ProductsStageAgent[]> {
  // Sec-48q: products stage now inherits targeting signals + format hints
  // from upstream stages. Vendors that don't honor these keys ignore them;
  // the point is to signal intent so the buying agent can narrow inventory.
  return Promise.all(agents.map(async (a): Promise<ProductsStageAgent> => {
    const args: Record<string, unknown> = { brief };
    if (Object.keys(productFilter).length > 0) args.filters = productFilter;
    const res = await callAgentTool(a.mcp_url!, "get_products", args, { timeoutMs });
    const products = extractMcpToolArray<ProductLite>(
      res.structured_content,
      res.content,
      ["products", "items", "product_list"],
    ).slice(0, maxResults);
    const out: ProductsStageAgent = {
      id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
      ok: res.ok, latency_ms: res.latency_ms,
      payload: { products, count: products.length },
    };
    if (res.error) out.error = res.error;
    return out;
  }));
}

async function runMediaBuyStage(
  workflowId: string,
  agents: RegisteredAgent[],
  brief: string,
  chosenProductByAgent: Record<string, string | null>,
  chosenSignalIds: string[],
  chosenFormatIds: string[],
  activateSet: Set<string>,
  timeoutMs: number,
): Promise<MediaBuyStageAgent[]> {
  return Promise.all(agents.map(async (a): Promise<MediaBuyStageAgent> => {
    const chosenProductId = chosenProductByAgent[a.id] ?? null;
    const payload = buildCreateMediaBuyPayload({
      workflowId,
      agentId: a.id,
      brief,
      chosenProductId,
      chosenSignalIds,
      chosenFormatIds,
    });
    const base: MediaBuyStageAgent = {
      id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
      dry_run: !activateSet.has(a.id),
      payload_preview: payload,
      fired: false,
    };
    if (!activateSet.has(a.id)) return base;
    // User opted to fire on this agent.
    const res = await callAgentTool(
      a.mcp_url!,
      "create_media_buy",
      payload as unknown as Record<string, unknown>,
      { timeoutMs },
    );
    base.fired = true;
    base.ok = res.ok;
    base.latency_ms = res.latency_ms;
    if (res.error) base.error = res.error;
    if (res.structured_content !== undefined) base.result = res.structured_content;
    return base;
  }));
}

export async function handleWorkflowRun(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const parsed = await readJsonBody<WorkflowRunBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: WorkflowRunBody = parsed.kind === "parsed" ? parsed.data : {};

  if (!body.brief || body.brief.trim().length === 0) return errorResponse("INVALID_INPUT", "brief required", 400);
  if (body.brief.length > 500) return errorResponse("INVALID_INPUT", "brief max 500 chars", 400);

  const maxSignals = Math.max(1, Math.min(50, body.max_signals_per_agent ?? 5));
  const maxProducts = Math.max(1, Math.min(20, body.max_products_per_agent ?? 3));
  const timeoutMs = Math.max(1000, Math.min(30_000, body.timeout_ms ?? 15_000));

  // Resolve targets. Fall back to default demo diversity when not specified.
  const signalsAgents = resolveAgents(
    body.signal_agent_ids,
    getAgentsByRole("signals").filter((a) => a.stage === "live" && a.mcp_url).map((a) => a.id),
  );
  const creativeAgents = resolveAgents(body.creative_agent_ids, DEFAULT_CREATIVE_PAIR);
  const buyingAgents = resolveAgents(body.buying_agent_ids, DEFAULT_BUYING_TRIO);

  if (signalsAgents.length === 0) return errorResponse("NO_TARGETS", "No live signals agents matched.", 400);
  if (buyingAgents.length === 0) return errorResponse("NO_TARGETS", "No live buying agents matched.", 400);

  // Activation list — only buying agents can be activated. Anything else
  // in the list is ignored with a soft warning surfaced in the response.
  const activateSet = new Set<string>();
  const activateWarnings: string[] = [];
  for (const id of body.activate_agents ?? []) {
    if (buyingAgents.find((a) => a.id === id)) activateSet.add(id);
    else activateWarnings.push(`ignored_non_buying_activate_target:${id}`);
  }

  const workflowId = newWorkflowId();
  const t0 = Date.now();
  // Sec-48q: derive brief-driven filters before the stages fire.
  const creativeFilter = deriveCreativeFilter(body.brief);

  // Stage 1 + Stage 2 in parallel (independent).
  const [signalsResults, creativeResults] = await Promise.all([
    runSignalsStage(signalsAgents, body.brief, maxSignals, timeoutMs),
    creativeAgents.length > 0 ? runCreativeStage(creativeAgents, creativeFilter, timeoutMs) : Promise.resolve([]),
  ]);

  // Pick downstream artefacts once upstream stages land.
  const mergedSignals = signalsResults.flatMap((r) => r.payload.signals);
  const chosenSignalIds = pickTopSignals(mergedSignals, 3);
  const chosenFormatIds = pickTopFormatIds(creativeResults, 2);

  // Sec-48q: products now sequences AFTER signals + creative so it
  // can receive targeting_signals + format hints in its filters arg.
  const productFilter = deriveProductFilter(chosenSignalIds, chosenFormatIds, creativeFilter);
  const productsResults = await runProductsStage(buyingAgents, body.brief, productFilter, maxProducts, timeoutMs);

  const chosenProductByAgent = pickProductPerAgent(productsResults.map((r) => ({ id: r.id, products: r.payload.products })));

  // Stage 4 — payload synth + optional fire.
  const mediaBuyResults = await runMediaBuyStage(
    workflowId,
    buyingAgents,
    body.brief,
    chosenProductByAgent,
    chosenSignalIds,
    chosenFormatIds,
    activateSet,
    timeoutMs,
  );

  const totalTimeMs = Date.now() - t0;
  const allActivatedOk = mediaBuyResults.filter((r) => r.fired).every((r) => r.ok === true);
  const anyActivated = mediaBuyResults.some((r) => r.fired);

  logger.info("agents_workflow_run", {
    workflow_id: workflowId,
    brief_chars: body.brief.length,
    signals_agents: signalsAgents.length,
    creative_agents: creativeAgents.length,
    buying_agents: buyingAgents.length,
    activated: activateSet.size,
    total_time_ms: totalTimeMs,
  });

  // Normalize into a compact response. The full per-agent products +
  // signals are preserved on the stage objects so the UI can render
  // everything without follow-up calls.
  return jsonResponse({
    workflow_id: workflowId,
    brief: body.brief,
    mode: activateSet.size === 0 ? "dry_run" : activateSet.size === buyingAgents.length ? "all_live" : "partial_live",
    total_time_ms: totalTimeMs,
    stages: {
      signals: {
        agents_queried: signalsAgents.map((a) => a.id),
        per_agent: signalsResults.map((r) => ({
          id: r.id, name: r.name, vendor: r.vendor,
          ok: r.ok, latency_ms: r.latency_ms,
          signal_count: r.payload.count,
          ...(r.error ? { error: r.error } : {}),
          signals: r.payload.signals.map((s) => ({
            source_agent: r.id,
            id: signalIdOf(s),
            name: s.name ?? "(unnamed)",
            description: typeof s.description === "string" ? s.description.slice(0, 200) : "",
            coverage_percentage: s.coverage_percentage,
            estimated_audience_size: s.estimated_audience_size,
          })),
        })),
        total_signals: mergedSignals.length,
        chosen_signal_ids: chosenSignalIds,
      },
      creative: {
        agents_queried: creativeAgents.map((a) => a.id),
        per_agent: creativeResults.map((r) => ({
          id: r.id, name: r.name, vendor: r.vendor,
          ok: r.ok, latency_ms: r.latency_ms,
          format_count: r.payload.count,
          ...(r.error ? { error: r.error } : {}),
          formats: r.payload.formats.slice(0, 10),
        })),
      },
      products: {
        agents_queried: buyingAgents.map((a) => a.id),
        per_agent: productsResults.map((r) => ({
          id: r.id, name: r.name, vendor: r.vendor,
          ok: r.ok, latency_ms: r.latency_ms,
          product_count: r.payload.count,
          ...(r.error ? { error: r.error } : {}),
          products: r.payload.products.map((p) => ({
            id: productIdOf(p),
            name: p.name ?? "(unnamed product)",
            description: typeof p.description === "string" ? p.description.slice(0, 200) : "",
          })),
        })),
        chosen_product_per_agent: chosenProductByAgent,
      },
      media_buy: {
        agents_queried: buyingAgents.map((a) => a.id),
        activated: Array.from(activateSet),
        all_activated_ok: anyActivated ? allActivatedOk : null,
        per_agent: mediaBuyResults,
      },
    },
    warnings: activateWarnings,
    method: "sec48f_parallel_multi_role_fanout",
    note: "Stages 1+2 run in parallel. Products sequential after signals to give the UI a clean step. Stage 4 is payload-synth + optional create_media_buy firing per `activate_agents`. Dry-run default: preview only, zero side effects on buying agents.",
  });
}

// ── POST /agents/workflow/run/stream ────────────────────────────────────────
// Sec-48g: NDJSON-streaming variant of /agents/workflow/run. Same inputs +
// semantics as the one-shot endpoint, but emits one JSON object per line
// as each stage progresses so the UI can render a real-time timeline.
//
// Event shapes (one per newline):
//   {type:"workflow_start",   workflow_id, brief, plan:{signals,creative,buying,activate_agents}}
//   {type:"stage_start",      stage, agents_queried}
//   {type:"agent_start",      stage, agent_id}
//   {type:"agent_complete",   stage, agent_id, ok, error?, latency_ms, summary}
//   {type:"stage_complete",   stage, summary}
//   {type:"targeting_chosen", chosen_signal_ids}
//   {type:"products_chosen",  chosen_product_per_agent}
//   {type:"workflow_complete", mode, total_time_ms, warnings}
//
// Transport choice: NDJSON over a plain streaming fetch body. Chose this
// over text/event-stream because EventSource mandates GET, and our body
// carries a POST JSON. Clients parse with ReadableStream + TextDecoder.

type StreamEvent =
  | { type: "workflow_start"; workflow_id: string; brief: string; plan: Record<string, unknown> }
  | { type: "stage_start"; stage: string; agents_queried: string[] }
  | { type: "agent_start"; stage: string; agent_id: string }
  | { type: "agent_complete"; stage: string; agent_id: string; ok: boolean; error?: string; latency_ms: number; summary: unknown }
  | { type: "stage_complete"; stage: string; summary: unknown }
  | { type: "targeting_chosen"; chosen_signal_ids: string[] }
  | { type: "formats_chosen"; chosen_format_ids: string[] }
  | { type: "products_chosen"; chosen_product_per_agent: Record<string, string | null> }
  | { type: "workflow_complete"; mode: string; total_time_ms: number; warnings: string[] };

export async function handleWorkflowRunStream(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const parsed = await readJsonBody<WorkflowRunBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: WorkflowRunBody = parsed.kind === "parsed" ? parsed.data : {};

  if (!body.brief || body.brief.trim().length === 0) return errorResponse("INVALID_INPUT", "brief required", 400);
  if (body.brief.length > 500) return errorResponse("INVALID_INPUT", "brief max 500 chars", 400);

  const maxSignals = Math.max(1, Math.min(50, body.max_signals_per_agent ?? 5));
  const maxProducts = Math.max(1, Math.min(20, body.max_products_per_agent ?? 3));
  const timeoutMs = Math.max(1000, Math.min(30_000, body.timeout_ms ?? 15_000));

  const signalsAgents = resolveAgents(
    body.signal_agent_ids,
    getAgentsByRole("signals").filter((a) => a.stage === "live" && a.mcp_url).map((a) => a.id),
  );
  const creativeAgents = resolveAgents(body.creative_agent_ids, DEFAULT_CREATIVE_PAIR);
  const buyingAgents = resolveAgents(body.buying_agent_ids, DEFAULT_BUYING_TRIO);

  if (signalsAgents.length === 0) return errorResponse("NO_TARGETS", "No live signals agents matched.", 400);
  if (buyingAgents.length === 0) return errorResponse("NO_TARGETS", "No live buying agents matched.", 400);

  const activateSet = new Set<string>();
  const activateWarnings: string[] = [];
  for (const id of body.activate_agents ?? []) {
    if (buyingAgents.find((a) => a.id === id)) activateSet.add(id);
    else activateWarnings.push(`ignored_non_buying_activate_target:${id}`);
  }

  const workflowId = newWorkflowId();
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };

      try {
        send({
          type: "workflow_start",
          workflow_id: workflowId,
          brief: body.brief!,
          plan: {
            signals_agents: signalsAgents.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor })),
            creative_agents: creativeAgents.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor })),
            buying_agents: buyingAgents.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor })),
            activate_agents: Array.from(activateSet),
          },
        });

        // Stages 1 + 2 run in parallel. We fan out agent calls per stage
        // but emit stage_start for both up front so the UI can paint
        // both stage cells as "active" simultaneously.
        send({ type: "stage_start", stage: "signals", agents_queried: signalsAgents.map((a) => a.id) });
        send({ type: "stage_start", stage: "creative", agents_queried: creativeAgents.map((a) => a.id) });
        for (const a of signalsAgents) send({ type: "agent_start", stage: "signals", agent_id: a.id });
        for (const a of creativeAgents) send({ type: "agent_start", stage: "creative", agent_id: a.id });

        const signalsPromise = Promise.all(signalsAgents.map(async (a): Promise<SignalsStageAgent> => {
          const res = await callAgentTool(
            a.mcp_url!,
            "get_signals",
            { signal_spec: body.brief, max_results: maxSignals },
            { timeoutMs },
          );
          const signals = extractMcpToolArray<SignalLite>(res.structured_content, res.content, ["signals"])
            .map((s) => ({ source_agent: a.id, ...s }));
          const out: SignalsStageAgent = {
            id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
            ok: res.ok, latency_ms: res.latency_ms,
            payload: { signals, count: signals.length },
          };
          if (res.error) out.error = res.error;
          send({
            type: "agent_complete",
            stage: "signals",
            agent_id: a.id,
            ok: res.ok,
            ...(res.error ? { error: res.error } : {}),
            latency_ms: res.latency_ms,
            summary: {
              count: signals.length,
              preview: signals.slice(0, 3).map((s) => ({
                id: signalIdOf(s),
                name: s.name ?? "(unnamed)",
                coverage_percentage: s.coverage_percentage,
                estimated_audience_size: s.estimated_audience_size,
              })),
            },
          });
          return out;
        }));

        // Sec-48q: derive brief-driven creative filter once; applied below.
        const creativeFilter = deriveCreativeFilter(body.brief!);

        const creativePromise = Promise.all(creativeAgents.map(async (a): Promise<CreativeStageAgent> => {
          const res = await callAgentTool(
            a.mcp_url!, "list_creative_formats",
            creativeFilter as unknown as Record<string, unknown>,
            { timeoutMs },
          );
          const formats = extractMcpToolArray(res.structured_content, res.content, ["formats", "creative_formats", "items"]);
          const out: CreativeStageAgent = {
            id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
            ok: res.ok, latency_ms: res.latency_ms,
            payload: { formats, count: formats.length },
          };
          if (res.error) out.error = res.error;
          send({
            type: "agent_complete",
            stage: "creative",
            agent_id: a.id,
            ok: res.ok,
            ...(res.error ? { error: res.error } : {}),
            latency_ms: res.latency_ms,
            summary: {
              count: formats.length,
              // Sec-48q: include id alongside name so the UI can make format
              // pills clickable and track chosen set by id. Celtra's format_id
              // is nested ({agent_url, id}); flatten to the inner id.
              preview: formats.slice(0, 5).map((f) => {
                const fo = f as { name?: string; format_id?: unknown; id?: string } | null;
                let id: string | null = null;
                if (fo && typeof fo.format_id === "string") id = fo.format_id;
                else if (fo && fo.format_id && typeof fo.format_id === "object") {
                  const inner = (fo.format_id as { id?: unknown }).id;
                  if (typeof inner === "string") id = inner;
                }
                if (!id && fo && typeof fo.id === "string") id = fo.id;
                return { id: id ?? "", name: (fo && fo.name) ?? id ?? "(format)" };
              }),
              // Sec-48k: when the extractor finds nothing, attach a shape
              // diagnostic so the UI (and we) can see why. Cheap — runs
              // only on the zero-count path.
              ...(formats.length === 0 && res.ok
                ? { diagnostic: describeToolResult(res.structured_content, res.content) }
                : {}),
            },
          });
          return out;
        }));

        const [signalsResults, creativeResults] = await Promise.all([signalsPromise, creativePromise]);

        send({ type: "stage_complete", stage: "signals", summary: { total: signalsResults.reduce((n, r) => n + r.payload.count, 0) } });
        send({ type: "stage_complete", stage: "creative", summary: { total: creativeResults.reduce((n, r) => n + r.payload.count, 0) } });

        const mergedSignals = signalsResults.flatMap((r) => r.payload.signals);
        const chosenSignalIds = pickTopSignals(mergedSignals, 3);
        send({ type: "targeting_chosen", chosen_signal_ids: chosenSignalIds });

        // Sec-48q: pick top formats per vendor (one each), then narrow
        // products by those IDs + the brief's asset-type intent. Vendors
        // that don't honor any of these keys simply ignore them.
        const chosenFormatIds = pickTopFormatIds(creativeResults, 2);
        send({ type: "formats_chosen", chosen_format_ids: chosenFormatIds });
        const productFilter = deriveProductFilter(chosenSignalIds, chosenFormatIds, creativeFilter);

        send({ type: "stage_start", stage: "products", agents_queried: buyingAgents.map((a) => a.id) });
        for (const a of buyingAgents) send({ type: "agent_start", stage: "products", agent_id: a.id });
        const productsResults = await Promise.all(buyingAgents.map(async (a): Promise<ProductsStageAgent> => {
          const args: Record<string, unknown> = { brief: body.brief };
          if (Object.keys(productFilter).length > 0) args.filters = productFilter;
          const res = await callAgentTool(a.mcp_url!, "get_products", args, { timeoutMs });
          const products = extractMcpToolArray<ProductLite>(
            res.structured_content,
            res.content,
            ["products", "items", "product_list"],
          ).slice(0, maxProducts);
          const out: ProductsStageAgent = {
            id: a.id, name: a.name, vendor: a.vendor, url: a.mcp_url!,
            ok: res.ok, latency_ms: res.latency_ms,
            payload: { products, count: products.length },
          };
          if (res.error) out.error = res.error;
          send({
            type: "agent_complete",
            stage: "products",
            agent_id: a.id,
            ok: res.ok,
            ...(res.error ? { error: res.error } : {}),
            latency_ms: res.latency_ms,
            summary: {
              count: products.length,
              preview: products.slice(0, 3).map((p) => ({
                id: productIdOf(p),
                name: p.name ?? "(unnamed product)",
              })),
              ...(products.length === 0 && res.ok
                ? { diagnostic: describeToolResult(res.structured_content, res.content) }
                : {}),
            },
          });
          return out;
        }));
        send({ type: "stage_complete", stage: "products", summary: { total: productsResults.reduce((n, r) => n + r.payload.count, 0) } });

        const chosenProductByAgent = pickProductPerAgent(productsResults.map((r) => ({ id: r.id, products: r.payload.products })));
        send({ type: "products_chosen", chosen_product_per_agent: chosenProductByAgent });

        send({ type: "stage_start", stage: "media_buy", agents_queried: buyingAgents.map((a) => a.id) });
        for (const a of buyingAgents) send({ type: "agent_start", stage: "media_buy", agent_id: a.id });
        await Promise.all(buyingAgents.map(async (a) => {
          const chosenProductId = chosenProductByAgent[a.id] ?? null;
          const payload = buildCreateMediaBuyPayload({
            workflowId, agentId: a.id, brief: body.brief!,
            chosenProductId, chosenSignalIds, chosenFormatIds,
          });
          if (!activateSet.has(a.id)) {
            send({
              type: "agent_complete",
              stage: "media_buy",
              agent_id: a.id,
              ok: true,
              latency_ms: 0,
              summary: { dry_run: true, fired: false, payload_preview: payload },
            });
            return;
          }
          const start = Date.now();
          const res = await callAgentTool(
            a.mcp_url!,
            "create_media_buy",
            payload as unknown as Record<string, unknown>,
            { timeoutMs },
          );
          send({
            type: "agent_complete",
            stage: "media_buy",
            agent_id: a.id,
            ok: res.ok,
            ...(res.error ? { error: res.error } : {}),
            latency_ms: res.latency_ms ?? (Date.now() - start),
            summary: {
              dry_run: false,
              fired: true,
              payload_preview: payload,
              result: res.structured_content ?? null,
              // Sec-48p: surface content too so the UI can show vendor
              // rejection messages (most agents that return isError:true
              // put the reason in content[0].text, not in structured).
              content: res.content ?? null,
            },
          });
        }));
        send({ type: "stage_complete", stage: "media_buy", summary: { activated: Array.from(activateSet) } });

        const totalTimeMs = Date.now() - t0;
        const mode = activateSet.size === 0 ? "dry_run" : activateSet.size === buyingAgents.length ? "all_live" : "partial_live";
        send({ type: "workflow_complete", mode, total_time_ms: totalTimeMs, warnings: activateWarnings });

        logger.info("agents_workflow_run_stream", {
          workflow_id: workflowId,
          brief_chars: body.brief!.length,
          signals_agents: signalsAgents.length,
          creative_agents: creativeAgents.length,
          buying_agents: buyingAgents.length,
          activated: activateSet.size,
          total_time_ms: totalTimeMs,
        });
      } catch (e) {
        const err = { type: "workflow_error" as const, error: String((e as Error).message || e) };
        controller.enqueue(encoder.encode(JSON.stringify(err) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── POST /agents/workflow/fire-buy ──────────────────────────────────────────
// Sec-48n: fire a single create_media_buy against one buying agent after
// the user has re-picked a product (or the chosen signals) in the UI.
// Complements the dry-run-by-default /agents/workflow/run: lets the
// operator inspect the full workflow result, swap in a different product,
// and THEN fire the buy — without re-running the whole 4-stage fan-out.
//
// Request body:
//   {
//     agent_id:    string   required  — must be a live buying agent
//     product_id:  string   required  — target product (from stage 3)
//     signal_ids:  string[]           — targeting signals (from stage 1)
//     brief:       string   required
//     workflow_id?: string            — reused in buyer_ref + po_number if present
//     timeout_ms?: number
//   }
//
// Returns the full create_media_buy result body (including the synthesized
// payload we sent, for transparency) so the UI can render it as a drop-in
// replacement for the stage-4 dry-run card.

interface FireBuyBody {
  agent_id?: string;
  product_id?: string;
  signal_ids?: string[];
  /** Sec-48q: chosen creative format IDs. Emitted as packages[0].creatives. */
  format_ids?: string[];
  brief?: string;
  workflow_id?: string;
  timeout_ms?: number;
}

export async function handleWorkflowFireBuy(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  const parsed = await readJsonBody<FireBuyBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: FireBuyBody = parsed.kind === "parsed" ? parsed.data : {};

  if (!body.agent_id) return errorResponse("INVALID_INPUT", "agent_id required", 400);
  if (!body.brief || body.brief.trim().length === 0) return errorResponse("INVALID_INPUT", "brief required", 400);
  if (body.brief.length > 500) return errorResponse("INVALID_INPUT", "brief max 500 chars", 400);

  const agent = findAgent(body.agent_id);
  if (!agent) return errorResponse("UNKNOWN_AGENT", `agent ${body.agent_id} not in registry`, 400);
  if (agent.role !== "buying") return errorResponse("INVALID_AGENT_ROLE", `agent ${agent.id} is ${agent.role}, not buying`, 400);
  if (agent.stage !== "live" || !agent.mcp_url) return errorResponse("AGENT_NOT_LIVE", `agent ${agent.id} is not live`, 400);

  const timeoutMs = Math.max(1000, Math.min(30_000, body.timeout_ms ?? 15_000));
  const workflowId = body.workflow_id && /^wf_[a-z0-9]+$/i.test(body.workflow_id)
    ? body.workflow_id
    : newWorkflowId();

  const payload = buildCreateMediaBuyPayload({
    workflowId,
    agentId: agent.id,
    brief: body.brief,
    chosenProductId: body.product_id ?? null,
    chosenSignalIds: Array.isArray(body.signal_ids) ? body.signal_ids.filter((s) => typeof s === "string") : [],
    chosenFormatIds: Array.isArray(body.format_ids) ? body.format_ids.filter((f) => typeof f === "string") : [],
  });

  const start = Date.now();
  const res = await callAgentTool(
    agent.mcp_url,
    "create_media_buy",
    payload as unknown as Record<string, unknown>,
    { timeoutMs },
  );
  const latency = Date.now() - start;

  logger.info("agents_workflow_fire_buy", {
    workflow_id: workflowId,
    agent_id: agent.id,
    ok: res.ok,
    latency_ms: latency,
    has_product: !!body.product_id,
    signal_count: Array.isArray(body.signal_ids) ? body.signal_ids.length : 0,
  });

  return jsonResponse({
    workflow_id: workflowId,
    agent_id: agent.id,
    vendor: agent.vendor,
    ok: res.ok,
    ...(res.error ? { error: res.error } : {}),
    latency_ms: res.latency_ms ?? latency,
    payload_preview: payload,
    ...(res.structured_content !== undefined ? { result: res.structured_content } : {}),
    ...(res.content !== undefined ? { content: res.content } : {}),
  });
}

// Kept for reference — utility not used directly by endpoints.
export { findAgent };
