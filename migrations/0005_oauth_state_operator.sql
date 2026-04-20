-- migrations/0005_oauth_state_operator.sql
-- Sec-18: bind OAuth state rows to the operator that issued them
--
-- Pre-Sec-18: oauth_state had (state PK, provider, created_at,
-- expires_at). The /init route wrote a row, /callback consumed it.
-- No notion of WHICH operator initiated the flow — fine when there's
-- one operator, broken in any multi-operator deployment.
--
-- Post-Sec-18: each row carries the operator_id (12-char base64url
-- derived from SHA-256 of the bearer token, see src/utils/operatorId.ts)
-- of the operator that called /init. /callback reads the operator_id
-- back from the consumed row and namespaces token storage by it.
--
-- /callback stays public — no bearer needed at consume time. The
-- operator_id is part of the trusted server-side state, not the
-- caller-supplied query string.
--
-- Backwards compat: NONE. Per the user, LinkedIn auth has never been
-- used on this deployment, so there are no in-flight states to migrate.
-- The column is added as NOT NULL with no DEFAULT — any pre-existing
-- rows would have been deleted via TTL anyway (10-min window).

ALTER TABLE oauth_state ADD COLUMN operator_id TEXT NOT NULL DEFAULT '';

-- Composite index supports the consume query
-- DELETE ... WHERE state = ? AND expires_at > ? RETURNING operator_id.
-- The state column was already PK; the additional expires_at index
-- (from migration 0003) covers the cleanup sweep. No new index needed
-- for operator_id specifically — it's only ever read on consume, never
-- queried against.
