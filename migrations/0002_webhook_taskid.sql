-- migrations/0002_webhook_taskid.sql
-- Add webhook_url and task_id alias to activation_jobs
-- task_id is the AdCP protocol term for operation_id

ALTER TABLE activation_jobs ADD COLUMN webhook_url TEXT;
ALTER TABLE activation_jobs ADD COLUMN webhook_fired INTEGER NOT NULL DEFAULT 0;
