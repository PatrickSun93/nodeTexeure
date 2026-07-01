#!/usr/bin/env node

/**
 * Test Low Stock Alert Scenario
 * 
 * This script creates a low stock scenario and tests the alert system.
 */

const InventoryService = require('../services/inventoryService');
const DatabaseUtil = require('../utils/database');

async function testLowStockScenario() {
  console.log('Testing Low Stock Alert Scenario...\n');
  
  try {
    // Step 1: Find a product with inventory
    console.log('1. Finding a product with inventory...');
    const productResult = await DatabaseUtil.executeQuery(`
      SELECT i.id, i.product_id, i.variant_id, i.quantity_available, i.reorder_point,
             p.name as product_name, p.sku as product_sku
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.quantity_available > i.reorder_point
      LIMIT 1
    `);
    
    if (!productResult.success || productResult.data.length === 0) {
      console.log('No products with sufficient inventory found.');
      return;
    }
    
    const testInventory = productResult.data[0];
    console.log(`Found inventory: ${testInventory.product_name} - Available: ${testInventory.quantity_available}, Reorder Point: ${testInventory.reorder_point}\n`);
    
    // Step 2: Reduce inventory to trigger low stock
    console.log('2. Reducing inventory to trigger low stock alert...');
    const reductionAmount = testInventory.quantity_available - testInventory.reorder_point + 1;
    
    const updateResult = await InventoryService.updateInventoryWithLogging(
      testInventory.product_id,
      testInventory.variant_id,
      -reductionAmount, // Negative to reduce
      'adjustment',
      'manual',
      'LOW_STOCK_TEST',
      'system',
      { notes: 'Testing low stock alert system' }
    );
    
    if (updateResult.success) {
      console.log(`✓ Inventory reduced by ${reductionAmount} units`);
      console.log(`  - New available: ${updateResult.data.new_available}`);
    } else {
      console.log('✗ Failed to reduce inventory:', updateResult.error);
      return;
    }
    console.log();
    
    // Step 3: Check for low stock items
    console.log('3. Checking for low stock items...');
    const lowStockResult = await InventoryService.getLowStockItems();
    
    if (lowStockResult.success) {
      console.log(`✓ Found ${lowStockResult.data.length} low stock items`);
      
      if (lowStockResult.data.length > 0) {
        const lowStockItem = lowStockResult.data.find(item => item.id === testInventory.id);
        if (lowStockItem) {
          console.log(`  - Test item is now low stock: ${lowStockItem.quantity_available} <= ${lowStockItem.reorder_point}`);
        }
      }
    } else {
      console.log('✗ Failed to get low stock items:', lowStockResult.error);
    }
    console.log();
    
    // Step 4: Test low stock alert
    console.log('4. Testing low stock alert system...');
    if (lowStockResult.success && lowStockResult.data.length > 0) {
      const testItem = lowStockResult.data.find(item => item.id === testInventory.id);
      
      if (testItem) {
        const alertResult = await InventoryService.triggerLowStockAlert(testItem);
        
        if (alertResult.success) {
          console.log(`✓ Low stock alert processed`);
          console.log(`  - Alert sent: ${alertResult.data.alert_sent}`);
          if (alertResult.data.alert_sent) {
            console.log(`  - Authorized staff recipient count: ${alertResult.data.recipient_count}`);
            console.log(`  - Product: ${alertResult.data.product}`);
            console.log(`  - Variant: ${alertResult.data.variant}`);
          } else {
            console.log(`  - Reason: ${alertResult.data.reason}`);
          }
        } else {
          console.log('✗ Failed to trigger low stock alert:', alertResult.error);
        }
      }
    }
    console.log();
    
    // Step 5: Check email queue for alert
    console.log('5. Checking email queue for low stock alerts...');
    const emailQueueResult = await DatabaseUtil.executeQuery(`
      SELECT id, to_email, subject, status, created_at
      FROM email_queue
      WHERE subject LIKE '%Low Stock Alert%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (emailQueueResult.success) {
      console.log(`✓ Found ${emailQueueResult.data.length} low stock alert emails in queue`);
      emailQueueResult.data.forEach(email => {
        console.log(`  - To: ${email.to_email}, Status: ${email.status}, Created: ${email.created_at}`);
      });
    } else {
      console.log('✗ Failed to check email queue:', emailQueueResult.error);
    }
    console.log();
    
    // Step 6: Restore inventory to original level
    console.log('6. Restoring inventory to original level...');
    const restoreResult = await InventoryService.updateInventoryWithLogging(
      testInventory.product_id,
      testInventory.variant_id,
      reductionAmount, // Positive to restore
      'restock',
      'manual',
      'RESTORE_TEST',
      'system',
      { notes: 'Restoring inventory after low stock test' }
    );
    
    if (restoreResult.success) {
      console.log(`✓ Inventory restored`);
      console.log(`  - Restored available: ${restoreResult.data.new_available}`);
    } else {
      console.log('✗ Failed to restore inventory:', restoreResult.error);
    }
    console.log();
    
    console.log('✓ Low stock alert scenario test completed successfully!');
    
  } catch (error) {
    console.error('Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testLowStockScenario()
    .then(() => {
      console.log('\nLow stock scenario test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nLow stock scenario test failed:', error);
      process.exit(1);
    });
}

module.exports = { testLowStockScenario };