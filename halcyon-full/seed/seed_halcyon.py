#!/usr/bin/env python3
"""
HALCYON Foundry — Initial Seed Script
Pushes canonical entity and relationship examples via Gateway GraphQL API.
Run this once after stack boot.
"""

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
    print("🌐 Checking Gateway health...")
    q = "query { health }"
    print("✅", gql(q)["health"])

    print("📦 Seeding entities...")
    m_entities = """
    mutation($input:[EntityInput!]!){
      upsertEntities(input:$input)
    }"""
    entities = [
        {
            "id": "asset-001",
            "type": "Asset",
            "attrs": {
                "name": "Web Server A",
                "ip": "192.168.1.10",
                "status": "online"
            }
        },
        {
            "id": "event-001",
            "type": "Event",
            "attrs": {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "message": "HTTP anomaly detected",
                "severity": "high"
            }
        },
        {
            "id": "loc-glasgow",
            "type": "Location",
            "attrs": {
                "name": "Glasgow",
                "lat": 55.86,
                "lon": -4.25
            }
        }
    ]
    gql(m_entities, {"input": entities})
    print("✅ Entities inserted.")

    print("🔗 Seeding relationships...")
    m_rels = """
    mutation($input:[RelationshipInput!]!){
      upsertRelationships(input:$input)
    }"""
    rels = [
        {"type": "AFFECTS", "fromId": "event-001", "toId": "asset-001", "attrs": {}},
        {"type": "NEAR", "fromId": "event-001", "toId": "loc-glasgow", "attrs": {}}
    ]
    gql(m_rels, {"input": rels})
    print("✅ Relationships inserted.")

    print("🎉 HALCYON ontology successfully seeded!")

if __name__ == "__main__":
    main()
