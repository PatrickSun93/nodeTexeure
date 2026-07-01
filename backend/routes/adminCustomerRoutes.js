const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/admin/customers
 * Get customers list with search, filtering, and pagination
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 20)
 * @param {string} search - Search term for name/email
 * @param {string} role - Filter by role (customer, admin, staff)
 * @param {string} status - Filter by status (active, inactive, suspended)
 * @param {string} sortBy - Sort field (created_at, last_login, email)
 * @param {string} sortOrder - Sort order (asc, desc)
 */
router.get('/customers', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      role = '', 
      status = '',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = ['1=1'];
    let queryParams = [];

    // Search filter - name and email
    if (search) {
      whereConditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Role filter
    if (role) {
      whereConditions.push('u.role = ?');
      queryParams.push(role);
    }

    // Status filter
    if (status) {
      whereConditions.push('u.status = ?');
      queryParams.push(status);
    }

    const whereClause = whereConditions.join(' AND ');

    // Validate sort parameters
    const validSortFields = ['created_at', 'last_login', 'email', 'first_name', 'last_name'];
    const validSortOrders = ['asc', 'desc'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`;
    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const total = countResult.success ? countResult.data[0].total : 0;

    // Get customers with order statistics
    const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.email_verified,
        u.created_at,
        u.last_login,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total_amount ELSE 0 END), 0) as total_spent,
        COALESCE(AVG(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total_amount ELSE NULL END), 0) as avg_order_value,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE ${whereClause}
      GROUP BY u.id
      ORDER BY u.${safeSortBy} ${safeSortOrder.toUpperCase()}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (result.success) {
      // Calculate customer segments
      const customers = result.data.map(customer => {
        let segment = 'New';
        if (customer.total_orders > 0) {
          if (customer.total_spent > 1000) segment = 'VIP';
          else if (customer.total_orders > 5) segment = 'Loyal';
          else if (customer.total_orders > 1) segment = 'Returning';
          else segment = 'One-time';
        }

        return {
          ...customer,
          segment,
          total_spent: parseFloat(customer.total_spent),
          avg_order_value: parseFloat(customer.avg_order_value)
        };
      });

      const keyValueTable = {
        customers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        },
        filters: { search, role, status, sortBy: safeSortBy, sortOrder: safeSortOrder }
      };

      res.json(ResponseFormatter.success('Customers fetched successfully', keyValueTable));
    } else {
      throw new Error('Failed to fetch customers');
    }
  } catch (error) {
    logger.error('Get customers error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get customers', keyValueTable));
  }
});

/**
 * GET /api/admin/customers/:id
 * Get detailed customer profile with order history and analytics
 * @param {string} id - Customer ID
 */
router.get('/customers/:id', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer basic information
    const customerQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.email_verified,
        u.created_at,
        u.last_login,
        u.updated_at
      FROM users u
      WHERE u.id = ?
    `;

    const customerResult = await DatabaseUtil.executeQuery(customerQuery, [id]);

    if (!customerResult.success || customerResult.data.length === 0) {
      const keyValueTable = { error: 'Customer not found' };
      return res.status(404).json(ResponseFormatter.failure('Customer not found', keyValueTable));
    }

    const customer = customerResult.data[0];

    // Get customer addresses
    const addressQuery = `
      SELECT 
        id,
        type,
        first_name,
        last_name,
        phone,
        address_json,
        is_default,
        created_at
      FROM user_addresses
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at DESC
    `;

    const addressResult = await DatabaseUtil.executeQuery(addressQuery, [id]);
    const addresses = addressResult.success ? addressResult.data : [];

    // Get order statistics
    const orderStatsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END), 0) as total_spent,
        COALESCE(AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE NULL END), 0) as avg_order_value,
        MAX(created_at) as last_order_date,
        MIN(created_at) as first_order_date,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
        COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_orders
      FROM orders
      WHERE user_id = ?
    `;

    const orderStatsResult = await DatabaseUtil.executeQuery(orderStatsQuery, [id]);
    const orderStats = orderStatsResult.success ? orderStatsResult.data[0] : {};

    // Get recent orders (last 10)
    const recentOrdersQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_amount,
        o.currency,
        o.created_at,
        o.shipped_at,
        o.delivered_at,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `;

    const recentOrdersResult = await DatabaseUtil.executeQuery(recentOrdersQuery, [id]);
    const recentOrders = recentOrdersResult.success ? recentOrdersResult.data : [];

    // Get monthly spending for the last 12 months
    const monthlySpendingQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as order_count,
        SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as total_spent
      FROM orders
      WHERE user_id = ? 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `;

    const monthlySpendingResult = await DatabaseUtil.executeQuery(monthlySpendingQuery, [id]);
    const monthlySpending = monthlySpendingResult.success ? monthlySpendingResult.data : [];

    // Calculate customer segment
    let segment = 'New';
    const totalOrders = parseInt(orderStats.total_orders || 0);
    const totalSpent = parseFloat(orderStats.total_spent || 0);

    if (totalOrders > 0) {
      if (totalSpent > 1000) segment = 'VIP';
      else if (totalOrders > 5) segment = 'Loyal';
      else if (totalOrders > 1) segment = 'Returning';
      else segment = 'One-time';
    }

    const keyValueTable = {
      customer: {
        ...customer,
        segment
      },
      addresses,
      orderStats: {
        ...orderStats,
        total_spent: parseFloat(orderStats.total_spent || 0),
        avg_order_value: parseFloat(orderStats.avg_order_value || 0)
      },
      recentOrders: recentOrders.map(order => ({
        ...order,
        total_amount: parseFloat(order.total_amount)
      })),
      monthlySpending: monthlySpending.map(month => ({
        ...month,
        total_spent: parseFloat(month.total_spent)
      }))
    };

    res.json(ResponseFormatter.success('Customer profile fetched successfully', keyValueTable));
  } catch (error) {
    logger.error('Get customer profile error', {
      error: error.message,
      customerId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get customer profile', keyValueTable));
  }
});

/**
 * GET /api/admin/customers/analytics
 * Get customer analytics and segmentation data
 */
router.get('/customers/analytics', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    // Customer segmentation analytics
    const segmentationQuery = `
      SELECT 
        CASE 
          WHEN order_stats.total_orders = 0 THEN 'New'
          WHEN order_stats.total_spent > 1000 THEN 'VIP'
          WHEN order_stats.total_orders > 5 THEN 'Loyal'
          WHEN order_stats.total_orders > 1 THEN 'Returning'
          ELSE 'One-time'
        END as segment,
        COUNT(*) as customer_count,
        AVG(order_stats.total_spent) as avg_spent,
        AVG(order_stats.total_orders) as avg_orders
      FROM (
        SELECT 
          u.id,
          COUNT(o.id) as total_orders,
          COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total_amount ELSE 0 END), 0) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        WHERE u.role = 'customer'
        GROUP BY u.id
      ) as order_stats
      GROUP BY segment
      ORDER BY customer_count DESC
    `;

    const segmentationResult = await DatabaseUtil.executeQuery(segmentationQuery);

    // Customer registration trends (last 12 months)
    const registrationTrendsQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as new_customers
      FROM users
      WHERE role = 'customer' 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `;

    const registrationTrendsResult = await DatabaseUtil.executeQuery(registrationTrendsQuery);

    // Top customers by spending
    const topCustomersQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total_amount ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'customer'
      GROUP BY u.id
      HAVING total_spent > 0
      ORDER BY total_spent DESC
      LIMIT 10
    `;

    const topCustomersResult = await DatabaseUtil.executeQuery(topCustomersQuery);

    // Customer activity summary
    const activitySummaryQuery = `
      SELECT 
        COUNT(CASE WHEN u.role = 'customer' THEN 1 END) as total_customers,
        COUNT(CASE WHEN u.role = 'customer' AND u.status = 'active' THEN 1 END) as active_customers,
        COUNT(CASE WHEN u.role = 'customer' AND u.last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_last_30_days,
        COUNT(CASE WHEN u.role = 'customer' AND u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_last_30_days,
        COUNT(CASE WHEN u.role = 'customer' AND u.email_verified = TRUE THEN 1 END) as verified_customers
      FROM users u
    `;

    const activitySummaryResult = await DatabaseUtil.executeQuery(activitySummaryQuery);

    const keyValueTable = {
      segmentation: segmentationResult.success ? segmentationResult.data.map(seg => ({
        ...seg,
        avg_spent: parseFloat(seg.avg_spent || 0),
        avg_orders: parseFloat(seg.avg_orders || 0)
      })) : [],
      registrationTrends: registrationTrendsResult.success ? registrationTrendsResult.data : [],
      topCustomers: topCustomersResult.success ? topCustomersResult.data.map(customer => ({
        ...customer,
        total_spent: parseFloat(customer.total_spent)
      })) : [],
      activitySummary: activitySummaryResult.success ? activitySummaryResult.data[0] : {}
    };

    res.json(ResponseFormatter.success('Customer analytics fetched successfully', keyValueTable));
  } catch (error) {
    logger.error('Get customer analytics error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get customer analytics', keyValueTable));
  }
});

/**
 * PUT /api/admin/customers/:id/status
 * Update customer account status
 * @param {string} id - Customer ID
 * @param {string} status - New status (active, inactive, suspended)
 * @param {string} reason - Reason for status change
 */
router.put('/customers/:id/status', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status || !['active', 'inactive', 'suspended'].includes(status)) {
      const keyValueTable = { error: 'Valid status is required (active, inactive, suspended)' };
      return res.status(400).json(ResponseFormatter.failure('Invalid status', keyValueTable));
    }

    // Get current customer data
    const currentCustomerResult = await DatabaseUtil.executeQuery(
      'SELECT id, email, status, first_name, last_name FROM users WHERE id = ?',
      [id]
    );

    if (!currentCustomerResult.success || currentCustomerResult.data.length === 0) {
      const keyValueTable = { error: 'Customer not found' };
      return res.status(404).json(ResponseFormatter.failure('Customer not found', keyValueTable));
    }

    const currentCustomer = currentCustomerResult.data[0];

    // Update customer status
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    if (updateResult.success) {
      // Log the status change in audit logs
      const auditLogResult = await DatabaseUtil.executeQuery(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, old_values, new_values, session_details, created_at)
         VALUES (get_next_id('AUDIT'), ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          req.user.id,
          'update_customer_status',
          'customer',
          id,
          JSON.stringify({ status: currentCustomer.status }),
          JSON.stringify({ status, reason }),
          JSON.stringify({
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
          })
        ]
      );

      logger.info('Customer status updated', {
        customerId: id,
        customerEmail: currentCustomer.email,
        oldStatus: currentCustomer.status,
        newStatus: status,
        reason,
        updatedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        customerId: id,
        customerEmail: currentCustomer.email,
        oldStatus: currentCustomer.status,
        newStatus: status,
        reason,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Customer status updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update customer status');
    }
  } catch (error) {
    logger.error('Update customer status error', {
      error: error.message,
      customerId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update customer status', keyValueTable));
  }
});

/**
 * POST /api/admin/customers/:id/notes
 * Add customer service note
 * @param {string} id - Customer ID
 * @param {string} note - Service note content
 * @param {string} type - Note type (support, billing, general)
 */
router.post('/customers/:id/notes', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;
    const { note, type = 'general' } = req.body;

    if (!note || note.trim().length === 0) {
      const keyValueTable = { error: 'Note content is required' };
      return res.status(400).json(ResponseFormatter.failure('Note content required', keyValueTable));
    }

    // Verify customer exists
    const customerResult = await DatabaseUtil.executeQuery(
      'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
      [id]
    );

    if (!customerResult.success || customerResult.data.length === 0) {
      const keyValueTable = { error: 'Customer not found' };
      return res.status(404).json(ResponseFormatter.failure('Customer not found', keyValueTable));
    }

    const customer = customerResult.data[0];

    // Add note to audit logs as a customer service note
    const noteResult = await DatabaseUtil.executeQuery(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, old_values, new_values, session_details, created_at)
       VALUES (get_next_id('AUDIT'), ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        req.user.id,
        'add_customer_note',
        'customer',
        id,
        JSON.stringify({}),
        JSON.stringify({ note, type }),
        JSON.stringify({
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          note_type: type
        })
      ]
    );

    if (noteResult.success) {
      logger.info('Customer note added', {
        customerId: id,
        customerEmail: customer.email,
        noteType: type,
        addedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        customerId: id,
        customerEmail: customer.email,
        noteType: type,
        addedBy: req.user.id,
        addedAt: new Date().toISOString(),
        auditLogId: noteResult.insertId
      };

      res.json(ResponseFormatter.success('Customer note added successfully', keyValueTable));
    } else {
      throw new Error('Failed to add customer note');
    }
  } catch (error) {
    logger.error('Add customer note error', {
      error: error.message,
      customerId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to add customer note', keyValueTable));
  }
});

/**
 * GET /api/admin/customers/:id/notes
 * Get customer service notes and activity history
 * @param {string} id - Customer ID
 */
router.get('/customers/:id/notes', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify customer exists
    const customerResult = await DatabaseUtil.executeQuery(
      'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
      [id]
    );

    if (!customerResult.success || customerResult.data.length === 0) {
      const keyValueTable = { error: 'Customer not found' };
      return res.status(404).json(ResponseFormatter.failure('Customer not found', keyValueTable));
    }

    // Get customer notes and activity from audit logs
    const notesQuery = `
      SELECT 
        al.id,
        al.action,
        al.old_values,
        al.new_values,
        al.session_details,
        al.created_at,
        u.first_name as created_by_first_name,
        u.last_name as created_by_last_name,
        u.email as created_by_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.resource_type = 'customer' 
        AND al.resource_id = ?
      ORDER BY al.created_at DESC
      LIMIT 50
    `;

    const notesResult = await DatabaseUtil.executeQuery(notesQuery, [id]);
    const notes = notesResult.success ? notesResult.data : [];

    // Format notes for display
    const formattedNotes = notes.map(note => {
      let parsedNewValues = {};
      let parsedSessionDetails = {};

      try {
        parsedNewValues = JSON.parse(note.new_values || '{}');
        parsedSessionDetails = JSON.parse(note.session_details || '{}');
      } catch (e) {
        // Handle invalid JSON gracefully
      }

      return {
        id: note.id,
        action: note.action,
        note: parsedNewValues.note || null,
        type: parsedNewValues.type || parsedSessionDetails.note_type || 'general',
        reason: parsedNewValues.reason || null,
        createdBy: {
          firstName: note.created_by_first_name,
          lastName: note.created_by_last_name,
          email: note.created_by_email
        },
        createdAt: note.created_at,
        ipAddress: parsedSessionDetails.ip_address
      };
    });

    const keyValueTable = {
      customerId: id,
      notes: formattedNotes
    };

    res.json(ResponseFormatter.success('Customer notes fetched successfully', keyValueTable));
  } catch (error) {
    logger.error('Get customer notes error', {
      error: error.message,
      customerId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get customer notes', keyValueTable));
  }
});

module.exports = router;