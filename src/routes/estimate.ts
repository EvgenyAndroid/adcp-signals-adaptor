// src/routes/estimate.ts
// POST /signals/estimate — dry-run sizing.
//
// Read-only: no D1 writes, no persisted segment, no signal_agent_segment_id.
// Authentication NOT required — estimate is a price-transparency /
// audience-transparency capability and matches AdCP's stance on
// /capabilities + /signals/search both being publicly readable.
//
// Request body mirrors /signals/generate but accepts `rules` directly
// (no brand-wrapper — this is a UI-facing helper, not an MCP tool).

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import type { ResolvedRule } from "../types/rule";
import { jsonResponse, errorResponse, readJsonBody } from "./shared";
import { estimateAudience, isEstimateError } from "../domain/estimateService";

interface EstimateRequest {
  rules?: unknown;
}

export async function handleEstimate(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const parsed = await readJsonBody<EstimateRequest>(request);
  if (parsed.kind === "invalid") {
    return errorResponse("INVALID_REQUEST", "Body is not valid JSON: " + parsed.reason, 400);
  }
  const rules = parsed.kind === "parsed" ? parsed.data?.rules : undefined;

  // Accept an empty/missing body as "estimate the baseline" — useful for
  // the builder UI's initial render before the user has added a rule.
  const normalized = Array.isArray(rules) ? (rules as ResolvedRule[]) : [];

  // Basic shape guard — each rule must have dimension/operator/value.
  for (const [i, r] of normalized.entries()) {
    if (typeof r !== "object" || r === null) {
      return errorResponse("INVALID_REQUEST", `Rule ${i} is not an object`, 400);
    }
    const rule = r as Partial<ResolvedRule>;
    if (!rule.dimension || !rule.operator || rule.value === undefined) {
      return errorResponse(
        "INVALID_REQUEST",
        `Rule ${i} missing required field (dimension/operator/value)`,
        400,
      );
    }
  }

  const result = await estimateAudience(normalized, env.SIGNALS_CACHE);
  if (isEstimateError(result)) {
    logger.info("estimate_validation_failed", { rules: normalized.length });
    return jsonResponse(result, 400);
  }

  logger.info("estimate_ok", {
    rule_count: result.rule_count,
    dimensions: result.dimensions_used,
    estimated: result.estimated_audience_size,
  });
  return jsonResponse(result);
}
