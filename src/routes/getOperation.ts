// src/routes/getOperation.ts

import type { Env } from "../types/env";
import { getOperationService, NotFoundError } from "../domain/activationService";
import { jsonResponse, errorResponse } from "./shared";
import { getDb } from "../storage/db";
import type { Logger } from "../utils/logger";

export async function handleGetOperation(
  operationId: string,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (!operationId || !operationId.startsWith("op_")) {
    return errorResponse("INVALID_OPERATION_ID", "Invalid operation ID format", 400);
  }

  try {
    const db = getDb(env);
    const result = await getOperationService(db, operationId, logger, env.WEBHOOK_SIGNING_SECRET);
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    logger.error("get_operation_error", { operationId, error: String(err) });
    return errorResponse("INTERNAL_ERROR", "Failed to retrieve operation", 500);
  }
}
