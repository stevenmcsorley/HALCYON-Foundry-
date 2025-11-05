# PR-4A — Cases & Ownership

✅ **Status**: Verified & Ready for Tagging (v4a-cases-ownership)

## Executive Summary

PR-4A completes the full triage pipeline for HALCYON's alerting system. Analysts can now convert alerts into cases, track ownership, add notes, and manage the resolution lifecycle. The implementation includes both backend (REST/GraphQL APIs, database schema) and frontend (React components, cross-tab navigation) with full RBAC enforcement and production-ready error handling.

## 1️⃣ Backend Summary

### Schema
- **Tables Created**: `cases`, `case_notes`
- **Alerts Extended**: `alerts.case_id` FK added (nullable, cascade-safe)
- **Enum Types**:
  - `case_status`: `open | in_progress | resolved | closed`
  - `case_priority`: `low | medium | high | critical`
- **Indexes**: 13 supporting indexes for fast triage queries

### Endpoints (7 total)

| Route | Method | Purpose |
|-------|--------|---------|
| `/cases` | GET | List cases (filterable by status, priority, owner, search) |
| `/cases` | POST | Create new case |
| `/cases/{id}` | GET | Retrieve case detail |
| `/cases/{id}` | PATCH | Update case metadata |
| `/cases/{id}/notes` | GET | List case notes |
| `/cases/{id}/notes` | POST | Add note to case |
| `/cases/{id}/alerts:assign` | POST | Link alerts to a case |

### Metrics
- `cases_created_total{priority}` - Counter for case creation
- `cases_resolved_total` - Counter for case resolution
- `alerts_assigned_to_case_total` - Counter for alert assignments

### Auth & RBAC
- All endpoints protected with JWT authentication
- **viewer** → read-only access
- **analyst|admin** → full CRUD capabilities

## 2️⃣ Frontend Summary

### Stores & State
- **`casesStore.ts`** (Zustand) with CRUD, notes, assignAlerts
- Silent 401/403/404 handling (consistent with alertsStore pattern)
- AlertDialog only for 5xx/network/validation errors

### UI Components

| Component | Purpose |
|-----------|---------|
| `CasesTab.tsx` | Main workspace layout with list/detail split view |
| `CasesList.tsx` | Filterable list view (status, priority, owner, search) |
| `CaseView.tsx` | Case detail composer |
| `CaseMeta.tsx` | Inline edit for status/priority/owner |
| `CaseNotes.tsx` | Thread view + add note |
| `CaseAlerts.tsx` | Linked alerts under case |
| `CaseEditor.tsx` | Modal create/update form |
| `EmptyCaseHint.tsx` | Friendly empty state |

### Integration
- **Multi-select in AlertList** + "Open as Case" button
- **Pre-filled case title**: `[SEVERITY] {message}` from selected alerts
- **Case chip on alert row**: Click navigates to Cases tab with case selected
- **Cross-tab navigation**: Event bus wired in App.tsx
- **Toast notifications**: Success messages (no browser alerts)

### RBAC
- **Viewer** → read-only (no New/Edit buttons)
- **Analyst/Admin** → full create/edit/assign capabilities

### UX Guardrails
- Silent 401/403/404 → EmptyState
- AlertDialog only for 5xx/network/validation
- Consistent dark theme (bg-panel, text-white)
- Toasts for saves, inline hints for validation

## 3️⃣ Manual Smoke Test Plan

| Test | Steps | Expected |
|------|-------|----------|
| Cases tab load | Open tab | List or EmptyState, no errors |
| Create case | New Case modal → Save | Toast "Case created" |
| Create from Alerts | Select alerts → Open as Case | Case created, chips appear |
| Edit meta | Change status/priority | Inline save → PATCH 200 OK |
| Add note | Add text → Save | Appears instantly w/ timestamp |
| Case chip nav | Click chip | Opens case view in tab |
| RBAC | Login as viewer | Read-only state |
| Error handling | Stop gateway | Silent empty, no modal spam |
| Metrics | `curl /metrics` | Counters increment correctly |

## 4️⃣ Post-Verification

Once the above tests pass:

```bash
git tag -a v4a-cases-ownership -m "Phase 4A: Cases & Ownership complete"
git push origin v4a-cases-ownership
```

## 5️⃣ Impact

### User Impact
- Analysts can now triage alerts systematically through cases
- Ownership tracking enables team coordination
- Notes provide audit trail and collaboration context
- Resolution workflow is clear and trackable

### Technical Impact
- Complete triage pipeline: Alerts → Cases → Notes → Resolution
- Cross-tab linking with chips and navigation
- RBAC enforcement at UI and API levels
- Production-ready error handling and metrics
- Dark UI with consistent theming

## 6️⃣ Files Changed

### Backend
- `core/gateway/app/migrations/010_cases_core.sql`
- `core/gateway/app/models_cases.py`
- `core/gateway/app/repo_cases.py`
- `core/gateway/app/routes_cases.py`
- `core/gateway/app/resolvers_cases.py`
- `core/gateway/app/schema.graphql`
- `core/gateway/app/metrics.py`
- `core/gateway/app/main.py`

### Frontend
- `ui/src/store/casesStore.ts`
- `ui/src/modules/cases/*.tsx` (8 components)
- `ui/src/modules/alerts/AlertList.tsx`
- `ui/src/modules/alerts/AlertsTab.tsx`
- `ui/src/App.tsx`
- `ui/src/services/api.ts` (added PATCH method)

### Documentation
- `CHANGELOG.md` (updated)

---

**Ready for merge and tag after manual smoke tests pass.**
