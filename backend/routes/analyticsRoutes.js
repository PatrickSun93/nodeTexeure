const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * Clamp a value to a safe positive integer (used to inline LIMIT values, which
 * mysql2 prepared statements cannot bind as `LIMIT ?`).
 */
function safeLimit(value, fallback = 10, max = 100) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(n, max);
}

/**
 * Helper function to parse date range
 */
function getDateRange(period, start_date, end_date) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            endDate = new Date(now.setHours(23, 59, 59, 999));
            break;
        case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = new Date(yesterday.setHours(0, 0, 0, 0));
            endDate = new Date(yesterday.setHours(23, 59, 59, 999));
            break;
        case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            endDate = new Date();
            break;
        case 'month':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
            endDate = new Date();
            break;
        case 'year':
            startDate = new Date(now);
            startDate.setFullYear(now.getFullYear() - 1);
            endDate = new Date();
            break;
        case 'custom':
            startDate = start_date ? new Date(start_date) : new Date(now.setMonth(now.getMonth() - 1));
            endDate = end_date ? new Date(end_date) : new Date();
            break;
        default:
            // Default to last 30 days
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            endDate = new Date();
    }

    return { startDate, endDate };
}

/**
 * GET /api/admin/analytics/sales-summary
 * Overall sales metrics
 */
