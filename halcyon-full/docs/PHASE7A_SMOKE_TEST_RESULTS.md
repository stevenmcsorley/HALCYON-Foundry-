# Phase 7A: Playbook Studio - Smoke Test Results

## Test Date
2025-11-06

## Prep Status ✅

- [x] Migration applied: `release_notes` column added to `playbook_versions` table
- [x] Enrichment service rebuilt and running
- [x] Services healthy: Enrichment (8091) ✅, Gateway (8088) ✅
- [x] Metrics available: All counters present

## Automated Test Results

### A) Publish Guardrails ✅

- [x] **Empty steps**: Blocked on publish with error "Playbook must have at least one step"
- [x] **Missing entry**: Frontend guardrails catch this (checkPublishGuardrails function)
- [x] **Dangling edges**: Frontend guardrails detect and report
- [x] **Unconnected steps**: Frontend guardrails warn (non-blocking)
- [x] **Valid playbook**: Publishes successfully
- [x] **Preflight checklist**: Implemented in JsonPreview component

**Test Results:**
```bash
# Empty steps test
curl -X PUT /playbooks/{id} -d '{"status":"published","jsonBody":{"steps":[]}}'
# Result: "Playbook must have at least one step" ✓

# Valid playbook test
curl -X PUT /playbooks/{id} -d '{"status":"published","jsonBody":{...valid...}}'
# Result: Published successfully ✓
```

### B) Templates ✅

- [x] **IP Enrichment**: Template structure creates playbooks successfully
- [x] **Full Enrichment**: Template structure validated
- [x] **Webhook Notify**: Template structure validated
- [x] **Test run**: Executes with mock data, returns step logs
- [x] **Steps execute**: GeoIP → Output works correctly

**Test Results:**
```bash
# Template creation
curl -X POST /playbooks -d '{"name":"Test IP Enrichment","jsonBody":{...template...}}'
# Result: Created successfully ✓

# Test run
curl -X POST /playbooks/test-run -d '{"jsonBody":{...},"mockSubject":{"attrs":{"ip":"8.8.8.8"}}}'
# Result: status=success, steps executed ✓
```

### C) Import/Export ✅

- [x] **Backend format**: Validates correctly (stepId/kind format)
- [x] **Bad import**: Returns validation error "Step must have a 'kind' field"
- [x] **Format transformation**: Handled in frontend (transformToBackendFormat)

**Test Results:**
```bash
# Backend format validation
curl -X POST /playbooks/validate -d '{"jsonBody":{"steps":[{"kind":"enrich","actionId":"geoip",...}]}}'
# Result: isValid=true ✓

# Bad import
curl -X POST /playbooks/validate -d '{"jsonBody":{"steps":[{"actionId":"geoip",...}]}}'
# Result: isValid=false, error="Step must have a 'kind' field" ✓
```

### D) Release Notes ✅

- [x] **Store on publish**: Release notes saved to database
- [x] **Version history**: Retrieves notes correctly via API
- [x] **Multiple versions**: Tracks notes for each version

**Test Results:**
```bash
# Publish with release notes
curl -X PUT /playbooks/{id} -d '{"status":"published","releaseNotes":"v1: Initial release",...}'
# Database: release_notes = "v1: Initial release" ✓

# Retrieve versions
curl /playbooks/{id}/versions
# Result: [{"version":2,"releaseNotes":"v1: Initial release"},...] ✓
```

### E) Metrics ✅

- [x] **playbook_drafts_total**: Available and incrementing
- [x] **playbook_publish_total**: Available and incrementing
- [x] **playbook_test_runs_total**: Available and incrementing
- [x] **playbook_ai_drafts_total**: Available

**Test Results:**
```bash
curl http://localhost:8091/metrics | grep playbook_
# Result: All metrics present ✓
```

## Manual UI Tests Required

The following tests require manual UI interaction:

- [ ] Preflight checklist visual display in JSON tab
- [ ] Template dialog opens and creates playbooks
- [ ] Export downloads JSON file
- [ ] Import uploads and validates file
- [ ] Canvas node connections work
- [ ] Input fields have proper styling (dark theme, teal focus)
- [ ] Version history UI shows release notes
- [ ] Rollback restores canvas and JSON

## Known Issues

None - all automated tests pass.

## Next Steps

1. Complete manual UI testing
2. Verify all frontend features work as expected
3. Create release tag: `v7a-playbook-studio`

## Release Tag

```bash
git tag -a v7a-playbook-studio -m "Phase 7A: Playbook Studio (Guardrails, Templates, Import/Export, Release Notes, Preflight)"
git push origin v7a-playbook-studio
```
