# Grafana Dashboard Panels for Phase 6C Enrichment

## Quick Panel Queries

### Enrichment Runs (Success/Fail)
```promql
sum by(action,status) (increase(enrich_runs_total[1h]))
```

**Panel Type:** Bar chart or time series  
**Y-axis:** Count  
**X-axis:** Action + Status  
**Legend:** `{{action}} - {{status}}`

### Playbook Success Ratio
```promql
sum by(playbook,status) (increase(playbook_runs_total[1h]))
```

**Panel Type:** Bar chart  
**Y-axis:** Count  
**X-axis:** Playbook + Status  
**Legend:** `{{playbook}} - {{status}}`

### Latency P95 (per action)
```promql
histogram_quantile(0.95, sum by (le,action)(rate(enrich_latency_seconds_bucket[5m])))
```

**Panel Type:** Time series  
**Y-axis:** Seconds (latency)  
**X-axis:** Time  
**Legend:** `{{action}} - p95`

### Playbook Step Failure Rate
```promql
sum by(playbook,step) (increase(playbook_step_fail_total[1h]))
```

**Panel Type:** Bar chart  
**Y-axis:** Count  
**X-axis:** Playbook + Step  
**Legend:** `{{playbook}} - {{step}}`

### Enrichment Rate (requests per minute)
```promql
sum(rate(enrich_runs_total[1m])) * 60
```

**Panel Type:** Stat panel  
**Unit:** req/min

### Average Playbook Duration
```promql
avg(playbook_duration_seconds)
```

**Panel Type:** Stat panel  
**Unit:** seconds

## Dashboard Setup

1. **Create new dashboard**: "Enrichment & Playbooks"
2. **Add Prometheus data source**: `http://prometheus:9090`
3. **Add panels** using queries above
4. **Set refresh interval**: 30s
5. **Add variables** (optional):
   - `action`: Label values from `enrich_runs_total`
   - `playbook`: Label values from `playbook_runs_total`

## Metrics Available

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `enrich_runs_total` | Counter | `action`, `status` | Total enrichment runs |
| `enrich_latency_seconds_bucket` | Histogram | `action`, `le` | Latency distribution |
| `playbook_runs_total` | Counter | `playbook`, `status` | Total playbook runs |
| `playbook_step_fail_total` | Counter | `playbook`, `step` | Failed playbook steps |
| `playbook_duration_seconds` | Gauge | `playbook` | Playbook execution time |

## Health Check Metrics

- **Service Health**: `GET http://enrichment:8091/health`
- **Readiness**: `GET http://enrichment:8091/health/ready`
- **Metrics**: `GET http://enrichment:8091/metrics`

## Access Grafana

- **URL**: http://localhost:3000 (mapped from `grafana:3000`)
- **Default credentials**: `admin` / `admin` (change on first login)

