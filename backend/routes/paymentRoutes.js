const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripeService');
const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect } = require('../middleware/authMiddleware');
const EmailQueueService = require('../services/emailQueueService');
const db = require('../utils/database');

// Initialize email queue service
const emailQueueService = new EmailQueueService();

/**
 * POST /api/payments/create-intent
 * Create a payment intent for checkout
 */
router.post('/create-intent', protect, async (req, res) => {
  try {
    const { amount, currency = 'usd', orderId, metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json(
        ResponseFormatter.failure('Invalid amount provided')
      );
    }

    // Add order and user information to metadata
    const paymentMetadata = {
      orderId: orderId || '',
      userId: req.user.id,
      userEmail: req.user.email,
      ...metadata
    };

    const paymentIntent = await stripeService.createPaymentIntent(
      amount,
      currency,
      paymentMetadata
    );

    logger.info('Payment intent created for user', {
      userId: req.user.id,
      paymentIntentId: paymentIntent.id,
      amount,
      orderId
    });

    res.json(ResponseFormatter.success('Payment intent created successfully', {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    }));

  } catch (error) {
    logger.error('Failed to create payment intent', {
      error: error.message,
      userId: req.user?.id,
      requestBody: req.body
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to create payment intent', {
        error: error.message
      })
    );
  }
});

/**
 * POST /api/payments/confirm
 * Confirm a payment intent
 */
router.post('/confirm', protect, async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId } = req.body;

    if (!paymentIntentId || !paymentMethodId) {
      return res.status(400).json(
        ResponseFormatter.failure('Payment intent ID and payment method ID are required')
      );
    }

    const paymentIntent = await stripeService.confirmPayment(
      paymentIntentId,
      paymentMethodId
    );

    logger.info('Payment confirmed for user', {
      userId: req.user.id,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status
    });

    res.json(ResponseFormatter.success('Payment confirmed successfully', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    }));

  } catch (error) {
    logger.error('Failed to confirm payment', {
      error: error.message,
      userId: req.user?.id,
      requestBody: req.body
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to confirm payment', {
        error: error.message
      })
    );
  }
});

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 * Note: This endpoint should NOT use authentication middleware
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      logger.error('Missing Stripe signature in webhook request');
      return res.status(400).json(
        ResponseFormatter.failure('Missing Stripe signature')
      );
    }

    const event = await stripeService.handleWebhook(signature, req.body);

    logger.info('Processing Stripe webhook event', {
      eventType: event.type,
      eventId: event.id
    });

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object);
        break;
      
      case 'payment_intent.requires_action':
        await handlePaymentRequiresAction(event.data.object);
        break;
      
      default:
        logger.info('Unhandled webhook event type', { eventType: event.type });
    }

    res.json(ResponseFormatter.success('Webhook processed successfully', {
      eventType: event.type,
      eventId: event.id
    }));

  } catch (error) {
    logger.error('Failed to process webhook', {
      error: error.message,
      signature: req.headers['stripe-signature'] ? 'present' : 'missing'
    });

    res.status(400).json(
      ResponseFormatter.failure('Webhook processing failed', {
        error: error.message
      })
    );
  }
});

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(paymentIntent) {
  try {
    logger.info('Processing successful payment', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata
    });

    const { orderId, userId } = paymentIntent.metadata;

    if (orderId) {
      // Update order status to confirmed
      await db.query(
        'UPDATE orders SET status = ?, payment_status = ?, stripe_payment_intent_id = ?, updated_at = NOW() WHERE id = ?',
        ['confirmed', 'completed', paymentIntent.id, orderId]
      );

      // Create payment record
      await db.query(
        `INSERT INTO payments (
          id, order_id, user_id, amount, currency, status, 
          stripe_payment_intent_id, stripe_payment_method_id, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          `PAY${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          orderId,
          userId,
          paymentIntent.amount / 100, // Convert from cents
          paymentIntent.currency,
          'completed',
          paymentIntent.id,
          paymentIntent.payment_method || null
        ]
      );

      logger.info('Order and payment records updated for successful payment', {
        orderId,
        paymentIntentId: paymentIntent.id
      });

      // Queue order status update email for payment confirmation
      try {
        // Get order details for email
        const orderResult = await db.query(
          `SELECT o.*, u.email, u.first_name, u.last_name 
           FROM orders o 
           LEFT JOIN users u ON o.user_id = u.id 
           WHERE o.id = ?`,
          [orderId]
        );

        if (orderResult.length > 0) {
          const order = orderResult[0];
          const customerEmail = order.email || order.guest_email;
          
          if (customerEmail) {
            const orderData = {
              orderNumber: order.order_number,
              orderId: order.id,
              status: 'confirmed',
              totalAmount: `$${order.total_amount.toFixed(2)}`,
              customerName: order.first_name ? `${order.first_name} ${order.last_name || ''}`.trim() : 'Guest'
            };

            await emailQueueService.queueOrderStatusUpdate(customerEmail, orderData);
            logger.info('Order status update email queued for payment confirmation', {
              orderId,
              customerEmail
            });
          }
        }
      } catch (emailError) {
        logger.error('Failed to queue order status update email for payment confirmation', {
          error: emailError.message,
          orderId,
          paymentIntentId: paymentIntent.id
        });
        // Don't fail the payment processing if email fails
      }
    }

  } catch (error) {
    logger.error('Failed to handle successful payment', {
      error: error.message,
      paymentIntentId: paymentIntent.id
    });
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent) {
  try {
    logger.info('Processing failed payment', {
      paymentIntentId: paymentIntent.id,
      metadata: paymentIntent.metadata
    });

    const { orderId } = paymentIntent.metadata;

    if (orderId) {
      // Update order status to payment_failed
      await db.query(
        'UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?',
        ['failed', orderId]
      );

      logger.info('Order updated for failed payment', {
        orderId,
        paymentIntentId: paymentIntent.id
      });
    }

  } catch (error) {
    logger.error('Failed to handle payment failure', {
      error: error.message,
      paymentIntentId: paymentIntent.id
    });
    throw error;
  }
}

