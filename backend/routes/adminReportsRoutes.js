const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/admin/reports/financial-overview
 * Get comprehensive financial overview with revenue, profit, and key metrics
 * @param {string} period - Time period: today, week, month, quarter, year, custom
 * @param {string} startDate - Start date for custom period (YYYY-MM-DD)
 * @param {string} endDate - End date for custom period (YYYY-MM-DD)
 */
router.get('/financial-overview', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    // Calculate date range based on period
    const dateRange = calculateDateRange(period, startDate, endDate);
    
    // Get current period financial metrics
    const currentMetrics = await getFinancialMetrics(dateRange.current);
    
    // Get previous period metrics for comparison
    const previousMetrics = await getFinancialMetrics(dateRange.previous);
    
    // Calculate percentage changes
    const metricsWithChanges = calculateFinancialChanges(currentMetrics, previousMetrics);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      metrics: metricsWithChanges,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Financial overview retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Financial overview error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get financial overview', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/revenue-analytics
 * Get detailed revenue analytics with breakdowns
 * @param {string} period - Time period: 7days, 30days, 90days, year
 * @param {string} granularity - Data granularity: day, week, month
 * @param {string} breakdown - Breakdown type: category, product, payment_method
 */
router.get('/revenue-analytics', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = '30days', granularity = 'day', breakdown = 'total' } = req.query;
    
    const revenueData = await getRevenueAnalytics(period, granularity, breakdown);
    
    const keyValueTable = {
      period: period,
      granularity: granularity,
      breakdown: breakdown,
      data: revenueData,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Revenue analytics retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Revenue analytics error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get revenue analytics', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/profitability-analysis
 * Get profitability analysis with cost breakdowns
 * @param {string} period - Time period: month, quarter, year
 * @param {string} breakdown - Breakdown type: product, category, customer_segment
 */
router.get('/profitability-analysis', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', breakdown = 'product' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const profitabilityData = await getProfitabilityAnalysis(dateRange.current, breakdown);
    
    const keyValueTable = {
      period: period,
      breakdown: breakdown,
      dateRange: dateRange.current,
      data: profitabilityData,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Profitability analysis retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Profitability analysis error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get profitability analysis', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/payment-analytics
 * Get payment method analytics and success rates
 * @param {string} period - Time period: week, month, quarter, year
 */
router.get('/payment-analytics', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const paymentAnalytics = await getPaymentAnalytics(dateRange.current);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      analytics: paymentAnalytics,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Payment analytics retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Payment analytics error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get payment analytics', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/refund-analytics
 * Get refund analytics and impact analysis
 * @param {string} period - Time period: month, quarter, year
 */
router.get('/refund-analytics', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const refundAnalytics = await getRefundAnalytics(dateRange.current);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      analytics: refundAnalytics,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Refund analytics retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Refund analytics error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get refund analytics', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/payment-success-rates
 * Get detailed payment success rate analytics
 * @param {string} period - Time period: week, month, quarter, year
 * @param {string} granularity - Data granularity: day, week, month
 */
router.get('/payment-success-rates', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', granularity = 'day' } = req.query;
    
    const successRateData = await getPaymentSuccessRates(period, granularity);
    
    const keyValueTable = {
      period: period,
      granularity: granularity,
      data: successRateData,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Payment success rates retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Payment success rates error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get payment success rates', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/tax-jurisdiction-details
 * Get detailed tax analytics by jurisdiction with trends
 * @param {string} period - Time period: month, quarter, year
 * @param {string} jurisdiction - Specific jurisdiction to analyze (optional)
 */
router.get('/tax-jurisdiction-details', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', jurisdiction } = req.query;
    
    const dateRange = calculateDateRange(period);
    const jurisdictionDetails = await getTaxJurisdictionDetails(dateRange.current, jurisdiction);
    
    const keyValueTable = {
      period: period,
      jurisdiction: jurisdiction || 'all',
      dateRange: dateRange.current,
      data: jurisdictionDetails,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Tax jurisdiction details retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Tax jurisdiction details error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get tax jurisdiction details', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/payment-processing-costs
 * Get payment processing cost analysis
 * @param {string} period - Time period: month, quarter, year
 */
router.get('/payment-processing-costs', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const processingCosts = await getPaymentProcessingCosts(dateRange.current);
    
    const keyValueTable = {
      period: period,
      dateRange: dateRange.current,
      data: processingCosts,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Payment processing costs retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Payment processing costs error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get payment processing costs', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/tax-collection
 * Get tax collection reports by jurisdiction
 * @param {string} period - Time period: month, quarter, year
 * @param {string} jurisdiction - Filter by country/state (optional)
 */
router.get('/tax-collection', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', jurisdiction } = req.query;
    
    const dateRange = calculateDateRange(period);
    const taxData = await getTaxCollectionData(dateRange.current, jurisdiction);
    
    const keyValueTable = {
      period: period,
      jurisdiction: jurisdiction || 'all',
      dateRange: dateRange.current,
      data: taxData,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Tax collection data retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Tax collection error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get tax collection data', keyValueTable));
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
    
    case 'quarter':
      const currentQuarter = Math.floor(now.getMonth() / 3);
      current.start = new Date(now.getFullYear(), currentQuarter * 3, 1);
      current.end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59);
      previous.start = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
      previous.end = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59);
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
 * Get comprehensive financial metrics for a specific date range
 */
async function getFinancialMetrics(dateRange) {
  const queries = [
    // Revenue and order metrics
    `SELECT 
       COUNT(*) as total_orders,
       COALESCE(SUM(total_amount), 0) as gross_revenue,
       COALESCE(SUM(subtotal), 0) as net_revenue,
       COALESCE(SUM(tax_amount), 0) as total_tax,
       COALESCE(SUM(shipping_amount), 0) as shipping_revenue,
       COALESCE(SUM(discount_amount), 0) as total_discounts,
       COALESCE(AVG(total_amount), 0) as avg_order_value,
       COUNT(DISTINCT user_id) as unique_customers
     FROM orders 
     WHERE created_at BETWEEN ? AND ?
     AND status NOT IN ('cancelled', 'refunded')`,
    
    // Payment processing fees
    `SELECT 
       COALESCE(SUM(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed), 0) as processing_fees
     FROM payments p
     JOIN payment_methods pm ON p.payment_method_id = pm.id
     JOIN orders o ON p.order_id = o.id
     WHERE o.created_at BETWEEN ? AND ?
     AND p.status = 'completed'`,
    
    // Refund metrics
    `SELECT 
       COUNT(*) as refund_count,
       COALESCE(SUM(amount), 0) as total_refunded
     FROM refunds r
     JOIN orders o ON r.order_id = o.id
     WHERE o.created_at BETWEEN ? AND ?
     AND r.status = 'completed'`,
    
    // Top performing categories
    `SELECT 
       c.name as category_name,
       COUNT(DISTINCT oi.order_id) as orders,
       SUM(oi.total_price) as revenue
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     JOIN orders o ON oi.order_id = o.id
     WHERE o.created_at BETWEEN ? AND ?
     AND o.status NOT IN ('cancelled', 'refunded')
     GROUP BY c.id, c.name
     ORDER BY revenue DESC
     LIMIT 5`
  ];

  const results = await Promise.all(
    queries.map(query => DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]))
  );

  // Check if all queries succeeded
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success) {
      throw new Error(`Financial metrics query ${i + 1} failed: ${results[i].error}`);
    }
  }

  const [revenueData, feesData, refundData, categoryData] = results.map(r => r.data);

  const revenue = revenueData[0];
  const fees = feesData[0];
  const refunds = refundData[0];

  return {
    revenue: {
      gross: parseFloat(revenue.gross_revenue) || 0,
      net: parseFloat(revenue.net_revenue) || 0,
      tax: parseFloat(revenue.total_tax) || 0,
      shipping: parseFloat(revenue.shipping_revenue) || 0,
      discounts: parseFloat(revenue.total_discounts) || 0,
      avgOrderValue: parseFloat(revenue.avg_order_value) || 0
    },
    orders: {
      total: parseInt(revenue.total_orders) || 0,
      uniqueCustomers: parseInt(revenue.unique_customers) || 0
    },
    costs: {
      processingFees: parseFloat(fees.processing_fees) || 0,
      refunds: parseFloat(refunds.total_refunded) || 0
    },
    refunds: {
      count: parseInt(refunds.refund_count) || 0,
      amount: parseFloat(refunds.total_refunded) || 0
    },
    topCategories: categoryData.map(cat => ({
      name: cat.category_name,
      orders: parseInt(cat.orders),
      revenue: parseFloat(cat.revenue)
    }))
  };
}

/**
 * Calculate percentage changes between current and previous financial metrics
 */
function calculateFinancialChanges(current, previous) {
  const calculateChange = (currentVal, previousVal) => {
    if (previousVal === 0) return currentVal > 0 ? 100 : 0;
    return ((currentVal - previousVal) / previousVal) * 100;
  };

  return {
    revenue: {
      ...current.revenue,
      grossChange: calculateChange(current.revenue.gross, previous.revenue.gross),
      netChange: calculateChange(current.revenue.net, previous.revenue.net)
    },
    orders: {
      ...current.orders,
      totalChange: calculateChange(current.orders.total, previous.orders.total),
      customersChange: calculateChange(current.orders.uniqueCustomers, previous.orders.uniqueCustomers)
    },
    costs: {
      ...current.costs,
      feesChange: calculateChange(current.costs.processingFees, previous.costs.processingFees),
      refundsChange: calculateChange(current.costs.refunds, previous.costs.refunds)
    },
    refunds: {
      ...current.refunds,
      countChange: calculateChange(current.refunds.count, previous.refunds.count),
      amountChange: calculateChange(current.refunds.amount, previous.refunds.amount)
    },
    topCategories: current.topCategories
  };
}

/**
 * Get revenue analytics with time series data
 */
async function getRevenueAnalytics(period, granularity, breakdown) {
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

  let query = `
    SELECT 
      DATE_FORMAT(o.created_at, ?) as period,
      COUNT(*) as order_count,
      COALESCE(SUM(o.total_amount), 0) as gross_revenue,
      COALESCE(SUM(o.subtotal), 0) as net_revenue,
      COALESCE(SUM(o.tax_amount), 0) as tax_amount,
      COALESCE(SUM(o.shipping_amount), 0) as shipping_amount,
      COALESCE(AVG(o.total_amount), 0) as avg_order_value
  `;

  if (breakdown === 'category') {
    query += `, c.name as category_name`;
  } else if (breakdown === 'payment_method') {
    query += `, pm.name as payment_method_name`;
  }

  query += `
    FROM orders o
  `;

  if (breakdown === 'category') {
    query += `
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
    `;
  } else if (breakdown === 'payment_method') {
    query += `
      JOIN payments pay ON o.id = pay.order_id
      JOIN payment_methods pm ON pay.payment_method_id = pm.id
    `;
  }

  query += `
    WHERE o.created_at >= ? 
    AND o.status NOT IN ('cancelled', 'refunded')
    GROUP BY DATE_FORMAT(o.created_at, ?)
  `;

  if (breakdown === 'category') {
    query += `, c.id, c.name`;
  } else if (breakdown === 'payment_method') {
    query += `, pm.id, pm.name`;
  }

  query += ` ORDER BY period ASC`;

  const result = await DatabaseUtil.executeQuery(query, [dateFormat, startDate.toISOString(), dateFormat]);
  
  if (!result.success) {
    throw new Error(`Failed to get revenue analytics: ${result.error}`);
  }

  return result.data.map(row => ({
    period: row.period,
    orderCount: parseInt(row.order_count),
    grossRevenue: parseFloat(row.gross_revenue),
    netRevenue: parseFloat(row.net_revenue),
    taxAmount: parseFloat(row.tax_amount),
    shippingAmount: parseFloat(row.shipping_amount),
    avgOrderValue: parseFloat(row.avg_order_value),
    ...(breakdown === 'category' && { categoryName: row.category_name }),
    ...(breakdown === 'payment_method' && { paymentMethodName: row.payment_method_name })
  }));
}

/**
 * Get profitability analysis
 */
async function getProfitabilityAnalysis(dateRange, breakdown) {
  let query = `
    SELECT 
      COUNT(DISTINCT o.id) as order_count,
      SUM(oi.total_price) as revenue,
      SUM(oi.quantity) as units_sold,
      AVG(oi.unit_price) as avg_unit_price
  `;

  if (breakdown === 'product') {
    query += `, p.name as product_name, p.sku as product_sku`;
  } else if (breakdown === 'category') {
    query += `, c.name as category_name`;
  }

  query += `
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE o.created_at BETWEEN ? AND ?
    AND o.status NOT IN ('cancelled', 'refunded')
  `;

  if (breakdown === 'product') {
    query += ` GROUP BY p.id, p.name, p.sku`;
  } else if (breakdown === 'category') {
    query += ` GROUP BY c.id, c.name`;
  }

  query += ` ORDER BY revenue DESC LIMIT 20`;

  const result = await DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]);
  
  if (!result.success) {
    throw new Error(`Failed to get profitability analysis: ${result.error}`);
  }

  return result.data.map(row => ({
    orderCount: parseInt(row.order_count),
    revenue: parseFloat(row.revenue),
    unitsSold: parseInt(row.units_sold),
    avgUnitPrice: parseFloat(row.avg_unit_price),
    ...(breakdown === 'product' && { 
      productName: row.product_name,
      productSku: row.product_sku 
    }),
    ...(breakdown === 'category' && { categoryName: row.category_name })
  }));
}

/**
 * Get payment analytics
 */
async function getPaymentAnalytics(dateRange) {
  const queries = [
    // Payment method distribution
    `SELECT 
       pm.name as payment_method,
       pm.type as payment_type,
       COUNT(*) as transaction_count,
       SUM(p.amount) as total_amount,
       AVG(p.amount) as avg_amount,
       SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as successful_count,
       SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) as failed_count
     FROM payments p
     JOIN payment_methods pm ON p.payment_method_id = pm.id
     JOIN orders o ON p.order_id = o.id
     WHERE o.created_at BETWEEN ? AND ?
     GROUP BY pm.id, pm.name, pm.type
     ORDER BY total_amount DESC`,
    
    // Processing fees by method
    `SELECT 
       pm.name as payment_method,
       SUM(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed) as total_fees,
       AVG(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed) as avg_fee_per_transaction
     FROM payments p
     JOIN payment_methods pm ON p.payment_method_id = pm.id
     JOIN orders o ON p.order_id = o.id
     WHERE o.created_at BETWEEN ? AND ?
     AND p.status = 'completed'
     GROUP BY pm.id, pm.name`
  ];

  const results = await Promise.all(
    queries.map(query => DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]))
  );

  // Check if all queries succeeded
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success) {
      throw new Error(`Payment analytics query ${i + 1} failed: ${results[i].error}`);
    }
  }

  const [methodData, feeData] = results.map(r => r.data);

  return {
    paymentMethods: methodData.map(row => ({
      method: row.payment_method,
      type: row.payment_type,
      transactionCount: parseInt(row.transaction_count),
      totalAmount: parseFloat(row.total_amount),
      avgAmount: parseFloat(row.avg_amount),
      successfulCount: parseInt(row.successful_count),
      failedCount: parseInt(row.failed_count),
      successRate: row.transaction_count > 0 ? (row.successful_count / row.transaction_count) * 100 : 0
    })),
    processingFees: feeData.map(row => ({
      method: row.payment_method,
      totalFees: parseFloat(row.total_fees),
      avgFeePerTransaction: parseFloat(row.avg_fee_per_transaction)
    }))
  };
}

/**
 * Get refund analytics
 */
async function getRefundAnalytics(dateRange) {
  const query = `
    SELECT 
      r.reason,
      COUNT(*) as refund_count,
      SUM(r.amount) as total_refunded,
      AVG(r.amount) as avg_refund_amount,
      AVG(DATEDIFF(r.created_at, o.created_at)) as avg_days_to_refund
    FROM refunds r
    JOIN orders o ON r.order_id = o.id
    WHERE o.created_at BETWEEN ? AND ?
    AND r.status = 'completed'
    GROUP BY r.reason
    ORDER BY total_refunded DESC
  `;

  const result = await DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]);
  
  if (!result.success) {
    throw new Error(`Failed to get refund analytics: ${result.error}`);
  }

  return result.data.map(row => ({
    reason: row.reason,
    refundCount: parseInt(row.refund_count),
    totalRefunded: parseFloat(row.total_refunded),
    avgRefundAmount: parseFloat(row.avg_refund_amount),
    avgDaysToRefund: parseFloat(row.avg_days_to_refund)
  }));
}

