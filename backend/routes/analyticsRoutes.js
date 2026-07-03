const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');

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
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE 0 END) as total_revenue,
                AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE NULL END) as avg_order_value,
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
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE 0 END) as prev_revenue
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
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE 0 END) as revenue,
                AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE NULL END) as avg_order_value
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
            LEFT JOIN product_reviews pr ON p.id = pr.product_id AND pr.status = 'approved'
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            GROUP BY p.id, p.name, p.slug, p.base_price
            ORDER BY total_revenue DESC
            LIMIT ?
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate, parseInt(limit)]);

        res.json(ResponseFormatter.success('Top products fetched successfully', {
            period: {
                start: startDate,
                end: endDate
            },
            products: result.data.map(row => ({
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
                SUM(o.total) as lifetime_value,
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
                p.category_name,
                COUNT(DISTINCT oi.product_id) as product_count,
                COUNT(oi.id) as items_sold,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                AVG(oi.unit_price) as avg_price
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            INNER JOIN products p ON oi.product_id = p.id
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            AND p.category_name IS NOT NULL
            GROUP BY p.category_name
            ORDER BY total_revenue DESC
        `;

        const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);

        const total_revenue = result.data.reduce((sum, row) => sum + parseFloat(row.total_revenue || 0), 0);

        res.json(ResponseFormatter.success('Revenue by category fetched successfully', {
            period: {
                start: startDate,
                end: endDate
            },
            total_revenue: total_revenue.toFixed(2),
            categories: result.data.map(row => ({
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

module.exports = router;
