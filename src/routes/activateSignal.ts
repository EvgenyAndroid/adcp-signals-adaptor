// src/routes/activateSignal.ts

import type { Env } from "../types/env";
import type { ActivateSignalRequest } from "../types/api";
import { activateSignalService, NotFoundError, ValidationError } from "../domain/activationService";
import { validateActivateRequest } from "../utils/validation";
import { jsonResponse, errorResponse, parseJsonBody } from "./shared";
import { getDb } from "../storage/db";
import type { Logger } from "../utils/logger";

export async function handleActivateSignal(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const body = await parseJsonBody<ActivateSignalRequest>(request);
  if (!body) {
    return errorResponse("INVALID_BODY", "Request body must be valid JSON", 400);
  }

  const validation = validateActivateRequest(body);
  if (!validation.ok) {
    return errorResponse(validation.error!.code, validation.error!.message, 400);
  }

  try {
    const db = getDb(env);
    const result = await activateSignalService(db, body, logger);
    return jsonResponse(result, 202);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    if (err instanceof ValidationError) {
      return errorResponse("VALIDATION_ERROR", err.message, 400);
    }
    logger.error("activate_signal_error", { error: String(err) });
    return errorResponse("INTERNAL_ERROR", "Activation request failed", 500);
  }
}
