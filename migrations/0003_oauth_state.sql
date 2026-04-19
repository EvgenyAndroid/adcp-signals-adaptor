-- migrations/0003_oauth_state.sql
-- OAuth state machine for third-party auth callbacks (LinkedIn today; any
-- provider whose redirect we accept publicly).
--
-- Why D1 and not KV: KV has no atomic consume-and-delete primitive, so the
-- prior `kv.get(state); kv.delete(state)` implementation had a time-of-check /
-- time-of-use window where two near-simultaneous callbacks could both see the
-- state before either deletion landed. The callback is the only auth defense
-- on a public route, so a TOCTOU here is the single remaining exploitable
-- primitive. D1 gives us `DELETE ... RETURNING` in one round-trip which is
-- strictly single-use under concurrent load.
--
-- Format:
--   state       — server-issued random UUID, unique per /init call
--   provider    — "linkedin" today; future providers share the table
--   expires_at  — ISO-8601 UTC; enforces the 10-min flow window in SQL
--                 rather than relying on KV TTL

CREATE TABLE IF NOT EXISTS oauth_state (
  state       TEXT NOT NULL PRIMARY KEY,
  provider    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

-- Supports opportunistic cleanup of stale entries. Not load-bearing —
-- the consume path checks expires_at in the WHERE clause anyway.
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_state(expires_at);
