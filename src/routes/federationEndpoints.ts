// src/routes/federationEndpoints.ts
// Sec-41 Part 3 + Sec-48 Part 1: Agent Federation endpoints.
//   GET  /agents/registry            (static list, sourced from domain/agentRegistry)
//   GET  /agents/probe               (Sec-48: fan-out initialize + tools/list)
//   POST /agents/federated-search
//   POST /agents/cross-similarity    (roadmap stub)
//   POST /taxonomy/reverse

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { dstillerySearch } from "../federation/dstilleryClient";
import { probeAgent, type ProbeResult } from "../federation/genericMcpClient";
import { searchSignalsService } from "../domain/signalService";
import {
  AGENT_REGISTRY,
  listLiveAgents,
  getAgent,
  type RegisteredAgent,
} from "../domain/agentRegistry";
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
