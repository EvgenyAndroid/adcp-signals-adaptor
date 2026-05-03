// src/utils/trace.ts
//
// Helper for building TraceData payloads on backend handlers. Reduces
// per-endpoint boilerplate to ~5 lines:
//
//   const t0 = Date.now();
//   ...do the work...
//   const trace = buildTrace({
//     operation: "Composer · saturation",
//     input: body.brief,
//     start_ms: t0,
//     steps: [...],   // operation-specific
//   });
//   return jsonResponse({ ...result, _trace: trace });
//
// Pair with the global fetch interceptor in demo.ts which auto-extracts
// `_trace` from any JSON response and pulses the trace inspector.

import type { TraceData, TraceStep } from "../types/trace";

export interface TraceBuilderArgs {
  /** Display name for the panel header. */
  operation: string;
  /** Original input string (brief, query, etc.). Optional. */
  input?: string;
  /** When the operation started — Date.now() before the work. */
  start_ms: number;
  /** Operation-specific steps. Defaults to a single "compute" step
   *  if none provided. */
  steps?: TraceStep[];
  /** Optional aggregated performance buckets. total_ms is auto-added. */
  performance?: Record<string, number>;
}

export function buildTrace(args: TraceBuilderArgs): TraceData {
  const duration = Date.now() - args.start_ms;
  const steps = args.steps && args.steps.length > 0 ? args.steps : [{
    id: "compute",
    label: "Compute",
    duration_ms: duration,
    details: [],
  }];
  const trace: TraceData = {
    operation: args.operation,
    duration_ms: duration,
    steps,
    performance: { ...(args.performance ?? {}), total_ms: duration },
    ts: new Date().toISOString(),
  };
  if (args.input !== undefined) trace.input = args.input;
  return trace;
}

/** Convenience: produce a single-step trace from key-value details.
 *  Use this for endpoints that don't have rich multi-step structure
 *  but still want the trigger to fire. */
export function singleStepTrace(
  operation: string,
  input: string | undefined,
  start_ms: number,
  label: string,
  details: Array<{ k: string; v: string }>,
  note?: string,
): TraceData {
  const step: TraceStep = {
    id: "compute",
    label,
    duration_ms: Date.now() - start_ms,
    details,
  };
  if (note) step.note = note;
  const args: TraceBuilderArgs = { operation, start_ms, steps: [step] };
  if (input !== undefined) args.input = input;
  return buildTrace(args);
}

/** Path → display operation name. "/audience/compose" → "Audience · compose". */
function pathToOperationName(path: string): string {
  const parts = path.replace(/^\//, "").split("/");
  if (parts.length === 0 || !parts[0]) return path;
  const head = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  if (parts.length === 1) return head;
  return head + " · " + parts.slice(1).join(" / ");
}

/**
 * Auto-inject a default _trace into any JSON response that doesn't
 * already have one. Called once at the dispatch level in index.ts so
 * every API endpoint gets baseline trace coverage without touching the
 * handler code.
 *
 * Handlers that build their OWN _trace (richer steps, matches, etc.)
 * are detected and passed through unchanged.
 */
export async function injectTraceIfMissing(
  response: Response,
  path: string,
  start_ms: number,
  method: string,
): Promise<Response> {
  const ct = response.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) return response;
  // Skip non-2xx — caller wants the original error body intact.
  if (response.status < 200 || response.status >= 300) return response;
  try {
    const body = await response.clone().json() as Record<string, unknown>;
    if (!body || typeof body !== "object") return response;
    if ((body as { _trace?: unknown })._trace) return response; // handler already built one
    const opName = pathToOperationName(path);
    const trace: TraceData = {
      operation: method.toUpperCase() + " " + opName,
      duration_ms: Date.now() - start_ms,
      steps: [{
        id: "handler",
        label: "Handler · " + path,
        duration_ms: Date.now() - start_ms,
        details: [
          { k: "method", v: method.toUpperCase() },
          { k: "path", v: path },
          { k: "status", v: String(response.status) },
          { k: "duration_ms", v: String(Date.now() - start_ms) },
        ],
        note: "Default auto-trace (handler did not emit a richer one). Drop a buildTrace() call into the handler for step-level detail.",
      }],
      performance: { total_ms: Date.now() - start_ms },
      ts: new Date().toISOString(),
    };
    (body as { _trace: TraceData })._trace = trace;
    // Rebuild headers to keep CORS / content-type intact.
    const headers = new Headers(response.headers);
    return new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}
