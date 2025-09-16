const Stripe = require('stripe');
const logger = require('../utils/logger');

class StripeService {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  /**
   * Create a payment intent for processing payment
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code (e.g., 'usd')
   * @param {Object} metadata - Additional metadata for the payment
   * @returns {Promise<Object>} Payment intent object
   */
  async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    try {
      logger.info('Creating payment intent', { amount, currency, metadata });
      
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info('Payment intent created successfully', { 
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        status: paymentIntent.status
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Failed to create payment intent', { 
        error: error.message,
        amount,
        currency,
        metadata
      });
      throw error;
    }
  }

  /**
   * Confirm a payment intent with payment method
   * @param {string} paymentIntentId - Payment intent ID
   * @param {string} paymentMethodId - Payment method ID
   * @returns {Promise<Object>} Confirmed payment intent
   */
  async confirmPayment(paymentIntentId, paymentMethodId) {
    try {
      logger.info('Confirming payment', { paymentIntentId, paymentMethodId });
      
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      logger.info('Payment confirmed successfully', { 
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Failed to confirm payment', { 
        error: error.message,
        paymentIntentId,
        paymentMethodId
      });
      throw error;
    }
  }

  /**
   * Create a refund for a payment
   * @param {string} paymentIntentId - Payment intent ID to refund
   * @param {number} amount - Amount to refund in dollars (optional, full refund if not specified)
   * @param {string} reason - Reason for refund
   * @returns {Promise<Object>} Refund object
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      logger.info('Creating refund', { paymentIntentId, amount, reason });
      
      const refundData = {
        payment_intent: paymentIntentId,
        reason,
      };

      if (amount !== null) {
        refundData.amount = Math.round(amount * 100); // Convert to cents
      }

      const refund = await this.stripe.refunds.create(refundData);

      logger.info('Refund created successfully', { 
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status
      });

      return refund;
    } catch (error) {
      logger.error('Failed to create refund', { 
        error: error.message,
        paymentIntentId,
        amount,
        reason
      });
      throw error;
    }
  }

  /**
   * Retrieve a payment intent by ID
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Payment intent object
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      logger.info('Retrieving payment intent', { paymentIntentId });
      
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      logger.info('Payment intent retrieved successfully', { 
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Failed to retrieve payment intent', { 
        error: error.message,
        paymentIntentId
      });
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   * @param {string} signature - Stripe signature header
   * @param {string} payload - Raw request body
   * @returns {Promise<Object>} Webhook event object
   */
  async handleWebhook(signature, payload) {
    try {
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      logger.info('Webhook event received', { 
        eventType: event.type,
        eventId: event.id
      });

      return event;
    } catch (error) {
      logger.error('Failed to handle webhook', { 
        error: error.message,
        signature: signature ? 'present' : 'missing'
      });
      throw error;
    }
  }

  /**
   * Create a customer in Stripe
   * @param {string} email - Customer email
   * @param {string} name - Customer name
   * @param {Object} metadata - Additional customer metadata
   * @returns {Promise<Object>} Customer object
   */
  async createCustomer(email, name, metadata = {}) {
    try {
      logger.info('Creating Stripe customer', { email, name });
      
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata,
      });

      logger.info('Stripe customer created successfully', { 
        customerId: customer.id,
        email: customer.email
      });

      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', { 
        error: error.message,
        email,
        name
      });
      throw error;
    }
  }

  /**
   * Update payment intent metadata
   * @param {string} paymentIntentId - Payment intent ID
   * @param {Object} metadata - Metadata to update
   * @returns {Promise<Object>} Updated payment intent
   */
  async updatePaymentIntentMetadata(paymentIntentId, metadata) {
    try {
      logger.info('Updating payment intent metadata', { paymentIntentId, metadata });
      
      const paymentIntent = await this.stripe.paymentIntents.update(paymentIntentId, {
        metadata,
      });

      logger.info('Payment intent metadata updated successfully', { 
        paymentIntentId: paymentIntent.id
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Failed to update payment intent metadata', { 
        error: error.message,
        paymentIntentId,
        metadata
      });
      throw error;
    }
  }
}

module.exports = new StripeService();