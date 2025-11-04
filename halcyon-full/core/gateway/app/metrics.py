from prometheus_client import Counter, Histogram, Gauge

# HTTP request duration histogram
http_request_duration = Histogram(
    "halcyon_http_request_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
)

# WebSocket connections gauge
ws_connections = Gauge(
    "halcyon_ws_connections",
    "Number of active WebSocket connections",
)

# Entity upsert counter
entity_upserts = Counter(
    "halcyon_entity_upserts_total",
    "Total number of entity upserts",
    ["status"],
)

# Relationship upsert counter
relationship_upserts = Counter(
    "halcyon_relationship_upserts_total",
    "Total number of relationship upserts",
    ["status"],
)

# Policy evaluation duration
policy_eval_duration = Histogram(
    "halcyon_policy_eval_seconds",
    "Policy evaluation duration in seconds",
    ["decision"],
)
