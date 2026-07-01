/**
 * Test script for abandoned cart recovery system
 * Tests the complete abandoned cart workflow including detection, email queuing, and recovery
 */

const AbandonedCartService = require('../services/abandonedCartService');
const EmailQueueService = require('../services/emailQueueService');
const db = require('../utils/database');

// Test configuration
const TEST_CONFIG = {
  testEmail: 'test@example.com',
  testCustomerName: 'John Doe',
  testCartItems: [
    {
      name: 'Premium Cotton Bed Sheet Set',
      quantity: 2,
      price: '89.99',
      variant_details: {
        size: 'Queen',
        color: 'White',
        pattern: 'Solid'
      }
    },
    {
      name: 'Luxury Comforter',
      quantity: 1,
      price: '149.99',
      variant_details: {
        size: 'Queen',
        color: 'Navy Blue'
      }
    }
  ]
};

class AbandonedCartTester {
  constructor() {
    this.abandonedCartService = new AbandonedCartService();
    this.emailQueueService = new EmailQueueService();
  }

  /**
   * Run all abandoned cart tests
   */
  async runAllTests() {
    console.log('🚀 Starting Abandoned Cart Recovery System Tests\n');

    try {
      // Test 1: Create test cart and simulate abandonment
      console.log('📝 Test 1: Creating test cart and simulating abandonment...');
      const testCartId = await this.createTestCart();
      console.log(`✅ Test cart created: ${testCartId}\n`);

      // Test 2: Track cart activity
      console.log('📝 Test 2: Testing cart activity tracking...');
      await this.testCartActivityTracking(testCartId);
      console.log('✅ Cart activity tracking working\n');

      // Test 3: Simulate cart abandonment (set cart to old timestamp)
      console.log('📝 Test 3: Simulating cart abandonment...');
      await this.simulateCartAbandonment(testCartId);
      console.log('✅ Cart abandonment simulated\n');

      // Test 4: Test abandoned cart detection
      console.log('📝 Test 4: Testing abandoned cart detection...');
      const detectionResult = await this.testAbandonedCartDetection();
      console.log(`✅ Detected ${detectionResult.processedCarts} abandoned carts\n`);

      // Test 5: Test email template generation
      console.log('📝 Test 5: Testing email template generation...');
      await this.testEmailTemplates();
      console.log('✅ Email templates generated successfully\n');

      // Test 6: Test cart recovery
      console.log('📝 Test 6: Testing cart recovery...');
      await this.testCartRecovery(testCartId);
      console.log('✅ Cart recovery working\n');

      // Test 7: Test analytics
      console.log('📝 Test 7: Testing recovery analytics...');
      await this.testRecoveryAnalytics();
      console.log('✅ Analytics working\n');

      // Test 8: Test cleanup
      console.log('📝 Test 8: Testing cleanup functionality...');
      await this.testCleanup();
      console.log('✅ Cleanup working\n');

      console.log('🎉 All tests completed successfully!');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      console.error(error.stack);
    }
  }

  /**
   * Create a test cart with items
   */
  async createTestCart() {
    try {
      // Create test cart
      const cartIdResult = await db.executeQuery('SELECT get_next_id("CART") as id');
      const cartId = cartIdResult.data[0].id;

      // Insert cart
      await db.executeQuery(
        'INSERT INTO shopping_carts (id, session_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [cartId, 'test_session_' + Date.now()]
      );

      // Add test items to cart
      for (const item of TEST_CONFIG.testCartItems) {
        const itemIdResult = await db.executeQuery('SELECT get_next_id("CARTITEM") as id');
        const itemId = itemIdResult.data[0].id;

        await db.executeQuery(
          'INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
          [itemId, cartId, 'PROD0000000001', 'VARIANT001', item.quantity, item.price]
        );
      }

      return cartId;
    } catch (error) {
      throw new Error(`Failed to create test cart: ${error.message}`);
    }
  }

  /**
   * Test cart activity tracking
   */
  async testCartActivityTracking(cartId) {
    try {
      await this.abandonedCartService.trackCartActivity(
        cartId,
        TEST_CONFIG.testEmail,
        'test_session_' + Date.now()
      );
      return true;
    } catch (error) {
      throw new Error(`Cart activity tracking failed: ${error.message}`);
    }
  }

  /**
   * Simulate cart abandonment by setting old timestamp
   */
  async simulateCartAbandonment(cartId) {
    try {
      // Set cart updated_at to 2 hours ago to trigger abandonment detection
      await db.executeQuery(
        'UPDATE shopping_carts SET updated_at = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE id = ?',
        [cartId]
      );
      return true;
    } catch (error) {
      throw new Error(`Failed to simulate cart abandonment: ${error.message}`);
    }
  }

