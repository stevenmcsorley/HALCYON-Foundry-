-- PR-2: Silences & Maintenance Windows (Suppression-Only)
-- Migration: 008_alerts_suppression.sql

-- Create alert_silences table
CREATE TABLE IF NOT EXISTS alert_silences (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    match_json JSONB NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_time_range CHECK (starts_at < ends_at)
);

-- Create maintenance_windows table (same structure as silences)
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    match_json JSONB NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_time_range CHECK (starts_at < ends_at)
);

-- Add suppression tracking to alerts table
ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS suppressed_by_kind TEXT CHECK (suppressed_by_kind IN ('silence', 'maintenance')),
    ADD COLUMN IF NOT EXISTS suppressed_by_id INT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_alert_silences_match ON alert_silences USING GIN (match_json);
CREATE INDEX IF NOT EXISTS idx_alert_silences_time ON alert_silences (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_alert_silences_created ON alert_silences (created_at);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_match ON maintenance_windows USING GIN (match_json);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_time ON maintenance_windows (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_created ON maintenance_windows (created_at);

-- Index for suppression lookup
CREATE INDEX IF NOT EXISTS idx_alerts_suppressed ON alerts (suppressed_by_kind, suppressed_by_id) WHERE suppressed_by_kind IS NOT NULL;

COMMENT ON TABLE alert_silences IS 'Ad-hoc alert suppression filters';
COMMENT ON TABLE maintenance_windows IS 'Time-bounded alert suppression windows';
COMMENT ON COLUMN alerts.suppressed_by_kind IS 'Type of suppression: silence or maintenance';
COMMENT ON COLUMN alerts.suppressed_by_id IS 'ID of the silence or maintenance window that suppressed this alert';
