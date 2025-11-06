#!/bin/bash
# Test script for alerts, rules, silences, maintenance, and ML suggestions

set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8088}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8089}"
REALM="${REALM:-halcyon-dev}"
CLIENT_ID="${CLIENT_ID:-halcyon-ui}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin}"

# Wait for Keycloak to be ready
echo "⏳ Waiting for Keycloak to be ready..."
for i in {1..30}; do
  if curl -sS "${KEYCLOAK_URL}/realms/${REALM}/.well-known/openid-configuration" >/dev/null 2>&1; then
    echo "✅ Keycloak is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Keycloak not ready after 60 seconds"
    exit 1
  fi
  sleep 2
done

# Get auth token via login (same as UI does - using discovery endpoint)
echo "🔐 Logging in to get auth token..."
echo "⏳ Waiting for Keycloak to fully initialize (this may take 30-60 seconds)..."
sleep 30  # Give Keycloak significant time to fully initialize and import realm

# Get discovery document to find token endpoint (like UI does)
DISCOVERY=$(curl -sS "${KEYCLOAK_URL}/realms/${REALM}/.well-known/openid-configuration")
TOKEN_URL=$(echo "$DISCOVERY" | jq -r '.token_endpoint')

if [ -z "$TOKEN_URL" ] || [ "$TOKEN_URL" == "null" ]; then
  echo "❌ Failed to get token endpoint from discovery"
  exit 1
fi

# Retry login a few times in case Keycloak is still initializing
MAX_RETRIES=5
for i in $(seq 1 $MAX_RETRIES); do
  # Login using password grant (same as UI)
  TOKEN_RESPONSE=$(curl -sS -X POST "$TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=${CLIENT_ID}" \
    -d "username=${USERNAME}" \
    -d "password=${PASSWORD}" 2>&1)

  TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token' 2>/dev/null)

  if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
    echo "✅ Token obtained (attempt $i/$MAX_RETRIES)"
    break
  fi
  
  if [ $i -lt $MAX_RETRIES ]; then
    echo "⚠️  Login attempt $i failed, retrying in 3 seconds..."
    sleep 3
  else
    echo "❌ Failed to get token after $MAX_RETRIES attempts"
    echo "Response:"
    echo "$TOKEN_RESPONSE" | jq . 2>/dev/null || echo "$TOKEN_RESPONSE"
    exit 1
  fi
done

AUTH_HEADER="Authorization: Bearer $TOKEN"

# Function to make GraphQL request
graphql() {
  local query="$1"
  local variables="${2:-{}}"
  curl -sS -X POST "${GATEWAY_URL}/graphql" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$query\",\"variables\":$variables}" | jq .
}

# Function to make REST request
rest() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [ -z "$data" ]; then
    curl -sS -X "$method" "${GATEWAY_URL}${path}" \
      -H "$AUTH_HEADER" | jq .
  else
    curl -sS -X "$method" "${GATEWAY_URL}${path}" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "$data" | jq .
  fi
}

echo ""
echo "📋 Step 1: Create Alert Rules"
echo "=============================="

# Rule 1: High severity events
echo "Creating rule: High severity events..."
RULE1=$(rest POST "/alerts/rules" '{
  "name": "High Severity Events",
  "description": "Triggers on high severity events",
  "conditionJson": {
    "match": {
      "type": "Event",
      "attrs.severity": "high"
    },
    "window": "5m",
    "threshold": 1,
    "message": "High severity event detected: ${attrs.message}"
  },
  "severity": "high",
  "enabled": true,
  "muteSeconds": 300,
  "fingerprintTemplate": "${type}:${attrs.source}:${attrs.severity}",
  "correlationKeys": ["type", "attrs.source"]
}')
RULE1_ID=$(echo "$RULE1" | jq -r '.id')
echo "✅ Rule 1 created: ID=$RULE1_ID"

# Rule 2: Medium severity burst
echo "Creating rule: Medium severity burst..."
RULE2=$(rest POST "/alerts/rules" '{
  "name": "Medium Severity Burst",
  "description": "Triggers when 3+ medium severity events in 2 minutes",
  "conditionJson": {
    "match": {
      "type": "Event",
      "attrs.severity": "medium"
    },
    "window": "2m",
    "threshold": 3,
    "group_by": "attrs.source",
    "message": "Medium severity burst from ${attrs.source}"
  },
  "severity": "medium",
  "enabled": true,
  "muteSeconds": 180,
  "fingerprintTemplate": "${type}:${attrs.source}:${attrs.severity}",
  "correlationKeys": ["type", "attrs.source"]
}')
RULE2_ID=$(echo "$RULE2" | jq -r '.id')
echo "✅ Rule 2 created: ID=$RULE2_ID"

# Rule 3: Critical security breach
echo "Creating rule: Critical security breach..."
RULE3=$(rest POST "/alerts/rules" '{
  "name": "Critical Security Breach",
  "description": "Triggers on critical security keywords",
  "conditionJson": {
    "match": {
      "type": "Event",
      "attrs.message": {
        "$regex": "breach|critical|security|intrusion"
      }
    },
    "window": "1m",
    "threshold": 1,
    "message": "Critical security event: ${attrs.message}"
  },
  "severity": "high",
  "enabled": true,
  "muteSeconds": 600,
  "fingerprintTemplate": "${type}:${attrs.message}",
  "correlationKeys": ["type"]
}')
RULE3_ID=$(echo "$RULE3" | jq -r '.id')
echo "✅ Rule 3 created: ID=$RULE3_ID"

