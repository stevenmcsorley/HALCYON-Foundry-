BEGIN;

CREATE TABLE IF NOT EXISTS ml_feedback_log (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('priority','owner')),
  suggested_value TEXT NOT NULL,
  final_value     TEXT,                       -- set when adopted/overridden; NULL if rejected
  action          TEXT NOT NULL CHECK (action IN ('accepted','rejected','overridden')),
  score           DOUBLE PRECISION,           -- confidence shown when feedback given
  user_id         TEXT,                       -- from token; nullable for system
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlfb_case ON ml_feedback_log(case_id);
CREATE INDEX IF NOT EXISTS idx_mlfb_type ON ml_feedback_log(suggestion_type);
CREATE INDEX IF NOT EXISTS idx_mlfb_created ON ml_feedback_log(created_at);

COMMIT;

