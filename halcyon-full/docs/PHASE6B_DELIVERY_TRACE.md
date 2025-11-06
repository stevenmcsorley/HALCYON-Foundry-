# Phase 6B: Alert Delivery Trace & Routing UX

## Overview

Phase 6B adds comprehensive visibility and control for alert delivery, giving analysts a first-class view of where alerts went, what happened, and what will happen next. This includes delivery trace timelines, routing previews, and manual retry capabilities.

## Features

### 1. Delivery Trace

The **Trace** tab in the Alert Details Drawer shows a complete timeline of all delivery attempts for an alert:

- **Status badges**: Success (green), Failed (red), Retry Scheduled (amber)
- **Attempt numbers**: Monotonically increasing per destination
- **HTTP status codes**: When available from delivery attempts
- **Error messages**: Truncated error details for failures
- **Timestamps**: When each attempt was sent or created
- **Next retry ETA**: For retry-scheduled attempts, shows "Next retry in ~Xm"

Features:
- Auto-refreshes every 10 seconds when tab is focused
- Manual refresh button
- "Retry Failed" bulk action (analyst/admin only)

### 2. Routing Preview

The **Preview** tab shows which destinations would fire if the alert happened now:

- **Would Send**: ✅ (green checkmark) - destination would receive alert
- **Suppressed**: 🚫 (purple stop sign) - alert is suppressed
- **Not Configured**: ⏸ (gray pause) - route not configured or missing config

For each destination:
- Destination identifier (e.g., "slack:#alerts-crit", "webhook:https://...")
- Reason explanation (why it would/wouldn't send)
- "Retry Now" button for failed/not-sent destinations (analyst/admin only)

### 3. Manual Retry

Analysts and admins can manually trigger retries:

- **Single retry**: Click "Retry Now" next to a specific destination in Preview
- **Bulk retry**: Click "Retry Failed" in Trace tab to retry all failed destinations

Manual retries:
- Create new `alert_actions_log` entries with `status='retry'`
- Set `scheduled_at=NOW()` for immediate processing
- Increment attempt number from previous max
- Retry worker picks them up on next tick

### 4. RBAC

- **Viewer**: Can view trace and preview, but cannot retry
- **Analyst/Admin**: Can view and retry/redeliver

## API Reference

### REST Endpoints

#### GET `/alerts/{id}/actions/logs`
Get action log timeline for an alert (viewer+).

**Response**: Array of `ActionAttempt` objects

#### POST `/alerts/{id}/actions/retry`
Enqueue a manual retry for a specific destination (analyst/admin only).

**Request Body**:
```json
{
  "dest": "slack"  // or "webhook"
}
```

**Response**: `ActionAttempt` object

#### POST `/alerts/{id}/actions/retry-all-failed`
Retry all failed destinations for an alert (analyst/admin only).

**Response**: Array of `ActionAttempt` objects

#### POST `/alerts/{id}/actions/preview`
Preview which routes would fire for an alert (viewer+).

**Response**: Array of `RouteDecision` objects

### GraphQL

#### Query: `alertActions(alertId: ID!)`
Returns action log timeline.

#### Query: `alertRoutePreview(alertId: ID!)`
Returns routing preview decisions.

#### Mutation: `alertRetry(alertId: ID!, dest: String!)`
Enqueue manual retry for a destination.

#### Mutation: `alertRetryAllFailed(alertId: ID!)`
Retry all failed destinations.

## Metrics

### New Metrics

- `alert_actions_preview_total{result}` - Counter of preview requests
  - `result`: "would_send" or "suppressed"
  
- `alert_manual_retry_total{dest}` - Counter of manual retry requests
  - `dest`: "slack" or "webhook"

- `alert_action_next_retry_seconds{dest,alert_id}` - Gauge of seconds until next retry
  - Updates when retries are scheduled

### Existing Metrics (still used)

- `alert_notifications_total{dest,status}` - All notification attempts
- `alert_retry_total{dest}` - All retries (automatic + manual)
- `alert_retry_exhausted_total{dest}` - Retries that exhausted max attempts

## Database Schema

### `alert_actions_log` Table

Enhanced with Phase 6B columns:

- `http_status INT NULL` - HTTP status code from delivery attempt
- `attempt INT NOT NULL` - Attempt number (monotonically increasing per alert_id+dest)
- `sent_at TIMESTAMPTZ NULL` - When the attempt actually happened
- `scheduled_at TIMESTAMPTZ NULL` - When next retry is scheduled (alias for next_retry_at)

## Usage Examples

### Viewing Delivery Trace

1. Navigate to Alerts tab
2. Click on an alert to open Alert Details Drawer
3. Click "Trace" tab
4. View timeline of all delivery attempts
5. See "Next retry in ~5m" for scheduled retries

### Previewing Routes

1. Open Alert Details Drawer
2. Click "Preview" tab
3. See which destinations would receive the alert
4. See suppression status and reasons

### Manual Retry

1. In Trace tab, click "Retry Failed" to retry all failed destinations
2. Or in Preview tab, click "Retry Now" next to a specific destination
3. New retry entry appears in timeline
4. Retry worker processes it on next tick

## Grafana Panels

Recommended panels for the Observability → Alerts row:

1. **Delivery Success Rate** (stat)
   - Query: `rate(alert_notifications_total{status="success"}[5m]) / rate(alert_notifications_total[5m])`

2. **Notifications by Destination** (time-series)
   - Query: `sum by (dest) (rate(alert_notifications_total[5m]))`

3. **Manual Retries** (bar)
   - Query: `sum by (dest) (alert_manual_retry_total)`

4. **Next Retry ETA** (table)
   - Query: `alert_action_next_retry_seconds`

## Error Handling

- **401/403/404**: Silently handled (no modals)
- **5xx/Network**: AlertDialog modal shown
- **RBAC violations**: 403 returned, silently handled in UI

## Troubleshooting

**No delivery attempts showing?**
- Verify alert has a rule with routes configured
- Check if alert was suppressed (won't have delivery attempts)
- Ensure retry worker is running

**Manual retry not working?**
- Verify user has analyst/admin role
- Check retry worker logs for processing errors
- Verify destination is valid (slack or webhook)

**Preview shows "No routes configured"?**
- Check alert rule's `route` JSONB field
- Verify rule has `actions_json` or `route` set