/**
 * Handle canceled payment
 */
async function handlePaymentCanceled(paymentIntent) {
  try {
    logger.info('Processing canceled payment', {
      paymentIntentId: paymentIntent.id,
      metadata: paymentIntent.metadata
    });

    const { orderId } = paymentIntent.metadata;

    if (orderId) {
      // Update order status to canceled
      await db.query(
        'UPDATE orders SET status = ?, payment_status = ?, updated_at = NOW() WHERE id = ?',
        ['canceled', 'canceled', orderId]
      );

      logger.info('Order updated for canceled payment', {
        orderId,
        paymentIntentId: paymentIntent.id
      });
    }

  } catch (error) {
    logger.error('Failed to handle payment cancellation', {
      error: error.message,
      paymentIntentId: paymentIntent.id
    });
    throw error;
  }
}

/**
 * Handle payment that requires additional action
 */
async function handlePaymentRequiresAction(paymentIntent) {
  try {
    logger.info('Processing payment that requires action', {
      paymentIntentId: paymentIntent.id,
      metadata: paymentIntent.metadata
    });

    const { orderId } = paymentIntent.metadata;

    if (orderId) {
      // Update order status to pending_payment
      await db.query(
        'UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?',
        ['pending_action', orderId]
      );

      logger.info('Order updated for payment requiring action', {
        orderId,
        paymentIntentId: paymentIntent.id
      });
    }

  } catch (error) {
    logger.error('Failed to handle payment requiring action', {
      error: error.message,
      paymentIntentId: paymentIntent.id
    });
    throw error;
  }
}

/**
 * GET /api/payments/intent/:id
 * Retrieve payment intent details
 */
router.get('/intent/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const paymentIntent = await stripeService.retrievePaymentIntent(id);

    logger.info('Payment intent retrieved', {
      userId: req.user.id,
      paymentIntentId: id
    });

    res.json(ResponseFormatter.success('Payment intent retrieved successfully', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata
    }));

  } catch (error) {
    logger.error('Failed to retrieve payment intent', {
      error: error.message,
      userId: req.user?.id,
      paymentIntentId: req.params.id
    });

    res.status(500).json(
      ResponseFormatter.failure('Failed to retrieve payment intent', {
        error: error.message
      })
    );
  }
});

module.exports = router;