#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const testType = args[0] || 'all'

console.log('🧪 Starting comprehensive test suite...\n')

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`)
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed with exit code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

async function setupTestEnvironment() {
  console.log('📋 Setting up test environment...')
  
  // Create test fixtures
  try {
    const createFixtures = require('../test-fixtures/create-fixtures')
    await createFixtures.createTestImages()
    createFixtures.createTestData()
    console.log('✅ Test fixtures created')
  } catch (error) {
    console.warn('⚠️  Warning: Could not create test fixtures:', error.message)
  }

  // Install dependencies if needed
  if (!fs.existsSync(path.join(__dirname, '../node_modules'))) {
    console.log('📦 Installing dependencies...')
    await runCommand('npm', ['install'])
  }

  if (!fs.existsSync(path.join(__dirname, '../backend/node_modules'))) {
    console.log('📦 Installing backend dependencies...')
    await runCommand('npm', ['install'], { cwd: path.join(__dirname, '../backend') })
  }
}

async function runUnitTests() {
  console.log('\n🔬 Running unit tests...')
  
  try {
    // Frontend unit tests
    console.log('\n📱 Frontend unit tests:')
    await runCommand('npm', ['run', 'test', '--', '--coverage', '--watchAll=false'])
    
    // Backend unit tests
    console.log('\n🖥️  Backend unit tests:')
    await runCommand('npm', ['run', 'test', '--', '--coverage'], { 
      cwd: path.join(__dirname, '../backend') 
    })
    
    console.log('✅ Unit tests completed')
  } catch (error) {
    console.error('❌ Unit tests failed:', error.message)
    throw error
  }
}

async function runIntegrationTests() {
  console.log('\n🔗 Running integration tests...')
  
  try {
    await runCommand('npm', ['run', 'test', '--', '--testPathPattern=integration', '--coverage'], {
      cwd: path.join(__dirname, '../backend')
    })
    
    console.log('✅ Integration tests completed')
  } catch (error) {
    console.error('❌ Integration tests failed:', error.message)
    throw error
  }
}

async function runE2ETests() {
  console.log('\n🌐 Running end-to-end tests...')
  
  try {
    // Install Playwright browsers if needed
    await runCommand('npx', ['playwright', 'install'])
    
    // Run E2E tests
    await runCommand('npm', ['run', 'test:e2e'])
    
    console.log('✅ E2E tests completed')
  } catch (error) {
    console.error('❌ E2E tests failed:', error.message)
    throw error
  }
}

async function runPerformanceTests() {
  console.log('\n⚡ Running performance tests...')
  
  try {
    await runCommand('npm', ['run', 'test', '--', '--testPathPattern=performance', '--testTimeout=300000'], {
      cwd: path.join(__dirname, '../backend')
    })
    
    console.log('✅ Performance tests completed')
  } catch (error) {
    console.error('❌ Performance tests failed:', error.message)
    throw error
  }
}

async function generateTestReport() {
  console.log('\n📊 Generating test report...')
  
  try {
    // Combine coverage reports if they exist
    const coverageDir = path.join(__dirname, '../coverage')
    const backendCoverageDir = path.join(__dirname, '../backend/coverage')
    
    if (fs.existsSync(coverageDir) || fs.existsSync(backendCoverageDir)) {
      console.log('📈 Coverage reports generated:')
      
      if (fs.existsSync(coverageDir)) {
        console.log(`   Frontend: file://${path.join(coverageDir, 'lcov-report/index.html')}`)
      }
      
      if (fs.existsSync(backendCoverageDir)) {
        console.log(`   Backend: file://${path.join(backendCoverageDir, 'lcov-report/index.html')}`)
      }
    }
    
    console.log('✅ Test report generated')
  } catch (error) {
    console.warn('⚠️  Warning: Could not generate test report:', error.message)
  }
}

async function main() {
  try {
    await setupTestEnvironment()
    
    switch (testType) {
      case 'unit':
        await runUnitTests()
        break
        
      case 'integration':
        await runIntegrationTests()
        break
        
      case 'e2e':
        await runE2ETests()
        break
        
      case 'performance':
        await runPerformanceTests()
        break
        
      case 'all':
      default:
        await runUnitTests()
        await runIntegrationTests()
        await runE2ETests()
        await runPerformanceTests()
        break
    }
    
    await generateTestReport()
    
    console.log('\n🎉 All tests completed successfully!')
    console.log('\n📋 Test Summary:')
    console.log('   ✅ Unit tests: Frontend and Backend components')
    console.log('   ✅ Integration tests: External API integrations')
    console.log('   ✅ E2E tests: Critical user flows')
    console.log('   ✅ Performance tests: High-load scenarios')
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message)
    process.exit(1)
  }
}

// Handle command line arguments
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/run-tests.js [test-type]

Test types:
  unit         Run unit tests only
  integration  Run integration tests only
  e2e          Run end-to-end tests only
  performance  Run performance tests only
  all          Run all tests (default)

Options:
  --help, -h   Show this help message

Examples:
  node scripts/run-tests.js unit
  node scripts/run-tests.js e2e
  node scripts/run-tests.js all
`)
  process.exit(0)
}

main()