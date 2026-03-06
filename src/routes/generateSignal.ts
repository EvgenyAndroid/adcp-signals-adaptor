// src/routes/generateSignal.ts

import type { Env } from "../types/env";
import type { GenerateSignalRequest } from "../types/api";
import { generateSignalService } from "../domain/signalService";
import { validateGenerateRequest } from "../utils/validation";
import { jsonResponse, errorResponse, parseJsonBody } from "./shared";
import { getDb } from "../storage/db";
import type { Logger } from "../utils/logger";

export async function handleGenerateSignal(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const body = await parseJsonBody<GenerateSignalRequest>(request);
  if (!body) {
    return errorResponse("INVALID_BODY", "Request body must be valid JSON", 400);
  }

  const validation = validateGenerateRequest(body);
  if (!validation.ok) {
    return errorResponse(validation.error!.code, validation.error!.message, 400);
  }

  try {
    const db = getDb(env);
    const result = await generateSignalService(db, body);

    logger.info("signal_generated", {
      signalId: result.signal.signalId,
      name: result.signal.name,
      ruleCount: result.ruleCount,
      estimatedSize: result.signal.estimatedAudienceSize,
    });

    return jsonResponse(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Rule validation errors should be 400
    if (message.toLowerCase().includes("validation")) {
      return errorResponse("RULE_VALIDATION_ERROR", message, 400);
    }
    logger.error("generate_signal_error", { error: message });
    return errorResponse("INTERNAL_ERROR", "Signal generation failed", 500);
  }
}
