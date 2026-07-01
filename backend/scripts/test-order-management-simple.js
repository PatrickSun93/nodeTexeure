const DatabaseUtil = require('../utils/database');

async function testOrderManagementSimple() {
  console.log('🧪 Testing Order Management Database Schema...\n');

  try {
    // Test 1: Check if order_status_history table exists
    console.log('1. Checking order_status_history table...');
    const schemaCheck = await DatabaseUtil.executeQuery(`
      SHOW COLUMNS FROM order_status_history
    `);

    if (schemaCheck.success) {
      console.log('✅ Order status history table exists with columns:');
      schemaCheck.data.forEach(column => {
        console.log(`   - ${column.Field}: ${column.Type}`);
      });
    } else {
      console.log('❌ Order status history table not found');
    }

    // Test 2: Check if we have any orders
    console.log('\n2. Checking existing orders...');
    const orderCount = await DatabaseUtil.executeQuery(`
      SELECT COUNT(*) as total FROM orders
    `);

    if (orderCount.success) {
      console.log(`✅ Found ${orderCount.data[0].total} orders in database`);
    } else {
      console.log('❌ Failed to count orders');
    }

    // Test 3: Test a simple order query
    console.log('\n3. Testing basic order query...');
    const orderQuery = await DatabaseUtil.executeQuery(`
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_amount,
        o.created_at
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    if (orderQuery.success) {
      console.log(`✅ Retrieved ${orderQuery.data.length} orders`);
      orderQuery.data.forEach(order => {
        console.log(`   - ${order.order_number}: ${order.status} ($${order.total_amount})`);
      });
    } else {
      console.log('❌ Failed to query orders');
    }

    // Test 4: Test order with user join
    console.log('\n4. Testing order query with user join...');
    const joinQuery = await DatabaseUtil.executeQuery(`
      SELECT 
        o.id,
        o.order_number,
        o.status,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), o.guest_email) as customer_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LIMIT 3
    `);

    if (joinQuery.success) {
      console.log(`✅ Join query returned ${joinQuery.data.length} orders`);
      joinQuery.data.forEach(order => {
        console.log(`   - ${order.order_number}: ${order.customer_name}`);
      });
    } else {
      console.log('❌ Join query failed');
    }

    console.log('\n🎉 Database Schema Test Complete!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }

  // Exit the process to prevent hanging
  process.exit(0);
}

// Run the test
testOrderManagementSimple().catch(console.error);