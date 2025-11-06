-- Phase 6C: Enrichment & Playbooks Core Tables

BEGIN;

-- Enrichment actions (built-in and custom)
CREATE TABLE IF NOT EXISTS enrichment_actions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL, -- 'geoip', 'reverse_geocode', 'keyword_match', 'http_get', 'http_post', 'vt_hash_lookup', 'whois', etc.
    config_json JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Playbooks (sequence of steps)
CREATE TABLE IF NOT EXISTS playbooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    steps_json JSONB NOT NULL, -- Array of step objects
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enrichment runs (single action execution)
CREATE TABLE IF NOT EXISTS enrichment_runs (
    id TEXT PRIMARY KEY,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('alert', 'case')),
    subject_id TEXT NOT NULL, -- Can be number or string
    kind TEXT NOT NULL DEFAULT 'action',
    ref_json JSONB NOT NULL, -- { "actionId": "geoip" } or { "playbookId": "pb-1" }
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')) DEFAULT 'pending',
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    output_json JSONB,
    error_text TEXT,
    metrics_json JSONB DEFAULT '{}',
    user_id TEXT,
    idempotency_key TEXT, -- Optional: (subject, kind, ref, hash(inputs))
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Playbook runs (multi-step execution)
CREATE TABLE IF NOT EXISTS playbook_runs (
    id TEXT PRIMARY KEY,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('alert', 'case')),
    subject_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL REFERENCES playbooks(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')) DEFAULT 'pending',
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    steps_json JSONB NOT NULL, -- Array of step results with status, output, error
    output_json JSONB, -- Aggregated output
    error_text TEXT,
    metrics_json JSONB DEFAULT '{}',
    user_id TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_enrich_runs_subject ON enrichment_runs(subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_enrich_runs_started ON enrichment_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrich_runs_idempotency ON enrichment_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playbook_runs_subject ON playbook_runs(subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_playbook_runs_started ON playbook_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_playbook_runs_playbook ON playbook_runs(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_runs_idempotency ON playbook_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMIT;

