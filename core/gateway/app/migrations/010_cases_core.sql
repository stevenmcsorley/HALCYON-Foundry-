-- PR-4A: Cases & Ownership
-- Migration: 010_cases_core.sql

-- case_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_status') THEN
    CREATE TYPE case_status AS ENUM ('open','in_progress','resolved','closed');
  END IF;
END $$;

-- ensure all labels exist (safe re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_status' AND e.enumlabel = 'open'
  ) THEN
    ALTER TYPE case_status ADD VALUE 'open';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_status' AND e.enumlabel = 'in_progress'
  ) THEN
    ALTER TYPE case_status ADD VALUE 'in_progress';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_status' AND e.enumlabel = 'resolved'
  ) THEN
    ALTER TYPE case_status ADD VALUE 'resolved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_status' AND e.enumlabel = 'closed'
  ) THEN
    ALTER TYPE case_status ADD VALUE 'closed';
  END IF;
END $$;

-- case_priority enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_priority') THEN
    CREATE TYPE case_priority AS ENUM ('low','medium','high','critical');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_priority' AND e.enumlabel = 'low'
  ) THEN
    ALTER TYPE case_priority ADD VALUE 'low';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_priority' AND e.enumlabel = 'medium'
  ) THEN
    ALTER TYPE case_priority ADD VALUE 'medium';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_priority' AND e.enumlabel = 'high'
  ) THEN
    ALTER TYPE case_priority ADD VALUE 'high';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'case_priority' AND e.enumlabel = 'critical'
  ) THEN
    ALTER TYPE case_priority ADD VALUE 'critical';
  END IF;
END $$;

-- tables
CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NULL,
  status case_status NOT NULL DEFAULT 'open',
  priority case_priority NOT NULL DEFAULT 'medium',
  owner TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS case_notes (
  id SERIAL PRIMARY KEY,
  case_id INT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author TEXT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- alerts link
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS case_id INT NULL REFERENCES cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);
CREATE INDEX IF NOT EXISTS idx_case_notes_case_id ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_alerts_case_id ON alerts(case_id);

COMMENT ON TABLE cases IS 'Case management: groups alerts for analyst triage';
COMMENT ON TABLE case_notes IS 'Notes/comments on cases';
COMMENT ON COLUMN alerts.case_id IS 'Link to owning case (many alerts can share one case)';
