const Stripe = require('stripe');
const logger = require('../utils/logger');
const ErrorUtils = require('../utils/errorUtils');

class StripeService {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Create circuit breaker for Stripe operations
    this.createPaymentIntentWithCircuitBreaker = ErrorUtils.createCircuitBreaker(
      this._createPaymentIntentInternal.bind(this),
      { failureThreshold: 3, resetTimeout: 30000 }
    );
  }

  /**
   * Create a payment intent for processing payment
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code (e.g., 'usd')
   * @param {Object} metadata - Additional metadata for the payment
   * @returns {Promise<Object>} Payment intent object
   */
  async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    return await ErrorUtils.retryWithBackoff(
      async () => {
        return await this.createPaymentIntentWithCircuitBreaker(amount, currency, metadata);
      },
      3, // maxRetries
      1000, // baseDelay
      5000 // maxDelay
    );
  }

  /**
   * Internal method for creating payment intent (used by circuit breaker)
   */
  async _createPaymentIntentInternal(amount, currency = 'usd', metadata = {}) {
    try {
      // Validate input parameters
      if (!amount || amount <= 0) {
        const error = new Error('Invalid amount provided');
        error.type = 'validation_error';
        throw error;
      }

      if (!currency || typeof currency !== 'string') {
        const error = new Error('Invalid currency provided');
        error.type = 'validation_error';
        throw error;
      }

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
      // Enhance error with payment-specific context
      const enhancedError = this._enhancePaymentError(error, {
        operation: 'create_payment_intent',
        amount,
        currency,
        metadata
      });

      ErrorUtils.logError(enhancedError, {
        operation: 'create_payment_intent',
        amount,
        currency
      });

      throw enhancedError;
    }
  }

  /**
   * Confirm a payment intent with payment method
   * @param {string} paymentIntentId - Payment intent ID
   * @param {string} paymentMethodId - Payment method ID
   * @returns {Promise<Object>} Confirmed payment intent
   */
  async confirmPayment(paymentIntentId, paymentMethodId) {
    return await ErrorUtils.retryWithBackoff(
      async () => {
        try {
          // Validate input parameters
          if (!paymentIntentId) {
            const error = new Error('Payment intent ID is required');
            error.type = 'validation_error';
            throw error;
          }

          if (!paymentMethodId) {
            const error = new Error('Payment method ID is required');
            error.type = 'validation_error';
            throw error;
          }

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
          // Enhance error with payment-specific context
          const enhancedError = this._enhancePaymentError(error, {
            operation: 'confirm_payment',
            paymentIntentId,
            paymentMethodId
          });

          ErrorUtils.logError(enhancedError, {
            operation: 'confirm_payment',
            paymentIntentId
          });

          throw enhancedError;
        }
      },
      2, // maxRetries (fewer retries for confirmation)
      1000,
      3000
    );
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
    return await ErrorUtils.retryWithBackoff(
      async () => {
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
          const enhancedError = this._enhancePaymentError(error, {
            operation: 'update_payment_intent_metadata',
            paymentIntentId,
            metadata
          });

          ErrorUtils.logError(enhancedError, {
            operation: 'update_payment_intent_metadata',
            paymentIntentId
          });

          throw enhancedError;
        }
      },
      3,
      1000,
      5000
    );
  }

  /**
   * Enhance Stripe errors with additional context and user-friendly messages
   */
  _enhancePaymentError(error, context = {}) {
    // Create enhanced error object
    const enhancedError = new Error(error.message);
    enhancedError.originalError = error;
    enhancedError.context = context;
    enhancedError.timestamp = new Date().toISOString();

    // Set error type based on Stripe error type
    if (error.type) {
      enhancedError.type = `stripe_${error.type}`;
    } else {
      enhancedError.type = 'payment_error';
    }

    // Add Stripe-specific properties
    enhancedError.code = error.code;
    enhancedError.decline_code = error.decline_code;
    enhancedError.param = error.param;
    enhancedError.payment_intent = error.payment_intent;

    // Add user-friendly message
    enhancedError.userMessage = this._getPaymentErrorUserMessage(error);

    // Add recovery suggestions
    enhancedError.recoverySuggestions = this._getPaymentErrorRecovery(error);

    return enhancedError;
  }

  /**
   * Get user-friendly message for payment errors
   */
  _getPaymentErrorUserMessage(error) {
    const errorMessages = {
      'card_declined': 'Your card was declined. Please try a different payment method.',
      'insufficient_funds': 'Insufficient funds. Please check your account balance.',
      'expired_card': 'Your card has expired. Please use a different card.',
      'incorrect_cvc': 'The security code is incorrect. Please check and try again.',
      'processing_error': 'There was an error processing your payment. Please try again.',
      'authentication_required': 'Additional authentication is required for this payment.',
      'api_connection_error': 'Connection error. Please check your internet connection and try again.',
      'api_error': 'Payment service error. Please try again in a moment.',
      'rate_limit_error': 'Too many payment requests. Please wait a moment and try again.'
    };

    const errorType = error.decline_code || error.code || error.type || 'processing_error';
    return errorMessages[errorType] || 'Payment processing failed. Please try again.';
  }

  /**
   * Get recovery suggestions for payment errors
   */
  _getPaymentErrorRecovery(error) {
    const errorType = error.decline_code || error.code || error.type;
    
    const recoveryMap = {
      'card_declined': [
        'Try a different payment method',
        'Contact your bank to authorize the payment',
        'Check if your card supports online payments'
      ],
      'insufficient_funds': [
        'Check your account balance',
        'Try a different card',
        'Add funds to your account'
      ],
      'expired_card': [
        'Use a different card',
        'Update your card information',
        'Contact your bank for a new card'
      ],
      'incorrect_cvc': [
        'Check the security code on your card',
        'Re-enter the CVC number',
        'Try a different card if problem persists'
      ],
      'authentication_required': [
        'Complete the authentication process',
        'Check for SMS or email verification',
        'Contact your bank if needed'
      ],
      'api_connection_error': [
        'Check your internet connection',
        'Try again in a moment',
        'Contact support if problem persists'
      ],
      'rate_limit_error': [
        'Wait a moment before trying again',
        'Avoid multiple rapid payment attempts'
      ]
    };

    return recoveryMap[errorType] || [
      'Try again in a moment',
      'Use a different payment method',
      'Contact support if the problem persists'
    ];
  }
}

module.exports = new StripeService();