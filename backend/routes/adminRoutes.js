const express = require('express');
const rateLimit = require('express-rate-limit');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const path = require('path');
const fs = require('fs');

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
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, created_by, meta_title, meta_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, slug, description, short_description, category_id, base_price, JSON.stringify(product_details), created_by, meta_title, meta_description, meta_keywords]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('Product added successfully', { id }));
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

// Create user (admin)
router.post('/users', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { email, first_name, last_name, role = 'customer' } = req.body;

    // Input validation
    if (!email || !first_name || !last_name) {
      const keyValueTable = {
        error: 'Email, first name, and last name are required'
      };
      return res.status(400).json(ResponseFormatter.failure(
        'Missing required fields',
        keyValueTable
      ));
    }

    // Check if email already exists
    const checkResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (checkResult.data && checkResult.data.length > 0) {
      const keyValueTable = {
        error: 'Email already registered'
      };
      return res.status(400).json(ResponseFormatter.failure(
        'Email already exists',
        keyValueTable
      ));
    }

    // Get next user ID
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id(\"USER\") as id');
    if (!idResult.success) {
      throw new Error('Failed to generate user ID');
    }
    const userId = idResult.data[0].id;

    // Generate a temporary password for admin-created users
    // In a real implementation, you might want to force password reset
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(12).toString('hex');
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Insert new user
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, email, hashedPassword, first_name, last_name, role]
    );

    if (insertResult.success) {
      const keyValueTable = {
        userId: userId,
        email: email,
        firstName: first_name,
        lastName: last_name,
        role: role,
        message: 'User created successfully'
      };
      res.status(201).json(ResponseFormatter.success(
        'User created successfully',
        keyValueTable
      ));
    } else {
      throw new Error('Failed to insert user');
    }
  } catch (error) {
    console.error('User creation error:', error);
    const keyValueTable = {
      error: error.message
    };
    res.status(500).json(ResponseFormatter.failure(
      'User creation failed',
      keyValueTable
    ));
  }
});

// Update user
router.put('/users/:id', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    
    // Only allow specific fields to be updated for security
    for (const [key, value] of Object.entries(updates)) {
      if (['first_name', 'last_name', 'role', 'status', 'email'].includes(key)) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    
    if (updateFields.length === 0) {
      const keyValueTable = { error: 'No valid fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No fields to update', keyValueTable));
    }
    
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

    if (!updateResult.success) {
      throw new Error('Failed to update user');
    }

    const keyValueTable = { userId: id, updatedFields: updateFields.length };
    res.json(ResponseFormatter.success('User updated successfully', keyValueTable));
  } catch (error) {
    console.error('Update user error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update user', keyValueTable));
  }
});

// Get products pending approval (admin only)
router.get('/products/pending-approval', adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery(`
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.email as creator_email
      FROM products p
      JOIN users u ON p.created_by = u.id
      WHERE p.status = 'pending_approval'
      ORDER BY p.created_at DESC
    `);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch pending approval products');
    }

    res.json(ResponseFormatter.success('Pending approval products fetched successfully', { 
      products: result.data 
    }));
  } catch (error) {
    console.error('Get pending approval products error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get pending approval products', { error: error.message }));
  }
});

// Get approval history for a product (admin only)
router.get('/products/:id/approval-history', adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get product information
    const productResult = await DatabaseUtil.executeQuery(`
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.email
      FROM products p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `, [id]);
    
    if (!productResult.success || productResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }
    
    const product = productResult.data[0];
    
    // Get approval history (we assume there's an approval history table or a way to track this)
    // For now, we'll simulate by looking at status changes in a potential activity log table
    // In a real implementation, you'd have a dedicated approval tracking system
    const historyResult = await DatabaseUtil.executeQuery(`
      SELECT 
        a.status,
        a.timestamp,
        a.notes,
        a.rejection_reason,
        a.changed_by_user_id,
        u.first_name as admin_first_name,
        u.last_name as admin_last_name
      FROM (
        -- Assuming there's an audit/approval log - creating a simplified example
        -- In real implementation, you'd have a dedicated table for this
        SELECT 
          status,
          updated_at as timestamp,
          'Status updated' as notes,
          NULL as rejection_reason,
          NULL as changed_by_user_id
        FROM products 
        WHERE id = ? AND status IN ('pending_approval', 'approved', 'rejected')
      ) a
      LEFT JOIN users u ON a.changed_by_user_id = u.id
      ORDER BY a.timestamp DESC
    `, [id]);
    
    if (!historyResult.success) {
      throw new Error(historyResult.error || 'Failed to fetch approval history');
    }

    // For simplicity in this example, we'll return basic history
    // In a real implementation, you'd have a dedicated approval tracking system
    const approvalHistory = {
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        current_status: product.status,
        created_at: product.created_at
      },
      creator: {
        id: product.created_by,
        first_name: product.first_name,
        last_name: product.last_name,
        email: product.email
      },
      approval_history: historyResult.data || []
    };

    res.json(ResponseFormatter.success('Approval history fetched successfully', approvalHistory));
  } catch (error) {
    console.error('Get approval history error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get approval history', { error: error.message }));
  }
});

