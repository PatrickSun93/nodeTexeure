// Admin API: Inventory levels, adjustments, movements.
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { admin } = require('../../middleware/authMiddleware');
const InventoryService = require('../../services/inventoryService');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const { adminReadLimiter, adminWriteLimiter } = require('./limiters');

const router = express.Router();

// Inventory Management
// Update inventory
router.put('/inventory/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity_available, quantity_reserved, reorder_point, reorder_quantity } = req.body;
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE inventory SET quantity_available = ?, quantity_reserved = ?, reorder_point = ?, reorder_quantity = ? WHERE id = ?',
      [quantity_available, quantity_reserved, reorder_point, reorder_quantity, id]
    );
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('Inventory updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Stock adjustment (single) — POST /api/admin/inventory/adjust
// Thin wrapper over InventoryService.updateInventoryWithLogging (records a movement + audit trail).
// quantity_change is a signed delta (positive = add stock, negative = remove).
router.post('/inventory/adjust', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { product_id, variant_id, quantity_change, reason, notes } = req.body;
    const qty = Number(quantity_change);
    if (!product_id || quantity_change === undefined || quantity_change === null || Number.isNaN(qty)) {
      return res.status(400).json(ResponseFormatter.failure('product_id and a numeric quantity_change are required'));
    }

    const result = await InventoryService.updateInventoryWithLogging(
      product_id,
      variant_id || null,
      qty,
      'adjustment',
      'manual',
      null,
      req.user.id,
      { reason: reason || null, notes: notes || null }
    );

    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error || 'Stock adjustment failed'));
    }
    res.json(ResponseFormatter.success('Stock adjusted successfully', [{ adjustment: result.data }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Bulk stock adjustment — POST /api/admin/inventory/bulk-adjust
// Applies InventoryService.updateInventoryWithLogging to each item (no dedicated bulk method exists).
router.post('/inventory/bulk-adjust', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { adjustments, reason, notes } = req.body;
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('adjustments must be a non-empty array'));
    }

    const results = [];
    for (const adj of adjustments) {
      const qty = Number(adj.quantity_change);
      if (!adj.product_id || Number.isNaN(qty)) {
        results.push({ product_id: adj.product_id || null, success: false, error: 'Invalid adjustment (product_id and numeric quantity_change required)' });
        continue;
      }
      const result = await InventoryService.updateInventoryWithLogging(
        adj.product_id,
        adj.variant_id || null,
        qty,
        'adjustment',
        'manual',
        null,
        req.user.id,
        { reason: adj.reason || reason || null, notes: adj.notes || notes || null }
      );
      results.push({ product_id: adj.product_id, variant_id: adj.variant_id || null, success: result.success, error: result.error || null });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    res.json(ResponseFormatter.success('Bulk stock adjustment processed', [{ successful, failed, total: results.length, results }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update reorder points — PUT /api/admin/inventory/:id/reorder-points
// Uses InventoryService.updateInventory, re-passing current quantities so only the
// reorder thresholds change (updateInventory rewrites all quantity columns).
router.put('/inventory/:id/reorder-points', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { reorder_point, reorder_quantity } = req.body;

    const currentRes = await DatabaseUtil.executeQuery(
      'SELECT quantity_available, quantity_reserved FROM inventory WHERE id = ?',
      [id]
    );
    if (!currentRes.success) throw new Error(currentRes.error);
    if (!currentRes.data || currentRes.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Inventory record not found'));
    }
    const current = currentRes.data[0];

    const result = await InventoryService.updateInventory(id, {
      quantity_available: current.quantity_available,
      quantity_reserved: current.quantity_reserved,
      reorder_point,
      reorder_quantity,
    });
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error || 'Failed to update reorder points'));
    }
    res.json(ResponseFormatter.success('Reorder points updated successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Inventory movement history — GET /api/admin/inventory/movements
// Thin wrapper over InventoryService.getMovementHistory (supports optional filters).
router.get('/inventory/movements', admin, adminReadLimiter, async (req, res) => {
  try {
    const { inventory_id, product_id, movement_type, reference_type, date_from, date_to, limit } = req.query;
    const result = await InventoryService.getMovementHistory(inventory_id || null, {
      product_id,
      movement_type,
      reference_type,
      date_from,
      date_to,
      limit,
    });
    if (!result.success) throw new Error(result.error);
    res.json(ResponseFormatter.success('Inventory movements fetched successfully', [{ movements: result.data }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// List inventory (read-only; CSRF not required)
router.get('/inventory', admin, adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM inventory');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Inventory fetched successfully', [{ inventory: listResult.data }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

module.exports = router;
