// Browser Console Helper Functions for Testing Alerts & Cases
// Copy and paste these into the browser console (F12) when logged into the UI

// Get auth token from localStorage (same as UI uses)
function getAuthToken() {
  return localStorage.getItem('halcyon_token') || sessionStorage.getItem('halcyon_token');
}

// Helper function to make GraphQL requests
async function gql(query, variables = {}) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated - please log in first');
  }
  
  const res = await fetch('http://localhost:8088/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });
  
  const data = await res.json();
  if (data.errors) {
    throw new Error(data.errors[0].message);
  }
  return data.data;
}

// Helper function to make REST requests
async function rest(method, path, body = null) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated - please log in first');
  }
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(`http://localhost:8088${path}`, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  }
  return data;
}

// ============================================
// TEST SCENARIOS
// ============================================

// Scenario 1: Create Alert Rules
async function createTestRules() {
  console.log('📋 Creating alert rules...');
  
  const rule1 = await rest('POST', '/alerts/rules', {
    name: 'High Severity Events',
    description: 'Triggers on high severity events',
    condition_json: {
      match: { type: 'Event', 'attrs.severity': 'high' },
      window: '5m',
      threshold: 1,
      message: 'High severity event detected: ${attrs.message}'
    },
    severity: 'high',
    enabled: true,
    mute_seconds: 300,
    fingerprint_template: '${type}:${attrs.source}:${attrs.severity}',
    correlation_keys: ['type', 'attrs.source']
  });
  console.log('✅ Rule 1 created:', rule1.id);
  
  const rule2 = await rest('POST', '/alerts/rules', {
    name: 'Medium Severity Burst',
    description: 'Triggers when 3+ medium severity events in 2 minutes',
    condition_json: {
      match: { type: 'Event', 'attrs.severity': 'medium' },
      window: '2m',
      threshold: 3,
      group_by: 'attrs.source',
      message: 'Medium severity burst from ${attrs.source}'
    },
    severity: 'medium',
    enabled: true,
    mute_seconds: 180,
    fingerprint_template: '${type}:${attrs.source}:${attrs.severity}',
    correlation_keys: ['type', 'attrs.source']
  });
  console.log('✅ Rule 2 created:', rule2.id);
  
  const rule3 = await rest('POST', '/alerts/rules', {
    name: 'Critical Security Breach',
    description: 'Triggers on critical security keywords',
    condition_json: {
      match: { type: 'Event' },
      window: '1m',
      threshold: 1,
      message: 'Critical security event: ${attrs.message}'
    },
    severity: 'high',
    enabled: true,
    mute_seconds: 600,
    fingerprint_template: '${type}:${attrs.message}',
    correlation_keys: ['type']
  });
  console.log('✅ Rule 3 created:', rule3.id);
  
  return { rule1, rule2, rule3 };
}

