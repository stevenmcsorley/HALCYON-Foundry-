-- Migration 005: Add shape_hint to saved_queries

ALTER TABLE saved_queries 
ADD COLUMN IF NOT EXISTS shape_hint VARCHAR(20) 
CHECK (shape_hint IS NULL OR shape_hint IN ('entities', 'counts', 'metric', 'geo', 'items'));

CREATE INDEX IF NOT EXISTS idx_saved_queries_shape_hint ON saved_queries(shape_hint);
