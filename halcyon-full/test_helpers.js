// Copy this into browser console (F12) to test alerts
// Make sure you're logged in first!

// Helper function to make GraphQL requests
async function gql(query, variables = {}) {
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  if (!token) {
    throw new Error('Not logged in - please log in first');
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
    throw new Error(JSON.stringify(data.errors));
  }
  return data.data;
}

// Helper function to make REST requests
async function rest(method, path, body = null) {
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  if (!token) {
    throw new Error('Not logged in - please log in first');
  }
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(`http://localhost:8088${path}`, options);
  const data = await res.json();
  return data;
}

// Create alert rules
async function createRules() {
  console.log('📋 Creating alert rules...');
  
  const rule1 = await rest('POST', '/alerts/rules', {
    name: 'High Severity Events',
    description: 'Triggers on high severity events',
    conditionJson: {
      match: { type: 'Event', 'attrs.severity': 'high' },
      window: '5m',
      threshold: 1,
      message: 'High severity event detected: ${attrs.message}'
    },
    severity: 'high',
    enabled: true,
    muteSeconds: 300,
    fingerprintTemplate: '${type}:${attrs.source}:${attrs.severity}',
    correlationKeys: ['type', 'attrs.source']
  });
  console.log('✅ Rule 1 created:', rule1);
  
  const rule2 = await rest('POST', '/alerts/rules', {
    name: 'Medium Severity Burst',
    description: 'Triggers when 3+ medium severity events in 2 minutes',
    conditionJson: {
      match: { type: 'Event', 'attrs.severity': 'medium' },
      window: '2m',
      threshold: 3,
      group_by: 'attrs.source',
      message: 'Medium severity burst from ${attrs.source}'
    },
    severity: 'medium',
    enabled: true,
    muteSeconds: 180,
    fingerprintTemplate: '${type}:${attrs.source}:${attrs.severity}',
    correlationKeys: ['type', 'attrs.source']
  });
  console.log('✅ Rule 2 created:', rule2);
  
  const rule3 = await rest('POST', '/alerts/rules', {
    name: 'Critical Security Breach',
    description: 'Triggers on critical security keywords',
    conditionJson: {
      match: { type: 'Event', 'attrs.message': { $regex: 'breach|critical|security|intrusion' } },
      window: '1m',
      threshold: 1,
      message: 'Critical security event: ${attrs.message}'
    },
    severity: 'high',
    enabled: true,
    muteSeconds: 600,
    fingerprintTemplate: '${type}:${attrs.message}',
    correlationKeys: ['type']
  });
  console.log('✅ Rule 3 created:', rule3);
  
  return { rule1, rule2, rule3 };
}

// Trigger test events
async function triggerEvents() {
  console.log('📨 Triggering test events...');
  
  // High severity event
  await gql(`
    mutation($input: [EntityInput!]!) {
      upsertEntities(input: $input) { upsertedIds }
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
  
  // Medium severity burst (3 events)
  for (let i = 1; i <= 3; i++) {
    await gql(`
      mutation($input: [EntityInput!]!) {
        upsertEntities(input: $input) { upsertedIds }
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
  
  // Critical security event
  await gql(`
    mutation($input: [EntityInput!]!) {
      upsertEntities(input: $input) { upsertedIds }
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
}

// Create silence
async function createSilence() {
  console.log('🔕 Creating silence...');
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
  
  const silence = await rest('POST', '/silences', {
    name: 'Test Silence - Edge-2',
    matchJson: { type: 'Event', 'attrs.source': 'edge-2' },
    startsAt: now.toISOString(),
    endsAt: end.toISOString(),
    reason: 'Testing silence functionality - suppressing edge-2 alerts',
    createdBy: 'test-script'
  });
  console.log('✅ Silence created:', silence);
  return silence;
}

// Create maintenance window
async function createMaintenance() {
  console.log('🔧 Creating maintenance window...');
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
  
  const maintenance = await rest('POST', '/maintenance', {
    name: 'Test Maintenance Window',
    matchJson: { type: 'Event', 'attrs.source': 'firewall-1' },
    startsAt: now.toISOString(),
    endsAt: end.toISOString(),
    reason: 'Testing maintenance window - suppressing firewall-1 alerts',
    createdBy: 'test-script'
  });
  console.log('✅ Maintenance window created:', maintenance);
  return maintenance;
}

// List alerts
async function listAlerts() {
  console.log('📊 Listing alerts...');
  const alerts = await rest('GET', '/alerts?status=open&limit=20');
  console.log(`✅ Found ${alerts.length} open alerts:`, alerts);
  return alerts;
}

// Run all tests
async function runAllTests() {
  try {
    console.log('🚀 Starting alert scenario tests...\n');
    
    await createRules();
    await new Promise(r => setTimeout(r, 2000));
    
    await triggerEvents();
    await new Promise(r => setTimeout(r, 3000));
    
    await listAlerts();
    await new Promise(r => setTimeout(r, 1000));
    
    await createSilence();
    await new Promise(r => setTimeout(r, 1000));
    
    await createMaintenance();
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('\n✅ All tests completed!');
    console.log('\nNext steps:');
    console.log('1. Go to Alerts → List to see created alerts');
    console.log('2. Go to Alerts → Silences to see the silence');
    console.log('3. Go to Alerts → Maintenance to see the maintenance window');
    console.log('4. Select alerts and click "Open as Case" to test case creation');
    console.log('5. Check Cases tab for ML suggestions');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Export functions for use
window.testAlerts = {
  createRules,
  triggerEvents,
  createSilence,
  createMaintenance,
  listAlerts,
  runAllTests,
  gql,
  rest
};

console.log('✅ Test helpers loaded! Run testAlerts.runAllTests() to start');

