const express = require('express');
const router = express.Router();
const multer = require('multer');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const CSVParser = require('../utils/csvParser');
const CSVExporter = require('../utils/csvExporter');
const { protect, admin } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const { isOptionalString } = require('../utils/params');

// Configure multer for CSV file upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

/**
 * GET /api/admin/bulk/products/template
 * Download product CSV template
 */
router.get('/products/template', protect, admin, (req, res) => {
    try {
        const template = CSVParser.generateProductTemplate();
        
        CSVExporter.setDownloadHeaders(res, 'product_template');
        res.send(template);
    } catch (error) {
        console.error('Error generating template:', error);
        res.status(500).json(ResponseFormatter.failure('Failed to generate template', { error: error.message }));
    }
});

/**
 * POST /api/admin/bulk/products/validate
 * Validate CSV file before upload
 */
router.post('/products/validate', protect, admin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json(ResponseFormatter.failure('No file uploaded'));
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const parsed = await CSVParser.parse(csvContent);
        const validation = CSVParser.validateProducts(parsed.data);

        res.json(ResponseFormatter.success('Validation complete', {
            valid: validation.valid,
            totalRows: validation.totalRows,
            validRows: validation.validRows,
            errorCount: validation.errors.length,
            warningCount: validation.warnings.length,
            errors: validation.errors,
            warnings: validation.warnings,
            preview: validation.data.slice(0, 5) // First 5 valid rows
        }));

    } catch (error) {
        console.error('Error validating CSV:', error);
        res.status(500).json(ResponseFormatter.failure('Validation failed', { error: error.message }));
    }
});

/**
 * POST /api/admin/bulk/products/upload
 * Bulk upload products from CSV
 */
router.post('/products/upload', protect, admin, csrfProtection, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json(ResponseFormatter.failure('No file uploaded'));
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const parsed = await CSVParser.parse(csvContent);
        const validation = CSVParser.validateProducts(parsed.data);

        if (!validation.valid) {
            return res.status(400).json(ResponseFormatter.failure('Validation failed', {
                errors: validation.errors,
                warnings: validation.warnings
            }));
        }

        const results = {
            total: validation.validRows,
            successful: 0,
            failed: 0,
            errors: []
        };

        // Process each row
        for (const row of validation.data) {
            try {
                const product = CSVParser.transformProductRow(row);
                
                // Generate ID
                const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("PROD") as id');
                const productId = idResult.data[0].id;

                // Insert product
                const query = `
                    INSERT INTO products (
                        id, sku, name, slug, short_description, description,
                        category_name, base_price, sale_price, cost_price,
                        stock_quantity, low_stock_threshold, status, is_featured,
                        meta_title, meta_description, product_details,
                        created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                // executeQuery never throws: a failed INSERT must count as failed,
                // not as successful.
                const insertResult = await DatabaseUtil.executeQuery(query, [
                    productId,
                    product.sku,
                    product.name,
                    product.slug,
                    product.short_description,
                    product.description,
                    product.category_name,
                    product.base_price,
                    product.sale_price,
                    product.cost_price,
                    product.stock_quantity,
                    product.low_stock_threshold,
                    product.status,
                    product.is_featured,
                    product.meta_title,
                    product.meta_description,
                    JSON.stringify(product.product_details),
                    req.user.id
                ]);
                if (!insertResult.success) {
                    throw new Error(insertResult.error);
                }

                results.successful++;

            } catch (error) {
                results.failed++;
                results.errors.push({
                    row: row.rowNumber,
                    sku: row.sku,
                    error: error.message
                });
            }
        }

        res.status(201).json(ResponseFormatter.success('Bulk upload complete', results));

    } catch (error) {
        console.error('Error uploading products:', error);
        res.status(500).json(ResponseFormatter.failure('Upload failed', { error: error.message }));
    }
});

/**
 * GET /api/admin/bulk/orders/export
 * Export orders to CSV
 */
router.get('/orders/export', protect, admin, async (req, res) => {
    try {
        const { start_date, end_date, status } = req.query;
        // ?status[]=a / ?status[a]=b parse to arrays/objects: single values only.
        if (![start_date, end_date, status].every(isOptionalString)) {
            return res.status(400).json(ResponseFormatter.failure('Filters must be single values'));
        }

        // `o.total_amount AS total`: orders has no `total` column, and
        // exportOrders reads `order.total` (it wrote "NaN" for every order).
        let query = `
            SELECT 
                o.*,
                o.total_amount AS total,
                u.email as user_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            query += ' AND o.created_at >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND o.created_at <= ?';
            params.push(end_date);
        }

        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }

        query += ' ORDER BY o.created_at DESC';

        const result = await DatabaseUtil.executeQuery(query, params);
        const csv = CSVExporter.exportOrders(result.data);

        CSVExporter.setDownloadHeaders(res, 'orders');
        res.send(csv);

    } catch (error) {
        console.error('Error exporting orders:', error);
        res.status(500).json(ResponseFormatter.failure('Export failed', { error: error.message }));
    }
});

/**
 * GET /api/admin/bulk/products/export
 * Export products to CSV
 */
router.get('/products/export', protect, admin, async (req, res) => {
    try {
        const { category, status } = req.query;
        if (![category, status].every(isOptionalString)) {
            return res.status(400).json(ResponseFormatter.failure('Filters must be single values'));
        }

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            query += ' AND category_name = ?';
            params.push(category);
        }

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const result = await DatabaseUtil.executeQuery(query, params);
        const csv = CSVExporter.exportProducts(result.data);

        CSVExporter.setDownloadHeaders(res, 'products');
        res.send(csv);

    } catch (error) {
        console.error('Error exporting products:', error);
        res.status(500).json(ResponseFormatter.failure('Export failed', { error: error.message }));
    }
});

/**
 * GET /api/admin/bulk/customers/export
 * Export customers to CSV
 */
router.get('/customers/export', protect, admin, async (req, res) => {
    try {
        // `o.total_amount`: orders has no `total` column (the query used to fail,
        // so this export always answered 500).
        const query = `
            SELECT 
                u.*,
                COUNT(o.id) as total_orders,
                SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total_amount ELSE 0 END) as lifetime_value
            FROM users u
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.role = 'customer'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `;

        const result = await DatabaseUtil.executeQuery(query);
        const csv = CSVExporter.exportCustomers(result.data);

        CSVExporter.setDownloadHeaders(res, 'customers');
        res.send(csv);

    } catch (error) {
        console.error('Error exporting customers:', error);
        res.status(500).json(ResponseFormatter.failure('Export failed', { error: error.message }));
    }
});

module.exports = router;
