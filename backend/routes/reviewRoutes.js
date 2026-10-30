const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const { isNonEmptyString, isOptionalString } = require('../utils/params');

/**
 * Review data model
 * -----------------
 * The runtime `product_reviews` table (docker/mysql/init.sql) has NO
 * title/review_text/status/helpful_count columns. Instead:
 *   - the title + body live INSIDE the `review_details` JSON column
 *     ({ title, comment, helpful_count }) — matching backend/scripts/seed-example-data.js,
 *   - moderation is the `is_approved` boolean (0 = pending, 1 = approved),
 *   - the helpful-vote tally is stored at review_details.$.helpful_count and is
 *     recomputed from the review_helpful_votes table (migration 007).
 * The storefront/admin UIs expect FLAT `title`, `review_text`, and `helpful_count`
 * fields, so every read is normalized through shapeReview().
 */
function parseDetails(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw; // mysql2 parses JSON columns already
    try {
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
}

function shapeReview(row) {
    const details = parseDetails(row.review_details);
    return {
        ...row,
        review_details: details,
        title: details.title || '',
        review_text: details.review_text || details.comment || details.body || '',
        helpful_count: Number(details.helpful_count || 0)
    };
}

/**
 * GET /api/reviews/product/:productId
 * Get all approved reviews for a specific product
 */
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, sort = 'recent' } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const offset = (pageNum - 1) * limitNum;

        // Determine sorting. `helpful` reads the count out of the review_details
        // JSON (there is no helpful_count column). Missing keys sort last.
        let orderBy = 'pr.created_at DESC';
        if (sort === 'helpful') {
            orderBy = "CAST(JSON_EXTRACT(pr.review_details, '$.helpful_count') AS UNSIGNED) DESC, pr.created_at DESC";
        } else if (sort === 'rating_high') {
            orderBy = 'pr.rating DESC, pr.created_at DESC';
        } else if (sort === 'rating_low') {
            orderBy = 'pr.rating ASC, pr.created_at DESC';
        }

        // Reviews with reviewer display name. is_verified_purchase is the stored
        // column (set at create time) — no email is selected (PII).
        const query = `
            SELECT
                pr.*,
                u.first_name,
                u.last_name
            FROM product_reviews pr
            LEFT JOIN users u ON pr.user_id = u.id
            WHERE pr.product_id = ? AND pr.is_approved = 1
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const result = await DatabaseUtil.executeQuery(query, [productId, limitNum, offset]);

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
            WHERE product_id = ? AND is_approved = 1
        `;

        const countResult = await DatabaseUtil.executeQuery(countQuery, [productId]);
        const summary = DatabaseUtil.first(countResult) || {};

        res.json(ResponseFormatter.success('Reviews fetched successfully', {
            reviews: DatabaseUtil.rows(result).map(shapeReview),
            summary: {
                total: summary.total || 0,
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
                page: pageNum,
                limit: limitNum,
                total: summary.total || 0
            }
        }));

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * Customer review write routes (create/update/delete below) authenticate via a
 * Bearer token (`protect`), so they deliberately do NOT use `csrfProtection`:
 * CSRF forgery relies on the browser auto-attaching credentials (cookies), and a
 * cross-site attacker cannot read or attach a victim's Bearer token. Customers
 * also have no way to obtain a CSRF token (the issuer endpoint is admin-only).
 * The admin moderation routes below keep `csrfProtection` because they accept
 * the `admin_auth` cookie.
 */

/**
 * POST /api/reviews/create
 * Create a new product review (requires authentication). Stored pending
 * (is_approved = 0); title/body are persisted inside review_details JSON.
 */