// Approve a product (admin only)
router.post('/products/:id/approve', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes = '' } = req.body;
    
    // Update product status to approved
    const updateResult = await DatabaseUtil.executeQuery(
      `UPDATE products 
       SET status = 'approved', 
           approved_at = NOW(), 
           approved_by = ?, 
           approval_notes = ? 
       WHERE id = ?`,
      [req.user.id, notes, id]
    );
    
    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to approve product');
    }
    
    if (updateResult.data.affectedRows === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    res.json(ResponseFormatter.success('Product approved successfully'));
  } catch (error) {
    console.error('Approve product error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to approve product', { error: error.message }));
  }
});

// Reject a product (admin only)
router.post('/products/:id/reject', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason, notes = '' } = req.body;
    
    if (!rejection_reason) {
      return res.status(400).json(ResponseFormatter.failure('Rejection reason is required'));
    }
    
    // Update product status to rejected
    const updateResult = await DatabaseUtil.executeQuery(
      `UPDATE products 
       SET status = 'rejected', 
           rejected_at = NOW(), 
           rejected_by = ?, 
           rejection_reason = ?, 
           approval_notes = ? 
       WHERE id = ?`,
      [req.user.id, rejection_reason, notes, id]
    );
    
    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to reject product');
    }
    
    if (updateResult.data.affectedRows === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    res.json(ResponseFormatter.success('Product rejected successfully'));
  } catch (error) {
    console.error('Reject product error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to reject product', { error: error.message }));
  }
});

// Get all products with optional filters (admin only)
router.get('/products', adminReadLimiter, async (req, res) => {
  try {
    const { status, category_id, search, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT 
        p.*,
        u.first_name,
        u.last_name
      FROM products p
      LEFT JOIN users u ON p.created_by = u.id
    `;
    const params = [];
    
    const conditions = [];
    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (category_id) {
      conditions.push('p.category_id = ?');
      params.push(category_id);
    }
    if (search) {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ' ORDER BY p.created_at DESC';
    
    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const result = await DatabaseUtil.executeQuery(query, params);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch products');
    }

    res.json(ResponseFormatter.success('Products fetched successfully', { 
      products: result.data 
    }));
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get products', { error: error.message }));
  }
});

// Get a specific product (admin only)
router.get('/products/:id', adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await DatabaseUtil.executeQuery(`
      SELECT 
        p.*,
        u.first_name,
        u.last_name
      FROM products p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `, [id]);
    
    if (!result.success || result.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    res.json(ResponseFormatter.success('Product fetched successfully', result.data[0]));
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get product', { error: error.message }));
  }
});

// Admin logout - clears the admin_auth cookie
router.post('/logout', async (req, res) => {
  try {
    // Clear the admin_auth cookie
    res.clearCookie('admin_auth', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    
    res.json(ResponseFormatter.success('Logged out successfully'));
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json(ResponseFormatter.failure('Logout failed', { error: error.message }));
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
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM products');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Products fetched successfully', { products: listResult.data }));
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

// Bulk product operations
router.post('/products/bulk-update', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds, updates } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('productIds array is required'));
    }
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json(ResponseFormatter.failure('updates object is required'));
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'description', 'status', 'base_price', 'category_id'].includes(key)) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    
    // Add product IDs to values array
    productIds.forEach(id => updateValues.push(id));
    
    const updateQuery = `UPDATE products SET ${updateFields.join(', ')} WHERE id IN (${productIds.map(() => '?').join(',')})`;
    const updateResult = await DatabaseUtil.executeQuery(updateQuery, updateValues);
    
    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to update products');
    }

    res.json(ResponseFormatter.success('Products updated successfully', { 
      updatedCount: updateResult.data.affectedRows,
      productIds 
    }));
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json(ResponseFormatter.failure('Bulk update failed', { error: error.message }));
  }
});

// Bulk delete products
router.delete('/products/bulk-delete', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('productIds array is required'));
    }
    
    // Check if any products have associated orders (prevent deletion of products with orders)
    const ordersCheckResult = await DatabaseUtil.executeQuery(
      `SELECT p.id, COUNT(o.id) as order_count
       FROM products p
       LEFT JOIN order_items oi ON p.id = oi.product_id
       LEFT JOIN orders o ON oi.order_id = o.id
       WHERE p.id IN (${productIds.map(() => '?').join(',')}) AND o.id IS NOT NULL
       GROUP BY p.id
       LIMIT 1`,
      productIds
    );
    
    if (ordersCheckResult.success && ordersCheckResult.data.length > 0) {
      return res.status(400).json(ResponseFormatter.failure('Cannot delete products that have associated orders'));
    }
    
    // Perform bulk deletion
    const deleteResult = await DatabaseUtil.executeQuery(
      `DELETE FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
      productIds
    );
    
    if (!deleteResult.success) {
      throw new Error(deleteResult.error || 'Failed to delete products');
    }

    res.json(ResponseFormatter.success('Products deleted successfully', { 
      deletedCount: deleteResult.data.affectedRows,
      productIds 
    }));
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json(ResponseFormatter.failure('Bulk delete failed', { error: error.message }));
  }
});

