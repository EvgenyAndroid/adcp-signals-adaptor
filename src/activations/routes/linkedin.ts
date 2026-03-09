/**
 * src/activations/routes/linkedin.ts
 *
 * Route handler for POST /signals/activate/linkedin
 *
 * ── Usage ──────────────────────────────────────────────────────────────────────
 *
 * 1. Dry run — preview targeting without creating a campaign:
 *
 *   curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/activate/linkedin \
 *     -H "Authorization: Bearer demo-key-adcp-signals-v1" \
 *     -H "Content-Type: application/json" \
 *     -d "{\"signal_agent_segment_id\": \"sig_graduate_educated_adults\", \"dry_run\": true}"
 *
 * 2. Activate a single catalog signal as a LinkedIn DRAFT campaign:
 *
 *   curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/activate/linkedin \
 *     -H "Authorization: Bearer demo-key-adcp-signals-v1" \
 *     -H "Content-Type: application/json" \
 *     -d "{\"signal_agent_segment_id\": \"sig_age_35_44\", \"dry_run\": false}"
 *
 * 3. Activate from NLAQ resolved dimensions:
 *
 *   curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/activate/linkedin \
 *     -H "Authorization: Bearer demo-key-adcp-signals-v1" \
 *     -H "Content-Type: application/json" \
 *     -d "{
 *       \"dimensions\": [
 *         {\"dimension\": \"age_band\",  \"value\": \"35-44\"},
 *         {\"dimension\": \"geo\",       \"value\": \"Nashville\"},
 *         {\"dimension\": \"education\", \"value\": \"graduate\"}
 *       ],
 *       \"campaign_name\": \"AdCP — Nashville Graduates — Q2 2026\",
 *       \"daily_budget_usd\": 50,
 *       \"bid_usd\": 10,
 *       \"dry_run\": false
 *     }"
 */

import { LinkedInAdapter } from '../adapters/linkedin';
import type { LinkedInEnv, LinkedInActivationRequest } from '../types/linkedin';

export interface LinkedInRouteEnv extends LinkedInEnv {
  DEMO_API_KEY: string;
}

export async function handleLinkedInActivate(
  request: Request,
  env: LinkedInRouteEnv,
): Promise<Response> {
  const start = Date.now();

  try {
    const body = await request.json() as LinkedInActivationRequest & { dry_run?: boolean };

    if (!body.signal_agent_segment_id && (!body.dimensions || body.dimensions.length === 0)) {
      return jsonResponse({
        success: false,
        error: 'Provide signal_agent_segment_id or dimensions[]',
        duration_ms: Date.now() - start,
      }, 400);
    }

    const adapter = new LinkedInAdapter();

    const result = body.dry_run
      ? adapter.dryRun(body)
      : await adapter.activate(body, env);

    return jsonResponse({
      success: result.success,
      result,
      duration_ms: Date.now() - start,
    }, result.success ? 200 : 400);

  } catch (err) {
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    }, 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
