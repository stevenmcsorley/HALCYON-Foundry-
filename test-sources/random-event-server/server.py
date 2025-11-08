#!/usr/bin/env python3
"""
Random Event Test Server
------------------------

This lightweight HTTP server simulates an external datasource that emits
randomised observability/security events. Use it to exercise HALCYON
Datasource Studio connectors (e.g. HTTP pollers or webhooks) without
requiring access to real systems.

Endpoints
~~~~~~~~~
- GET /events      → returns a JSON array of random event objects
- GET /healthz     → returns { "status": "ok" } for liveness checks

Usage
~~~~~
    python server.py

By default the server listens on localhost:1997. Override via the
environment variables RANDOM_EVENT_HOST / RANDOM_EVENT_PORT.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import random
import socket
import string
import threading
import time
import uuid

HOST = os.getenv("RANDOM_EVENT_HOST", "127.0.0.1")
PORT = int(os.getenv("RANDOM_EVENT_PORT", "1997"))

# Example data pools
ENTITY_TYPES = ["Endpoint", "User", "Service", "Device"]
SEVERITIES = ["low", "medium", "high", "critical"]
REGIONS = ["us-east-1", "us-west-2", "eu-central-1", "ap-southeast-1"]
SOURCE_SYSTEMS = ["firewall", "ids", "siem", "edr"]
TAGS = ["production", "staging", "workstation", "kubernetes", "vpn"]


def random_ip() -> str:
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


def random_hostname() -> str:
    prefix = "".join(random.choices(string.ascii_lowercase, k=6))
    domain = random.choice(["corp", "cloud", "internal", "edge"])
    tld = random.choice(["local", "lan", "example"])
    return f"{prefix}.{domain}.{tld}"


def random_event() -> dict:
    event_id = str(uuid.uuid4())
    now = time.time()
    severity = random.choice(SEVERITIES)
    payload = {
        "eventId": event_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "entity": {
            "id": random_hostname(),
            "type": random.choice(ENTITY_TYPES),
            "ip": random_ip(),
        },
        "source": {
            "system": random.choice(SOURCE_SYSTEMS),
            "region": random.choice(REGIONS),
        },
        "severity": severity,
        "score": round(random.uniform(0.1, 0.99), 2),
        "tags": random.sample(TAGS, k=random.randint(1, min(3, len(TAGS)))),
        "message": f"{severity.title()} signal detected on {random_hostname()}",
    }
    # Occasionally attach extra fields
    if random.random() > 0.6:
        payload["ioc"] = {
            "hash": uuid.uuid4().hex,
            "confidence": round(random.uniform(0.3, 0.95), 2),
        }
    return payload


class RandomEventHandler(BaseHTTPRequestHandler):
    server_version = "RandomEventHTTP/1.0"

    def _send_json(self, payload: dict | list, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        # Reduce console noise: log to stdout with timestamp + client info
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        message = format % args
        print(f"[{timestamp}] {self.client_address[0]}:{self.client_address[1]} {message}")

    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") == "/healthz":
            self._send_json({"status": "ok"})
            return

        if self.path.rstrip("/") == "/events":
            batch_size = random.randint(5, 12)
            events = [random_event() for _ in range(batch_size)]
            self._send_json({"events": events, "batchSize": batch_size})
            return

        self._send_json({"error": "Not found"}, status=404)


def run_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((HOST, PORT), RandomEventHandler)
    sa = server.socket.getsockname()
    print(f"Random Event Test Server listening on http://{sa[0]}:{sa[1]}")
    print("Endpoints: /healthz, /events")

    def serve():
        with server:
            server.serve_forever()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    return server


if __name__ == "__main__":
    try:
        srv = run_server()
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nShutting down random event server...")
        srv.shutdown()

