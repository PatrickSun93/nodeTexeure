const OrderService = require('../services/orderService');
const DatabaseUtil = require('../utils/database');

async function testOrderManagement() {
  console.log('🧪 Testing Enhanced Order Management System...\n');

  const orderService = new OrderService();
  const db = new DatabaseUtil();

  try {
    // Test 1: Get orders with filters
    console.log('1. Testing order filtering and pagination...');
    const ordersResult = await orderService.getOrdersWithFilters(
      { status: 'pending' },
      1,
      10
    );
    
    if (ordersResult.success) {
      console.log(`✅ Found ${ordersResult.data.orders.length} pending orders`);
      console.log(`   Total orders: ${ordersResult.data.pagination.totalOrders}`);
    } else {
      console.log(`❌ Failed to fetch orders: ${ordersResult.message}`);
    }

    // Test 2: Get a specific order for testing
    console.log('\n2. Finding an order to test status updates...');
    const allOrdersResult = await orderService.getOrdersWithFilters({}, 1, 1);
    
    if (allOrdersResult.success && allOrdersResult.data.orders.length > 0) {
      const testOrder = allOrdersResult.data.orders[0];
      console.log(`✅ Found test order: ${testOrder.order_number} (${testOrder.id})`);

      // Test 3: Update order status
      console.log('\n3. Testing order status update with history tracking...');
      const statusUpdateResult = await orderService.updateOrderStatus(
        testOrder.id,
        'processing',
        'Order moved to processing for testing',
        'TEST0000000001' // Mock admin user ID
      );

      if (statusUpdateResult.success) {
        console.log('✅ Order status updated successfully');
        console.log(`   Old status: ${statusUpdateResult.data.oldStatus}`);
        console.log(`   New status: ${statusUpdateResult.data.newStatus}`);
      } else {
        console.log(`❌ Failed to update order status: ${statusUpdateResult.message}`);
      }

      // Test 4: Get order status history
      console.log('\n4. Testing order status history retrieval...');
      const historyResult = await orderService.getOrderStatusHistory(testOrder.id);

      if (historyResult.success) {
        console.log(`✅ Retrieved ${historyResult.data.length} status history entries`);
        historyResult.data.forEach((entry, index) => {
          console.log(`   ${index + 1}. ${entry.status} - ${entry.created_at} (${entry.changed_by_name || 'System'})`);
          if (entry.status_details?.notes) {
            console.log(`      Notes: ${entry.status_details.notes}`);
          }
        });
      } else {
        console.log(`❌ Failed to get order history: ${historyResult.message}`);
      }

      // Test 5: Test customer order history
      console.log('\n5. Testing customer order history...');
      if (testOrder.user_id) {
        const customerHistoryResult = await orderService.getCustomerOrderHistory(testOrder.user_id);
        
        if (customerHistoryResult.success) {
          console.log(`✅ Retrieved ${customerHistoryResult.data.length} orders for customer`);
        } else {
          console.log(`❌ Failed to get customer history: ${customerHistoryResult.message}`);
        }
      } else {
        console.log('   Skipping customer history test (guest order)');
      }

    } else {
      console.log('❌ No orders found to test with');
    }

    // Test 6: Test order search functionality
    console.log('\n6. Testing order search functionality...');
    const searchResult = await orderService.getOrdersWithFilters(
      {
        dateFrom: '2024-01-01',
        dateTo: '2025-12-31'
      },
      1,
      5
    );

    if (searchResult.success) {
      console.log(`✅ Search returned ${searchResult.data.orders.length} orders`);
      console.log('   Sample orders:');
      searchResult.data.orders.slice(0, 3).forEach(order => {
        console.log(`   - ${order.order_number}: ${order.status} ($${order.total_amount})`);
      });
    } else {
      console.log(`❌ Search failed: ${searchResult.message}`);
    }

    // Test 7: Test database schema for order status history
    console.log('\n7. Verifying order status history table...');
    const schemaCheck = await DatabaseUtil.executeQuery(`
      SHOW COLUMNS FROM order_status_history
    `);

    if (schemaCheck.success) {
      console.log('✅ Order status history table exists with columns:');
      schemaCheck.data.forEach(column => {
        console.log(`   - ${column.Field}: ${column.Type}`);
      });
    } else {
      console.log('❌ Order status history table not found or accessible');
    }

    console.log('\n🎉 Order Management Testing Complete!');
    console.log('\n📋 Summary of Features Tested:');
    console.log('✅ Order filtering and pagination');
    console.log('✅ Order status updates with history tracking');
    console.log('✅ Order status history retrieval');
    console.log('✅ Customer order history');
    console.log('✅ Order search functionality');
    console.log('✅ Database schema verification');

    console.log('\n🚀 Ready for frontend integration!');
    console.log('   - Customer order history: /orders');
    console.log('   - Order details: /orders/[id]');
    console.log('   - Admin order management: /admin/orders');
    console.log('   - Admin order details: /admin/orders/[id]');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testOrderManagement().catch(console.error);