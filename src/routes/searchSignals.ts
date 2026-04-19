// src/routes/searchSignals.ts

import type { Env } from "../types/env";
import type { SearchSignalsRequest } from "../types/api";
import { searchSignalsService } from "../domain/signalService";
import { validateSearchRequest } from "../utils/validation";
import { jsonResponse, errorResponse, parseJsonBody } from "./shared";
import { getDb } from "../storage/db";
import type { Logger } from "../utils/logger";

export async function handleSearchSignals(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const body = await parseJsonBody<SearchSignalsRequest>(request);

  // Support GET-style query params too
  const url = new URL(request.url);
  const req: SearchSignalsRequest = {
    query: body?.query ?? url.searchParams.get("query") ?? undefined,
    categoryType: body?.categoryType ?? (url.searchParams.get("categoryType") as SearchSignalsRequest["categoryType"]) ?? undefined,
    generationMode: body?.generationMode ?? (url.searchParams.get("generationMode") as SearchSignalsRequest["generationMode"]) ?? undefined,
    taxonomyId: body?.taxonomyId ?? url.searchParams.get("taxonomyId") ?? undefined,
    destination: body?.destination ?? url.searchParams.get("destination") ?? undefined,
    limit: body?.limit ?? parseInt(url.searchParams.get("limit") ?? "20", 10),
    offset: body?.offset ?? parseInt(url.searchParams.get("offset") ?? "0", 10),
  };

  const validation = validateSearchRequest(req);
  if (!validation.ok) {
    return errorResponse(
      validation.error!.code,
      validation.error!.message,
      400
    );
  }

  try {
    const db = getDb(env);
    const result = await searchSignalsService(db, env.SIGNALS_CACHE, req);

    logger.info("signals_searched", {
      query: req.query,
      categoryType: req.categoryType,
      returned: result.count,
      total: result.totalCount,
    });

    return jsonResponse(result);
  } catch (err) {
    logger.error("search_signals_error", { error: String(err) });
    return errorResponse("INTERNAL_ERROR", "Signal search failed", 500);
  }
}
