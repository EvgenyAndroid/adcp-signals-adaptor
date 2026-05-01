// src/routes/vendorHealthRoutes.ts
//
// Wave 5 — Vendor Health Dashboard endpoints.
//
//   GET  /vendor-health/snapshot
//        Live snapshot: probes all live agents in parallel (8s/agent
//        timeout), merges with circuit state + registry, appends one
//        datapoint per probed vendor to the KV history ring buffer,
//        returns the snapshot + history map.
//
//   GET  /vendor-health/snapshot?probe=false
//        Metadata-only: skip live probes, use cached circuit state +
//        registry metadata. Used for fast initial page-load before
//        the user clicks "Refresh now."
//
//   POST /vendor-health/probe-one
//        Single-vendor live probe. The dashboard sends this when the
//        operator clicks "Re-probe" on a specific row, so they don't
//        have to wait for the full fan-out again.
//
// All endpoints are GET-or-POST and unauth (same posture as Race Canvas
// and Agentic routes — no paid actions, only diagnostic views).
//
// The `probe=true` snapshot is on the slow side (~8s upper bound bound
// by the slowest agent's handshake). The dashboard renders a loading
// state while it's in flight.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { buildVendorHealthSnapshot } from "../domain/vendorHealthSnapshot";
import { appendSnapshotDatapoints, readHistories, appendDatapoint, type HealthDatapoint } from "../storage/vendorHealthHistory";
import { AGENT_REGISTRY } from "../domain/agentRegistry";
import { probeAgent, getCircuitSnapshot } from "../federation/genericMcpClient";
// ensureSelfHooksInstalled wires the Cloudflare self-fetch shim into
// the generic MCP client. Without it, probeAgent against our own /mcp
// URL is blocked by Cloudflare (worker-can't-fetch-its-own-public-hostname,
// CF error 1042) and returns alive:false ~25ms in — which the dashboard
// renders as DOWN even though our agent is fine. Every other route that
// probes agents (agenticRoutes, dspRoutes, agentsEndpoints) calls this;
// the Wave 5 ship missed it.
import { ensureSelfHooksInstalled } from "./agentsEndpoints";

// ── GET /vendor-health/snapshot ─────────────────────────────────────────────

export async function handleVendorHealthSnapshot(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);

  const url = new URL(request.url);
  const probeLive = url.searchParams.get("probe") !== "false";

  const snap = await buildVendorHealthSnapshot({ probeLive });

  // Append to KV history (best-effort, fire-and-await but failures
  // don't propagate). Only append when we actually probed; metadata-only
  // snapshots don't add useful history.
  if (probeLive) {
    await appendSnapshotDatapoints(env, snap.rows);
  }

  // Read history for all vendors so the dashboard can render sparklines
  // in one round-trip.
  const histories = await readHistories(env, snap.rows.map((r) => r.agent_id));

  logger.info("vendor_health_snapshot", {
    probed: snap.probed,
    total: snap.total,
    healthy: snap.counts.healthy,
    degraded: snap.counts.degraded,
    down: snap.counts.down,
  });

  return jsonResponse({
    ...snap,
    histories,
  });
}

// ── POST /vendor-health/probe-one ───────────────────────────────────────────

interface ProbeOneBody {
  agent_id?: string;
}

export async function handleVendorHealthProbeOne(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);

  let body: ProbeOneBody = {};
  try { body = await request.json(); } catch { /* empty */ }

  const agentId = (body.agent_id ?? "").trim();
  if (!agentId) {
    return errorResponse("INVALID_INPUT", "agent_id required", 400);
  }

  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent) {
    return errorResponse("NOT_FOUND", `agent_id "${agentId}" not in registry`, 404);
  }
  if (!agent.mcp_url) {
    return errorResponse("INVALID_INPUT", `agent ${agentId} has no mcp_url (stage=${agent.stage})`, 400);
  }

  const ts = new Date().toISOString();
  const result = await probeAgent(agent.mcp_url, { timeoutMs: 8000 });

  // Refresh circuit state into the row.
  const circuit = getCircuitSnapshot().find((c) => c.url === agent.mcp_url);

  // Compute a quick health bucket — same logic as the snapshot module
  // but inline because we only have one row to evaluate.
  let bucket: HealthDatapoint["health_bucket"];
  if (circuit?.state === "open") bucket = "down";
  else if (!result.alive) bucket = "down";
  else if ((result.latency_ms ?? 0) > 5000) bucket = "degraded";
  else if (circuit?.state === "half_open") bucket = "degraded";
  else bucket = "healthy";

  const dp: HealthDatapoint = {
    ts,
    alive: result.alive,
    latency_ms: result.latency_ms,
    health_bucket: bucket,
    circuit_state: circuit?.state ?? null,
  };
  await appendDatapoint(env, agent.id, dp);

  logger.info("vendor_health_probe_one", { agent_id: agentId, alive: result.alive, latency_ms: result.latency_ms });

  return jsonResponse({
    agent_id: agent.id,
    agent_name: agent.name,
    vendor: agent.vendor,
    role: agent.role,
    probed: true,
    alive: result.alive,
    latency_ms: result.latency_ms,
    probe_error: result.error ?? null,
    tools_count: result.tools?.length ?? null,
    server_name: result.server_info?.name ?? null,
    protocol_version: result.protocol_version ?? null,
    circuit_state: circuit?.state ?? null,
    circuit_failure_count: circuit?.failure_count ?? 0,
    circuit_success_count: circuit?.success_count ?? 0,
    health_bucket: bucket,
    snapshot_ts: ts,
  });
}