router.post('/create', protect, async (req, res) => {
    try {
        const { product_id, rating, title, review_text } = req.body;
        const user_id = req.user.id;

        // Validation. product_id must be a string: a number would compare
        // numerically in the duplicate / verified-purchase lookups below.
        if (!isNonEmptyString(product_id) || rating === undefined || rating === null || !review_text) {
            return res.status(400).json(ResponseFormatter.failure('Missing required fields'));
        }
        if (!isOptionalString(title)) {
            return res.status(400).json(ResponseFormatter.failure('Title must be text'));
        }

        const ratingNum = parseInt(rating, 10);
        if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json(ResponseFormatter.failure('Rating must be between 1 and 5'));
        }

        if (typeof review_text !== 'string' || !review_text.trim()) {
            return res.status(400).json(ResponseFormatter.failure('Review text is required'));
        }

        // One review per (user, product)
        const existing = await DatabaseUtil.executeQuery(
            'SELECT id FROM product_reviews WHERE user_id = ? AND product_id = ?',
            [user_id, product_id]
        );
        if (DatabaseUtil.first(existing)) {
            return res.status(409).json(ResponseFormatter.failure('You have already reviewed this product'));
        }

        // Determine verified-purchase status and capture the order item link.
        const purchaseRow = DatabaseUtil.first(await DatabaseUtil.executeQuery(
            `SELECT oi.id AS order_item_id
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'
             LIMIT 1`,
            [user_id, product_id]
        ));
        const isVerified = !!purchaseRow;
        const orderItemId = purchaseRow ? purchaseRow.order_item_id : null;

        // Generate ID (REV prefix is registered in the transno table)
        const idResult = await DatabaseUtil.executeQuery("SELECT get_next_id('REV') AS id");
        const idRow = DatabaseUtil.first(idResult);
        if (!idResult.success || !idRow || !idRow.id) {
            console.error('Error generating review id:', idResult.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to submit review'));
        }
        const id = idRow.id;

        // Title/body live inside the JSON column (matches the seed's { title, comment }).
        const details = { title: (title || '').trim(), comment: review_text.trim() };

        const insertResult = await DatabaseUtil.executeQuery(
            `INSERT INTO product_reviews
                (id, product_id, user_id, order_item_id, rating, review_details, is_verified_purchase, is_approved)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [id, product_id, user_id, orderItemId, ratingNum, JSON.stringify(details), isVerified ? 1 : 0]
        );

        if (!insertResult.success) {
            console.error('Error creating review:', insertResult.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to submit review'));
        }

        res.status(201).json(ResponseFormatter.success('Review submitted successfully', {
            id,
            is_approved: false,
            message: 'Your review will be published after moderation'
        }));

    } catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * PUT /api/reviews/:id
 * Update the caller's own review. Rewrites the review_details JSON (preserving
 * any helpful_count) and returns the review to moderation (is_approved = 0).
 */
router.put('/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, title, review_text } = req.body;
        const user_id = req.user.id;

        // Ownership check (fetch existing details so we can merge, not clobber).
        const existing = DatabaseUtil.first(await DatabaseUtil.executeQuery(
            'SELECT user_id, rating, review_details FROM product_reviews WHERE id = ?',
            [id]
        ));

        if (!existing) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }
        if (existing.user_id !== user_id) {
            return res.status(403).json(ResponseFormatter.failure('You can only edit your own reviews'));
        }

        const details = parseDetails(existing.review_details);
        const ratingNum = rating !== undefined ? parseInt(rating, 10) : existing.rating;
        if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json(ResponseFormatter.failure('Rating must be between 1 and 5'));
        }

        const newComment = review_text !== undefined ? String(review_text) : (details.comment || details.review_text || '');
        if (!newComment.trim()) {
            return res.status(400).json(ResponseFormatter.failure('Review text is required'));
        }

        details.title = title !== undefined ? String(title).trim() : (details.title || '');
        details.comment = newComment.trim();

        // Editing resets moderation: back to pending, clear the old approval trail.
        const updateResult = await DatabaseUtil.executeQuery(
            `UPDATE product_reviews
             SET rating = ?, review_details = ?, is_approved = 0, approved_by = NULL, approved_at = NULL
             WHERE id = ? AND user_id = ?`,
            [ratingNum, JSON.stringify(details), id, user_id]
        );

        if (!updateResult.success) {
            console.error('Error updating review:', updateResult.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to update review'));
        }

        res.json(ResponseFormatter.success('Review updated successfully', { id, is_approved: false }));

    } catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * DELETE /api/reviews/:id
 * Delete review (owner or admin). Cascades to review_helpful_votes.
 */
router.delete('/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;
        const is_admin = req.user.isAdmin;

        const target = DatabaseUtil.first(await DatabaseUtil.executeQuery(
            'SELECT user_id FROM product_reviews WHERE id = ?',
            [id]
        ));

        if (!target) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }
        if (!is_admin && target.user_id !== user_id) {
            return res.status(403).json(ResponseFormatter.failure('You can only delete your own reviews'));
        }

        const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM product_reviews WHERE id = ?', [id]);
        if (!deleteResult.success) {
            console.error('Error deleting review:', deleteResult.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to delete review'));
        }

        res.json(ResponseFormatter.success('Review deleted successfully'));

    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * POST /api/reviews/:id/helpful
 * Mark a review as helpful. Authenticated + one vote per user (dedup via the
 * review_helpful_votes PK). The tally is recomputed and stored in review_details.
 */
router.post('/:id/helpful', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Only approved (publicly visible) reviews can be voted on.
        const reviewRow = DatabaseUtil.first(await DatabaseUtil.executeQuery(
            'SELECT id, is_approved FROM product_reviews WHERE id = ?',
            [id]
        ));
        if (!reviewRow || Number(reviewRow.is_approved) !== 1) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }

        // Record the vote; INSERT IGNORE makes a repeat vote a no-op (dedup).
        const voteResult = await DatabaseUtil.executeQuery(
            'INSERT IGNORE INTO review_helpful_votes (user_id, review_id) VALUES (?, ?)',
            [user_id, id]
        );
        if (!voteResult.success) {
            console.error('Error recording helpful vote:', voteResult.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to record vote'));
        }

        // Authoritative count recomputed from the votes table.
        const countRow = DatabaseUtil.first(await DatabaseUtil.executeQuery(
            'SELECT COUNT(*) AS cnt FROM review_helpful_votes WHERE review_id = ?',
            [id]
        ));
        const helpfulCount = Number(countRow ? countRow.cnt : 0);

        const updateResult = await DatabaseUtil.executeQuery(
            "UPDATE product_reviews SET review_details = JSON_SET(review_details, '$.helpful_count', ?) WHERE id = ?",
            [helpfulCount, id]
        );
        if (!updateResult.success) {
            console.error('Error updating helpful count:', updateResult.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to record vote'));
        }

        res.json(ResponseFormatter.success('Marked as helpful', { helpful_count: helpfulCount }));

    } catch (error) {
        console.error('Error marking review as helpful:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
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
        const isAdmin = req.user.isAdmin;

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
            reviews: DatabaseUtil.rows(result).map(shapeReview)
        }));

    } catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * ADMIN: Moderate reviews
 */

/**
 * GET /api/reviews/admin/pending
 * Get pending (not-yet-approved) reviews for moderation.
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
            WHERE pr.is_approved = 0
            ORDER BY pr.created_at DESC
        `;

        const result = await DatabaseUtil.executeQuery(query);

        res.json(ResponseFormatter.success('Pending reviews fetched successfully', {
            reviews: DatabaseUtil.rows(result).map(shapeReview)
        }));

    } catch (error) {
        console.error('Error fetching pending reviews:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * PUT /api/reviews/admin/:id/approve
 * Approve a review (is_approved = 1) and record the moderator + timestamp.
 */
router.put('/admin/:id/approve', protect, admin, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await DatabaseUtil.executeQuery(
            'UPDATE product_reviews SET is_approved = 1, approved_by = ?, approved_at = NOW() WHERE id = ?',
            [req.user.id, id]
        );

        if (!result.success) {
            console.error('Error approving review:', result.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to approve review'));
        }
        if (!result.affectedRows) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }

        res.json(ResponseFormatter.success('Review approved successfully'));

    } catch (error) {
        console.error('Error approving review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

/**
 * PUT /api/reviews/admin/:id/reject
 * Reject a review. The schema has no distinct "rejected" state (moderation is a
 * single is_approved boolean), so rejecting DELETES the review — otherwise it
 * would stay is_approved = 0 and reappear in the pending queue forever.
 */
router.put('/admin/:id/reject', protect, admin, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await DatabaseUtil.executeQuery(
            'DELETE FROM product_reviews WHERE id = ?',
            [id]
        );

        if (!result.success) {
            console.error('Error rejecting review:', result.error);
            return res.status(500).json(ResponseFormatter.failure('Unable to reject review'));
        }
        if (!result.affectedRows) {
            return res.status(404).json(ResponseFormatter.failure('Review not found'));
        }

        res.json(ResponseFormatter.success('Review rejected successfully'));

    } catch (error) {
        console.error('Error rejecting review:', error);
        res.status(500).json(ResponseFormatter.failure('Server error'));
    }
});

module.exports = router;
