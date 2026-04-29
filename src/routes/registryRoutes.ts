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
import { POLICIES, policiesForIndustries } from "../domain/policyRegistry";
import { AGENT_REGISTRY } from "../domain/agentRegistry";
import { getDemoProviderAttestations } from "../domain/workflowOrchestration";
import { predictGovernance } from "../domain/governanceMock";
import { predictBrandRights } from "../domain/brandRightsMock";
import { getLastDiffReport } from "../domain/registrySync";

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

  // Normalize URLs so trailing-slash drift doesn't show as a diff.
  // Registry sometimes lists "/mcp" and "/mcp/" as separate entries
  // (e.g. Claire scope3 appears under BOTH variants); we don't want
  // to flag them as 2 missing agents when we already have one entry.
  const normalize = (u: string | undefined): string => {
    if (!u) return "";
    let v = u.trim().replace(/\/+$/, "");           // drop trailing slash(es)
    v = v.replace(/\/mcp$/, "");                     // drop /mcp suffix for canonical compare
    return v.toLowerCase();
  };

  const remote = payload.agents ?? [];
  const remoteByMcp = new Map<string, RegistryAgentEntry>();
  for (const a of remote) {
    const key = normalize(a.mcp_endpoint || a.url);
    if (key && !remoteByMcp.has(key)) remoteByMcp.set(key, a);
  }

  // Diff: agents in registry that we don't have, agents we have that the
  // registry doesn't list. Used by the Canvas to render a freshness badge.
  const localMcpSet = new Set(
    AGENT_REGISTRY.map((a) => normalize(a.mcp_url ?? undefined)).filter((u) => !!u),
  );
  const seenInRegistry = new Set<string>();
  const onlyInRegistry: Array<{ name: string; mcp_url: string | undefined; added_date: string | undefined }> = [];
  for (const a of remote) {
    const key = normalize(a.mcp_endpoint || a.url);
    if (!key || localMcpSet.has(key) || seenInRegistry.has(key)) continue;
    seenInRegistry.add(key);
    onlyInRegistry.push({ name: a.name, mcp_url: a.mcp_endpoint || a.url, added_date: a.added_date });
  }

  const onlyInLocal = AGENT_REGISTRY
    .filter((a) => a.mcp_url && !remoteByMcp.has(normalize(a.mcp_url)))
    .map((a) => ({ id: a.id, name: a.name, mcp_url: a.mcp_url, role: a.role, stage: a.stage }));

  // MVP #4: piggyback the daily-cron report timestamp so the UI bar
  // can show "synced X hours ago" without a second round-trip.
  const lastDiff = await getLastDiffReport(env);

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
    last_cron_diff: lastDiff ? { ran_at: lastDiff.ran_at, only_in_registry: lastDiff.only_in_registry_count } : null,
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

// ── /registry/governance-preview ────────────────────────────────────────────
// MVP #2: predictive check_governance — local mock that derives a
// governance advisory from brand industries (Phase C) + signal
// attestations (Phase D). POST takes brand industries; GET takes
// the same via query string for easy curl + permalink.

interface GovernancePreviewBody {
  brand_industries?: string[];
  brand_domain?: string;
  signal_attestations?: Array<{ policy_id: string; claim: string; attestor?: string; attested_at?: string }>;
}

export async function handleGovernancePreview(
  request: Request,
  _env: Env,
  _logger: Logger,
): Promise<Response> {
  let industries: string[] = [];
  let attestations: ReturnType<typeof getDemoProviderAttestations> = [];

  if (request.method === "GET") {
    const url = new URL(request.url);
    const ind = url.searchParams.get("industries") || "";
    industries = ind.split(",").map((s) => s.trim()).filter(Boolean);
    // GET path uses the demo provider's static attestations — keeps
    // the URL short and shareable for Canvas permalinks.
    attestations = getDemoProviderAttestations();
  } else {
    try {
      const body: GovernancePreviewBody = await request.json();
      industries = Array.isArray(body.brand_industries) ? body.brand_industries : [];
      attestations = Array.isArray(body.signal_attestations) && body.signal_attestations.length > 0
        ? body.signal_attestations.map((a) => ({
            policy_id: a.policy_id,
            claim: a.claim,
            attestor: a.attestor || "unknown",
            attested_at: a.attested_at || new Date().toISOString(),
          }))
        : getDemoProviderAttestations();
    } catch {
      return errorResponse("INVALID_INPUT", "body must be JSON", 400);
    }
  }

  const applicable = policiesForIndustries(industries);
  const advisory = predictGovernance(applicable, attestations);

  return jsonResponse({
    mode: "predictive_local",
    note: "Mock check_governance — derived locally from policyRegistry × signal_attestations. No vendor in the AdCP directory currently advertises check_governance live.",
    inputs: {
      brand_industries: industries,
      applicable_policy_count: applicable.length,
      attestation_count: attestations.length,
    },
    advisory,
  });
}

// ── /registry/brand-rights-preview ──────────────────────────────────────────
// Workshop refinement C: predictive brand-rights — local mock that
// mirrors the governance overlay pattern. Closes the AdCP 3.0.1
// governance + brand-rights domain pair on Canvas.
//
// POST: { brand_classification: {kind, house_domain?}, chosen_formats: [{format_id, subtype?}] }
// GET:  ?kind=master|sub_brand|independent&house_domain=...&format_ids=a,b,c&subtypes=x,y,z

interface BrandRightsPreviewBody {
  brand_classification?: { kind?: string; house_domain?: string | null };
  chosen_formats?: Array<{ format_id: string; subtype?: string; label?: string }>;
}

export async function handleBrandRightsPreview(
  request: Request,
  _env: Env,
  _logger: Logger,
): Promise<Response> {
  let classification: BrandRightsPreviewBody["brand_classification"] = undefined;
  let formats: NonNullable<BrandRightsPreviewBody["chosen_formats"]> = [];

  if (request.method === "GET") {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") || undefined;
    const houseDomain = url.searchParams.get("house_domain") || undefined;
    if (kind) classification = { kind, ...(houseDomain ? { house_domain: houseDomain } : {}) };
    const ids = (url.searchParams.get("format_ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const subs = (url.searchParams.get("subtypes") || "").split(",").map((s) => s.trim());
    formats = ids.map((id, i) => {
      const f: { format_id: string; subtype?: string } = { format_id: id };
      if (subs[i]) f.subtype = subs[i]!;
      return f;
    });
  } else {
    try {
      const body: BrandRightsPreviewBody = await request.json();
      classification = body.brand_classification;
      formats = Array.isArray(body.chosen_formats) ? body.chosen_formats : [];
    } catch {
      return errorResponse("INVALID_INPUT", "body must be JSON", 400);
    }
  }

  const advisory = predictBrandRights(classification, formats);
  return jsonResponse({
    mode: "predictive_local",
    note: "Mock brand-rights — derived from brand.classification × chosen_formats. No vendor in the AdCP directory currently advertises get_rights / acquire_rights / update_rights live.",
    inputs: {
      brand_classification: classification ?? null,
      chosen_format_count: formats.length,
    },
    advisory,
  });
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
