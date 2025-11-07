-- Migration 019: Datasource Studio core tables

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Core datasource metadata
CREATE TABLE IF NOT EXISTS datasources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    owner_id TEXT,
    org_id UUID,
    project_id UUID,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    archived_at TIMESTAMPTZ,
    CONSTRAINT chk_datasources_status CHECK (status IN ('draft', 'active', 'disabled', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasources_owner_name
    ON datasources(owner_id, name)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_datasources_status
    ON datasources(status);

CREATE INDEX IF NOT EXISTS idx_datasources_org_project
    ON datasources(org_id, project_id);

CREATE INDEX IF NOT EXISTS idx_datasources_tags
    ON datasources USING GIN (tags);

-- 2. Version history
CREATE TABLE IF NOT EXISTS datasource_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
    version INT NOT NULL,
    state TEXT NOT NULL,
    config_json JSONB NOT NULL,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    CONSTRAINT chk_versions_state CHECK (state IN ('draft', 'published', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasource_versions_unique
    ON datasource_versions(datasource_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasource_versions_published
    ON datasource_versions(datasource_id)
    WHERE state = 'published';

-- 3. Runtime state
CREATE TABLE IF NOT EXISTS datasource_state (
    datasource_id UUID PRIMARY KEY REFERENCES datasources(id) ON DELETE CASCADE,
    current_version INT,
    worker_status TEXT NOT NULL DEFAULT 'stopped',
    last_heartbeat_at TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    metrics_snapshot JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_worker_status CHECK (worker_status IN ('starting', 'running', 'stopped', 'error'))
);

-- 4. Secrets
CREATE TABLE IF NOT EXISTS datasource_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    encrypted_value BYTEA NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    rotated_at TIMESTAMPTZ,
    rotated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasource_secrets_key
    ON datasource_secrets(datasource_id, key);

-- 5. Events / audit trail
CREATE TABLE IF NOT EXISTS datasource_events (
    id BIGSERIAL PRIMARY KEY,
    datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
    version INT,
    event_type TEXT NOT NULL,
    actor TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasource_events_ds
    ON datasource_events(datasource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_datasource_events_type
    ON datasource_events(event_type);

