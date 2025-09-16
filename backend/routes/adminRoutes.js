const express = require('express');
const rateLimit = require('express-rate-limit');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const { protect, admin } = require('../middleware/authMiddleware');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const NotificationService = require('../services/notificationService');
const EmailQueueService = require('../services/emailQueueService');
const OrderService = require('../services/orderService');
const path = require('path');
const fs = require('fs');

// Initialize services
const emailQueueService = new EmailQueueService();
const orderService = new OrderService();

// Multer setup (installed separately). Using disk storage inside backend/uploads
let multer;
try {
  multer = require('multer');
} catch (e) {
 // If multer is not installed, surface a clear error when endpoint is hit
}

const router = express.Router();

// Rate limiter for admin routes
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Separate read/write limiters for finer control
const adminReadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminWriteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminLimiter);
router.use(protect); // Require authentication for all admin routes
router.use(admin);   // Require admin role for all admin routes
router.use(csrfProtection);

// Admin logout
router.post('/logout', async (req, res) => {
  try {
    // Implement your logout logic here
    res.json(ResponseFormatter.success('Logged out successfully'));
  } catch (error) {
    res.status(500).json(ResponseFormatter.failure('Logout failed', { error: error.message }));
  }
});

// Add new product
router.post('/products', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { sku, name, slug, description, short_description, category_id, base_price, product_details, meta_title, meta_description, meta_keywords } = req.body;
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("PROD") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id; // From auth middleware
    
    // Set status to pending_approval for staff users, approved for admin users
    const status = req.user.role === 'admin' ? 'approved' : 'pending_approval';
    
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, status, created_by, meta_title, meta_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, slug, description, short_description, category_id, base_price, JSON.stringify(product_details), status, created_by, meta_title, meta_description, meta_keywords]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('Product added successfully', { id, status }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Update product
router.put('/products/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'product_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('Product updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Delete product
router.delete('/products/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM products WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('Product deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Coupon Management
// Add new coupon
router.post('/coupons', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at } = req.body;
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("DISC") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id;
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO discount_codes (id, code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, code, name, JSON.stringify(discount_details), type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('Coupon added successfully', { id }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Update coupon
router.put('/coupons/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'discount_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE discount_codes SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('Coupon updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Delete coupon
router.delete('/coupons/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM discount_codes WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('Coupon deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Inventory Management
// Update inventory
router.put('/inventory/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// User Management
// List users (read-only; CSRF not required)
router.get('/users', adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT id, email, first_name, last_name, role, status FROM users');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Users fetched successfully', { users: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Update user
router.put('/users/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('User updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Delete user
router.delete('/users/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM users WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('User deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// List products (read-only; CSRF not required)
router.get('/products', adminReadLimiter, async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT p.*, u.first_name, u.last_name FROM products p LEFT JOIN users u ON p.created_by = u.id';
    let params = [];
    
    if (status) {
      query += ' WHERE p.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY p.created_at DESC';
    
    const listResult = await DatabaseUtil.executeQuery(query, params);
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Products fetched successfully', { products: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Get products pending approval
router.get('/products/pending-approval', adminReadLimiter, async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.first_name, u.last_name, u.email as creator_email
      FROM products p 
      LEFT JOIN users u ON p.created_by = u.id 
      WHERE p.status = 'pending_approval' 
      ORDER BY p.created_at ASC
    `;
    
    const listResult = await DatabaseUtil.executeQuery(query);
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Pending products fetched successfully', { products: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Approve product
router.post('/products/:id/approve', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const approved_by = req.user.id;
    const approved_at = new Date().toISOString();
    
    // Get current approval details to preserve history
    const productResult = await DatabaseUtil.executeQuery('SELECT approval_details FROM products WHERE id = ?', [id]);
    if (!productResult.success) throw new Error(productResult.error);
    if (!productResult.data || productResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }
    
    const currentApprovalDetails = productResult.data[0].approval_details ? JSON.parse(productResult.data[0].approval_details) : {};
    const approvalHistory = currentApprovalDetails.approval_history || [];
    
    // Add new approval to history
    approvalHistory.push({
      action: 'approved',
      approved_by,
      approved_at,
      notes: notes || '',
      timestamp: approved_at
    });
    
    const approvalDetails = {
      status: 'approved',
      notes: notes || '',
      approved_by,
      approved_at,
      approval_history: approvalHistory
    };
    
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE products SET status = ?, approval_details = ?, updated_at = NOW() WHERE id = ?',
      ['approved', JSON.stringify(approvalDetails), id]
    );
    
    if (!updateResult.success) throw new Error(updateResult.error);
    
    // Send approval notification
    await NotificationService.sendProductApprovalNotification(id, 'approved', approvalDetails);
    
    res.json(ResponseFormatter.success('Product approved successfully', { id, status: 'approved' }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Reject product
router.post('/products/:id/reject', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason, notes } = req.body;
    const rejected_by = req.user.id;
    const rejected_at = new Date().toISOString();
    
    if (!rejection_reason) {
      return res.status(400).json(ResponseFormatter.failure('Rejection reason is required'));
    }
    
    // Get current approval details to preserve history
    const productResult = await DatabaseUtil.executeQuery('SELECT approval_details FROM products WHERE id = ?', [id]);
    if (!productResult.success) throw new Error(productResult.error);
    if (!productResult.data || productResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }
    
    const currentApprovalDetails = productResult.data[0].approval_details ? JSON.parse(productResult.data[0].approval_details) : {};
    const approvalHistory = currentApprovalDetails.approval_history || [];
    
    // Add new rejection to history
    approvalHistory.push({
      action: 'rejected',
      rejected_by,
      rejected_at,
      rejection_reason,
      notes: notes || '',
      timestamp: rejected_at
    });
    
    const approvalDetails = {
      status: 'rejected',
      rejection_reason,
      notes: notes || '',
      rejected_by,
      rejected_at,
      approval_history: approvalHistory
    };
    
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE products SET status = ?, approval_details = ?, updated_at = NOW() WHERE id = ?',
      ['rejected', JSON.stringify(approvalDetails), id]
    );
    
    if (!updateResult.success) throw new Error(updateResult.error);
    
    // Send rejection notification
    await NotificationService.sendProductApprovalNotification(id, 'rejected', approvalDetails);
    
    res.json(ResponseFormatter.success('Product rejected successfully', { id, status: 'rejected' }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Get product approval history
router.get('/products/:id/approval-history', adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT p.approval_details, p.status, p.created_at,
             creator.first_name as creator_first_name, creator.last_name as creator_last_name,
             creator.email as creator_email
      FROM products p
      LEFT JOIN users creator ON p.created_by = creator.id
      WHERE p.id = ?
    `;
    
    const result = await DatabaseUtil.executeQuery(query, [id]);
    if (!result.success) throw new Error(result.error);
    if (!result.data || result.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }
    
    const product = result.data[0];
    const approvalDetails = product.approval_details ? JSON.parse(product.approval_details) : {};
    const approvalHistory = approvalDetails.approval_history || [];
    
    // Get user details for each approval/rejection action
    const userIds = [...new Set(approvalHistory.map(h => h.approved_by || h.rejected_by).filter(Boolean))];
    let users = {};
    
    if (userIds.length > 0) {
      const userQuery = 'SELECT id, first_name, last_name, email FROM users WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
      const userResult = await DatabaseUtil.executeQuery(userQuery, userIds);
      if (userResult.success) {
        userResult.data.forEach(user => {
          users[user.id] = user;
        });
      }
    }
    
    // Enrich history with user details
    const enrichedHistory = approvalHistory.map(entry => ({
      ...entry,
      user: users[entry.approved_by || entry.rejected_by] || null
    }));
    
    const responseData = {
      product_id: id,
      current_status: product.status,
      created_at: product.created_at,
      creator: {
        first_name: product.creator_first_name,
        last_name: product.creator_last_name,
        email: product.creator_email
      },
      approval_history: enrichedHistory
    };
    
    res.json(ResponseFormatter.success('Approval history fetched successfully', responseData));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// List coupons (read-only; CSRF not required)
router.get('/coupons', adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM discount_codes');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Coupons fetched successfully', { coupons: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// List inventory (read-only; CSRF not required)
router.get('/inventory', adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM inventory');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Inventory fetched successfully', { inventory: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Sales Analytics Dashboard
router.get('/analytics/dashboard', adminReadLimiter, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    
    // Total sales for period
    const salesQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value
      FROM orders 
      WHERE status != 'cancelled' 
      AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    const salesResult = await DatabaseUtil.executeQuery(salesQuery, [period]);
    
    // Daily sales for chart
    const dailySalesQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders 
      WHERE status != 'cancelled' 
      AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    const dailySalesResult = await DatabaseUtil.executeQuery(dailySalesQuery, [period]);
    
    // Top products
    const topProductsQuery = `
      SELECT 
        oi.product_name,
        oi.product_sku,
        SUM(oi.quantity) as total_sold,
        SUM(oi.total_price) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled' 
      AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY oi.product_id, oi.product_name, oi.product_sku
      ORDER BY total_sold DESC
      LIMIT 10
    `;
    const topProductsResult = await DatabaseUtil.executeQuery(topProductsQuery, [period]);
    
    // Order status breakdown
    const orderStatusQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM orders 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY status
    `;
    const orderStatusResult = await DatabaseUtil.executeQuery(orderStatusQuery, [period]);
    
    // Recent orders
    const recentOrdersQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_amount,
        o.created_at,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), o.guest_email) as customer_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `;
    const recentOrdersResult = await DatabaseUtil.executeQuery(recentOrdersQuery);
    
    const analytics = {
      summary: salesResult.success ? salesResult.data[0] : {},
      daily_sales: dailySalesResult.success ? dailySalesResult.data : [],
      top_products: topProductsResult.success ? topProductsResult.data : [],
      order_status: orderStatusResult.success ? orderStatusResult.data : [],
      recent_orders: recentOrdersResult.success ? recentOrdersResult.data : []
    };
    
    res.json(ResponseFormatter.success('Analytics fetched successfully', analytics));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Order Management - Enhanced with filtering and search
router.get('/orders', adminReadLimiter, async (req, res) => {
  try {
    const {
      status,
      dateFrom,
      dateTo,
      customerEmail,
      orderNumber,
      minAmount,
      maxAmount,
      page = 1,
      limit = 20
    } = req.query;

    const filters = {
      status,
      dateFrom,
      dateTo,
      customerEmail,
      orderNumber,
      minAmount,
      maxAmount
    };

    const result = await orderService.getOrdersWithFilters(filters, parseInt(page), parseInt(limit));
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Get order details with status history
router.get('/orders/:id', adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order details
    const orderQuery = `
      SELECT 
        o.*,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), o.guest_email) as customer_name,
        u.email as customer_email,
        u.phone as customer_phone
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `;
    const orderResult = await DatabaseUtil.executeQuery(orderQuery, [id]);
    
    if (!orderResult.success || !orderResult.data.length) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }
    
    // Get order items
    const itemsQuery = `
      SELECT 
        oi.*,
        p.name as current_product_name,
        pi.thumbnail_small_url
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
      WHERE oi.order_id = ?
      ORDER BY oi.created_at
    `;
    const itemsResult = await DatabaseUtil.executeQuery(itemsQuery, [id]);
    
    const order = orderResult.data[0];
    order.items = itemsResult.success ? itemsResult.data : [];
    
    // Parse JSON fields
    if (order.shipping_address_json) {
      order.shipping_address = JSON.parse(order.shipping_address_json);
    }
    if (order.billing_address_json) {
      order.billing_address = JSON.parse(order.billing_address_json);
    }
    
    // Get order status history
    const historyResult = await orderService.getOrderStatusHistory(id);
    order.status_history = historyResult.success ? historyResult.data : [];
    
    res.json(ResponseFormatter.success('Order details fetched successfully', order));
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Update order status
router.put('/orders/:id/status', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json(ResponseFormatter.failure('Invalid status'));
    }
    
    // Get order details before updating for email notification
    const orderResult = await DatabaseUtil.executeQuery(
      `SELECT o.*, u.email, u.first_name, u.last_name 
       FROM orders o 
       LEFT JOIN users u ON o.user_id = u.id 
       WHERE o.id = ?`,
      [id]
    );

    if (!orderResult.success || orderResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }

    const order = orderResult.data[0];
    
    // Update order status
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    if (!updateResult.success) {
      throw new Error(updateResult.error);
    }
    
    // Queue email notification for status update
    try {
      const customerEmail = order.email || order.guest_email;
      
      if (customerEmail) {
        const orderData = {
          orderNumber: order.order_number,
          orderId: order.id,
          status: status,
          totalAmount: `$${order.total_amount.toFixed(2)}`,
          customerName: order.first_name ? `${order.first_name} ${order.last_name || ''}`.trim() : 'Guest',
          notes: notes || ''
        };

        // For shipped status, send shipping notification instead of status update
        if (status === 'shipped') {
          // Add tracking information if available
          orderData.trackingNumber = order.tracking_number || 'TBD';
          orderData.estimatedDelivery = order.estimated_delivery_date || 'Within 3-5 business days';
          orderData.trackingUrl = order.tracking_number ? `https://www.fedex.com/fedextrack/?trknbr=${order.tracking_number}` : null;
          
          await emailQueueService.queueShippingNotification(customerEmail, orderData);
          console.log(`Shipping notification email queued for order ${order.order_number}`);
        } else {
          await emailQueueService.queueOrderStatusUpdate(customerEmail, orderData);
          console.log(`Order status update email queued for order ${order.order_number}`);
        }
      }
    } catch (emailError) {
      console.error('Failed to queue order status email:', emailError);
      // Don't fail the status update if email fails
    }
    
    res.json(ResponseFormatter.success('Order status updated successfully', { id, status }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Cancel order
router.put('/orders/:id/cancel', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const cancelledBy = req.user.id;
    
    if (!reason) {
      return res.status(400).json(ResponseFormatter.failure('Cancellation reason is required'));
    }
    
    const result = await orderService.cancelOrder(id, reason, cancelledBy);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Process refund
router.post('/orders/:id/refund', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, reasonNotes } = req.body;
    const processedBy = req.user.id;
    
    if (!amount || !reason) {
      return res.status(400).json(ResponseFormatter.failure('Amount and reason are required'));
    }
    
    const result = await orderService.initiateRefund(id, parseFloat(amount), reason, reasonNotes, processedBy);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Get order status history
router.get('/orders/:id/history', adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await orderService.getOrderStatusHistory(id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Bulk product operations
router.post('/products/bulk-update', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds, updates } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Product IDs array is required'));
    }
    
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Updates object is required'));
    }
    
    const updateFields = [];
    const updateValues = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'product_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    
    const placeholders = productIds.map(() => '?').join(',');
    const query = `UPDATE products SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id IN (${placeholders})`;
    const params = [...updateValues, ...productIds];
    
    const updateResult = await DatabaseUtil.executeQuery(query, params);
    
    if (!updateResult.success) {
      throw new Error(updateResult.error);
    }
    
    res.json(ResponseFormatter.success('Bulk update completed successfully', { 
      updated_count: updateResult.affectedRows || productIds.length 
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Bulk product delete
router.delete('/products/bulk-delete', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Product IDs array is required'));
    }
    
    const placeholders = productIds.map(() => '?').join(',');
    const query = `DELETE FROM products WHERE id IN (${placeholders})`;
    
    const deleteResult = await DatabaseUtil.executeQuery(query, productIds);
    
    if (!deleteResult.success) {
      throw new Error(deleteResult.error);
    }
    
    res.json(ResponseFormatter.success('Bulk delete completed successfully', { 
      deleted_count: deleteResult.affectedRows || productIds.length 
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Ensure upload directory exists
function ensureDirSync(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    // ignore if exists
  }
}

// Configure multer storage dynamically based on product id
function createMulterForProduct(productId) {
  if (!multer) {
    throw new Error('File upload not available: multer is not installed on backend. Please install it in backend package.json');
  }
  const dest = path.join(__dirname, '..', 'uploads', 'products', String(productId));
  ensureDirSync(dest);
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, dest);
    },
    filename: function (req, file, cb) {
      // Simple filename: timestamp-originalName sanitized
      const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const ts = Date.now();
      cb(null, `${ts}-${safeBase}`);
    },
  });
  return multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only images are allowed.'));
      }
      cb(null, true);
    },
  });
}

// POST /api/admin/products/:id/image - upload a single primary thumbnail (legacy endpoint)
// Note: For bulk uploads and advanced features, use /api/images/products/:id/upload
router.post('/products/:id/image', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const productId = req.params.id;
    // Accept alphanumeric IDs (e.g., PROD0000000001) with dashes/underscores
    if (!/^[A-Za-z0-9_-]+$/.test(String(productId))) {
      return res.status(400).json(ResponseFormatter.failure('Invalid product id'));
    }

    // Verify product exists first
    const prodResult = await DatabaseUtil.executeQuery('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
    if (!prodResult.success) throw new Error(prodResult.error || 'Failed to verify product');
    if (!prodResult.data || prodResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    // Initialize multer for this product
    let uploader;
    try {
      uploader = createMulterForProduct(productId).single('image');
    } catch (e) {
      return res.status(500).json(ResponseFormatter.failure('Upload not available', { error: e.message }));
    }

    uploader(req, res, async function (err) {
      if (err) {
        return res.status(400).json(ResponseFormatter.failure('Upload failed', { error: err.message }));
      }
      if (!req.file) {
        return res.status(400).json(ResponseFormatter.failure('No file uploaded. Expect field name "image"'));
      }

      // Build public URL using static /uploads mount (configured in server.js)
      // e.g. http://localhost:6666/uploads/products/:id/filename
      const baseUrl = `${req.protocol}://${req.get('host')}`; // respects env and proxy
      const publicUrl = `${baseUrl}/uploads/products/${productId}/${encodeURIComponent(req.file.filename)}`;

      // Update product thumbnail_small_url (legacy behavior)
      const updateResult = await DatabaseUtil.executeQuery(
        'UPDATE products SET thumbnail_small_url = ?, updated_at = NOW() WHERE id = ?',
        [publicUrl, productId]
      );
      if (!updateResult.success) {
        return res.status(500).json(ResponseFormatter.failure('Failed to update product image', { error: updateResult.error }));
      }

      const keyValueTable = { url: publicUrl, field: 'thumbnail_small_url' };
      return res.json(ResponseFormatter.success('Image uploaded and product updated', keyValueTable));
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;