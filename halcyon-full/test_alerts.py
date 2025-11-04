#!/usr/bin/env python3
"""Quick test script to generate events that trigger alerts"""
import requests
import json
import time

GQL_ENDPOINT = "http://localhost:8088/graphql"

def gql(query, variables=None):
    r = requests.post(GQL_ENDPOINT, json={"query": query, "variables": variables or {}})
    r.raise_for_status()
    j = r.json()
    if "errors" in j:
        raise RuntimeError(j["errors"])
    return j["data"]

def main():
    print("🚀 Generating test events to trigger alerts...")
    
    mutation = """
    mutation($input:[EntityInput!]!){
      upsertEntities(input:$input)
    }
    """
    
    # Generate 5 high-severity events from same source
    events = []
    for i in range(5):
        events.append({
            "id": f"test-event-{int(time.time())}-{i}",
            "type": "Event",
            "attrs": {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "message": f"Test high severity event {i+1}",
                "severity": "high",
                "source": "test-source-alpha"
            }
        })
        time.sleep(0.5)  # Small delay between events
    
    print(f"  Creating {len(events)} high-severity events from same source...")
    result = gql(mutation, {"input": events})
    print(f"✅ Events created: {result}")
    
    print("\n⏳ Waiting 3 seconds for rule evaluation...")
    time.sleep(3)
    
    # Check for alerts
    print("\n📋 Checking for generated alerts...")
    alerts_r = requests.get("http://localhost:8088/alerts")
    if alerts_r.status_code == 200:
        alerts = alerts_r.json()
        print(f"✅ Found {len(alerts)} alerts:")
        for alert in alerts[:5]:
            print(f"  - [{alert.get('severity', '?')}] {alert.get('message', '?')} (status: {alert.get('status', '?')})")
    else:
        print(f"❌ Failed to fetch alerts: {alerts_r.status_code}")

if __name__ == "__main__":
    main()
