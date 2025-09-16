/**
 * Test script for Email Notification System
 * This script tests all email notification types implemented in task 15
 */

const EmailQueueService = require('../services/emailQueueService');
const logger = {
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || '')
};

async function testEmailNotifications() {
  console.log('🧪 Testing Email Notification System (Task 15)...\n');

  try {
    const emailQueueService = new EmailQueueService();
    
    // Test data
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testOrderData = {
      orderNumber: 'TEST-' + Date.now(),
      orderId: 'ORD-' + Date.now(),
      totalAmount: '$99.99',
      subtotal: '$89.99',
      taxAmount: '$8.00',
      shippingAmount: '$2.00',
      discountAmount: '$0.00',
      items: [
        { name: 'Premium Bed Texture Set', quantity: 1, price: '$89.99' }
      ],
      createdAt: new Date(),
      customerName: 'Test Customer'
    };

    const testUserData = {
      firstName: 'John',
      lastName: 'Doe',
      email: testEmail,
      userId: 'USER-TEST-' + Date.now()
    };

    const testCartData = {
      items: [
        { name: 'Luxury Bed Texture', quantity: 2, price: '$49.99' }
      ],
      totalAmount: '$99.98',
      checkoutUrl: 'http://localhost:3000/checkout',
      customerName: 'Test Customer'
    };

    console.log('1. Testing Order Confirmation Email...');
    const orderConfirmationId = await emailQueueService.queueOrderConfirmation(testEmail, testOrderData);
    console.log(`✅ Order confirmation queued: ${orderConfirmationId}`);

    console.log('\n2. Testing Order Status Update Email...');
    const statusUpdateData = { ...testOrderData, status: 'processing' };
    const statusUpdateId = await emailQueueService.queueOrderStatusUpdate(testEmail, statusUpdateData);
    console.log(`✅ Order status update queued: ${statusUpdateId}`);

    console.log('\n3. Testing Shipping Notification Email...');
    const shippingData = {
      ...testOrderData,
      status: 'shipped',
      trackingNumber: 'TEST123456789',
      estimatedDelivery: 'Within 3-5 business days',
      trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=TEST123456789'
    };
    const shippingId = await emailQueueService.queueShippingNotification(testEmail, shippingData);
    console.log(`✅ Shipping notification queued: ${shippingId}`);

    console.log('\n4. Testing Welcome Email...');
    const welcomeId = await emailQueueService.queueWelcomeEmail(testEmail, testUserData);
    console.log(`✅ Welcome email queued: ${welcomeId}`);

    console.log('\n5. Testing Abandoned Cart Email Sequence...');
    const abandonedCartIds = [];
    for (let step = 1; step <= 3; step++) {
      const cartId = await emailQueueService.queueAbandonedCartEmail(testEmail, testCartData, step);
      abandonedCartIds.push(cartId);
      console.log(`✅ Abandoned cart email ${step}/3 queued: ${cartId}`);
    }

    console.log('\n6. Testing Email Queue Statistics...');
    const stats = await emailQueueService.getQueueStats();
    console.log('✅ Queue statistics:', stats);

    console.log('\n7. Testing Email Cancellation...');
    const cancelledCount = await emailQueueService.cancelAbandonedCartEmails(testEmail);
    console.log(`✅ Cancelled ${cancelledCount} abandoned cart emails`);

    console.log('\n🎉 All email notification tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('- ✅ Order confirmation email');
    console.log('- ✅ Order status update email');
    console.log('- ✅ Shipping notification email');
    console.log('- ✅ Welcome email for new users');
    console.log('- ✅ Abandoned cart recovery email sequence');
    console.log('- ✅ Email queue management');
    console.log('- ✅ Email cancellation');

    console.log('\n📧 Email Types Implemented:');
    console.log('1. Order Confirmation - Sent when order is created');
    console.log('2. Order Status Updates - Sent when admin updates order status');
    console.log('3. Shipping Notifications - Sent when order status becomes "shipped"');
    console.log('4. Welcome Emails - Sent when new user registers');
    console.log('5. Abandoned Cart Recovery - 3-email sequence (1hr, 24hr, 3 days)');

    console.log('\n🔗 Integration Points:');
    console.log('- Order creation (orderRoutes.js)');
    console.log('- Payment success (paymentRoutes.js)');
    console.log('- Admin order status updates (adminRoutes.js)');
    console.log('- User registration (userRoutes.js)');
    console.log('- Cart abandonment tracking (cartRoutes.js)');

    console.log('\n⚠️  Note: To test actual email delivery, configure AWS SES credentials');
    console.log('Environment variables needed:');
    console.log('- AWS_SES_REGION');
    console.log('- AWS_ACCESS_KEY_ID');
    console.log('- AWS_SECRET_ACCESS_KEY');
    console.log('- AWS_SES_FROM_EMAIL');
    console.log('- AWS_SES_FROM_NAME');
    console.log('- AWS_SES_REPLY_TO_EMAIL');

  } catch (error) {
    console.error('❌ Email notification test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Main execution
async function main() {
  await testEmailNotifications();
  process.exit(0);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

main();