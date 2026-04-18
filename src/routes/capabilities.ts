// src/routes/capabilities.ts

import type { Env } from "../types/env";
import { getCapabilities } from "../domain/capabilityService";
import { jsonResponse, errorResponse } from "./shared";
import type { Logger } from "../utils/logger";

export async function handleGetCapabilities(
  request: Request,
  env: Env,
  logger: Logger,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("protocols");
    const protocols = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const caps = await getCapabilities(env.SIGNALS_CACHE, protocols);
    logger.info("capabilities_requested", { protocols });
    return jsonResponse(caps);
  } catch (err) {
    logger.error("capabilities_error", { error: String(err) });
    return errorResponse("INTERNAL_ERROR", "Failed to retrieve capabilities", 500);
  }
}