/**
 * Get payment success rates over time
 */
async function getPaymentSuccessRates(period, granularity) {
  let dateFormat, intervalDays;
  
  switch (period) {
    case 'week':
      intervalDays = 7;
      dateFormat = granularity === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
      break;
    case 'month':
      intervalDays = 30;
      dateFormat = '%Y-%m-%d';
      break;
    case 'quarter':
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
      DATE_FORMAT(o.created_at, ?) as period,
      pm.name as payment_method,
      COUNT(*) as total_attempts,
      SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as successful_payments,
      SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
      AVG(p.amount) as avg_amount,
      SUM(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed) as processing_fees
    FROM orders o
    JOIN payments p ON o.id = p.order_id
    JOIN payment_methods pm ON p.payment_method_id = pm.id
    WHERE o.created_at >= ?
    GROUP BY DATE_FORMAT(o.created_at, ?), pm.id, pm.name
    ORDER BY period ASC, payment_method ASC
  `;

  const result = await DatabaseUtil.executeQuery(query, [dateFormat, startDate.toISOString(), dateFormat]);
  
  if (!result.success) {
    throw new Error(`Failed to get payment success rates: ${result.error}`);
  }

  return result.data.map(row => ({
    period: row.period,
    paymentMethod: row.payment_method,
    totalAttempts: parseInt(row.total_attempts),
    successfulPayments: parseInt(row.successful_payments),
    failedPayments: parseInt(row.failed_payments),
    successRate: row.total_attempts > 0 ? (row.successful_payments / row.total_attempts) * 100 : 0,
    avgAmount: parseFloat(row.avg_amount),
    processingFees: parseFloat(row.processing_fees)
  }));
}

/**
 * Get detailed tax jurisdiction analytics
 */
async function getTaxJurisdictionDetails(dateRange, jurisdiction) {
  const queries = [
    // Tax collection by jurisdiction with trends
    `SELECT 
       JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.country')) as country,
       JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.state')) as state,
       COUNT(*) as order_count,
       SUM(o.tax_amount) as total_tax_collected,
       AVG(o.tax_amount) as avg_tax_per_order,
       SUM(o.subtotal) as taxable_amount,
       MIN(o.tax_amount) as min_tax,
       MAX(o.tax_amount) as max_tax
     FROM orders o
     WHERE o.created_at BETWEEN ? AND ?
     AND o.status NOT IN ('cancelled', 'refunded')
     AND o.tax_amount > 0
     ${jurisdiction ? `AND (JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.country')) = ? 
                       OR JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.state')) = ?)` : ''}
     GROUP BY 
       JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.country')),
       JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.state'))
     ORDER BY total_tax_collected DESC`,
    
    // Tax exemptions and zero-tax orders
    `SELECT 
       COUNT(*) as zero_tax_orders,
       SUM(o.subtotal) as zero_tax_subtotal
     FROM orders o
     WHERE o.created_at BETWEEN ? AND ?
     AND o.status NOT IN ('cancelled', 'refunded')
     AND o.tax_amount = 0`
  ];

  const params = jurisdiction 
    ? [dateRange.start, dateRange.end, jurisdiction, jurisdiction, dateRange.start, dateRange.end]
    : [dateRange.start, dateRange.end, dateRange.start, dateRange.end];

  const results = await Promise.all(
    queries.map((query, index) => {
      const queryParams = index === 0 && jurisdiction 
        ? [dateRange.start, dateRange.end, jurisdiction, jurisdiction]
        : [dateRange.start, dateRange.end];
      return DatabaseUtil.executeQuery(query, queryParams);
    })
  );

  // Check if all queries succeeded
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success) {
      throw new Error(`Tax jurisdiction query ${i + 1} failed: ${results[i].error}`);
    }
  }

  const [jurisdictionData, exemptionData] = results.map(r => r.data);

  return {
    jurisdictions: jurisdictionData.map(row => ({
      country: row.country,
      state: row.state,
      orderCount: parseInt(row.order_count),
      totalTaxCollected: parseFloat(row.total_tax_collected),
      avgTaxPerOrder: parseFloat(row.avg_tax_per_order),
      taxableAmount: parseFloat(row.taxable_amount),
      effectiveTaxRate: row.taxable_amount > 0 ? (row.total_tax_collected / row.taxable_amount) * 100 : 0,
      minTax: parseFloat(row.min_tax),
      maxTax: parseFloat(row.max_tax)
    })),
    exemptions: {
      zeroTaxOrders: parseInt(exemptionData[0]?.zero_tax_orders || 0),
      zeroTaxSubtotal: parseFloat(exemptionData[0]?.zero_tax_subtotal || 0)
    }
  };
}

/**
 * Get payment processing cost analysis
 */
async function getPaymentProcessingCosts(dateRange) {
  const query = `
    SELECT 
      pm.name as payment_method,
      pm.type as payment_type,
      COUNT(*) as transaction_count,
      SUM(p.amount) as total_volume,
      SUM(p.amount * pm.processing_fee_percentage) as percentage_fees,
      SUM(pm.processing_fee_fixed) as fixed_fees,
      SUM(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed) as total_fees,
      AVG(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed) as avg_fee_per_transaction,
      (SUM(p.amount * pm.processing_fee_percentage + pm.processing_fee_fixed) / SUM(p.amount)) * 100 as effective_fee_rate
    FROM payments p
    JOIN payment_methods pm ON p.payment_method_id = pm.id
    JOIN orders o ON p.order_id = o.id
    WHERE o.created_at BETWEEN ? AND ?
    AND p.status = 'completed'
    GROUP BY pm.id, pm.name, pm.type
    ORDER BY total_fees DESC
  `;

  const result = await DatabaseUtil.executeQuery(query, [dateRange.start, dateRange.end]);
  
  if (!result.success) {
    throw new Error(`Failed to get payment processing costs: ${result.error}`);
  }

  return result.data.map(row => ({
    paymentMethod: row.payment_method,
    paymentType: row.payment_type,
    transactionCount: parseInt(row.transaction_count),
    totalVolume: parseFloat(row.total_volume),
    percentageFees: parseFloat(row.percentage_fees),
    fixedFees: parseFloat(row.fixed_fees),
    totalFees: parseFloat(row.total_fees),
    avgFeePerTransaction: parseFloat(row.avg_fee_per_transaction),
    effectiveFeeRate: parseFloat(row.effective_fee_rate)
  }));
}

/**
 * Get tax collection data by jurisdiction
 */
async function getTaxCollectionData(dateRange, jurisdiction) {
  let query = `
    SELECT 
      JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.country')) as country,
      JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.state')) as state,
      COUNT(*) as order_count,
      SUM(o.tax_amount) as total_tax_collected,
      AVG(o.tax_amount) as avg_tax_per_order,
      SUM(o.subtotal) as taxable_amount
    FROM orders o
    WHERE o.created_at BETWEEN ? AND ?
    AND o.status NOT IN ('cancelled', 'refunded')
    AND o.tax_amount > 0
  `;

  const params = [dateRange.start, dateRange.end];

  if (jurisdiction) {
    query += ` AND (JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.country')) = ? 
                OR JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.state')) = ?)`;
    params.push(jurisdiction, jurisdiction);
  }

  query += `
    GROUP BY 
      JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.country')),
      JSON_UNQUOTE(JSON_EXTRACT(o.billing_address_json, '$.state'))
    ORDER BY total_tax_collected DESC
  `;

  const result = await DatabaseUtil.executeQuery(query, params);
  
  if (!result.success) {
    throw new Error(`Failed to get tax collection data: ${result.error}`);
  }

  return result.data.map(row => ({
    country: row.country,
    state: row.state,
    orderCount: parseInt(row.order_count),
    totalTaxCollected: parseFloat(row.total_tax_collected),
    avgTaxPerOrder: parseFloat(row.avg_tax_per_order),
    taxableAmount: parseFloat(row.taxable_amount),
    effectiveTaxRate: row.taxable_amount > 0 ? (row.total_tax_collected / row.taxable_amount) * 100 : 0
  }));
}

/**
 * GET /api/admin/reports/export/financial-overview
 * Export financial overview data as CSV
 * @param {string} period - Time period: month, quarter, year
 * @param {string} format - Export format: csv, xlsx (default: csv)
 */
router.get('/export/financial-overview', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', format = 'csv' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const financialMetrics = await getFinancialMetrics(dateRange.current);
    
    if (format === 'csv') {
      const csvData = generateFinancialOverviewCSV(financialMetrics, period, dateRange.current);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="financial-overview-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } else {
      const keyValueTable = { error: 'Unsupported format' };
      res.status(400).json(ResponseFormatter.failure('Unsupported export format', keyValueTable));
    }
  } catch (error) {
    logger.error('Financial overview export error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to export financial overview', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/export/revenue-analytics
 * Export revenue analytics data as CSV
 * @param {string} period - Time period: 30days, 90days, year
 * @param {string} granularity - Data granularity: day, week, month
 * @param {string} format - Export format: csv (default: csv)
 */
router.get('/export/revenue-analytics', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = '30days', granularity = 'day', format = 'csv' } = req.query;
    
    const revenueData = await getRevenueAnalytics(period, granularity, 'total');
    
    if (format === 'csv') {
      const csvData = generateRevenueAnalyticsCSV(revenueData, period, granularity);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="revenue-analytics-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } else {
      const keyValueTable = { error: 'Unsupported format' };
      res.status(400).json(ResponseFormatter.failure('Unsupported export format', keyValueTable));
    }
  } catch (error) {
    logger.error('Revenue analytics export error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to export revenue analytics', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/export/tax-collection
 * Export tax collection data as CSV
 * @param {string} period - Time period: month, quarter, year
 * @param {string} format - Export format: csv (default: csv)
 */
router.get('/export/tax-collection', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', format = 'csv' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const taxData = await getTaxCollectionData(dateRange.current);
    
    if (format === 'csv') {
      const csvData = generateTaxCollectionCSV(taxData, period, dateRange.current);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="tax-collection-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } else {
      const keyValueTable = { error: 'Unsupported format' };
      res.status(400).json(ResponseFormatter.failure('Unsupported export format', keyValueTable));
    }
  } catch (error) {
    logger.error('Tax collection export error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to export tax collection data', keyValueTable));
  }
});

/**
 * GET /api/admin/reports/export/payment-analytics
 * Export payment analytics data as CSV
 * @param {string} period - Time period: month, quarter, year
 * @param {string} format - Export format: csv (default: csv)
 */
router.get('/export/payment-analytics', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { period = 'month', format = 'csv' } = req.query;
    
    const dateRange = calculateDateRange(period);
    const paymentData = await getPaymentAnalytics(dateRange.current);
    
    if (format === 'csv') {
      const csvData = generatePaymentAnalyticsCSV(paymentData, period, dateRange.current);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payment-analytics-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } else {
      const keyValueTable = { error: 'Unsupported format' };
      res.status(400).json(ResponseFormatter.failure('Unsupported export format', keyValueTable));
    }
  } catch (error) {
    logger.error('Payment analytics export error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to export payment analytics', keyValueTable));
  }
});

