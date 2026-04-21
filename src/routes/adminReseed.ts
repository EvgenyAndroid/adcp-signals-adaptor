// src/routes/adminReseed.ts
// Operator-only endpoint to force-reseed the signal catalog in production.
//
// The auto-seed gate in seedPipeline.ts short-circuits when the signals
// table has any rows, so shipping new SEEDED_SIGNALS / derived / vertical
// definitions via a code deploy does NOT repopulate the DB. Either the
// operator flushes the table out-of-band (wrangler d1 execute "DELETE ...")
// or this endpoint drops the catalog and re-runs the pipeline with
// force=true in a single authenticated request.
//
// Scope:
//   - Auth-gated: DEMO_API_KEY required (Authorization: Bearer <key>).
//   - TRUNCATEs the `signals` table, then calls runSeedPipeline(force=true).
//   - Taxonomy nodes are preserved (seed re-UPSERTs them; no DELETE).
//   - POST only — GET bounces to 405 so a browser typo can't trigger it.
//
// NOT intended for frequent use. Every call rebuilds the catalog from
// the committed code and therefore cannot be scheduled as a "refresh" —
// it only makes sense immediately after a deploy that changes the
// signal definitions. The production runbook should call this once
// per relevant deploy.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { getDb, execute } from "../storage/db";
import { runSeedPipeline } from "../domain/seedPipeline";
import { jsonResponse, errorResponse, requireAuth } from "./shared";
import { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv } from "../seedData";

export async function handleAdminReseed(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!requireAuth(request, env.DEMO_API_KEY)) {
    return errorResponse(
      "UNAUTHORIZED",
      "Admin reseed requires the DEMO_API_KEY bearer token.",
      401,
    );
  }

  const db = getDb(env);
  logger.info("admin_reseed_start");

  // Drop all signals. Using DELETE not TRUNCATE because D1 / SQLite has
  // no TRUNCATE; this is fine at demo-catalog scale (~350 rows).
  await execute(db, "DELETE FROM signals", []);
  logger.info("admin_reseed_signals_deleted");

  const result = await runSeedPipeline(
    db,
    { taxonomyTsv, demographicsCsv, interestsCsv, geoCsv },
    logger,
    true, // force: bypass the "already populated" short-circuit
  );

  logger.info("admin_reseed_complete", { seeded: result.seeded });
  return jsonResponse({
    ok: true,
    seeded: result.seeded,
    skipped: result.skipped,
    message:
      "Signal catalog reseeded. The /capabilities and /mcp get_signals " +
      "endpoints will reflect the new catalog on the next request.",
  });
}