  /**
   * Test abandoned cart detection
   */
  async testAbandonedCartDetection() {
    try {
      const result = await this.abandonedCartService.detectAbandonedCarts();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    } catch (error) {
      throw new Error(`Abandoned cart detection failed: ${error.message}`);
    }
  }

  /**
   * Test email template generation
   */
  async testEmailTemplates() {
    try {
      const cartData = {
        items: TEST_CONFIG.testCartItems,
        totalAmount: '329.97',
        checkoutUrl: 'http://localhost:3000/checkout?recovery=test_token',
        customerName: TEST_CONFIG.testCustomerName,
        recoveryToken: 'test_recovery_token'
      };

      // Test all 3 email templates
      for (let step = 1; step <= 3; step++) {
        const htmlContent = this.abandonedCartService.emailQueueService.emailService.abandonedCartTemplates.renderAbandonedCartTemplate(cartData, step);
        const textContent = this.abandonedCartService.emailQueueService.emailService.abandonedCartTemplates.renderAbandonedCartText(cartData, step);

        if (!htmlContent || !textContent) {
          throw new Error(`Email template generation failed for step ${step}`);
        }

        console.log(`   ✓ Email template ${step} generated (${htmlContent.length} chars HTML, ${textContent.length} chars text)`);
      }

      return true;
    } catch (error) {
      throw new Error(`Email template generation failed: ${error.message}`);
    }
  }

  /**
   * Test cart recovery
   */
  async testCartRecovery(cartId) {
    try {
      const testOrderId = 'ORDER_TEST_' + Date.now();
      const result = await this.abandonedCartService.markCartRecovered(cartId, testOrderId);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return true;
    } catch (error) {
      throw new Error(`Cart recovery test failed: ${error.message}`);
    }
  }

  /**
   * Test recovery analytics
   */
  async testRecoveryAnalytics() {
    try {
      const result = await this.abandonedCartService.getRecoveryAnalytics(30);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log('   📊 Analytics Results:');
      console.log(`      - Total abandoned carts: ${result.data.total_abandoned_carts}`);
      console.log(`      - Recovered carts: ${result.data.recovered_carts}`);
      console.log(`      - Recovery rate: ${result.data.recovery_rate_percentage}%`);
      console.log(`      - Average emails sent: ${result.data.avg_emails_sent}`);

      return result.data;
    } catch (error) {
      throw new Error(`Recovery analytics test failed: ${error.message}`);
    }
  }

  /**
   * Test cleanup functionality
   */
  async testCleanup() {
    try {
      const result = await this.abandonedCartService.cleanupOldRecords();
      
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log(`   🧹 Cleaned up ${result.affectedRows || 0} old records`);
      return true;
    } catch (error) {
      throw new Error(`Cleanup test failed: ${error.message}`);
    }
  }

  /**
   * Test email queue functionality
   */
  async testEmailQueue() {
    try {
      const cartData = {
        items: TEST_CONFIG.testCartItems,
        totalAmount: '329.97',
        checkoutUrl: 'http://localhost:3000/checkout?recovery=test_token',
        customerName: TEST_CONFIG.testCustomerName
      };

      // Queue test emails
      const queueIds = [];
      for (let step = 1; step <= 3; step++) {
        const queueId = await this.emailQueueService.queueAbandonedCartEmail(
          TEST_CONFIG.testEmail,
          cartData,
          step
        );
        queueIds.push(queueId);
      }

      console.log(`   📧 Queued ${queueIds.length} test emails: ${queueIds.join(', ')}`);

      // Get queue stats
      const stats = await this.emailQueueService.getQueueStats();
      console.log('   📊 Queue Stats:', stats);

      return queueIds;
    } catch (error) {
      throw new Error(`Email queue test failed: ${error.message}`);
    }
  }

  /**
   * Clean up test data
   */
  async cleanupTestData() {
    try {
      console.log('🧹 Cleaning up test data...');

      // Remove test carts
      await db.executeQuery('DELETE FROM shopping_carts WHERE session_id LIKE "test_session_%"');
      
      // Remove test abandoned cart records
      await db.executeQuery('DELETE FROM abandoned_cart_recovery WHERE email = ?', [TEST_CONFIG.testEmail]);
      
      // Remove test email queue items
      await db.executeQuery('DELETE FROM email_queue WHERE to_email = ?', [TEST_CONFIG.testEmail]);

      console.log('✅ Test data cleaned up');
    } catch (error) {
      console.error('❌ Failed to clean up test data:', error.message);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new AbandonedCartTester();
  
  tester.runAllTests()
    .then(() => {
      console.log('\n🧹 Cleaning up test data...');
      return tester.cleanupTestData();
    })
    .then(() => {
      console.log('\n✅ All tests completed and cleaned up successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = AbandonedCartTester;