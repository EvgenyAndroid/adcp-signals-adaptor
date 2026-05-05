// src/routes/activateSignal.ts

import type { Env } from "../types/env";
import type { ActivateSignalRequest } from "../types/api";
import { activateSignalService, NotFoundError, ValidationError } from "../domain/activationService";
import { validateActivateRequest } from "../utils/validation";
import { jsonResponse, errorResponse, parseJsonBody } from "./shared";
import { getDb } from "../storage/db";
import type { Logger } from "../utils/logger";
import { recordSignalTrace } from "../domain/signalTrace";

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
    // ApiError uses `error` (not `message`) for the human-readable string.
    return errorResponse(validation.error!.code, validation.error!.error, 400);
  }

  const _t0 = Date.now();
  try {
    const db = getDb(env);
    const result = await activateSignalService(db, env.SIGNALS_CACHE, body, logger);
    recordSignalTrace({
      tool_name: "activate_signal",
      direction: "inbound",
      source: "rest_demo",
      request_payload: body,
      response_payload: result,
      response_status: "ok",
      duration_ms: Date.now() - _t0,
    });
    return jsonResponse(result, 202);
  } catch (err) {
    const errMsg = (err as Error).message ?? String(err);
    recordSignalTrace({
      tool_name: "activate_signal",
      direction: "inbound",
      source: "rest_demo",
      request_payload: body,
      response_payload: { error: errMsg },
      response_status: "error",
      response_error_message: errMsg,
      duration_ms: Date.now() - _t0,
    });
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
