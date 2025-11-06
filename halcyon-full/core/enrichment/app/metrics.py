from prometheus_client import Counter, Histogram

# HTTP request duration histogram
http_request_duration = Histogram(
    "halcyon_http_request_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
)

# Enrichment operations counter
enrichment_operations = Counter(
    "halcyon_enrichment_operations_total",
    "Total number of enrichment operations",
    ["type", "status"],
)

# Phase 6C: Enrichment & Playbooks metrics
enrich_runs_total = Counter(
    "enrich_runs_total",
    "Total enrichment action runs",
    ["action", "status"],
)

enrich_latency_seconds = Histogram(
    "enrich_latency_seconds",
    "Enrichment action latency in seconds",
    ["action"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

playbook_runs_total = Counter(
    "playbook_runs_total",
    "Total playbook runs",
    ["playbook", "status"],
)

playbook_step_fail_total = Counter(
    "playbook_step_fail_total",
    "Total playbook step failures",
    ["playbook", "step"],
)

# Phase 7A: Playbook Studio metrics
playbook_drafts_total = Counter(
    "playbook_drafts_total",
    "Total playbook drafts created",
    ["status"],  # draft, published
)

playbook_publish_total = Counter(
    "playbook_publish_total",
    "Total playbook publishes",
    ["user"],
)

playbook_rollback_total = Counter(
    "playbook_rollback_total",
    "Total playbook rollbacks",
    ["user"],
)

playbook_test_runs_total = Counter(
    "playbook_test_runs_total",
    "Total playbook test runs",
    ["result"],  # success, failed
)

playbook_ai_drafts_total = Counter(
    "playbook_ai_drafts_total",
    "Total AI-generated playbook drafts",
    ["result"],  # success, failed
)
