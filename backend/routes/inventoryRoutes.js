const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const InventoryService = require('../services/inventoryService');
const ResponseFormatter = require('../utils/responseFormatter');
const router = express.Router();

// GET /api/inventory/product/:productId - Get inventory for a specific product and its variants
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await InventoryService.getProductInventory(productId);
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Product inventory fetched successfully', {
      inventory: result.data
    }));
  } catch (error) {
    console.error('Error fetching product inventory:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/inventory/availability/:productId - Get availability for product/variant
router.get('/availability/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { variant_id } = req.query;
    
    const result = await InventoryService.getAvailability(productId, variant_id);
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Availability fetched successfully', result.data));
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/inventory/low-stock - Get low stock items (admin only)
router.get('/low-stock', protect, admin, async (req, res) => {
  try {
    const result = await InventoryService.getLowStockItems();
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Low stock items fetched successfully', {
      items: result.data
    }));
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/inventory/reserve - Reserve stock for checkout
router.post('/reserve', async (req, res) => {
  try {
    const { items, cart_id, user_id } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Items array is required'));
    }
    
    if (!cart_id) {
      return res.status(400).json(ResponseFormatter.failure('Cart ID is required'));
    }
    
    const result = await InventoryService.reserveStock(items, cart_id, user_id);
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Stock reserved successfully', {
      reservations: result.data
    }));
  } catch (error) {
    console.error('Error reserving stock:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/inventory/confirm/:cartId - Confirm stock reservation (convert to sale)
router.post('/confirm/:cartId', async (req, res) => {
  try {
    const { cartId } = req.params;
    
    const result = await InventoryService.confirmReservation(cartId);
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Stock reservation confirmed successfully', result.data));
  } catch (error) {
    console.error('Error confirming reservation:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/inventory/release-expired - Release expired reservations (admin only)
router.post('/release-expired', protect, admin, async (req, res) => {
  try {
    const result = await InventoryService.releaseExpiredReservations();
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Expired reservations released successfully', result.data));
  } catch (error) {
    console.error('Error releasing expired reservations:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/inventory/:inventoryId - Update inventory (admin only)
router.put('/:inventoryId', protect, admin, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const updates = req.body;
    
    const result = await InventoryService.updateInventory(inventoryId, updates);
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    // Log the inventory movement
    if (req.user && updates.quantity_available !== undefined) {
      await InventoryService.logMovement(
        inventoryId,
        'adjustment',
        0, // We don't know the exact change without fetching previous value
        'manual',
        null,
        req.user.id,
        { notes: 'Manual inventory update via admin panel' }
      );
    }
    
    res.json(ResponseFormatter.success('Inventory updated successfully'));
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/inventory/update-with-logging - Update inventory with automatic logging (admin only)
router.post('/update-with-logging', protect, admin, async (req, res) => {
  try {
    const { 
      product_id, 
      variant_id, 
      quantity_change, 
      movement_type, 
      reference_type, 
      reference_id, 
      details 
    } = req.body;
    
    if (!product_id || quantity_change === undefined || !movement_type || !reference_type) {
      return res.status(400).json(ResponseFormatter.failure(
        'product_id, quantity_change, movement_type, and reference_type are required'
      ));
    }
    
    const result = await InventoryService.updateInventoryWithLogging(
      product_id,
      variant_id,
      quantity_change,
      movement_type,
      reference_type,
      reference_id,
      req.user.id,
      details || {}
    );
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Inventory updated with logging successfully', result.data));
  } catch (error) {
    console.error('Error updating inventory with logging:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/inventory/process-order - Process order inventory updates (admin only)
router.post('/process-order', protect, admin, async (req, res) => {
  try {
    const { order_id, order_items } = req.body;
    
    if (!order_id || !order_items || !Array.isArray(order_items)) {
      return res.status(400).json(ResponseFormatter.failure(
        'order_id and order_items array are required'
      ));
    }
    
    const result = await InventoryService.processOrderInventoryUpdate(
      order_id,
      order_items,
      req.user.id
    );
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Order inventory processed successfully', result.data));
  } catch (error) {
    console.error('Error processing order inventory:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/inventory/movement-history - Get inventory movement history (admin only)
router.get('/movement-history', protect, admin, async (req, res) => {
  try {
    const { 
      inventory_id, 
      product_id, 
      movement_type, 
      reference_type, 
      date_from, 
      date_to, 
      limit 
    } = req.query;
    
    const filters = {};
    if (product_id) filters.product_id = product_id;
    if (movement_type) filters.movement_type = movement_type;
    if (reference_type) filters.reference_type = reference_type;
    if (date_from) filters.date_from = date_from;
    if (date_to) filters.date_to = date_to;
    if (limit) filters.limit = limit;
    
    const result = await InventoryService.getMovementHistory(inventory_id, filters);
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }
    
    res.json(ResponseFormatter.success('Movement history fetched successfully', {
      movements: result.data
    }));
  } catch (error) {
    console.error('Error fetching movement history:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/inventory/trigger-low-stock-alerts - Manually trigger low stock alerts (admin only)
router.post('/trigger-low-stock-alerts', protect, admin, async (req, res) => {
  try {
    const lowStockResult = await InventoryService.getLowStockItems();
    
    if (!lowStockResult.success) {
      return res.status(400).json(ResponseFormatter.failure(lowStockResult.error));
    }
    
    const alertResults = [];
    
    for (const item of lowStockResult.data) {
      const alertResult = await InventoryService.triggerLowStockAlert(item);
      alertResults.push({
        product_id: item.product_id,
        product_name: item.product_name,
        alert_sent: alertResult.success && alertResult.data.alert_sent,
        error: alertResult.error
      });
    }
    
    const successCount = alertResults.filter(r => r.alert_sent).length;
    
    res.json(ResponseFormatter.success('Low stock alerts processed', {
      total_items: alertResults.length,
      alerts_sent: successCount,
      results: alertResults
    }));
  } catch (error) {
    console.error('Error triggering low stock alerts:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;