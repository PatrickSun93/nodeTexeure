#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting comprehensive integration tests...\n');

const testSuites = [
  {
    name: 'Backend Unit Tests',
    command: 'cd backend && npm test',
    description: 'Testing all backend services and utilities'
  },
  {
    name: 'Frontend Component Tests',
    command: 'npm test -- --run',
    description: 'Testing React components and hooks'
  },
  {
    name: 'Integration Tests',
    command: 'cd backend && npm run test:integration',
    description: 'Testing external service integrations'
  },
  {
    name: 'E2E Tests',
    command: 'npx playwright test',
    description: 'Testing complete user workflows'
  },
  {
    name: 'Performance Tests',
    command: 'cd backend && npm run test:performance',
    description: 'Testing system performance under load'
  }
];

let allTestsPassed = true;
const results = [];

for (const suite of testSuites) {
  console.log(`📋 Running: ${suite.name}`);
  console.log(`   ${suite.description}`);
  
  try {
    const startTime = Date.now();
    execSync(suite.command, { stdio: 'inherit', timeout: 300000 }); // 5 minute timeout
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${suite.name} passed (${duration}ms)\n`);
    results.push({ name: suite.name, status: 'PASSED', duration });
  } catch (error) {
    console.log(`❌ ${suite.name} failed\n`);
    results.push({ name: suite.name, status: 'FAILED', error: error.message });
    allTestsPassed = false;
  }
}

// Generate test report
const report = {
  timestamp: new Date().toISOString(),
  overallStatus: allTestsPassed ? 'PASSED' : 'FAILED',
  results: results,
  summary: {
    total: results.length,
    passed: results.filter(r => r.status === 'PASSED').length,
    failed: results.filter(r => r.status === 'FAILED').length
  }
};

fs.writeFileSync('test-report.json', JSON.stringify(report, null, 2));

console.log('📊 Test Summary:');
console.log(`   Total: ${report.summary.total}`);
console.log(`   Passed: ${report.summary.passed}`);
console.log(`   Failed: ${report.summary.failed}`);
console.log(`   Overall: ${report.overallStatus}`);

if (allTestsPassed) {
  console.log('\n🎉 All integration tests passed! System is ready for deployment.');
  process.exit(0);
} else {
  console.log('\n💥 Some tests failed. Please review and fix issues before deployment.');
  process.exit(1);
}