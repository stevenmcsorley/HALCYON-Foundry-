## Industry 4.0 / OT Anomaly Datasource

Two ready-to-use configurations are provided:

1. `config.json` – polling a locally hosted simulator (run with `IOT_SERVER_HOST=0.0.0.0 IOT_SERVER_PORT=2997 IOT_BATCH_MIN=1 IOT_BATCH_MAX=1 python3 server.py`).
2. `external-config.json` – polling a public dataset hosted on GitHub over HTTPS (no local server required).

### External datasource (no local server)

- Endpoint: `https://raw.githubusercontent.com/stevenmcsorley/HALCYON-Foundry-/main/test-sources/iot-anomaly-server/sample_data.json`
- Update cadence: every 60 seconds (configurable).
- Delivers Industry 4.0 anomaly events with sensor metadata, anomaly scores, recommended actions, and case templates.

### Simulator (optional)

Run locally if you want dynamic, randomly generated events:

```bash
cd /home/dev/projects/HALCYON/test-sources/iot-anomaly-server
IOT_SERVER_HOST=0.0.0.0 IOT_SERVER_PORT=2997 IOT_BATCH_MIN=1 IOT_BATCH_MAX=1 python3 server.py
```

Poll the simulator via `config.json` which points to `http://host.docker.internal:2997/events` so Docker services can ingest host traffic. Adjust `IOT_BATCH_MIN` / `IOT_BATCH_MAX` if you want bursts instead of single events.

### Datasource creation tips

- Use the HTTP Poller connector.
- For the external dataset, load `external-config.json` on the datasource “Import Config” dialog.
- Ensure the mapping fields are preserved so alerts, dashboards, and cases have sensor context (location, metrics, checklist).


