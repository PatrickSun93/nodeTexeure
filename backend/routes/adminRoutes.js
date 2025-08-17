const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const router = express.Router();

// Add: rate limiting for admin endpoints
const rateLimit = require('express-rate-limit');

// Unified rate-limit handler that uses your ResponseFormatter
const rateLimitHandler = (req, res /*, next */) => {
  const retryAfterSeconds =
    res.getHeader('Retry-After') ||
    (req.rateLimit && req.rateLimit.resetTime
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : undefined);

  const keyValueTable = {
    path: req.originalUrl,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  };

  return res
    .status(429)
    .json(
      ResponseFormatter.failure(
        'Too many requests, please try again later',
        keyValueTable
      )
    );
};

// Prefer per-user limiting when available, fallback to IP
const keyGenerator = (req) =>
  req.user && req.user.id ? `user:${req.user.id}` : req.ip;

// Write limiter (POST/PUT/DELETE/PATCH)
const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator,
});

// Read limiter (GET)
const adminReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator,
});

/**
 * POST /api/admin/logout
 * Logout admin user by clearing authentication cookies
 * Requires CSRF protection since it's a state-changing operation
 */
router.post('/logout', adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    // Clear the admin authentication cookie
    // Mirror the same settings used when setting the cookie in login
    const isProd = process.env.NODE_ENV === 'production';
    
    res.clearCookie('admin_auth', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/'
    });
    
    // Also clear the CSRF token cookie for security
    res.clearCookie('csrf_token', {
      httpOnly: false,
      secure: isProd,
      sameSite: 'strict',
      path: '/'
    });
    
    const keyValueTable = {
      message: 'Successfully logged out',
      timestamp: new Date().toISOString(),
      action: 'Admin session terminated'
    };
    
    res.json(ResponseFormatter.success('Logout successful', keyValueTable));
  } catch (error) {
    console.error('Admin logout error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Logout failed', keyValueTable));
  }
});

// Product Management
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

module.exports = router;