// Scenario 2: Trigger Events to Create Alerts
async function triggerTestEvents() {
  console.log('📨 Triggering test events...');
  
  // Event 1: High severity - should trigger Rule 1
  await gql(`
    mutation($input: [EntityInput!]!) {
      upsertEntities(input: $input)
    }
  `, {
    input: [{
      id: `test-event-high-${Date.now()}`,
      type: 'Event',
      attrs: {
        source: 'edge-1',
        severity: 'high',
        message: 'High severity test event for alert creation',
        timestamp: new Date().toISOString()
      }
    }]
  });
  console.log('✅ High severity event created');
  
  // Events 2-4: Medium severity burst (3 events for Rule 2)
  for (let i = 1; i <= 3; i++) {
    await gql(`
      mutation($input: [EntityInput!]!) {
        upsertEntities(input: $input)
      }
    `, {
      input: [{
        id: `test-event-medium-${Date.now()}-${i}`,
        type: 'Event',
        attrs: {
          source: 'edge-2',
          severity: 'medium',
          message: `Medium severity test event #${i} for burst detection`,
          timestamp: new Date().toISOString()
        }
      }]
    });
    console.log(`✅ Medium event #${i} created`);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Event 5: Critical security event
      await gql(`
        mutation($input: [EntityInput!]!) {
          upsertEntities(input: $input)
        }
      `, {
        input: [{
          id: `test-event-critical-${Date.now()}`,
          type: 'Event',
          attrs: {
            source: 'firewall-1',
            severity: 'high',
            message: 'Critical security breach detected in production system',
            timestamp: new Date().toISOString()
          }
        }]
      });
  console.log('✅ Critical security event created');
  
  console.log('⏳ Waiting 3 seconds for alerts to be created...');
  await new Promise(r => setTimeout(r, 3000));
}

// Scenario 3: Create Silence
async function createTestSilence() {
  console.log('🔕 Creating test silence...');
  
  const silence = await rest('POST', '/silences', {
    name: 'Test Silence - Edge-2',
    matchJson: { type: 'Event', 'attrs.source': 'edge-2' },
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    reason: 'Testing silence functionality - suppressing edge-2 alerts',
    createdBy: 'test-script'
  });
  console.log('✅ Silence created:', silence.id);
  return silence;
}

// Scenario 4: Create Maintenance Window
async function createTestMaintenance() {
  console.log('🔧 Creating test maintenance window...');
  
  const maintenance = await rest('POST', '/maintenance', {
    name: 'Test Maintenance Window',
    matchJson: { type: 'Event', 'attrs.source': 'firewall-1' },
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
    reason: 'Testing maintenance window - suppressing firewall-1 alerts',
    createdBy: 'test-script'
  });
  console.log('✅ Maintenance window created:', maintenance.id);
  return maintenance;
}

// Scenario 5: List Alerts
async function listAlerts() {
  console.log('📊 Listing alerts...');
  const alerts = await rest('GET', '/alerts?limit=20');
  console.log(`✅ Found ${alerts.length} alerts`);
  alerts.forEach(a => {
    console.log(`  - Alert #${a.id}: ${a.message} (${a.severity}, ${a.status})`);
  });
  return alerts;
}

// Scenario 6: Create Case from Alert
async function createCaseFromAlert(alertId) {
  console.log(`📝 Creating case from alert #${alertId}...`);
  
  // First get the alert
  const alerts = await rest('GET', '/alerts');
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) {
    throw new Error(`Alert #${alertId} not found`);
  }
  
  // Create case
  const newCase = await rest('POST', '/cases', {
    title: `[${alert.severity.toUpperCase()}] ${alert.message}`,
    description: `Created from alert #${alertId}`,
    priority: alert.severity,
    status: 'open'
  });
  console.log('✅ Case created:', newCase.id);
  
  // Assign alert to case
  await rest('POST', `/cases/${newCase.id}/alerts:assign`, {
    alert_ids: [alertId]
  });
  console.log('✅ Alert assigned to case');
  
  return newCase;
}

// Run all test scenarios
async function runAllTests() {
  try {
    console.log('🚀 Starting Alert & Case Test Scenarios\n');
    
    // Step 1: Create rules
    const rules = await createTestRules();
    console.log('');
    
    // Step 2: Trigger events
    await triggerTestEvents();
    console.log('');
    
    // Step 3: List alerts
    const alerts = await listAlerts();
    console.log('');
    
    // Step 4: Create silence
    const silence = await createTestSilence();
    console.log('');
    
    // Step 5: Create maintenance
    const maintenance = await createTestMaintenance();
    console.log('');
    
    // Step 6: Create case from first alert (if any)
    if (alerts.length > 0) {
      const testCase = await createCaseFromAlert(alerts[0].id);
      console.log('');
      console.log('✅ Test case created - check Cases tab to see ML suggestions!');
    }
    
    console.log('\n✅ All test scenarios completed!');
    console.log('\nNext steps:');
    console.log('1. Go to Alerts → List tab to see created alerts');
    console.log('2. Go to Alerts → Silences tab to see the silence');
    console.log('3. Go to Alerts → Maintenance tab to see the maintenance window');
    console.log('4. Go to Cases tab to see the created case with ML suggestions');
    console.log('5. Click on the case to see AI insights (priority, owner suggestions)');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export functions for use in console
console.log('✅ Test helpers loaded!');
console.log('Available functions:');
console.log('  - createTestRules()');
console.log('  - triggerTestEvents()');
console.log('  - createTestSilence()');
console.log('  - createTestMaintenance()');
console.log('  - listAlerts()');
console.log('  - createCaseFromAlert(alertId)');
console.log('  - runAllTests() - runs all scenarios');
console.log('\nRun: runAllTests() to execute all test scenarios');

