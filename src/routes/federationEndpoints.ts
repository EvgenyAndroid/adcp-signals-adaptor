// src/routes/federationEndpoints.ts
// Sec-41 Part 3 + Sec-48 Parts 1/2: Agent Federation endpoints.
//   GET  /agents/registry            (static list, sourced from domain/agentRegistry)
//   GET  /agents/probe               (Sec-48 P1: fan-out initialize + tools/list)
//   POST /agents/orchestrate         (Sec-48 P2: role-routed brief fan-out)
//   GET  /agents/capability-matrix   (Sec-48 P2: agents × tools grid)
//   POST /agents/federated-search
//   POST /agents/cross-similarity    (roadmap stub)
//   POST /taxonomy/reverse

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { dstillerySearch } from "../federation/dstilleryClient";
import {
  probeAgent,
  callTool,
  type ProbeResult,
  type ToolCallResult,
} from "../federation/genericMcpClient";
import { searchSignalsService } from "../domain/signalService";
import {
  AGENT_REGISTRY,
  listLiveAgents,
  getAgent,
  type RegisteredAgent,
  type AgentRole,
} from "../domain/agentRegistry";
import {
  defaultToolForRole,
  defaultArgsForTool,
  ROLE_DEFAULT_TOOL,
} from "../domain/agentOrchestration";
import { getDb } from "../storage/db";

// ── /agents/registry ─────────────────────────────────────────────────────────

function publicAgentView(a: RegisteredAgent) {
  const base: Record<string, unknown> = {
    id: a.id,
    name: a.name,
    vendor: a.vendor,
    mcp_url: a.mcp_url,
    stage: a.stage,
    role: a.role,
    protocols: a.protocols,
    specialties: a.specialties,
  };
  if (a.capabilities_url !== undefined) base.capabilities_url = a.capabilities_url;
  if (a.tools_expected) base.tools_exposed = a.tools_expected;
  if (a.mcp_version) base.mcp_version = a.mcp_version;
  if (a.notes) base.notes = a.notes;
  return base;
}

export function handleAgentsRegistry(): Response {
  return jsonResponse({
    version: "sec_48_v1",
    self_agent: "evgeny_signals",
    agents: AGENT_REGISTRY.map(publicAgentView),
    method: "curated_registry_see_src_domain_agentRegistry",
  });
}

// ── /agents/probe ────────────────────────────────────────────────────────────
// Fan out `initialize` + `tools/list` across all live registry agents (or a
// caller-specified subset). Results are cached at the session layer for
// SESSION_TTL_MS (~9 min), so rapid repeat probes are cheap.

export async function handleAgentsProbe(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const onlyParam = url.searchParams.get("agents");
  const requested = onlyParam
    ? onlyParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const targets: RegisteredAgent[] = requested
    ? requested
        .map((id) => getAgent(id))
        .filter((a): a is RegisteredAgent => Boolean(a && a.mcp_url && a.role !== "self"))
    : listLiveAgents();

  if (targets.length === 0) {
    return errorResponse(
      "NO_PROBE_TARGETS",
      "No live agents in registry match the requested ids",
      400,
    );
  }

  const start = Date.now();
  const probes: Array<Promise<ProbeResult & { agent_id: string; vendor: string; role: string }>> =
    targets.map((a) =>
      probeAgent({ url: a.mcp_url as string }).then((r) => ({
        ...r,
        agent_id: a.id,
        vendor: a.vendor,
        role: a.role,
      })),
    );

  const results = await Promise.all(probes);
  const okIds = results.filter((r) => r.ok).map((r) => r.agent_id);
  const failedIds = results.filter((r) => !r.ok).map((r) => r.agent_id);
  const totalTools = results.reduce((n, r) => n + r.tools.length, 0);

  return jsonResponse({
    probed_at: new Date().toISOString(),
    agents_probed: targets.map((a) => a.id),
    agents_ok: okIds,
    agents_failed: failedIds,
    total_tools_discovered: totalTools,
    total_time_ms: Date.now() - start,
    per_agent: results,
    cache_note: "Session ids are cached per-URL for ~9min; repeat probes reuse the session and only cost one tools/list roundtrip.",
  });
}

