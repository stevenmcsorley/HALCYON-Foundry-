BEGIN;

-- Extend alert_rules table
ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS fingerprint_template TEXT,
  ADD COLUMN IF NOT EXISTS correlation_keys JSONB,
  ADD COLUMN IF NOT EXISTS mute_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS route JSONB;

-- Extend alerts table
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS group_key TEXT,
  ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS count INT DEFAULT 1;

-- Update status enum if needed (change 'new' to 'open', keep 'ack' and 'resolved')
DO $$ BEGIN
  ALTER TYPE alert_status ADD VALUE IF NOT EXISTS 'open';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Update existing 'new' status to 'open'
UPDATE alerts SET status = 'open' WHERE status = 'new';

-- Create alert_comments table
CREATE TABLE IF NOT EXISTS alert_comments (
  id SERIAL PRIMARY KEY,
  alert_id INT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_comments_alert_id ON alert_comments(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_comments_created_at ON alert_comments(created_at DESC);

-- Create alert_silences table
CREATE TABLE IF NOT EXISTS alert_silences (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  match_json JSONB NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_silences_starts_at ON alert_silences(starts_at);
CREATE INDEX IF NOT EXISTS idx_alert_silences_ends_at ON alert_silences(ends_at);
CREATE INDEX IF NOT EXISTS idx_alert_silences_active ON alert_silences(starts_at, ends_at) WHERE starts_at <= NOW() AND ends_at >= NOW();

-- Create maintenance_windows table
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  match_json JSONB NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_starts_at ON maintenance_windows(starts_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_ends_at ON maintenance_windows(ends_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_active ON maintenance_windows(starts_at, ends_at) WHERE starts_at <= NOW() AND ends_at >= NOW();

-- Extend alert_actions_log table
ALTER TABLE alert_actions_log
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Add index for fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_alerts_group_key ON alerts(group_key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_alerts_last_seen ON alerts(last_seen DESC);

COMMIT;
