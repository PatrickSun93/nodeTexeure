// Admin API: Products, categories, product images, bulk product actions.
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { admin, staffOrAdmin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { adminReadLimiter, adminWriteLimiter } = require('./limiters');
const { isNonEmptyString, isStringList } = require('../../utils/params');

const router = express.Router();

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

    // Validate every variant before any write, so a bad entry can't leave a half-applied update.
    if (variants !== undefined && variants !== null) {
      if (!Array.isArray(variants) || !variants.every((v) => v && typeof v === 'object' && (!v.id || isNonEmptyString(v.id)))) {
        return res.status(400).json(ResponseFormatter.failure('variants must be objects with string ids'));
      }
    }

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

// =====================================================
// Bulk product update / delete
// =====================================================
// POST /api/admin/products/bulk-update — apply one set of updates to many products.
// Column allowlist mirrors the single PUT /products/:id handler.
router.post('/products/bulk-update', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { productIds, updates } = req.body;
    // Ids must be strings: `WHERE id = 0` matches every product (PROD… casts to 0).
    if (!isStringList(productIds)) {
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
    // Ids must be strings: `WHERE id = 0` would delete every product.
    if (!isStringList(productIds)) {
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

module.exports = router;
