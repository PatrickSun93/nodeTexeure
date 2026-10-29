const DatabaseUtil = require('../utils/database');
const { randomUUID: uuidv4 } = require('crypto');

async function createTestOrder() {
  console.log('🧪 Creating Test Order...\n');

  try {
    // Create a test user first
    console.log('1. Creating test user...');
    const userId = uuidv4();
    const userResult = await DatabaseUtil.executeQuery(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = id
    `, [userId, 'test@example.com', 'hashed_password', 'Test', 'User', 'customer', 'active', true]);

    if (userResult.success) {
      console.log('✅ Test user created/exists');
    } else {
      console.log('❌ Failed to create test user:', userResult.error);
    }

    // Get next order number
    console.log('\n2. Getting next order number...');
    const orderNumber = await DatabaseUtil.executeQuery('SELECT get_next_id("ORDER") as id');
    const orderNumberValue = orderNumber.success ? orderNumber.data[0].id : 'ORDER0000000001';
    console.log(`✅ Order number: ${orderNumberValue}`);

    // Create test order
    console.log('\n3. Creating test order...');
    const orderId = uuidv4();
    const orderResult = await DatabaseUtil.executeQuery(`
      INSERT INTO orders (
        id, order_number, user_id, status, currency, subtotal, tax_amount, 
        shipping_amount, discount_amount, total_amount, shipping_address_json, 
        billing_address_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      orderId,
      orderNumberValue,
      userId,
      'pending',
      'USD',
      99.99,
      8.00,
      5.99,
      0.00,
      113.98,
      JSON.stringify({
        first_name: 'Test',
        last_name: 'User',
        address_line_1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        country: 'US',
        phone: '555-0123'
      }),
      JSON.stringify({
        first_name: 'Test',
        last_name: 'User',
        address_line_1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        country: 'US',
        phone: '555-0123'
      })
    ]);

    if (orderResult.success) {
      console.log('✅ Test order created successfully');
      console.log(`   Order ID: ${orderId}`);
      console.log(`   Order Number: ${orderNumberValue}`);
    } else {
      console.log('❌ Failed to create test order:', orderResult.error);
      return;
    }

    // Create test order items
    console.log('\n4. Creating test order items...');
    const orderItemId = uuidv4();
    const itemResult = await DatabaseUtil.executeQuery(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name, product_sku, 
        quantity, unit_price, total_price, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      orderItemId,
      orderId,
      'PROD0000000001', // Assuming this product exists
      'Test Bed Sheet Set',
      'TEST-SHEET-001',
      2,
      49.99,
      99.98
    ]);

    if (itemResult.success) {
      console.log('✅ Test order item created');
    } else {
      console.log('❌ Failed to create order item:', itemResult.error);
    }

    // Create initial status history entry
    console.log('\n5. Creating initial status history...');
    const historyId = uuidv4();
    const historyResult = await DatabaseUtil.executeQuery(`
      INSERT INTO order_status_history (
        id, order_id, status, status_details, changed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, NOW())
    `, [
      historyId,
      orderId,
      'pending',
      JSON.stringify({
        notes: 'Order created',
        previous_status: null,
        changed_by_name: 'System'
      }),
      null
    ]);

    if (historyResult.success) {
      console.log('✅ Initial status history created');
    } else {
      console.log('❌ Failed to create status history:', historyResult.error);
    }

    console.log('\n🎉 Test Order Creation Complete!');
    console.log(`\n📋 Test Order Details:`);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Order Number: ${orderNumberValue}`);
    console.log(`   Customer: Test User (test@example.com)`);
    console.log(`   Status: pending`);
    console.log(`   Total: $113.98`);

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }

  // Exit the process
  process.exit(0);
}

// Run the test
createTestOrder().catch(console.error);