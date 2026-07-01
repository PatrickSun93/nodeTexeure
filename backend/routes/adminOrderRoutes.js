const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validationMiddleware');
const OrderService = require('../services/orderService');
const StripeService = require('../services/stripeService');
const FedExService = require('../services/fedexService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Initialize services
const orderService = new OrderService();

/**
 * GET /api/admin/orders
 * Get orders with advanced filtering, search, and pagination for admin dashboard
 */
router.get('/', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = '',
      search = '',
      dateFrom = '',
      dateTo = '',
      minAmount = '',
      maxAmount = '',
      sortBy = 'created_at',
      sortOrder = 'desc',
      customerType = '' // 'registered', 'guest', or ''
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = ['1=1'];
    let queryParams = [];

    // Status filter
    if (status) {
      whereConditions.push('o.status = ?');
      queryParams.push(status);
    }

    // Date range filter
    if (dateFrom) {
      whereConditions.push('DATE(o.created_at) >= ?');
      queryParams.push(dateFrom);
    }
    if (dateTo) {
      whereConditions.push('DATE(o.created_at) <= ?');
      queryParams.push(dateTo);
    }

    // Amount range filter
    if (minAmount) {
      whereConditions.push('o.total_amount >= ?');
      queryParams.push(parseFloat(minAmount));
    }
    if (maxAmount) {
      whereConditions.push('o.total_amount <= ?');
      queryParams.push(parseFloat(maxAmount));
    }

    // Customer type filter
    if (customerType === 'registered') {
      whereConditions.push('o.user_id IS NOT NULL');
    } else if (customerType === 'guest') {
      whereConditions.push('o.user_id IS NULL');
    }

    // Search filter (order number, customer name, email)
    if (search) {
      whereConditions.push(`(
        o.order_number LIKE ? OR 
        CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR 
        u.email LIKE ? OR 
        o.guest_email LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    // Validate sort parameters
    const validSortFields = ['created_at', 'total_amount', 'status', 'order_number'];
    const validSortOrders = ['asc', 'desc'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE ${whereClause}
    `;
    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const totalOrders = countResult.success ? countResult.data[0].total : 0;

    // Get orders with details
    const ordersQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.user_id,
        o.guest_email,
        o.status,
        o.payment_status,
        o.total_amount,
        o.currency,
        o.created_at,
        o.updated_at,
        o.tracking_number,
        o.estimated_delivery_date,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Guest') as customer_name,
        u.email as customer_email,
        u.phone as customer_phone,
        COUNT(oi.id) as item_count,
        SUM(oi.quantity) as total_items,
        p.status as payment_method_status
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE ${whereClause}
      GROUP BY o.id
      ORDER BY o.${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;

    const ordersQueryParams = [...queryParams, parseInt(limit), offset];
    const ordersResult = await DatabaseUtil.executeQuery(ordersQuery, ordersQueryParams);

    if (!ordersResult.success) {
      throw new Error(ordersResult.error);
    }

    // Get order status distribution for dashboard stats
    const statusStatsQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_value
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE ${whereClause.replace(/LIMIT.*/, '')}
      GROUP BY status
    `;
    const statusStatsResult = await DatabaseUtil.executeQuery(statusStatsQuery, queryParams);

    const keyValueTable = {
      orders: ordersResult.data,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        limit: parseInt(limit)
      },
      statusStats: statusStatsResult.success ? statusStatsResult.data : [],
      filters: {
        status,
        search,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        customerType,
        sortBy: safeSortBy,
        sortOrder: safeSortOrder
      }
    };

    logger.info('Admin orders fetched', {
      userId: req.user.id,
      totalOrders,
      filters: req.query
    });

    res.json(ResponseFormatter.success('Orders fetched successfully', keyValueTable));

  } catch (error) {
    logger.error('Error fetching admin orders', {
      error: error.message,
      userId: req.user?.id,
      query: req.query
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to fetch orders', { error: error.message })
    );
  }
});

/**
 * GET /api/admin/orders/:id
 * Get detailed order information for admin
 */
router.get('/:id', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get order details
    const orderQuery = `
      SELECT 
        o.*,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Guest') as customer_name,
        u.email as customer_email,
        u.phone as customer_phone,
        u.created_at as customer_since
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `;

    const orderResult = await DatabaseUtil.executeQuery(orderQuery, [id]);

    if (!orderResult.success || orderResult.data.length === 0) {
      return res.status(404).json(
        ResponseFormatter.failure('Order not found')
      );
    }

    const order = orderResult.data[0];

    // Parse JSON fields
    order.shipping_address = order.shipping_address_json ? JSON.parse(order.shipping_address_json) : null;
    order.billing_address = order.billing_address_json ? JSON.parse(order.billing_address_json) : null;

    // Get order items with product details
    const itemsQuery = `
      SELECT 
        oi.*,
        p.name as product_name,
        p.sku as product_sku,
        pv.name as variant_name,
        pv.sku as variant_sku,
        pv.attributes as variant_attributes
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_variants pv ON oi.variant_id = pv.id
      WHERE oi.order_id = ?
      ORDER BY oi.created_at
    `;

    const itemsResult = await DatabaseUtil.executeQuery(itemsQuery, [id]);
    const orderItems = itemsResult.success ? itemsResult.data : [];

    // Get order status history
    const historyResult = await orderService.getOrderStatusHistory(id);
    const statusHistory = historyResult.success ? historyResult.data : [];

    // Get payment information
    const paymentQuery = `
      SELECT 
        p.*,
        pm.type as payment_method_type,
        pm.last_four,
        pm.brand
      FROM payments p
      LEFT JOIN payment_methods pm ON p.payment_method_id = pm.id
      WHERE p.order_id = ?
      ORDER BY p.created_at DESC
    `;

    const paymentResult = await DatabaseUtil.executeQuery(paymentQuery, [id]);
    const payments = paymentResult.success ? paymentResult.data : [];

    // Get refund information
    const refundQuery = `
      SELECT 
        r.*,
        CONCAT(u.first_name, ' ', u.last_name) as processed_by_name
      FROM refunds r
      LEFT JOIN users u ON r.processed_by = u.id
      WHERE r.order_id = ?
      ORDER BY r.created_at DESC
    `;

    const refundResult = await DatabaseUtil.executeQuery(refundQuery, [id]);
    const refunds = refundResult.success ? refundResult.data : [];

    const keyValueTable = {
      order,
      orderItems,
      statusHistory,
      payments,
      refunds,
      customerType: order.user_id ? 'registered' : 'guest'
    };

    logger.info('Admin order details fetched', {
      userId: req.user.id,
      orderId: id
    });

    res.json(ResponseFormatter.success('Order details fetched successfully', keyValueTable));

  } catch (error) {
    logger.error('Error fetching admin order details', {
      error: error.message,
      userId: req.user?.id,
      orderId: req.params.id
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to fetch order details', { error: error.message })
    );
  }
});

/**
 * PUT /api/admin/orders/:id/status
 * Update order status with admin notes
 */
router.put('/:id/status', protect, requireRole(['admin', 'staff']), validateInput('orderStatusUpdate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const result = await orderService.updateOrderStatus(id, status, notes, req.user.id);

    if (result.success) {
      logger.info('Admin order status updated', {
        userId: req.user.id,
        orderId: id,
        newStatus: status,
        notes: notes || 'No notes'
      });

      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    logger.error('Error updating admin order status', {
      error: error.message,
      userId: req.user?.id,
      orderId: req.params.id,
      requestBody: req.body
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to update order status', { error: error.message })
    );
  }
});

/**
 * POST /api/admin/orders/:id/refund
 * Process refund for an order
 */
router.post('/:id/refund', protect, requireRole(['admin', 'staff']), validateInput('refundRequest'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, reasonNotes } = req.body;

    // Get order details first
    const orderQuery = `
      SELECT o.*, p.stripe_payment_intent_id, p.amount as payment_amount
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id AND p.status = 'completed'
      WHERE o.id = ?
    `;

    const orderResult = await DatabaseUtil.executeQuery(orderQuery, [id]);

    if (!orderResult.success || orderResult.data.length === 0) {
      return res.status(404).json(
        ResponseFormatter.failure('Order or payment not found')
      );
    }

    const order = orderResult.data[0];

    // Validate refund amount
    const refundAmount = amount || order.total_amount;
    if (refundAmount > order.total_amount) {
      return res.status(400).json(
        ResponseFormatter.failure('Refund amount cannot exceed order total')
      );
    }

    // Process refund through Stripe if payment exists
    let stripeRefund = null;
    if (order.stripe_payment_intent_id) {
      try {
        stripeRefund = await StripeService.createRefund(
          order.stripe_payment_intent_id,
          refundAmount,
          reason
        );
      } catch (stripeError) {
        logger.error('Stripe refund failed', {
          error: stripeError.message,
          orderId: id,
          paymentIntentId: order.stripe_payment_intent_id
        });
        // Continue with internal refund record even if Stripe fails
      }
    }

    // Create internal refund record
    const refundResult = await orderService.initiateRefund(
      id,
      refundAmount,
      reason,
      reasonNotes,
      req.user.id
    );

    if (!refundResult.success) {
      return res.status(400).json(refundResult);
    }

    // Update refund record with Stripe information if available
    if (stripeRefund) {
      await DatabaseUtil.executeQuery(
        `UPDATE refunds SET 
         gateway_refund_id = ?, 
         status = ?, 
         processed_at = NOW(),
         refund_details = JSON_SET(refund_details, '$.stripe_refund_id', ?)
         WHERE id = ?`,
        [stripeRefund.id, 'completed', stripeRefund.id, refundResult.data.refundId]
      );
    }

    // Update order status if full refund
    if (refundAmount >= order.total_amount) {
      await orderService.updateOrderStatus(id, 'refunded', `Full refund processed: ${reasonNotes}`, req.user.id);
    }

    logger.info('Admin refund processed', {
      userId: req.user.id,
      orderId: id,
      refundAmount,
      reason,
      stripeRefundId: stripeRefund?.id || null
    });

    const keyValueTable = {
      refundId: refundResult.data.refundId,
      amount: refundAmount,
      stripeRefundId: stripeRefund?.id || null,
      status: stripeRefund ? 'completed' : 'processing'
    };

    res.json(ResponseFormatter.success('Refund processed successfully', keyValueTable));

  } catch (error) {
    logger.error('Error processing admin refund', {
      error: error.message,
      userId: req.user?.id,
      orderId: req.params.id,
      requestBody: req.body
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to process refund', { error: error.message })
    );
  }
});

/**
 * POST /api/admin/orders/:id/shipping
 * Generate shipping label and update tracking information
 */
router.post('/:id/shipping', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceType = 'FEDEX_GROUND', packageWeight, packageDimensions } = req.body;

    // Get order details
    const orderQuery = `
      SELECT o.*, 
             COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Guest') as customer_name,
             u.email as customer_email,
             u.phone as customer_phone
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ? AND o.status IN ('confirmed', 'processing')
    `;

    const orderResult = await DatabaseUtil.executeQuery(orderQuery, [id]);

    if (!orderResult.success || orderResult.data.length === 0) {
      return res.status(404).json(
        ResponseFormatter.failure('Order not found or not ready for shipping')
      );
    }

    const order = orderResult.data[0];
    const shippingAddress = order.shipping_address_json ? JSON.parse(order.shipping_address_json) : null;

    if (!shippingAddress) {
      return res.status(400).json(
        ResponseFormatter.failure('No shipping address found for order')
      );
    }

    // Get order items for package details
    const itemsQuery = `
      SELECT oi.*, p.name as product_name, p.weight, p.dimensions
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `;

    const itemsResult = await DatabaseUtil.executeQuery(itemsQuery, [id]);
    const orderItems = itemsResult.success ? itemsResult.data : [];

    // Calculate package details if not provided
    let calculatedWeight = packageWeight;
    let calculatedDimensions = packageDimensions;

    if (!calculatedWeight || !calculatedDimensions) {
      let totalWeight = 0;
      let maxLength = 0, maxWidth = 0, totalHeight = 0;

      orderItems.forEach(item => {
        if (item.weight) {
          totalWeight += parseFloat(item.weight) * item.quantity;
        }
        if (item.dimensions) {
          const dims = JSON.parse(item.dimensions);
          maxLength = Math.max(maxLength, dims.length || 0);
          maxWidth = Math.max(maxWidth, dims.width || 0);
          totalHeight += (dims.height || 0) * item.quantity;
        }
      });

      calculatedWeight = calculatedWeight || Math.max(totalWeight, 1); // Minimum 1 lb
      calculatedDimensions = calculatedDimensions || {
        length: Math.max(maxLength, 12),
        width: Math.max(maxWidth, 12),
        height: Math.max(totalHeight, 6)
      };
    }

    // Generate shipping label using FedEx service
    const shipmentData = {
      recipient: {
        name: order.customer_name,
        company: shippingAddress.company || '',
        address: {
          street: shippingAddress.street,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country || 'US'
        },
        phone: order.customer_phone || shippingAddress.phone || '',
        email: order.customer_email || order.guest_email
      },
      package: {
        weight: calculatedWeight,
        dimensions: calculatedDimensions
      },
      service: serviceType,
      reference: order.order_number
    };

    const shippingResult = await FedExService.createShipment(shipmentData);

    if (!shippingResult.success) {
      return res.status(400).json(
        ResponseFormatter.failure('Failed to generate shipping label', { 
          error: shippingResult.message 
        })
      );
    }

    // Update order with tracking information
    const trackingNumber = shippingResult.data.trackingNumber;
    const estimatedDelivery = shippingResult.data.estimatedDelivery;

    await DatabaseUtil.executeQuery(
      `UPDATE orders SET 
       tracking_number = ?, 
       estimated_delivery_date = ?,
       status = 'shipped',
       updated_at = NOW()
       WHERE id = ?`,
      [trackingNumber, estimatedDelivery, id]
    );

    // Create status history entry
    await orderService.updateOrderStatus(
      id, 
      'shipped', 
      `Shipped via ${serviceType}. Tracking: ${trackingNumber}`, 
      req.user.id
    );

    logger.info('Admin shipping label generated', {
      userId: req.user.id,
      orderId: id,
      trackingNumber,
      serviceType
    });

    const keyValueTable = {
      trackingNumber,
      estimatedDelivery,
      serviceType,
      labelUrl: shippingResult.data.labelUrl,
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`
    };

    res.json(ResponseFormatter.success('Shipping label generated successfully', keyValueTable));

  } catch (error) {
    logger.error('Error generating admin shipping label', {
      error: error.message,
      userId: req.user?.id,
      orderId: req.params.id,
      requestBody: req.body
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to generate shipping label', { error: error.message })
    );
  }
});

/**
 * POST /api/admin/orders/bulk-update
 * Bulk update order statuses
 */
router.post('/bulk-update', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { orderIds, status, notes } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json(
        ResponseFormatter.failure('Order IDs array is required')
      );
    }

    if (!status) {
      return res.status(400).json(
        ResponseFormatter.failure('Status is required')
      );
    }

    const results = [];
    const errors = [];

    // Process each order
    for (const orderId of orderIds) {
      try {
        const result = await orderService.updateOrderStatus(orderId, status, notes, req.user.id);
        
        if (result.success) {
          results.push({ orderId, success: true, message: result.message });
        } else {
          errors.push({ orderId, success: false, error: result.message });
        }
      } catch (error) {
        errors.push({ orderId, success: false, error: error.message });
      }
    }

    logger.info('Admin bulk order update', {
      userId: req.user.id,
      totalOrders: orderIds.length,
      successful: results.length,
      failed: errors.length,
      status,
      notes: notes || 'No notes'
    });

    const keyValueTable = {
      totalProcessed: orderIds.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };

    res.json(ResponseFormatter.success('Bulk update completed', keyValueTable));

  } catch (error) {
    logger.error('Error in admin bulk order update', {
      error: error.message,
      userId: req.user?.id,
      requestBody: req.body
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to process bulk update', { error: error.message })
    );
  }
});

