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
const { v4: uuidv4 } = require('uuid');
const emailQueueProducer = require('../services/emailQueueProducer');

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
    res.status(500).json(ResponseFormatter.failure('Logout failed', { error: error.message }));
  }
});

// Add new product
router.post('/products', staffOrAdmin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { variants, stock, ...productData } = req.body; // Extract non-DB columns
    const { sku, name, slug, description, short_description, category_id, base_price, product_details, meta_title, meta_description, meta_keywords } = productData;

    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("PROD") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id; // From auth middleware

    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, created_by, meta_title, meta_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, slug, description, short_description, category_id, base_price, JSON.stringify(product_details), created_by, meta_title, meta_description, meta_keywords]
    );
    if (!insertResult.success) throw new Error(insertResult.error);

    // 2. Base Inventory (Product Level)
    if (stock) {
      const invId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await DatabaseUtil.executeQuery(
        'INSERT INTO inventory (id, product_id, quantity_available) VALUES (?, ?, ?)',
        [invId, id, stock]
      );
    }

    // 3. Handle Variants
    if (variants && Array.isArray(variants)) {
      for (const v of variants) {
        const vid = `VAR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await DatabaseUtil.executeQuery(
          'INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, ?, ?, ?)',
          [vid, id, v.sku, v.size, v.color, v.price_adjustment || 0]
        );
        // Variant Inventory
        const vInvId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await DatabaseUtil.executeQuery(
          'INSERT INTO inventory (id, product_id, variant_id, quantity_available) VALUES (?, ?, ?, ?)',
          [vInvId, id, vid, v.stock || 0]
        );
      }
    }

    res.status(201).json(ResponseFormatter.success('Product added successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
          // Insert New Variant
          const vidRes = await DatabaseUtil.executeQuery('SELECT UUID() as id');
          const vid = vidRes.data[0].id; // Simplified UUID gen or use similar logic
          // Actually we use 'UUID()' function in SQL or generate it. 
          // DatabaseUtil.executeQuery('SELECT UUID()') might work, or we rely on DB default? 
          // Schema uses VARCHAR(50). We need to generate ID.
          // Re-using get_next_id logic or UUID? Schema summary says 'uuid' or varchar.
          // I will use simple pseudo-random for now or check if there's a helper.
          // Assuming DatabaseUtil doesn't have uuid helper.
          // Let's use `UUID()` if safe, or generate in JS.
          const newVariantId = `VAR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

          await DatabaseUtil.executeQuery(
            'INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, ?, ?, ?)',
            [newVariantId, id, v.sku, v.size, v.color, v.price_adjustment || 0]
          );
          // Insert Inventory
          const invId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
router.delete('/users/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    const { status, notes } = req.body;
    const normalizedStatus = status.toLowerCase();

    // Update order status
    const updateResult = await DatabaseUtil.executeQuery('UPDATE orders SET status = ? WHERE id = ?', [normalizedStatus, id]);
    if (!updateResult.success) throw new Error(updateResult.error);

    // Insert into order_status_history
    const historyId = uuidv4();
    const statusDetails = notes ? JSON.stringify({ notes }) : null;
    await DatabaseUtil.executeQuery(
      'INSERT INTO order_status_history (id, order_id, status, status_details, changed_by) VALUES (?, ?, ?, ?, ?)',
      [historyId, id, normalizedStatus, statusDetails, req.user.id]
    );

    // Look up customer email and enqueue status notification
    const [order] = await DatabaseUtil.executeQuery(
      `SELECT o.order_number, o.guest_email, u.email as user_email,
              COALESCE(u.first_name, 'Valued Customer') as customer_name,
              o.tracking_number
       FROM orders o LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [id]
    );

    if (order) {
      const customerEmail = order.user_email || order.guest_email;
      if (customerEmail) {
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
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// Analytics & Dashboard
router.get('/analytics/summary', admin, adminReadLimiter, async (req, res) => {
  try {
    // Parallel queries for performance
    const [revenueResult, ordersResult, customersResult, visitorsResult, paidOrdersResult] = await Promise.all([
      DatabaseUtil.executeQuery("SELECT SUM(total_amount) as total FROM orders WHERE status != 'cancelled'"),
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'"),
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM users WHERE role = 'customer' AND status = 'active'"),
      // Visitor proxy: there is no analytics/tracking table, but shopping_carts records one row per
      // browser session (session_id for guests, user_id once logged in). Distinct sessions is therefore
      // an honest real-data proxy for unique visitors. COALESCE(..., id) guarantees every cart counts once.
      DatabaseUtil.executeQuery("SELECT COUNT(DISTINCT COALESCE(session_id, user_id, id)) as count FROM shopping_carts"),
      // Paid orders: orders with a completed payment. DISTINCT so multiple payment rows for one order count once.
      DatabaseUtil.executeQuery("SELECT COUNT(DISTINCT order_id) as count FROM payments WHERE status = 'completed'")
    ]);

    const totalRevenue = revenueResult.data[0].total || 0;
    const totalOrders = ordersResult.data[0].count || 0;
    const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
    const activeCustomers = customersResult.data[0].count || 0;

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
        activeOrders: totalOrders, // Naming: using total for now
        avgOrderValue,
        conversionRate, // derived: (paid orders / visitor sessions) * 100
        visitors,       // derived: distinct shopping_carts sessions (honest visitor proxy)
        activeCustomers
      }
    }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
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
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});


// Export router
module.exports = router;