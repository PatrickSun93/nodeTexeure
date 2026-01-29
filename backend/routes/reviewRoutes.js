const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');

/**
 * GET /api/reviews/product/:productId
 * Get all reviews for a specific product
 */
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, sort = 'recent' } = req.query;

        const offset = (page - 1) * limit;

        // Determine sorting
        let orderBy = 'pr.created_at DESC';
        if (sort === 'helpful') {
            orderBy = 'pr.helpful_count DESC, pr.created_at DESC';
        } else if (sort === 'rating_high') {
            orderBy = 'pr.rating DESC, pr.created_at DESC';
        } else if (sort === 'rating_low') {
            orderBy = 'pr.rating ASC, pr.created_at DESC';
        }

        // Get reviews with user info
        const query = `
            SELECT 
                pr.*,
                u.first_name,
                u.last_name,
                u.email,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM order_items oi
                        JOIN orders o ON oi.order_id = o.id
                        WHERE o.user_id = pr.user_id 
                        AND oi.product_id = pr.product_id
                        AND o.status = 'delivered'
                    ) THEN TRUE
                    ELSE FALSE
                END as is_verified_purchase
            FROM product_reviews pr
            LEFT JOIN users u ON pr.user_id = u.id
            WHERE pr.product_id = ? AND pr.status = 'approved'
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const result = await DatabaseUtil.executeQuery(query, [productId, parseInt(limit), offset]);

        // Get total count and rating summary
        const countQuery = `
            SELECT 
                COUNT(*) as total,
                AVG(rating) as avg_rating,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
            FROM product_reviews
            WHERE product_id = ? AND status = 'approved'
        `;

        const countResult = await DatabaseUtil.executeQuery(countQuery, [productId]);
        const summary = countResult.data[0];

        res.json(ResponseFormatter.success('Reviews fetched successfully', {
            reviews: result.data || [],
            summary: {
                total: summary.total,
                average_rating: parseFloat(summary.avg_rating || 0).toFixed(1),
                rating_distribution: {
                    5: summary.five_star || 0,
                    4: summary.four_star || 0,
                    3: summary.three_star || 0,
                    2: summary.two_star || 0,
                    1: summary.one_star || 0
                }
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: summary.total
            }
        }));

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * POST /api/reviews/create
 * Create a new product review (requires authentication)
 */
router.post('/create', protect, csrfProtection, async (req, res) => {
    try {
        const { product_id, rating, title, review_text } = req.body;
        const user_id = req.user.id;

        // Validation
        if (!product_id || !rating || !review_text) {
            return res.status(400).json(ResponseFormatter.failure('Missing required fields'));
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json(ResponseFormatter.failure('Rating must be between 1 and 5'));
        }

        // Check if user already reviewed this product
        const existingQuery = 'SELECT id FROM product_reviews WHERE user_id = ? AND product_id = ?';
        const existing = await DatabaseUtil.executeQuery(existingQuery, [user_id, product_id]);

        if (existing.data && existing.data.length > 0) {
            return res.status(409).json(ResponseFormatter.failure('You have already reviewed this product'));
        }

        // Check if user purchased this product
        const purchaseQuery = `
            SELECT 1 FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'
            LIMIT 1
        `;
        const purchaseResult = await DatabaseUtil.executeQuery(purchaseQuery, [user_id, product_id]);
        const is_verified_purchase = purchaseResult.data && purchaseResult.data.length > 0;

        // Generate ID
        const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("REV") as id');
        const id = idResult.data[0].id;

        // Insert review (pending approval)
        const insertQuery = `
            INSERT INTO product_reviews (
                id, user_id, product_id, rating, title, review_text, 
                is_verified_purchase, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        await DatabaseUtil.executeQuery(insertQuery, [
            id, user_id, product_id, rating, title || '', review_text, is_verified_purchase
        ]);

        res.status(201).json(ResponseFormatter.success('Review submitted successfully', {
            id,
            status: 'pending',
            message: 'Your review will be published after moderation'
        }));

    } catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * PUT /api/reviews/:id
 * Update user's own review
 */
