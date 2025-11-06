-- Create a comprehensive test alert that exercises all enrichment actions
DO $$
DECLARE
    rule_id_val INTEGER;
    alert_id_val INTEGER;
BEGIN
    -- Get or create a test rule
    SELECT id INTO rule_id_val FROM alert_rules WHERE name LIKE '%Test%' OR name LIKE '%Enrichment%' LIMIT 1;
    
    IF rule_id_val IS NULL THEN
        INSERT INTO alert_rules (name, description, condition_json, severity, enabled)
        VALUES ('Enrichment Test Rule', 'Comprehensive rule for testing all enrichment actions', '{}', 'high', TRUE)
        RETURNING id INTO rule_id_val;
        RAISE NOTICE 'Created test rule with id: %', rule_id_val;
    ELSE
        RAISE NOTICE 'Using existing rule with id: %', rule_id_val;
    END IF;

    -- Create a comprehensive alert with data for ALL enrichment actions:
    -- - IP address (8.8.8.8) for GeoIP and WHOIS
    -- - Domain (example.com) for WHOIS
    -- - Hash (MD5 and SHA256) for VirusTotal
    -- - Coordinates (lat/lon) for Reverse Geocode
    -- - Keywords (malware, suspicious, attack) for Keyword Match
    -- - Entity ID and message with all data for HTTP actions
    INSERT INTO alerts (
        rule_id, entity_id, message, severity, status,
        fingerprint, group_key, count, first_seen, last_seen, created_at
    )
    VALUES (
        rule_id_val,
        'ip-8.8.8.8',
        'COMPREHENSIVE ENRICHMENT TEST: Suspicious activity detected from IP address 8.8.8.8 (Google DNS). Domain queries to example.com detected. Malware hash abc123def4567890abcdef1234567890abcdef12 (MD5: d41d8cd98f00b204e9800998ecf8427e, SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855) associated with attack. Location coordinates: 39.03, -77.5 (Ashburn, VA). Suspicious keywords: malware, attack, breach detected.',
        'high',
        'open',
        'TestAlert:8.8.8.8:all-enrichment',
        '8.8.8.8',
        1,
        NOW(),
        NOW(),
        NOW()
    )
    RETURNING id INTO alert_id_val;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Created comprehensive test alert!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Alert ID: %', alert_id_val;
    RAISE NOTICE 'Entity ID: ip-8.8.8.8';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Test Data Included:';
    RAISE NOTICE '   ✅ IP: 8.8.8.8 (for GeoIP & WHOIS)';
    RAISE NOTICE '   ✅ Domain: example.com (for WHOIS)';
    RAISE NOTICE '   ✅ MD5: d41d8cd98f00b204e9800998ecf8427e (for VirusTotal)';
    RAISE NOTICE '   ✅ SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (for VirusTotal)';
    RAISE NOTICE '   ✅ Coordinates: 39.03, -77.5 (for Reverse Geocode)';
    RAISE NOTICE '   ✅ Keywords: malware, attack, breach (for Keyword Match)';
    RAISE NOTICE '   ✅ Full message text (for HTTP actions)';
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Test These Actions:';
    RAISE NOTICE '   1. GeoIP Lookup → Should find Google DNS location';
    RAISE NOTICE '   2. WHOIS Lookup → Should find IP geolocation';
    RAISE NOTICE '   3. VirusTotal Hash → Should query hash (may not be in DB)';
    RAISE NOTICE '   4. Reverse Geocode → Should find Ashburn, VA';
    RAISE NOTICE '   5. Keyword Match → Should match: malware, attack, breach';
    RAISE NOTICE '   6. HTTP GET/POST → Can use templated URL/body';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Now test all enrichment actions on Alert ID: %', alert_id_val;
    RAISE NOTICE '========================================';
END $$;