/**
 * GET /api/admin/orders/analytics/dashboard
 * Get order analytics for admin dashboard
 */
router.get('/analytics/dashboard', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    // Calculate date range based on period
    let dateCondition = '';
    let dateParams = [];

    switch (period) {
      case '7d':
        dateCondition = 'WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case '30d':
        dateCondition = 'WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case '90d':
        dateCondition = 'WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
        break;
      case '1y':
        dateCondition = 'WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        break;
      default:
        dateCondition = 'WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    // Get order metrics
    const metricsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
        COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as average_order_value,
        COUNT(CASE WHEN user_id IS NULL THEN 1 END) as guest_orders,
        COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as registered_orders
      FROM orders o
      ${dateCondition}
    `;

    const metricsResult = await DatabaseUtil.executeQuery(metricsQuery, dateParams);
    const metrics = metricsResult.success ? metricsResult.data[0] : {};

    // Get daily order trends
    const trendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        SUM(total_amount) as daily_revenue,
        AVG(total_amount) as avg_order_value
      FROM orders o
      ${dateCondition}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    const trendsResult = await DatabaseUtil.executeQuery(trendsQuery, dateParams);
    const trends = trendsResult.success ? trendsResult.data : [];

    // Get top products by order frequency
    const topProductsQuery = `
      SELECT 
        p.name as product_name,
        p.sku,
        COUNT(oi.id) as order_count,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.price * oi.quantity) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      ${dateCondition.replace('o.created_at', 'o.created_at')}
      GROUP BY p.id, p.name, p.sku
      ORDER BY order_count DESC
      LIMIT 10
    `;

    const topProductsResult = await DatabaseUtil.executeQuery(topProductsQuery, dateParams);
    const topProducts = topProductsResult.success ? topProductsResult.data : [];

    const keyValueTable = {
      period,
      metrics,
      trends: trends.reverse(), // Show chronological order
      topProducts,
      generatedAt: new Date().toISOString()
    };

    logger.info('Admin order analytics fetched', {
      userId: req.user.id,
      period
    });

    res.json(ResponseFormatter.success('Order analytics fetched successfully', keyValueTable));

  } catch (error) {
    logger.error('Error fetching admin order analytics', {
      error: error.message,
      userId: req.user?.id,
      query: req.query
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to fetch order analytics', { error: error.message })
    );
  }
});

module.exports = router;