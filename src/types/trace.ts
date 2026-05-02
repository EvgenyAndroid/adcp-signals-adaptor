// src/types/trace.ts
//
// Universal trace schema. Every traceable backend operation emits this
// shape on its response (in a `_trace` field) so the universal trace
// panel can render it without per-surface custom logic.
//
// Renderer responsibilities:
//   - Header: operation name + input + total duration
//   - Steps: accordion of TraceStep entries
//     - For each step: details rows, matches table (with score bars),
//       histogram (with threshold marker), notes
//   - Performance: timing breakdown chart
//   - JSON tab: pretty-print full payload
//
// Backend responsibilities:
//   - Wrap the work in timing markers (Date.now() at start/each step)
//   - Build steps[] with whatever level of detail makes the operation
//     legible to a workshop attendee. "Why this came back" wins over
//     raw mechanics.
//
// Adding a new traced operation:
//   1. Wrap the operation handler with timing hooks
//   2. Build a TraceData and attach to response under `_trace`
//   3. Done — panel renders it automatically.

export interface TraceDetailRow {
  /** Key — left column, monospace, dim color. */
  k: string;
  /** Value — right column, monospace, brighter color. May be a number
   *  formatted as a string. */
  v: string;
}

export interface TraceMatch {
  /** Stable id — usually a signal id, vendor id, etc. */
  id: string;
  /** Human label rendered alongside the id. */
  label: string;
  /** Score in [-1, 1] (cosine) or [0, 100] (percentage). The renderer
   *  draws a horizontal bar; the absolute scale is operation-specific. */
  score: number;
  /** Optional one-line context (e.g. "category: interest", "vendor: Dstillery"). */
  meta?: string;
}

export interface TraceHistogram {
  /** Counts per bin, left-to-right. The renderer normalizes by `max`. */
  bins: number[];
  /** Max bin count (for normalization). */
  max: number;
  /** Optional threshold line drawn vertically. Position is relative to
   *  the bin range (0..bins.length). */
  threshold?: number;
  /** X-axis label range, e.g. "0.0 → 1.0" for cosine. */
  axis_range?: string;
}

export interface TraceStep {
  /** Stable id — used for accordion expand state. */
  id: string;
  /** Human label, e.g. "Embed query", "kNN search". */
  label: string;
  /** Step wall-clock duration. */
  duration_ms?: number;
  /** Key-value rows. Renders as a 2-column table. */
  details?: TraceDetailRow[];
  /** Ranked matches table with score bars. */
  matches?: TraceMatch[];
  /** Score distribution histogram. */
  histogram?: TraceHistogram;
  /** One-line context shown under the label. */
  note?: string;
}

export interface TraceData {
  /** Operation name, e.g. "Discover query", "Federation fan-out". */
  operation: string;
  /** Original input — query string, brief, etc. */
  input?: string;
  /** Total wall-clock duration. */
  duration_ms: number;
  /** Ordered steps. */
  steps: TraceStep[];
  /** Optional aggregated performance buckets, summing to ~duration_ms. */
  performance?: Record<string, number>;
  /** Optional raw response (for the JSON tab). Renderer truncates after
   *  100KB to keep the panel responsive. */
  raw?: unknown;
  /** ISO timestamp the trace was captured. */
  ts: string;
}
