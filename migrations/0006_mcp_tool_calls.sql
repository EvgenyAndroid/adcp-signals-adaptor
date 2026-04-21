-- Sec-35: MCP tool-call log table.
--
-- Supersedes the isolate-scoped in-memory ring buffer in src/mcp/toolLog.ts
-- (Sec-33). That buffer lost entries every time Cloudflare recycled the
-- isolate AND couldn't aggregate across isolates — a tool call on one
-- isolate was invisible to a dashboard poll landing on another. D1
-- writes give cross-isolate visibility and survive deploys.
--
-- Schema intentionally narrow:
--   - arguments_json truncated to 4KB at write time (see toolLogRepo)
--   - response BODIES are never stored; only response_size_bytes
--     ("what did the agent emit" without the actual payload, which may
--     contain sensitive briefs / activation keys)
--   - status is a constrained enum — either the call returned normally
--     (ok) or the handler threw (error). mcp-level -32001 unauth maps
--     to error.

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id                  TEXT PRIMARY KEY,
  tool_name           TEXT NOT NULL,
  arguments_json      TEXT NOT NULL,
  response_size_bytes INTEGER NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_message       TEXT,
  duration_ms         INTEGER NOT NULL,
  caller              TEXT NOT NULL CHECK (caller IN ('authed', 'unauth')),
  created_at          INTEGER NOT NULL
);

-- Primary read pattern: newest first, optionally filtered by tool_name.
CREATE INDEX IF NOT EXISTS idx_mcp_calls_created
  ON mcp_tool_calls (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_calls_tool_created
  ON mcp_tool_calls (tool_name, created_at DESC);
