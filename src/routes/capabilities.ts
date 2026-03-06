// src/routes/capabilities.ts

import type { Env } from "../types/env";
import { getCapabilities } from "../domain/capabilityService";
import { jsonResponse, errorResponse } from "./shared";
import type { Logger } from "../utils/logger";

export async function handleGetCapabilities(
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const caps = await getCapabilities(env.SIGNALS_CACHE);
    logger.info("capabilities_requested");
    return jsonResponse(caps);
  } catch (err) {
    logger.error("capabilities_error", { error: String(err) });
    return errorResponse("INTERNAL_ERROR", "Failed to retrieve capabilities", 500);
  }
}
