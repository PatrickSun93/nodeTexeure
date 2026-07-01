const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const AbandonedCartService = require('../services/abandonedCartService');
const ResponseFormatter = require('../utils/responseFormatter');
const router = express.Router();

// Initialize abandoned cart service
const abandonedCartService = new AbandonedCartService();

/**
 * @route POST /api/abandoned-cart/track
 * @desc Track cart activity to prevent/delay abandonment detection
 * @access Public
 */
router.post('/track', async (req, res) => {
  try {
    const { cartId, userEmail, sessionId } = req.body;

    if (!cartId) {
      return res.status(400).json(ResponseFormatter.failure('Cart ID is required'));
    }

    await abandonedCartService.trackCartActivity(cartId, userEmail, sessionId);

    res.json(ResponseFormatter.success('Cart activity tracked'));
  } catch (error) {
    console.error('Error tracking cart activity:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to track cart activity', { error: error.message }));
  }
});

/**
 * @route POST /api/abandoned-cart/recover/:cartId
 * @desc Mark cart as recovered (called when customer completes purchase)
 * @access Public
 */
router.post('/recover/:cartId', async (req, res) => {
  try {
    const { cartId } = req.params;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json(ResponseFormatter.failure('Order ID is required'));
    }

    const result = await abandonedCartService.markCartRecovered(cartId, orderId);

    if (result.success) {
      res.json(ResponseFormatter.success('Cart marked as recovered', {
        cartId,
        orderId,
        affectedRows: result.affectedRows
      }));
    } else {
      res.status(500).json(ResponseFormatter.failure('Failed to mark cart as recovered', { error: result.error }));
    }
  } catch (error) {
    console.error('Error marking cart as recovered:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to mark cart as recovered', { error: error.message }));
  }
});

/**
 * @route POST /api/abandoned-cart/detect
 * @desc Manually trigger abandoned cart detection (admin only)
 * @access Private (Admin)
 */
router.post('/detect', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json(ResponseFormatter.failure('Access denied. Admin role required.'));
    }

    const result = await abandonedCartService.detectAbandonedCarts();

    if (result.success) {
      res.json(ResponseFormatter.success('Abandoned cart detection completed', {
        processedCarts: result.processedCarts
      }));
    } else {
      res.status(500).json(ResponseFormatter.failure('Failed to detect abandoned carts', { error: result.error }));
    }
  } catch (error) {
    console.error('Error detecting abandoned carts:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to detect abandoned carts', { error: error.message }));
  }
});

/**
 * @route GET /api/abandoned-cart/analytics
 * @desc Get abandoned cart recovery analytics
 * @access Private (Admin/Staff)
 */
router.get('/analytics', protect, async (req, res) => {
  try {
    // Check if user is admin or staff
    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json(ResponseFormatter.failure('Access denied. Admin or staff role required.'));
    }

    const days = parseInt(req.query.days) || 30;
    const result = await abandonedCartService.getRecoveryAnalytics(days);

    if (result.success) {
      res.json(ResponseFormatter.success('Analytics retrieved successfully', result.data));
    } else {
      res.status(500).json(ResponseFormatter.failure('Failed to get analytics', { error: result.error }));
    }
  } catch (error) {
    console.error('Error getting abandoned cart analytics:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get analytics', { error: error.message }));
  }
});

/**
 * @route POST /api/abandoned-cart/cleanup
 * @desc Clean up old abandoned cart records (admin only)
 * @access Private (Admin)
 */
router.post('/cleanup', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json(ResponseFormatter.failure('Access denied. Admin role required.'));
    }

    const result = await abandonedCartService.cleanupOldRecords();

    if (result.success) {
      res.json(ResponseFormatter.success('Cleanup completed', {
        deletedRecords: result.affectedRows || 0
      }));
    } else {
      res.status(500).json(ResponseFormatter.failure('Failed to cleanup records', { error: result.error }));
    }
  } catch (error) {
    console.error('Error cleaning up abandoned cart records:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to cleanup records', { error: error.message }));
  }
});

/**
 * @route GET /api/abandoned-cart/recovery/:token
 * @desc Handle cart recovery from email link
 * @access Public
 */
router.get('/recovery/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find the abandoned cart record by recovery token
    const db = require('../utils/database');
    const query = `
      SELECT acr.*, sc.user_id, sc.session_id 
      FROM abandoned_cart_recovery acr
      JOIN shopping_carts sc ON acr.cart_id = sc.id
      WHERE acr.recovery_token = ? AND acr.recovered_at IS NULL
    `;

    const result = await db.executeQuery(query, [token]);

    if (!result.success || result.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Invalid or expired recovery token'));
    }

    const recoveryData = result.data[0];

    // Redirect to checkout with recovery information
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const redirectUrl = `${baseUrl}/checkout?recovery=${token}&cart=${recoveryData.cart_id}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error handling cart recovery:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to handle cart recovery', { error: error.message }));
  }
});

module.exports = router;