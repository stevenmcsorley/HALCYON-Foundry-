BEGIN;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('new','ack','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  condition_json JSONB NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'medium',
  actions_json JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  rule_id INT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  entity_id TEXT,
  message TEXT NOT NULL,
  severity alert_severity NOT NULL,
  status alert_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_by TEXT
);

CREATE TABLE IF NOT EXISTS alert_actions_log (
  id SERIAL PRIMARY KEY,
  alert_id INT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_code INT,
  error TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latency_ms INT
);

CREATE INDEX IF NOT EXISTS idx_alerts_rule_id ON alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_actions_alert_id ON alert_actions_log(alert_id);

COMMIT;
