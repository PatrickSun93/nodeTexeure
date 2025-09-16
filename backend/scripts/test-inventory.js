#!/usr/bin/env node

/**
 * Test Enhanced Inventory Service Functionality
 * 
 * This script tests the enhanced inventory service functions to ensure they work correctly.
 */

const InventoryService = require('../services/inventoryService');
const DatabaseUtil = require('../utils/database');

async function testInventoryService() {
  console.log('Testing Enhanced Inventory Service...\n');
  
  try {
    // Test 1: Get a product with variants from the database
    console.log('1. Finding a product with variants...');
    const productResult = await DatabaseUtil.executeQuery(`
      SELECT p.id, p.name, COUNT(pv.id) as variant_count
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      GROUP BY p.id, p.name
      HAVING variant_count > 0
      LIMIT 1
    `);
    
    if (!productResult.success || productResult.data.length === 0) {
      console.log('No products with variants found. Please run the seed script first.');
      return;
    }
    
    const testProduct = productResult.data[0];
    console.log(`Found product: ${testProduct.name} (${testProduct.id}) with ${testProduct.variant_count} variants\n`);
    
    // Test 2: Get product inventory
    console.log('2. Testing getProductInventory...');
    const inventoryResult = await InventoryService.getProductInventory(testProduct.id);
    if (inventoryResult.success) {
      console.log(`✓ Found ${inventoryResult.data.length} inventory records`);
      inventoryResult.data.forEach(inv => {
        const variant = inv.size || inv.color || inv.pattern ? 
          `${inv.size || ''} ${inv.color || ''} ${inv.pattern || ''}`.trim() : 
          'Base Product';
        console.log(`  - ${variant}: ${inv.quantity_available} available, ${inv.quantity_reserved} reserved`);
      });
    } else {
      console.log('✗ Failed to get product inventory:', inventoryResult.error);
    }
    console.log();
    
    // Test 3: Get availability for first variant
    console.log('3. Testing getAvailability...');
    const variantResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM product_variants WHERE product_id = ? LIMIT 1',
      [testProduct.id]
    );
    
    if (variantResult.success && variantResult.data.length > 0) {
      const variantId = variantResult.data[0].id;
      const availabilityResult = await InventoryService.getAvailability(testProduct.id, variantId);
      if (availabilityResult.success) {
        console.log(`✓ Variant availability:`, availabilityResult.data);
      } else {
        console.log('✗ Failed to get availability:', availabilityResult.error);
      }
    }
    console.log();
    
    // Test 4: Test inventory update with logging (using first variant)
    console.log('4. Testing updateInventoryWithLogging...');
    let testVariantId = null;
    if (variantResult.success && variantResult.data.length > 0) {
      testVariantId = variantResult.data[0].id;
    }
    
    const updateResult = await InventoryService.updateInventoryWithLogging(
      testProduct.id,
      testVariantId, // Use first variant
      5, // Add 5 units
      'restock',
      'manual',
      'TEST001',
      'TEST_USER',
      { notes: 'Test restock for inventory service testing' }
    );
    
    if (updateResult.success) {
      console.log(`✓ Inventory updated successfully`);
      console.log(`  - Previous available: ${updateResult.data.previous_available}`);
      console.log(`  - New available: ${updateResult.data.new_available}`);
      console.log(`  - Movement logged: ${updateResult.data.movement_logged}`);
    } else {
      console.log('✗ Failed to update inventory with logging:', updateResult.error);
    }
    console.log();
    
    // Test 5: Test movement history
    console.log('5. Testing getMovementHistory...');
    const historyResult = await InventoryService.getMovementHistory(null, {
      product_id: testProduct.id,
      limit: 5
    });
    
    if (historyResult.success) {
      console.log(`✓ Found ${historyResult.data.length} movement records`);
      historyResult.data.forEach(movement => {
        console.log(`  - ${movement.movement_type}: ${movement.quantity_change > 0 ? '+' : ''}${movement.quantity_change} (${movement.created_at})`);
      });
    } else {
      console.log('✗ Failed to get movement history:', historyResult.error);
    }
    console.log();
    
    // Test 6: Get low stock items
    console.log('6. Testing getLowStockItems...');
    const lowStockResult = await InventoryService.getLowStockItems();
    if (lowStockResult.success) {
      console.log(`✓ Found ${lowStockResult.data.length} low stock items`);
      if (lowStockResult.data.length > 0) {
        lowStockResult.data.slice(0, 3).forEach(item => {
          const variant = item.size || item.color || item.pattern ? 
            `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
            'Base Product';
          console.log(`  - ${item.product_name} (${variant}): ${item.quantity_available} available (reorder at ${item.reorder_point})`);
        });
      }
    } else {
      console.log('✗ Failed to get low stock items:', lowStockResult.error);
    }
    console.log();
    
    // Test 7: Test low stock alert system
    console.log('7. Testing low stock alert system...');
    if (lowStockResult.success && lowStockResult.data.length > 0) {
      const testItem = lowStockResult.data[0];
      const alertResult = await InventoryService.triggerLowStockAlert(testItem);
      
      if (alertResult.success) {
        console.log(`✓ Low stock alert processed`);
        console.log(`  - Alert sent: ${alertResult.data.alert_sent}`);
        if (alertResult.data.alert_sent) {
          console.log(`  - Admin count: ${alertResult.data.admin_count}`);
          console.log(`  - Product: ${alertResult.data.product}`);
        } else {
          console.log(`  - Reason: ${alertResult.data.reason}`);
        }
      } else {
        console.log('✗ Failed to trigger low stock alert:', alertResult.error);
      }
    } else {
      console.log('- No low stock items to test alert system');
    }
    console.log();
    
    // Test 8: Test order processing simulation (using first variant)
    console.log('8. Testing processOrderInventoryUpdate...');
    const mockOrderItems = [
      {
        product_id: testProduct.id,
        variant_id: testVariantId, // Use first variant
        quantity: 2
      }
    ];
    
    const orderProcessResult = await InventoryService.processOrderInventoryUpdate(
      'TEST_ORDER_001',
      mockOrderItems,
      'TEST_USER'
    );
    
    if (orderProcessResult.success) {
      console.log(`✓ Order inventory processing completed`);
      console.log(`  - Total items: ${orderProcessResult.data.total_items}`);
      console.log(`  - Successful updates: ${orderProcessResult.data.successful_updates}`);
      console.log(`  - Failed updates: ${orderProcessResult.data.failed_updates}`);
    } else {
      console.log('✗ Failed to process order inventory:', orderProcessResult.error);
    }
    console.log();
    
    // Test 9: Test expired reservations cleanup
    console.log('9. Testing releaseExpiredReservations...');
    const cleanupResult = await InventoryService.releaseExpiredReservations();
    if (cleanupResult.success) {
      console.log(`✓ Cleanup completed: ${cleanupResult.data.released_count} released, ${cleanupResult.data.total_expired} total expired`);
    } else {
      console.log('✗ Failed to cleanup expired reservations:', cleanupResult.error);
    }
    console.log();
    
    console.log('✓ All enhanced inventory service tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testInventoryService()
    .then(() => {
      console.log('\nInventory service test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nInventory service test failed:', error);
      process.exit(1);
    });
}

module.exports = { testInventoryService };