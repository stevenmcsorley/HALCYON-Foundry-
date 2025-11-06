-- Add release_notes column to playbook_versions table
BEGIN;

ALTER TABLE playbook_versions 
ADD COLUMN IF NOT EXISTS release_notes TEXT;

COMMIT;

