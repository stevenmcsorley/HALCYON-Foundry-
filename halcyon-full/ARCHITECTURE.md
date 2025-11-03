# HALCYON Foundry Core — Architecture Overview

```
UI (React) -> GraphQL/REST Gateway -> Ontology/Policy/Registry/Enrichment -> Data Fabric (Postgres, Neo4j, MinIO, ClickHouse, Kafka)
```

## Services
- **ontology** — entity/relationship types; instance upserts; stores in Postgres (meta) + Neo4j (graph).
- **gateway** — GraphQL + REST, policy-check via OPA.
- **policy** — OPA bundle and data.
- **registry** — scans `/datasources` for `plugin.yaml`, pushes types/relations to ontology.
- **enrichment** — workers: geo-reverse, keyword-match, embeddings.

## Data Fabric
- Postgres, Neo4j, MinIO (optional in dev), ClickHouse (optional), Kafka (optional).

## Principles
Replaceable components; schema-driven; declarative plugins; config over code; strict typing.
