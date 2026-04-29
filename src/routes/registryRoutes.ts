// src/routes/registryRoutes.ts
//
// Phase B + C of the agentic-advertising registry integration:
//
//   GET  /registry/agents    — passthrough + KV cache of /api/registry/agents
//                              (no live policy applied; the orchestrator still
//                              uses src/domain/agentRegistry.ts as the source
//                              of truth — this view is informational, used by
//                              the Canvas to surface "what does the registry
//                              actually have today vs what we know")
//
//   GET  /registry/policies  — serves the local snapshot from
//                              src/domain/policyRegistry.ts. As of 2026-04-29
//                              the upstream `/api/registry/policies` endpoint
//                              returns 404; when it ships, this handler
//                              becomes a passthrough (and the snapshot
//                              becomes a fallback / seed).
//
// Both endpoints are unauth — same posture as the public registry.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { POLICIES } from "../domain/policyRegistry";
import { AGENT_REGISTRY } from "../domain/agentRegistry";

const REGISTRY_AGENTS_URL = "https://agenticadvertising.org/api/registry/agents";
const AGENTS_TTL_SEC = 3600;          // 1 hour — registry doesn't change fast
const AGENTS_KEY = "registry_agents:v1";

interface RegistryAgentEntry {
  name: string;
  url?: string;
  type?: string;
  protocol?: string;
  description?: string;
  mcp_endpoint?: string;
  contact?: { name?: string; email?: string; website?: string };
  added_date?: string;
  source?: string;
  member?: { slug?: string; display_name?: string };
}

// ── /registry/agents ────────────────────────────────────────────────────────

export async function handleRegistryAgents(
  _request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  // Try KV first
  try {
    const cached = await env.SIGNALS_CACHE.get(AGENTS_KEY, "json");
    if (cached) {
      return jsonResponse({ ...(cached as object), cache: "hit" });
    }
  } catch { /* fall through */ }

  let payload: { agents?: RegistryAgentEntry[] } = { agents: [] };
  try {
    const res = await fetch(REGISTRY_AGENTS_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      logger.warn("registry_agents_upstream_status", { status: res.status });
      return errorResponse("UPSTREAM_ERROR", "Registry agents fetch failed: " + res.status, 502);
    }
    payload = (await res.json()) as { agents?: RegistryAgentEntry[] };
  } catch (e) {
    logger.warn("registry_agents_upstream_error", { error: String((e as Error).message || e) });
    return errorResponse("UPSTREAM_ERROR", "Registry unreachable", 502);
  }

  const remote = payload.agents ?? [];
  const remoteByMcp = new Map<string, RegistryAgentEntry>();
  for (const a of remote) {
    const key = (a.mcp_endpoint || a.url || "").trim();
    if (key) remoteByMcp.set(key, a);
  }

  // Diff: agents in registry that we don't have, agents we have that the
  // registry doesn't list. Used by the Canvas to render a freshness badge.
  const localMcpSet = new Set(
    AGENT_REGISTRY.map((a) => a.mcp_url).filter((u): u is string => !!u),
  );
  const onlyInRegistry = remote.filter((a) => {
    const key = (a.mcp_endpoint || a.url || "").trim();
    return key && !localMcpSet.has(key);
  }).map((a) => ({ name: a.name, mcp_url: a.mcp_endpoint || a.url, added_date: a.added_date }));

  const onlyInLocal = AGENT_REGISTRY
    .filter((a) => a.mcp_url && !remoteByMcp.has(a.mcp_url))
    .map((a) => ({ id: a.id, name: a.name, mcp_url: a.mcp_url, role: a.role, stage: a.stage }));

  const out = {
    fetched_at: new Date().toISOString(),
    cache: "miss",
    counts: {
      registry: remote.length,
      local: AGENT_REGISTRY.length,
      only_in_registry: onlyInRegistry.length,
      only_in_local: onlyInLocal.length,
    },
    only_in_registry: onlyInRegistry,
    only_in_local: onlyInLocal,
    agents: remote,
  };

  try {
    const { cache: _c, ...store } = out;
    void _c;
    await env.SIGNALS_CACHE.put(AGENTS_KEY, JSON.stringify(store), {
      expirationTtl: AGENTS_TTL_SEC,
    });
  } catch { /* non-fatal */ }

  return jsonResponse(out);
}

// ── /registry/policies ──────────────────────────────────────────────────────

export async function handleRegistryPolicies(
  _request: Request,
  _env: Env,
  _logger: Logger,
): Promise<Response> {
  // Local snapshot — see src/domain/policyRegistry.ts header for sourcing.
  // When upstream API lands, switch to passthrough + cache (mirror
  // brandRegistry.ts pattern) and keep this snapshot as fallback.
  return jsonResponse({
    source: "local_snapshot",
    snapshot_date: "2026-04-29",
    upstream_status: "404 — /api/registry/policies not yet implemented",
    count: POLICIES.length,
    policies: POLICIES,
  });
}
