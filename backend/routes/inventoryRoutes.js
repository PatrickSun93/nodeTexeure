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

module.exports = router;