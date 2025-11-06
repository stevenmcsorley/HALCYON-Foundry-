#!/bin/bash
# HALCYON Playbook Studio - End-to-End Smoke Test Script
# This script tests the API endpoints and verifies functionality

set -e

BASE_URL="http://localhost:8091"
GATEWAY_URL="http://localhost:8088"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 HALCYON Playbook Studio - End-to-End Smoke Test"
echo "=================================================="
echo ""

# Check if we have a token (you'll need to set this)
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠️  TOKEN not set. Some tests will be skipped.${NC}"
    echo "   Set TOKEN environment variable to test authenticated endpoints"
    echo ""
fi

# 1) Health Checks
echo "1) Health Checks"
echo "----------------"
echo -n "Gateway health: "
GATEWAY_HEALTH=$(curl -s "$GATEWAY_URL/health/ready" 2>&1)
if echo "$GATEWAY_HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Response: $GATEWAY_HEALTH"
fi

echo -n "Enrichment health: "
ENRICHMENT_HEALTH=$(curl -s "$BASE_URL/health" 2>&1)
if echo "$ENRICHMENT_HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Response: $ENRICHMENT_HEALTH"
fi

echo ""

# 2) Test Playbook Endpoints (if token available)
if [ -n "$TOKEN" ]; then
    echo "2) Playbook API Tests"
    echo "---------------------"
    
    # List playbooks
    echo -n "List playbooks: "
    LIST_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/playbooks" 2>&1)
    if echo "$LIST_RESPONSE" | grep -qE "\[|\"id\""; then
        echo -e "${GREEN}✅ OK${NC}"
    else
        echo -e "${YELLOW}⚠️  Response: $LIST_RESPONSE${NC}"
    fi
    
    # Create a test playbook
    echo -n "Create playbook: "
    CREATE_PAYLOAD='{
        "name": "Test Playbook",
        "description": "Smoke test playbook",
        "jsonBody": {
            "version": "1.0.0",
            "entry": "geoip-1",
            "steps": [
                {
                    "kind": "enrich",
                    "actionId": "geoip",
                    "stepId": "geoip-1",
                    "onError": "continue"
                },
                {
                    "kind": "enrich",
                    "actionId": "whois",
                    "stepId": "whois-1",
                    "onError": "continue"
                },
                {
                    "kind": "attach_note",
                    "stepId": "output-1",
                    "text": "Enrichment complete"
                }
            ]
        },
        "status": "draft"
    }'
    
    CREATE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$CREATE_PAYLOAD" \
        "$BASE_URL/playbooks" 2>&1)
    
    if echo "$CREATE_RESPONSE" | grep -q "\"id\""; then
        PLAYBOOK_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
        echo -e "${GREEN}✅ OK (ID: $PLAYBOOK_ID)${NC}"
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Response: $CREATE_RESPONSE"
        PLAYBOOK_ID=""
    fi
    
    if [ -n "$PLAYBOOK_ID" ]; then
        # Validate playbook
        echo -n "Validate playbook: "
        VALIDATE_PAYLOAD='{
            "jsonBody": {
                "version": "1.0.0",
                "entry": "geoip-1",
                "steps": [
                    {"kind": "enrich", "actionId": "geoip", "stepId": "geoip-1", "onError": "continue"},
                    {"kind": "enrich", "actionId": "whois", "stepId": "whois-1", "onError": "continue"}
                ]
            }
        }'
        
        VALIDATE_RESPONSE=$(curl -s -X POST \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$VALIDATE_PAYLOAD" \
            "$BASE_URL/playbooks/validate" 2>&1)
        
        if echo "$VALIDATE_RESPONSE" | grep -q "\"isValid\":true"; then
            echo -e "${GREEN}✅ OK${NC}"
        else
            echo -e "${YELLOW}⚠️  Response: $VALIDATE_RESPONSE${NC}"
        fi
        
        # Test run
        echo -n "Test run: "
        TEST_RUN_PAYLOAD='{
            "jsonBody": {
                "version": "1.0.0",
                "entry": "geoip-1",
                "steps": [
                    {"kind": "enrich", "actionId": "geoip", "stepId": "geoip-1", "onError": "continue"}
                ]
            },
            "mockSubject": {
                "id": "test-alert-1",
                "message": "Test alert",
                "attrs": {"ip": "8.8.8.8"}
            }
        }'
        
        TEST_RUN_RESPONSE=$(curl -s -X POST \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$TEST_RUN_PAYLOAD" \
            "$BASE_URL/playbooks/test-run" 2>&1)
        
        if echo "$TEST_RUN_RESPONSE" | grep -q "\"status\":\"success\""; then
            echo -e "${GREEN}✅ OK${NC}"
        else
            echo -e "${YELLOW}⚠️  Response: $TEST_RUN_RESPONSE${NC}"
        fi
        
        # Get versions
        echo -n "Get versions: "
        VERSIONS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/playbooks/$PLAYBOOK_ID/versions" 2>&1)
        if echo "$VERSIONS_RESPONSE" | grep -qE "\[|\"version\""; then
            echo -e "${GREEN}✅ OK${NC}"
        else
            echo -e "${YELLOW}⚠️  Response: $VERSIONS_RESPONSE${NC}"
        fi
    fi
    
    echo ""
fi

# 3) Metrics Check
echo "3) Metrics Check"
echo "----------------"
echo -n "Playbook metrics: "
METRICS=$(curl -s "$BASE_URL/metrics" 2>&1)
METRIC_COUNT=$(echo "$METRICS" | grep -c "playbook_" || echo "0")
if [ "$METRIC_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Found $METRIC_COUNT playbook metrics${NC}"
    echo "$METRICS" | grep "playbook_" | head -5
else
    echo -e "${YELLOW}⚠️  No playbook metrics found${NC}"
fi

echo ""
echo "✅ Smoke test complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. Test UI manually at http://localhost:5173"
echo "   2. Verify visual canvas functionality"
echo "   3. Test RBAC with different user roles"
echo "   4. Check Prometheus metrics dashboard"

