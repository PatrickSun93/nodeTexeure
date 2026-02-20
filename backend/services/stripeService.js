/**
 * Stripe Payment Service
 * Handles all Stripe payment operations
 */

const Stripe = require('stripe');

let stripe;
try {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia'
  });
} catch (err) {
  console.warn('⚠️  Stripe initialization failed (placeholder keys?):', err.message);
  stripe = null;
}

/**
 * Check if Stripe is available
 */
function isAvailable() {
  return stripe !== null && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('your-stripe');
}

/**
 * Create a Stripe Checkout Session for an order
 * @param {string} orderId - Internal order ID
 * @param {Array} lineItems - Array of { name, quantity, unitAmount (cents) }
 * @param {string} customerEmail - Customer email
 * @param {string} successUrl - Redirect URL on success
 * @param {string} cancelUrl - Redirect URL on cancel
 * @returns {Object} Stripe Checkout Session
 */
async function createCheckoutSession(orderId, lineItems, customerEmail, successUrl, cancelUrl) {
  if (!isAvailable()) {
    throw new Error('Stripe is not configured. Please add valid API keys to .env');
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: lineItems.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.unitAmount), // in cents
      },
      quantity: item.quantity,
    })),
    metadata: {
      orderId: orderId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

/**
 * Create a Payment Intent for custom payment flow
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code (default: 'usd')
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Stripe PaymentIntent
 */
async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  if (!isAvailable()) {
    throw new Error('Stripe is not configured. Please add valid API keys to .env');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount),
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });

  return paymentIntent;
}

/**
 * Process a refund
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @param {number|null} amount - Refund amount in cents (null for full refund)
 * @returns {Object} Stripe Refund
 */
async function processRefund(paymentIntentId, amount = null) {
  if (!isAvailable()) {
    throw new Error('Stripe is not configured. Please add valid API keys to .env');
  }

  const refundParams = { payment_intent: paymentIntentId };
  if (amount) {
    refundParams.amount = Math.round(amount);
  }

  return await stripe.refunds.create(refundParams);
}

/**
 * Construct and verify a Stripe webhook event
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {Object} Verified Stripe event
 */
function constructWebhookEvent(rawBody, signature) {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.includes('your-stripe')) {
    throw new Error('Stripe webhook secret is not configured');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Retrieve a Checkout Session by ID
 * @param {string} sessionId - Stripe Session ID
 * @returns {Object} Stripe Checkout Session
 */
async function getCheckoutSession(sessionId) {
  if (!isAvailable()) {
    throw new Error('Stripe is not configured');
  }

  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent', 'line_items'],
  });
}

module.exports = {
  isAvailable,
  createCheckoutSession,
  createPaymentIntent,
  processRefund,
  constructWebhookEvent,
  getCheckoutSession,
};
