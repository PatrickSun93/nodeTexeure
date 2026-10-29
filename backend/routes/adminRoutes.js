const express = require('express');
const rateLimit = require('express-rate-limit');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const { admin } = authMiddleware;
// `staffOrAdmin` is introduced by a coordinated change to authMiddleware. Fall back to
// admin-only until it lands so the router never registers an undefined middleware.
const staffOrAdmin = authMiddleware.staffOrAdmin || admin;
const InventoryService = require('../services/inventoryService');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const emailQueueProducer = require('../services/emailQueueProducer');
const emailService = require('../services/emailService');

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
router.post('/logout', admin, async (req, res) => {
  try {
    // Implement your logout logic here
    res.json(ResponseFormatter.success('Logged out successfully'));
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json(ResponseFormatter.failure('Logout failed'));
  }
});

// Add new product
router.post('/products', staffOrAdmin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { variants, stock, ...productData } = req.body; // Extract non-DB columns
    const { sku, name, slug, description, short_description, category_id, base_price, product_details, meta_title, meta_description, meta_keywords } = productData;

    // Validate required fields up front (category_id is NOT NULL with an FK) —
    // otherwise MySQL rejects the INSERT and the client gets an opaque 500.
    if (!name || base_price == null || !category_id) {
      return res.status(400).json(ResponseFormatter.failure('name, base_price and category_id are required'));
    }

    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("PROD") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id; // From auth middleware

    // Coalesce optional fields to null — mysql2 rejects undefined bind parameters.
    const safeSlug = slug || String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, created_by, meta_title, meta_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sku || null, name, safeSlug, description || null, short_description || null, category_id, base_price, JSON.stringify(product_details || {}), created_by, meta_title || null, meta_description || null, meta_keywords || null]
    );
    if (!insertResult.success) throw new Error(insertResult.error);

    // 2. Base Inventory (Product Level) — use the custom-ID system (collision-free,
    // atomic) rather than an ad-hoc Date.now() string.
    if (stock) {
      const invRes = await DatabaseUtil.executeQuery("SELECT get_next_id('INV') AS id");
      const invId = DatabaseUtil.first(invRes)?.id;
      if (!invRes.success || !invId) throw new Error('Failed to generate inventory ID');
      await DatabaseUtil.executeQuery(
        'INSERT INTO inventory (id, product_id, quantity_available) VALUES (?, ?, ?)',
        [invId, id, stock]
      );
    }

    // 3. Handle Variants
    if (variants && Array.isArray(variants)) {
      for (const v of variants) {
        const vidRes = await DatabaseUtil.executeQuery("SELECT get_next_id('VAR') AS id");
        const vid = DatabaseUtil.first(vidRes)?.id;
        if (!vidRes.success || !vid) throw new Error('Failed to generate product variant ID');
        await DatabaseUtil.executeQuery(
          'INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, ?, ?, ?)',
          [vid, id, v.sku, v.size, v.color, v.price_adjustment || 0]
        );
        // Variant Inventory
        const vInvRes = await DatabaseUtil.executeQuery("SELECT get_next_id('INV') AS id");
        const vInvId = DatabaseUtil.first(vInvRes)?.id;
        if (!vInvRes.success || !vInvId) throw new Error('Failed to generate inventory ID');
        await DatabaseUtil.executeQuery(
          'INSERT INTO inventory (id, product_id, variant_id, quantity_available) VALUES (?, ?, ?, ?)',
          [vInvId, id, vid, v.stock || 0]
        );
      }
    }

    res.status(201).json(ResponseFormatter.success('Product added successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    if (error.message && error.message.includes('Duplicate entry')) {
      return res.status(409).json(ResponseFormatter.failure('A product with this SKU or slug already exists'));
    }
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update product
router.put('/products/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { variants, ...updates } = req.body; // Extract variants to prevent column error

    // 1. Update Product Fields (whitelist columns to prevent SQL injection)
    const ALLOWED_PRODUCT_COLUMNS = [
      'name', 'slug', 'sku', 'description', 'short_description', 'base_price',
      'sale_price', 'cost_price', 'category_id', 'product_details', 'status',
      'is_featured', 'meta_title', 'meta_description', 'meta_keywords',
    ];
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_PRODUCT_COLUMNS.includes(key)) continue;
      if (key === 'product_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      const updateResult = await DatabaseUtil.executeQuery(`UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
      if (!updateResult.success) throw new Error(updateResult.error);
    }

    // 2. Handle Variants (Upsert)
    if (variants && Array.isArray(variants)) {
      for (const v of variants) {
        if (v.id) {
          // Update Existing Variant
          // We typically update price_adj, sku, stock (via inventory)
          // Assuming v has: id, sku, size, color, price_adjustment, stock
          await DatabaseUtil.executeQuery(
            'UPDATE product_variants SET sku = ?, size = ?, color = ?, price_adjustment = ? WHERE id = ?',
            [v.sku, v.size, v.color, v.price_adjustment || 0, v.id]
          );
          // Update Inventory
          if (v.stock !== undefined) {
            await DatabaseUtil.executeQuery(
              'UPDATE inventory SET quantity_available = ? WHERE variant_id = ?',
              [v.stock, v.id]
            );
          }
        } else {
          // Insert New Variant. Use the custom-ID system (get_next_id) rather than
          // an ad-hoc `Date.now()` string so IDs are collision-free and consistent
          // with the rest of the schema. Prefixes VAR/INV are registered in transno
          // (docker/mysql/init.sql).
          const vidRes = await DatabaseUtil.executeQuery("SELECT get_next_id('VAR') AS id");
          const newVariantId = DatabaseUtil.first(vidRes)?.id;
          if (!vidRes.success || !newVariantId) {
            throw new Error('Failed to generate product variant ID');
          }

          await DatabaseUtil.executeQuery(
            'INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, ?, ?, ?)',
            [newVariantId, id, v.sku, v.size, v.color, v.price_adjustment || 0]
          );
          // Insert Inventory
          const invRes = await DatabaseUtil.executeQuery("SELECT get_next_id('INV') AS id");
          const invId = DatabaseUtil.first(invRes)?.id;
          if (!invRes.success || !invId) {
            throw new Error('Failed to generate inventory ID');
          }
          await DatabaseUtil.executeQuery(
            'INSERT INTO inventory (id, product_id, variant_id, quantity_available) VALUES (?, ?, ?, ?)',
            [invId, id, newVariantId, v.stock || 0]
          );
        }
      }
    }

    res.json(ResponseFormatter.success('Product updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Delete product
router.delete('/products/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM products WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('Product deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update product status (approval workflow)
// Called by the admin product-approval UI: PUT /api/admin/products/:id/status
// Sets products.status and appends an entry to products.approval_details (JSON).
router.put('/products/:id/status', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const ALLOWED_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected'];
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json(
        ResponseFormatter.failure(`Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`)
      );
    }

    // Load current approval_details so we can preserve the approval history.
    const currentRes = await DatabaseUtil.executeQuery('SELECT approval_details FROM products WHERE id = ?', [id]);
    if (!currentRes.success) throw new Error(currentRes.error);
    if (!currentRes.data || currentRes.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    // approval_details is a JSON column: the driver may hand it back as an object or a string.
    let details = {};
    const rawDetails = currentRes.data[0].approval_details;
    if (rawDetails) {
      try {
        details = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails;
      } catch (e) {
        details = {};
      }
    }

    const history = Array.isArray(details.history) ? details.history : [];
    const changedAt = new Date().toISOString();
    history.push({ status, notes: notes || '', changed_by: req.user.id, changed_at: changedAt });

    const approvalDetails = {
      ...details,
      status,
      notes: notes || '',
      approved_by: req.user.id,
      approved_at: changedAt,
      history,
    };

    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE products SET status = ?, approval_details = ?, updated_at = NOW() WHERE id = ?',
      [status, JSON.stringify(approvalDetails), id]
    );
    if (!updateResult.success) throw new Error(updateResult.error);

    res.json(ResponseFormatter.success('Product status updated', [{ id, status }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Category Management
// List categories
router.get('/categories', admin, adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(ResponseFormatter.success('Categories fetched successfully', [{ categories: listResult.data }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Coupon Management
// Add new coupon
router.post('/coupons', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at } = req.body;
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("DISC") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id;
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO discount_codes (id, code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        code || null,
        name || null,
        JSON.stringify(discount_details || {}),
        type || 'percentage',
        value || 0,
        minimum_order_amount || null,
        maximum_discount_amount || null,
        usage_limit || null,
        usage_limit_per_customer || null,
        starts_at || null,  // Handles '' and undefined
        expires_at || null, // Handles '' and undefined
        created_by
      ]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('Coupon added successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    if (error.message && error.message.includes('Duplicate entry')) {
      return res.status(409).json(ResponseFormatter.failure('A coupon with this code already exists'));
    }
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update coupon
router.put('/coupons/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Whitelist updatable columns to prevent column-name injection & mass assignment
    const ALLOWED_COUPON_COLUMNS = [
      'code', 'name', 'discount_details', 'type', 'value',
      'minimum_order_amount', 'maximum_discount_amount', 'usage_limit',
      'usage_limit_per_customer', 'is_active', 'starts_at', 'expires_at',
    ];
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_COUPON_COLUMNS.includes(key)) continue;
      if (key === 'discount_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value || {}));
      } else {
        updateFields.push(`${key} = ?`);
        // Sanitize empty strings and undefined to NULL for date fields or optional params
        if (value === '' || value === undefined) {
          updateValues.push(null);
        } else {
          updateValues.push(value);
        }
      }
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE discount_codes SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('Coupon updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Delete coupon
router.delete('/coupons/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM discount_codes WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('Coupon deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

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

// User Management
// List users (read-only; CSRF not required)
router.get('/users', admin, adminReadLimiter, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status,
             COUNT(o.id) as orders_count,
             COALESCE(SUM(o.total_amount), 0) as total_spent,
             MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role NOT IN ('admin', 'staff')
      GROUP BY u.id
    `;
    const listResult = await DatabaseUtil.executeQuery(query);
    if (!listResult.success) throw new Error(listResult.error);

    // Map to friendly format
    const users = listResult.data.map(u => ({
      id: u.id,
      name: u.first_name ? `${u.first_name} ${u.last_name || ''}` : 'Guest/Unknown',
      email: u.email,
      role: u.role,
      status: u.status,
      orders: u.orders_count,
      spent: u.total_spent,
      lastOrder: u.last_order_date
    }));

    res.json(ResponseFormatter.success('Users fetched successfully', [{ users }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});


// Create user
router.post('/users', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, status, phone } = req.body;

    // Basic validation
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json(ResponseFormatter.failure('Missing required fields'));
    }

    // Check if user exists
    const checkResult = await DatabaseUtil.executeQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (checkResult.data.length > 0) {
      return res.status(409).json(ResponseFormatter.failure('User with this email already exists'));
    }

    const idResult = await DatabaseUtil.executeQuery('SELECT UUID() as id'); // Or get_next_id if preferred
    const id = idResult.data[0].id;

    const hashedPassword = await bcrypt.hash(password, 10);

    // Default values
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, email, hashedPassword, first_name, last_name, role || 'customer', status || 'active', phone]
    );

    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('User created successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update user
router.put('/users/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Whitelist updatable columns to prevent column-name injection & mass assignment
    const ALLOWED_USER_COLUMNS = ['first_name', 'last_name', 'email', 'phone', 'role', 'status'];
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_USER_COLUMNS.includes(key)) continue;
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    // A role or status change revokes the user's outstanding access tokens.
    if ('role' in updates || 'status' in updates) {
      updateFields.push('token_version = token_version + 1');
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('User updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Delete user
router.delete('/users/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM users WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('User deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// List products (read-only; CSRF not required)
// List products (public/admin shared logic, but this is admin route)
router.get('/products', admin, adminReadLimiter, async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id as product_id, p.name, p.status, p.base_price, p.sku as product_sku, img.thumbnail_small_url as image_url, p.created_at,
        c.name as category_name,
        v.id as variant_id, v.sku as variant_sku, v.size, v.color, v.price_adjustment,
        i.quantity_available as stock_quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images img ON p.id = img.product_id AND img.is_primary = 1
      LEFT JOIN product_variants v ON p.id = v.product_id
      LEFT JOIN inventory i ON (p.id = i.product_id AND (i.variant_id = v.id OR (v.id IS NULL AND i.variant_id IS NULL)))
      ORDER BY p.created_at DESC, v.id ASC
    `;
    const listResult = await DatabaseUtil.executeQuery(query);
    if (!listResult.success) throw new Error(listResult.error);

    // Process to match frontend expectation
    // We flatten variants into separate rows for the list view
    const products = listResult.data.map(row => {
      let displayName = row.name;
      const attributes = [row.size, row.color].filter(Boolean);
      if (attributes.length > 0) {
        displayName += ` (${attributes.join(' / ')})`;
      }

      return {
        id: row.variant_id || row.product_id, // Use variant ID if exists, acting as unique row key
        product_id: row.product_id,           // Keep ref to parent
        name: displayName,
        sku: row.variant_sku || row.product_sku,
        category: row.category_name || 'Uncategorized',
        price: (Number(row.base_price) + Number(row.price_adjustment || 0)).toFixed(2),
        stock: row.stock_quantity || 0,
        status: row.status === 'approved' ? 'Active' : (row.status === 'draft' ? 'Draft' : 'Out of Stock'),
        image: row.image_url
      };
    });

    res.json(ResponseFormatter.success('Products fetched successfully', [{ products }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Get single product with variants
router.get('/products/:id', admin, adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Get Product
    const productRes = await DatabaseUtil.executeQuery('SELECT * FROM products WHERE id = ?', [id]);
    if (!productRes.success || productRes.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }
    const product = productRes.data[0];

    // Get Variants with Inventory
    const variantQuery = `
      SELECT v.*, i.quantity_available as stock 
      FROM product_variants v 
      LEFT JOIN inventory i ON (v.id = i.variant_id)
      WHERE v.product_id = ?
    `;
    const variantsRes = await DatabaseUtil.executeQuery(variantQuery, [id]);
    const variants = variantsRes.success ? variantsRes.data : [];

    // Get Product Level Inventory (if no variants or generic stock)
    const prodInvRes = await DatabaseUtil.executeQuery('SELECT quantity_available FROM inventory WHERE product_id = ? AND variant_id IS NULL', [id]);
    const baseStock = prodInvRes.success && prodInvRes.data.length > 0 ? prodInvRes.data[0].quantity_available : 0;

    res.json(ResponseFormatter.success('Product details fetched', [{
      product: {
        ...product,
        stock: baseStock, // Base stock if no variants
        variants: variants.map(v => ({
          ...v,
          price: (Number(product.base_price) + Number(v.price_adjustment)).toFixed(2),
          stock: v.stock || 0
        }))
      }
    }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// List coupons (read-only; CSRF not required)
router.get('/coupons', admin, adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM discount_codes');
    if (!listResult.success) throw new Error(listResult.error);

    const coupons = listResult.data.map(c => {
      let status = 'Draft';
      if (c.is_active) {
        const now = new Date();
        const start = c.starts_at ? new Date(c.starts_at) : null;
        const end = c.expires_at ? new Date(c.expires_at) : null;

        if (end && now > end) {
          status = 'Expired';
        } else if (start && now < start) {
          status = 'Scheduled';
        } else {
          status = 'Active';
        }
      }

      return {
        ...c,
        startDate: c.starts_at,
        endDate: c.expires_at,
        status: status
      };
    });

    res.json(ResponseFormatter.success('Coupons fetched successfully', [{ coupons }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Staff Management
// List staff
router.get('/staff', admin, adminReadLimiter, async (req, res) => {
  try {
    const query = `
            SELECT id, email, first_name, last_name, role, status, last_login 
            FROM users 
            WHERE role IN ('admin', 'staff')
        `;
    const listResult = await DatabaseUtil.executeQuery(query);
    if (!listResult.success) throw new Error(listResult.error);

    const staff = listResult.data.map(u => ({
      id: u.id,
      name: u.first_name ? `${u.first_name} ${u.last_name || ''}` : 'Unknown',
      email: u.email,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1),
      status: u.status.charAt(0).toUpperCase() + u.status.slice(1),
      lastActive: u.last_login || 'Never'
    }));

    res.json(ResponseFormatter.success('Staff fetched successfully', [{ staff }]));
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
    const order = (Array.isArray(orderRes) ? orderRes : (orderRes && orderRes.data) || [])[0];

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
router.post('/products/:id/image', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
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

      const keyValueTable = [{ url: publicUrl }, { field: 'thumbnail_small_url' }];
      return res.json(ResponseFormatter.success('Image uploaded and product updated', keyValueTable));
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Analytics & Dashboard
router.get('/analytics/summary', admin, adminReadLimiter, async (req, res) => {
  try {
    // Parallel queries for performance
    const [revenueResult, ordersResult, customersResult, visitorsResult, paidOrdersResult, activeOrdersResult] = await Promise.all([
      DatabaseUtil.executeQuery("SELECT SUM(total_amount) as total FROM orders WHERE status != 'cancelled'"),
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'"),
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM users WHERE role = 'customer' AND status = 'active'"),
      // Visitor proxy: there is no analytics/tracking table, but shopping_carts records one row per
      // browser session (session_id for guests, user_id once logged in). Distinct sessions is therefore
      // an honest real-data proxy for unique visitors. COALESCE(..., id) guarantees every cart counts once.
      DatabaseUtil.executeQuery("SELECT COUNT(DISTINCT COALESCE(session_id, user_id, id)) as count FROM shopping_carts"),
      // Paid orders: orders with a completed payment. DISTINCT so multiple payment rows for one order count once.
      DatabaseUtil.executeQuery("SELECT COUNT(DISTINCT order_id) as count FROM payments WHERE status = 'completed'"),
      // Active orders: genuinely in-flight orders — non-terminal statuses only
      // (excludes delivered / cancelled / refunded).
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'confirmed', 'processing', 'shipped')")
    ]);

    const totalRevenue = revenueResult.data[0].total || 0;
    const totalOrders = ordersResult.data[0].count || 0;
    const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
    const activeCustomers = customersResult.data[0].count || 0;
    // Genuinely active (in-flight) orders, not the total order count.
    const activeOrders = Number(DatabaseUtil.first(activeOrdersResult)?.count) || 0;

    // Derived from real DB data (no hardcoded constants).
    // COUNT() comes back as a BIGINT string from the driver, so coerce to Number for clean arithmetic/output.
    const visitors = Number(visitorsResult.data[0].count) || 0;    // distinct shopping-cart sessions
    const paidOrders = Number(paidOrdersResult.data[0].count) || 0; // orders with a completed payment
    // Conversion rate as a percentage of visitor sessions that resulted in a paid order.
    // Falls back to 0 when no visitor proxy exists (avoids divide-by-zero and never fabricates a rate).
    const conversionRate = visitors > 0 ? Number(((paidOrders / visitors) * 100).toFixed(2)) : 0;

    res.json(ResponseFormatter.success('Summary metrics fetched', [{
      metrics: {
        totalRevenue,
        activeOrders, // in-flight orders (pending/confirmed/processing/shipped); excludes delivered/cancelled/refunded
        avgOrderValue,
        conversionRate, // derived: (paid orders / visitor sessions) * 100
        visitors,       // derived: distinct shopping_carts sessions (honest visitor proxy)
        activeCustomers
      }
    }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

router.get('/analytics/revenue', admin, adminReadLimiter, async (req, res) => {
  try {
    // Last 7 days
    const query = `
            SELECT DATE(created_at) as date, SUM(total_amount) as value 
            FROM orders 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status != 'cancelled'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;
    const result = await DatabaseUtil.executeQuery(query);
    if (!result.success) throw new Error(result.error);

    // Format for chart: "Mon", "Tue"...
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = result.data.map(row => ({
      label: days[new Date(row.date).getDay()],
      value: row.value
    }));

    res.json(ResponseFormatter.success('Revenue details fetched', [{ revenue: data }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

router.get('/analytics/sales-by-region', admin, adminReadLimiter, async (req, res) => {
  try {
    // Simplified: using shipping_address_json text search or just mock for now as schema parsing varies
    // Assuming US states for now
    const result = await DatabaseUtil.executeQuery("SELECT shipping_address_json FROM orders WHERE status != 'cancelled'");

    const regionMap = {};
    result.data.forEach(order => {
      try {
        const addr = typeof order.shipping_address_json === 'string' ? JSON.parse(order.shipping_address_json) : order.shipping_address_json;
        const state = addr?.state || 'Unknown';
        if (state !== 'Unknown') {
          regionMap[state] = (regionMap[state] || 0) + 1;
        }
      } catch (e) { }
    });

    const salesByRegion = Object.keys(regionMap).map(key => ({ name: key, value: regionMap[key] }));

    res.json(ResponseFormatter.success('Regional sales fetched', [{ salesByRegion }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});


// Settings
router.get('/settings/general', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery("SELECT * FROM system_settings");
    const settings = {};
    result.data.forEach(s => settings[s.setting_key] = s.setting_value);

    // Defaults if missing
    const general = {
      storeName: settings.store_name || 'NodeTexture',
      supportEmail: settings.support_email || 'support@nodetexture.com',
      currency: settings.currency || 'USD',
      timezone: settings.timezone || 'UTC'
    };
    res.json(ResponseFormatter.success('General settings fetched', [{ general }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

router.put('/settings/general', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { storeName, supportEmail, currency, timezone } = req.body;
    // Upsert logic
    const queries = [
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'store_name', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [storeName, storeName]),
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'support_email', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [supportEmail, supportEmail]),
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'currency', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [currency, currency]),
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'timezone', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [timezone, timezone])
    ];
    await Promise.all(queries);
    res.json(ResponseFormatter.success('Settings updated'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});


// Email Templates
router.get('/email-templates', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery("SELECT * FROM email_templates ORDER BY created_at DESC");
    // Map to frontend format if needed, but schema seems aligned (id, name, subject...)
    res.json(ResponseFormatter.success('Email templates fetched', [{ templates: result.data }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

router.post('/email-templates', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { name, subject, type, content, status } = req.body;
    const idResult = await DatabaseUtil.executeQuery('SELECT UUID() as id');
    const id = idResult.data[0].id;

    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO email_templates (id, name, subject, type, content, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, subject, type, content, status || 'Active']
    );

    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('Template created', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

router.put('/email-templates/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, type, content, status } = req.body;

    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE email_templates SET name=?, subject=?, type=?, content=?, status=?, updated_at=NOW() WHERE id=?',
      [name, subject, type, content, status, id]
    );

    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('Template updated'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});


// =====================================================
// Customer detail (single user)
// =====================================================
// GET /api/admin/users/:id — customer profile + addresses + order stats.
// Read-only (CSRF not required). Registered after the /users list route so
// the exact `/users` path still hits the list handler.
router.get('/users/:id', admin, adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Core user record. `users.phone` exists in the schema, but we still fall
    // back to a default address phone below when it is null.
    const userRes = await DatabaseUtil.executeQuery(
      'SELECT id, first_name, last_name, email, role, status, phone, created_at FROM users WHERE id = ?',
      [id]
    );
    if (!userRes.success) throw new Error(userRes.error);
    const userRow = DatabaseUtil.first(userRes);
    if (!userRow) {
      return res.status(404).json(ResponseFormatter.failure('User not found'));
    }

    // Addresses — flatten the address_json blob into top-level fields.
    const addrRes = await DatabaseUtil.executeQuery(
      'SELECT id, type, first_name, last_name, phone, address_json, is_default FROM user_addresses WHERE user_id = ?',
      [id]
    );
    const addresses = DatabaseUtil.rows(addrRes).map((a) => {
      let addr = {};
      if (a.address_json) {
        try {
          addr = typeof a.address_json === 'string' ? JSON.parse(a.address_json) : a.address_json;
        } catch (e) {
          addr = {};
        }
      }
      return {
        id: a.id,
        type: a.type,
        first_name: a.first_name,
        last_name: a.last_name,
        phone: a.phone || null,
        company: addr.company || null,
        address_line_1: addr.address_line_1 || null,
        address_line_2: addr.address_line_2 || null,
        city: addr.city || null,
        state: addr.state || null,
        postal_code: addr.postal_code || null,
        country: addr.country || null,
        is_default: !!a.is_default,
      };
    });

    // Phone: users.phone, else the default (or first) address phone, else null.
    const defaultAddr = addresses.find((a) => a.is_default) || addresses[0] || null;
    const phone = userRow.phone || (defaultAddr && defaultAddr.phone) || null;

    // Order stats — totalSpent counts only valid (non-cancelled/refunded) orders.
    const statsRes = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END), 0) AS totalSpent,
              MAX(created_at) AS lastOrder
       FROM orders WHERE user_id = ?`,
      [id]
    );
    const statsRow = DatabaseUtil.first(statsRes) || {};
    const stats = {
      orders: Number(statsRow.orders) || 0,
      totalSpent: Number(statsRow.totalSpent) || 0,
      lastOrder: statsRow.lastOrder || null,
    };

    const customer = {
      user: {
        id: userRow.id,
        first_name: userRow.first_name,
        last_name: userRow.last_name,
        email: userRow.email,
        role: userRow.role,
        status: userRow.status,
        created_at: userRow.created_at,
        phone,
      },
      addresses,
      stats,
    };

    res.json(ResponseFormatter.success('Customer fetched successfully', [{ customer }]));
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

// =====================================================
// Bulk product update / delete
// =====================================================
// POST /api/admin/products/bulk-update — apply one set of updates to many products.
// Column allowlist mirrors the single PUT /products/:id handler.
router.post('/products/bulk-update', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds, updates } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('productIds must be a non-empty array'));
    }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json(ResponseFormatter.failure('updates object is required'));
    }

    // Mirror the single product update allowlist to keep single/bulk parity.
    const ALLOWED_PRODUCT_COLUMNS = [
      'name', 'slug', 'sku', 'description', 'short_description', 'base_price',
      'sale_price', 'cost_price', 'category_id', 'product_details', 'status',
      'is_featured', 'meta_title', 'meta_description', 'meta_keywords',
    ];
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_PRODUCT_COLUMNS.includes(key)) continue;
      if (key === 'product_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value || {}));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }

    let updated = 0;
    for (const productId of productIds) {
      const result = await DatabaseUtil.executeQuery(
        `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
        [...updateValues, productId]
      );
      if (result.success && result.affectedRows > 0) updated += 1;
    }

    res.json(ResponseFormatter.success('Products updated successfully', [{ result: { updated } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// POST /api/admin/products/bulk-delete — soft-delete products referenced by an
// order (order_items.product_id has no ON DELETE CASCADE, so a hard delete would
// fail the FK); hard-delete products that were never ordered. 'discontinued' is
// the schema's archive-equivalent product status (there is no is_active column).
router.post('/products/bulk-delete', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('productIds must be a non-empty array'));
    }

    let deleted = 0;
    for (const productId of productIds) {
      const refRes = await DatabaseUtil.executeQuery('SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = ?', [productId]);
      const referenced = Number(DatabaseUtil.first(refRes)?.cnt) > 0;

      if (referenced) {
        const softRes = await DatabaseUtil.executeQuery(
          "UPDATE products SET status = 'discontinued', updated_at = NOW() WHERE id = ?",
          [productId]
        );
        if (softRes.success && softRes.affectedRows > 0) deleted += 1;
      } else {
        const hardRes = await DatabaseUtil.executeQuery('DELETE FROM products WHERE id = ?', [productId]);
        if (hardRes.success && hardRes.affectedRows > 0) deleted += 1;
      }
    }

    res.json(ResponseFormatter.success('Products deleted successfully', [{ result: { deleted } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// =====================================================
// System settings (generic key/value)
// =====================================================
const ALLOWED_SETTING_TYPES = ['string', 'integer', 'decimal', 'boolean', 'json'];

// setting_value is a TEXT column — coerce non-string values to a stable string form.
function normalizeSettingValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Upsert a single setting. When `type` is provided it is written on insert and
// update; otherwise a new row defaults to 'string' and an existing row keeps its type.
async function upsertSetting(key, value, type, userId) {
  const val = normalizeSettingValue(value);
  if (type) {
    return DatabaseUtil.executeQuery(
      `INSERT INTO system_settings (id, setting_key, setting_value, setting_type, updated_by)
       VALUES (UUID(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?, setting_type = ?, updated_by = ?`,
      [key, val, type, userId, val, type, userId]
    );
  }
  return DatabaseUtil.executeQuery(
    `INSERT INTO system_settings (id, setting_key, setting_value, setting_type, updated_by)
     VALUES (UUID(), ?, ?, 'string', ?)
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?`,
    [key, val, userId, val, userId]
  );
}

// GET /api/admin/settings — all settings (read-only; CSRF not required).
router.get('/settings', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('SELECT setting_key, setting_value, setting_type FROM system_settings ORDER BY setting_key ASC');
    if (!result.success) throw new Error(result.error);
    const settings = DatabaseUtil.rows(result).map((s) => ({
      setting_key: s.setting_key,
      setting_value: s.setting_value,
      setting_type: s.setting_type,
    }));
    res.json(ResponseFormatter.success('Settings fetched successfully', [{ settings }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// POST /api/admin/settings/bulk-update — upsert many settings.
// Declared before PUT /settings/:key registration below; distinct method/path so no shadowing.
router.post('/settings/bulk-update', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('settings must be a non-empty array'));
    }
    let updated = 0;
    for (const s of settings) {
      if (!s || !s.key) continue;
      if (s.type && !ALLOWED_SETTING_TYPES.includes(s.type)) continue;
      const result = await upsertSetting(s.key, s.value, s.type, req.user.id);
      if (result.success) updated += 1;
    }
    res.json(ResponseFormatter.success('Settings updated successfully', [{ result: { updated } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// PUT /api/admin/settings/:key — upsert one setting. The earlier-registered
// PUT /settings/general still wins for that exact path.
router.put('/settings/:key', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type } = req.body;
    if (!key) {
      return res.status(400).json(ResponseFormatter.failure('Setting key is required'));
    }
    if (type && !ALLOWED_SETTING_TYPES.includes(type)) {
      return res.status(400).json(ResponseFormatter.failure(`Invalid setting type. Allowed: ${ALLOWED_SETTING_TYPES.join(', ')}`));
    }
    const result = await upsertSetting(key, value, type, req.user.id);
    if (!result.success) throw new Error(result.error);
    res.json(ResponseFormatter.success('Setting updated successfully', [{ setting: { setting_key: key, setting_value: normalizeSettingValue(value) } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// =====================================================
// Shipping zones CRUD
// =====================================================
// Zone IDs use the existing 'SHIP' transno prefix (matches the seeded
// SHIP0000000001.. zones/rates in database/migrations/add_shipping_data.sql).

// GET /api/admin/shipping/zones — list zones (read-only; CSRF not required).
router.get('/shipping/zones', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('SELECT id, name, countries, is_active FROM shipping_zones ORDER BY name ASC');
    if (!result.success) throw new Error(result.error);
    const zones = DatabaseUtil.rows(result).map((z) => {
      let countries = [];
      if (z.countries) {
        try {
          countries = typeof z.countries === 'string' ? JSON.parse(z.countries) : z.countries;
        } catch (e) {
          countries = [];
        }
      }
      if (!Array.isArray(countries)) countries = [];
      return { id: z.id, name: z.name, countries, is_active: !!z.is_active };
    });
    res.json(ResponseFormatter.success('Shipping zones fetched successfully', [{ zones }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// POST /api/admin/shipping/zones — create a zone.
router.post('/shipping/zones', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { name, countries, is_active } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(ResponseFormatter.failure('name is required'));
    }
    if (!Array.isArray(countries)) {
      return res.status(400).json(ResponseFormatter.failure('countries must be an array of country codes'));
    }

    const idRes = await DatabaseUtil.executeQuery("SELECT get_next_id('SHIP') AS id");
    const id = DatabaseUtil.first(idRes)?.id;
    if (!idRes.success || !id) throw new Error('Failed to generate shipping zone ID');

    const activeVal = is_active === undefined ? 1 : (is_active ? 1 : 0);
    const insertRes = await DatabaseUtil.executeQuery(
      'INSERT INTO shipping_zones (id, name, countries, is_active) VALUES (?, ?, ?, ?)',
      [id, name.trim(), JSON.stringify(countries), activeVal]
    );
    if (!insertRes.success) throw new Error(insertRes.error);

    res.status(201).json(ResponseFormatter.success('Shipping zone created successfully', [{ zone: { id, name: name.trim(), countries, is_active: !!activeVal } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// PUT /api/admin/shipping/zones/:id — update allowlisted fields.
router.put('/shipping/zones/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, countries, is_active } = req.body;

    const existsRes = await DatabaseUtil.executeQuery('SELECT id FROM shipping_zones WHERE id = ?', [id]);
    if (!existsRes.success) throw new Error(existsRes.error);
    if (!DatabaseUtil.first(existsRes)) {
      return res.status(404).json(ResponseFormatter.failure('Shipping zone not found'));
    }

    const updateFields = [];
    const updateValues = [];
    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return res.status(400).json(ResponseFormatter.failure('name cannot be empty'));
      }
      updateFields.push('name = ?');
      updateValues.push(String(name).trim());
    }
    if (countries !== undefined) {
      if (!Array.isArray(countries)) {
        return res.status(400).json(ResponseFormatter.failure('countries must be an array of country codes'));
      }
      updateFields.push('countries = ?');
      updateValues.push(JSON.stringify(countries));
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active ? 1 : 0);
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    updateValues.push(id);
    const result = await DatabaseUtil.executeQuery(`UPDATE shipping_zones SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!result.success) throw new Error(result.error);
    res.json(ResponseFormatter.success('Shipping zone updated successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// DELETE /api/admin/shipping/zones/:id — remove a zone and its rates
// (shipping_rates.zone_id has no ON DELETE CASCADE, so rates are deleted first).
router.delete('/shipping/zones/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;

    const ratesRes = await DatabaseUtil.executeQuery('DELETE FROM shipping_rates WHERE zone_id = ?', [id]);
    if (!ratesRes.success) throw new Error(ratesRes.error);

    const result = await DatabaseUtil.executeQuery('DELETE FROM shipping_zones WHERE id = ?', [id]);
    if (!result.success) throw new Error(result.error);
    if (result.affectedRows === 0) {
      return res.status(404).json(ResponseFormatter.failure('Shipping zone not found'));
    }
    res.json(ResponseFormatter.success('Shipping zone deleted successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Export router
module.exports = router;