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
