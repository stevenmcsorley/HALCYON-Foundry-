-- Phase 6B: Alert Delivery Trace enhancements
-- Add missing columns for delivery trace visibility

BEGIN;

-- Add http_status for HTTP response codes
ALTER TABLE alert_actions_log
  ADD COLUMN IF NOT EXISTS http_status INT NULL;

-- Add attempt number (monotonically increasing per alert_id+dest)
ALTER TABLE alert_actions_log
  ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1;

-- Add sent_at timestamp (when the attempt actually happened)
ALTER TABLE alert_actions_log
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL;

-- Rename next_retry_at to scheduled_at for consistency (but keep both for backward compatibility)
ALTER TABLE alert_actions_log
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL;

-- Update existing rows: set scheduled_at = next_retry_at where next_retry_at is not null
UPDATE alert_actions_log
SET scheduled_at = next_retry_at
WHERE scheduled_at IS NULL AND next_retry_at IS NOT NULL;

-- Update existing rows: set sent_at = created_at for existing entries (best guess)
UPDATE alert_actions_log
SET sent_at = created_at
WHERE sent_at IS NULL;

-- Update status to support 'retry_scheduled' (but keep 'retry' for backward compatibility)
-- We'll treat 'retry' and 'retry_scheduled' as equivalent in code

-- Add index for faster lookups by alert_id and dest
CREATE INDEX IF NOT EXISTS idx_alert_actions_log_alert_dest ON alert_actions_log(alert_id, dest);

-- Add index for scheduled retries
CREATE INDEX IF NOT EXISTS idx_alert_actions_log_scheduled ON alert_actions_log(scheduled_at) WHERE scheduled_at IS NOT NULL;

COMMENT ON COLUMN alert_actions_log.http_status IS 'HTTP status code from delivery attempt (if applicable)';
COMMENT ON COLUMN alert_actions_log.attempt IS 'Attempt number (monotonically increasing per alert_id+dest)';
COMMENT ON COLUMN alert_actions_log.sent_at IS 'When the delivery attempt actually happened';
COMMENT ON COLUMN alert_actions_log.scheduled_at IS 'When the next retry is scheduled (alias for next_retry_at)';

COMMIT;

