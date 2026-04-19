// src/utils/validation.ts

import type { ApiError } from "../types/api";
import type {
  SearchSignalsRequest,
  ActivateSignalRequest,
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

// VALID_RULE_DIMENSIONS + VALID_RULE_OPERATORS were only used by
// validateGenerateRequest (removed). Removed with the validator.

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

// validateGenerateRequest was removed: it was dead code referencing a
// non-existent GenerateSignalRequest type. The generate endpoint was
// folded into /signals/search's brief-proposal flow.

function fail(code: string, message: string): ValidationResult {
  return { ok: false, error: { error: message, code } };
}
