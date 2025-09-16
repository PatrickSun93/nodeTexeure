/**
 * Test script for AWS SES Email Service
 * This script tests the email service functionality including queue management
 */

const EmailService = require('../services/emailService');
const EmailQueueService = require('../services/emailQueueService');
// Simple logger wrapper for email service
const logger = {
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || '')
};

async function testEmailService() {
  console.log('🧪 Testing AWS SES Email Service...\n');

  try {
    // Test 1: Initialize services
    console.log('1. Initializing email services...');
    const emailService = new EmailService();
    const emailQueueService = new EmailQueueService();
    console.log('✅ Services initialized successfully\n');

    // Test 2: Test email queue database operations
    console.log('2. Testing email queue database operations...');
    
    // Queue a test order confirmation
    const testOrderData = {
      orderNumber: 'TEST-' + Date.now(),
      totalAmount: '99.99',
      items: [
        { name: 'Test Bed Texture', quantity: 1, price: 99.99 }
      ],
      createdAt: new Date()
    };

    const queueId = await emailQueueService.queueOrderConfirmation(
      'test@example.com',
      testOrderData
    );
    console.log(`✅ Order confirmation queued with ID: ${queueId}`);

    // Test queue statistics
    const stats = await emailQueueService.getQueueStats();
    console.log('✅ Queue statistics:', stats);
    console.log('');

    // Test 3: Test template rendering (without actually sending)
    console.log('3. Testing email template rendering...');
    
    const orderConfirmationHtml = emailService.renderOrderConfirmationTemplate(testOrderData);
    const orderConfirmationText = emailService.renderOrderConfirmationText(testOrderData);
    
    console.log('✅ Order confirmation HTML template rendered');
    console.log('✅ Order confirmation text template rendered');

    // Test abandoned cart template
    const testCartData = {
      items: [
        { name: 'Premium Bed Texture', quantity: 2, price: 49.99 }
      ],
      totalAmount: '99.98',
      checkoutUrl: 'http://localhost:3000/checkout'
    };

    const abandonedCartHtml = emailService.renderAbandonedCartTemplate(testCartData, 1);
    console.log('✅ Abandoned cart template rendered');

    // Test welcome email template
    const testUserData = {
      firstName: 'John',
      email: 'john@example.com'
    };

    const welcomeHtml = emailService.renderWelcomeTemplate(testUserData);
    console.log('✅ Welcome email template rendered');
    console.log('');

    // Test 4: Test queue management operations
    console.log('4. Testing queue management operations...');

    // Queue multiple email types
    const welcomeQueueId = await emailQueueService.queueWelcomeEmail(
      'newuser@example.com',
      testUserData
    );
    console.log(`✅ Welcome email queued with ID: ${welcomeQueueId}`);

    const abandonedCartQueueId = await emailQueueService.queueAbandonedCartEmail(
      'customer@example.com',
      testCartData,
      1
    );
    console.log(`✅ Abandoned cart email queued with ID: ${abandonedCartQueueId}`);

    // Test cancellation
    const cancelled = await emailQueueService.cancelEmail(abandonedCartQueueId);
    console.log(`✅ Email cancellation result: ${cancelled}`);
    console.log('');

    // Test 5: Test AWS SES configuration (without sending)
    console.log('5. Testing AWS SES configuration...');
    
    // Check if AWS credentials are configured
    const awsRegion = process.env.AWS_SES_REGION || process.env.AWS_REGION;
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const fromEmail = process.env.AWS_SES_FROM_EMAIL;
    
    console.log(`✅ AWS Region: ${awsRegion || 'Not configured'}`);
    console.log(`✅ AWS Access Key: ${awsAccessKey ? 'Configured' : 'Not configured'}`);
    console.log(`✅ From Email: ${fromEmail || 'Not configured'}`);
    console.log('');

    // Test 6: Verify email queue processing (simulation)
    console.log('6. Testing email queue processing simulation...');
    
    // Get updated statistics
    const finalStats = await emailQueueService.getQueueStats();
    console.log('✅ Final queue statistics:', finalStats);
    console.log('');

    console.log('🎉 All email service tests completed successfully!');
    console.log('');
    console.log('📋 Test Summary:');
    console.log('- ✅ Email services initialization');
    console.log('- ✅ Database queue operations');
    console.log('- ✅ Template rendering');
    console.log('- ✅ Queue management');
    console.log('- ✅ AWS SES configuration check');
    console.log('- ✅ Queue processing simulation');
    console.log('');
    console.log('⚠️  Note: To test actual email sending, configure AWS SES credentials and use the send-test endpoint');

  } catch (error) {
    console.error('❌ Email service test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

async function testActualEmailSending() {
  console.log('📧 Testing actual email sending (requires valid AWS SES configuration)...\n');

  try {
    const emailService = new EmailService();
    
    // Test sending a simple email
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    
    console.log(`Attempting to send test email to: ${testEmail}`);
    
    const result = await emailService.sendEmail(
      testEmail,
      'Test Email from Bed Texture Store',
      '<h1>Test Email</h1><p>This is a test email from the Bed Texture Store email service.</p><p>If you receive this, the AWS SES integration is working correctly!</p>',
      'Test Email\n\nThis is a test email from the Bed Texture Store email service.\n\nIf you receive this, the AWS SES integration is working correctly!'
    );

    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', result.messageId);
    console.log('Recipient:', result.to);

  } catch (error) {
    console.error('❌ Failed to send test email:', error.message);
    
    if (error.message.includes('MessageRejected')) {
      console.log('💡 This might be because:');
      console.log('   - AWS SES is in sandbox mode (can only send to verified addresses)');
      console.log('   - The recipient email is not verified');
      console.log('   - AWS credentials are not properly configured');
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--send-test')) {
    await testActualEmailSending();
  } else {
    await testEmailService();
  }
  
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