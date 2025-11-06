-- Create test queries for dashboard
INSERT INTO saved_queries (name, owner, gql, shape_hint) VALUES
  ('All Events', 'admin@halcyon.dev', 'query { entities(type: "Event") { id type attrs } }', 'entities'),
  ('Location Entities', 'admin@halcyon.dev', 'query { entities(type: "Location") { id type attrs } }', 'geo'),
  ('High Severity Events', 'admin@halcyon.dev', 'query { entities(type: "Event") { id type attrs } }', 'entities'),
  ('Event Count', 'admin@halcyon.dev', 'query { entities(type: "Event") { id } }', 'metric'),
  ('All Entities', 'admin@halcyon.dev', 'query { entities { id type attrs } }', 'entities')
ON CONFLICT (owner, name) DO UPDATE SET gql = EXCLUDED.gql, shape_hint = EXCLUDED.shape_hint;
