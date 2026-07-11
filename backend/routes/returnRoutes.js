const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');

const router = express.Router();
const db = new DatabaseUtil();

/**
 * POST /api/returns/request
 * Customer submits a return request
 */
router.post('/request', protect, async (req, res) => {
  try {
    const { orderId, reason, description, items } = req.body;

    if (!orderId || !reason || !items || items.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('orderId, reason, and items are required'));
    }

    // Verify order belongs to user and is delivered
    const orderResult = await DatabaseUtil.executeQuery(
      'SELECT id, status, user_id FROM orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id]
    );
    // executeQuery may return a rows array or a {success, data} wrapper — normalize.
    const orderRows = Array.isArray(orderResult) ? orderResult : (orderResult && orderResult.data) || [];
    if (orderRows.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }
    if (orderRows[0].status !== 'delivered') {
      return res.status(400).json(ResponseFormatter.failure('Returns can only be requested for delivered orders'));
    }

    // Check for existing return on this order
    const existingReturn = await DatabaseUtil.executeQuery(
      "SELECT id FROM returns WHERE order_id = ? AND status NOT IN ('rejected','closed')",
      [orderId]
    );
    const existingReturnRows = Array.isArray(existingReturn) ? existingReturn : (existingReturn && existingReturn.data) || [];
    if (existingReturnRows.length > 0) {
      return res.status(409).json(ResponseFormatter.failure('A return request already exists for this order'));
    }

    // Validate that every submitted orderItemId actually belongs to this order, so a
    // client cannot attach return_items from another order to their own return.
    const orderItemsResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM order_items WHERE order_id = ?',
      [orderId]
    );
    const orderItemRows = Array.isArray(orderItemsResult) ? orderItemsResult : (orderItemsResult && orderItemsResult.data) || [];
    const validOrderItemIds = new Set(orderItemRows.map((row) => row.id));
    for (const item of items) {
      if (!item.orderItemId || !validOrderItemIds.has(item.orderItemId)) {
        return res.status(400).json(ResponseFormatter.failure('One or more return items do not belong to this order'));
      }
    }

    // Generate return ID and number
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("RMA") as id');
    const returnId = idResult.data[0].id;
    const returnNumber = `RMA-${returnId}`;

    const returnDetails = JSON.stringify({ description: description || '', customer_notes: '', admin_notes: '', evidence_urls: [] });

    await DatabaseUtil.executeQuery(
      'INSERT INTO returns (id, order_id, user_id, return_number, reason, return_details) VALUES (?, ?, ?, ?, ?, ?)',
      [returnId, orderId, req.user.id, returnNumber, reason, returnDetails]
    );

    // Insert return items
    for (const item of items) {
      const itemIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("RMAITEM") as id');
      const itemId = itemIdResult.data[0].id;
      await DatabaseUtil.executeQuery(
        'INSERT INTO return_items (id, return_id, order_item_id, quantity, reason) VALUES (?, ?, ?, ?, ?)',
        [itemId, returnId, item.orderItemId, item.quantity || 1, item.reason || '']
      );
    }

    res.status(201).json(ResponseFormatter.success('Return request submitted', { returnId, returnNumber }));
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to create return request'));
  }
});

/**
 * GET /api/returns/my-returns
 * List current user's returns
 */
router.get('/my-returns', protect, async (req, res) => {
  try {
    const returns = await DatabaseUtil.executeQuery(
      `SELECT r.id, r.return_number, r.order_id, r.status, r.reason, r.refund_amount,
              r.return_tracking_number, r.created_at, r.updated_at,
              o.order_number
       FROM returns r
       JOIN orders o ON r.order_id = o.id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    // executeQuery may return a rows array or a {success, data} wrapper — normalize.
    const rows = Array.isArray(returns) ? returns : (returns && returns.data) || [];
    res.json(ResponseFormatter.success('Returns fetched', { returns: rows }));
  } catch (error) {
    console.error('Get returns error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch returns'));
  }
});

/**
 * GET /api/returns/:id
 * Get return details (owner or admin)
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const returnResult = await DatabaseUtil.executeQuery(
      `SELECT r.*, o.order_number
       FROM returns r
       JOIN orders o ON r.order_id = o.id
       WHERE r.id = ? AND (r.user_id = ? OR ? = TRUE)`,
      [id, req.user.id, req.user.isAdmin || false]
    );

    if (!returnResult || returnResult.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Return not found'));
    }

    const returnData = returnResult[0];
    if (typeof returnData.return_details === 'string') {
      returnData.return_details = JSON.parse(returnData.return_details);
    }

    // Fetch return items
    const itemsResult = await DatabaseUtil.executeQuery(
      `SELECT ri.*, oi.product_name, oi.unit_price
       FROM return_items ri
       JOIN order_items oi ON ri.order_item_id = oi.id
       WHERE ri.return_id = ?`,
      [id]
    );
    returnData.items = itemsResult || [];

    res.json(ResponseFormatter.success('Return details fetched', { return: returnData }));
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch return'));
  }
});

/**
 * PUT /api/returns/:id/status
 * Admin updates return status
 */
router.put('/:id/status', protect, admin, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, refund_amount, return_tracking_number } = req.body;

    if (!status) {
      return res.status(400).json(ResponseFormatter.failure('status is required'));
    }

    const updates = ['status = ?'];
    const params = [status];

    if (status === 'approved') {
      updates.push('approved_by = ?', 'approved_at = NOW()');
      params.push(req.user.id);
    }
    if (status === 'received') {
      updates.push('received_at = NOW()');
    }
    if (status === 'processed') {
      updates.push('processed_at = NOW()');
    }
    if (refund_amount !== undefined) {
      updates.push('refund_amount = ?');
      params.push(refund_amount);
    }
    if (return_tracking_number) {
      updates.push('return_tracking_number = ?');
      params.push(return_tracking_number);
    }
    if (admin_notes) {
      updates.push("return_details = JSON_SET(COALESCE(return_details, '{}'), '$.admin_notes', ?)");
      params.push(admin_notes);
    }

    params.push(id);
    await DatabaseUtil.executeQuery(`UPDATE returns SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json(ResponseFormatter.success('Return status updated'));
  } catch (error) {
    console.error('Update return status error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to update return'));
  }
});

/**
 * GET /api/admin/returns (accessible via /api/returns/admin/all)
 * Admin: list all returns with filters
 */
router.get('/admin/all', protect, admin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];

    if (status) {
      where += ' AND r.status = ?';
      params.push(status);
    }

    params.push(parseInt(limit), offset);
    const returns = await DatabaseUtil.executeQuery(
      `SELECT r.*, o.order_number, u.email AS user_email, u.first_name, u.last_name
       FROM returns r
       JOIN orders o ON r.order_id = o.id
       JOIN users u ON r.user_id = u.id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const countResult = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) AS total FROM returns r WHERE ${where}`,
      status ? [status] : []
    );

    res.json(ResponseFormatter.success('Returns fetched', {
      returns: returns || [],
      total: countResult[0]?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    }));
  } catch (error) {
    console.error('Admin get returns error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch returns'));
  }
});

module.exports = router;
