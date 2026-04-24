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
    return {
      server_info: { name: self?.name ?? "evgeny-signals", version: "48.0" },
      tools: (self?.tools_exposed ?? []).map((name) => ({ name })),
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

// Kept for reference — utility not used directly by endpoints.
export { findAgent };