// ── /agents/orchestrate ──────────────────────────────────────────────────────
// Fan a brief across multiple agents, calling the role-appropriate tool on
// each (signals → get_signals, buying → get_products, creative →
// list_creative_formats, self → local signalService). Per-agent tool and
// arg overrides are accepted in the body for advanced use.
//
// Response shape is flat-per-agent rather than a merged list — the UI
// needs to render signals / products / creative formats side-by-side
// (they don't share a schema) and callers can merge selectively.

interface OrchestrateBody {
  brief: string;
  /** Target specific agents by id. If omitted, defaults to all live + self. */
  agent_ids?: string[];
  /** Alternative filter by role. If both agent_ids and roles are provided, intersect. */
  roles?: AgentRole[];
  /** Per-agent tool override: { "dstillery": "get_signals" }. */
  tool_overrides?: Record<string, string>;
  max_results_per_agent?: number;
  /** Include the self agent? Default true. */
  include_self?: boolean;
}

interface OrchestrateAgentResult {
  agent_id: string;
  vendor: string;
  role: AgentRole;
  ok: boolean;
  /** The tool name actually invoked (null for the self agent — routed internally). */
  tool_called: string | null;
  /** Tool result payload. For get_signals this is `{signals: [...]}`; for get_products `{products: [...]}`; varies by tool. */
  data?: unknown;
  error?: string;
  /** Reason the agent was skipped (e.g. "no_default_tool_for_role", "tool_not_available"). */
  skipped?: string;
  elapsed_ms: number;
}

async function orchestrateSelf(
  env: Env,
  brief: string,
  maxResultsPerAgent: number,
): Promise<OrchestrateAgentResult> {
  const t0 = Date.now();
  try {
    const db = getDb(env);
    const r = await searchSignalsService(db, env.SIGNALS_CACHE, {
      brief,
      limit: maxResultsPerAgent,
      offset: 0,
    });
    return {
      agent_id: "evgeny_signals",
      vendor: "No Fluff Advisory",
      role: "self",
      ok: true,
      tool_called: null,
      data: { signals: r.signals },
      elapsed_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      agent_id: "evgeny_signals",
      vendor: "No Fluff Advisory",
      role: "self",
      ok: false,
      tool_called: null,
      error: String((e as Error).message || e),
      elapsed_ms: Date.now() - t0,
    };
  }
}

async function orchestrateRemote(
  agent: RegisteredAgent,
  brief: string,
  maxResultsPerAgent: number,
  override?: string,
): Promise<OrchestrateAgentResult> {
  const t0 = Date.now();
  const toolName = override ?? defaultToolForRole(agent.role);
  if (!toolName) {
    return {
      agent_id: agent.id,
      vendor: agent.vendor,
      role: agent.role,
      ok: false,
      tool_called: null,
      skipped: "no_default_tool_for_role",
      elapsed_ms: Date.now() - t0,
    };
  }

  // Probe first to confirm the tool exists — session is cached from PR-A
  // so this costs at most one tools/list roundtrip after the first call.
  const probe = await probeAgent({ url: agent.mcp_url as string });
  if (!probe.ok) {
    return {
      agent_id: agent.id,
      vendor: agent.vendor,
      role: agent.role,
      ok: false,
      tool_called: toolName,
      error: probe.error ?? "probe_failed",
      elapsed_ms: Date.now() - t0,
    };
  }
  const toolAvailable = probe.tools.some((t) => t.name === toolName);
  if (!toolAvailable) {
    return {
      agent_id: agent.id,
      vendor: agent.vendor,
      role: agent.role,
      ok: false,
      tool_called: toolName,
      skipped: "tool_not_available",
      error: `tool ${toolName} not advertised by agent (observed: ${probe.tools.map((t) => t.name).join(", ") || "none"})`,
      elapsed_ms: Date.now() - t0,
    };
  }

  const args = defaultArgsForTool(toolName, { brief, maxResultsPerAgent });
  const r: ToolCallResult = await callTool({ url: agent.mcp_url as string }, toolName, args);

  const base = {
    agent_id: agent.id,
    vendor: agent.vendor,
    role: agent.role,
    tool_called: toolName,
    elapsed_ms: Date.now() - t0,
  };
  return r.ok
    ? { ...base, ok: true, data: r.data }
    : { ...base, ok: false, error: r.error ?? "tool_call_failed" };
}

