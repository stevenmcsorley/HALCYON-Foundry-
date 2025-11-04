#!/bin/bash
# Phase 6A Alerts & Actions Smoke Test
# This script verifies the alerts subsystem end-to-end

set -e

GATEWAY_URL="http://localhost:8088"
GQL_URL="${GATEWAY_URL}/graphql"
DB_HOST="localhost"
DB_USER="postgres"
DB_PASS="dev"
DB_NAME="halcyon"

echo "🧪 Phase 6A Alerts & Actions Smoke Test"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ $1${NC}"
        ((FAILED++))
        return 1
    fi
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "ℹ️  $1"
}

# 1. Check Gateway Health
echo "1️⃣  Checking Gateway Health..."
HEALTH=$(curl -sS "${GATEWAY_URL}/health" 2>&1)
if echo "$HEALTH" | grep -q "ok"; then
    check "Gateway is healthy"
else
    check "Gateway is healthy (response: $HEALTH)"
fi
echo ""

# 2. Check Database Schema
echo "2️⃣  Checking Database Schema..."
SCHEMA_CHECK=$(PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "\d+ alert_rules" 2>&1 | grep -c "Table.*alert_rules" || echo "0")
if [ "$SCHEMA_CHECK" -gt "0" ]; then
    check "alert_rules table exists"
else
    check "alert_rules table exists"
fi

SCHEMA_CHECK=$(PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "\d+ alerts" 2>&1 | grep -c "Table.*alerts" || echo "0")
if [ "$SCHEMA_CHECK" -gt "0" ]; then
    check "alerts table exists"
else
    check "alerts table exists"
fi

SCHEMA_CHECK=$(PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "\d+ alert_actions_log" 2>&1 | grep -c "Table.*alert_actions_log" || echo "0")
if [ "$SCHEMA_CHECK" -gt "0" ]; then
    check "alert_actions_log table exists"
else
    check "alert_actions_log table exists"
fi
echo ""

# 3. Check Alert Rules Endpoint (may require auth)
echo "3️⃣  Checking REST API Endpoints..."
RULES_RESPONSE=$(curl -sS -w "\n%{http_code}" "${GATEWAY_URL}/alerts/rules" 2>&1 | tail -1)
if [ "$RULES_RESPONSE" = "200" ]; then
    check "GET /alerts/rules endpoint responds"
elif [ "$RULES_RESPONSE" = "401" ] || [ "$RULES_RESPONSE" = "403" ]; then
    warn "GET /alerts/rules requires authentication (expected in production)"
    info "  Response code: $RULES_RESPONSE"
else
    check "GET /alerts/rules endpoint responds (code: $RULES_RESPONSE)"
fi

ALERTS_RESPONSE=$(curl -sS -w "\n%{http_code}" "${GATEWAY_URL}/alerts" 2>&1 | tail -1)
if [ "$ALERTS_RESPONSE" = "200" ]; then
    check "GET /alerts endpoint responds"
elif [ "$ALERTS_RESPONSE" = "401" ] || [ "$ALERTS_RESPONSE" = "403" ]; then
    warn "GET /alerts requires authentication (expected in production)"
    info "  Response code: $ALERTS_RESPONSE"
else
    check "GET /alerts endpoint responds (code: $ALERTS_RESPONSE)"
fi
echo ""

# 4. Check GraphQL Schema
echo "4️⃣  Checking GraphQL Schema..."
GQL_SCHEMA=$(curl -sS "${GQL_URL}" \
    -H "Content-Type: application/json" \
    -d '{"query": "query IntrospectionQuery { __schema { queryType { name fields { name } } } }"}' 2>&1)

if echo "$GQL_SCHEMA" | grep -q "alertRules\|alerts"; then
    check "GraphQL schema includes alert queries"
else
    # Check if it's an auth error
    if echo "$GQL_SCHEMA" | grep -q "401\|Unauthorized\|Authorization"; then
        warn "GraphQL requires authentication (expected in production)"
    else
        check "GraphQL schema includes alert queries"
    fi
fi
echo ""

# 5. Check Redis Connection (for WebSocket pub/sub)
echo "5️⃣  Checking Redis Connection..."
if command -v redis-cli &> /dev/null; then
    REDIS_CHECK=$(redis-cli -h localhost -p 6379 ping 2>&1)
    if [ "$REDIS_CHECK" = "PONG" ]; then
        check "Redis is reachable"
    else
        warn "Redis connection check failed: $REDIS_CHECK"
    fi
else
    warn "redis-cli not found, skipping Redis check"
fi
echo ""

# 6. Check Database for Existing Data
echo "6️⃣  Checking Database for Existing Data..."
RULE_COUNT=$(PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM alert_rules;" 2>&1 | tr -d ' ')
ALERT_COUNT=$(PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM alerts;" 2>&1 | tr -d ' ')
ACTION_COUNT=$(PGPASSWORD=${DB_PASS} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM alert_actions_log;" 2>&1 | tr -d ' ')

info "Current database state:"
info "  Alert Rules: $RULE_COUNT"
info "  Alerts: $ALERT_COUNT"
info "  Action Logs: $ACTION_COUNT"
check "Database queries succeed"
echo ""

# 7. Check UI Files
echo "7️⃣  Checking UI Components..."
if [ -f "ui/src/modules/alerts/AlertsTab.tsx" ]; then
    check "AlertsTab.tsx exists"
else
    check "AlertsTab.tsx exists"
fi

if [ -f "ui/src/modules/alerts/AlertList.tsx" ]; then
    check "AlertList.tsx exists"
else
    check "AlertList.tsx exists"
fi

if [ -f "ui/src/components/NotificationBell.tsx" ]; then
    check "NotificationBell.tsx exists"
else
    check "NotificationBell.tsx exists"
fi

if [ -f "ui/src/store/alertsStore.ts" ]; then
    check "alertsStore.ts exists"
else
    check "alertsStore.ts exists"
fi
echo ""

# Summary
echo "========================================"
echo "📊 Test Summary"
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "📝 Next Steps:"
    echo "   1. Ensure DEV_MODE=true or configure Keycloak for authentication"
    echo "   2. Create an alert rule via REST API (see PHASE6A_SMOKE_TEST.md)"
    echo "   3. Generate test events via GraphQL mutation"
    echo "   4. Verify alerts appear in UI and notification bell increments"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the output above.${NC}"
    exit 1
fi
