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

# Phase 6B: Delivery Trace & Routing UX metrics
alert_actions_preview_total = Counter(
    "alert_actions_preview_total",
    "Routing preview requests",
    ["result"],  # result: "would_send" or "suppressed"
)

alert_manual_retry_total = Counter(
    "alert_manual_retry_total",
    "Manual retry requests",
    ["dest"],  # dest: "slack" or "webhook"
)

alert_action_next_retry_seconds = Gauge(
    "alert_action_next_retry_seconds",
    "Seconds until next scheduled retry",
    ["dest", "alert_id"],  # dest: "slack" or "webhook"
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

# PR-4C: ML Feedback metrics
ml_suggestion_feedback_total = Counter(
    "ml_suggestion_feedback_total",
    "Total ML suggestion feedback events",
    ["type", "action"],  # type: "priority" or "owner", action: "accepted", "rejected", "overridden"
)

ml_online_update_total = Counter(
    "ml_online_update_total",
    "Total online learning weight updates",
    ["feature"],  # feature: "kw_critical", "owner_alice_history", etc.
)

ml_suggestion_calibration = Histogram(
    "ml_suggestion_calibration",
    "ML suggestion calibration: score vs accepted (0=rejected, 1=accepted)",
    buckets=[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)

# Phase 7B: Playbook auto-binding metrics
playbook_binding_decisions_total = Counter(
    "playbook_binding_decisions_total",
    "Decisions taken for playbook bindings",
    ["mode", "decision"],
)

playbook_binding_runs_total = Counter(
    "playbook_binding_runs_total",
    "Playbook binding runs (dry runs and auto runs)",
    ["mode", "success"],
)

playbook_binding_inflight = Gauge(
    "playbook_binding_inflight",
    "Number of in-flight executions per playbook binding",
    ["binding_id"],
)

playbook_binding_quota_remaining = Gauge(
    "playbook_binding_quota_remaining",
    "Remaining daily quota per playbook binding",
    ["binding_id"],
)

playbook_binding_evaluate_latency_seconds = Histogram(
    "playbook_binding_evaluate_latency_seconds",
    "Latency for evaluating playbook bindings",
    ["mode"],
)
