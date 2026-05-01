// src/domain/vendorHealthSnapshot.ts
//
// Wave 5 — Vendor Health Dashboard backend logic.
//
// Single function `buildVendorHealthSnapshot()` that probes all live
// agents in parallel, merges with the in-isolate circuit-breaker state,
// and returns a per-vendor health row plus aggregate counters. The
// dashboard route serializes this directly to JSON.
//
// What's surfaced per vendor:
//   - registry metadata (id, name, vendor, role, stage, mcp_url)
//   - probe outcome (alive, latency_ms, tools_count, server_info)
//   - circuit state (closed/half_open/open + counters)
//   - composite health (green/yellow/red traffic light)
//
// Aggregate counters at the top of the dashboard let the operator scan
// the whole fleet in one glance — "13 alive · 4 known issues · 0 trips."
//
// Probes use a generous timeout (8s) because we want false-negatives
// to be rare even when a vendor's edge is slow. A vendor that takes
// 8s to handshake renders as alive-but-slow rather than dead.

import { AGENT_REGISTRY, getLiveAgents, type RegisteredAgent } from "./agentRegistry";
import { probeAgent, getCircuitSnapshot } from "../federation/genericMcpClient";

export type CircuitStateName = "closed" | "open" | "half_open";
export type HealthBucket = "healthy" | "degraded" | "down" | "unknown";

export interface VendorHealthRow {
  // Registry-side metadata.
  agent_id: string;
  agent_name: string;
  vendor: string;
  role: string;
  stage: string;
  mcp_url: string | null;
  protocols: string[];
  specialties: string[];
  notes: string | null;

  // Probe outcome (null if not probed in this snapshot).
  probed: boolean;
  alive: boolean;
  latency_ms: number | null;
  probe_error: string | null;
  tools_count: number | null;
  server_name: string | null;
  protocol_version: string | null;

  // Circuit-breaker state (from in-isolate map, may be missing for
  // vendors we haven't called yet this isolate).
  circuit_state: CircuitStateName | null;
  circuit_failure_count: number;
  circuit_success_count: number;
  circuit_last_event_ts: number | null;

  // Composite traffic-light bucket — what the dashboard renders as a pill.
  health_bucket: HealthBucket;
  health_reason: string;

  // ISO-8601 wall-clock of when this snapshot was taken.
  snapshot_ts: string;
}

export interface VendorHealthSnapshot {
  ts: string;
  total: number;
  counts: {
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
    by_stage: { live: number; known_issue: number; roadmap: number };
    by_role: { signals: number; buying: number; creative: number; unclassified: number };
    circuits: { closed: number; half_open: number; open: number };
  };
  rows: VendorHealthRow[];
  // True if this snapshot ran live probes; false if it was metadata-only.
  probed: boolean;
}

/**
 * Bucket a vendor into a traffic-light state. Order of checks:
 *
 *   1. Known-issue / roadmap stage → `unknown` with stage reason
 *   2. Circuit OPEN → `down` (we're tripping it, vendor is failing)
 *   3. Probe failed → `down` (couldn't even handshake)
 *   4. Latency > 5s → `degraded` (slow but alive)
 *   5. Circuit half_open → `degraded` (recovering from a trip)
 *   6. Otherwise → `healthy`
 */
function bucketHealth(
  agent: RegisteredAgent,
  probed: boolean,
  alive: boolean,
  latency_ms: number | null,
  circuit_state: CircuitStateName | null,
  probe_error: string | null,
): { bucket: HealthBucket; reason: string } {
  if (agent.stage === "known_issue") {
    return { bucket: "unknown", reason: "Directory marks this vendor as known-issue; not probed." };
  }
  if (agent.stage === "roadmap") {
    return { bucket: "unknown", reason: "Roadmap-only — no MCP endpoint advertised yet." };
  }
  if (!probed) {
    return { bucket: "unknown", reason: "Not probed in this snapshot." };
  }
  if (circuit_state === "open") {
    return { bucket: "down", reason: "Circuit breaker is OPEN — too many recent failures, requests short-circuit until cooldown." };
  }
  if (!alive) {
    return { bucket: "down", reason: probe_error ? `Probe failed: ${probe_error.slice(0, 120)}` : "Probe failed (no error detail)." };
  }
  if (latency_ms !== null && latency_ms > 5000) {
    return { bucket: "degraded", reason: `Slow handshake: ${latency_ms}ms exceeds the 5s degraded threshold.` };
  }
  if (circuit_state === "half_open") {
    return { bucket: "degraded", reason: "Circuit half-open — recovering from a recent trip; one trial call in flight." };
  }
  return { bucket: "healthy", reason: "Probe alive within latency budget; circuit closed." };
}

