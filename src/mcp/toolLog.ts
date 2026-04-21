// src/mcp/toolLog.ts
// Sec-33: in-memory ring buffer of recent MCP tools/call invocations.
// Surfaced to the dashboard via GET /mcp/recent.
//
// Isolate-scoped by design. Cloudflare Workers recycle isolates on
// traffic patterns + deploys, so this buffer doesn't persist forever
// — acceptable for a demo observability surface ("what has this
// agent been doing in the last few minutes"), not a long-horizon
// audit log. For real persistence, forward to D1 or Analytics
// Engine. Kept in-memory here so the hot path pays ~0 latency.
//
// Privacy stance: we record TOOL NAMES and ARG KEYS only, not arg
// values. A buyer agent's signal_spec may contain sensitive briefs
// (client names, vertical strategy) that shouldn't leak via a
// debug endpoint. Callers who want full-payload introspection
// should attach request-level logging at their own auth layer.

export interface ToolLogEntry {
  ts: string;           // ISO timestamp
  tool: string;         // e.g. "get_signals"
  argKeys: string[];    // keys only — never values
  latencyMs: number;
  ok: boolean;          // false when the tool threw McpToolError
  errorKind?: string;   // e.g. "McpToolError: Unknown tool: foo"
  caller: "authed" | "unauth"; // presence of Bearer token, not identity
  // Size in bytes of the JSON-serialized response body (not the wire
  // bytes post-gzip). Useful for spotting runaway payloads.
  responseBytes?: number;
}

const MAX_ENTRIES = 50;
const buffer: ToolLogEntry[] = [];

export function record(entry: ToolLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function recent(limit = MAX_ENTRIES): ToolLogEntry[] {
  const slice = buffer.slice(-Math.min(limit, MAX_ENTRIES));
  // Return newest-first so the dashboard doesn't have to reverse.
  return slice.reverse();
}

export function clear(): void {
  buffer.length = 0;
}

// Safely extract top-level arg keys without walking into values.
// Nested objects' keys are not included — flatten would leak schema
// shape the caller might intentionally keep opaque.
export function argKeysOf(args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  return Object.keys(args as Record<string, unknown>);
}
