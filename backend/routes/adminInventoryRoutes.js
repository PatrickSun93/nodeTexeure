const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const InventoryService = require('../services/inventoryService');
const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');
const router = express.Router();

// GET /api/admin/inventory - Get all inventory with filtering and pagination
router.get('/', protect, admin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      category_id,
      status,
      stock_level, // 'all', 'low', 'out_of_stock', 'in_stock'
      sort_by = 'product_name',
      sort_order = 'asc'
    } = req.query;

    let whereConditions = [];
    let queryParams = [];

    // Build WHERE conditions
    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.sku LIKE ? OR pv.sku LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category_id) {
      whereConditions.push('p.category_id = ?');
      queryParams.push(category_id);
    }

    if (status) {
      whereConditions.push('p.status = ?');
      queryParams.push(status);
    }

    // Stock level filtering
    switch (stock_level) {
      case 'low':
        whereConditions.push('i.quantity_available <= i.reorder_point AND i.quantity_available > 0');
        break;
      case 'out_of_stock':
        whereConditions.push('i.quantity_available = 0');
        break;
      case 'in_stock':
        whereConditions.push('i.quantity_available > i.reorder_point');
        break;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN product_variants pv ON i.variant_id = pv.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;

    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const totalRecords = countResult.data[0].total;

    // Main query with pagination
    const offset = (page - 1) * limit;
    const orderBy = `ORDER BY ${sort_by === 'product_name' ? 'p.name' : sort_by} ${sort_order}`;

    const query = `
      SELECT 
        i.*,
        p.name as product_name,
        p.sku as product_sku,
        p.status as product_status,
        pv.size,
        pv.color,
        pv.pattern,
        pv.sku as variant_sku,
        c.name as category_name,
        (i.quantity_available + i.quantity_reserved) as total_stock,
        CASE 
          WHEN i.quantity_available = 0 THEN 'out_of_stock'
          WHEN i.quantity_available <= i.reorder_point THEN 'low_stock'
          ELSE 'in_stock'
        END as stock_status
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN product_variants pv ON i.variant_id = pv.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch inventory');
    }

    res.json(ResponseFormatter.success('Inventory fetched successfully', {
      inventory: result.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRecords,
        pages: Math.ceil(totalRecords / limit)
      }
    }));
  } catch (error) {
    console.error('Error fetching admin inventory:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/admin/inventory/analytics - Get inventory analytics for dashboard
router.get('/analytics', protect, admin, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    // Get inventory summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN i.quantity_available = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
        SUM(CASE WHEN i.quantity_available <= i.reorder_point AND i.quantity_available > 0 THEN 1 ELSE 0 END) as low_stock_count,
        SUM(i.quantity_available) as total_available_stock,
        SUM(i.quantity_reserved) as total_reserved_stock,
        SUM(i.quantity_sold) as total_sold_stock
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'approved'
    `;

    const summaryResult = await DatabaseUtil.executeQuery(summaryQuery);

    // Get top selling products
    const topSellingQuery = `
      SELECT 
        p.name as product_name,
        p.sku as product_sku,
        COALESCE(pv.size, '') as size,
        COALESCE(pv.color, '') as color,
        i.quantity_sold,
        i.quantity_available
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN product_variants pv ON i.variant_id = pv.id
      WHERE p.status = 'approved'
      ORDER BY i.quantity_sold DESC
      LIMIT 10
    `;

    const topSellingResult = await DatabaseUtil.executeQuery(topSellingQuery);

    // Get inventory movements for the period
    const movementsQuery = `
      SELECT 
        DATE(im.created_at) as movement_date,
        im.movement_type,
        SUM(ABS(im.quantity_change)) as total_quantity
      FROM inventory_movements im
      WHERE im.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(im.created_at), im.movement_type
      ORDER BY movement_date DESC
    `;

    const movementsResult = await DatabaseUtil.executeQuery(movementsQuery, [parseInt(period)]);

    // Get low stock alerts
    const lowStockResult = await InventoryService.getLowStockItems();

    res.json(ResponseFormatter.success('Inventory analytics fetched successfully', {
      summary: summaryResult.data[0],
      topSelling: topSellingResult.data,
      movements: movementsResult.data,
      lowStockItems: lowStockResult.success ? lowStockResult.data : []
    }));
  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/admin/inventory/low-stock - Get low stock items with reorder suggestions
router.get('/low-stock', protect, admin, async (req, res) => {
  try {
    const result = await InventoryService.getLowStockItems();
    
    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }

    // Enhance with reorder suggestions
    const enhancedItems = result.data.map(item => ({
      ...item,
      reorder_suggestion: {
        suggested_quantity: item.reorder_quantity,
        days_until_stockout: Math.floor(item.quantity_available / (item.quantity_sold / 30 || 1)),
        priority: item.quantity_available === 0 ? 'critical' : 
                 item.quantity_available <= (item.reorder_point * 0.5) ? 'high' : 'medium'
      }
    }));

    res.json(ResponseFormatter.success('Low stock items fetched successfully', {
      items: enhancedItems,
      total_count: enhancedItems.length
    }));
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/admin/inventory/movements - Get inventory movement history
router.get('/movements', protect, admin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      product_id,
      movement_type,
      date_from,
      date_to,
      created_by
    } = req.query;

    let whereConditions = [];
    let queryParams = [];

    if (product_id) {
      whereConditions.push('i.product_id = ?');
      queryParams.push(product_id);
    }

    if (movement_type) {
      whereConditions.push('im.movement_type = ?');
      queryParams.push(movement_type);
    }

    if (date_from) {
      whereConditions.push('im.created_at >= ?');
      queryParams.push(date_from);
    }

    if (date_to) {
      whereConditions.push('im.created_at <= ?');
      queryParams.push(date_to);
    }

    if (created_by) {
      whereConditions.push('im.created_by = ?');
      queryParams.push(created_by);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_movements im
      JOIN inventory i ON im.inventory_id = i.id
      JOIN products p ON i.product_id = p.id
      ${whereClause}
    `;

    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const totalRecords = countResult.data[0].total;

    // Main query
    const offset = (page - 1) * limit;
    const query = `
      SELECT 
        im.*,
        p.name as product_name,
        p.sku as product_sku,
        pv.size,
        pv.color,
        pv.pattern,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM inventory_movements im
      JOIN inventory i ON im.inventory_id = i.id
      JOIN products p ON i.product_id = p.id
      LEFT JOIN product_variants pv ON i.variant_id = pv.id
      LEFT JOIN users u ON im.created_by = u.id
      ${whereClause}
      ORDER BY im.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch movement history');
    }

    res.json(ResponseFormatter.success('Movement history fetched successfully', {
      movements: result.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRecords,
        pages: Math.ceil(totalRecords / limit)
      }
    }));
  } catch (error) {
    console.error('Error fetching movement history:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/admin/inventory/adjust - Manual stock adjustment
router.post('/adjust', protect, admin, async (req, res) => {
  try {
    const {
      product_id,
      variant_id,
      quantity_change,
      reason,
      notes
    } = req.body;

    if (!product_id || quantity_change === undefined || !reason) {
      return res.status(400).json(ResponseFormatter.failure(
        'product_id, quantity_change, and reason are required'
      ));
    }

    const result = await InventoryService.updateInventoryWithLogging(
      product_id,
      variant_id,
      parseInt(quantity_change),
      'adjustment',
      'manual',
      null,
      req.user.id,
      {
        reason,
        notes: notes || '',
        admin_user: `${req.user.first_name} ${req.user.last_name}`,
        adjustment_type: quantity_change > 0 ? 'increase' : 'decrease'
      }
    );

    if (!result.success) {
      return res.status(400).json(ResponseFormatter.failure(result.error));
    }

    res.json(ResponseFormatter.success('Stock adjusted successfully', result.data));
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/admin/inventory/bulk-adjust - Bulk stock adjustments
router.post('/bulk-adjust', protect, admin, async (req, res) => {
  try {
    const { adjustments, reason, notes } = req.body;

    if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json(ResponseFormatter.failure(
        'adjustments array is required'
      ));
    }

    if (!reason) {
      return res.status(400).json(ResponseFormatter.failure('reason is required'));
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const adjustment of adjustments) {
      const { product_id, variant_id, quantity_change } = adjustment;

      if (!product_id || quantity_change === undefined) {
        results.push({
          product_id,
          variant_id,
          success: false,
          error: 'product_id and quantity_change are required'
        });
        failureCount++;
        continue;
      }

      const result = await InventoryService.updateInventoryWithLogging(
        product_id,
        variant_id,
        parseInt(quantity_change),
        'adjustment',
        'manual',
        null,
        req.user.id,
        {
          reason,
          notes: notes || '',
          admin_user: `${req.user.first_name} ${req.user.last_name}`,
          adjustment_type: quantity_change > 0 ? 'increase' : 'decrease',
          bulk_operation: true
        }
      );

      results.push({
        product_id,
        variant_id,
        quantity_change,
        success: result.success,
        error: result.error
      });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    res.json(ResponseFormatter.success('Bulk adjustment completed', {
      total_adjustments: adjustments.length,
      successful: successCount,
      failed: failureCount,
      results
    }));
  } catch (error) {
    console.error('Error performing bulk adjustment:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/admin/inventory/:inventoryId/reorder-points - Update reorder points
router.put('/:inventoryId/reorder-points', protect, admin, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { reorder_point, reorder_quantity } = req.body;

    if (reorder_point === undefined || reorder_quantity === undefined) {
      return res.status(400).json(ResponseFormatter.failure(
        'reorder_point and reorder_quantity are required'
      ));
    }

    const query = `
      UPDATE inventory 
      SET reorder_point = ?, 
          reorder_quantity = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await DatabaseUtil.executeQuery(query, [
      parseInt(reorder_point),
      parseInt(reorder_quantity),
      inventoryId
    ]);

    if (!result.success) {
      throw new Error(result.error || 'Failed to update reorder points');
    }

    // Log the change
    await InventoryService.logMovement(
      inventoryId,
      'adjustment',
      0,
      'manual',
      null,
      req.user.id,
      {
        action: 'reorder_points_update',
        new_reorder_point: reorder_point,
        new_reorder_quantity: reorder_quantity,
        admin_user: `${req.user.first_name} ${req.user.last_name}`
      }
    );

    res.json(ResponseFormatter.success('Reorder points updated successfully'));
  } catch (error) {
    console.error('Error updating reorder points:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/admin/inventory/valuation - Get inventory valuation report
router.get('/valuation', protect, admin, async (req, res) => {
  try {
    const { category_id } = req.query;

    let whereCondition = '';
    let queryParams = [];

    if (category_id) {
      whereCondition = 'WHERE p.category_id = ?';
      queryParams.push(category_id);
    }

    const query = `
      SELECT 
        p.name as product_name,
        p.sku as product_sku,
        p.base_price,
        COALESCE(pv.size, '') as size,
        COALESCE(pv.color, '') as color,
        COALESCE(pv.price_adjustment, 0) as price_adjustment,
        i.quantity_available,
        i.quantity_reserved,
        (p.base_price + COALESCE(pv.price_adjustment, 0)) as unit_value,
        (i.quantity_available * (p.base_price + COALESCE(pv.price_adjustment, 0))) as total_value,
        c.name as category_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN product_variants pv ON i.variant_id = pv.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereCondition}
      ORDER BY total_value DESC
    `;

    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch valuation report');
    }

    // Calculate totals
    const totalValue = result.data.reduce((sum, item) => sum + parseFloat(item.total_value), 0);
    const totalUnits = result.data.reduce((sum, item) => sum + item.quantity_available, 0);

    res.json(ResponseFormatter.success('Inventory valuation fetched successfully', {
      items: result.data,
      summary: {
        total_value: totalValue,
        total_units: totalUnits,
        average_unit_value: totalUnits > 0 ? totalValue / totalUnits : 0
      }
    }));
  } catch (error) {
    console.error('Error fetching inventory valuation:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/admin/inventory/alerts/trigger - Manually trigger low stock alerts
router.post('/alerts/trigger', protect, admin, async (req, res) => {
  try {
    const lowStockResult = await InventoryService.getLowStockItems();
    
    if (!lowStockResult.success) {
      return res.status(400).json(ResponseFormatter.failure(lowStockResult.error));
    }

    const alertResults = [];
    
    for (const item of lowStockResult.data) {
      const alertResult = await InventoryService.triggerLowStockAlert(item);
      alertResults.push({
        product_id: item.product_id,
        product_name: item.product_name,
        alert_sent: alertResult.success && alertResult.data?.alert_sent,
        error: alertResult.error
      });
    }

    const successCount = alertResults.filter(r => r.alert_sent).length;

    res.json(ResponseFormatter.success('Low stock alerts processed', {
      total_items: alertResults.length,
      alerts_sent: successCount,
      results: alertResults
    }));
  } catch (error) {
    console.error('Error triggering low stock alerts:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// =====================================================
// SUPPLIER MANAGEMENT ENDPOINTS
// =====================================================

// GET /api/admin/inventory/suppliers - Get all suppliers
router.get('/suppliers', protect, admin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      status = 'active'
    } = req.query;

    let whereConditions = [];
    let queryParams = [];

    if (search) {
      whereConditions.push('(name LIKE ? OR contact_email LIKE ? OR contact_phone LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== 'all') {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total records
    const countQuery = `SELECT COUNT(*) as total FROM suppliers ${whereClause}`;
    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const totalRecords = countResult.data[0].total;

    // Main query with pagination
    const offset = (page - 1) * limit;
    const query = `
      SELECT 
        id,
        name,
        contact_email,
        contact_phone,
        address_json,
        status,
        payment_terms,
        lead_time_days,
        created_at,
        updated_at
      FROM suppliers
      ${whereClause}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch suppliers');
    }

    res.json(ResponseFormatter.success('Suppliers fetched successfully', {
      suppliers: result.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRecords,
        pages: Math.ceil(totalRecords / limit)
      }
    }));
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/admin/inventory/suppliers - Create new supplier
router.post('/suppliers', protect, admin, async (req, res) => {
  try {
    const {
      name,
      contact_email,
      contact_phone,
      address,
      payment_terms,
      lead_time_days,
      notes
    } = req.body;

    if (!name || !contact_email) {
      return res.status(400).json(ResponseFormatter.failure(
        'Name and contact email are required'
      ));
    }

    // Generate supplier ID
    const supplierIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("SUP") as id');
    const supplierId = supplierIdResult.data[0].id;

    const query = `
      INSERT INTO suppliers 
      (id, name, contact_email, contact_phone, address_json, payment_terms, lead_time_days, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await DatabaseUtil.executeQuery(query, [
      supplierId,
      name,
      contact_email,
      contact_phone,
      JSON.stringify(address || {}),
      payment_terms || 'Net 30',
      lead_time_days || 7,
      notes || '',
      req.user.id
    ]);

    if (!result.success) {
      throw new Error(result.error || 'Failed to create supplier');
    }

    res.json(ResponseFormatter.success('Supplier created successfully', {
      supplier_id: supplierId
    }));
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/admin/inventory/suppliers/:supplierId - Update supplier
router.put('/suppliers/:supplierId', protect, admin, async (req, res) => {
  try {
    const { supplierId } = req.params;
    const {
      name,
      contact_email,
      contact_phone,
      address,
      payment_terms,
      lead_time_days,
      status,
      notes
    } = req.body;

    const query = `
      UPDATE suppliers 
      SET name = ?, 
          contact_email = ?, 
          contact_phone = ?, 
          address_json = ?, 
          payment_terms = ?, 
          lead_time_days = ?, 
          status = ?, 
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await DatabaseUtil.executeQuery(query, [
      name,
      contact_email,
      contact_phone,
      JSON.stringify(address || {}),
      payment_terms,
      lead_time_days,
      status,
      notes,
      supplierId
    ]);

    if (!result.success) {
      throw new Error(result.error || 'Failed to update supplier');
    }

    res.json(ResponseFormatter.success('Supplier updated successfully'));
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// =====================================================
// PURCHASE ORDER MANAGEMENT ENDPOINTS
// =====================================================

// GET /api/admin/inventory/purchase-orders - Get all purchase orders
router.get('/purchase-orders', protect, admin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      supplier_id,
      date_from,
      date_to
    } = req.query;

    let whereConditions = [];
    let queryParams = [];

    if (status && status !== 'all') {
      whereConditions.push('po.status = ?');
      queryParams.push(status);
    }

    if (supplier_id) {
      whereConditions.push('po.supplier_id = ?');
      queryParams.push(supplier_id);
    }

    if (date_from) {
      whereConditions.push('po.created_at >= ?');
      queryParams.push(date_from);
    }

    if (date_to) {
      whereConditions.push('po.created_at <= ?');
      queryParams.push(date_to);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      ${whereClause}
    `;
    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const totalRecords = countResult.data[0].total;

    // Main query with pagination
    const offset = (page - 1) * limit;
    const query = `
      SELECT 
        po.*,
        s.name as supplier_name,
        s.contact_email as supplier_email,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      ${whereClause}
      ORDER BY po.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch purchase orders');
    }

    res.json(ResponseFormatter.success('Purchase orders fetched successfully', {
      purchase_orders: result.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRecords,
        pages: Math.ceil(totalRecords / limit)
      }
    }));
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// POST /api/admin/inventory/purchase-orders - Create new purchase order
router.post('/purchase-orders', protect, admin, async (req, res) => {
  try {
    const {
      supplier_id,
      items, // Array of { product_id, variant_id, quantity, unit_cost }
      notes,
      expected_delivery_date
    } = req.body;

    if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(ResponseFormatter.failure(
        'Supplier ID and items array are required'
      ));
    }

    // Generate PO ID and number
    const poIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("PO") as id');
    const poId = poIdResult.data[0].id;
    const poNumber = `PO-${new Date().getFullYear()}-${poId.slice(-6)}`;

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

    // Create purchase order
    const poQuery = `
      INSERT INTO purchase_orders 
      (id, po_number, supplier_id, total_amount, status, notes, expected_delivery_date, created_by)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `;

    const poResult = await DatabaseUtil.executeQuery(poQuery, [
      poId,
      poNumber,
      supplier_id,
      totalAmount,
      notes || '',
      expected_delivery_date,
      req.user.id
    ]);

    if (!poResult.success) {
      throw new Error('Failed to create purchase order');
    }

    // Create purchase order items
    for (const item of items) {
      const itemIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("POI") as id');
      const itemId = itemIdResult.data[0].id;

      const itemQuery = `
        INSERT INTO purchase_order_items 
        (id, purchase_order_id, product_id, variant_id, quantity, unit_cost, total_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await DatabaseUtil.executeQuery(itemQuery, [
        itemId,
        poId,
        item.product_id,
        item.variant_id,
        item.quantity,
        item.unit_cost,
        item.quantity * item.unit_cost
      ]);
    }

    res.json(ResponseFormatter.success('Purchase order created successfully', {
      purchase_order_id: poId,
      po_number: poNumber
    }));
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/admin/inventory/purchase-orders/:poId/status - Update PO status
router.put('/purchase-orders/:poId/status', protect, admin, async (req, res) => {
  try {
    const { poId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'sent', 'confirmed', 'received', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json(ResponseFormatter.failure(
        'Invalid status. Must be one of: ' + validStatuses.join(', ')
      ));
    }

    const query = `
      UPDATE purchase_orders 
      SET status = ?, 
          status_notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await DatabaseUtil.executeQuery(query, [status, notes || '', poId]);

    if (!result.success) {
      throw new Error(result.error || 'Failed to update purchase order status');
    }

    // If status is 'received', update inventory
    if (status === 'received') {
      const itemsQuery = `
        SELECT poi.*, p.name as product_name
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.purchase_order_id = ?
      `;

      const itemsResult = await DatabaseUtil.executeQuery(itemsQuery, [poId]);
      
      if (itemsResult.success) {
        for (const item of itemsResult.data) {
          await InventoryService.updateInventoryWithLogging(
            item.product_id,
            item.variant_id,
            item.quantity,
            'restock',
            'purchase_order',
            poId,
            req.user.id,
            {
              notes: `Purchase order ${poId} received`,
              unit_cost: item.unit_cost,
              total_cost: item.total_cost
            }
          );
        }
      }
    }

    res.json(ResponseFormatter.success('Purchase order status updated successfully'));
  } catch (error) {
    console.error('Error updating purchase order status:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/admin/inventory/purchase-orders/:poId - Get purchase order details
router.get('/purchase-orders/:poId', protect, admin, async (req, res) => {
  try {
    const { poId } = req.params;

    // Get purchase order details
    const poQuery = `
      SELECT 
        po.*,
        s.name as supplier_name,
        s.contact_email as supplier_email,
        s.contact_phone as supplier_phone,
        s.address_json as supplier_address,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?
    `;

    const poResult = await DatabaseUtil.executeQuery(poQuery, [poId]);

    if (!poResult.success || poResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Purchase order not found'));
    }

    // Get purchase order items
    const itemsQuery = `
      SELECT 
        poi.*,
        p.name as product_name,
        p.sku as product_sku,
        pv.size,
        pv.color,
        pv.pattern,
        pv.sku as variant_sku
      FROM purchase_order_items poi
      JOIN products p ON poi.product_id = p.id
      LEFT JOIN product_variants pv ON poi.variant_id = pv.id
      WHERE poi.purchase_order_id = ?
      ORDER BY p.name
    `;

    const itemsResult = await DatabaseUtil.executeQuery(itemsQuery, [poId]);

    const purchaseOrder = poResult.data[0];
    purchaseOrder.items = itemsResult.success ? itemsResult.data : [];

    res.json(ResponseFormatter.success('Purchase order details fetched successfully', {
      purchase_order: purchaseOrder
    }));
  } catch (error) {
    console.error('Error fetching purchase order details:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;