const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/admin/products
 * Get all products for admin management with advanced filtering and pagination
 */
router.get('/', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      status = '', 
      category = '', 
      created_by = '',
      sort_by = 'created_at',
      sort_order = 'DESC',
      min_price = '',
      max_price = ''
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = ['1=1']; // Base condition
    let queryParams = [];

    // Search filter - search in name, description, sku
    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Status filter
    if (status) {
      whereConditions.push('p.status = ?');
      queryParams.push(status);
    }

    // Category filter
    if (category) {
      whereConditions.push('p.category_id = ?');
      queryParams.push(category);
    }

    // Created by filter
    if (created_by) {
      whereConditions.push('p.created_by = ?');
      queryParams.push(created_by);
    }

    // Price range filters
    if (min_price) {
      whereConditions.push('p.base_price >= ?');
      queryParams.push(parseFloat(min_price));
    }
    if (max_price) {
      whereConditions.push('p.base_price <= ?');
      queryParams.push(parseFloat(max_price));
    }

    const whereClause = whereConditions.join(' AND ');

    // Validate sort parameters
    const validSortFields = ['created_at', 'updated_at', 'name', 'base_price', 'status'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM products p 
      WHERE ${whereClause}
    `;
    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const total = countResult.success ? countResult.data[0].total : 0;

    // Get products with pagination and joins
    const query = `
      SELECT 
        p.*,
        c.name as category_name,
        u.first_name as creator_first_name,
        u.last_name as creator_last_name,
        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count,
        (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) as image_count,
        (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id) as inventory_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE ${whereClause}
      ORDER BY p.${sortField} ${sortDirection}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (result.success) {
      const keyValueTable = {
        products: result.data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        },
        filters: { search, status, category, created_by, min_price, max_price },
        sorting: { sort_by: sortField, sort_order: sortDirection }
      };

      res.json(ResponseFormatter.success('Products fetched successfully', keyValueTable));
    } else {
      throw new Error('Failed to fetch products');
    }
  } catch (error) {
    logger.error('Get admin products error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get products', keyValueTable));
  }
});

/**
 * GET /api/admin/products/:id
 * Get single product details for admin (includes all statuses)
 */
router.get('/:id', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get product details with related data
    const productQuery = `
      SELECT 
        p.*,
        c.name as category_name,
        u.first_name as creator_first_name,
        u.last_name as creator_last_name,
        u.email as creator_email
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `;

    const productResult = await DatabaseUtil.executeQuery(productQuery, [id]);
    
    if (!productResult.success || productResult.data.length === 0) {
      const keyValueTable = { error: 'Product not found' };
      return res.status(404).json(ResponseFormatter.failure('Product not found', keyValueTable));
    }

    const product = productResult.data[0];

    // Get variants
    const variantsResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color',
      [id]
    );

    // Get images
    const imagesResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [id]
    );

    // Get inventory
    const inventoryResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM inventory WHERE product_id = ?',
      [id]
    );

    const keyValueTable = {
      ...product,
      variants: variantsResult.success ? variantsResult.data : [],
      images: imagesResult.success ? imagesResult.data : [],
      inventory: inventoryResult.success ? inventoryResult.data : []
    };

    res.json(ResponseFormatter.success('Product details fetched successfully', keyValueTable));
  } catch (error) {
    logger.error('Get admin product details error', {
      error: error.message,
      productId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get product details', keyValueTable));
  }
});

/**
 * PUT /api/admin/products/bulk-update
 * Bulk update products (status, category, pricing)
 */
router.put('/bulk-update', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { product_ids, updates } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      const keyValueTable = { error: 'Product IDs array is required' };
      return res.status(400).json(ResponseFormatter.failure('Invalid product IDs', keyValueTable));
    }

    if (!updates || typeof updates !== 'object') {
      const keyValueTable = { error: 'Updates object is required' };
      return res.status(400).json(ResponseFormatter.failure('Invalid updates', keyValueTable));
    }

    // Validate update fields
    const allowedFields = ['status', 'category_id', 'base_price'];
    const updateFields = Object.keys(updates).filter(field => allowedFields.includes(field));
    
    if (updateFields.length === 0) {
      const keyValueTable = { error: 'No valid update fields provided' };
      return res.status(400).json(ResponseFormatter.failure('No valid updates', keyValueTable));
    }

    // Build update query
    const setClause = updateFields.map(field => `${field} = ?`).join(', ');
    const placeholders = product_ids.map(() => '?').join(', ');
    
    const query = `
      UPDATE products 
      SET ${setClause}, updated_at = NOW() 
      WHERE id IN (${placeholders})
    `;

    const params = [...updateFields.map(field => updates[field]), ...product_ids];
    
    const result = await DatabaseUtil.executeQuery(query, params);

    if (result.success) {
      // Log bulk update action
      logger.info('Bulk product update', {
        userId: req.user.id,
        productIds: product_ids,
        updates: updates,
        affectedRows: result.affectedRows,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        updated_count: result.affectedRows,
        product_ids: product_ids,
        updates: updates
      };

      res.json(ResponseFormatter.success('Products updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update products');
    }
  } catch (error) {
    logger.error('Bulk product update error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update products', keyValueTable));
  }
});