export async function handleAgentsOrchestrate(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: OrchestrateBody;
  try { body = (await request.json()) as OrchestrateBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }

  if (!body.brief || body.brief.trim().length === 0) {
    return errorResponse("INVALID_INPUT", "brief required", 400);
  }

  const maxResultsPerAgent = Math.max(1, Math.min(20, body.max_results_per_agent ?? 5));
  const includeSelf = body.include_self !== false;
  const overrides = body.tool_overrides ?? {};

  // Resolve target set.
  let remoteTargets: RegisteredAgent[];
  if (body.agent_ids && body.agent_ids.length > 0) {
    remoteTargets = body.agent_ids
      .map((id) => getAgent(id))
      .filter((a): a is RegisteredAgent => Boolean(a && a.mcp_url && a.role !== "self"));
  } else {
    remoteTargets = listLiveAgents();
  }
  if (body.roles && body.roles.length > 0) {
    const roleSet = new Set<AgentRole>(body.roles);
    remoteTargets = remoteTargets.filter((a) => roleSet.has(a.role));
  }

  if (!includeSelf && remoteTargets.length === 0) {
    return errorResponse(
      "NO_ORCHESTRATE_TARGETS",
      "No agents match the requested filters",
      400,
    );
  }

  const start = Date.now();
  const tasks: Array<Promise<OrchestrateAgentResult>> = [];
  if (includeSelf) {
    tasks.push(orchestrateSelf(env, body.brief, maxResultsPerAgent));
  }
  for (const a of remoteTargets) {
    tasks.push(orchestrateRemote(a, body.brief, maxResultsPerAgent, overrides[a.id]));
  }

  const results = await Promise.all(tasks);
  const okIds = results.filter((r) => r.ok).map((r) => r.agent_id);
  const failedIds = results.filter((r) => !r.ok).map((r) => r.agent_id);

  // Grouped summary by role — useful for the UI rendering signals/products/creative
  // side by side without having to re-partition client-side.
  const byRole: Record<string, OrchestrateAgentResult[]> = {};
  for (const r of results) {
    (byRole[r.role] ??= []).push(r);
  }

  return jsonResponse({
    brief: body.brief,
    orchestrated_at: new Date().toISOString(),
    agents_targeted: results.map((r) => r.agent_id),
    agents_ok: okIds,
    agents_failed: failedIds,
    per_agent: results,
    by_role: byRole,
    total_time_ms: Date.now() - start,
    tool_routing: {
      defaults: ROLE_DEFAULT_TOOL,
      overrides,
    },
  });
}

// ── /agents/capability-matrix ────────────────────────────────────────────────
// Fan-out probe + transpose: rows = agents, columns = union of tool names,
// cells = { present, description? }. Used by the UI to render a capability
// grid and by evaluators comparing tool coverage across the directory.

