from prometheus_client import Counter, Histogram

# HTTP request duration histogram
http_request_duration = Histogram(
    "halcyon_http_request_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
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
