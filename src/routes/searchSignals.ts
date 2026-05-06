// src/routes/searchSignals.ts

import type { Env } from "../types/env";
import type { SearchSignalsRequest } from "../types/api";
import { searchSignalsService } from "../domain/signalService";
import { validateSearchRequest } from "../utils/validation";
import { jsonResponse, errorResponse, readJsonBody } from "./shared";
import { compactObj } from "../utils/objects";
import { getDb } from "../storage/db";
import type { Logger } from "../utils/logger";
import { safeRecordSignalTrace, persistSignalTrace } from "../domain/signalTrace";

export async function handleSearchSignals(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Distinguish "no body" (GET, or POST with empty body) from "bad body"
  // (POST with non-JSON content). The previous parseJsonBody collapsed
  // both into null, so a malformed POST silently returned the full
  // unfiltered catalog — surprising to callers with a bug in their JSON
  // serializer.
  const bodyResult = await readJsonBody<SearchSignalsRequest>(request);
  if (bodyResult.kind === "invalid") {
    return errorResponse("INVALID_BODY", bodyResult.reason, 400);
  }
  const body = bodyResult.kind === "parsed" ? bodyResult.data : null;

  // Support GET-style query params too
  const url = new URL(request.url);
  // body may carry the canonical AdCP MCP arg `signal_spec` as an alias
  // for brief; pull it via an indexed access since the typed field is `brief`.
  const bodyAny = body as Record<string, unknown> | null;
  const req: SearchSignalsRequest = {
    ...compactObj({
      brief: body?.brief
        ?? (typeof bodyAny?.["signal_spec"] === "string" ? (bodyAny["signal_spec"] as string) : undefined)
        ?? url.searchParams.get("brief")
        ?? undefined,
      query: body?.query ?? url.searchParams.get("query") ?? undefined,
      categoryType: body?.categoryType ?? (url.searchParams.get("categoryType") as SearchSignalsRequest["categoryType"]) ?? undefined,
      generationMode: body?.generationMode ?? (url.searchParams.get("generationMode") as SearchSignalsRequest["generationMode"]) ?? undefined,
      taxonomyId: body?.taxonomyId ?? url.searchParams.get("taxonomyId") ?? undefined,
      destination: body?.destination ?? url.searchParams.get("destination") ?? undefined,
    }),
    limit: body?.limit ?? parseInt(url.searchParams.get("limit") ?? "20", 10),
    offset: body?.offset ?? parseInt(url.searchParams.get("offset") ?? "0", 10),
  };

  const validation = validateSearchRequest(req);
  if (!validation.ok) {
    // Note: ApiError uses `error` (not `message`) for the human-readable
    // string — previous callers accessed `.message` and shipped responses
    // missing the text. Fixed below.
    return errorResponse(
      validation.error!.code,
      validation.error!.error,
      400
    );
  }

  const _t0 = Date.now();
  try {
    const db = getDb(env);
    const result = await searchSignalsService(db, env.SIGNALS_CACHE, req);

    logger.info("signals_searched", {
      query: req.query,
      categoryType: req.categoryType,
      returned: result.count,
      total: result.totalCount,
    });

    // Record the REST trace alongside the MCP one. Keeps signal traces
    // unified across both transport bindings. safeRecordSignalTrace
    // contains its own try/catch + isolate kill switch. Persist the
    // resulting trace to KV so it survives isolate cycles — the
    // in-memory ring buffer dies with the isolate, which broke the
    // workshop demo when users reopened the trace modal.
    const _trace = safeRecordSignalTrace({
      tool_name: "get_signals",
      direction: "inbound",
      source: "rest_demo",
      endpoint_url: request.url,
      request_payload: req,
      response_payload: result,
      response_status: "ok",
      duration_ms: Date.now() - _t0,
    });
    await persistSignalTrace(env, _trace);

    return jsonResponse(result);
  } catch (err) {
    logger.error("search_signals_error", { error: String(err) });
    const _trace = safeRecordSignalTrace({
      tool_name: "get_signals",
      direction: "inbound",
      source: "rest_demo",
      endpoint_url: request.url,
      request_payload: req,
      response_payload: { error: String(err) },
      response_status: "error",
      response_error_message: String(err),
      duration_ms: Date.now() - _t0,
    });
    await persistSignalTrace(env, _trace);
    return errorResponse("INTERNAL_ERROR", "Signal search failed", 500);
  }
}
