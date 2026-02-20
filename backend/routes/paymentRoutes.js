/**
 * Payment Routes
 * Handles Stripe payment endpoints
 */

const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');
const stripeService = require('../services/stripeService');
const { protect, admin, protectOptional } = require('../middleware/authMiddleware');
const db = new DatabaseUtil();

/**
 * POST /api/payments/create-checkout-session
 * Create a Stripe Checkout Session for an order
 * Body: { orderId }
 */
router.post('/create-checkout-session', protectOptional, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json(ResponseFormatter.failure('Order ID is required'));
    }

    if (!stripeService.isAvailable()) {
      return res.status(503).json(ResponseFormatter.failure('Payment service is not configured. Please add Stripe API keys.'));
    }

    // Fetch order details
    const orderQuery = `
      SELECT o.*, oi.product_name, oi.quantity, oi.unit_price
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = ?
    `;
    const orderItems = await db.executeQuery(orderQuery, [orderId]);

    if (!orderItems || orderItems.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }

    const order = orderItems[0];

    // Build line items for Stripe
    const lineItems = orderItems.map(item => ({
      name: item.product_name,
      quantity: item.quantity,
      unitAmount: Math.round(item.unit_price * 100), // Convert to cents
    }));

    // Add tax as a line item if present
    if (order.tax_amount > 0) {
      lineItems.push({
        name: 'Tax',
        quantity: 1,
        unitAmount: Math.round(order.tax_amount * 100),
      });
    }

    // Add shipping as a line item if present
    if (order.shipping_amount > 0) {
      lineItems.push({
        name: 'Shipping',
        quantity: 1,
        unitAmount: Math.round(order.shipping_amount * 100),
      });
    }

    const customerEmail = order.guest_email || (req.user ? req.user.email : null);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/order/confirmation/${orderId}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/checkout?cancelled=true`;

    const session = await stripeService.createCheckoutSession(
      orderId,
      lineItems,
      customerEmail,
      successUrl,
      cancelUrl
    );

    // Save Stripe session ID to order
    await db.executeQuery(
      'UPDATE orders SET stripe_session_id = ? WHERE id = ?',
      [session.id, orderId]
    );

    res.json(ResponseFormatter.success('Checkout session created', {
      sessionId: session.id,
      url: session.url,
    }));
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to create checkout session'));
  }
});

/**
 * POST /api/payments/create-payment-intent
 * Create a Payment Intent for custom payment flow
 * Body: { orderId }
 */
router.post('/create-payment-intent', protectOptional, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json(ResponseFormatter.failure('Order ID is required'));
    }

    if (!stripeService.isAvailable()) {
      return res.status(503).json(ResponseFormatter.failure('Payment service is not configured'));
    }

    // Fetch order total
    const [order] = await db.executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }

    const paymentIntent = await stripeService.createPaymentIntent(
      Math.round(order.total_amount * 100), // cents
      'usd',
      { orderId: orderId, orderNumber: order.order_number }
    );

    // Save payment intent ID to order
    await db.executeQuery(
      'UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?',
      [paymentIntent.id, orderId]
    );

    res.json(ResponseFormatter.success('Payment intent created', {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    }));
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to create payment intent'));
  }
});

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 * NOTE: This route needs raw body parsing, configured in server.js
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripeService.constructWebhookEvent(req.body, sig);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = session.metadata.orderId;
        if (orderId) {
          await db.executeQuery(
            "UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = NOW(), stripe_payment_intent_id = ? WHERE id = ?",
            [session.payment_intent, orderId]
          );
          console.log(`✅ Order ${orderId} marked as paid via checkout session`);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const orderId = paymentIntent.metadata.orderId;
        if (orderId) {
          await db.executeQuery(
            "UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = NOW() WHERE id = ?",
            [orderId]
          );
          console.log(`✅ Order ${orderId} payment succeeded`);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        // Find order by payment intent
        const [order] = await db.executeQuery(
          'SELECT id FROM orders WHERE stripe_payment_intent_id = ?',
          [charge.payment_intent]
        );
        if (order) {
          await db.executeQuery(
            "UPDATE orders SET status = 'refunded', payment_status = 'refunded' WHERE id = ?",
            [order.id]
          );
          console.log(`💰 Order ${order.id} refunded`);
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }
});

/**
 * POST /api/payments/refund
 * Process a refund (admin only)
 * Body: { orderId, amount (optional, in dollars) }
 */
router.post('/refund', protect, admin, async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId) {
      return res.status(400).json(ResponseFormatter.failure('Order ID is required'));
    }

    if (!stripeService.isAvailable()) {
      return res.status(503).json(ResponseFormatter.failure('Payment service is not configured'));
    }

    const [order] = await db.executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }

    if (!order.stripe_payment_intent_id) {
      return res.status(400).json(ResponseFormatter.failure('No payment found for this order'));
    }

    const refundAmount = amount ? Math.round(amount * 100) : null; // null = full refund
    const refund = await stripeService.processRefund(order.stripe_payment_intent_id, refundAmount);

    // Update order status
    await db.executeQuery(
      "UPDATE orders SET status = 'refunded', payment_status = 'refunded' WHERE id = ?",
      [orderId]
    );

    res.json(ResponseFormatter.success('Refund processed', {
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status,
    }));
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to process refund'));
  }
});

/**
 * GET /api/payments/session/:sessionId
 * Check the status of a checkout session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    if (!stripeService.isAvailable()) {
      return res.status(503).json(ResponseFormatter.failure('Payment service is not configured'));
    }

    const session = await stripeService.getCheckoutSession(req.params.sessionId);

    res.json(ResponseFormatter.success('Session retrieved', {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total / 100,
      customerEmail: session.customer_email,
    }));
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to fetch session'));
  }
});

module.exports = router;
