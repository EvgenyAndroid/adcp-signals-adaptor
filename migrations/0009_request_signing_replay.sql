-- 0009: replay cache for RFC 9421 inbound request signatures (signed_requests).
--
-- One row per verified (keyid, nonce), inserted at checklist step 13 by
-- src/storage/replayRepo.ts. expires_at is unix SECONDS (the SDK verifier's
-- clock), not milliseconds like mcp_tool_calls.created_at. Rows with
-- expires_at <= now are dead: ignored by every read, overwritten on nonce
-- reuse, and deleted by the weekly purge (src/storage/scheduledPurge.ts).

CREATE TABLE IF NOT EXISTS request_signing_replay (
  keyid      TEXT    NOT NULL,
  nonce      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (keyid, nonce)
);

-- The per-keyid cap counts live rows on every signed request. This index
-- makes that a range scan over the live rows alone, not over every expired
-- row a keyid has accumulated since the last purge.
CREATE INDEX IF NOT EXISTS idx_request_signing_replay_keyid_expires
  ON request_signing_replay (keyid, expires_at);
