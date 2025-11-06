#!/bin/bash
# Load enrichment seed data into database

set -e

echo "Loading enrichment seed data..."

# Load actions directly using SQL
docker compose -f ../deploy/docker-compose.yml exec -T postgres psql -U postgres -d halcyon <<EOF
-- Insert/Update enrichment actions
INSERT INTO enrichment_actions (id, name, kind, config_json, enabled) VALUES
('geoip', 'GeoIP Lookup', 'geoip', '{"provider": "ipapi"}'::jsonb, TRUE),
('whois', 'WHOIS (domain/ip)', 'whois', '{}'::jsonb, TRUE),
('http-get-ioc', 'IOC Feed Lookup (GET)', 'http_get', '{"url": "https://ioc.example/api?q=\${alert.attrs.indicator}", "timeoutMs": 3000}'::jsonb, TRUE),
('http-post-webhook', 'Webhook POST', 'http_post', '{"url": "https://webhook.example/api/endpoint", "timeoutMs": 5000, "headers": {"Content-Type": "application/json"}, "body": {"alert_id": "\${id}", "message": "\${message}", "severity": "\${severity}"}}'::jsonb, TRUE),
('vt-hash', 'VirusTotal Hash Lookup', 'vt_hash_lookup', '{}'::jsonb, TRUE),
('reverse-geocode', 'Reverse Geocode', 'reverse_geocode', '{}'::jsonb, TRUE),
('keyword-match', 'Keyword Match', 'keyword_match', '{"keywords": ["malware", "suspicious", "attack", "breach"]}'::jsonb, TRUE)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    kind = EXCLUDED.kind,
    config_json = EXCLUDED.config_json,
    enabled = EXCLUDED.enabled;

-- Insert/Update playbooks
INSERT INTO playbooks (id, name, version, steps_json, enabled) VALUES
('pb-enrich-geo-whois', 'Geo + WHOIS', '1.0.0', '[
    {"kind": "enrich", "actionId": "geoip", "onError": "continue"},
    {"kind": "enrich", "actionId": "whois", "onError": "continue"},
    {"kind": "attach_note", "text": "Enrichment summary attached by playbook."}
]'::jsonb, TRUE)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    version = EXCLUDED.version,
    steps_json = EXCLUDED.steps_json,
    enabled = EXCLUDED.enabled;

SELECT '✅ Seed data loaded successfully!' as status;
EOF

echo "✅ All enrichment actions and playbooks loaded!"
