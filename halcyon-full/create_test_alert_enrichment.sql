-- Create a test alert with real enrichment data
DO $$
DECLARE
    rule_id_val INTEGER;
    alert_id_val INTEGER;
BEGIN
    -- Get or create a test rule
    SELECT id INTO rule_id_val FROM alert_rules WHERE name LIKE '%Test%' OR name LIKE '%Enrichment%' LIMIT 1;
    
    IF rule_id_val IS NULL THEN
        INSERT INTO alert_rules (name, description, condition_json, severity, enabled)
        VALUES ('Enrichment Test Rule', 'Rule for testing enrichment actions', '{}', 'high', TRUE)
        RETURNING id INTO rule_id_val;
        RAISE NOTICE 'Created test rule with id: %', rule_id_val;
    ELSE
        RAISE NOTICE 'Using existing rule with id: %', rule_id_val;
    END IF;

    -- Create an alert with real IP address and domain data
    INSERT INTO alerts (
        rule_id, entity_id, message, severity, status,
        fingerprint, group_key, count, first_seen, last_seen, created_at
    )
    VALUES (
        rule_id_val,
        'ip-8.8.8.8',
        'Suspicious activity detected from IP address 8.8.8.8. Domain queries to malicious-site.example.com detected. Investigation required.',
        'high',
        'open',
        'TestAlert:8.8.8.8:enrichment',
        '8.8.8.8',
        1,
        NOW(),
        NOW(),
        NOW()
    )
    RETURNING id INTO alert_id_val;
    
    RAISE NOTICE 'Created test alert with id: %', alert_id_val;
    RAISE NOTICE 'Alert entity_id: ip-8.8.8.8';
    RAISE NOTICE 'Alert message contains: 8.8.8.8 and malicious-site.example.com';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now run enrichment actions on this alert:';
    RAISE NOTICE '  - GeoIP lookup will work (IP: 8.8.8.8)';
    RAISE NOTICE '  - WHOIS lookup will work (Domain: malicious-site.example.com)';
    RAISE NOTICE '';
    RAISE NOTICE 'Alert ID to use: %', alert_id_val;
END $$;

