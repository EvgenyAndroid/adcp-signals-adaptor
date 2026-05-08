-- 0007_activation_idempotency_key.sql
--
-- Add idempotency_key column to activation_jobs to enforce the
-- AdCP 3.0.x activate_signal_request idempotency contract:
--
--   "Client-generated unique key. If a request with the same key has
--    already been accepted, the server returns the original response
--    without re-processing... Prevents duplicate billing on retries."
--   — vendor/adcp/adcp-3.0.x/schemas/signals/activate-signal-request.json
--
-- Without this, retried activations create duplicate activation_jobs
-- rows (same signal + destination, different operation_ids), which
-- breaks the receipt audit chain and could double-bill in any future
-- per-impression pricing model.
--
-- The column is nullable so legacy rows that pre-date enforcement are
-- preserved; new inserts populate it. Lookup is by
-- (idempotency_key, signal_id, destination) — same key against
-- different (signal, destination) tuples is a different activation,
-- not a duplicate.

ALTER TABLE activation_jobs ADD COLUMN idempotency_key TEXT;

-- Composite index for the dedupe lookup. Indexed only when the key
-- is non-null (sqlite partial index syntax). The (signal_id,
-- destination) triple is what defines uniqueness for an activation.
CREATE INDEX IF NOT EXISTS idx_activation_jobs_idempotency
  ON activation_jobs(idempotency_key, signal_id, destination)
  WHERE idempotency_key IS NOT NULL;
