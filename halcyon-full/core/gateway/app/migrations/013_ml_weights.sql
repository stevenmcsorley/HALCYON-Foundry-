BEGIN;

CREATE TABLE IF NOT EXISTS ml_weights (
  id               BIGSERIAL PRIMARY KEY,
  model_version    TEXT NOT NULL,     -- e.g., "1.0.0"
  feature          TEXT NOT NULL,     -- e.g., "kw_critical", "owner_alice_history"
  weight           DOUBLE PRECISION NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(model_version, feature)
);

-- Initialize default weights for model version 1.0.0
INSERT INTO ml_weights (model_version, feature, weight)
VALUES 
  ('1.0.0', 'kw_critical', 2.0),
  ('1.0.0', 'kw_high', 1.5),
  ('1.0.0', 'kw_breach', 2.0),
  ('1.0.0', 'kw_failure', 1.0),
  ('1.0.0', 'owner_history_base', 1.0)
ON CONFLICT (model_version, feature) DO NOTHING;

COMMIT;

