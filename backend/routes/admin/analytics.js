// Admin API: Dashboard summary analytics (detailed reports live in routes/analyticsRoutes.js).
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { admin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const { adminReadLimiter } = require('./limiters');

const router = express.Router();

// Analytics & Dashboard
router.get('/analytics/summary', admin, adminReadLimiter, async (req, res) => {
  try {
    // Parallel queries for performance
    const [revenueResult, ordersResult, customersResult, visitorsResult, paidOrdersResult, activeOrdersResult] = await Promise.all([
      DatabaseUtil.executeQuery("SELECT SUM(total_amount) as total FROM orders WHERE status != 'cancelled'"),
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'"),
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM users WHERE role = 'customer' AND status = 'active'"),
      // Visitor proxy: there is no analytics/tracking table. shopping_carts has one row per browser
      // session (user_id once logged in, else session_id), but checkout empties carts, so everyone who
      // ever ordered (account or guest email) is added: a buyer is always a visitor.
      DatabaseUtil.executeQuery("SELECT COUNT(*) as count FROM (SELECT COALESCE(user_id, session_id, id) AS visitor FROM shopping_carts UNION SELECT COALESCE(user_id, guest_email, id) FROM orders) v"),
      // Paying visitors: distinct customers (account or guest email) with a completed payment, in the
      // same identity as the visitors above, so the rate can't pass 100%.
      DatabaseUtil.executeQuery("SELECT COUNT(DISTINCT COALESCE(o.user_id, o.guest_email, o.id)) as count FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.status = 'completed'"),
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
    const visitors = Number(visitorsResult.data[0].count) || 0;    // cart sessions + customers who ordered
    const paidOrders = Number(paidOrdersResult.data[0].count) || 0; // visitors with a completed payment
    // Conversion rate: the percentage of visitors who paid for an order.
    // Falls back to 0 when no visitor proxy exists (avoids divide-by-zero and never fabricates a rate).
    const conversionRate = visitors > 0 ? Number(((paidOrders / visitors) * 100).toFixed(2)) : 0;

    res.json(ResponseFormatter.success('Summary metrics fetched', [{
      metrics: {
        totalRevenue,
        activeOrders, // in-flight orders (pending/confirmed/processing/shipped); excludes delivered/cancelled/refunded
        avgOrderValue,
        conversionRate, // derived: (paying visitors / visitors) * 100
        visitors,       // derived: cart sessions plus customers who ordered (visitor proxy)
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

module.exports = router;
