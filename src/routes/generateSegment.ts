// src/routes/generateSegment.ts
// POST /signals/generate — create a composite signal from rules.
//
// Auth-gated (DEMO_API_KEY) because it writes to D1. Builder UI calls this
// after the user composes rules and clicks "Generate segment"; the live
// /signals/estimate preview is the dry-run counterpart.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import type { ResolvedRule } from "../types/rule";
import type { CanonicalSignal } from "../types/signal";
import { jsonResponse, errorResponse, readJsonBody, requireAuth } from "./shared";
import { validateRules, generateSegment } from "../domain/ruleEngine";
import { upsertSignal } from "../storage/signalRepo";
import { getDb } from "../storage/db";

interface GenerateRequest {
  rules?: unknown;
  name?: string;
}

export async function handleGenerateSegment(
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
      "Generate requires the DEMO_API_KEY bearer token.",
      401,
    );
  }

  const parsed = await readJsonBody<GenerateRequest>(request);
  if (parsed.kind === "invalid") {
    return errorResponse("INVALID_REQUEST", "Body is not valid JSON: " + parsed.reason, 400);
  }
  const body = parsed.kind === "parsed" ? parsed.data : undefined;
  const rawRules = body?.rules;
  if (!Array.isArray(rawRules) || rawRules.length === 0) {
    return errorResponse(
      "INVALID_REQUEST",
      "`rules` must be a non-empty array of { dimension, operator, value }.",
      400,
    );
  }

  // Shape-validate each rule (soft — real enum validation happens in ruleEngine.validateRules)
  for (const [i, r] of rawRules.entries()) {
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

  const rules = rawRules as ResolvedRule[];
  const validation = validateRules(rules);
  if (!validation.valid) {
    return jsonResponse(
      {
        error: "Rule validation failed",
        code: "INVALID_REQUEST",
        details: {
          validation_errors: validation.errors,
          ...(validation.warnings.length ? { validation_warnings: validation.warnings } : {}),
        },
      },
      400,
    );
  }

  const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : undefined;
  const generated = generateSegment(rules, name);

  // Persist. ruleEngine returns a logical descriptor; we hydrate it into a
  // full CanonicalSignal before write so the catalog-read path (which
  // expects the full shape) works unchanged.
  const now = new Date().toISOString();
  const signal: CanonicalSignal = {
    signalId: generated.signalId,
    taxonomySystem: "iab_audience_1_1",
    name: generated.name,
    description: generated.description,
    categoryType: generated.categoryType as CanonicalSignal["categoryType"],
    sourceSystems: ["ruleEngine:generate"],
    destinations: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
    activationSupported: true,
    estimatedAudienceSize: generated.estimatedAudienceSize,
    accessPolicy: "public_demo",
    generationMode: "derived",
    status: "available",
    pricing: { model: "mock_cpm", value: 6.5, currency: "USD" },
    rules,
    createdAt: now,
    updatedAt: now,
    ...(generated.taxonomyMatches.length > 0 ? { externalTaxonomyId: generated.taxonomyMatches[0] } : {}),
  };

  await upsertSignal(getDb(env), signal);
  logger.info("segment_generated", {
    signal_id: generated.signalId,
    rule_count: rules.length,
    estimated: generated.estimatedAudienceSize,
  });

  return jsonResponse({
    signal_agent_segment_id: generated.signalId,
    name: generated.name,
    description: generated.description,
    category_type: generated.categoryType,
    estimated_audience_size: generated.estimatedAudienceSize,
    confidence: generated.estimateConfidence,
    rule_count: rules.length,
    taxonomy_matches: generated.taxonomyMatches,
    generation_notes: generated.generationNotes,
  });
}
