// src/routes/dspRoutes.ts
//
// Buy-side / DSP Canvas endpoints. Six routes covering the missing
// AdCP buy-side primitives (mocked locally via src/domain/dspMock.ts):
//
//   GET /dsp/campaigns                         — list demo campaigns
//   GET /dsp/campaigns/:id                     — single campaign card
//   GET /dsp/campaigns/:id/strategy            — bid strategy
//   GET /dsp/campaigns/:id/bid-stream          — recent bid stream samples
//   GET /dsp/campaigns/:id/inventory           — per-SSP performance
//   GET /dsp/campaigns/:id/brand-safety        — pre-bid filter stats
//   GET /dsp/campaigns/:id/pacing              — burn rate vs target
//   GET /dsp/campaigns/:id/attribution         — conversions + optimization signals
//
// Workshop framing: "every endpoint here mocks an AdCP buy-side
// primitive that doesn't exist yet — submit_bid_strategy,
// get_bid_opportunities, get_pacing_status, optimize_strategy. Same
// playbook as governanceMock + brandRightsMock — when upstream lands,
// swap to passthrough."
//
// All endpoints are GET-only and unauth — same posture as the
// governance/brand-rights preview routes.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import {
  listCampaigns,
  getCampaign,
  generateBidStrategy,
  generateBidStream,
  generateSspPerformance,
  generateBrandSafety,
  generatePacing,
  generateAttribution,
} from "../domain/dspMock";

function parseCampaignIdFromPath(path: string): string | null {
  // /dsp/campaigns/<id>[/...]
  const m = path.match(/^\/dsp\/campaigns\/(cmp_[a-z0-9_]+)(?:\/[a-z-]+)?$/i);
  return m ? m[1]! : null;
}

export async function handleDspCampaigns(
  request: Request,
  _env: Env,
  _logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // GET /dsp/campaigns
  if (path === "/dsp/campaigns") {
    const list = listCampaigns().map((c) => ({
      campaign_id: c.campaign_id,
      name: c.name,
      brand_name: c.brand_name,
      brand_domain: c.brand_domain,
      kpi: c.kpi,
      kpi_target: c.kpi_target,
      kpi_unit: c.kpi_unit,
      budget_total_usd: c.budget_total_usd,
      flight_start: c.flight_start,
      flight_end: c.flight_end,
    }));
    return jsonResponse({ count: list.length, campaigns: list });
  }

  const id = parseCampaignIdFromPath(path);
  if (!id) {
    return errorResponse("INVALID_INPUT", "expected /dsp/campaigns/<id>[/<sub>]", 400);
  }
  const c = getCampaign(id);
  if (!c) return errorResponse("CAMPAIGN_NOT_FOUND", "no campaign with id " + id, 404);

  // GET /dsp/campaigns/:id  (full card)
  if (path === `/dsp/campaigns/${id}`) {
    return jsonResponse(c);
  }

  if (path.endsWith("/strategy")) {
    return jsonResponse({ mode: "stub", campaign_id: id, strategy: generateBidStrategy(c) });
  }
  if (path.endsWith("/bid-stream")) {
    return jsonResponse({ mode: "stub", campaign_id: id, samples: generateBidStream(c, 60) });
  }
  if (path.endsWith("/inventory")) {
    return jsonResponse({ mode: "stub", campaign_id: id, ssps: generateSspPerformance(c) });
  }
  if (path.endsWith("/brand-safety")) {
    return jsonResponse({ mode: "stub", campaign_id: id, brand_safety: generateBrandSafety(c) });
  }
  if (path.endsWith("/pacing")) {
    return jsonResponse({ mode: "stub", campaign_id: id, pacing: generatePacing(c) });
  }
  if (path.endsWith("/attribution")) {
    const pacing = generatePacing(c);
    const attribution = generateAttribution(c, pacing);
    return jsonResponse({ mode: "stub", campaign_id: id, attribution });
  }

  return errorResponse("NOT_FOUND", "unknown DSP sub-resource at " + path, 404);
}
