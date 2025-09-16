const stripeService = require('../services/stripeService');
require('dotenv').config();

async function testStripeIntegration() {
  console.log('🧪 Testing Stripe Integration...\n');

  try {
    // Test 1: Create a payment intent
    console.log('1️⃣ Testing payment intent creation...');
    const paymentIntent = await stripeService.createPaymentIntent(
      29.99, // $29.99
      'usd',
      {
        orderId: 'TEST_ORDER_001',
        userId: 'TEST_USER_001',
        testMode: true
      }
    );
    
    console.log('✅ Payment intent created successfully');
    console.log(`   - ID: ${paymentIntent.id}`);
    console.log(`   - Amount: $${paymentIntent.amount / 100}`);
    console.log(`   - Status: ${paymentIntent.status}`);
    console.log(`   - Client Secret: ${paymentIntent.client_secret.substring(0, 20)}...`);

    // Test 2: Retrieve the payment intent
    console.log('\n2️⃣ Testing payment intent retrieval...');
    const retrievedIntent = await stripeService.retrievePaymentIntent(paymentIntent.id);
    
    console.log('✅ Payment intent retrieved successfully');
    console.log(`   - ID: ${retrievedIntent.id}`);
    console.log(`   - Status: ${retrievedIntent.status}`);
    console.log(`   - Metadata: ${JSON.stringify(retrievedIntent.metadata)}`);

    // Test 3: Update payment intent metadata
    console.log('\n3️⃣ Testing payment intent metadata update...');
    const updatedIntent = await stripeService.updatePaymentIntentMetadata(
      paymentIntent.id,
      {
        ...paymentIntent.metadata,
        testCompleted: 'true',
        timestamp: new Date().toISOString()
      }
    );
    
    console.log('✅ Payment intent metadata updated successfully');
    console.log(`   - Updated metadata: ${JSON.stringify(updatedIntent.metadata)}`);

    // Test 4: Create a test customer
    console.log('\n4️⃣ Testing customer creation...');
    const customer = await stripeService.createCustomer(
      'test@example.com',
      'Test Customer',
      {
        testMode: true,
        source: 'integration_test'
      }
    );
    
    console.log('✅ Customer created successfully');
    console.log(`   - ID: ${customer.id}`);
    console.log(`   - Email: ${customer.email}`);
    console.log(`   - Name: ${customer.name}`);

    console.log('\n🎉 All Stripe integration tests passed!');
    console.log('\n📋 Summary:');
    console.log(`   - Payment Intent ID: ${paymentIntent.id}`);
    console.log(`   - Customer ID: ${customer.id}`);
    console.log(`   - Test Amount: $${paymentIntent.amount / 100}`);
    console.log(`   - Status: Ready for frontend integration`);

  } catch (error) {
    console.error('\n❌ Stripe integration test failed:', error.message);
    
    if (error.message.includes('Invalid API Key')) {
      console.log('\n💡 Tip: Make sure to set your STRIPE_SECRET_KEY in the .env file');
      console.log('   You can get your test keys from: https://dashboard.stripe.com/test/apikeys');
    }
    
    if (error.message.includes('STRIPE_SECRET_KEY environment variable is required')) {
      console.log('\n💡 Please add your Stripe secret key to backend/.env:');
      console.log('   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here');
    }
    
    process.exit(1);
  }
}

// Run test if called directly
if (require.main === module) {
  testStripeIntegration();
}

module.exports = testStripeIntegration;