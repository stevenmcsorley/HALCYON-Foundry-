-- PR-3: Routing & Retries for Alert Actions
-- Migration: 009_alert_actions_retry.sql

CREATE TABLE IF NOT EXISTS alert_actions_log (
    id SERIAL PRIMARY KEY,
    alert_id INT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    dest TEXT NOT NULL CHECK (dest IN ('slack','webhook')),
    status TEXT NOT NULL CHECK (status IN ('success','retry','failed')),
    error TEXT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ NULL,
    payload JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast filters
CREATE INDEX IF NOT EXISTS idx_alert_actions_log_alert_id ON alert_actions_log(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_actions_log_status_next ON alert_actions_log(status, next_retry_at) WHERE status = 'retry';
-- Helpful for querying latest attempt per alert
CREATE INDEX IF NOT EXISTS idx_alert_actions_log_created_at ON alert_actions_log(created_at);

COMMENT ON TABLE alert_actions_log IS 'Audit log for alert notification delivery attempts';
COMMENT ON COLUMN alert_actions_log.dest IS 'Destination: slack or webhook';
COMMENT ON COLUMN alert_actions_log.status IS 'Current status: success, retry, or failed';
COMMENT ON COLUMN alert_actions_log.next_retry_at IS 'Scheduled retry time (NULL if success/failed or not yet scheduled)';
