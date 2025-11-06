-- Insert test alerts directly into the database
-- Run with: docker compose exec postgres psql -U postgres -d halcyon -f /path/to/test_insert_alerts.sql
-- Or: psql -U postgres -d halcyon -f test_insert_alerts.sql

BEGIN;

-- Insert test alerts (assuming rules 11, 12, 13 exist from the test run)
INSERT INTO alerts (
    rule_id, 
    entity_id, 
    message, 
    severity, 
    status, 
    fingerprint, 
    group_key, 
    first_seen, 
    last_seen, 
    count,
    created_at
) VALUES 
-- Alert 1: High severity from Rule 11
(
    11,
    'test-event-high-1',
    'High severity event detected: High severity test event for alert creation',
    'high'::alert_severity,
    'open'::alert_status,
    'Event:edge-1:high',
    'Event:edge-1',
    NOW(),
    NOW(),
    1,
    NOW()
),
-- Alert 2: Medium severity burst from Rule 12
(
    12,
    'test-event-medium-1',
    'Medium severity burst from edge-2',
    'medium'::alert_severity,
    'open'::alert_status,
    'Event:edge-2:medium',
    'Event:edge-2',
    NOW(),
    NOW(),
    3,
    NOW()
),
-- Alert 3: Critical security from Rule 13
(
    13,
    'test-event-critical-1',
    'Critical security event: Critical security breach detected in production system',
    'high'::alert_severity,
    'open'::alert_status,
    'Event:Critical security breach detected in production system',
    'Event',
    NOW(),
    NOW(),
    1,
    NOW()
),
-- Alert 4: Another high severity (acknowledged)
(
    11,
    'test-event-high-2',
    'High severity event detected: Another high severity alert',
    'high'::alert_severity,
    'ack'::alert_status,
    'Event:edge-1:high',
    'Event:edge-1',
    NOW() - INTERVAL '5 minutes',
    NOW() - INTERVAL '5 minutes',
    1,
    NOW() - INTERVAL '5 minutes'
),
-- Alert 5: Resolved alert
(
    11,
    'test-event-high-3',
    'High severity event detected: Resolved alert',
    'high'::alert_severity,
    'resolved'::alert_status,
    'Event:edge-1:high',
    'Event:edge-1',
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '1 hour',
    1,
    NOW() - INTERVAL '1 hour'
);

COMMIT;

-- Verify the alerts were inserted
SELECT 
    id, 
    rule_id, 
    message, 
    severity, 
    status, 
    created_at 
FROM alerts 
ORDER BY created_at DESC 
LIMIT 10;

