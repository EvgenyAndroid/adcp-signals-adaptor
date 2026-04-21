// src/routes/adminPurge.ts
// Sec-40: manual trigger for the weekly D1 housekeeping purge.
//
// The cron trigger in wrangler.toml runs this on schedule (Sundays 06:00 UTC),
// but operators also want an ad-hoc button — e.g. right after a noisy demo
// run, or before a review where you want the tool log to show only the
// rehearsal. This endpoint wraps runScheduledPurge with the same auth gate
// as /admin/reseed: DEMO_API_KEY bearer required.
//
// Runtime cost: O(rows deleted). At demo scale the full purge runs in well
// under a second; the cron path uses ctx.waitUntil so the scheduled invocation
// can return instantly, but the admin path waits for the result so the
// operator can see the deletion counts inline.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse, requireAuth } from "./shared";
import { runScheduledPurge } from "../storage/scheduledPurge";

export async function handleAdminPurge(
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
      "Admin purge requires the DEMO_API_KEY bearer token.",
      401,
    );
  }

  const result = await runScheduledPurge(env, logger);
  return jsonResponse(result);
}
