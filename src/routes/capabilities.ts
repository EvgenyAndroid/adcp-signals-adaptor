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
    // Accept both ?protocols=a,b (canonical) and ?protocol=a (singular alias).
    // Some clients/evaluators send the singular form; treating it as a synonym
    // costs nothing and avoids returning the unfiltered response when filtering
    // was clearly intended.
    const raw = url.searchParams.get("protocols") ?? url.searchParams.get("protocol");
    const protocols = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const caps = await getCapabilities(env.SIGNALS_CACHE, protocols, {
      ...(env.EMBEDDING_ENGINE !== undefined ? { EMBEDDING_ENGINE: env.EMBEDDING_ENGINE } : {}),
      ...(env.OPENAI_API_KEY    !== undefined ? { OPENAI_API_KEY:    env.OPENAI_API_KEY    } : {}),
    });

    // Echo back any context the caller passed. REST /capabilities is a GET,
    // so we look for `correlation_id` in the query string (the most common
    // field) and assemble a context object from it. Schema-wise this is an
    // opaque pass-through — the field has no protocol semantics.
    const correlationId = url.searchParams.get("correlation_id");
    const response = correlationId
      ? { ...caps, context: { correlation_id: correlationId } }
      : caps;

    logger.info("capabilities_requested", { protocols });
    return jsonResponse(response);
  } catch (err) {
    logger.error("capabilities_error", { error: String(err) });
    return errorResponse("INTERNAL_ERROR", "Failed to retrieve capabilities", 500);
  }
}
