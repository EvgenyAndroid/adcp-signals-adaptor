// src/utils/validation.ts

import type { ApiError } from "../types/api";
import type {
  SearchSignalsRequest,
  ActivateSignalRequest,
  GenerateSignalRequest,
} from "../types/api";

// Allowed values for enum-like fields
const VALID_CATEGORY_TYPES = new Set([
  "demographic",
  "interest",
  "purchase_intent",
  "geo",
  "composite",
]);

const VALID_GENERATION_MODES = new Set(["seeded", "derived", "dynamic"]);

const VALID_DESTINATIONS = new Set([
  "mock_dsp",
  "mock_cleanroom",
  "mock_cdp",
  "mock_measurement",
]);

const VALID_RULE_DIMENSIONS = new Set([
  "age_band",
  "income_band",
  "education",
  "household_type",
  "geography",
  "metro_tier",
  "content_genre",
  "content_affinity_score",
  "streaming_affinity",
]);

const VALID_RULE_OPERATORS = new Set(["eq", "in", "gte", "lte", "contains", "range"]);

export interface ValidationResult {
  ok: boolean;
  error?: ApiError;
}

export function validateSearchRequest(body: unknown): ValidationResult {
  if (body !== null && typeof body !== "object") {
    return fail("INVALID_BODY", "Request body must be a JSON object");
  }
  const req = body as Partial<SearchSignalsRequest>;

  if (req.categoryType !== undefined && !VALID_CATEGORY_TYPES.has(req.categoryType)) {
    return fail(
      "INVALID_CATEGORY_TYPE",
      `categoryType must be one of: ${[...VALID_CATEGORY_TYPES].join(", ")}`
    );
  }

  if (req.generationMode !== undefined && !VALID_GENERATION_MODES.has(req.generationMode)) {
    return fail(
      "INVALID_GENERATION_MODE",
      `generationMode must be one of: ${[...VALID_GENERATION_MODES].join(", ")}`
    );
  }

  if (req.limit !== undefined) {
    const lim = Number(req.limit);
    if (!Number.isInteger(lim) || lim < 1 || lim > 100) {
      return fail("INVALID_LIMIT", "limit must be an integer between 1 and 100");
    }
  }

  if (req.offset !== undefined) {
    const off = Number(req.offset);
    if (!Number.isInteger(off) || off < 0) {
      return fail("INVALID_OFFSET", "offset must be a non-negative integer");
    }
  }

  return { ok: true };
}

export function validateActivateRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return fail("INVALID_BODY", "Request body must be a JSON object");
  }
  const req = body as Partial<ActivateSignalRequest>;

  if (!req.signalId || typeof req.signalId !== "string") {
    return fail("MISSING_SIGNAL_ID", "signalId is required");
  }

  if (!req.destination || typeof req.destination !== "string") {
    return fail("MISSING_DESTINATION", "destination is required");
  }

  if (!VALID_DESTINATIONS.has(req.destination)) {
    return fail(
      "INVALID_DESTINATION",
      `destination must be one of: ${[...VALID_DESTINATIONS].join(", ")}`
    );
  }

  return { ok: true };
}

export function validateGenerateRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return fail("INVALID_BODY", "Request body must be a JSON object");
  }
  const req = body as Partial<GenerateSignalRequest>;

  if (!Array.isArray(req.rules) || req.rules.length === 0) {
    return fail("MISSING_RULES", "rules array is required and must not be empty");
  }

  if (req.rules.length > 6) {
    return fail("TOO_MANY_RULES", "Maximum 6 rules per custom segment");
  }

  for (const [i, rule] of req.rules.entries()) {
    if (!rule.dimension || !VALID_RULE_DIMENSIONS.has(rule.dimension)) {
      return fail(
        "INVALID_RULE_DIMENSION",
        `Rule ${i}: dimension must be one of: ${[...VALID_RULE_DIMENSIONS].join(", ")}`
      );
    }
    if (!rule.operator || !VALID_RULE_OPERATORS.has(rule.operator)) {
      return fail(
        "INVALID_RULE_OPERATOR",
        `Rule ${i}: operator must be one of: ${[...VALID_RULE_OPERATORS].join(", ")}`
      );
    }
    if (rule.value === undefined || rule.value === null) {
      return fail("MISSING_RULE_VALUE", `Rule ${i}: value is required`);
    }
  }

  return { ok: true };
}

function fail(code: string, message: string): ValidationResult {
  return { ok: false, error: { error: message, code } };
}