// CSV Generation Helper Functions

/**
 * Generate CSV for financial overview
 */
function generateFinancialOverviewCSV(metrics, period, dateRange) {
  const headers = [
    'Report Type',
    'Period',
    'Date Range Start',
    'Date Range End',
    'Gross Revenue',
    'Net Revenue',
    'Tax Amount',
    'Shipping Revenue',
    'Total Discounts',
    'Average Order Value',
    'Total Orders',
    'Unique Customers',
    'Processing Fees',
    'Refund Amount',
    'Refund Count'
  ];

  const rows = [
    [
      'Financial Overview',
      period,
      dateRange.start,
      dateRange.end,
      metrics.revenue.gross.toFixed(2),
      metrics.revenue.net.toFixed(2),
      metrics.revenue.tax.toFixed(2),
      metrics.revenue.shipping.toFixed(2),
      metrics.revenue.discounts.toFixed(2),
      metrics.revenue.avgOrderValue.toFixed(2),
      metrics.orders.total,
      metrics.orders.uniqueCustomers,
      metrics.costs.processingFees.toFixed(2),
      metrics.costs.refunds.toFixed(2),
      metrics.refunds.count
    ]
  ];

  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

/**
 * Generate CSV for revenue analytics
 */
function generateRevenueAnalyticsCSV(data, period, granularity) {
  const headers = [
    'Period',
    'Order Count',
    'Gross Revenue',
    'Net Revenue',
    'Tax Amount',
    'Shipping Amount',
    'Average Order Value'
  ];

  const rows = data.map(item => [
    item.period,
    item.orderCount,
    item.grossRevenue.toFixed(2),
    item.netRevenue.toFixed(2),
    item.taxAmount.toFixed(2),
    item.shippingAmount.toFixed(2),
    item.avgOrderValue.toFixed(2)
  ]);

  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

/**
 * Generate CSV for tax collection
 */
function generateTaxCollectionCSV(data, period, dateRange) {
  const headers = [
    'Country',
    'State',
    'Order Count',
    'Total Tax Collected',
    'Average Tax Per Order',
    'Taxable Amount',
    'Effective Tax Rate (%)'
  ];

  const rows = data.map(item => [
    item.country || '',
    item.state || '',
    item.orderCount,
    item.totalTaxCollected.toFixed(2),
    item.avgTaxPerOrder.toFixed(2),
    item.taxableAmount.toFixed(2),
    item.effectiveTaxRate.toFixed(2)
  ]);

  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

/**
 * Generate CSV for payment analytics
 */
function generatePaymentAnalyticsCSV(data, period, dateRange) {
  const headers = [
    'Payment Method',
    'Payment Type',
    'Transaction Count',
    'Total Amount',
    'Average Amount',
    'Successful Count',
    'Failed Count',
    'Success Rate (%)'
  ];

  const rows = data.paymentMethods.map(method => [
    method.method,
    method.type,
    method.transactionCount,
    method.totalAmount.toFixed(2),
    method.avgAmount.toFixed(2),
    method.successfulCount,
    method.failedCount,
    method.successRate.toFixed(2)
  ]);

  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

module.exports = router;