# Alert Testing Scenarios - Browser-Based Testing Guide

Since Keycloak authentication requires browser login, use this guide to test alert scenarios in the UI.

## Prerequisites
1. Log in to the UI at http://localhost:5173 as admin
2. Open browser console (F12) to run GraphQL mutations

## Step 1: Create Alert Rules

Go to **Alerts → Rules** tab and create these rules:

### Rule 1: High Severity Events
```json
{
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
}
```

### Rule 2: Medium Severity Burst
```json
{
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
}
```

### Rule 3: Critical Security Breach
```json
{
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
}
```

## Step 2: Trigger Events via Console

Open browser console (F12) and run these GraphQL mutations:

```javascript
// Get auth token from localStorage
const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

// Helper function to make GraphQL requests
async function gql(query, variables) {
  const res = await fetch('http://localhost:8088/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

// Event 1: High severity - should trigger Rule 1
await gql(`
  mutation($input: [EntityInput!]!) {
    upsertEntities(input: $input) { upsertedIds }
  }
`, {
  input: [{
    id: "test-event-high-1",
    type: "Event",
    attrs: {
      source: "edge-1",
      severity: "high",
      message: "High severity test event for alert creation",
      timestamp: new Date().toISOString()
    }
  }]
});

// Event 2-4: Medium severity burst (3 events for Rule 2)
for (let i = 1; i <= 3; i++) {
  await gql(`
    mutation($input: [EntityInput!]!) {
      upsertEntities(input: $input) { upsertedIds }
    }
  `, {
    input: [{
      id: `test-event-medium-${i}`,
      type: "Event",
      attrs: {
        source: "edge-2",
        severity: "medium",
        message: `Medium severity test event #${i} for burst detection`,
        timestamp: new Date().toISOString()
      }
    }]
  });
  await new Promise(r => setTimeout(r, 1000));
}

// Event 5: Critical security event - should trigger Rule 3
await gql(`
  mutation($input: [EntityInput!]!) {
    upsertEntities(input: $input) { upsertedIds }
  }
`, {
  input: [{
    id: "test-event-critical-1",
    type: "Event",
    attrs: {
      source: "firewall-1",
      severity: "high",
      message: "Critical security breach detected in production system",
      timestamp: new Date().toISOString()
    }
  }]
});
```

## Step 3: Verify Alerts Created

1. Go to **Alerts → List** tab
2. You should see:
   - 1 alert from Rule 1 (high severity)
   - 1 alert from Rule 2 (medium burst)
   - 1 alert from Rule 3 (critical security)

## Step 4: Test Silences

1. Go to **Alerts → Silences** tab
2. Click **Create Silence**
3. Fill in:
   - Name: "Test Silence - Edge-2"
   - Match JSON: `{"type": "Event", "attrs.source": "edge-2"}`
   - Start: Now
   - End: 1 hour from now
   - Reason: "Testing silence functionality"
4. Save
5. Trigger another event from edge-2 (use console mutation above)
6. Verify no new alert is created (check Alerts list)

## Step 5: Test Maintenance Windows

1. Go to **Alerts → Maintenance** tab
2. Click **Create Window**
3. Fill in:
   - Name: "Test Maintenance Window"
   - Match JSON: `{"type": "Event", "attrs.source": "firewall-1"}`
   - Start: Now
   - End: 2 hours from now
   - Reason: "Testing maintenance window"
4. Save
5. Trigger another event from firewall-1
6. Verify no new alert is created (check Alerts list)

## Step 6: Test Creating Cases from Alerts

1. Go to **Alerts → List** tab
2. Select one or more alerts (checkbox)
3. Click **Open as Case** button
4. Verify case creation dialog opens with pre-filled title
5. Set priority to "High" and add description
6. Click **Create**
7. Verify case is created successfully
8. Go to **Cases** tab and verify the case appears

## Step 7: Test ML Suggestions in Cases

1. Go to **Cases** tab
2. Click on a case created from an alert
3. Verify **Insights (AI)** section shows:
   - Suggested Priority (with confidence)
   - Suggested Owner (with confidence)
   - Related Cases
   - ML Model version
4. Test feedback buttons:
   - Click 👍 or 👎 on priority suggestion
   - Click 👍 or 👎 on owner suggestion
5. Verify feedback is submitted (buttons should disable)
6. Test **Adopt** buttons:
   - Click **Adopt** on priority suggestion
   - Click **Adopt** on owner suggestion
   - Verify case updates with adopted values

## Step 8: Test Alert Details

1. Go to **Alerts → List** tab
2. Click on any alert row (not checkbox/buttons)
3. Verify drawer opens with tabs:
   - **Details**: Alert info, severity, status
   - **Trace**: Delivery trace with retry attempts
   - **Preview**: Routing preview showing destinations
4. Test **Acknowledge** button in drawer
5. Test **Resolve** button in drawer
6. Verify alert status updates in list

## Expected Results

- ✅ 3 alert rules created
- ✅ 5 events triggered → 3 alerts created (1 deduped, 1 suppressed)
- ✅ Silence prevents alerts from edge-2
- ✅ Maintenance window prevents alerts from firewall-1
- ✅ Cases can be created from alerts
- ✅ ML suggestions appear in cases
- ✅ Feedback can be submitted on suggestions
- ✅ Suggestions can be adopted
- ✅ Alert details drawer shows all tabs correctly

