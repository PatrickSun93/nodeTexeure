const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const router = express.Router();

/**
 * GET /api/search/autocomplete
 * Autocomplete suggestions for search
 * Returns matching product names and categories
 */
router.get('/autocomplete', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json(ResponseFormatter.success('Autocomplete results', {
                suggestions: [],
                products: [],
                categories: []
            }));
        }

        const searchTerm = q.trim();
        const limit = 10;

        // Search product names with relevance scoring
        const productQuery = `
            SELECT 
                id,
                name,
                slug,
                base_price,
                thumbnail_small_url,
                CASE
                    WHEN name LIKE ? THEN 100
                    WHEN name LIKE ? THEN 90
                    WHEN name LIKE ? THEN 80
                    WHEN description LIKE ? THEN 50
                    ELSE 30
                END as relevance_score
            FROM products
            WHERE 
                is_active = 1
                AND (
                    name LIKE ?
                    OR description LIKE ?
                    OR short_description LIKE ?
                    OR JSON_UNQUOTE(JSON_EXTRACT(product_details, '$.material')) LIKE ?
                )
            ORDER BY relevance_score DESC, name ASC
            LIMIT ?
        `;

        const exactMatch = searchTerm;
        const startsWith = `${searchTerm}%`;
        const contains = `%${searchTerm}%`;

        const productResult = await DatabaseUtil.executeQuery(productQuery, [
            exactMatch, // Exact match gets highest score
            startsWith, // Starts with gets second highest
            contains,   // Contains anywhere gets third
            contains,   // Description match
            contains,   // All the LIKE clauses
            contains,
            contains,
            contains,
            limit
        ]);

        // Search categories
        const categoryQuery = `
            SELECT DISTINCT
                category_id,
                category_name
            FROM products
            WHERE 
                is_active = 1
                AND category_name LIKE ?
            LIMIT 5
        `;

        const categoryResult = await DatabaseUtil.executeQuery(categoryQuery, [contains]);

        // Extract unique search suggestions from product names
        const suggestions = productResult.success && productResult.data
            ? productResult.data.slice(0, 5).map(p => p.name)
            : [];

        const products = productResult.success && productResult.data
            ? productResult.data.map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                price: p.base_price,
                image: p.thumbnail_small_url
            }))
            : [];

        const categories = categoryResult.success && categoryResult.data
            ? categoryResult.data.map(c => ({
                id: c.category_id,
                name: c.category_name
            }))
            : [];

        res.json(ResponseFormatter.success('Autocomplete results', {
            query: searchTerm,
            suggestions,
            products,
            categories
        }));

    } catch (error) {
        console.error('Autocomplete error:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/search/suggestions
 * Popular search terms and trending products
 */
router.get('/suggestions', async (req, res) => {
    try {
        // Get popular search terms (you can track these in a separate table later)
        const popularTerms = [
            'silk sheets',
            'cashmere blanket',
            'queen size',
            'king size',
            'luxury bedding',
            'organic cotton'
        ];

        // Get trending/popular products (based on views or sales)
        const trendingQuery = `
            SELECT 
                id,
                name,
                slug,
                base_price,
                thumbnail_small_url
            FROM products
            WHERE is_active = 1
            ORDER BY created_at DESC
            LIMIT 6
        `;

        const trendingResult = await DatabaseUtil.executeQuery(trendingQuery);

        const trending = trendingResult.success && trendingResult.data
            ? trendingResult.data.map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                price: p.base_price,
                image: p.thumbnail_small_url
            }))
            : [];

        res.json(ResponseFormatter.success('Search suggestions', {
            popularTerms,
            trending
        }));

    } catch (error) {
        console.error('Suggestions error:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/search/recent
 * Get recently viewed products (stored in cookie/session)
 * This endpoint can be enhanced with actual tracking
 */
router.get('/recent', async (req, res) => {
    try {
        const { ids } = req.query;

        if (!ids) {
            return res.json(ResponseFormatter.success('Recent products', { products: [] }));
        }

        const idList = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

        if (idList.length === 0) {
            return res.json(ResponseFormatter.success('Recent products', { products: [] }));
        }

        const placeholders = idList.map(() => '?').join(', ');
        const orderPlaceholders = idList.map(() => '?').join(', ');

        const query = `
            SELECT 
                id,
                name,
                slug,
                base_price,
                thumbnail_small_url
            FROM products
            WHERE id IN (${placeholders})
            ORDER BY FIELD(id, ${orderPlaceholders})
            LIMIT 10
        `;

        const result = await DatabaseUtil.executeQuery(query, [...idList, ...idList]);

        const products = result.success && result.data
            ? result.data.map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                price: p.base_price,
                image: p.thumbnail_small_url
            }))
            : [];

        res.json(ResponseFormatter.success('Recent products', { products }));

    } catch (error) {
        console.error('Recent products error:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

module.exports = router;