/**
 * PUT /api/admin/products/:id/status
 * Update product status (approve, reject, etc.)
 */
router.put('/:id/status', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes = '' } = req.body;

    const validStatuses = ['draft', 'pending_approval', 'approved', 'rejected', 'discontinued'];
    if (!validStatuses.includes(status)) {
      const keyValueTable = { error: 'Invalid status', validStatuses };
      return res.status(400).json(ResponseFormatter.failure('Invalid status', keyValueTable));
    }

    // Get current product to update approval details
    const currentResult = await DatabaseUtil.executeQuery(
      'SELECT approval_details FROM products WHERE id = ?',
      [id]
    );

    if (!currentResult.success || currentResult.data.length === 0) {
      const keyValueTable = { error: 'Product not found' };
      return res.status(404).json(ResponseFormatter.failure('Product not found', keyValueTable));
    }

    // Update approval details
    let approvalDetails = {};
    try {
      approvalDetails = JSON.parse(currentResult.data[0].approval_details || '{}');
    } catch (e) {
      approvalDetails = {};
    }

    // Add new approval entry
    const approvalEntry = {
      status: status,
      notes: notes,
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      user_name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
    };

    if (!approvalDetails.history) {
      approvalDetails.history = [];
    }
    approvalDetails.history.push(approvalEntry);
    approvalDetails.current = approvalEntry;

    // Update product
    const updateQuery = `
      UPDATE products 
      SET status = ?, approval_details = ?, updated_at = NOW() 
      WHERE id = ?
    `;

    const result = await DatabaseUtil.executeQuery(updateQuery, [
      status,
      JSON.stringify(approvalDetails),
      id
    ]);

    if (result.success) {
      // Log status change
      logger.info('Product status updated', {
        userId: req.user.id,
        productId: id,
        oldStatus: currentResult.data[0].status,
        newStatus: status,
        notes: notes,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        product_id: id,
        status: status,
        notes: notes,
        approved_by: req.user.id,
        approved_at: approvalEntry.approved_at
      };

      res.json(ResponseFormatter.success('Product status updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update product status');
    }
  } catch (error) {
    logger.error('Update product status error', {
      error: error.message,
      productId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update product status', keyValueTable));
  }
});

/**
 * DELETE /api/admin/products/bulk-delete
 * Bulk delete products (soft delete by setting status to discontinued)
 */
router.delete('/bulk-delete', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { product_ids } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      const keyValueTable = { error: 'Product IDs array is required' };
      return res.status(400).json(ResponseFormatter.failure('Invalid product IDs', keyValueTable));
    }

    const placeholders = product_ids.map(() => '?').join(', ');
    
    // Soft delete by setting status to discontinued
    const query = `
      UPDATE products 
      SET status = 'discontinued', updated_at = NOW() 
      WHERE id IN (${placeholders})
    `;

    const result = await DatabaseUtil.executeQuery(query, product_ids);

    if (result.success) {
      // Log bulk delete action
      logger.info('Bulk product delete', {
        userId: req.user.id,
        productIds: product_ids,
        affectedRows: result.affectedRows,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        deleted_count: result.affectedRows,
        product_ids: product_ids
      };

      res.json(ResponseFormatter.success('Products deleted successfully', keyValueTable));
    } else {
      throw new Error('Failed to delete products');
    }
  } catch (error) {
    logger.error('Bulk product delete error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete products', keyValueTable));
  }
});

/**
 * GET /api/admin/products/stats
 * Get product statistics for dashboard
 */
router.get('/stats/overview', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    // Get product counts by status
    const statusQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM products 
      GROUP BY status
    `;

    const statusResult = await DatabaseUtil.executeQuery(statusQuery);

    // Get recent products (last 30 days)
    const recentQuery = `
      SELECT COUNT(*) as recent_count
      FROM products 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `;

    const recentResult = await DatabaseUtil.executeQuery(recentQuery);

    // Get products needing approval
    const pendingQuery = `
      SELECT COUNT(*) as pending_count
      FROM products 
      WHERE status = 'pending_approval'
    `;

    const pendingResult = await DatabaseUtil.executeQuery(pendingQuery);

    // Get top categories
    const categoryQuery = `
      SELECT 
        c.name as category_name,
        COUNT(p.id) as product_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status != 'discontinued'
      GROUP BY c.id, c.name
      ORDER BY product_count DESC
      LIMIT 10
    `;

    const categoryResult = await DatabaseUtil.executeQuery(categoryQuery);

    const keyValueTable = {
      status_counts: statusResult.success ? statusResult.data : [],
      recent_products: recentResult.success ? recentResult.data[0].recent_count : 0,
      pending_approval: pendingResult.success ? pendingResult.data[0].pending_count : 0,
      top_categories: categoryResult.success ? categoryResult.data : []
    };

    res.json(ResponseFormatter.success('Product statistics fetched successfully', keyValueTable));
  } catch (error) {
    logger.error('Get product stats error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get product statistics', keyValueTable));
  }
});

module.exports = router;