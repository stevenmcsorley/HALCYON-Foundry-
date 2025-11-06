# HALCYON Foundry Core

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v7a--playbook--studio-green.svg)](https://github.com/stevenmcsorley/HALCYON-Foundry-/releases)

**HALCYON Foundry Core** is a modular, extensible, high-availability platform for data fusion and real-time intelligence. It ingests arbitrary data sources (telemetry, infrastructure, business, documents, people) and unifies them through a shared ontology, lineage graph, and visualization layer.

## 🎯 What is HALCYON?

HALCYON is a **source-agnostic**, **extensible**, and **self-describing** platform that consolidates heterogeneous data sources into a single, queryable ontology. It provides:

- **Unified data modeling** via ontology-based entity relationships
- **Real-time ingestion** and normalization pipelines
- **Graph and tabular querying** via GraphQL + REST APIs
- **Policy-based access control** with fine-grained RBAC
- **Reactive UI** for exploration (Map, Graph, Timeline, Table, Dashboards)
- **Alert management** with intelligent routing and suppression
- **Case management** with ML-powered prioritization and ownership suggestions
- **Playbook automation** with visual design studio
- **Data enrichment** with built-in actions (GeoIP, WHOIS, VirusTotal, etc.)

## 🌐 Multi-Scenario Capability

HALCYON is designed from the ground up to be **domain-agnostic** and **multi-scenario** capable. The architecture is **schema-light** and **shape-aware**, enabling the same platform to handle diverse use cases without code changes:

### Architecture Principles

- **Connectors & Federation**: HTTP/Webhook/Kafka + virtual entities let you ingest anything (security logs, IoT telemetry, finance ticks, CRM events)
- **Ontology & Shapes**: `entities[]` / `counts[]` / `metric` / `geo[]` / `items[]` makes panels reusable across domains
- **Dashboards & Saved Queries**: Scenario-specific views without code changes
- **Anomalies + Alerts + Cases**: Generic detection → triage → resolution pipeline
- **Playbooks & Enrichment**: Pluggable actions (GeoIP/WHOIS/VT/HTTP/etc.) usable for SOC, IoT, ops, fraud, compliance
- **ML & Feedback**: Priority/owner suggestions + online learning adapt to any domain with labeled outcomes

## 🚀 Key Features

### 🔌 **Connectors & Data Sources**
- **HTTP/Webhook** - Real-time ingestion from any HTTP endpoint
- **Kafka** - High-throughput stream processing
- **MQTT** - IoT device telemetry ingestion
- **Virtual Entities** - Flexible schema mapping for any data source
- **Federation** - Aggregate data from multiple external sources
- **Plugin System** - Declarative plugin manifests for custom data sources

### 🗺️ **Console & Visualization**
- **Interactive Map** - Geospatial visualization with MapLibre GL
- **Knowledge Graph** - Entity relationship visualization with Cytoscape
- **Timeline View** - Temporal event playback and scrubbing
- **List View** - Tabular data exploration with filtering
- **Custom Dashboards** - Build and save custom visualization dashboards
- **Shape-Aware Panels** - Reusable components across domains (entities[], counts[], metric, geo[], items[])

### 🚨 **Alert Management**
- Alert ingestion from multiple sources
- Intelligent routing based on rules
- Alert suppression and deduplication
- Action retry with exponential backoff
- Delivery trace visualization
- Status tracking (open, acknowledged, resolved, suppressed)

### 📋 **Case Management**
- Create and manage security cases
- ML-powered priority and owner suggestions
- Case insights with related case discovery
- Notes and attachments
- Case assignment and ownership tracking
- Status workflow (open, investigating, resolved, closed)

### ⚙️ **Playbook Studio** (v7a)
- **Visual Canvas** - Drag-and-drop playbook design with React Flow
- **Live JSON Editor** - Monaco editor with real-time validation
- **AI Assistance** - Natural language to playbook conversion
- **Versioning** - Complete version history with rollback
- **Test Run Sandbox** - Simulate playbook execution
- **Templates** - Pre-built playbook templates
- **Import/Export** - Share playbooks as JSON

### 🔍 **Enrichment Engine**
Pluggable enrichment actions usable across all scenarios:
- **GeoIP Lookup** - IP geolocation via ip-api.com
- **WHOIS Lookup** - Domain and IP WHOIS information
- **VirusTotal** - Hash and file reputation checks
- **Reverse Geocode** - Convert coordinates to addresses
- **Keyword Match** - Search for keywords in content
- **HTTP GET/POST** - Webhook integrations for external APIs
- **Multi-step Playbooks** - Chain enrichment actions together
- **Custom Actions** - Extensible action framework for domain-specific enrichment

### 🤖 **Anomaly Detection**
- **Statistical Methods** - Z-score, moving averages, percentile-based detection
- **ML Models** - Isolation Forest, clustering-based anomaly detection
- **Rule-Based** - Custom threshold and pattern matching rules
- **Time-Series Analysis** - Temporal anomaly detection for metrics
- **Feedback Loop** - Continuous improvement through analyst feedback

### 🔐 **Security & Access Control**
- **Keycloak OIDC** - Enterprise identity provider integration
- **JWT-based Authentication** - Secure token-based auth
- **Role-based Access Control (RBAC)** - Viewer, Analyst, Admin roles
- **Policy Engine (OPA)** - Fine-grained permissions via Rego policies
- **Attribute-based Access Control (ABAC)** - Field-level data redaction
- **Audit Trail** - Complete audit history for compliance

### 📊 **Observability**
- Prometheus metrics on all services
- Grafana dashboards
- OpenTelemetry tracing with Jaeger
- Structured JSON logging
- Health check endpoints

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React UI (Port 5173)                  │
│  Console | Saved | Dashboards | Alerts | Cases | Playbooks │
└──────────────────────┬──────────────────────────────────┘
                       │ GraphQL + REST
┌──────────────────────▼──────────────────────────────────┐
│              Gateway (Port 8088)                         │
│  GraphQL API | REST API | Policy Engine (OPA) | Auth   │
└──────────┬───────────────┬───────────────┬──────────────┘
           │               │               │
    ┌──────▼──────┐  ┌─────▼─────┐  ┌────▼──────┐
    │  Ontology   │  │ Registry  │  │Enrichment │
    │ (Port 8081) │  │(Port 8090)│  │(Port 8091)│
    └──────┬──────┘  └───────────┘  └───────────┘
           │
    ┌──────▼──────────────────────────────────────┐
    │         Data Fabric                         │
    │  • PostgreSQL (metadata, alerts, cases)     │
    │  • Neo4j (graph relationships)              │
    │  • MinIO/S3 (object storage)                │
    │  • ClickHouse (OLAP - optional)             │
    │  • Kafka (event bus - optional)             │
    └─────────────────────────────────────────────┘
```

### Core Services

| Service | Port | Description |
|---------|------|-------------|
| **Gateway** | 8088 | GraphQL + REST API gateway, policy enforcement, authentication |
| **Ontology** | 8081 | Entity/relationship type registry, graph persistence (Neo4j), metadata (Postgres) |
| **Registry** | 8090 | Scans `/datasources` for plugin manifests, registers schemas |
| **Enrichment** | 8091 | Pluggable enrichment workers (GeoIP, WHOIS, VirusTotal, etc.) |
| **Policy** | - | OPA bundle with Rego policies for ABAC |
| **UI** | 5173 | React frontend application |

### Data Stores

- **PostgreSQL** - Metadata, alerts, cases, playbooks, user data
- **Neo4j** - Graph database for entity relationships
- **MinIO** - S3-compatible object storage
- **Prometheus** - Metrics collection
- **Grafana** - Metrics visualization
- **Jaeger** - Distributed tracing
- **Keycloak** - Authentication and authorization

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/stevenmcsorley/HALCYON-Foundry-.git
   cd HALCYON-Foundry-/halcyon-full
   ```

2. **Start the services**
   ```bash
   cd deploy
   docker compose up -d
   ```

3. **Access the UI**
   - Open http://localhost:5173
   - Default credentials:
     - **Admin**: `admin/admin`
     - **Analyst**: `analyst/analyst`
     - **Viewer**: `viewer/viewer`

4. **Verify services**
   - Gateway: http://localhost:8088/health
   - Ontology: http://localhost:8081/health
   - Enrichment: http://localhost:8091/health
   - Grafana: http://localhost:3000 (admin/admin)
   - Prometheus: http://localhost:9090

## 📖 Documentation

- **[Architecture Overview](halcyon-full/ARCHITECTURE.md)** - System architecture and design
- **[Product Requirements](halcyon-full/PRD.md)** - Full product requirements document
- **[Phase 7A: Playbook Studio](halcyon-full/docs/PHASE7A_PLAYBOOK_STUDIO.md)** - Playbook Studio documentation
- **[Phase 6C: Enrichment & Playbooks](halcyon-full/docs/PHASE6C_COMPLETE_SUMMARY.md)** - Enrichment engine documentation
- **[Changelog](halcyon-full/CHANGELOG.md)** - Version history and changes
- **[Style Guide](halcyon-full/STYLEGUIDE.md)** - Frontend development guidelines
- **[Auth README](halcyon-full/AUTH_README.md)** - Authentication setup and configuration

## 🎯 Use Cases & Scenarios

HALCYON's flexible architecture supports multiple scenarios with the same core platform:

### 🔐 SecOps (SIEM/SOAR)
**Flow**: Webhook syslog → IOC enrichment → Alert → Case → Playbook (block IP, open ticket) → Audit & metrics

- Ingest security alerts from multiple sources (SIEM, IDS, firewalls, endpoints)
- Automatically enrich alerts with threat intelligence (GeoIP, WHOIS, VirusTotal)
- Route alerts to appropriate analysts based on rules and ML suggestions
- Create cases and track investigation progress with notes and attachments
- Execute automated playbooks (block IP, create ticket, notify team)
- Full audit trail and compliance reporting

### 🏭 IoT / Industry 4.0
**Flow**: MQTT/Kafka sensor streams → Z-score/Isolation Forest anomalies → Map/heatmap → Auto-notify ops → Case with checklist

- Ingest sensor data from IoT devices via MQTT or Kafka
- Detect anomalies using statistical methods (z-score, Isolation Forest)
- Visualize sensor locations and metrics on interactive map
- Automatically notify operations teams of anomalies
- Create cases with checklists for maintenance and investigation
- Real-time dashboards for factory floor monitoring

### 💻 IT Ops / SRE
**Flow**: Prometheus alerts → Routing preview + retries → Playbook to gather logs, open incident, post to Slack, create Jira

- Integrate with Prometheus, Grafana, and other monitoring tools
- Route alerts based on severity, service, and on-call schedules
- Preview routing decisions before execution
- Automatic retry with exponential backoff
- Automated playbooks for common incidents (gather logs, restart service)
- Integration with Slack, Jira, PagerDuty, and ticketing systems
- Track MTTR and other SRE metrics

### 💳 Fraud / Risk Management
**Flow**: Transaction events → Rules + anomaly flags → Enrichment (device/IP, geo) → Case with analyst feedback loop

- Ingest transaction events from payment systems
- Apply rule-based and ML-based anomaly detection
- Enrich transactions with device fingerprinting, IP geolocation, and risk scores
- Create fraud cases with risk scoring and ML suggestions
- Analyst feedback loop for continuous ML improvement
- Compliance reporting and audit trails
- Real-time fraud detection and prevention

### 🔍 Threat Intelligence
- Correlate indicators across multiple data sources
- Enrich IPs, domains, and hashes with threat feeds
- Visualize threat relationships in knowledge graph
- Automate threat response with playbooks
- Share intelligence across teams and organizations

### 📊 Network Operations
- Monitor network telemetry and infrastructure metrics
- Visualize network topology in graph view
- Track network events in timeline view
- Create dashboards for network health monitoring
- Detect network anomalies and performance issues

## 🛠️ Development

### Project Structure

```
halcyon-full/
├── core/              # Microservices
│   ├── gateway/       # API gateway (GraphQL + REST)
│   ├── ontology/      # Entity/relationship registry
│   ├── registry/      # Data source registry
│   ├── enrichment/    # Enrichment engine
│   └── policy/        # OPA policy bundles
├── ui/                # React frontend
├── deploy/            # Docker Compose configuration
├── docs/              # Documentation
└── datasources/       # Data source plugins
```

### Technology Stack

**Backend:**
- Python 3.12+ with FastAPI
- PostgreSQL 15+
- Neo4j 5+
- asyncpg for async database access
- OpenPolicyAgent (OPA) for policy enforcement

**Frontend:**
- React 18+ with TypeScript
- Vite for build tooling
- TailwindCSS for styling
- React Flow for visual canvas
- Monaco Editor for code editing
- Zustand for state management
- GraphQL + REST APIs

**Infrastructure:**
- Docker and Docker Compose
- Prometheus for metrics
- Grafana for visualization
- Jaeger for tracing
- Keycloak for authentication

### Building from Source

```bash
# Backend services
cd core/gateway
pip install -e .
uvicorn app.main:app --reload

# Frontend
cd ui
npm install
npm run dev
```

## 📊 Metrics & Monitoring

All services expose Prometheus metrics at `/metrics`:

- HTTP request duration and count
- Database query performance
- Enrichment action success/failure rates
- Playbook execution metrics
- ML inference latency and adoption rates
- Alert routing and suppression metrics

Grafana dashboards are pre-configured and available at http://localhost:3000

## 🔒 Security

- JWT-based authentication via Keycloak
- Role-based access control (RBAC)
- Policy engine for fine-grained permissions
- Attribute-based access control (ABAC)
- API key management for external services
- Secret redaction in logs and responses

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines and code of conduct before submitting pull requests.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎉 Latest Release

**v7a-playbook-studio** (2025-11-06)

### What's New
- 🎨 Visual Playbook Studio with drag-and-drop canvas
- 🤖 AI-assisted playbook generation
- 📝 Version control with rollback capability
- 🧪 Test run sandbox for playbook simulation
- 📋 Pre-built playbook templates
- ✅ Preflight checklist for validation
- 📤 Import/Export functionality

[View Release Notes](https://github.com/stevenmcsorley/HALCYON-Foundry-/releases/tag/v7a-playbook-studio)

## 📞 Support

For questions, issues, or feature requests, please open an issue on GitHub.

## 🙏 Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://reactjs.org/)
- [React Flow](https://reactflow.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Neo4j](https://neo4j.com/)
- [PostgreSQL](https://www.postgresql.org/)
- [Grafana](https://grafana.com/)
- [Prometheus](https://prometheus.io/)
- [OpenPolicyAgent](https://www.openpolicyagent.org/)

---

**HALCYON Foundry Core** - Unified Intelligence Platform
