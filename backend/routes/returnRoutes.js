const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const { isNonEmptyString, isOptionalString } = require('../utils/params');

// returns.reason / returns.status ENUMs (docker/mysql/init.sql).
const RETURN_REASONS = ['defective', 'wrong_item', 'not_as_described', 'changed_mind', 'damaged_shipping', 'other'];
const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'shipped_back', 'received', 'processed', 'closed'];
// quantity: omitted (or falsy) means 1, otherwise a whole number of units. A string,
// fraction or out-of-range value used to fail (or round in) the return_items INSERT
// after the return row was written, so the 201 came back for a return without items.
const isReturnQuantity = (q) => !q || (Number.isInteger(q) && q > 0 && q <= 4294967295);
const isReturnItem = (item) => item !== null && typeof item === 'object' && isNonEmptyString(item.orderItemId)
  && isOptionalString(item.reason) && isReturnQuantity(item.quantity);

const router = express.Router();
const db = new DatabaseUtil();

/**
 * POST /api/returns/request
 * Customer submits a return request
 */
router.post('/request', protect, async (req, res) => {
  try {
    const { orderId, reason, description, items } = req.body;

    // ids are strings (a number would compare numerically with orders.id), the
    // reason is one of the ENUM values (anything else failed the INSERT silently).
    if (!isNonEmptyString(orderId) || !RETURN_REASONS.includes(reason)
      || !Array.isArray(items) || items.length === 0 || !items.every(isReturnItem)
      || !isOptionalString(description)) {
      return res.status(400).json(ResponseFormatter.failure('orderId, reason, and items are required'));
    }

    // Verify order belongs to user and is delivered
    const orderResult = await DatabaseUtil.executeQuery(
      'SELECT id, status, user_id FROM orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id]
    );
    // executeQuery may return a rows array or a {success, data} wrapper — normalize.
    const orderRows = DatabaseUtil.rows(orderResult);
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
    const existingReturnRows = DatabaseUtil.rows(existingReturn);
    if (existingReturnRows.length > 0) {
      return res.status(409).json(ResponseFormatter.failure('A return request already exists for this order'));
    }

    // Validate that every submitted orderItemId actually belongs to this order, so a
    // client cannot attach return_items from another order to their own return.
    const orderItemsResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM order_items WHERE order_id = ?',
      [orderId]
    );
    const orderItemRows = DatabaseUtil.rows(orderItemsResult);
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
    const rows = DatabaseUtil.rows(returns);
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

    const returnData = DatabaseUtil.first(returnResult);
    if (!returnData) {
      return res.status(404).json(ResponseFormatter.failure('Return not found'));
    }
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
    returnData.items = DatabaseUtil.rows(itemsResult);

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

    if (!RETURN_STATUSES.includes(status)) {
      return res.status(400).json(ResponseFormatter.failure('status is required'));
    }
    if (![admin_notes, return_tracking_number].every(isOptionalString)) {
      return res.status(400).json(ResponseFormatter.failure('admin_notes and return_tracking_number must be text'));
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
    // A value MySQL refuses (refund_amount 'abc', a tracking number over 100
    // characters) fails the whole UPDATE: report it instead of "updated".
    const result = await DatabaseUtil.executeQuery(`UPDATE returns SET ${updates.join(', ')} WHERE id = ?`, params);
    if (!result.success) throw new Error(result.error);
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
    if (!isOptionalString(status)) {
      return res.status(400).json(ResponseFormatter.failure('status must be a single value'));
    }
    // LIMIT/OFFSET are validated integers, inlined: mysql2 binds numbers as
    // DOUBLE, which MySQL 8 rejects for LIMIT in a prepared statement.
    const limitNum = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;
    let where = '1=1';
    const params = [];

    if (status) {
      where += ' AND r.status = ?';
      params.push(status);
    }

    const returns = await DatabaseUtil.executeQuery(
      `SELECT r.*, o.order_number, u.email AS user_email, u.first_name, u.last_name
       FROM returns r
       JOIN orders o ON r.order_id = o.id
       JOIN users u ON r.user_id = u.id
       WHERE ${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );
    if (!returns.success) throw new Error(returns.error);

    const countResult = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) AS total FROM returns r WHERE ${where}`,
      status ? [status] : []
    );

    res.json(ResponseFormatter.success('Returns fetched', {
      returns: DatabaseUtil.rows(returns),
      total: DatabaseUtil.first(countResult)?.total || 0,
      page: pageNum,
      limit: limitNum,
    }));
  } catch (error) {
    console.error('Admin get returns error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch returns'));
  }
});

module.exports = router;
