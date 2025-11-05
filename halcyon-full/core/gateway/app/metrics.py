from prometheus_client import Counter, Histogram, Gauge

# HTTP request metrics
http_request_duration = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
)

# WebSocket metrics
ws_connections = Gauge(
    "ws_connections_total",
    "Current number of WebSocket connections",
)

# Entity/relationship upsert metrics
entity_upserts = Counter(
    "entity_upserts_total",
    "Total number of entity upserts",
    ["entity_type"],
)

relationship_upserts = Counter(
    "relationship_upserts_total",
    "Total number of relationship upserts",
    ["relationship_type"],
)

# Policy evaluation metrics
policy_evaluation_duration = Histogram(
    "policy_evaluation_duration_seconds",
    "Policy evaluation duration in seconds",
)

# Authentication metrics
auth_success_total = Counter(
    "auth_success_total",
    "Total number of successful authentications",
    ["method"],  # method: "jwt", "dev_mode", etc.
)

auth_failure_total = Counter(
    "auth_failure_total",
    "Total number of failed authentication attempts",
    ["reason"],  # reason: "invalid_token", "missing_token", "expired_token", etc.
)

# Alert metrics
alerts_created_total = Counter(
    "alerts_created_total",
    "Total number of alerts created",
    ["rule"],  # rule: rule ID
)

alerts_deduped_total = Counter(
    "alerts_deduped_total",
    "Total number of alerts deduplicated (count updated)",
    ["rule"],  # rule: rule ID
)

alerts_suppressed_total = Counter(
    "alerts_suppressed_total",
    "Total number of alerts suppressed (by silences or maintenance windows)",
    ["kind", "rule"],  # kind: "silence" or "maintenance", rule: rule ID
)

# PR-3: Routing & Retries metrics
alert_notifications_total = Counter(
    "alert_notifications_total",
    "Alert notification attempts",
    ["dest", "status"],  # dest: "slack" or "webhook", status: "success", "retry", or "failed"
)

alert_retry_total = Counter(
    "alert_retry_total",
    "Retries scheduled",
    ["dest"],  # dest: "slack" or "webhook"
)

alert_retry_exhausted_total = Counter(
    "alert_retry_exhausted_total",
    "Retries exhausted for destination",
    ["dest"],  # dest: "slack" or "webhook"
)

# PR-4A: Cases metrics
cases_created_total = Counter(
    "cases_created_total",
    "Total number of cases created",
    ["priority"],  # priority: "low", "medium", "high", "critical"
)

cases_resolved_total = Counter(
    "cases_resolved_total",
    "Total number of cases resolved",
)

alerts_assigned_to_case_total = Counter(
    "alerts_assigned_to_case_total",
    "Total number of alerts assigned to cases",
)

# PR-4B: ML Scoring metrics
ml_inference_total = Counter(
    "ml_inference_total",
    "ML inference attempts",
    ["model", "status"],  # status: "success" or "fail"
)

ml_suggestion_applied_total = Counter(
    "ml_suggestion_applied_total",
    "User applied ML suggestions",
    ["type"],  # type: "priority" or "owner"
)

ml_inference_latency_seconds = Histogram(
    "ml_inference_latency_seconds",
    "ML inference latency (s)",
    ["model"],
)

ml_model_version_info = Gauge(
    "ml_model_version_info",
    "ML model version info",
    ["model", "version"],
)