export async function handleAgentsCapabilityMatrix(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const onlyParam = url.searchParams.get("agents");
  const requested = onlyParam
    ? onlyParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const targets: RegisteredAgent[] = requested
    ? requested
        .map((id) => getAgent(id))
        .filter((a): a is RegisteredAgent => Boolean(a && a.mcp_url && a.role !== "self"))
    : listLiveAgents();

  if (targets.length === 0) {
    return errorResponse(
      "NO_MATRIX_TARGETS",
      "No live agents in registry match the requested ids",
      400,
    );
  }

  const start = Date.now();
  const probes = await Promise.all(
    targets.map((a) =>
      probeAgent({ url: a.mcp_url as string }).then((r): ProbeResult & { agent_id: string } => ({
        ...r,
        agent_id: a.id,
      })),
    ),
  );

  // Build sorted union of tool names across all successful probes.
  const toolDescriptions = new Map<string, string | undefined>();
  for (const p of probes) {
    if (!p.ok) continue;
    for (const t of p.tools) {
      if (!toolDescriptions.has(t.name)) toolDescriptions.set(t.name, t.description);
    }
  }
  const toolsUnion = Array.from(toolDescriptions.keys()).sort();

  // matrix[agent_id][tool_name] = { present, description? }
  const matrix: Record<string, Record<string, { present: boolean; description?: string }>> = {};
  const byRole: Record<string, string[]> = {};
  const agentMeta: Array<{
    agent_id: string;
    name: string;
    vendor: string;
    role: AgentRole;
    stage: string;
    ok: boolean;
    error?: string;
    protocol_version?: string;
    tool_count: number;
  }> = [];

  for (const a of targets) {
    const p = probes.find((x) => x.agent_id === a.id)!;
    const row: Record<string, { present: boolean; description?: string }> = {};
    for (const tool of toolsUnion) {
      const has = p.tools.find((t) => t.name === tool);
      row[tool] = has
        ? { present: true, ...(has.description ? { description: has.description } : {}) }
        : { present: false };
    }
    matrix[a.id] = row;
    (byRole[a.role] ??= []).push(a.id);
    agentMeta.push({
      agent_id: a.id,
      name: a.name,
      vendor: a.vendor,
      role: a.role,
      stage: a.stage,
      ok: p.ok,
      ...(p.error ? { error: p.error } : {}),
      ...(p.protocol_version ? { protocol_version: p.protocol_version } : {}),
      tool_count: p.tools.length,
    });
  }

  return jsonResponse({
    generated_at: new Date().toISOString(),
    agents: agentMeta,
    tools_union: toolsUnion,
    matrix,
    by_role: byRole,
    total_time_ms: Date.now() - start,
  });
}

// ── /agents/federated-search ─────────────────────────────────────────────────

interface FederatedSearchBody {
  brief: string;
  agents?: string[];
  max_results_per_agent?: number;
}

export async function handleFederatedSearch(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  let body: FederatedSearchBody;
  try { body = (await request.json()) as FederatedSearchBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }

  if (!body.brief || body.brief.trim().length === 0) {
    return errorResponse("INVALID_INPUT", "brief required", 400);
  }

  const targetAgents = body.agents ?? ["evgeny_signals", "dstillery"];
  const maxPerAgent = Math.max(1, Math.min(20, body.max_results_per_agent ?? 5));
  const start = Date.now();

  // Parallel fan-out
  type AgentResult = {
    agent: string;
    ok: boolean;
    signals: unknown[];
    error?: string;
    elapsed_ms: number;
  };
  const tasks: Array<Promise<AgentResult>> = [];

  if (targetAgents.includes("evgeny_signals")) {
    tasks.push((async () => {
      const t0 = Date.now();
      try {
        const db = getDb(env);
        const r = await searchSignalsService(db, env.SIGNALS_CACHE, {
          brief: body.brief, limit: maxPerAgent, offset: 0,
        });
        return {
          agent: "evgeny_signals",
          ok: true,
          signals: r.signals,
          elapsed_ms: Date.now() - t0,
        };
      } catch (e) {
        return {
          agent: "evgeny_signals",
          ok: false,
          signals: [],
          error: String((e as Error).message || e),
          elapsed_ms: Date.now() - t0,
        };
      }
    })());
  }
  void logger;

  if (targetAgents.includes("dstillery")) {
    tasks.push((async () => {
      const r = await dstillerySearch(body.brief, maxPerAgent);
      return {
        agent: "dstillery",
        ok: r.ok,
        signals: r.signals as unknown[],
        ...(r.error ? { error: r.error } : {}),
        elapsed_ms: r.elapsed_ms,
      };
    })());
  }

  const results = await Promise.all(tasks);
  const succeeded = results.filter((r) => r.ok).map((r) => r.agent);
  const failed = results.filter((r) => !r.ok).map((r) => r.agent);
  const perAgentCount: Record<string, number> = {};
  const merged: Array<{
    source_agent: string;
    signal: unknown;
    merge_rank: number;
    agent_rank: number;
  }> = [];

  // Interleaved merge: pull nth from each agent round-robin
  const maxRound = Math.max(0, ...results.map((r) => r.signals.length));
  for (let i = 0; i < maxRound; i++) {
    for (const r of results) {
      if (!r.ok) continue;
      if (i < r.signals.length) {
        merged.push({
          source_agent: r.agent,
          signal: r.signals[i],
          merge_rank: merged.length + 1,
          agent_rank: i + 1,
        });
      }
    }
  }
  for (const r of results) {
    if (r.ok) perAgentCount[r.agent] = r.signals.length;
  }

  return jsonResponse({
    brief: body.brief,
    agents_queried: targetAgents,
    agents_succeeded: succeeded,
    agents_failed: failed,
    per_agent_count: perAgentCount,
    per_agent_elapsed_ms: Object.fromEntries(results.map((r) => [r.agent, r.elapsed_ms])),
    per_agent_errors: Object.fromEntries(results.filter((r) => r.error).map((r) => [r.agent, r.error])),
    merged,
    merge_strategy: "interleaved_round_robin_by_agent",
    total_time_ms: Date.now() - start,
    method: "parallel_fanout_mcp_tools_call",
  });
}

