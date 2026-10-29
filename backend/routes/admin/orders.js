// Admin API: Orders, status changes, bulk order actions.
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { admin, staffOrAdmin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const emailQueueProducer = require('../../services/emailQueueProducer');
const emailService = require('../../services/emailService');
const { adminReadLimiter, adminWriteLimiter } = require('./limiters');

const router = express.Router();

// Order Management
// List orders
router.get('/orders', admin, adminReadLimiter, async (req, res) => {
  try {
    // Basic listing. In real app, add pagination/filters.
    const queryParams = [];
    const query = `
      SELECT o.id, o.order_number, o.created_at, o.status, o.total_amount,
             COALESCE(u.first_name, o.guest_email) as customer_name,
             o.shipping_address_json
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${req.query.user_id ? 'WHERE o.user_id = ?' : ''}
      ORDER BY o.created_at DESC
    `;
    if (req.query.user_id) {
      queryParams.push(req.query.user_id);
    }
    const listResult = await DatabaseUtil.executeQuery(query, queryParams);
    if (!listResult.success) throw new Error(listResult.error);

    // Process rows to match frontend expectation if needed
    const orders = listResult.data.map(r => {
      let destination = '';
      try {
        const addr = JSON.parse(r.shipping_address_json || '{}');
        destination = `${addr.city || ''}, ${addr.country || ''}`;
      } catch (e) { }

      return {
        id: r.order_number || r.id, // Display order number if available
        _id: r.id, // Keep real UUID for actions
        date: r.created_at,
        customer: r.customer_name || 'Guest',
        amount: r.total_amount,
        destination: destination || 'N/A',
        status: r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : 'Pending'
      };
    });

    res.json(ResponseFormatter.success('Orders fetched successfully', [{ orders }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Get Order Details
router.get('/orders/:id', admin, adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch order, items, user
    const orderResult = await DatabaseUtil.executeQuery(`
       SELECT o.*, u.first_name, u.last_name, u.email as user_email 
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ? OR o.order_number = ?
    `, [id, id]);

    if (!orderResult.success) throw new Error(orderResult.error);
    if (orderResult.data.length === 0) return res.status(404).json(ResponseFormatter.failure('Order not found'));

    const order = orderResult.data[0];
    const itemsResult = await DatabaseUtil.executeQuery('SELECT * FROM order_items WHERE order_id = ?', [order.id]);

    const orderDetails = {
      ...order,
      items: itemsResult.success ? itemsResult.data : []
    };

    res.json(ResponseFormatter.success('Order details fetched', [{ order: orderDetails }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update Order Status
router.put('/orders/:id/status', staffOrAdmin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, tracking_number } = req.body;
    const normalizedStatus = status.toLowerCase();

    // Update order status (and the tracking number when the admin provided one)
    const updateResult = tracking_number
      ? await DatabaseUtil.executeQuery('UPDATE orders SET status = ?, tracking_number = ? WHERE id = ?', [normalizedStatus, tracking_number, id])
      : await DatabaseUtil.executeQuery('UPDATE orders SET status = ? WHERE id = ?', [normalizedStatus, id]);
    if (!updateResult.success) throw new Error(updateResult.error);

    // Insert into order_status_history
    const historyId = uuidv4();
    const statusDetails = notes ? JSON.stringify({ notes }) : null;
    await DatabaseUtil.executeQuery(
      'INSERT INTO order_status_history (id, order_id, status, status_details, changed_by) VALUES (?, ?, ?, ?, ?)',
      [historyId, id, normalizedStatus, statusDetails, req.user.id]
    );

    // Look up customer email and enqueue status notification.
    // executeQuery returns a { success, data } wrapper (not a rows array), so
    // normalize before indexing — array-destructuring the wrapper throws
    // ("is not iterable") and 500s the whole status update.
    const orderRes = await DatabaseUtil.executeQuery(
      `SELECT o.order_number, o.guest_email, u.email as user_email,
              COALESCE(u.first_name, 'Valued Customer') as customer_name,
              o.tracking_number
       FROM orders o LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [id]
    );
    const order = (DatabaseUtil.rows(orderRes))[0];

    if (order) {
      const customerEmail = order.user_email || order.guest_email;
      if (customerEmail) {
        // For "shipped", send a direct shipping notification — reliable inline HTML
        // captured by the dev email sink (the queue path below needs a DB template + daemon).
        if (normalizedStatus === 'shipped') {
          emailService.sendShippingNotification(
            {
              order_number: order.order_number,
              guest_email: order.guest_email,
              user_email: order.user_email,
              customer_name: order.customer_name,
            },
            order.tracking_number || ('TRK' + Date.now()),
            'FedEx'
          ).catch((err) => console.error('Non-fatal: shipping email failed:', err.message));
        }
        // Map status to template name
        const templateMap = {
          confirmed: 'order_confirmed',
          processing: 'order_processing',
          shipped: 'order_shipped',
          delivered: 'order_delivered',
          cancelled: 'order_cancelled',
        };

        const templateName = templateMap[normalizedStatus];
        if (templateName) {
          emailQueueProducer.enqueue(customerEmail, order.customer_name, templateName, {
            order_number: order.order_number,
            customer_name: order.customer_name,
            tracking_number: order.tracking_number || '',
          }).catch(err => console.error('Non-fatal: status email enqueue failed:', err.message));
        }
      }
    }

    res.json(ResponseFormatter.success('Order status updated'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// =====================================================
// Bulk order status update
// =====================================================
// POST /api/admin/orders/bulk-update — apply one status to many orders and
// mirror the single PUT /orders/:id/status handler (status history row per order).
router.post('/orders/bulk-update', staffOrAdmin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { orderIds, status, notes } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('orderIds must be a non-empty array'));
    }

    // Same status set as the orders / order_status_history ENUM the single handler writes.
    const ALLOWED_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    const normalizedStatus = String(status || '').toLowerCase();
    if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json(ResponseFormatter.failure(`Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`));
    }

    const statusDetails = notes ? JSON.stringify({ notes }) : null;
    let updated = 0;
    for (const orderId of orderIds) {
      // Skip unknown ids gracefully — also avoids a FK violation on the history insert.
      const existsRes = await DatabaseUtil.executeQuery('SELECT id FROM orders WHERE id = ?', [orderId]);
      if (!DatabaseUtil.first(existsRes)) continue;

      const updateRes = await DatabaseUtil.executeQuery('UPDATE orders SET status = ? WHERE id = ?', [normalizedStatus, orderId]);
      if (!updateRes.success) continue;

      await DatabaseUtil.executeQuery(
        'INSERT INTO order_status_history (id, order_id, status, status_details, changed_by) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), orderId, normalizedStatus, statusDetails, req.user.id]
      );
      updated += 1;
    }

    res.json(ResponseFormatter.success('Orders updated successfully', [{ result: { updated } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

module.exports = router;
