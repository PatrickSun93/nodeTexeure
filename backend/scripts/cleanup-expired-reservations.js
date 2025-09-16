#!/usr/bin/env node

/**
 * Cleanup Expired Stock Reservations
 * 
 * This script should be run periodically (e.g., every 15 minutes) to:
 * 1. Release expired stock reservations
 * 2. Check for low stock items and send alerts
 * 
 * Usage: node backend/scripts/cleanup-expired-reservations.js
 */

const InventoryService = require('../services/inventoryService');

async function cleanupExpiredReservations() {
  console.log(`[${new Date().toISOString()}] Starting cleanup of expired reservations...`);
  
  try {
    // Release expired reservations
    const cleanupResult = await InventoryService.releaseExpiredReservations();
    
    if (cleanupResult.success) {
      console.log(`✓ Released ${cleanupResult.data.released_count} expired reservations (${cleanupResult.data.total_expired} total expired)`);
    } else {
      console.error('✗ Failed to cleanup expired reservations:', cleanupResult.error);
    }
    
    // Check for low stock items and trigger alerts
    const lowStockResult = await InventoryService.getLowStockItems();
    
    if (lowStockResult.success) {
      console.log(`Found ${lowStockResult.data.length} low stock items`);
      
      if (lowStockResult.data.length > 0) {
        let alertsSent = 0;
        
        for (const item of lowStockResult.data) {
          const alertResult = await InventoryService.triggerLowStockAlert(item);
          
          if (alertResult.success && alertResult.data.alert_sent) {
            alertsSent++;
            const variant = item.size || item.color || item.pattern ? 
              `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
              'Base Product';
            console.log(`  ✓ Alert sent for ${item.product_name} (${variant})`);
          } else if (alertResult.success && !alertResult.data.alert_sent) {
            console.log(`  - Skipped alert for ${item.product_name} (${alertResult.data.reason})`);
          } else {
            console.error(`  ✗ Failed to send alert for ${item.product_name}:`, alertResult.error);
          }
        }
        
        console.log(`✓ Sent ${alertsSent} low stock alerts`);
      }
    } else {
      console.error('✗ Failed to check low stock items:', lowStockResult.error);
    }
    
    console.log(`[${new Date().toISOString()}] Cleanup completed successfully`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cleanup failed:`, error.message);
    process.exit(1);
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupExpiredReservations()
    .then(() => {
      console.log('Cleanup process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Cleanup process failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupExpiredReservations };