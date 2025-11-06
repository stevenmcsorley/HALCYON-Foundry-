#!/bin/bash
# Load enrichment seed data into database

set -e

POSTGRES_CONTAINER="deploy-postgres-1"
SEED_FILE="../deploy/seeds/playbooks.json"

echo "Loading enrichment seed data..."

# Read JSON and insert actions
cat "$SEED_FILE" | docker compose -f ../deploy/docker-compose.yml exec -T postgres psql -U postgres -d halcyon <<EOF
-- Insert actions
DO \$\$
DECLARE
    action_record RECORD;
    playbook_record RECORD;
    step_record RECORD;
    actions_json JSONB;
    playbooks_json JSONB;
BEGIN
    -- Read JSON file content (we'll use a temp table approach)
    CREATE TEMP TABLE IF NOT EXISTS seed_data (data JSONB);
    
    -- Parse actions
    FOR action_record IN 
        SELECT * FROM jsonb_array_elements('[
            {
                "id": "geoip",
                "name": "GeoIP Lookup",
                "kind": "geoip",
                "config": {"provider": "freegeoip"},
                "enabled": true
            },
            {
                "id": "whois",
                "name": "WHOIS (domain/ip)",
                "kind": "whois",
                "config": {},
                "enabled": true
            },
            {
                "id": "http-get-ioc",
                "name": "IOC Feed Lookup",
                "kind": "http_get",
                "config": {
                    "url": "https://ioc.example/api?q=\${alert.attrs.indicator}",
                    "timeoutMs": 3000
                },
                "enabled": true
            }
        ]'::jsonb) AS action
    LOOP
        INSERT INTO enrichment_actions (id, name, kind, config_json, enabled)
        VALUES (
            action_record->>'id',
            action_record->>'name',
            action_record->>'kind',
            action_record->'config',
            (action_record->>'enabled')::boolean
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            config_json = EXCLUDED.config_json,
            enabled = EXCLUDED.enabled;
    END LOOP;

    -- Parse playbooks
    FOR playbook_record IN
        SELECT * FROM jsonb_array_elements('[
            {
                "id": "pb-enrich-geo-whois",
                "name": "Geo + WHOIS",
                "version": "1.0.0",
                "enabled": true,
                "steps": [
                    {"kind": "enrich", "actionId": "geoip", "onError": "continue"},
                    {"kind": "enrich", "actionId": "whois", "onError": "continue"},
                    {"kind": "attach_note", "text": "Enrichment summary attached by playbook."}
                ]
            }
        ]'::jsonb) AS playbook
    LOOP
        INSERT INTO playbooks (id, name, version, steps_json, enabled)
        VALUES (
            playbook_record->>'id',
            playbook_record->>'name',
            playbook_record->>'version',
            playbook_record->'steps',
            (playbook_record->>'enabled')::boolean
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            version = EXCLUDED.version,
            steps_json = EXCLUDED.steps_json,
            enabled = EXCLUDED.enabled;
    END LOOP;
END \$\$;
EOF

echo "✅ Seed data loaded successfully!"

