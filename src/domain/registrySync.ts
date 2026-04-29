// src/domain/registrySync.ts
//
// MVP #4: daily auto-backfill cron handler. Runs from src/index.ts
// `scheduled()` on the "0 4 * * *" cron. Pulls /api/registry/agents,
// diffs against the in-code AGENT_REGISTRY, writes the report to KV
// under `registry_diff_report`. The Canvas registry-sync bar reads
// the same key for its "as of <timestamp>" freshness signal.
//
// In production, the handler could open a PR via the GitHub API when
// the diff is non-zero — for the MVP we just write the report. Manual
// PR-bot is the next iteration.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { AGENT_REGISTRY } from "./agentRegistry";

const REGISTRY_AGENTS_URL = "https://agenticadvertising.org/api/registry/agents";
const REGISTRY_DIFF_REPORT_KEY = "registry_diff_report";
const REPORT_TTL_SEC = 60 * 60 * 24 * 7;  // 7 days — overwritten every cron run anyway

interface RegistryAgentEntry {
  name: string;
  url?: string;
  mcp_endpoint?: string;
  added_date?: string;
}

interface DiffReport {
  ran_at: string;
  upstream_status: "ok" | "error";
  upstream_error?: string;
  registry_count: number;
  local_count: number;
  only_in_registry_count: number;
  only_in_local_count: number;
  only_in_registry: Array<{ name: string; mcp_url: string | undefined; added_date?: string }>;
  only_in_local: Array<{ id: string; name: string }>;
}

function normalize(u: string | undefined | null): string {
  if (!u) return "";
  let v = u.trim().replace(/\/+$/, "");
  v = v.replace(/\/mcp$/, "");
  return v.toLowerCase();
}

export async function runRegistrySyncDiff(env: Env, logger: Logger): Promise<DiffReport> {
  const ranAt = new Date().toISOString();
  let upstreamAgents: RegistryAgentEntry[] = [];
  let upstreamError: string | undefined;
  try {
    const res = await fetch(REGISTRY_AGENTS_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      upstreamError = `HTTP ${res.status}`;
    } else {
      const body = (await res.json()) as { agents?: RegistryAgentEntry[] };
      upstreamAgents = body.agents ?? [];
    }
  } catch (e) {
    upstreamError = String((e as Error).message || e);
  }

  const localKeys = new Set(
    AGENT_REGISTRY
      .map((a) => normalize(a.mcp_url ?? undefined))
      .filter((k) => !!k),
  );
  const remoteKeyToEntry = new Map<string, RegistryAgentEntry>();
  for (const a of upstreamAgents) {
    const k = normalize(a.mcp_endpoint || a.url);
    if (k && !remoteKeyToEntry.has(k)) remoteKeyToEntry.set(k, a);
  }

  const onlyInRegistry: DiffReport["only_in_registry"] = [];
  for (const [k, a] of remoteKeyToEntry.entries()) {
    if (!localKeys.has(k)) {
      const entry: DiffReport["only_in_registry"][number] = {
        name: a.name,
        mcp_url: a.mcp_endpoint || a.url,
      };
      if (a.added_date !== undefined) entry.added_date = a.added_date;
      onlyInRegistry.push(entry);
    }
  }

  const onlyInLocal: DiffReport["only_in_local"] = AGENT_REGISTRY
    .filter((a) => a.mcp_url && !remoteKeyToEntry.has(normalize(a.mcp_url)))
    .map((a) => ({ id: a.id, name: a.name }));

  const report: DiffReport = {
    ran_at: ranAt,
    upstream_status: upstreamError ? "error" : "ok",
    ...(upstreamError !== undefined ? { upstream_error: upstreamError } : {}),
    registry_count: upstreamAgents.length,
    local_count: AGENT_REGISTRY.length,
    only_in_registry_count: onlyInRegistry.length,
    only_in_local_count: onlyInLocal.length,
    only_in_registry: onlyInRegistry,
    only_in_local: onlyInLocal,
  };

  try {
    await env.SIGNALS_CACHE.put(REGISTRY_DIFF_REPORT_KEY, JSON.stringify(report), {
      expirationTtl: REPORT_TTL_SEC,
    });
  } catch (e) {
    logger.warn("registry_sync_kv_write_failed", { error: String((e as Error).message || e) });
  }

  logger.info("registry_sync_done", {
    upstream_status: report.upstream_status,
    registry_count: report.registry_count,
    local_count: report.local_count,
    only_in_registry: report.only_in_registry_count,
    only_in_local: report.only_in_local_count,
  });

  return report;
}

export async function getLastDiffReport(env: Env): Promise<DiffReport | null> {
  try {
    const r = await env.SIGNALS_CACHE.get(REGISTRY_DIFF_REPORT_KEY, "json");
    return (r as DiffReport | null) ?? null;
  } catch {
    return null;
  }
}