// Dashboard stats (read-only; CSRF not required)
router.get('/dashboard/stats', adminReadLimiter, async (req, res) => {
  try {
    // Get total counts for key metrics
    const [
      productsResult,
      usersResult,
      ordersResult,
      revenueResult
    ] = await Promise.all([
      DatabaseUtil.executeQuery('SELECT COUNT(*) as count FROM products'),
      DatabaseUtil.executeQuery('SELECT COUNT(*) as count FROM users'),
      DatabaseUtil.executeQuery('SELECT COUNT(*) as count FROM orders'),
      DatabaseUtil.executeQuery('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status != "cancelled"')
    ]);

    if (!productsResult.success) throw new Error(productsResult.error);
    if (!usersResult.success) throw new Error(usersResult.error);
    if (!ordersResult.success) throw new Error(ordersResult.error);
    if (!revenueResult.success) throw new Error(revenueResult.error);

    const stats = {
      totalProducts: productsResult.data[0].count,
      totalUsers: usersResult.data[0].count,
      totalOrders: ordersResult.data[0].count,
      totalRevenue: parseFloat(revenueResult.data[0].total || 0),
      lastUpdated: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Dashboard stats retrieved successfully', stats));
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get dashboard stats', { error: error.message }));
  }
});

// Detailed analytics dashboard (read-only; CSRF not required)
router.get('/analytics/dashboard', adminReadLimiter, async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30; // Default to 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get all the necessary data for dashboard analytics
    const [
      summaryResult,
      dailySalesResult,
      orderStatusResult,
      topProductsResult,
      recentOrdersResult
    ] = await Promise.all([
      // Summary data
      DatabaseUtil.executeQuery(`
        SELECT 
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COUNT(*) as total_orders,
          COALESCE(AVG(total_amount), 0) as average_order_value
        FROM orders 
        WHERE created_at >= ? AND status != 'cancelled'
      `, [startDateStr]),
      
      // Daily sales for the period
      DatabaseUtil.executeQuery(`
        SELECT 
          DATE(created_at) as date,
          SUM(total_amount) as revenue,
          COUNT(*) as orders
        FROM orders 
        WHERE created_at >= ? AND status != 'cancelled'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) DESC
      `, [startDateStr]),
      
      // Order status breakdown
      DatabaseUtil.executeQuery(`
        SELECT 
          status,
          COUNT(*) as count
        FROM orders 
        WHERE created_at >= ?
        GROUP BY status
      `, [startDateStr]),
      
      // Top selling products
      DatabaseUtil.executeQuery(`
        SELECT 
          p.name as product_name,
          p.sku as product_sku,
          SUM(oi.quantity) as total_sold,
          SUM(oi.total_price) as total_revenue
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= ? AND o.status != 'cancelled'
        GROUP BY p.id
        ORDER BY total_sold DESC
        LIMIT 10
      `, [startDateStr]),
      
      // Recent orders
      DatabaseUtil.executeQuery(`
        SELECT 
          o.id,
          o.order_number,
          o.total_amount,
          o.status,
          o.created_at,
          CONCAT(u.first_name, ' ', u.last_name) as customer_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.created_at >= ?
        ORDER BY o.created_at DESC
        LIMIT 10
      `, [startDateStr])
    ]);

    if (!summaryResult.success) throw new Error(summaryResult.error || 'Failed to get summary data');
    if (!dailySalesResult.success) throw new Error(dailySalesResult.error || 'Failed to get daily sales');
    if (!orderStatusResult.success) throw new Error(orderStatusResult.error || 'Failed to get order status');
    if (!topProductsResult.success) throw new Error(topProductsResult.error || 'Failed to get top products');
    if (!recentOrdersResult.success) throw new Error(recentOrdersResult.error || 'Failed to get recent orders');

    const analyticsData = {
      summary: summaryResult.data[0] ? {
        total_revenue: parseFloat(summaryResult.data[0].total_revenue || 0),
        total_orders: summaryResult.data[0].total_orders || 0,
        average_order_value: parseFloat(summaryResult.data[0].average_order_value || 0)
      } : { total_revenue: 0, total_orders: 0, average_order_value: 0 },
      daily_sales: dailySalesResult.data || [],
      order_status: orderStatusResult.data || [],
      top_products: topProductsResult.data || [],
      recent_orders: recentOrdersResult.data || []
    };

    res.json(ResponseFormatter.success('Analytics dashboard data retrieved successfully', analyticsData));
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get dashboard analytics', { error: error.message }));
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

// POST /api/admin/products/:id/image - upload a single primary thumbnail and store URL in products.thumbnail_small_url
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

      // Update product thumbnail_small_url
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