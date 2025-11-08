# Random Event Test Server

This lightweight HTTP service simulates an external datasource that emits
random observability/security events. It is useful when exercising
Halcyon's Datasource Studio without needing access to a real log feed.

## Features

- **GET `/events`** – returns a JSON payload containing a batch of randomised events.
- **GET `/healthz`** – simple health probe that returns `{ "status": "ok" }`.
- Randomised attributes include entity type, source system, severity,
  tags, scores, and optional IoC hashes.
- Configurable host/port via the `RANDOM_EVENT_HOST` / `RANDOM_EVENT_PORT`
  environment variables (defaults to `127.0.0.1:1997`).

## Running locally

The server only relies on Python's standard library.

```bash
cd test-sources/random-event-server
python server.py
```

You should see:

```
Random Event Test Server listening on http://127.0.0.1:1997
Endpoints: /healthz, /events
```

Visit http://127.0.0.1:1997/events to confirm JSON output.

To change the port:

```bash
RANDOM_EVENT_PORT=2999 python server.py
```

## Integrating with Datasource Studio

1. Run the server locally (`python server.py`).
2. In Halcyon UI → Datasource Studio, create a new datasource with:
   - **Type:** `http_poller`
   - **Connector config** (example):

     ```json
     {
       "connector": {
         "type": "http_poller",
         "endpoint": "http://127.0.0.1:1997/events",
         "schedule": "every 30s",
         "mapping": {}
       },
       "mapping": {
         "entity_type": "Endpoint",
         "attrs": {
           "ip": "$.events[0].entity.ip",
           "hostname": "$.events[0].entity.id"
         }
       }
     }
     ```

   - Adjust to match whichever schema you expect.
3. Publish the datasource version and start the connector; you should see
   events being ingested.

Feel free to extend `server.py` with additional endpoints or custom
schemas to fit other scenario testing needs.

