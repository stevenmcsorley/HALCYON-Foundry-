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
