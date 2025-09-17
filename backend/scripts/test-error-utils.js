#!/usr/bin/env node

/**
 * Error Utilities Test Script
 * Tests the core error handling utilities without external dependencies
 */

const ErrorUtils = require('../utils/errorUtils');
const logger = require('../utils/logger');

class ErrorUtilsTester {
  constructor() {
    this.testResults = [];
  }

  /**
   * Run all error utility tests
   */
  async runAllTests() {
    console.log('🧪 Starting Error Utilities Tests\n');

    try {
      // Test retry mechanism
      await this.testRetryMechanism();
      
      // Test circuit breaker
      await this.testCircuitBreaker();
      
      // Test error classification
      await this.testErrorClassification();
      
      // Test batch error handling
      await this.testBatchErrorHandling();
      
      // Test graceful degradation
      await this.testGracefulDegradation();
      
      // Test user-friendly messages
      await this.testUserFriendlyMessages();

      // Print results
      this.printTestResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Test retry mechanism with exponential backoff
   */
  async testRetryMechanism() {
    console.log('🔄 Testing Retry Mechanism...');
    
    let attemptCount = 0;
    const maxAttempts = 3;

    try {
      await ErrorUtils.retryWithBackoff(
        async () => {
          attemptCount++;
          if (attemptCount < maxAttempts) {
            const error = new Error(`Attempt ${attemptCount} failed`);
            error.code = 'ECONNREFUSED'; // Retryable error
            throw error;
          }
          return { success: true, attempts: attemptCount };
        },
        maxAttempts,
        100, // Short delay for testing
        500
      );

      this.addTestResult('Retry Mechanism', true, `Succeeded after ${attemptCount} attempts`);
    } catch (error) {
      this.addTestResult('Retry Mechanism', false, error.message);
    }
  }

  /**
   * Test circuit breaker pattern
   */
  async testCircuitBreaker() {
    console.log('⚡ Testing Circuit Breaker...');
    
    let callCount = 0;
    const failingOperation = async () => {
      callCount++;
      throw new Error(`Call ${callCount} failed`);
    };

    const circuitBreaker = ErrorUtils.createCircuitBreaker(failingOperation, {
      failureThreshold: 3,
      resetTimeout: 1000
    });

    try {
      // Make calls that will fail and open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker();
        } catch (error) {
          if (error.type === 'circuit_breaker_open') {
            this.addTestResult('Circuit Breaker', true, 'Circuit opened after failures');
            return;
          }
        }
      }
      
      this.addTestResult('Circuit Breaker', false, 'Circuit did not open as expected');
    } catch (error) {
      this.addTestResult('Circuit Breaker', false, error.message);
    }
  }

  /**
   * Test error classification
   */
  async testErrorClassification() {
    console.log('🏷️ Testing Error Classification...');
    
    try {
      const testErrors = [
        { error: new Error('ECONNREFUSED'), expected: true, name: 'Network Error' },
        { error: new Error('Invalid email'), expected: false, name: 'Validation Error' },
        { error: { status: 500 }, expected: true, name: 'Server Error' },
        { error: { status: 400 }, expected: false, name: 'Client Error' },
        { error: { code: 'ETIMEDOUT' }, expected: true, name: 'Timeout Error' },
        { error: { type: 'rate_limit_error' }, expected: true, name: 'Rate Limit Error' }
      ];

      let correctClassifications = 0;

      for (const test of testErrors) {
        const isRetryable = ErrorUtils.isRetryableError(test.error);
        if (isRetryable === test.expected) {
          correctClassifications++;
        } else {
          console.log(`  ❌ ${test.name}: Expected ${test.expected}, got ${isRetryable}`);
        }
      }

      const accuracy = correctClassifications / testErrors.length;
      this.addTestResult('Error Classification', accuracy === 1, 
        `${correctClassifications}/${testErrors.length} correctly classified (${Math.round(accuracy * 100)}%)`);

    } catch (error) {
      this.addTestResult('Error Classification', false, error.message);
    }
  }

