# Release Notes — v6c-enrichment-playbooks

**Release Date:** November 6, 2025  
**Phase:** 6C — Enrichment UX & Playbooks  
**Status:** ✅ Production Ready

---

## 🎯 Overview

Phase 6C delivers a complete enrichment and playbook system for HALCYON, enabling analysts to automatically enrich alerts and cases with external data sources and execute multi-step workflows.

## ✨ New Features

### Enrichment Service
- **New Microservice:** FastAPI-based enrichment service on port 8091
- **Database:** PostgreSQL schema for actions, playbooks, and execution history
- **Authentication:** JWT-based authentication with Keycloak integration
- **Observability:** Prometheus metrics and OpenTelemetry tracing

### Built-in Enrichment Actions

1. **GeoIP Lookup** (`geoip`)
   - Uses ip-api.com (free, no API key required)
   - Returns: country, city, region, ISP, ASN, coordinates

2. **WHOIS Lookup** (`whois`)
   - IP geolocation via ip-api.com
   - Domain resolution with DNS lookup
   - Intelligent IP/domain prioritization

3. **HTTP GET/POST** (`http_get`, `http_post`)
   - Configurable URL templating
   - Custom headers and timeout
   - Webhook integration support

4. **VirusTotal Hash Lookup** (`vt_hash`)
   - Requires VT_API_KEY environment variable
   - File hash reputation checking

5. **Reverse Geocode** (`reverse_geocode`)
   - Convert coordinates to location data

6. **Keyword Match** (`keyword_match`)
   - Pattern matching for text analysis

### Playbook System

- **Multi-step Execution:** Chain multiple enrichment actions
- **Error Handling:** Continue or fail on step errors
- **Progress Tracking:** Real-time step-by-step status
- **Output Aggregation:** Combined results and summary
- **Default Playbook:** "Geo + WHOIS" enrichment workflow

### UI Integration

- **Alert Details Drawer:** New "Enrich" and "Playbooks" tabs
- **Case View:** Enrichment and Playbooks sections
- **Run History:** View past enrichment executions
- **JSON Output Viewer:** Formatted output with copy functionality
- **Attach as Note:** One-click attachment of enrichment results

### Security & RBAC

- **JWT Authentication:** Token validation via Keycloak
- **Role-Based Access:**
  - `viewer`: Read-only access
  - `analyst`, `admin`: Run actions and attach notes

### Observability

**Prometheus Metrics:**
- `enrich_runs_total{action, status}` - Action execution counter
- `enrich_latency_seconds{action}` - Latency histogram
- `playbook_runs_total{playbook, status}` - Playbook execution counter
- `playbook_step_fail_total{playbook, step}` - Step failure counter

**Tracing:**
- OpenTelemetry spans for all enrichment operations
- Distributed tracing support

## 🔧 Technical Details

### Database Schema

- `enrichment_actions` - Action definitions
- `playbooks` - Playbook definitions
- `enrichment_runs` - Action execution history
- `playbook_runs` - Playbook execution history

### API Endpoints

**Enrichment Service** (`http://localhost:8091/enrich/`):
- `GET /actions` - List all actions
- `GET /actions/{id}` - Get action details
- `POST /run` - Execute an action
- `GET /playbooks` - List all playbooks
- `GET /playbooks/{id}` - Get playbook details
- `POST /playbooks/run` - Execute a playbook
- `GET /runs` - List runs for a subject

**Gateway Extensions:**
- `GET /alerts/{id}` - Public read access for enrichment service

### Dependencies

- FastAPI 0.121.0+
- PostgreSQL (asyncpg)
- JWT (pyjwt)
- httpx for HTTP requests
- Prometheus client
- OpenTelemetry SDK

## 🐛 Bug Fixes

- Fixed 403 authentication errors (JWT middleware)
- Fixed empty subject attributes (Gateway API integration)
- Fixed playbook steps empty (field mapping)
- Fixed GeoIP provider errors (ip-api.com integration)
- Fixed WHOIS domain failures (DNS resolution)
- Fixed circular imports (health check refactor)
- Fixed NameError: 'target' not defined

## 🧪 Testing

### Smoke Tests — All Pass ✅

- ✅ Enrichment Action (GeoIP) - Returns ISP + location
- ✅ WHOIS Lookup - IP prioritized correctly
- ✅ Playbook Run - All 3 steps successful
- ✅ Attach as Note - Note visible in case
- ✅ RBAC - Viewer read-only access working
- ✅ Metrics - Exposed at `/metrics`
- ✅ UI Integration - Alerts and Cases working

### Test Data

- Alert ID 13: `ip-8.8.8.8` with domain `malicious-site.example.com`
- Test cases with enrichment data
- SQL scripts for test data insertion

## 📚 Documentation

- **Complete Summary:** `docs/PHASE6C_COMPLETE_SUMMARY.md`
- **API Documentation:** Available at `http://localhost:8091/docs`
- **Database Migrations:** `core/enrichment/app/migrations/014_enrichment_core.sql`

## 🚀 Deployment

### Docker Compose

The enrichment service is integrated into `deploy/docker-compose.yml`:

```yaml
enrichment:
  build: ../core/enrichment
  ports:
    - "8091:8091"
  environment:
    GATEWAY_URL: http://gateway:8088
    DATABASE_URL: postgresql://postgres:dev@postgres:5432/halcyon
  depends_on:
    - postgres
    - gateway
```

### Environment Variables

- `GATEWAY_URL` - Gateway API URL
- `DATABASE_URL` - PostgreSQL connection string
- `ONTOLOGY_BASE_URL` - Ontology service URL
- `VT_API_KEY` - VirusTotal API key (optional)

### Seed Data

Load default actions and playbooks:
```bash
./deploy/seeds/load_enrichment_seeds.sh
```

## 📊 Grafana Dashboards

### Recommended Panels

**Enrichment Runs:**
```
sum by(action,status) (increase(enrich_runs_total[1h]))
```

**Playbook Success Ratio:**
```
sum by(playbook,status) (increase(playbook_runs_total[1h]))
```

**Latency P95:**
```
histogram_quantile(0.95, sum by (le,action)(rate(enrich_latency_seconds_bucket[5m])))
```

## 🔮 Future Enhancements

- Playbook Studio (visual editor)
- Knowledge Graph & Correlations
- Adaptive Automation (ML-driven suggestions)
- Additional enrichment actions (Shodan, AbuseIPDB, etc.)
- Playbook templates and sharing

## 📝 Migration Notes

### Database Migration

Run the migration:
```bash
docker compose exec postgres psql -U postgres -d halcyon -f /path/to/014_enrichment_core.sql
```

### Breaking Changes

None — this is a new feature addition.

### Upgrade Path

1. Pull latest code
2. Run database migration
3. Restart services: `docker compose up -d`
4. Load seed data (optional)

## 🙏 Acknowledgments

Phase 6C implementation completed with full testing and documentation.

---

**For detailed implementation information, see:** `docs/PHASE6C_COMPLETE_SUMMARY.md`

