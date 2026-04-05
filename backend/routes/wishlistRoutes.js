const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const db = new DatabaseUtil();

/**
 * GET /api/wishlist
 * List current user's wishlist items with product details
 */
router.get('/', protect, async (req, res) => {
  try {
    const result = await db.executeQuery(
      `SELECT w.id, w.product_id, w.variant_id, w.created_at,
              p.name, p.base_price, p.slug, p.short_description, p.status,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC LIMIT 1) AS image_url,
              pv.size AS variant_size, pv.color AS variant_color, pv.price_adjustment AS variant_price_adjustment
       FROM wishlists w
       JOIN products p ON w.product_id = p.id
       LEFT JOIN product_variants pv ON w.variant_id = pv.id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );

    const items = (result.data || result || []).map(item => ({
      ...item,
      price: item.variant_price_adjustment
        ? parseFloat(item.base_price) + parseFloat(item.variant_price_adjustment)
        : parseFloat(item.base_price),
    }));

    res.json(ResponseFormatter.success('Wishlist fetched', { items }));
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch wishlist'));
  }
});

/**
 * POST /api/wishlist
 * Add item to wishlist
 */
router.post('/', protect, async (req, res) => {
  try {
    const { product_id, variant_id } = req.body;

    if (!product_id) {
      return res.status(400).json(ResponseFormatter.failure('product_id is required'));
    }

    // Check if already in wishlist
    const existing = await db.executeQuery(
      'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))',
      [req.user.id, product_id, variant_id || null, variant_id || null]
    );

    if ((existing.data || existing).length > 0) {
      return res.status(409).json(ResponseFormatter.failure('Item already in wishlist'));
    }

    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("WISH") as id');
    const wishId = idResult.data[0].id;

    await db.executeQuery(
      'INSERT INTO wishlists (id, user_id, product_id, variant_id) VALUES (?, ?, ?, ?)',
      [wishId, req.user.id, product_id, variant_id || null]
    );

    res.status(201).json(ResponseFormatter.success('Added to wishlist', { wishlistId: wishId }));
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to add to wishlist'));
  }
});

/**
 * DELETE /api/wishlist/:productId
 * Remove item from wishlist by product ID
 */
router.delete('/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await db.executeQuery(
      'DELETE FROM wishlists WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    if ((result.data || result).affectedRows === 0) {
      return res.status(404).json(ResponseFormatter.failure('Item not found in wishlist'));
    }

    res.json(ResponseFormatter.success('Removed from wishlist'));
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to remove from wishlist'));
  }
});

/**
 * GET /api/wishlist/check/:productId
 * Check if a product is in the user's wishlist
 */
router.get('/check/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await db.executeQuery(
      'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    const isWishlisted = (result.data || result).length > 0;
    res.json(ResponseFormatter.success('Wishlist check', { isWishlisted }));
  } catch (error) {
    console.error('Wishlist check error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to check wishlist'));
  }
});

module.exports = router;
