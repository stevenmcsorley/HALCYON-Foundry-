# Phase 7B — Auto-Binding Playbooks to Alerts

## Overview

Phase 7B extends the Halcyon alerting pipeline with guardrail-aware playbook automation. Analysts can now bind published playbooks to alert rules (or global contexts) and choose whether the playbook should be suggested, sandboxed (`dry_run`), or fully executed (`auto_run`) when new alerts are created.

The gateway evaluates bindings as soon as an alert is created (post dedupe/suppression), enforces per-binding rate limits / concurrency limits / daily quotas, and writes an audit record for every decision. Analysts can inspect the decisions in the alert drawer, fire overrides, or tune the bindings from the rule editor.

## Key Capabilities

- **Binding Matrix** — bind a playbook by rule, match by alert type / severity / tags, or leave global.
- **Execution Modes**
  - `suggest`: audit + UI toast only.
  - `dry_run`: sandbox in enrichment service (no external calls) and attach output reference.
  - `auto_run`: run the real playbook via enrichment service with attach-as-note enabled.
- **Guardrails** — per-binding rate limiter, concurrency cap, and daily quota enforced in gateway with Prometheus gauges.
- **Audit Trail** — every decision recorded in `playbook_run_audit` and streamed over WebSocket (`playbook.run_audit.created`).
- **Manual Override** — analysts/admins can force-run a binding (bypassing guardrails) from the alert drawer.
- **UI Integration**
  - Rule editor exposes a “Playbook Bindings” section for CRUD + guardrails + filters.
  - Alert drawer shows binding preview decisions, manual-run button, and a playbook run timeline.
  - Delivery trace gains a Playbook Runs timeline (shares guardrail decisions with routing insight).
- **Metrics** — new Prometheus counters/gauges/histograms for binding decisions, runs, in-flight concurrency, quota remaining, and evaluation latency.

## Backend Implementation

- **Schema**
  - `playbook_bindings`: stores bindings, matching criteria, guardrails, and metadata.
  - `playbook_run_audit`: audit rows for each decision/run.
  - `playbook_binding_usage`: per-binding rate/quota/concurrency tracker.
- **Repository Layer** (`repo_bindings.py`)
  - CRUD helpers, audit writers, guardrail matching, token-bucket rate limiting.
- **Execution Engine** (`autorun.py`)
  - `evaluate_bindings()` invoked on alert creation and manual overrides.
  - Calls enrichment service (`/playbooks/test-run`, `/enrich/playbooks/run`) with idempotency keys.
  - Publishes WebSocket events and Prometheus metrics.
- **API Surface**
  - REST: `/bindings` CRUD, `/alerts/{id}/bindings/evaluate`, `/alerts/{id}/bindings/run`, `/alerts/{id}/bindings/audit`.
  - GraphQL: `playbookBindings`, `playbookRunAudit`, `createPlaybookBinding`, `updatePlaybookBinding`, `deletePlaybookBinding`, `evaluateBindings`, `runBinding`.
- **Alert Creation Hook**
  - `resolvers.py` invokes `evaluate_bindings()` after dispatching actions for new alerts.

## Frontend Updates

- **Zustand Store** (`bindingsStore.ts`)
  - Normalised binding + audit state, preview evaluator, manual run, timeline refresh.
- **Rule Editor**
  - New panel for bindings: list / add / edit / delete, guardrail editors, matching filters, template text inputs.
- **Alert Drawer**
  - “Bindings” tab with preview decisions, manual run button (for suggested bindings), and recent audit timeline.
- **Delivery Trace**
  - Playbook runs sub-timeline that mirrors the audit history.

## Metrics

- `playbook_binding_decisions_total{mode,decision}`
- `playbook_binding_runs_total{mode,success}`
- `playbook_binding_inflight{binding_id}`
- `playbook_binding_quota_remaining{binding_id}` (`-1` represents unlimited)
- `playbook_binding_evaluate_latency_seconds{mode}`

## WebSocket Event

```json
{
  "t": "playbook.run_audit.created",
  "data": {
    "alertId": 123,
    "bindingId": 45,
    "playbookId": "pb-geo-whois",
    "mode": "dry_run",
    "decision": "dry_ran",
    "success": true,
    "reason": null,
    "startedAt": "2025-11-07T14:12:10.210Z",
    "finishedAt": "2025-11-07T14:12:10.744Z",
    "outputRef": "sandbox"
  }
}
```

## Smoke Test

1. Apply migration `017_playbook_bindings.sql` (gateway DB).
2. Restart gateway + enrichment.
3. Create a high-severity rule.
4. In Rule Editor, add a binding:
   - Playbook: “IP Enrichment”.
   - Mode: `dry_run`.
   - Guardrails: `maxPerMinute=10`, `maxConcurrent=2`, `dailyQuota=100`.
5. Trigger alerts (e.g., send 3 matching events via ontology ingest).
6. Observe:
   - Alert drawer → Bindings tab shows dry_run decisions.
   - Delivery trace displays playbook run timeline.
   - Manual “Run now” executes playbook and audit logs `ran` decision.
   - Metrics (`curl http://localhost:8088/metrics | grep playbook_binding_`) show incremented counters.

## Follow-Ups / Enhancements

- Replay WebSocket events into alert drawer for real-time updates.
- Attach sandbox output as structured alert note for `dry_run` decisions.
- Guardrail presets & templates (e.g., `SOC High`, `Critical Edge`).
- Binding groups / fallbacks for multi-playbook orchestration.
