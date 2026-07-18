/**
 * CSV Exporter Utility
 * Handles exporting data to CSV format
 */

const Papa = require('papaparse');

class CSVExporter {
    /**
     * Neutralize CSV formula injection ("CSV injection"). A cell whose text
     * begins with =, +, -, @, or a leading tab / carriage return can be
     * executed as a formula by Excel / Google Sheets / LibreOffice when the
     * exported file is opened. Prefixing such a value with a single quote forces
     * the spreadsheet to treat it as literal text. Non-string values (numbers,
     * booleans, null) are returned unchanged.
     * @param {*} value - raw cell value
     * @returns {*} sanitized value
     */
    static sanitizeCell(value) {
        if (typeof value !== 'string' || value.length === 0) {
            return value;
        }
        // eslint-disable-next-line no-control-regex
        if (/^[=+\-@\t\r]/.test(value)) {
            return `'${value}`;
        }
        return value;
    }

    /**
     * Export data to CSV string
     * @param {Array} data - Array of objects to export
     * @param {Array} fields - Fields to include (optional, defaults to all)
     * @returns {string} CSV content
     */
    static export(data, fields = null) {
        const config = {
            quotes: true,
            quoteChar: '"',
            escapeChar: '"',
            delimiter: ",",
            header: true,
            newline: "\r\n"
        };

        if (fields) {
            config.columns = fields;
        }

        // Sanitize every exported cell value against formula injection. This is
        // the single choke point all exportX() helpers funnel through, so every
        // export (orders, products, customers, analytics) is covered.
        const safeData = Array.isArray(data)
            ? data.map((row) => {
                if (!row || typeof row !== 'object') {
                    return CSVExporter.sanitizeCell(row);
                }
                const clean = {};
                for (const [key, val] of Object.entries(row)) {
                    clean[key] = CSVExporter.sanitizeCell(val);
                }
                return clean;
            })
            : data;

        return Papa.unparse(safeData, config);
    }

    /**
     * Export orders to CSV
     * @param {Array} orders - Orders data from database
     * @returns {string} CSV content
     */
    static exportOrders(orders) {
        const fields = [
            'id',
            'order_number',
            'user_email',
            'status',
            'payment_status',
            'subtotal',
            'discount_amount',
            'tax_amount',
            'shipping_amount',
            'total',
            'created_at',
            'shipped_at',
            'delivered_at'
        ];

        const formattedData = orders.map(order => ({
            id: order.id,
            order_number: order.order_number,
            user_email: order.user_email || 'Guest',
            status: order.status,
            payment_status: order.payment_status,
            subtotal: parseFloat(order.subtotal).toFixed(2),
            discount_amount: parseFloat(order.discount_amount || 0).toFixed(2),
            tax_amount: parseFloat(order.tax_amount || 0).toFixed(2),
            shipping_amount: parseFloat(order.shipping_amount || 0).toFixed(2),
            total: parseFloat(order.total).toFixed(2),
            created_at: order.created_at,
            shipped_at: order.shipped_at || '',
            delivered_at: order.delivered_at || ''
        }));

        return this.export(formattedData, fields);
    }

    /**
     * Export products to CSV
     * @param {Array} products - Products data from database
     * @returns {string} CSV content
     */
    static exportProducts(products) {
        const fields = [
            'id',
            'sku',
            'name',
            'slug',
            'category_name',
            'base_price',
            'sale_price',
            'stock_quantity',
            'status',
            'is_active',
            'is_featured',
            'created_at'
        ];

        const formattedData = products.map(product => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            slug: product.slug,
            category_name: product.category_name || '',
            base_price: parseFloat(product.base_price).toFixed(2),
            sale_price: product.sale_price ? parseFloat(product.sale_price).toFixed(2) : '',
            stock_quantity: product.stock_quantity,
            status: product.status,
            is_active: product.is_active ? 'Yes' : 'No',
            is_featured: product.is_featured ? 'Yes' : 'No',
            created_at: product.created_at
        }));

        return this.export(formattedData, fields);
    }

    /**
     * Export customers to CSV
     * @param {Array} customers - Customers data from database
     * @returns {string} CSV content
     */
    static exportCustomers(customers) {
        const fields = [
            'id',
            'email',
            'first_name',
            'last_name',
            'phone',
            'status',
            'email_verified',
            'total_orders',
            'lifetime_value',
            'created_at',
            'last_login'
        ];

        const formattedData = customers.map(customer => ({
            id: customer.id,
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone || '',
            status: customer.status,
            email_verified: customer.email_verified ? 'Yes' : 'No',
            total_orders: customer.total_orders || 0,
            lifetime_value: customer.lifetime_value ? parseFloat(customer.lifetime_value).toFixed(2) : '0.00',
            created_at: customer.created_at,
            last_login: customer.last_login || ''
        }));

        return this.export(formattedData, fields);
    }

    /**
     * Export analytics data to CSV
     * @param {Array} data - Analytics data
     * @param {string} type - Type of analytics (sales, products, customers)
     * @returns {string} CSV content
     */
    static exportAnalytics(data, type) {
        switch (type) {
            case 'sales':
                return this.export(data.map(row => ({
                    period: row.period,
                    order_count: row.order_count,
                    revenue: parseFloat(row.revenue || 0).toFixed(2),
                    avg_order_value: parseFloat(row.avg_order_value || 0).toFixed(2)
                })));

            case 'products':
                return this.export(data.map(row => ({
                    product_name: row.name,
                    times_sold: row.times_sold,
                    total_quantity: row.total_quantity,
                    total_revenue: parseFloat(row.total_revenue || 0).toFixed(2),
                    avg_rating: row.avg_rating || 'N/A'
                })));

            case 'customers':
                return this.export(data);

            default:
                return this.export(data);
        }
    }

    /**
     * Set response headers for CSV download
     * @param {object} res - Express response object
     * @param {string} filename - Download filename
     */
    static setDownloadHeaders(res, filename) {
        const timestamp = new Date().toISOString().split('T')[0];
        const fullFilename = `${filename}_${timestamp}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fullFilename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
    }
}

module.exports = CSVExporter;