router.get('/sales-summary', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        const query = `
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as total_revenue,
                AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE NULL END) as avg_order_value,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN subtotal ELSE 0 END) as total_subtotal,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN tax_amount ELSE 0 END) as total_tax,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN shipping_amount ELSE 0 END) as total_shipping,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN discount_amount ELSE 0 END) as total_discounts
            FROM orders
            WHERE created_at BETWEEN ? AND ?
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);
        const summary = result.data[0];

        // Get comparison with previous period
        const periodLength = endDate - startDate;
        const prevStartDate = new Date(startDate - periodLength);
        const prevEndDate = new Date(startDate);

        const prevQuery = `
            SELECT 
                COUNT(*) as prev_orders,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as prev_revenue
            FROM orders
            WHERE created_at BETWEEN ? AND ?
        `;

        const prevResult = await DatabaseUtil.executeQuery(prevQuery, [prevStartDate, prevEndDate]);
        const prevSummary = prevResult.data[0];

        // Calculate growth
        const orderGrowth = prevSummary.prev_orders > 0 
            ? ((summary.total_orders - prevSummary.prev_orders) / prevSummary.prev_orders * 100).toFixed(2)
            : 0;

        const revenueGrowth = prevSummary.prev_revenue > 0
            ? ((summary.total_revenue - prevSummary.prev_revenue) / prevSummary.prev_revenue * 100).toFixed(2)
            : 0;

        res.json(ResponseFormatter.success('Sales summary fetched successfully', {
            period: {
                start: startDate,
                end: endDate
            },
            metrics: {
                total_orders: summary.total_orders,
                delivered_orders: summary.delivered_orders,
                pending_orders: summary.pending_orders,
                cancelled_orders: summary.cancelled_orders,
                total_revenue: parseFloat(summary.total_revenue || 0).toFixed(2),
                avg_order_value: parseFloat(summary.avg_order_value || 0).toFixed(2),
                total_subtotal: parseFloat(summary.total_subtotal || 0).toFixed(2),
                total_tax: parseFloat(summary.total_tax || 0).toFixed(2),
                total_shipping: parseFloat(summary.total_shipping || 0).toFixed(2),
                total_discounts: parseFloat(summary.total_discounts || 0).toFixed(2)
            },
            growth: {
                orders: parseFloat(orderGrowth),
                revenue: parseFloat(revenueGrowth)
            }
        }));

    } catch (error) {
        console.error('Error fetching sales summary:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/revenue-trend
 * Revenue over time
 */
router.get('/revenue-trend', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date, group_by = 'day' } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        let dateFormat;
        switch (group_by) {
            case 'hour':
                dateFormat = '%Y-%m-%d %H:00:00';
                break;
            case 'day':
                dateFormat = '%Y-%m-%d';
                break;
            case 'week':
                dateFormat = '%Y-W%u';
                break;
            case 'month':
                dateFormat = '%Y-%m';
                break;
            default:
                dateFormat = '%Y-%m-%d';
        }

        const query = `
            SELECT 
                DATE_FORMAT(created_at, ?) as period,
                COUNT(*) as order_count,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as revenue,
                AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE NULL END) as avg_order_value
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            GROUP BY period
            ORDER BY period ASC
        `;

        const result = await DatabaseUtil.executeQuery(query, [dateFormat, startDate, endDate]);

        res.json(ResponseFormatter.success('Revenue trend fetched successfully', {
            period: {
                start: startDate,
                end: endDate,
                group_by
            },
            data: result.data.map(row => ({
                period: row.period,
                order_count: row.order_count,
                revenue: parseFloat(row.revenue || 0).toFixed(2),
                avg_order_value: parseFloat(row.avg_order_value || 0).toFixed(2)
            }))
        }));

    } catch (error) {
        console.error('Error fetching revenue trend:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/top-products
 * Best selling products
 */
router.get('/top-products', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date, limit = 10 } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);
        const rowLimit = safeLimit(limit, 10);

        const query = `
            SELECT
                p.id,
                p.name,
                p.slug,
                p.base_price,
                COUNT(oi.id) as times_sold,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                AVG(CASE WHEN pr.rating IS NOT NULL THEN pr.rating ELSE NULL END) as avg_rating,
                COUNT(DISTINCT pr.id) as review_count
            FROM products p
            INNER JOIN order_items oi ON p.id = oi.product_id
            INNER JOIN orders o ON oi.order_id = o.id
            LEFT JOIN product_reviews pr ON p.id = pr.product_id AND pr.is_approved = 1
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            GROUP BY p.id, p.name, p.slug, p.base_price
            ORDER BY total_revenue DESC
            LIMIT ${rowLimit}
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);

        res.json(ResponseFormatter.success('Top products fetched successfully', {
            period: {
                start: startDate,
                end: endDate
            },
            products: DatabaseUtil.rows(result).map(row => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                base_price: parseFloat(row.base_price).toFixed(2),
                times_sold: row.times_sold,
                total_quantity: row.total_quantity,
                total_revenue: parseFloat(row.total_revenue || 0).toFixed(2),
                avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
                review_count: row.review_count
            }))
        }));

    } catch (error) {
        console.error('Error fetching top products:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/customer-stats
 * Customer analytics
 */
router.get('/customer-stats', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        // New customers
        const newCustomersQuery = `
            SELECT COUNT(*) as new_customers
            FROM users
            WHERE role = 'customer' AND created_at BETWEEN ? AND ?
        `;

        const newCustomersResult = await DatabaseUtil.executeQuery(newCustomersQuery, [startDate, endDate]);

        // Repeat customers
        const repeatCustomersQuery = `
            SELECT COUNT(DISTINCT user_id) as repeat_customers
            FROM (
                SELECT user_id, COUNT(*) as order_count
                FROM orders
                WHERE created_at BETWEEN ? AND ?
                AND status NOT IN ('cancelled', 'refunded')
                GROUP BY user_id
                HAVING order_count > 1
            ) as repeat_buyers
        `;

        const repeatCustomersResult = await DatabaseUtil.executeQuery(repeatCustomersQuery, [startDate, endDate]);

        // Total customers with orders
        const activeCustomersQuery = `
            SELECT COUNT(DISTINCT user_id) as active_customers
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            AND status NOT IN ('cancelled', 'refunded')
        `;

        const activeCustomersResult = await DatabaseUtil.executeQuery(activeCustomersQuery, [startDate, endDate]);

        // Customer lifetime value (top 10)
        const lifetimeValueQuery = `
            SELECT 
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) as name,
                COUNT(o.id) as total_orders,
                SUM(o.total_amount) as lifetime_value,
                MAX(o.created_at) as last_order_date
            FROM users u
            INNER JOIN orders o ON u.id = o.user_id
            WHERE o.status NOT IN ('cancelled', 'refunded')
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY lifetime_value DESC
            LIMIT 10
        `;

        const lifetimeValueResult = await DatabaseUtil.executeQuery(lifetimeValueQuery);

        res.json(ResponseFormatter.success('Customer stats fetched successfully', {
            period: {
                start: startDate,
                end: endDate
            },
            metrics: {
                new_customers: newCustomersResult.data[0].new_customers,
                active_customers: activeCustomersResult.data[0].active_customers,
                repeat_customers: repeatCustomersResult.data[0].repeat_customers,
                retention_rate: activeCustomersResult.data[0].active_customers > 0
                    ? (repeatCustomersResult.data[0].repeat_customers / activeCustomersResult.data[0].active_customers * 100).toFixed(2)
                    : 0
            },
            top_customers: lifetimeValueResult.data.map(row => ({
                id: row.id,
                name: row.name,
                total_orders: row.total_orders,
                lifetime_value: parseFloat(row.lifetime_value).toFixed(2),
                last_order_date: row.last_order_date
            }))
        }));

    } catch (error) {
        console.error('Error fetching customer stats:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/inventory-status
 * Inventory and stock analytics
 */
router.get('/inventory-status', protect, admin, async (req, res) => {
    try {
        // Overall inventory stats
        // Stock lives in the `inventory` table (per variant); products has no
        // stock_quantity/is_active — "live" products are status = 'approved'.
        const statsQuery = `
            SELECT
                COUNT(DISTINCT p.id) as total_products,
                COALESCE(SUM(i.quantity_available), 0) as total_stock,
                SUM(CASE WHEN i.quantity_available <= i.reorder_point THEN 1 ELSE 0 END) as low_stock_items,
                SUM(CASE WHEN i.quantity_available = 0 THEN 1 ELSE 0 END) as out_of_stock_items,
                AVG(i.quantity_available) as avg_stock_per_product
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.status = 'approved'
        `;

        const statsResult = await DatabaseUtil.executeQuery(statsQuery);

        // Low stock products
        const lowStockQuery = `
            SELECT
                p.id,
                p.name,
                p.sku,
                i.quantity_available AS stock_quantity,
                i.reorder_point AS low_stock_threshold,
                p.base_price
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.status = 'approved'
            AND i.quantity_available <= i.reorder_point
            ORDER BY i.quantity_available ASC
            LIMIT 20
        `;

        const lowStockResult = await DatabaseUtil.executeQuery(lowStockQuery);

        // Stock value
        // No cost_price column exists; report retail value from base_price and
        // leave cost value at 0 rather than querying a phantom column.
        const valueQuery = `
            SELECT
                0 as total_cost_value,
                COALESCE(SUM(i.quantity_available * p.base_price), 0) as total_retail_value
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.status = 'approved'
        `;

        const valueResult = await DatabaseUtil.executeQuery(valueQuery);

        res.json(ResponseFormatter.success('Inventory status fetched successfully', {
            overview: {
                total_products: statsResult.data[0].total_products,
                total_stock: statsResult.data[0].total_stock,
                low_stock_items: statsResult.data[0].low_stock_items,
                out_of_stock_items: statsResult.data[0].out_of_stock_items,
                avg_stock_per_product: parseFloat(statsResult.data[0].avg_stock_per_product || 0).toFixed(2),
                total_cost_value: parseFloat(valueResult.data[0].total_cost_value || 0).toFixed(2),
                total_retail_value: parseFloat(valueResult.data[0].total_retail_value || 0).toFixed(2)
            },
            low_stock_products: lowStockResult.data.map(row => ({
                id: row.id,
                name: row.name,
                sku: row.sku,
                stock_quantity: row.stock_quantity,
                low_stock_threshold: row.low_stock_threshold,
                base_price: parseFloat(row.base_price).toFixed(2)
            }))
        }));

    } catch (error) {
        console.error('Error fetching inventory status:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/revenue-by-category
 * Revenue breakdown by category
 */
router.get('/revenue-by-category', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        const query = `
            SELECT
                c.name as category_name,
                COUNT(DISTINCT oi.product_id) as product_count,
                COUNT(oi.id) as items_sold,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                AVG(oi.unit_price) as avg_price
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            INNER JOIN products p ON oi.product_id = p.id
            INNER JOIN categories c ON p.category_id = c.id
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            AND c.name IS NOT NULL
            GROUP BY c.name
            ORDER BY total_revenue DESC
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);

        const total_revenue = DatabaseUtil.rows(result).reduce((sum, row) => sum + parseFloat(row.total_revenue || 0), 0);

        res.json(ResponseFormatter.success('Revenue by category fetched successfully', {
            period: {
                start: startDate,
                end: endDate
            },
            total_revenue: total_revenue.toFixed(2),
            categories: DatabaseUtil.rows(result).map(row => ({
                category: row.category_name,
                product_count: row.product_count,
                items_sold: row.items_sold,
                total_quantity: row.total_quantity,
                total_revenue: parseFloat(row.total_revenue || 0).toFixed(2),
                avg_price: parseFloat(row.avg_price || 0).toFixed(2),
                percentage: total_revenue > 0 ? ((row.total_revenue / total_revenue) * 100).toFixed(2) : 0
            }))
        }));

    } catch (error) {
        console.error('Error fetching revenue by category:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/revenue-vs-target
 * Monthly revenue for the trailing N months (default 12) compared against a
 * data-derived target. There is no revenue_targets table, so the target is
 * computed analytically: the mean monthly revenue across ACTIVE months (months
 * that had at least one non-cancelled/refunded order) inside the window. Each
 * month is then classified above / on / below target using a +/-5% band.
 * Serves both the Analytics "Revenue by month vs target" bar chart and the
 * Revenue Drivers "Revenue vs target" line chart.
 */
router.get('/revenue-vs-target', protect, admin, async (req, res) => {
    try {
        const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 24);
        const now = new Date();
        // Window start: first day of the month, (months-1) months back.
        const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

        const query = `
            SELECT
                DATE_FORMAT(created_at, '%Y-%m') as ym,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN 1 END) as order_count
            FROM orders
            WHERE created_at >= ? AND created_at <= ?
            GROUP BY ym
            ORDER BY ym ASC
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, now]);
        const byMonth = new Map(DatabaseUtil.rows(result).map(r => [r.ym, r]));

        const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Build a continuous month series so gaps render as zero (real, not mock).
        const series = [];
        for (let i = 0; i < months; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const row = byMonth.get(ym);
            series.push({
                ym,
                label: MONTH_LABELS[d.getMonth()],
                year: d.getFullYear(),
                revenue: parseFloat(row ? row.revenue || 0 : 0),
                order_count: row ? Number(row.order_count) : 0
            });
        }

        const active = series.filter(s => s.revenue > 0);
        const target = active.length ? active.reduce((s, x) => s + x.revenue, 0) / active.length : 0;
        const band = 0.05;
        const vsAvg = v => (target > 0 ? ((v - target) / target) * 100 : 0);

        const outSeries = series.map(s => ({
            ym: s.ym,
            label: s.label,
            year: s.year,
            revenue: s.revenue.toFixed(2),
            order_count: s.order_count,
            target: target.toFixed(2),
            status: target === 0
                ? 'none'
                : (s.revenue >= target * (1 + band) ? 'above' : (s.revenue <= target * (1 - band) ? 'below' : 'on'))
        }));

        let peak = null;
        let trough = null;
        if (active.length) {
            const sorted = [...active].sort((a, b) => a.revenue - b.revenue);
            trough = sorted[0];
            peak = sorted[sorted.length - 1];
        }

        // Year-to-date actual vs a pro-rated target (target * active months this year).
        const curYear = now.getFullYear();
        const ytdMonths = series.filter(s => s.year === curYear);
        const ytdActiveCount = ytdMonths.filter(s => s.revenue > 0).length;
        const ytdActual = ytdMonths.reduce((s, x) => s + x.revenue, 0);
        const ytdTarget = target * ytdActiveCount;

        res.json(ResponseFormatter.success('Revenue vs target fetched successfully', {
            months,
            target: target.toFixed(2),
            target_basis: 'Mean monthly revenue across active months in the trailing window (no revenue_targets table exists; baseline is self-referential). On-target band = +/-5%.',
            series: outSeries,
            summary: {
                above_count: outSeries.filter(s => s.status === 'above').length,
                on_count: outSeries.filter(s => s.status === 'on').length,
                below_count: outSeries.filter(s => s.status === 'below').length,
                peak: peak ? { label: peak.label, ym: peak.ym, revenue: peak.revenue.toFixed(2), vs_avg_pct: vsAvg(peak.revenue).toFixed(1) } : null,
                trough: trough ? { label: trough.label, ym: trough.ym, revenue: trough.revenue.toFixed(2), vs_avg_pct: vsAvg(trough.revenue).toFixed(1) } : null,
                ytd_actual: ytdActual.toFixed(2),
                ytd_target: ytdTarget.toFixed(2),
                ytd_variance_pct: (ytdTarget > 0 ? ((ytdActual - ytdTarget) / ytdTarget) * 100 : 0).toFixed(1)
            }
        }));

    } catch (error) {
        console.error('Error fetching revenue vs target:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/revenue-by-weekday
 * Share of revenue by day of week over the selected period. Highlights the
 * best and slowest day and the weekend (Sat+Sun) revenue share.
 * Tables/columns: orders(created_at, total_amount, status).
 */
router.get('/revenue-by-weekday', protect, admin, async (req, res) => {
    try {
        const { period = 'year', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        // MySQL DAYOFWEEK(): 1 = Sunday ... 7 = Saturday.
        const query = `
            SELECT
                DAYOFWEEK(created_at) as dow,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN 1 END) as order_count
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            GROUP BY dow
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);
        const byDow = new Map(DatabaseUtil.rows(result).map(r => [Number(r.dow), r]));

        const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = [];
        for (let dow = 1; dow <= 7; dow++) {
            const row = byDow.get(dow);
            days.push({
                dow,
                label: DAY_LABELS[dow - 1],
                revenue: parseFloat(row ? row.revenue || 0 : 0),
                order_count: row ? Number(row.order_count) : 0
            });
        }

        const totalRevenue = days.reduce((s, d) => s + d.revenue, 0);
        const withShare = days.map(d => ({
            dow: d.dow,
            label: d.label,
            revenue: d.revenue.toFixed(2),
            order_count: d.order_count,
            share_pct: totalRevenue > 0 ? ((d.revenue / totalRevenue) * 100).toFixed(1) : '0.0'
        }));

        const nonZero = days.filter(d => d.revenue > 0);
        const sorted = [...nonZero].sort((a, b) => a.revenue - b.revenue);
        const best = sorted.length ? sorted[sorted.length - 1] : null;
        const worst = sorted.length ? sorted[0] : null;
        const weekendRevenue = days.filter(d => d.dow === 1 || d.dow === 7).reduce((s, d) => s + d.revenue, 0);

        res.json(ResponseFormatter.success('Revenue by weekday fetched successfully', {
            period: { start: startDate, end: endDate },
            total_revenue: totalRevenue.toFixed(2),
            days: withShare,
            best_day: best ? { label: best.label, share_pct: totalRevenue > 0 ? ((best.revenue / totalRevenue) * 100).toFixed(1) : '0.0' } : null,
            worst_day: worst ? { label: worst.label, share_pct: totalRevenue > 0 ? ((worst.revenue / totalRevenue) * 100).toFixed(1) : '0.0' } : null,
            weekend_share_pct: totalRevenue > 0 ? ((weekendRevenue / totalRevenue) * 100).toFixed(1) : '0.0'
        }));

    } catch (error) {
        console.error('Error fetching revenue by weekday:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/bottom-products
 * Worst-selling products (lowest revenue among products that DID sell) over the
 * period. Mirror of /top-products but ordered ascending. Tables/columns:
 * products, order_items(quantity, total_price), orders, product_reviews(is_approved).
 */
router.get('/bottom-products', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date, limit = 5 } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);
        const rowLimit = safeLimit(limit, 5);

        const query = `
            SELECT
                p.id,
                p.name,
                p.slug,
                p.base_price,
                COUNT(oi.id) as times_sold,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                AVG(CASE WHEN pr.rating IS NOT NULL THEN pr.rating ELSE NULL END) as avg_rating,
                COUNT(DISTINCT pr.id) as review_count
            FROM products p
            INNER JOIN order_items oi ON p.id = oi.product_id
            INNER JOIN orders o ON oi.order_id = o.id
            LEFT JOIN product_reviews pr ON p.id = pr.product_id AND pr.is_approved = 1
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            GROUP BY p.id, p.name, p.slug, p.base_price
            ORDER BY total_revenue ASC
            LIMIT ${rowLimit}
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);

        res.json(ResponseFormatter.success('Bottom products fetched successfully', {
            period: { start: startDate, end: endDate },
            products: DatabaseUtil.rows(result).map(row => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                base_price: parseFloat(row.base_price).toFixed(2),
                times_sold: row.times_sold,
                total_quantity: row.total_quantity,
                total_revenue: parseFloat(row.total_revenue || 0).toFixed(2),
                avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
                review_count: row.review_count
            }))
        }));

    } catch (error) {
        console.error('Error fetching bottom products:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/conversion-funnel
 * Purchase funnel built ONLY from real backend stages (there is no web-traffic
 * / page-view table, so "visitors" and "product views" stages are intentionally
 * omitted). Stages, all within the period:
 *   1. Shopping carts   - shopping_carts (a shopping session that started a cart)
 *   2. Orders placed     - orders (status != cancelled) -> reached checkout
 *   3. Paid orders       - orders with a payments row of status 'completed'
 *   4. Delivered         - orders with status 'delivered' (fulfilled)
 */
router.get('/conversion-funnel', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        const cartsQ = `SELECT COUNT(*) as n FROM shopping_carts WHERE created_at BETWEEN ? AND ?`;
        const placedQ = `SELECT COUNT(*) as n FROM orders WHERE created_at BETWEEN ? AND ? AND status NOT IN ('cancelled')`;
        const paidQ = `
            SELECT COUNT(DISTINCT o.id) as n
            FROM orders o
            INNER JOIN payments pay ON pay.order_id = o.id AND pay.status = 'completed'
            WHERE o.created_at BETWEEN ? AND ?`;
        const deliveredQ = `SELECT COUNT(*) as n FROM orders WHERE created_at BETWEEN ? AND ? AND status = 'delivered'`;

        const [cartsR, placedR, paidR, deliveredR] = await Promise.all([
            DatabaseUtil.executeQuery(cartsQ, [startDate, endDate]),
            DatabaseUtil.executeQuery(placedQ, [startDate, endDate]),
            DatabaseUtil.executeQuery(paidQ, [startDate, endDate]),
            DatabaseUtil.executeQuery(deliveredQ, [startDate, endDate])
        ]);

        const val = r => Number((DatabaseUtil.rows(r)[0] || {}).n || 0);
        const raw = [
            { key: 'carts', label: 'Shopping carts', count: val(cartsR) },
            { key: 'orders', label: 'Orders placed', count: val(placedR) },
            { key: 'paid', label: 'Paid orders', count: val(paidR) },
            { key: 'delivered', label: 'Delivered', count: val(deliveredR) }
        ];

        const top = raw[0].count;
        const stages = raw.map((s, i) => {
            const prev = i > 0 ? raw[i - 1].count : null;
            const dropCount = prev !== null ? prev - s.count : 0;
            return {
                key: s.key,
                label: s.label,
                count: s.count,
                pct_of_top: top > 0 ? ((s.count / top) * 100).toFixed(1) : '0.0',
                drop_from_prev_pct: prev && prev > 0 ? ((dropCount / prev) * 100).toFixed(1) : null,
                drop_from_prev_count: prev !== null ? dropCount : null
            };
        });

        // Biggest absolute drop-off between consecutive stages.
        let biggestDrop = null;
        for (let i = 1; i < raw.length; i++) {
            const dropCount = raw[i - 1].count - raw[i].count;
            if (!biggestDrop || dropCount > biggestDrop.drop_count) {
                biggestDrop = {
                    from: raw[i - 1].label,
                    to: raw[i].label,
                    drop_count: dropCount,
                    drop_pct: raw[i - 1].count > 0 ? ((dropCount / raw[i - 1].count) * 100).toFixed(1) : '0.0'
                };
            }
        }

        res.json(ResponseFormatter.success('Conversion funnel fetched successfully', {
            period: { start: startDate, end: endDate },
            stages,
            overall_conversion_pct: top > 0 ? ((val(paidR) / top) * 100).toFixed(1) : '0.0',
            biggest_drop: biggestDrop,
            note: 'Funnel uses real backend stages only. Upstream web-traffic stages (visitors, product views) are not tracked in the database and are intentionally excluded.'
        }));

    } catch (error) {
        console.error('Error fetching conversion funnel:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/new-vs-returning
 * Revenue split between first-time and repeat customers over the period, plus
 * lifetime retention metrics. An order is "new" when it is that customer's
 * first-ever non-cancelled order (guest orders, user_id NULL, count as new).
 * Tables/columns: orders(user_id, total_amount, status, created_at).
 */
router.get('/new-vs-returning', protect, admin, async (req, res) => {
    try {
        const { period = 'year', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);

        const splitQuery = `
            SELECT
                COALESCE(SUM(CASE WHEN rn = 1 THEN total_amount ELSE 0 END), 0) as new_revenue,
                COALESCE(SUM(CASE WHEN rn > 1 THEN total_amount ELSE 0 END), 0) as returning_revenue,
                SUM(CASE WHEN rn = 1 THEN 1 ELSE 0 END) as new_orders,
                SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END) as returning_orders
            FROM (
                SELECT o.id, o.total_amount, o.created_at,
                    CASE WHEN o.user_id IS NULL THEN 1
                         ELSE ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.created_at ASC)
                    END as rn
                FROM orders o
                WHERE o.status NOT IN ('cancelled', 'refunded')
            ) t
            WHERE t.created_at BETWEEN ? AND ?
        `;

        // Lifetime customer metrics (registered customers only).
        const metricsQuery = `
            SELECT
                COUNT(DISTINCT user_id) as customers,
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            WHERE status NOT IN ('cancelled', 'refunded') AND user_id IS NOT NULL
        `;
        const repeatQuery = `
            SELECT COUNT(*) as n FROM (
                SELECT user_id FROM orders
                WHERE status NOT IN ('cancelled', 'refunded') AND user_id IS NOT NULL
                GROUP BY user_id HAVING COUNT(*) > 1
            ) x
        `;

        const [splitR, metricsR, repeatR] = await Promise.all([
            DatabaseUtil.executeQuery(splitQuery, [startDate, endDate]),
            DatabaseUtil.executeQuery(metricsQuery),
            DatabaseUtil.executeQuery(repeatQuery)
        ]);

        const split = DatabaseUtil.rows(splitR)[0] || {};
        const metrics = DatabaseUtil.rows(metricsR)[0] || {};
        const repeatCustomers = Number((DatabaseUtil.rows(repeatR)[0] || {}).n || 0);

        const newRev = parseFloat(split.new_revenue || 0);
        const retRev = parseFloat(split.returning_revenue || 0);
        const totalRev = newRev + retRev;
        const customers = Number(metrics.customers || 0);
        const orders = Number(metrics.orders || 0);
        const lifetimeRevenue = parseFloat(metrics.revenue || 0);

        res.json(ResponseFormatter.success('New vs returning fetched successfully', {
            period: { start: startDate, end: endDate },
            split: {
                new_revenue: newRev.toFixed(2),
                returning_revenue: retRev.toFixed(2),
                new_orders: Number(split.new_orders || 0),
                returning_orders: Number(split.returning_orders || 0),
                new_share_pct: totalRev > 0 ? ((newRev / totalRev) * 100).toFixed(1) : '0.0',
                returning_share_pct: totalRev > 0 ? ((retRev / totalRev) * 100).toFixed(1) : '0.0'
            },
            metrics: {
                total_customers: customers,
                repeat_customers: repeatCustomers,
                repeat_purchase_rate_pct: customers > 0 ? ((repeatCustomers / customers) * 100).toFixed(1) : '0.0',
                avg_orders_per_customer: customers > 0 ? (orders / customers).toFixed(1) : '0.0',
                customer_lifetime_value: customers > 0 ? (lifetimeRevenue / customers).toFixed(2) : '0.00'
            }
        }));

    } catch (error) {
        console.error('Error fetching new vs returning:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/analytics/revenue-shortfall
 * "What's driving the change" — compares the selected period against the
 * immediately preceding equal-length period and decomposes the revenue delta
 * into drivers that CAN be backed by order data:
 *   - Order volume effect  = (dOrders) * prev AOV
 *   - Avg order value effect = (dAOV) * current orders   (volume + AOV = dRevenue)
 * plus a customer-type split (new vs returning revenue delta).
 * Design drivers "site traffic" and "email revenue" are intentionally omitted
 * (no traffic / channel-attribution tables exist). This endpoint's
 * change.revenue_pct / change.orders_pct are the period-over-period figures the
 * dashboard KPI badges should use.
 */
router.get('/revenue-shortfall', protect, admin, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;
        const { startDate, endDate } = getDateRange(period, start_date, end_date);
        const periodLength = endDate - startDate;
        const prevStart = new Date(startDate - periodLength);
        const prevEnd = new Date(startDate);

        const aggQuery = `
            SELECT
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(SUM(CASE WHEN rn = 1 THEN total_amount ELSE 0 END), 0) as new_revenue,
                COALESCE(SUM(CASE WHEN rn > 1 THEN total_amount ELSE 0 END), 0) as returning_revenue
            FROM (
                SELECT o.id, o.total_amount, o.created_at,
                    CASE WHEN o.user_id IS NULL THEN 1
                         ELSE ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.created_at ASC)
                    END as rn
                FROM orders o
                WHERE o.status NOT IN ('cancelled', 'refunded')
            ) t
            WHERE t.created_at BETWEEN ? AND ?
        `;

        const [curR, prevR] = await Promise.all([
            DatabaseUtil.executeQuery(aggQuery, [startDate, endDate]),
            DatabaseUtil.executeQuery(aggQuery, [prevStart, prevEnd])
        ]);

        const shape = row => {
            const orders = Number(row.orders || 0);
            const revenue = parseFloat(row.revenue || 0);
            return {
                orders,
                revenue,
                aov: orders > 0 ? revenue / orders : 0,
                new_revenue: parseFloat(row.new_revenue || 0),
                returning_revenue: parseFloat(row.returning_revenue || 0)
            };
        };

        const cur = shape(DatabaseUtil.rows(curR)[0] || {});
        const prev = shape(DatabaseUtil.rows(prevR)[0] || {});

        const deltaRevenue = cur.revenue - prev.revenue;
        const volumeEffect = (cur.orders - prev.orders) * prev.aov;
        const aovEffect = (cur.aov - prev.aov) * cur.orders;
        const newEffect = cur.new_revenue - prev.new_revenue;
        const returningEffect = cur.returning_revenue - prev.returning_revenue;
        const pctOfPrev = v => (prev.revenue > 0 ? (v / prev.revenue) * 100 : 0);

        const drivers = [
            { key: 'volume', label: 'Order volume', value: volumeEffect.toFixed(2), pct: pctOfPrev(volumeEffect).toFixed(1), direction: volumeEffect >= 0 ? 'up' : 'down' },
            { key: 'aov', label: 'Average order value', value: aovEffect.toFixed(2), pct: pctOfPrev(aovEffect).toFixed(1), direction: aovEffect >= 0 ? 'up' : 'down' }
        ].sort((a, b) => Math.abs(parseFloat(b.value)) - Math.abs(parseFloat(a.value)));

        const customerMix = [
            { key: 'new', label: 'New-customer revenue', value: newEffect.toFixed(2), pct: pctOfPrev(newEffect).toFixed(1), direction: newEffect >= 0 ? 'up' : 'down' },
            { key: 'returning', label: 'Returning-customer revenue', value: returningEffect.toFixed(2), pct: pctOfPrev(returningEffect).toFixed(1), direction: returningEffect >= 0 ? 'up' : 'down' }
        ];

        // Data-driven takeaway.
        const rising = deltaRevenue >= 0;
        const lead = drivers[0];
        const takeaway = prev.revenue === 0 && cur.revenue === 0
            ? 'No revenue in either period to compare.'
            : `Revenue ${rising ? 'grew' : 'fell'} ${Math.abs(pctOfPrev(deltaRevenue)).toFixed(1)}% vs the prior period, driven mostly by ${lead.label.toLowerCase()} (${lead.direction === 'up' ? '+' : '-'}${Math.abs(parseFloat(lead.pct)).toFixed(1)}%). ${aovEffect >= 0 && volumeEffect < 0 ? 'Basket size held up while order volume softened.' : (volumeEffect >= 0 && aovEffect < 0 ? 'Order volume held up while basket size softened.' : '')}`.trim();

        res.json(ResponseFormatter.success('Revenue shortfall analysis fetched successfully', {
            period: {
                current: { start: startDate, end: endDate },
                previous: { start: prevStart, end: prevEnd }
            },
            current: { orders: cur.orders, revenue: cur.revenue.toFixed(2), aov: cur.aov.toFixed(2), new_revenue: cur.new_revenue.toFixed(2), returning_revenue: cur.returning_revenue.toFixed(2) },
            previous: { orders: prev.orders, revenue: prev.revenue.toFixed(2), aov: prev.aov.toFixed(2), new_revenue: prev.new_revenue.toFixed(2), returning_revenue: prev.returning_revenue.toFixed(2) },
            change: {
                revenue: deltaRevenue.toFixed(2),
                revenue_pct: pctOfPrev(deltaRevenue).toFixed(1),
                orders_pct: prev.orders > 0 ? (((cur.orders - prev.orders) / prev.orders) * 100).toFixed(1) : '0.0',
                aov_pct: prev.aov > 0 ? (((cur.aov - prev.aov) / prev.aov) * 100).toFixed(1) : '0.0'
            },
            drivers,
            customer_mix: customerMix,
            takeaway
        }));

    } catch (error) {
        console.error('Error fetching revenue shortfall:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

module.exports = router;
