const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/dashboard/overview
 * Get dashboard overview with KPIs and metrics
 * @param {string} period - Time period: today, week, month, year, custom
 * @param {string} startDate - Start date for custom period (YYYY-MM-DD)
 * @param {string} endDate - End date for custom period (YYYY-MM-DD)
 */
router.get('/overview', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    
    // Calculate date range based on period
    const dateRange = calculateDateRange(period, startDate, endDate);
    
    // Get current period metrics
    const currentMetrics = await getDashboardMetrics(dateRange.current);
    
    // Get previous period metrics for comparison
    const previousMetrics = await getDashboardMetrics(dateRange.previous);
    
    // Calculate percentage changes
    const metricsWithChanges = calculateMetricChanges(currentMetrics, previousMetrics);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      metrics: metricsWithChanges,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Dashboard overview retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Dashboard overview error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get dashboard overview', keyValueTable));
  }
});

/**
 * GET /api/dashboard/sales-trend
 * Get sales trend data for charts
 * @param {string} period - Time period: 7days, 30days, 90days, year
 * @param {string} granularity - Data granularity: hour, day, week, month
 */
router.get('/sales-trend', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { period = '30days', granularity = 'day' } = req.query;
    
    const salesTrendData = await getSalesTrendData(period, granularity);
    
    const keyValueTable = {
      period: period,
      granularity: granularity,
      data: salesTrendData,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Sales trend data retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Sales trend error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get sales trend data', keyValueTable));
  }
});

/**
 * GET /api/dashboard/top-products
 * Get top performing products
 * @param {string} period - Time period: week, month, quarter, year
 * @param {number} limit - Number of products to return (default: 10)
 * @param {string} metric - Metric to sort by: revenue, quantity, orders
 */
router.get('/top-products', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { period = 'month', limit = 10, metric = 'revenue' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const topProducts = await getTopProducts(dateRange.current, parseInt(limit), metric);
    
    const keyValueTable = {
      period: period,
      metric: metric,
      limit: parseInt(limit),
      products: topProducts,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Top products retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Top products error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get top products', keyValueTable));
  }
});

/**
 * GET /api/dashboard/order-status-distribution
 * Get order status distribution for pie charts
 * @param {string} period - Time period: today, week, month, year
 */
router.get('/order-status-distribution', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const statusDistribution = await getOrderStatusDistribution(dateRange.current);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      distribution: statusDistribution,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Order status distribution retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Order status distribution error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get order status distribution', keyValueTable));
  }
});

/**
 * GET /api/dashboard/customer-analytics
 * Get customer analytics data
 * @param {string} period - Time period: month, quarter, year
 */
router.get('/customer-analytics', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const customerAnalytics = await getCustomerAnalytics(dateRange.current);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      analytics: customerAnalytics,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Customer analytics retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Customer analytics error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get customer analytics', keyValueTable));
  }
});

/**
 * GET /api/dashboard/inventory-alerts
 * Get low stock and inventory alerts
 */
router.get('/inventory-alerts', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const inventoryAlerts = await getInventoryAlerts();
    
    const keyValueTable = {
      alerts: inventoryAlerts,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Inventory alerts retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Inventory alerts error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get inventory alerts', keyValueTable));
  }
});

// Helper Functions

/**
 * Calculate date ranges for current and previous periods
 */
function calculateDateRange(period, startDate, endDate) {
  const now = new Date();
  let current = { start: null, end: null };
  let previous = { start: null, end: null };

  switch (period) {
    case 'today':
      current.start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      current.end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      previous.start = new Date(current.start.getTime() - 24 * 60 * 60 * 1000);
      previous.end = new Date(current.end.getTime() - 24 * 60 * 60 * 1000);
      break;
    
    case 'week':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      current.start = weekStart;
      current.end = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      previous.start = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      previous.end = new Date(weekStart.getTime() - 1);
      break;
    
    case 'month':
      current.start = new Date(now.getFullYear(), now.getMonth(), 1);
      current.end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      previous.start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previous.end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    
    case 'year':
      current.start = new Date(now.getFullYear(), 0, 1);
      current.end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      previous.start = new Date(now.getFullYear() - 1, 0, 1);
      previous.end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      break;
    
    case 'custom':
      if (startDate && endDate) {
        current.start = new Date(startDate);
        current.end = new Date(endDate);
        const daysDiff = Math.ceil((current.end - current.start) / (1000 * 60 * 60 * 24));
        previous.start = new Date(current.start.getTime() - daysDiff * 24 * 60 * 60 * 1000);
        previous.end = new Date(current.start.getTime() - 1);
      } else {
        throw new Error('Start date and end date required for custom period');
      }
      break;
    
    default:
      throw new Error('Invalid period specified');
  }

  return {
    current: {
      start: current.start.toISOString(),
      end: current.end.toISOString()
    },
    previous: {
      start: previous.start.toISOString(),
      end: previous.end.toISOString()
    }
  };
}

