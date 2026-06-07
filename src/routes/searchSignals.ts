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
    // adcp#5017: fields selector — comma-separated in query string, array in body
    ...(body?.fields
      ? { fields: body.fields }
      : url.searchParams.has("fields")
        ? { fields: url.searchParams.get("fields")!.split(",").map((f) => f.trim()) }
        : {}),
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
  // Build the CANONICAL AdCP get_signals request envelope from our
  // legacy REST shape so the trace recorder validates against
  // /schemas/3.0.x/signals/get-signals-request.json without surfacing
  // false-positive errors. The REST surface (brief / limit / offset)
  // is a thin wrapper kept for legacy callers; canonicalizing the
  // traced payload means the workshop trace inspector shows
  // ✓ schema valid for OUR own search calls instead of three
  // anyOf-required errors that have nothing to do with the request
  // we actually processed. Service still consumes the internal
  // SearchSignalsRequest shape.
  const canonicalRequest = toCanonicalGetSignalsRequest(req);

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
      request_payload: canonicalRequest,
      response_payload: toCanonicalGetSignalsResponse(result, req.offset ?? 0),
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
      request_payload: canonicalRequest,
      // Error path can't produce a canonical response payload — record
      // a validator-skippable shape so the response pane still shows
      // useful context (the error string + status) without a misleading
      // schema-error pile-up on what is essentially a 500 envelope.
      response_payload: { errors: [{ code: "INTERNAL_ERROR", message: String(err) }] },
      response_status: "error",
      response_error_message: String(err),
      duration_ms: Date.now() - _t0,
    });
    await persistSignalTrace(env, _trace);
    return errorResponse("INTERNAL_ERROR", "Signal search failed", 500);
  }
}

// ── REST-to-canonical AdCP shape adapters ──────────────────────────────────
//
// The REST endpoint accepts our legacy { brief, limit, offset } envelope
// for backwards compatibility with the demo client and external scripts.
// AdCP 3.0.x validates a different shape (signal_spec/signal_ids
// discriminated union; pagination as a nested envelope; destinations +
// countries top-level arrays). The recorder needs the canonical shape so
// the trace inspector renders ✓ schema valid on our own calls.
//
// Wire format on the actual /signals/search endpoint is unchanged —
// these adapters only run inside the trace pipeline.

export function toCanonicalGetSignalsRequest(req: SearchSignalsRequest): Record<string, unknown> {
  const limit = typeof req.limit === "number" ? req.limit : 20;
  const offset = typeof req.offset === "number" ? req.offset : 0;
  const pagination: Record<string, unknown> = { max_results: Math.min(Math.max(limit, 1), 100) };
  if (offset > 0) pagination["cursor"] = `offset:${offset}`;
  return {
    signal_spec: req.brief ?? req.query ?? "*",
    destinations: [{ type: "platform", platform: req.destination ?? "mock_dsp" }],
    countries: ["US"],
    pagination,
  };
}

export function toCanonicalGetSignalsResponse(
  result: { signals: unknown[]; totalCount: number; hasMore: boolean; offset?: number; proposals?: unknown[] },
  reqOffset: number,
): Record<string, unknown> {
  const hasMore = !!result.hasMore;
  const total = typeof result.totalCount === "number" ? result.totalCount : (result.signals?.length ?? 0);
  const baseOffset = typeof result.offset === "number" ? result.offset : reqOffset;
  const pagination: Record<string, unknown> = { has_more: hasMore, total_count: total };
  if (hasMore) pagination["cursor"] = `offset:${baseOffset + (result.signals?.length ?? 0)}`;
  return {
    signals: result.signals ?? [],
    pagination,
    ...(Array.isArray(result.proposals) && result.proposals.length > 0 ? { proposals: result.proposals } : {}),
  };
}
