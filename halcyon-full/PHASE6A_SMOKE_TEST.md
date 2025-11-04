# Phase 6A - Alerts & Actions Smoke Test Guide

## Quick Start (60-Second Test)

### 1. Seed an Alert Rule

```bash
curl -sS -X POST http://localhost:8088/alerts/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "name": "High severity burst",
    "description": "≥2 high events from same source in 2m",
    "conditionJson": {
      "match": { "type": "Event", "attrs.severity": "high" },
      "window": "2m",
      "threshold": 2,
      "group_by": "attrs.source",
      "message": "High severity burst from ${attrs.source}"
    },
    "severity": "high",
    "actionsJson": [{"type":"slack","config":{}}],
    "enabled": true
  }' | jq
```

**Expected Response:**
```json
{
  "id": 1
}
```

### 2. Generate Test Events

```bash
./halcyon_loadgen.py --scenario mix --rate 10 --duration 30
```

**Note:** Ensure the load generator creates events with:
- `type: "Event"`
- `attrs.severity: "high"`
- `attrs.source: <some_value>` (for grouping)

### 3. Verify UI Behavior

1. **Notification Bell:**
   - Badge should increment as alerts are created
   - Click bell → navigates to Alerts tab
   - Unread counter resets to 0 when Alerts tab opens

2. **Alerts List:**
   - Shows alerts newest-first
   - Status badges (new/ack/resolved) display correctly
   - Severity colors: high=red, medium=yellow, low=blue

3. **Alert Actions:**
   - Click "Acknowledge" → status changes to "ack" immediately (WebSocket update)
   - Click "Resolve" → status changes to "resolved"
   - No page reload needed (real-time via WebSocket)

4. **Rule Editor:**
   - Paste rule JSON → Save
   - Rule persists and appears in database

---

## Backend Verification

### Database Schema Check

```sql
-- Connect to gateway database
psql postgresql://postgres:dev@localhost:5432/halcyon

-- Check tables exist
\d+ alert_rules;
\d+ alerts;
\d+ alert_actions_log;

-- Verify rule was created
SELECT id, name, severity, enabled, created_at FROM alert_rules;

-- Check alerts were generated
SELECT id, rule_id, message, severity, status, created_at 
FROM alerts 
ORDER BY created_at DESC 
LIMIT 10;

-- Check action logs (if Slack/Webhook configured)
SELECT id, alert_id, action_type, status, response_code, executed_at, latency_ms
FROM alert_actions_log
ORDER BY id DESC 
LIMIT 10;
```

### Prometheus Metrics (if enabled)

```bash
# Check Gateway metrics endpoint
curl http://localhost:8088/metrics | grep alerts

# Expected metrics:
# alerts_triggered_total{rule_id="1",severity="high"} 5
# actions_executed_total{type="slack",status="success"} 3
# rule_eval_latency_seconds_bucket{le="0.001"} 10
# alert_delivery_latency_seconds_bucket{le="0.1"} 8
```

### WebSocket Message Format

Alerts are published via Redis pub/sub with format:
```json
{
  "t": "alert.created",
  "data": {
    "id": 123,
    "ruleId": 1,
    "entityId": "event-001",
    "message": "High severity burst from source-A",
    "severity": "high",
    "status": "new",
    "createdAt": "2024-11-04T21:00:00Z"
  }
}
```

Update messages:
```json
{
  "t": "alert.updated",
  "data": {
    "id": 123,
    "status": "ack"
  }
}
```

---

## Troubleshooting

### No Alerts Appearing?

**Check:**
1. Rule is enabled: `SELECT enabled FROM alert_rules WHERE id = 1;`
2. Events match rule criteria:
   - `type: "Event"`
   - `attrs.severity: "high"`
   - `attrs.source` exists (for grouping)
3. Threshold is met: Lower threshold to `1` for testing
4. Window time: Try `"window": "5m"` for slower events

**Quick Test Rule (no grouping):**
```json
{
  "match": { "type": "Event" },
  "threshold": 1,
  "message": "Any Event detected"
}
```

### Bell Never Increments?

