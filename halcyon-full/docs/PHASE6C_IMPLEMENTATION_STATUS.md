# Phase 6C — Enrichment UX & Playbooks - Implementation Status

## ✅ Backend Core - COMPLETE

### Database Schema
- ✅ Migration `014_enrichment_core.sql` created
- ✅ Tables: `enrichment_actions`, `playbooks`, `enrichment_runs`, `playbook_runs`
- ✅ Indexes for fast lookups by subject and time

### Enrichment Engine
- ✅ `enrichment_engine.py` with 7 built-in actions:
  - `geoip` - GeoIP lookup
  - `reverse_geocode` - Reverse geocoding
  - `keyword_match` - Keyword matching
  - `http_get` / `http_post` - HTTP requests with templating
  - `vt_hash_lookup` - VirusTotal hash lookup
  - `whois` - WHOIS lookup
- ✅ Secret redaction for sensitive data
- ✅ Feature flags (ENRICH_ENABLE, ENRICH_ALLOW_HTTP)
- ✅ Timeout and error handling

### Playbook Engine
- ✅ `playbook_engine.py` with step execution
- ✅ Templating support (${alert.attrs.source}, ${case.title})
- ✅ Step types: enrich, attach_note, set_alert_priority, route_preview, route_retry
- ✅ Error handling per step (onError: continue|fail)
- ✅ Step timing and status tracking

### API Routes
- ✅ `GET /enrich/actions` - List actions
- ✅ `POST /enrich/run` - Run action
- ✅ `GET /enrich/runs` - Get runs for subject
- ✅ `GET /playbooks` - List playbooks
- ✅ `POST /playbooks/run` - Run playbook
- ✅ `GET /playbooks/runs` - Get playbook runs
- ✅ RBAC: viewer can list/view, analyst/admin can run

### Metrics
- ✅ `enrich_runs_total{action,status}`
- ✅ `enrich_latency_seconds_bucket{action}`
- ✅ `playbook_runs_total{playbook,status}`
- ✅ `playbook_step_fail_total{playbook,step}`

### Repository Layer
- ✅ `repo_enrichment.py` with all database operations
- ✅ JSON serialization/deserialization
- ✅ Merged timeline of enrichment + playbook runs

### Seed Data
- ✅ `deploy/seeds/playbooks.json` with sample actions and playbooks

## ⏳ Frontend - TODO

### Store
- [ ] `ui/src/store/enrichStore.ts`
  - `listActions()`
  - `listPlaybooks()`
  - `runAction(subject, actionId, attachAsNote)`
  - `runPlaybook(subject, playbookId, attachAsNote)`
  - `listRuns(subject)` - merged timeline

### Components
- [ ] `ui/src/modules/enrichment/EnrichmentPanel.tsx`
  - Searchable action list
  - "Run" button with last-used chip
  - History table (status, action, duration, time)
  - Expand row → RunOutputDrawer

- [ ] `ui/src/modules/enrichment/PlaybooksPanel.tsx`
  - Playbook selector
  - "Run" button
  - Live step progress with status chips

- [ ] `ui/src/modules/enrichment/RunOutputDrawer.tsx`
  - Pretty JSON viewer (collapsible)
  - Copy button
  - "Attach as note" toggle

### Integration
- [ ] AlertDetailsDrawer: Add "Enrich" and "Playbooks" tabs
- [ ] CaseView: Add "Enrich" and "Playbooks" tabs
- [ ] RBAC: Hide "Run" buttons for viewers
- [ ] localStorage: Persist last-used action/playbook

### UX Polish
- [ ] EmptyState for no runs
- [ ] Toast notifications on completion
- [ ] No blocking modals for 401/403/404
- [ ] AlertDialog for 5xx/network errors

## 🔧 Next Steps

1. **Apply Migration**: Run the SQL migration on the database
2. **Seed Data**: Load `playbooks.json` into the database
3. **Frontend Implementation**: Create the store and components
4. **Integration**: Wire into AlertDetailsDrawer and CaseView
5. **Testing**: Smoke test all endpoints and UI flows

## 📝 Notes

- Gateway client integration needed for fetching actual alert/case data
- "Attach as note" functionality requires Gateway API integration
- Subject fetching currently mocked - needs Gateway client
- Rate limiting not yet implemented (recommended for production)