/**
 * Get dashboard metrics for a specific date range
 */
async function getDashboardMetrics(dateRange) {
  const queries = [
    // Revenue metrics
    `SELECT 
       COUNT(*) as total_orders,
       COALESCE(SUM(total_amount), 0) as total_revenue,
       COALESCE(AVG(total_amount), 0) as avg_order_value,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as completed_revenue
     FROM orders 
     WHERE created_at BETWEEN ? AND ?
     AND status NOT IN ('cancelled', 'refunded')`,
    
    // Customer metrics
    `SELECT 
       COUNT(DISTINCT user_id) as unique_customers,
       COUNT(DISTINCT CASE WHEN user_id IS NULL THEN guest_email ELSE user_id END) as total_customers
     FROM orders 
     WHERE created_at BETWEEN ? AND ?`,
    
    // New user registrations
    `SELECT COUNT(*) as new_users
     FROM users 
     WHERE created_at BETWEEN ? AND ? 
     AND role = 'customer'`,
    
    // Product metrics
    `SELECT 
       COUNT(DISTINCT oi.product_id) as products_sold,
       COALESCE(SUM(oi.quantity), 0) as total_items_sold
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE o.created_at BETWEEN ? AND ?
     AND o.status NOT IN ('cancelled', 'refunded')`
  ];

  const results = await Promise.all(
    queries.map(query => DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]))
  );

  // Check if all queries succeeded
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success) {
      throw new Error(`Query ${i + 1} failed: ${results[i].error}`);
    }
  }

  const [revenueData, customerData, newUsersData, productData] = results.map(r => r.data[0]);

  return {
    revenue: {
      total: parseFloat(revenueData.total_revenue) || 0,
      completed: parseFloat(revenueData.completed_revenue) || 0,
      avgOrderValue: parseFloat(revenueData.avg_order_value) || 0
    },
    orders: {
      total: parseInt(revenueData.total_orders) || 0,
      completed: 0 // Will be calculated separately if needed
    },
    customers: {
      unique: parseInt(customerData.unique_customers) || 0,
      total: parseInt(customerData.total_customers) || 0,
      new: parseInt(newUsersData.new_users) || 0
    },
    products: {
      sold: parseInt(productData.products_sold) || 0,
      totalItems: parseInt(productData.total_items_sold) || 0
    }
  };
}

/**
 * Calculate percentage changes between current and previous metrics
 */
function calculateMetricChanges(current, previous) {
  const calculateChange = (currentVal, previousVal) => {
    if (previousVal === 0) return currentVal > 0 ? 100 : 0;
    return ((currentVal - previousVal) / previousVal) * 100;
  };

  return {
    revenue: {
      ...current.revenue,
      change: calculateChange(current.revenue.total, previous.revenue.total)
    },
    orders: {
      ...current.orders,
      change: calculateChange(current.orders.total, previous.orders.total)
    },
    customers: {
      ...current.customers,
      change: calculateChange(current.customers.total, previous.customers.total)
    },
    products: {
      ...current.products,
      change: calculateChange(current.products.totalItems, previous.products.totalItems)
    }
  };
}

/**
 * Get sales trend data for charts
 */
async function getSalesTrendData(period, granularity) {
  let dateFormat, intervalDays;
  
  switch (period) {
    case '7days':
      intervalDays = 7;
      dateFormat = granularity === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
      break;
    case '30days':
      intervalDays = 30;
      dateFormat = '%Y-%m-%d';
      break;
    case '90days':
      intervalDays = 90;
      dateFormat = granularity === 'week' ? '%Y-%u' : '%Y-%m-%d';
      break;
    case 'year':
      intervalDays = 365;
      dateFormat = '%Y-%m';
      break;
    default:
      intervalDays = 30;
      dateFormat = '%Y-%m-%d';
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - intervalDays);

  const query = `
    SELECT 
      DATE_FORMAT(created_at, ?) as period,
      COUNT(*) as order_count,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(AVG(total_amount), 0) as avg_order_value
    FROM orders 
    WHERE created_at >= ? 
    AND status NOT IN ('cancelled', 'refunded')
    GROUP BY DATE_FORMAT(created_at, ?)
    ORDER BY period ASC
  `;

  const result = await DatabaseUtil.executeQuery(query, [dateFormat, startDate.toISOString(), dateFormat]);
  
  if (!result.success) {
    throw new Error(`Failed to get sales trend data: ${result.error}`);
  }

  return result.data.map(row => ({
    period: row.period,
    orderCount: parseInt(row.order_count),
    revenue: parseFloat(row.revenue),
    avgOrderValue: parseFloat(row.avg_order_value)
  }));
}

/**
 * Get top performing products
 */
