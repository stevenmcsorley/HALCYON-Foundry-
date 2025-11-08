#!/usr/bin/env python3
"""
Industry 4.0 / OT anomaly simulator.

Provides a lightweight HTTP API that emits synthetic IoT sensor events with
pre-calculated anomaly scores. Designed to drive HALCYON datasource flows that
ingest via HTTP poller (can be proxied by MQTT/Kafka connectors in future).
"""

from __future__ import annotations

import json
import math
import os
import random
import threading
import time
import uuid
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, List

HOST = os.getenv("IOT_SERVER_HOST", "0.0.0.0")
PORT = int(os.getenv("IOT_SERVER_PORT", "2997"))
BATCH_MIN = int(os.getenv("IOT_BATCH_MIN", "1"))
BATCH_MAX = int(os.getenv("IOT_BATCH_MAX", "1"))
if BATCH_MAX < BATCH_MIN:
    BATCH_MAX = BATCH_MIN

NOW = time.time


@dataclass(frozen=True)
class Sensor:
    sensor_id: str
    machine_id: str
    machine_type: str
    facility: str
    line: str
    lat: float
    lon: float
    floor: str
    metrics: Dict[str, Dict[str, float]]


SENSORS: List[Sensor] = [
    Sensor(
        sensor_id="FLOOR-L2-LATHE-07",
        machine_id="LATHE-07",
        machine_type="CNC Lathe",
        facility="Prague Assembly Plant",
        line="Line A",
        lat=50.1109,
        lon=14.2757,
        floor="L2",
        metrics={
            "temperature_c": {"mean": 62.0, "std": 3.5},
            "vibration_mm_s": {"mean": 3.2, "std": 0.6},
            "current_amp": {"mean": 28.0, "std": 4.0},
        },
    ),
    Sensor(
        sensor_id="FLOOR-L1-ROBOT-12",
        machine_id="ROBOT-12",
        machine_type="Welding Robot",
        facility="Prague Assembly Plant",
        line="Line C",
        lat=50.1115,
        lon=14.2792,
        floor="L1",
        metrics={
            "temperature_c": {"mean": 54.0, "std": 2.3},
            "hydraulic_bar": {"mean": 175.0, "std": 7.0},
            "cycle_time_ms": {"mean": 1380.0, "std": 45.0},
        },
    ),
    Sensor(
        sensor_id="PAINT-L3-HVAC-05",
        machine_id="HVAC-05",
        machine_type="Clean-room HVAC",
        facility="Brno Coating Center",
        line="Paint Zone",
        lat=49.1951,
        lon=16.6080,
        floor="L3",
        metrics={
            "temperature_c": {"mean": 21.5, "std": 1.0},
            "humidity_pct": {"mean": 41.0, "std": 3.5},
            "voc_ppm": {"mean": 290.0, "std": 40.0},
        },
    ),
    Sensor(
        sensor_id="PRESS-L1-HYD-02",
        machine_id="PRESS-02",
        machine_type="Hydraulic Press",
        facility="Gdansk Forging Hub",
        line="Forge Line 1",
        lat=54.3520,
        lon=18.6466,
        floor="L1",
        metrics={
            "temperature_c": {"mean": 68.5, "std": 4.2},
            "pressure_bar": {"mean": 310.0, "std": 12.0},
            "stroke_count": {"mean": 820.0, "std": 70.0},
        },
    ),
]


ANOMALY_CAUSES = [
    ("bearing_wear", "Potential bearing wear detected — inspect spindle lubrication"),
    ("hydraulic_leak", "Hydraulic pressure drop detected — check for leaks in feed line"),
    ("overheat", "Temperature climb beyond baseline — inspect cooling system"),
    ("misalignment", "Motion profile deviation — verify alignment and recalibrate"),
    ("clogged_filter", "VOC level spike — replace air filtration cartridge"),
]

OPS_TEAMS = [
    "Factory Floor Ops - Shift A",
    "Factory Floor Ops - Shift B",
    "Predictive Maintenance Crew",
    "Industrial Engineering Response",
]

CHECKLISTS = {
    "bearing_wear": [
        "Pause machine and allow to cool for 5 minutes",
        "Inspect spindle bearing lubrication level",
        "Collect vibration readings post-inspection",
    ],
    "hydraulic_leak": [
        "Engage hydraulic isolation",
        "Inspect pressure manifolds for leaks",
        "Top up hydraulic fluid reservoir",
    ],
    "overheat": [
        "Switch to backup cooling circuit",
        "Verify coolant pump RPM",
        "Log temperature trend for 15 minutes",
    ],
    "misalignment": [
        "Run auto-alignment check",
        "Validate robot arm torque calibration",
        "Schedule precision recalibration if deviation persists",
    ],
    "clogged_filter": [
        "Inspect filter differential pressure gauge",
        "Swap HEPA/carbon cartridges if over limit",
        "Record VOC readings after reset",
    ],
}


def iso_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW()))


def gaussian_value(mean: float, std: float, volatility: float = 1.0) -> float:
    return random.gauss(mean, std * volatility)


def compute_zscore(value: float, mean: float, std: float) -> float:
    if std == 0:
        return 0.0
    return (value - mean) / std


def anomaly_severity(zscore: float, detector_score: float) -> str:
    combined = abs(zscore) * 0.6 + detector_score * 0.4
    if combined >= 2.8:
        return "critical"
    if combined >= 1.8:
        return "high"
    if combined >= 1.2:
        return "medium"
    return "low"


