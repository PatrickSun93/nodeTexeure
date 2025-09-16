#!/usr/bin/env node

/**
 * Cleanup Expired Stock Reservations Script
 * 
 * This script should be run periodically (e.g., every 15 minutes) to clean up
 * expired stock reservations and release the reserved inventory back to available stock.
 * 
 * Usage:
 * node backend/scripts/cleanup-expired-reservations.js
 * 
 * Or add to crontab:
 * 0,15,30,45 * * * * /usr/bin/node /path/to/project/backend/scripts/cleanup-expired-reservations.js
 */

const path = require('path');
const InventoryService = require('../services/inventoryService');

async function cleanupExpiredReservations() {
  console.log(`[${new Date().toISOString()}] Starting cleanup of expired stock reservations...`);
  
  try {
    const result = await InventoryService.releaseExpiredReservations();
    
    if (result.success) {
      const { released_count, total_expired } = result.data;
      console.log(`[${new Date().toISOString()}] Cleanup completed successfully:`);
      console.log(`  - Total expired reservations found: ${total_expired}`);
      console.log(`  - Successfully released: ${released_count}`);
      
      if (released_count > 0) {
        console.log(`  - ${released_count} inventory items had their reserved quantities reduced`);
      }
    } else {
      console.error(`[${new Date().toISOString()}] Cleanup failed:`, result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cleanup error:`, error.message);
    process.exit(1);
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupExpiredReservations()
    .then(() => {
      console.log(`[${new Date().toISOString()}] Cleanup script completed successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[${new Date().toISOString()}] Cleanup script failed:`, error);
      process.exit(1);
    });
}

module.exports = { cleanupExpiredReservations };