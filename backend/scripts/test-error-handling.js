#!/usr/bin/env node

/**
 * Comprehensive Error Handling Test Script
 * Tests all aspects of the enhanced error handling system
 */

const ErrorUtils = require('../utils/errorUtils');
const StripeService = require('../services/stripeService');
const InventoryService = require('../services/inventoryService');
const EmailService = require('../services/emailService');
const EmailQueueService = require('../services/emailQueueService');
const logger = require('../utils/logger');

class ErrorHandlingTester {
  constructor() {
    this.testResults = [];
    this.emailService = new EmailService();
    this.emailQueue = new EmailQueueService();
  }

  /**
   * Run all error handling tests
   */
  async runAllTests() {
    console.log('🧪 Starting Comprehensive Error Handling Tests\n');

    try {
      // Test retry mechanism
      await this.testRetryMechanism();
      
      // Test circuit breaker
      await this.testCircuitBreaker();
      
      // Test payment error handling
      await this.testPaymentErrorHandling();
      
      // Test inventory error handling
      await this.testInventoryErrorHandling();
      
      // Test email error handling
      await this.testEmailErrorHandling();
      
      // Test error classification
      await this.testErrorClassification();
      
      // Test batch error handling
      await this.testBatchErrorHandling();
      
      // Test graceful degradation
      await this.testGracefulDegradation();

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
   * Test payment error handling
   */
  async testPaymentErrorHandling() {
    console.log('💳 Testing Payment Error Handling...');
    
    try {
      // Test with invalid amount (should trigger validation error)
      try {
        await StripeService.createPaymentIntent(-100, 'usd', {});
        this.addTestResult('Payment Validation', false, 'Should have failed with negative amount');
      } catch (error) {
        if (error.type === 'validation_error') {
          this.addTestResult('Payment Validation', true, 'Correctly caught validation error');
        } else {
          this.addTestResult('Payment Validation', false, `Unexpected error type: ${error.type}`);
        }
      }

      // Test error enhancement
      const mockStripeError = new Error('Your card was declined.');
      mockStripeError.type = 'card_error';
      mockStripeError.decline_code = 'insufficient_funds';

      const enhancedError = StripeService._enhancePaymentError(mockStripeError, {
        operation: 'test_payment'
      });

      if (enhancedError.userMessage && enhancedError.recoverySuggestions) {
        this.addTestResult('Payment Error Enhancement', true, 'Error properly enhanced');
      } else {
        this.addTestResult('Payment Error Enhancement', false, 'Error enhancement incomplete');
      }

    } catch (error) {
      this.addTestResult('Payment Error Handling', false, error.message);
    }
  }

  /**
   * Test inventory error handling
   */
  async testInventoryErrorHandling() {
    console.log('📦 Testing Inventory Error Handling...');
    
    try {
      // Test with invalid items array
      const result = await InventoryService.reserveStock([], 'test-cart-id');
      
      if (!result.success && result.type === 'validation_error') {
        this.addTestResult('Inventory Validation', true, 'Correctly caught empty items validation');
      } else {
        this.addTestResult('Inventory Validation', false, 'Should have failed with empty items');
      }

      // Test stock conflict handling
      const mockItems = [
        { product_id: 'nonexistent-product', quantity: 1 }
      ];
      
      const conflictResult = await InventoryService.reserveStock(mockItems, 'test-cart-id');
      
      if (!conflictResult.success) {
        this.addTestResult('Inventory Error Handling', true, 'Correctly handled inventory errors');
      } else {
        this.addTestResult('Inventory Error Handling', false, 'Should have failed with nonexistent product');
      }

    } catch (error) {
      this.addTestResult('Inventory Error Handling', false, error.message);
    }
  }

  /**
   * Test email error handling
   */
  async testEmailErrorHandling() {
    console.log('📧 Testing Email Error Handling...');
    
    try {
      // Test with invalid email address
      try {
        await this.emailService.sendEmail('invalid-email', 'Test Subject', '<p>Test</p>');
        this.addTestResult('Email Validation', false, 'Should have failed with invalid email');
      } catch (error) {
        if (error.type === 'validation_error') {
          this.addTestResult('Email Validation', true, 'Correctly caught email validation error');
        } else {
          this.addTestResult('Email Validation', false, `Unexpected error type: ${error.type}`);
        }
      }

      // Test error enhancement
      const mockSESError = new Error('MessageRejected');
      mockSESError.name = 'MessageRejected';

      const enhancedError = this.emailService._enhanceEmailError(mockSESError, {
        operation: 'test_email'
      });

      if (enhancedError.userMessage && enhancedError.recoverySuggestions) {
        this.addTestResult('Email Error Enhancement', true, 'Email error properly enhanced');
      } else {
        this.addTestResult('Email Error Enhancement', false, 'Email error enhancement incomplete');
      }

    } catch (error) {
      this.addTestResult('Email Error Handling', false, error.message);
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
        { error: { status: 400 }, expected: false, name: 'Client Error' }
      ];

      let correctClassifications = 0;

      for (const test of testErrors) {
        const isRetryable = ErrorUtils.isRetryableError(test.error);
        if (isRetryable === test.expected) {
          correctClassifications++;
        }
      }

      const accuracy = correctClassifications / testErrors.length;
      this.addTestResult('Error Classification', accuracy === 1, 
        `${correctClassifications}/${testErrors.length} correctly classified`);

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
        { id: 4, shouldFail: true }
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

    console.log('\n🎯 Error Handling System Status:');
    if (passedTests === totalTests) {
      console.log('🟢 All error handling components are working correctly!');
    } else if (passedTests / totalTests >= 0.8) {
      console.log('🟡 Most error handling components are working, but some issues need attention.');
    } else {
      console.log('🔴 Significant issues detected in error handling system. Review required.');
    }

    // Log results for audit trail
    logger.info('Error handling test completed', {
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
  const tester = new ErrorHandlingTester();
  tester.runAllTests()
    .then(() => {
      console.log('\n✨ Error handling tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = ErrorHandlingTester;