router.put('/:id', protect, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, title, review_text } = req.body;
        const user_id = req.user.id;

        // Check ownership
        const checkQuery = 'SELECT user_id FROM product_reviews WHERE id = ?';
        const checkResult = await DatabaseUtil.executeQuery(checkQuery, [id]);

        if (!checkResult.data || checkResult.data.length === 0) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }

        if (checkResult.data[0].user_id !== user_id) {
            return res.status(403).json(ResponseFormatter.failure('You can only edit your own reviews'));
        }

        // Update review (reset to pending status)
        const updateQuery = `
            UPDATE product_reviews 
            SET rating = ?, title = ?, review_text = ?, status = 'pending', updated_at = NOW()
            WHERE id = ?
        `;

        await DatabaseUtil.executeQuery(updateQuery, [rating, title, review_text, id]);

        res.json(ResponseFormatter.success('Review updated successfully'));

    } catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * DELETE /api/reviews/:id
 * Delete review (user's own or admin)
 */
router.delete('/:id', protect, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;
        const is_admin = req.user.role === 'admin';

        // Check ownership or admin
        const checkQuery = 'SELECT user_id FROM product_reviews WHERE id = ?';
        const checkResult = await DatabaseUtil.executeQuery(checkQuery, [id]);

        if (!checkResult.data || checkResult.data.length === 0) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }

        if (!is_admin && checkResult.data[0].user_id !== user_id) {
            return res.status(403).json(ResponseFormatter.failure('You can only delete your own reviews'));
        }

        // Delete review
        await DatabaseUtil.executeQuery('DELETE FROM product_reviews WHERE id = ?', [id]);

        res.json(ResponseFormatter.success('Review deleted successfully'));

    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * POST /api/reviews/:id/helpful
 * Mark review as helpful
 */
router.post('/:id/helpful', async (req, res) => {
    try {
        const { id } = req.params;

        // Increment helpful count
        const updateQuery = `
            UPDATE product_reviews 
            SET helpful_count = helpful_count + 1 
            WHERE id = ?
        `;

        await DatabaseUtil.executeQuery(updateQuery, [id]);

        res.json(ResponseFormatter.success('Marked as helpful'));

    } catch (error) {
        console.error('Error marking review as helpful:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/reviews/user/:userId
 * Get user's reviews (admin or self only)
 */
router.get('/user/:userId', protect, async (req, res) => {
    try {
        const { userId } = req.params;
        const requestingUserId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        // Check permissions
        if (userId !== requestingUserId && !isAdmin) {
            return res.status(403).json(ResponseFormatter.failure('Access denied'));
        }

        const query = `
            SELECT 
                pr.*,
                p.name as product_name,
                p.slug as product_slug
            FROM product_reviews pr
            LEFT JOIN products p ON pr.product_id = p.id
            WHERE pr.user_id = ?
            ORDER BY pr.created_at DESC
        `;

        const result = await DatabaseUtil.executeQuery(query, [userId]);

        res.json(ResponseFormatter.success('User reviews fetched successfully', {
            reviews: result.data || []
        }));

    } catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * ADMIN: Moderate reviews
 */

/**
 * GET /api/reviews/admin/pending
 * Get pending reviews for moderation
 */
router.get('/admin/pending', protect, admin, async (req, res) => {
    try {
        const query = `
            SELECT 
                pr.*,
                u.first_name,
                u.last_name,
                u.email,
                p.name as product_name
            FROM product_reviews pr
            LEFT JOIN users u ON pr.user_id = u.id
            LEFT JOIN products p ON pr.product_id = p.id
            WHERE pr.status = 'pending'
            ORDER BY pr.created_at DESC
        `;

        const result = await DatabaseUtil.executeQuery(query);

        res.json(ResponseFormatter.success('Pending reviews fetched successfully', {
            reviews: result.data || []
        }));

    } catch (error) {
        console.error('Error fetching pending reviews:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * PUT /api/reviews/admin/:id/approve
 * Approve a review
 */
router.put('/admin/:id/approve', protect, admin, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;

        await DatabaseUtil.executeQuery(
            'UPDATE product_reviews SET status = ?, updated_at = NOW() WHERE id = ?',
            ['approved', id]
        );

        res.json(ResponseFormatter.success('Review approved successfully'));

    } catch (error) {
        console.error('Error approving review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * PUT /api/reviews/admin/:id/reject
 * Reject a review
 */
router.put('/admin/:id/reject', protect, admin, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;

        await DatabaseUtil.executeQuery(
            'UPDATE product_reviews SET status = ?, updated_at = NOW() WHERE id = ?',
            ['rejected', id]
        );

        res.json(ResponseFormatter.success('Review rejected successfully'));

    } catch (error) {
        console.error('Error rejecting review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

module.exports = router;
