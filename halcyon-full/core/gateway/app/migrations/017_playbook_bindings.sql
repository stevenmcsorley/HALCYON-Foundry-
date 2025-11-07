-- Phase 7B: Playbook auto-binding tables

CREATE TABLE IF NOT EXISTS playbook_bindings (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NULL,
    rule_id INTEGER REFERENCES alert_rules(id) ON DELETE CASCADE,
    playbook_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('suggest','dry_run','auto_run')),
    match_types TEXT[] NULL,
    match_severities TEXT[] NULL,
    match_tags TEXT[] NULL,
    max_per_minute INTEGER DEFAULT 30,
    max_concurrent INTEGER DEFAULT 5,
    daily_quota INTEGER DEFAULT 500,
    enabled BOOLEAN DEFAULT TRUE,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_bindings_rule ON playbook_bindings(rule_id);
CREATE INDEX IF NOT EXISTS idx_playbook_bindings_enabled ON playbook_bindings(enabled);

CREATE TABLE IF NOT EXISTS playbook_run_audit (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    binding_id INTEGER NULL REFERENCES playbook_bindings(id) ON DELETE SET NULL,
    playbook_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NULL,
    requested_by TEXT NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ NULL,
    success BOOLEAN NULL,
    output_ref TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_audit_alert ON playbook_run_audit(alert_id);
CREATE INDEX IF NOT EXISTS idx_run_audit_binding ON playbook_run_audit(binding_id);

CREATE TABLE IF NOT EXISTS playbook_binding_usage (
    binding_id INTEGER PRIMARY KEY REFERENCES playbook_bindings(id) ON DELETE CASCADE,
    day_utc DATE NOT NULL DEFAULT (CURRENT_DATE),
    count_today INTEGER NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0,
    refilled_at TIMESTAMPTZ NULL,
    in_flight INTEGER NOT NULL DEFAULT 0
);