def random_trend() -> str:
    return random.choices(["stable", "rising", "falling"], weights=[0.4, 0.4, 0.2])[0]


def generate_metrics(sensor: Sensor) -> Dict[str, Dict[str, float | str]]:
    # Introduce volatility bursts
    volatility = random.uniform(1.0, 1.8)
    metrics: Dict[str, Dict[str, float | str]] = {}
    for metric, spec in sensor.metrics.items():
        value = gaussian_value(spec["mean"], spec["std"], volatility)
        zscore = compute_zscore(value, spec["mean"], spec["std"])
        metrics[metric] = {
            "value": round(value, 3),
            "baseline": spec["mean"],
            "zScore": round(zscore, 3),
            "trend": random_trend(),
        }
    return metrics


def isolation_forest_score(metrics: Dict[str, Dict[str, float | str]]) -> float:
    # synthetic isolation forest score correlated with average |z|
    zscores = [abs(metric["zScore"]) for metric in metrics.values()]
    avg_z = sum(zscores) / max(len(zscores), 1)
    jitter = random.uniform(0.1, 0.6)
    return round(min(3.5, avg_z + jitter), 3)


def anomaly_payload(sensor: Sensor) -> Dict[str, object]:
    metric_values = generate_metrics(sensor)

    # Pick top metric by absolute z-score to describe anomaly
    primary_metric = max(metric_values.items(), key=lambda item: abs(item[1]["zScore"]))
    metric_name, metric_info = primary_metric
    detector_score = isolation_forest_score(metric_values)
    severity = anomaly_severity(metric_info["zScore"], detector_score)
    cause_key, cause_description = random.choice(ANOMALY_CAUSES)

    event_id = str(uuid.uuid4())
    timestamp = iso_timestamp()

    checklist_base = CHECKLISTS.get(cause_key, [])
    checklist = [
        {
            "step": idx + 1,
            "description": item,
            "status": "pending",
        }
        for idx, item in enumerate(checklist_base)
    ]

    return {
        "eventId": event_id,
        "timestamp": timestamp,
        "scenario": "Industry4.0::Sensor Anomaly",
        "eventType": "industry4.0.anomaly",
        "summary": (
            f"{sensor.machine_type} ({sensor.machine_id}) anomaly on {metric_name.replace('_', ' ')} "
            f"with z-score {metric_info['zScore']:.2f} at {sensor.facility}"
        ),
        "tags": ["industry4.0", "anomaly", sensor.machine_type.lower(), cause_key],
        "severity": severity,
        "anomaly": {
            "detector": "isolation_forest",
            "score": detector_score,
            "zScore": round(metric_info["zScore"], 3),
            "primaryMetric": metric_name,
            "persistenceSeconds": random.randint(90, 360),
        },
        "sensor": {
            "id": sensor.sensor_id,
            "machineId": sensor.machine_id,
            "machineType": sensor.machine_type,
            "facility": sensor.facility,
            "line": sensor.line,
            "floor": sensor.floor,
            "latitude": sensor.lat,
            "longitude": sensor.lon,
        },
        "metrics": metric_values,
        "thresholds": {
            metric: {
                "upper": round(spec["mean"] + 2.5 * spec["std"], 3),
                "lower": round(spec["mean"] - 2.5 * spec["std"], 3),
            }
            for metric, spec in sensor.metrics.items()
        },
        "cause": {
            "key": cause_key,
            "description": cause_description,
        },
        "notifications": {
            "opsTeam": random.choice(OPS_TEAMS),
            "channel": random.choice(["slack", "pagerduty", "email"]),
        },
        "recommended": {
            "actions": [
                "notify_operations",
                "apply_condition_based_maintenance",
                "log_event_in_mes",
            ],
            "checklist": checklist,
            "playbookId": f"pb-{cause_key}",
        },
        "caseTemplate": {
            "title": f"{severity.title()} anomaly for {sensor.machine_id}",
            "summary": f"{sensor.machine_type} reported anomaly on {metric_name}",
            "priority": "P1" if severity in {"critical", "high"} else "P2",
            "assignment": random.choice(
                ["Maintenance Tier 1", "Maintenance Tier 2", "Operations Command"]
            ),
        },
        "geo": {
            "lat": sensor.lat,
            "lon": sensor.lon,
            "floor": sensor.floor,
        },
    }


class IoTEventHandler(BaseHTTPRequestHandler):
    server_version = "Industry4Test/1.0"

    def _write_json(self, payload: Dict[str, object] | List[Dict[str, object]], status: int = 200) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        message = fmt % args
        print(f"[{timestamp}] {self.client_address[0]}:{self.client_address[1]} {message}")

    def do_GET(self) -> None:  # noqa: N802
        clean_path = self.path.rstrip("/")
        if clean_path == "/healthz":
            self._write_json({"status": "ok"})
            return

        if clean_path == "/events":
            batch_size = random.randint(BATCH_MIN, BATCH_MAX)
            events = [anomaly_payload(random.choice(SENSORS)) for _ in range(batch_size)]
            self._write_json(events)
            return

        self._write_json({"error": "Not Found"}, status=404)


def run_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((HOST, PORT), IoTEventHandler)
    addr = server.socket.getsockname()
    print(f"IoT Industry 4.0 Test Server listening on http://{addr[0]}:{addr[1]}")
    print("Endpoints: GET /healthz, GET /events")

    def serve() -> None:
        with server:
            server.serve_forever()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    return server


def main() -> None:
    run_server()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("Shutting down IoT test server...")


if __name__ == "__main__":
    # Start service
    main()