echo ""
echo "📨 Step 2: Trigger Alerts via Events"
echo "====================================="

# Event 1: High severity - should trigger Rule 1
echo "Triggering high severity event (should create alert)..."
EVENT1=$(graphql "mutation(\$input: [EntityInput!]!) { upsertEntities(input: \$input) { upsertedIds } }" '{
  "input": [{
    "id": "test-event-high-1",
    "type": "Event",
    "attrs": {
      "source": "edge-1",
      "severity": "high",
      "message": "High severity test event for alert creation",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }]
}')
echo "✅ Event 1 created"

# Event 2: Medium severity - should trigger Rule 2 after 3 events
echo "Triggering medium severity events (3 events for burst)..."
for i in {1..3}; do
  EVENT=$(graphql "mutation(\$input: [EntityInput!]!) { upsertEntities(input: \$input) { upsertedIds } }" "{
    \"input\": [{
      \"id\": \"test-event-medium-$i\",
      \"type\": \"Event\",
      \"attrs\": {
        \"source\": \"edge-2\",
        \"severity\": \"medium\",
        \"message\": \"Medium severity test event #$i for burst detection\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }
    }]
  }")
  echo "  ✅ Medium event #$i created"
  sleep 1
done

# Event 3: Critical security event - should trigger Rule 3
echo "Triggering critical security event..."
EVENT3=$(graphql "mutation(\$input: [EntityInput!]!) { upsertEntities(input: \$input) { upsertedIds } }" '{
  "input": [{
    "id": "test-event-critical-1",
    "type": "Event",
    "attrs": {
      "source": "firewall-1",
      "severity": "high",
      "message": "Critical security breach detected in production system",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }]
}')
echo "✅ Event 3 created"

sleep 2

echo ""
echo "📊 Step 3: Check Alerts Created"
echo "================================"
ALERTS=$(rest GET "/alerts?status=open&limit=10")
ALERT_COUNT=$(echo "$ALERTS" | jq '. | length')
echo "✅ Found $ALERT_COUNT open alerts"
echo "$ALERTS" | jq '.[] | {id, message, severity, status, rule_id}'

echo ""
echo "🔕 Step 4: Create Silence"
echo "=========================="
SILENCE=$(rest POST "/silences" '{
  "name": "Test Silence - Edge-2",
  "matchJson": {
    "type": "Event",
    "attrs.source": "edge-2"
  },
  "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "endsAt": "'$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)'",
  "reason": "Testing silence functionality - suppressing edge-2 alerts",
  "createdBy": "test-script"
}')
SILENCE_ID=$(echo "$SILENCE" | jq -r '.id')
echo "✅ Silence created: ID=$SILENCE_ID"

# Trigger another event from edge-2 (should be suppressed)
echo "Triggering event from edge-2 (should be suppressed)..."
EVENT_SUPPRESSED=$(graphql "mutation(\$input: [EntityInput!]!) { upsertEntities(input: \$input) { upsertedIds } }" '{
  "input": [{
    "id": "test-event-suppressed-1",
    "type": "Event",
    "attrs": {
      "source": "edge-2",
      "severity": "high",
      "message": "This should be suppressed by silence",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }]
}')
echo "✅ Suppressed event created (should not create alert)"

sleep 2

echo ""
echo "🔧 Step 5: Create Maintenance Window"
echo "====================================="
MAINTENANCE=$(rest POST "/maintenance" '{
  "name": "Test Maintenance Window",
  "matchJson": {
    "type": "Event",
    "attrs.source": "firewall-1"
  },
  "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "endsAt": "'$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)'",
  "reason": "Testing maintenance window - suppressing firewall-1 alerts",
  "createdBy": "test-script"
}')
MAINTENANCE_ID=$(echo "$MAINTENANCE" | jq -r '.id')
echo "✅ Maintenance window created: ID=$MAINTENANCE_ID"

# Trigger another event from firewall-1 (should be suppressed)
echo "Triggering event from firewall-1 (should be suppressed)..."
EVENT_MAINT=$(graphql "mutation(\$input: [EntityInput!]!) { upsertEntities(input: \$input) { upsertedIds } }" '{
  "input": [{
    "id": "test-event-maintenance-1",
    "type": "Event",
    "attrs": {
      "source": "firewall-1",
      "severity": "high",
      "message": "This should be suppressed by maintenance window",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }]
}')
echo "✅ Maintenance event created (should not create alert)"

sleep 2

echo ""
echo "📋 Step 6: List All Alerts"
echo "==========================="
ALL_ALERTS=$(rest GET "/alerts?limit=20")
echo "$ALL_ALERTS" | jq '.[] | {id, message, severity, status, suppressed_by_kind, suppressed_by_id}'

echo ""
echo "✅ Test Data Created!"
echo "===================="
echo "Rules: $RULE1_ID, $RULE2_ID, $RULE3_ID"
echo "Silence: $SILENCE_ID"
echo "Maintenance: $MAINTENANCE_ID"
echo ""
echo "Next steps:"
echo "1. Go to Alerts page to see created alerts"
echo "2. Test creating cases from alerts"
echo "3. Verify ML suggestions appear in cases"
echo "4. Check silences and maintenance windows tabs"

