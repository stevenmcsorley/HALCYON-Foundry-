from prometheus_client import Counter, Histogram

# HTTP request duration histogram
http_request_duration = Histogram(
    "halcyon_http_request_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
)

# Plugin registration counter
plugin_registrations = Counter(
    "halcyon_plugin_registrations_total",
    "Total number of plugin registrations",
    ["status"],
)