  /**
   * Test batch error handling
   */
  async testBatchErrorHandling() {
    console.log('📊 Testing Batch Error Handling...');
    
    try {
      const items = [
        { id: 1, shouldFail: false },
        { id: 2, shouldFail: true },
        { id: 3, shouldFail: false },
        { id: 4, shouldFail: true },
        { id: 5, shouldFail: false }
      ];

      const processor = async (item) => {
        if (item.shouldFail) {
          throw new Error(`Item ${item.id} failed`);
        }
        return { processed: item.id };
      };

      const result = await ErrorUtils.processBatchWithErrorHandling(
        items,
        processor,
        { continueOnError: true, collectErrors: true }
      );

      const expectedSuccesses = items.filter(i => !i.shouldFail).length;
      const expectedErrors = items.filter(i => i.shouldFail).length;

      if (result.successCount === expectedSuccesses && result.errorCount === expectedErrors) {
        this.addTestResult('Batch Error Handling', true, 
          `Correctly processed ${result.successCount} successes and ${result.errorCount} errors`);
      } else {
        this.addTestResult('Batch Error Handling', false, 
          `Expected ${expectedSuccesses}/${expectedErrors}, got ${result.successCount}/${result.errorCount}`);
      }

    } catch (error) {
      this.addTestResult('Batch Error Handling', false, error.message);
    }
  }

  /**
   * Test graceful degradation
   */
  async testGracefulDegradation() {
    console.log('🛡️ Testing Graceful Degradation...');
    
    try {
      const primaryOperation = async () => {
        throw new Error('Primary service unavailable');
      };

      const fallbackOperation = async () => {
        return { source: 'fallback', data: 'fallback data' };
      };

      const result = await ErrorUtils.withFallback(
        primaryOperation,
        fallbackOperation,
        { operation: 'test_fallback' }
      );

      if (result.source === 'fallback') {
        this.addTestResult('Graceful Degradation', true, 'Successfully fell back to secondary operation');
      } else {
        this.addTestResult('Graceful Degradation', false, 'Fallback did not work as expected');
      }

    } catch (error) {
      this.addTestResult('Graceful Degradation', false, error.message);
    }
  }

  /**
   * Test user-friendly message generation
   */
  async testUserFriendlyMessages() {
    console.log('💬 Testing User-Friendly Messages...');
    
    try {
      const testErrors = [
        { type: 'payment_error', expected: 'payment' },
        { type: 'inventory_error', expected: 'inventory' },
        { type: 'email_error', expected: 'email' },
        { type: 'validation_error', expected: 'input' },
        { type: 'unknown', expected: 'unexpected' }
      ];

      let correctMessages = 0;

      for (const test of testErrors) {
        const error = new Error('Test error');
        error.type = test.type;
        
        const userMessage = ErrorUtils.createUserFriendlyMessage(error);
        const recoveryActions = ErrorUtils.getRecoveryActions(error);
        
        if (userMessage.toLowerCase().includes(test.expected) && 
            Array.isArray(recoveryActions) && recoveryActions.length > 0) {
          correctMessages++;
        }
      }

      const accuracy = correctMessages / testErrors.length;
      this.addTestResult('User-Friendly Messages', accuracy >= 0.8, 
        `${correctMessages}/${testErrors.length} messages generated correctly`);

    } catch (error) {
      this.addTestResult('User-Friendly Messages', false, error.message);
    }
  }

  /**
   * Add test result
   */
  addTestResult(testName, passed, details) {
    this.testResults.push({
      name: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    });

    const status = passed ? '✅' : '❌';
    console.log(`  ${status} ${testName}: ${details}`);
  }

  /**
   * Print comprehensive test results
   */
  printTestResults() {
    console.log('\n📋 Test Results Summary');
    console.log('========================');

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.details}`);
        });
    }

    console.log('\n🎯 Error Utilities Status:');
    if (passedTests === totalTests) {
      console.log('🟢 All error handling utilities are working correctly!');
    } else if (passedTests / totalTests >= 0.8) {
      console.log('🟡 Most error handling utilities are working, but some issues need attention.');
    } else {
      console.log('🔴 Significant issues detected in error handling utilities. Review required.');
    }

    // Log results for audit trail
    logger.info('Error utilities test completed', {
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      success_rate: (passedTests / totalTests) * 100,
      test_results: this.testResults
    });
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new ErrorUtilsTester();
  tester.runAllTests()
    .then(() => {
      console.log('\n✨ Error utilities tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = ErrorUtilsTester;