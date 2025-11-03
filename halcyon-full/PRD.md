# HALCYON Foundry Core — High Spec Product Requirements Document

## 1. Vision
HALCYON Foundry Core is a modular, extensible, high-availability platform for data fusion and real-time intelligence.
It ingests arbitrary **data sources** (telemetry, infrastructure, business, documents, people) and unifies them through a shared ontology, lineage graph, and visualization layer.

The system provides:
- Unified ontology-based data modeling.
- Real-time ingestion and normalization pipelines.
- Graph and tabular querying via GraphQL + REST.
- Policy-based access control and data redaction.
- Reactive UI for exploration (Map, Graph, Timeline, Table).

HALCYON is **source-agnostic**, **extensible**, and **self-describing**. Any data source can register via a declarative plugin manifest defining schemas, enrichment, relationships, and optional UI modules.

## 2. Objectives
1. Consolidate heterogeneous data sources into a single, queryable ontology.
2. Deliver low-latency access to live and historical data.
3. Allow dynamic registration of new data domains via plugins.
4. Provide full data lineage, provenance, and audit history.
5. Support fine-grained RBAC and attribute-based redaction via policy engine.
6. Enable visual and programmatic exploration of data and relationships.
7. Operate 24/7 in both on-prem and cloud deployments.

## 3. Architecture Overview
### Core Services
- **Ontology Service** — entity/relationship type registry, instance upsert, graph persistence (Neo4j), metadata (Postgres).
- **Gateway** — GraphQL + REST BFF, policy check via OPA, forwards writes to Ontology.
- **Policy** — OPA with Rego bundles, ABAC field-level controls.
- **Registry** — scans `/datasources/*/plugin.yaml`, registers schemas/relations via Ontology API.
- **Enrichment** — pluggable workers (geo-reverse, keyword match, embeddings).

### Data Fabric
- **MinIO** (S3) — raw & processed objects; **Postgres** — metadata; **Neo4j** — graph; **ClickHouse** — OLAP; **Kafka** — event bus.

### UI Console
React + TypeScript + Vite + Tailwind; panels: Map, Graph, List, Timeline; config-driven; connects to Gateway.

## 4. Canonical Entities & Relationships
Entities: Event, Asset, Person, Organization, Document, Location, Vulnerability.
Relationships:
```
(Event)-[:AFFECTS]->(Asset)
(Person)-[:WORKS_FOR]->(Organization)
(Document)-[:MENTIONS]->(Person|Organization|Asset|Event)
(Asset)-[:LOCATED_AT]->(Location)
(Event)-[:NEAR]->(Location)
(Asset)-[:HAS_VULN]->(Vulnerability)
```

## 5. Plugins
Each source ships a `plugin.yaml`:
- connectors (protocol, cadence, schema)
- normalize map (raw→canonical)
- enrich steps
- ontology extensions
- policy hints and optional UI modules

## 6. Security/Policy
Keycloak (OIDC) for auth (not required for local dev), OPA for ABAC; TLS where applicable; immutable audit trail (WORM) optional.

## 7. Performance Targets
- Event→graph: < 300 ms P95
- Graph query (≤100 nodes): < 200 ms P95
- Ingest throughput/node: ≥ 10k events/sec
- UI initial load: < 3s

## 8. Deployment (dev)
Docker Compose for local; Helm/K8s later. No mocks; everything driven from env and real services.

## 9. Non-Functional
Containerized, config-driven, schema-versioned, modular, replaceable components.
