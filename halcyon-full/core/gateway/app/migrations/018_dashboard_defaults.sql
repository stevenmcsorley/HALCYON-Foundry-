-- Migration 018: Dashboard defaults and configuration

ALTER TABLE dashboards
    ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Ensure only one default dashboard per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_owner_default
    ON dashboards(owner)
    WHERE is_default;