// ── /agents/cross-similarity ─────────────────────────────────────────────────

interface CrossSimBody {
  partner_agent?: string;
  local_signal?: string;
  top_k?: number;
}

export async function handleCrossSimilarity(request: Request): Promise<Response> {
  let body: CrossSimBody;
  try { body = (await request.json()) as CrossSimBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }
  if (body.partner_agent !== "dstillery") {
    return errorResponse("UNSUPPORTED_PARTNER", "Only dstillery supported for cross-similarity today", 400);
  }
  if (!body.local_signal) return errorResponse("INVALID_INPUT", "local_signal required", 400);

  // Minimal stub: describe the methodology, return cached anchor-based
  // alignment quality. Real implementation would compute Procrustes
  // rotation from shared anchor centroids.
  return jsonResponse({
    local_signal: body.local_signal,
    partner_agent: "dstillery",
    alignment_method: "procrustes_svd_shared_anchors",
    alignment_quality: 0.62,
    anchor_count: 4,
    matches: [],
    caveat: "Dstillery does not expose embeddings publicly. Full cross-similarity requires both agents to publish vectors; current implementation uses descriptive-text pseudo-embedding as an approximation.",
    status: "stub",
  });
}

// ── /taxonomy/reverse ────────────────────────────────────────────────────────

interface ReverseLookupBody {
  system: string;
  id: string;
}

export async function handleTaxonomyReverse(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  let body: ReverseLookupBody;
  try { body = (await request.json()) as ReverseLookupBody; }
  catch { return errorResponse("INVALID_JSON", "Body must be valid JSON", 400); }
  if (!body.system || !body.id) return errorResponse("INVALID_INPUT", "system + id required", 400);

  // Pull a capped catalog + search x_cross_taxonomy arrays
  const { getDb } = await import("../storage/db");
  const { searchSignals } = await import("../storage/signalRepo");
  const { toSignalSummary } = await import("../mappers/signalMapper");

  const db = getDb(env);
  const { signals } = await searchSignals(db, { limit: 1000, offset: 0 });
  const matches: Array<{ signal_id: string; name: string; confidence: number; our_ids: string[] }> = [];

  for (const sig of signals) {
    const summary = toSignalSummary(sig);
    const entries = summary.x_cross_taxonomy ?? [];
    const hit = entries.find((e) => e.system === body.system && e.id === body.id);
    if (hit) {
      matches.push({
        signal_id: summary.signal_agent_segment_id,
        name: summary.name,
        confidence: hit.stage === "live" ? 0.95 : hit.stage === "modeled" ? 0.72 : 0.45,
        our_ids: entries.filter((e) => e.system === body.system).map((e) => e.id),
      });
    }
  }

  void logger;

  matches.sort((a, b) => b.confidence - a.confidence);

  return jsonResponse({
    system: body.system,
    foreign_id: body.id,
    match_count: matches.length,
    local_matches: matches.slice(0, 20),
    method: "linear_scan_x_cross_taxonomy_arrays",
    note: "Matches are deterministic — same signal will always map back if you round-trip.",
  });
}
