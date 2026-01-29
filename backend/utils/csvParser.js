/**
 * CSV Parser Utility
 * Handles CSV file parsing and validation for bulk operations
 */

const Papa = require('papaparse');

class CSVParser {
    /**
     * Parse CSV file content
     * @param {string} csvContent - Raw CSV content
     * @param {object} options - Parsing options
     * @returns {Promise<object>} Parsed data with validation results
     */
    static async parse(csvContent, options = {}) {
        return new Promise((resolve, reject) => {
            Papa.parse(csvContent, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim(),
                ...options,
                complete: (results) => {
                    resolve({
                        data: results.data,
                        errors: results.errors,
                        meta: results.meta
                    });
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Validate product CSV data
     * @param {Array} data - Parsed CSV data
     * @returns {object} Validation results
     */
    static validateProducts(data) {
        const errors = [];
        const warnings = [];
        const validRows = [];

        const requiredFields = ['sku', 'name', 'base_price'];

        data.forEach((row, index) => {
            const rowNumber = index + 2; // +2 because of header and 0-index
            const rowErrors = [];
            const rowWarnings = [];

            // Check required fields
            requiredFields.forEach(field => {
                if (!row[field] || row[field].trim() === '') {
                    rowErrors.push(`Row ${rowNumber}: Missing required field '${field}'`);
                }
            });

            // Validate SKU format
            if (row.sku && !/^[A-Z0-9-]+$/.test(row.sku)) {
                rowWarnings.push(`Row ${rowNumber}: SKU should only contain uppercase letters, numbers, and hyphens`);
            }

            // Validate price
            if (row.base_price && isNaN(parseFloat(row.base_price))) {
                rowErrors.push(`Row ${rowNumber}: base_price must be a valid number`);
            }

            // Validate stock quantity
            if (row.stock_quantity && isNaN(parseInt(row.stock_quantity))) {
                rowErrors.push(`Row ${rowNumber}: stock_quantity must be a valid integer`);
            }

            // Validate status
            if (row.status && !['draft', 'active', 'discontinued'].includes(row.status.toLowerCase())) {
                rowErrors.push(`Row ${rowNumber}: status must be 'draft', 'active', or 'discontinued'`);
            }

            if (rowErrors.length === 0) {
                validRows.push({
                    ...row,
                    rowNumber,
                    warnings: rowWarnings
                });
            } else {
                errors.push(...rowErrors);
            }

            if (rowWarnings.length > 0) {
                warnings.push(...rowWarnings);
            }
        });

        return {
            valid: errors.length === 0,
            totalRows: data.length,
            validRows: validRows.length,
            errors,
            warnings,
            data: validRows
        };
    }

    /**
     * Generate CSV template for products
     * @returns {string} CSV template content
     */
    static generateProductTemplate() {
        const headers = [
            'sku',
            'name',
            'slug',
            'short_description',
            'description',
            'category_name',
            'base_price',
            'sale_price',
            'cost_price',
            'stock_quantity',
            'low_stock_threshold',
            'status',
            'is_featured',
            'meta_title',
            'meta_description',
            'material',
            'thread_count',
            'weight',
            'organic'
        ];

        const example = [
            'SILK-SHEET-001',
            '100% Mulberry Silk Sheet Set',
            'mulberry-silk-sheet-set',
            'Luxurious silk bedding for ultimate comfort',
            'Premium 100% mulberry silk sheets with 600 thread count...',
            'Sheets',
            '450.00',
            '399.00',
            '200.00',
            '50',
            '10',
            'active',
            'true',
            'Premium Mulberry Silk Sheets | Luxury Bedding',
            'Shop our 100% mulberry silk sheet sets...',
            'Silk',
            '600',
            '2.5',
            'true'
        ];

        return Papa.unparse([headers, example]);
    }

    /**
     * Transform CSV row to database-ready product object
     * @param {object} row - CSV row data
     * @returns {object} Product object for database insertion
     */
    static transformProductRow(row) {
        return {
            sku: row.sku.trim().toUpperCase(),
            name: row.name.trim(),
            slug: row.slug ? row.slug.trim() : this.slugify(row.name),
            short_description: row.short_description?.trim() || '',
            description: row.description?.trim() || '',
            category_name: row.category_name?.trim() || null,
            base_price: parseFloat(row.base_price),
            sale_price: row.sale_price ? parseFloat(row.sale_price) : null,
            cost_price: row.cost_price ? parseFloat(row.cost_price) : null,
            stock_quantity: row.stock_quantity ? parseInt(row.stock_quantity) : 0,
            low_stock_threshold: row.low_stock_threshold ? parseInt(row.low_stock_threshold) : 10,
            status: row.status ? row.status.toLowerCase() : 'draft',
            is_featured: row.is_featured === 'true' || row.is_featured === '1',
            meta_title: row.meta_title?.trim() || row.name.trim(),
            meta_description: row.meta_description?.trim() || '',
            product_details: {
                material: row.material?.trim() || null,
                thread_count: row.thread_count ? parseInt(row.thread_count) : null,
                weight: row.weight ? parseFloat(row.weight) : null,
                organic: row.organic === 'true' || row.organic === '1'
            }
        };
    }

    /**
     * Create URL-friendly slug from string
     * @param {string} text - Text to slugify
     * @returns {string} Slugified text
     */
    static slugify(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
}

module.exports = CSVParser;