/**
 * Build a fresh vendor-health snapshot. Probes ALL live agents in
 * parallel; known_issue + roadmap stages are reported metadata-only
 * (no probe). Per-call timeout 8s; total wall-clock bounded by the
 * slowest probe.
 *
 * @param probeLive when false, returns the snapshot WITHOUT probing
 *                  (uses cached circuit state + registry metadata only).
 *                  Used by the initial page-load to render quickly.
 */
export async function buildVendorHealthSnapshot(opts?: { probeLive?: boolean }): Promise<VendorHealthSnapshot> {
  const probeLive = opts?.probeLive !== false; // default true
  const ts = new Date().toISOString();

  // Pull circuit state once at the top — same map serves all rows.
  const circuitSnap = getCircuitSnapshot();
  const circuitByUrl = new Map(circuitSnap.map((c) => [c.url, c]));

  const liveAgents = getLiveAgents().filter((a) => !!a.mcp_url);
  const otherAgents = AGENT_REGISTRY.filter((a) => !liveAgents.includes(a));

  // Probe live agents in parallel. Each task is bounded by the
  // probeAgent internal timeout; we don't add a Promise.race on top.
  const probeResults = probeLive
    ? await Promise.all(liveAgents.map(async (a) => {
        const r = await probeAgent(a.mcp_url!, { timeoutMs: 8000 });
        return { agent: a, result: r };
      }))
    : liveAgents.map((a) => ({ agent: a, result: null as Awaited<ReturnType<typeof probeAgent>> | null }));

  const liveRows: VendorHealthRow[] = probeResults.map(({ agent, result }) => {
    const circuit = agent.mcp_url ? circuitByUrl.get(agent.mcp_url) : undefined;
    const probed = result !== null;
    const alive = result?.alive ?? false;
    const latency_ms = result?.latency_ms ?? null;
    const tools_count = result?.tools?.length ?? null;
    const server_name = result?.server_info?.name ?? null;
    const probe_error = result?.error ?? null;
    const protocol_version = result?.protocol_version ?? null;
    const circuit_state = circuit?.state ?? null;
    const { bucket, reason } = bucketHealth(agent, probed, alive, latency_ms, circuit_state, probe_error);

    return {
      agent_id: agent.id,
      agent_name: agent.name,
      vendor: agent.vendor,
      role: agent.role,
      stage: agent.stage,
      mcp_url: agent.mcp_url,
      protocols: agent.protocols ?? [],
      specialties: agent.specialties ?? [],
      notes: agent.notes ?? null,
      probed,
      alive,
      latency_ms,
      probe_error,
      tools_count,
      server_name,
      protocol_version,
      circuit_state,
      circuit_failure_count: circuit?.failure_count ?? 0,
      circuit_success_count: circuit?.success_count ?? 0,
      circuit_last_event_ts: circuit?.last_event_ts ?? null,
      health_bucket: bucket,
      health_reason: reason,
      snapshot_ts: ts,
    };
  });

  const otherRows: VendorHealthRow[] = otherAgents.map((agent) => {
    const { bucket, reason } = bucketHealth(agent, false, false, null, null, null);
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      vendor: agent.vendor,
      role: agent.role,
      stage: agent.stage,
      mcp_url: agent.mcp_url,
      protocols: agent.protocols ?? [],
      specialties: agent.specialties ?? [],
      notes: agent.notes ?? null,
      probed: false,
      alive: false,
      latency_ms: null,
      probe_error: null,
      tools_count: null,
      server_name: null,
      protocol_version: null,
      circuit_state: null,
      circuit_failure_count: 0,
      circuit_success_count: 0,
      circuit_last_event_ts: null,
      health_bucket: bucket,
      health_reason: reason,
      snapshot_ts: ts,
    };
  });

  const rows = [...liveRows, ...otherRows];

  const counts = {
    healthy: rows.filter((r) => r.health_bucket === "healthy").length,
    degraded: rows.filter((r) => r.health_bucket === "degraded").length,
    down: rows.filter((r) => r.health_bucket === "down").length,
    unknown: rows.filter((r) => r.health_bucket === "unknown").length,
    by_stage: {
      live: rows.filter((r) => r.stage === "live").length,
      known_issue: rows.filter((r) => r.stage === "known_issue").length,
      roadmap: rows.filter((r) => r.stage === "roadmap").length,
    },
    by_role: {
      signals: rows.filter((r) => r.role === "signals").length,
      buying: rows.filter((r) => r.role === "buying").length,
      creative: rows.filter((r) => r.role === "creative").length,
      unclassified: rows.filter((r) => r.role === "unclassified").length,
    },
    circuits: {
      closed: rows.filter((r) => r.circuit_state === "closed").length,
      half_open: rows.filter((r) => r.circuit_state === "half_open").length,
      open: rows.filter((r) => r.circuit_state === "open").length,
    },
  };

  return {
    ts,
    total: rows.length,
    counts,
    rows,
    probed: probeLive,
  };
}
