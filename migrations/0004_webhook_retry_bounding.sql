-- migrations/0004_webhook_retry_bounding.sql
-- Sec-15: bound webhook delivery retries
--
-- Pre-Sec-15 behavior: every poll on a completed activation re-fired
-- the webhook until the receiver returned 2xx. A perpetual 5xx (or a
-- forgotten URL) meant unbounded redelivery as long as the operator
-- kept polling — bad for the receiver and bad for our outbound budget.
--
-- Now bounded:
--   - webhook_attempts            : how many times we've fired so far
--   - webhook_next_attempt_at     : earliest UTC ISO ts the next attempt
--                                    is allowed; lets the lazy poll-driven
--                                    state machine implement backoff
--                                    without a scheduler.
--
-- Existing rows get attempts=0 and no next_attempt_at (interpreted as
-- "fire immediately if conditions allow"). Schema change is additive only.

ALTER TABLE activation_jobs ADD COLUMN webhook_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activation_jobs ADD COLUMN webhook_next_attempt_at TEXT;
