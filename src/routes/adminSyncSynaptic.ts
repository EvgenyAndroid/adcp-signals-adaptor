// src/routes/adminSyncSynaptic.ts
// Operator endpoint + cron body: pull the publisher's synaptic audience
// catalog and upsert it as sig catalog rows (syn_* ids). Idempotent — same
// upsert path as the seed pipeline. Runs daily from scheduled() alongside
// the registry sync, and on demand here after a publisher-side catalog
// change. Note /admin/reseed DELETEs the signals table and rebuilds from
// code only — synaptic rows disappear until the next sync; the daily cron
// (or this endpoint) restores them.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { getDb } from "../storage/db";
import { upsertSignal } from "../storage/signalRepo";
import { jsonResponse, errorResponse, requireAuth } from "./shared";
import {
  fetchSynapticCatalog,
  buildSynapticSignals,
  DEFAULT_SYNAPTIC_CATALOG_URL,
} from "../connectors/synapticLoader";

export async function runSynapticSync(
  env: Env,
  logger: Logger
): Promise<{ synced: number; catalog_url: string }> {
  const url = env.SYNAPTIC_CATALOG_URL || DEFAULT_SYNAPTIC_CATALOG_URL;
  const cat = await fetchSynapticCatalog(url);
  const signals = buildSynapticSignals(cat, new Date().toISOString());
  const db = getDb(env);
  for (const signal of signals) {
    await upsertSignal(db, signal);
  }
  logger.info("synaptic_sync_done", { synced: signals.length, url });
  return { synced: signals.length, catalog_url: url };
}

export async function handleAdminSyncSynaptic(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!requireAuth(request, env.DEMO_API_KEY)) {
    return errorResponse(
      "UNAUTHORIZED",
      "Synaptic sync requires the DEMO_API_KEY bearer token.",
      401
    );
  }
  try {
    const result = await runSynapticSync(env, logger);
    return jsonResponse({
      ok: true,
      ...result,
      message:
        "Synaptic publisher catalog federated. syn_* signals are live in " +
        "get_signals / query_signals_nl on the next request.",
    });
  } catch (err) {
    logger.error("synaptic_sync_failed", { error: String(err) });
    return errorResponse("SYNAPTIC_SYNC_FAILED", String(err), 502);
  }
}
