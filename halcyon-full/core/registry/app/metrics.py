from prometheus_client import Counter, Gauge, Histogram

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

# Datasource lifecycle metrics
datasource_workers_running = Gauge(
    "halcyon_datasource_workers_running",
    "Number of datasource connectors currently running",
)

datasource_last_sync_timestamp = Gauge(
    "halcyon_datasource_last_sync_timestamp",
    "UNIX timestamp of the last successful datasource registry sync",
)

datasource_lifecycle_events_total = Counter(
    "halcyon_datasource_lifecycle_events_total",
    "Lifecycle events for datasource connectors",
    ["event"],
)

datasource_test_runs_total = Counter(
    "halcyon_datasource_test_runs_total",
    "Datasource test runs executed via sandbox",
    ["result"],
)