async function getTopProducts(dateRange, limit, metric) {
  let orderByClause;
  switch (metric) {
    case 'quantity':
      orderByClause = 'total_quantity DESC';
      break;
    case 'orders':
      orderByClause = 'order_count DESC';
      break;
    case 'revenue':
    default:
      orderByClause = 'total_revenue DESC';
  }

  const query = `
    SELECT 
      p.id,
      p.name,
      p.sku,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.total_price) as total_revenue,
      AVG(oi.unit_price) as avg_price
    FROM products p
    JOIN order_items oi ON p.id = oi.product_id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at BETWEEN ? AND ?
    AND o.status NOT IN ('cancelled', 'refunded')
    GROUP BY p.id, p.name, p.sku
    ORDER BY ${orderByClause}
    LIMIT ?
  `;

  const result = await DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end, limit]);
  
  if (!result.success) {
    throw new Error(`Failed to get top products: ${result.error}`);
  }

  return result.data.map(row => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    orderCount: parseInt(row.order_count),
    totalQuantity: parseInt(row.total_quantity),
    totalRevenue: parseFloat(row.total_revenue),
    avgPrice: parseFloat(row.avg_price)
  }));
}

/**
 * Get order status distribution
 */
async function getOrderStatusDistribution(dateRange) {
  const query = `
    SELECT 
      status,
      COUNT(*) as count,
      SUM(total_amount) as total_value
    FROM orders 
    WHERE created_at BETWEEN ? AND ?
    GROUP BY status
    ORDER BY count DESC
  `;

  const result = await DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]);
  
  if (!result.success) {
    throw new Error(`Failed to get order status distribution: ${result.error}`);
  }

  return result.data.map(row => ({
    status: row.status,
    count: parseInt(row.count),
    totalValue: parseFloat(row.total_value)
  }));
}

/**
 * Get customer analytics
 */
async function getCustomerAnalytics(dateRange) {
  const queries = [
    // Customer acquisition
    `SELECT COUNT(*) as new_customers
     FROM users 
     WHERE created_at BETWEEN ? AND ? 
     AND role = 'customer'`,
    
    // Repeat customers
    `SELECT COUNT(DISTINCT user_id) as repeat_customers
     FROM orders 
     WHERE user_id IN (
       SELECT user_id 
       FROM orders 
       WHERE user_id IS NOT NULL 
       GROUP BY user_id 
       HAVING COUNT(*) > 1
     )
     AND created_at BETWEEN ? AND ?`,
    
    // Customer lifetime value
    `SELECT 
       AVG(customer_total) as avg_lifetime_value,
       MAX(customer_total) as max_lifetime_value
     FROM (
       SELECT user_id, SUM(total_amount) as customer_total
       FROM orders 
       WHERE user_id IS NOT NULL 
       AND status NOT IN ('cancelled', 'refunded')
       GROUP BY user_id
     ) customer_totals`
  ];

  const results = await Promise.all(
    queries.map((query, index) => {
      const params = index < 2 ? [dateRange.start, dateRange.end] : [];
      return DatabaseUtil.executeQuery(query, params);
    })
  );

  // Check if all queries succeeded
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success) {
      throw new Error(`Customer analytics query ${i + 1} failed: ${results[i].error}`);
    }
  }

  const [newCustomers, repeatCustomers, lifetimeValue] = results.map(r => r.data[0]);

  return {
    newCustomers: parseInt(newCustomers.new_customers) || 0,
    repeatCustomers: parseInt(repeatCustomers.repeat_customers) || 0,
    avgLifetimeValue: parseFloat(lifetimeValue.avg_lifetime_value) || 0,
    maxLifetimeValue: parseFloat(lifetimeValue.max_lifetime_value) || 0
  };
}

/**
 * Get inventory alerts
 */
async function getInventoryAlerts() {
  const query = `
    SELECT 
      i.id,
      p.name as product_name,
      p.sku,
      pv.size,
      pv.color,
      i.quantity_available,
      i.quantity_reserved,
      i.reorder_point,
      CASE 
        WHEN i.quantity_available = 0 THEN 'out_of_stock'
        WHEN i.quantity_available <= i.reorder_point THEN 'low_stock'
        ELSE 'normal'
      END as alert_type
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN product_variants pv ON i.variant_id = pv.id
    WHERE i.quantity_available <= i.reorder_point
    OR i.quantity_available = 0
    ORDER BY 
      CASE 
        WHEN i.quantity_available = 0 THEN 1
        WHEN i.quantity_available <= i.reorder_point THEN 2
        ELSE 3
      END,
      i.quantity_available ASC
    LIMIT 50
  `;

  const result = await DatabaseUtil.executeQuery(query);
  
  if (!result.success) {
    throw new Error(`Failed to get inventory alerts: ${result.error}`);
  }

  return result.data.map(row => ({
    id: row.id,
    productName: row.product_name,
    sku: row.sku,
    size: row.size,
    color: row.color,
    quantityAvailable: parseInt(row.quantity_available),
    quantityReserved: parseInt(row.quantity_reserved),
    reorderPoint: parseInt(row.reorder_point),
    alertType: row.alert_type
  }));
}

module.exports = router;