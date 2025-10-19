const express = require('express');
const router = express.Router();
const EmailQueueService = require('../services/emailQueueService');
// Simple logger wrapper for email service
const logger = {
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || '')
};
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// Initialize email queue service
const emailQueueService = new EmailQueueService();

/**
 * @route POST /api/emails/queue/order-confirmation
 * @desc Queue order confirmation email
 * @access Private (Admin/Staff)
 */
router.post('/queue/order-confirmation', authenticateToken, async (req, res) => {
  try {
    const { customerEmail, orderData } = req.body;

    if (!customerEmail || !orderData) {
      return res.status(400).json({
        success: false,
        message: 'Customer email and order data are required'
      });
    }

    const queueId = await emailQueueService.queueOrderConfirmation(customerEmail, orderData);

    res.json({
      success: true,
      message: 'Order confirmation email queued successfully',
      queueId: queueId
    });

  } catch (error) {
    logger.error('Failed to queue order confirmation email', {
      error: error.message,
      customerEmail: req.body.customerEmail
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue order confirmation email',
      error: error.message
    });
  }
});

/**
 * @route POST /api/emails/queue/order-status-update
 * @desc Queue order status update email
 * @access Private (Admin/Staff)
 */
router.post('/queue/order-status-update', authenticateToken, async (req, res) => {
  try {
    const { customerEmail, orderData } = req.body;

    if (!customerEmail || !orderData) {
      return res.status(400).json({
        success: false,
        message: 'Customer email and order data are required'
      });
    }

    const queueId = await emailQueueService.queueOrderStatusUpdate(customerEmail, orderData);

    res.json({
      success: true,
      message: 'Order status update email queued successfully',
      queueId: queueId
    });

  } catch (error) {
    logger.error('Failed to queue order status update email', {
      error: error.message,
      customerEmail: req.body.customerEmail
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue order status update email',
      error: error.message
    });
  }
});

/**
 * @route POST /api/emails/queue/shipping-notification
 * @desc Queue shipping notification email
 * @access Private (Admin/Staff)
 */
router.post('/queue/shipping-notification', authenticateToken, async (req, res) => {
  try {
    const { customerEmail, orderData } = req.body;

    if (!customerEmail || !orderData) {
      return res.status(400).json({
        success: false,
        message: 'Customer email and order data are required'
      });
    }

    const queueId = await emailQueueService.queueShippingNotification(customerEmail, orderData);

    res.json({
      success: true,
      message: 'Shipping notification email queued successfully',
      queueId: queueId
    });

  } catch (error) {
    logger.error('Failed to queue shipping notification email', {
      error: error.message,
      customerEmail: req.body.customerEmail
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue shipping notification email',
      error: error.message
    });
  }
});

/**
 * @route POST /api/emails/queue/abandoned-cart
 * @desc Queue abandoned cart recovery email
 * @access Private (Admin/Staff)
 */
router.post('/queue/abandoned-cart', authenticateToken, async (req, res) => {
  try {
    const { customerEmail, cartData, sequenceStep = 1 } = req.body;

    if (!customerEmail || !cartData) {
      return res.status(400).json({
        success: false,
        message: 'Customer email and cart data are required'
      });
    }

    const queueId = await emailQueueService.queueAbandonedCartEmail(customerEmail, cartData, sequenceStep);

    res.json({
      success: true,
      message: 'Abandoned cart email queued successfully',
      queueId: queueId
    });

  } catch (error) {
    logger.error('Failed to queue abandoned cart email', {
      error: error.message,
      customerEmail: req.body.customerEmail
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue abandoned cart email',
      error: error.message
    });
  }
});

/**
 * @route POST /api/emails/queue/welcome
 * @desc Queue welcome email for new users
 * @access Private (Admin/Staff)
 */
router.post('/queue/welcome', authenticateToken, async (req, res) => {
  try {
    const { customerEmail, userData } = req.body;

    if (!customerEmail || !userData) {
      return res.status(400).json({
        success: false,
        message: 'Customer email and user data are required'
      });
    }

    const queueId = await emailQueueService.queueWelcomeEmail(customerEmail, userData);

    res.json({
      success: true,
      message: 'Welcome email queued successfully',
      queueId: queueId
    });

  } catch (error) {
    logger.error('Failed to queue welcome email', {
      error: error.message,
      customerEmail: req.body.customerEmail
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue welcome email',
      error: error.message
    });
  }
});

/**
 * @route POST /api/emails/queue/low-stock-alert
 * @desc Queue low stock alert emails for authorized staff
 * @access Private (Authorized staff only)
 */
router.post('/queue/low-stock-alert', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { adminEmails, lowStockProducts } = req.body;

    if (!adminEmails || !Array.isArray(adminEmails) || !lowStockProducts) {
      return res.status(400).json({
        success: false,
        message: 'Authorized staff emails array and low stock products are required'
      });
    }

    const queueIds = await emailQueueService.queueLowStockAlert(adminEmails, lowStockProducts);

    res.json({
      success: true,
      message: 'Low stock alert emails queued successfully',
      queueIds: queueIds
    });

  } catch (error) {
    logger.error('Failed to queue low stock alert emails', {
      error: error.message,
      adminEmails: req.body.adminEmails
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue low stock alert emails',
      error: error.message
    });
  }
});

/**
 * @route GET /api/emails/queue/stats
 * @desc Get email queue statistics
 * @access Private (Admin only)
 */
router.get('/queue/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const stats = await emailQueueService.getQueueStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Failed to get email queue stats', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Failed to get email queue statistics',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/emails/queue/:queueId
 * @desc Cancel pending email by queue ID
 * @access Private (Admin only)
 */
router.delete('/queue/:queueId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { queueId } = req.params;

    const cancelled = await emailQueueService.cancelEmail(queueId);

    if (cancelled) {
      res.json({
        success: true,
        message: 'Email cancelled successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Email not found or already processed'
      });
    }

  } catch (error) {
    logger.error('Failed to cancel email', {
      error: error.message,
      queueId: req.params.queueId
    });

    res.status(500).json({
      success: false,
      message: 'Failed to cancel email',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/emails/queue/abandoned-cart/:customerEmail
 * @desc Cancel all pending abandoned cart emails for a customer
 * @access Private (Admin/Staff)
 */
router.delete('/queue/abandoned-cart/:customerEmail', authenticateToken, async (req, res) => {
  try {
    const { customerEmail } = req.params;

    const cancelledCount = await emailQueueService.cancelAbandonedCartEmails(customerEmail);

    res.json({
      success: true,
      message: `Cancelled ${cancelledCount} abandoned cart emails`,
      cancelledCount: cancelledCount
    });

  } catch (error) {
    logger.error('Failed to cancel abandoned cart emails', {
      error: error.message,
      customerEmail: req.params.customerEmail
    });

    res.status(500).json({
      success: false,
      message: 'Failed to cancel abandoned cart emails',
      error: error.message
    });
  }
});

/**
 * @route POST /api/emails/send-test
 * @desc Send test email (for development/testing)
 * @access Private (Admin only)
 */
router.post('/send-test', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { to, subject, content } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({
        success: false,
        message: 'To, subject, and content are required'
      });
    }

    // Create a simple EmailService instance for testing
    const EmailService = require('../services/emailService');
    const emailService = new EmailService();

    const result = await emailService.sendEmail(to, subject, content);

    res.json({
      success: true,
      message: 'Test email sent successfully',
      messageId: result.messageId
    });

  } catch (error) {
    logger.error('Failed to send test email', {
      error: error.message,
      to: req.body.to
    });

    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
});

module.exports = router;