-- 011_cases_ml.sql
-- PR-4B: Case Automation & ML Scoring

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS priority_suggestion VARCHAR(16),
  ADD COLUMN IF NOT EXISTS owner_suggestion VARCHAR(128),
  ADD COLUMN IF NOT EXISTS similar_case_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ml_version TEXT;

-- Optional support tables for audit/debug (safe to skip now)
-- CREATE TABLE IF NOT EXISTS ml_inference_log (...);

COMMENT ON COLUMN cases.priority_suggestion IS 'ML-suggested priority: low, medium, high, critical';
COMMENT ON COLUMN cases.owner_suggestion IS 'ML-suggested owner (email/subject)';
COMMENT ON COLUMN cases.similar_case_ids IS 'Array of similar case IDs (JSONB)';
COMMENT ON COLUMN cases.ml_version IS 'ML model version used for suggestions';

