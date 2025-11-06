-- Phase 7A: Playbook Studio - Versioning and Draft/Publish Support

BEGIN;

-- Add status and metadata columns to playbooks table
ALTER TABLE playbooks 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS created_by TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create playbook_versions table for version history
CREATE TABLE IF NOT EXISTS playbook_versions (
    id SERIAL PRIMARY KEY,
    playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    version INT NOT NULL,
    json_body JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    UNIQUE(playbook_id, version)
);

-- Create index for fast version lookups
CREATE INDEX IF NOT EXISTS idx_playbook_versions_playbook ON playbook_versions(playbook_id, version DESC);

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_playbooks_status ON playbooks(status);

-- Create index for filtering by creator
CREATE INDEX IF NOT EXISTS idx_playbooks_created_by ON playbooks(created_by) WHERE created_by IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_playbook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER playbook_updated_at_trigger
BEFORE UPDATE ON playbooks
FOR EACH ROW
EXECUTE FUNCTION update_playbook_updated_at();

COMMIT;

