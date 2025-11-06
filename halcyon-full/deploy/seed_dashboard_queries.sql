-- Comprehensive dashboard queries for HALCYON
-- These queries showcase different use cases: SecOps, IoT, IT Ops, Fraud

-- ============================================
-- GEOGRAPHIC QUERIES (for Map/GeoHeat panels)
-- ============================================

-- All Locations with coordinates
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('All Locations', 'admin@halcyon.dev',
   'query { entities(type: "Location") { id type attrs } }',
   'geo')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- Events with Geographic Data
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Events with Location', 'admin@halcyon.dev',
   'query { entities(type: "Event") { id type attrs } }',
   'geo')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- ============================================
-- ENTITY LIST QUERIES (for Graph/List/Table panels)
-- ============================================

-- All Events
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('All Events', 'admin@halcyon.dev',
   'query { entities(type: "Event") { id type attrs } }',
   'entities')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- All Assets
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('All Assets', 'admin@halcyon.dev',
   'query { entities(type: "Asset") { id type attrs } }',
   'entities')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- All Entities (All Types)
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('All Entities', 'admin@halcyon.dev',
   'query { entities { id type attrs } }',
   'entities')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- High Severity Events
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('High Severity Events', 'admin@halcyon.dev',
   'query { entities(type: "Event") { id type attrs } }',
   'entities')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- All Relationships
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('All Relationships', 'admin@halcyon.dev',
   'query { relationships { type fromId toId attrs } }',
   'entities')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- ============================================
-- METRIC QUERIES (for Metric panels)
-- ============================================

-- Event Count
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Event Count', 'admin@halcyon.dev',
   'query { entities(type: "Event") { id } }',
   'metric')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- Total Entity Count
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Total Entities', 'admin@halcyon.dev',
   'query { entities { id } }',
   'metric')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- Asset Count
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Asset Count', 'admin@halcyon.dev',
   'query { entities(type: "Asset") { id } }',
   'metric')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- Relationship Count
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Relationship Count', 'admin@halcyon.dev',
   'query { relationships { type } }',
   'metric')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- ============================================
-- TOP-N QUERIES (for Top-N Bars panels)
-- ============================================

-- Events by Type
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Events by Type', 'admin@halcyon.dev',
   'query { entities(type: "Event") { id type attrs } }',
   'items')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- Assets by Status
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Assets by Status', 'admin@halcyon.dev',
   'query { entities(type: "Asset") { id type attrs } }',
   'items')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;

-- Entities by Type
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('Entities by Type', 'admin@halcyon.dev',
   'query { entities { id type attrs } }',
   'items')
ON CONFLICT (owner, name) DO UPDATE SET 
  gql = EXCLUDED.gql,
  shape_hint = EXCLUDED.shape_hint;