**Verify:**
1. WebSocket connection is active (check browser console)
2. Messages are being published: Check Redis pub/sub channel
3. UI subscribe function receives messages:
   ```typescript
   // In browser console:
   // Check websocket.ts subscribe is working
   ```
4. Alert message format matches: `{ t: "alert.created", data: {...} }`

**Debug WebSocket:**
- Open browser DevTools → Network → WS tab
- Check for `/ws` connection
- Verify messages are being received

### RBAC Hiding Alerts Tab?

**Solutions:**
1. DEV_MODE: Set `VITE_DEV_MODE=true` in UI environment
2. Keycloak: Log in with user having `analyst` or `admin` role
3. Check user roles: Look at token payload or `/auth/user` endpoint

**Dev Mode Check:**
```typescript
// In browser console:
localStorage.getItem('dev_mode') // or check VITE_DEV_MODE env
```

### Actions Not Executing?

**Check:**
1. `ACTIONS_ENABLE=true` in Gateway environment
2. Action config in rule:
   ```json
   "actionsJson": [
     {
       "type": "slack",
       "config": {
         "webhook_url": "https://hooks.slack.com/services/..."
       }
     }
   ]
   ```
3. Check `alert_actions_log` table for execution status
4. Network connectivity to Slack/webhook endpoint

---

## Grafana Dashboard Setup

### Quick Metrics Panel

1. Add Prometheus data source (if not already added)
2. Create new dashboard panel
3. Query: `alerts_triggered_total`
4. Visualization: Time series
5. Trigger load generator → Watch metrics increment

### Recommended Panels

1. **Alerts Triggered Over Time**
   - Query: `rate(alerts_triggered_total[5m])`
   - Panel: Line graph

2. **Action Execution Status**
   - Query: `actions_executed_total`
   - Panel: Pie chart (by status)

3. **Rule Evaluation Latency**
   - Query: `histogram_quantile(0.95, rule_eval_latency_seconds_bucket)`
   - Panel: Gauge

4. **Active Alerts by Status**
   - Query: Count from `alerts` table (via PostgreSQL datasource)
   - Panel: Stat cards

---

## Optional Enhancements (Fast Wins)

### 1. Rule List with Toggles

Add a small rule list component beside RuleEditor:
- Show all rules with enable/disable toggle
- Delete button for each rule
- Shows rule name, severity, enabled status

### 2. Bulk Actions

Add checkbox selection to AlertList:
- Select multiple alerts
- Bulk acknowledge/resolve buttons
- Update all selected alerts at once

### 3. SLA / Aging Highlights

Add visual indicators:
- Highlight alerts > 5 minutes in NEW status (red border)
- Filter chips: "Last 5m", "Last 15m", "Last 1h"
- Sort by age (oldest first)

### 4. Per-Alert Deep Link

Support URL routing:
- `#/alerts/123` → Focus alert row 123
- Auto-scroll to alert
- Highlight the alert row
- Optionally open entity inspector for related entity

### 5. Actions Preview / Test

In RuleEditor:
- "Test Action" button
- Dry-run Slack/Webhook with sample payload
- Shows success/failure without creating alert
- Useful for validating webhook URLs

---

## Success Criteria

✅ Alert rule created via REST API  
✅ Alerts generated from entity upserts  
✅ Alerts appear in UI list in real-time  
✅ Notification bell increments and resets correctly  
✅ Acknowledge/Resolve updates status immediately  
✅ WebSocket messages received and processed  
✅ Action logs recorded (if actions configured)  
✅ Database tables populated correctly  
✅ RBAC enforces analyst/admin access  

---

## Performance Benchmarks

- **Alert Creation Latency:** < 100ms (rule eval + insert)
- **WebSocket Delivery:** < 50ms (Redis pub/sub → UI)
- **UI Update:** < 100ms (alert appears in list)
- **Bulk Acknowledge:** < 500ms for 10 alerts

---

## Next Steps After Smoke Test

1. ✅ Verify all checks pass
2. 📊 Set up Grafana dashboard for ongoing monitoring
3. 🔧 Configure Slack webhook URLs for production
4. 📝 Document rule DSL patterns for common use cases
5. 🚀 Plan Phase 6B: Alert correlation and escalation policies
