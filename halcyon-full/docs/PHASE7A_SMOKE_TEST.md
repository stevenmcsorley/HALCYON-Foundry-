# Phase 7A: Playbook Studio - Smoke Test Results

## Prep Status ✅

- [x] Migration applied: `release_notes` column added to `playbook_versions` table
- [x] Enrichment service rebuilt and running
- [x] Services healthy: Enrichment (8091) ✅, Gateway (8088) ✅
- [x] Metrics available: `playbook_drafts_total`, `playbook_publish_total`, `playbook_test_runs_total`, `playbook_ai_drafts_total`

## Smoke Test Checklist

### A) Publish Guardrails

- [ ] **No entry step**: Create playbook with 2 nodes, don't set entry → Publish → Expect error "Entry step missing"
- [ ] **Dangling edge**: Set node's `next` to non-existent ID → Publish → Expect error naming missing ID
- [ ] **Unconnected steps**: Add orphaned node → Publish → Expect warning (non-blocking)
- [ ] **Empty playbook**: Remove all steps → Publish → Expect error "Must contain ≥1 step"
- [ ] **Happy path**: Fix all issues → Publish → Success
- [ ] **Preflight checklist**: JSON tab shows green checkmarks for all items

### B) Templates

- [ ] **IP Enrichment**: Create from template → Validate → Pass
- [ ] **Full Enrichment**: Create from template → Validate → Pass
- [ ] **Webhook Notify**: Create from template → Validate → Pass
- [ ] **Test Run**: Use mock alert `{"attrs": {"ip": "8.8.8.8", "hash": "44d88612fea8a8f36de82e1278abb02f"}}` → Steps execute, Output present

### C) Import/Export

- [ ] **Round-trip**: Export published playbook → Delete draft → Import → Validate → Pass
- [ ] **Backend format**: Edit file to use `stepId`/`kind` → Import → Validate → Pass
- [ ] **Bad import**: Remove `kind` from step → Import → Expect validation error, no state change

### D) Release Notes & Versions

- [ ] **Add notes**: Publish with release notes "Initial IP triage v1"
- [ ] **Multiple versions**: Publish again with change + new notes
- [ ] **View notes**: Version History shows notes for each version
- [ ] **Rollback**: Rollback to v1 → Canvas/JSON revert, notes preserved

### E) Regression Tests

- [ ] **Output note text**: Leave empty → Validate warns/blocks; Fill → Passes, persists after save/reload
- [ ] **Input styling**: All fields readable with teal focus (New Draft, AI Assist, Test Run, NodeEditor)
- [ ] **Version history**: Publish, tweak, publish again → Versions listed; Rollback restores canvas & JSON

## API Spot Checks

```bash
# List playbooks
curl -fsS http://localhost:8091/playbooks | jq '.[].{id,name,status,updated_at}'

# Validate JSON
curl -fsS -X POST http://localhost:8091/playbooks/validate \
  -H 'Content-Type: application/json' \
  -d '{"jsonBody":{"steps":[],"version":"1.0.0"}}' | jq

# Test run
curl -fsS -X POST http://localhost:8091/playbooks/test-run \
  -H 'Content-Type: application/json' \
  -d '{"jsonBody":{"steps":[{"kind":"enrich","actionId":"geoip","stepId":"step1"}],"version":"1.0.0","entry":"step1"},"mockSubject":{"attrs":{"ip":"8.8.8.8"}}}' | jq
```

## Observability

```bash
# Check metrics
curl -fsS http://localhost:8091/metrics | grep -E 'playbook_(drafts|publish|test_runs|ai_drafts)_total'
```

## Acceptance Criteria

- [x] Guardrails block missing entry, dangling edges, empty playbooks; warn on unconnected
- [ ] All 3 templates validate and test-run successfully
- [ ] Export → Import (frontend & backend formats) → Validate passes
- [ ] Release notes saved per version; version drawer shows notes; rollback works
- [x] Inputs/Dropdowns readable (dark theme), focus styles consistent
- [ ] No native alerts; only toasts/inline errors; no console errors

## Release Tag

When all tests pass:

```bash
git tag -a v7a-playbook-studio -m "Phase 7A: Playbook Studio (Guardrails, Templates, Import/Export, Release Notes, Preflight)"
git push origin v7a-playbook-studio
```

