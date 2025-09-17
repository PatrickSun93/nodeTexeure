const logger = require('./logger');

/**
 * Error Utilities for Enhanced Error Handling
 * Provides retry logic, error classification, and recovery mechanisms
 */

class ErrorUtils {
  /**
   * Retry mechanism with exponential backoff
   */
  static async retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000, maxDelay = 10000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();

        // Log successful retry if it wasn't the first attempt
        if (attempt > 1) {
          logger.info(`Operation succeeded on attempt ${attempt}`, {
            total_attempts: attempt,
            operation: operation.name || 'anonymous'
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Don't retry on certain types of errors
        if (!ErrorUtils.isRetryableError(error)) {
          logger.error(`Non-retryable error encountered on attempt ${attempt}`, {
            error: error.message,
            error_type: error.type || 'unknown',
            operation: operation.name || 'anonymous'
          });
          throw error;
        }

        // Don't wait after the last attempt
        if (attempt === maxRetries) {
          logger.error(`Operation failed after ${maxRetries} attempts`, {
            error: error.message,
            operation: operation.name || 'anonymous'
          });
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          maxDelay
        );

        logger.info(`Operation failed on attempt ${attempt}, retrying in ${delay}ms`, {
          error: error.message,
          attempt,
          max_retries: maxRetries,
          delay,
          operation: operation.name || 'anonymous'
        });

        await ErrorUtils.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Determine if an error is retryable
   */
  static isRetryableError(error) {
    // Network errors are generally retryable
    if (error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET') {
      return true;
    }

    // Check error message for network-related issues
    if (error.message && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('network') ||
      error.message.includes('timeout')
    )) {
      return true;
    }

    // HTTP status codes that are retryable
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;
      return status >= 500 || status === 429; // Server errors and rate limiting
    }

    // Error types that are retryable
    if (error.type) {
      const retryableTypes = [
        'rate_limit_error',
        'network_error',
        'timeout_error',
        'server_error',
        'circuit_breaker_open',
        'api_connection_error',
        'api_error'
      ];

      // Check if error type matches any retryable type
      if (retryableTypes.some(type => error.type.includes(type))) {
        return true;
      }
    }

    // Stripe errors that are retryable
    if (error.type && error.type.startsWith('Stripe')) {
      const retryableStripeErrors = [
        'api_connection_error',
        'api_error',
        'rate_limit_error'
      ];
      return retryableStripeErrors.includes(error.type);
    }

    // Database connection errors
    if (error.code === 'PROTOCOL_CONNECTION_LOST' ||
      error.code === 'PROTOCOL_ENQUEUE_AFTER_QUIT' ||
      error.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR') {
      return true;
    }

    // Email service errors that are retryable
    if (error.message && (
      error.message.includes('Throttling') ||
      error.message.includes('ServiceUnavailable') ||
      error.message.includes('InternalFailure')
    )) {
      return true;
    }

    // Non-retryable error patterns
    const nonRetryablePatterns = [
      'validation',
      'invalid',
      'unauthorized',
      'forbidden',
      'not found',
      'bad request'
    ];

    if (error.message) {
      const lowerMessage = error.message.toLowerCase();
      if (nonRetryablePatterns.some(pattern => lowerMessage.includes(pattern))) {
        return false;
      }
    }

    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Circuit breaker pattern implementation
   */
  static createCircuitBreaker(operation, options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000,
      monitoringPeriod = 60000
    } = options;

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failureCount = 0;
    let lastFailureTime = null;
    let successCount = 0;

    return async function circuitBreakerWrapper(...args) {
      // Check if circuit should be reset
      if (state === 'OPEN' && Date.now() - lastFailureTime > resetTimeout) {
        state = 'HALF_OPEN';
        successCount = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      }

      // Reject immediately if circuit is open
      if (state === 'OPEN') {
        const error = new Error('Circuit breaker is OPEN - service unavailable');
        error.type = 'circuit_breaker_open';
        throw error;
      }

      try {
        const result = await operation(...args);

        // Success in HALF_OPEN state
        if (state === 'HALF_OPEN') {
          successCount++;
          if (successCount >= 3) { // Require 3 successes to close
            state = 'CLOSED';
            failureCount = 0;
            logger.info('Circuit breaker CLOSED - service recovered');
          }
        } else if (state === 'CLOSED') {
          // Reset failure count on success
          failureCount = 0;
        }

        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = Date.now();

        // Open circuit if threshold reached
        if (state === 'CLOSED' && failureCount >= failureThreshold) {
          state = 'OPEN';
          logger.error(`Circuit breaker OPENED after ${failureCount} failures`, {
            operation: operation.name || 'anonymous',
            error: error.message
          });
        } else if (state === 'HALF_OPEN') {
          state = 'OPEN';
          logger.error('Circuit breaker returned to OPEN state after failure in HALF_OPEN');
        }

        throw error;
      }
    };
  }

  /**
   * Enhanced error logging with context
   */
  static logError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      type: error.type || 'unknown',
      code: error.code,
      status: error.status || error.statusCode,
      timestamp: new Date().toISOString(),
      context
    };

    logger.error('Enhanced error logging', errorInfo);

    // Log to external monitoring service if configured
    if (process.env.ERROR_MONITORING_ENABLED === 'true') {
      ErrorUtils.sendToMonitoring(errorInfo);
    }
  }

  /**
   * Send error to external monitoring service
   */
  static async sendToMonitoring(errorInfo) {
    try {
      // Placeholder for external monitoring integration
      // Could integrate with services like Sentry, DataDog, etc.
      logger.info('Error sent to monitoring service', {
        error_id: errorInfo.timestamp,
        error_type: errorInfo.type
      });
    } catch (monitoringError) {
      logger.error('Failed to send error to monitoring service', monitoringError);
    }
  }

  /**
   * Create user-friendly error messages
   */
  static createUserFriendlyMessage(error, context = {}) {
    const errorType = error.type || 'unknown';
    const userMessages = {
      'payment_error': 'There was an issue processing your payment. Please try again or use a different payment method.',
      'inventory_error': 'Some items in your cart are no longer available. Please review your cart and try again.',
      'email_error': 'We couldn\'t send your email notification, but your request was processed successfully.',
      'shipping_error': 'There was an issue calculating shipping costs. Please try again or contact support.',
      'database_error': 'We\'re experiencing technical difficulties. Please try again in a moment.',
      'external_api_error': 'One of our services is temporarily unavailable. Please try again later.',
      'validation_error': 'Please check your input and try again.',
      'auth_error': 'Please log in again to continue.',
      'rate_limit_error': 'You\'re making requests too quickly. Please wait a moment and try again.',
      'circuit_breaker_open': 'This service is temporarily unavailable. Please try again later.',
      'unknown': 'An unexpected error occurred. Please try again or contact support if the problem persists.'
    };

    return userMessages[errorType] || userMessages['unknown'];
  }

  /**
   * Error recovery suggestions
   */
  static getRecoveryActions(error) {
    const errorType = error.type || 'unknown';
    const recoveryActions = {
      'payment_error': [
        'Try a different payment method',
        'Check your card details',
        'Contact your bank',
        'Try again in a few minutes'
      ],
      'inventory_error': [
        'Reduce the quantity',
        'Remove unavailable items from cart',
        'Check back later for restocked items'
      ],
      'email_error': [
        'Check your email address',
        'Look in your spam folder',
        'Contact support for manual confirmation'
      ],
      'shipping_error': [
        'Verify your shipping address',
        'Try a different shipping method',
        'Contact support for assistance'
      ],
      'database_error': [
        'Try again in a moment',
        'Refresh the page',
        'Contact support if problem persists'
      ],
      'external_api_error': [
        'Try again in a few minutes',
        'Check service status page',
        'Contact support if urgent'
      ],
      'validation_error': [
        'Check all required fields',
        'Verify data format',
        'Review error messages'
      ],
      'auth_error': [
        'Log in again',
        'Check your credentials',
        'Reset your password if needed'
      ],
      'rate_limit_error': [
        'Wait a moment before trying again',
        'Reduce request frequency'
      ],
      'circuit_breaker_open': [
        'Try again in a few minutes',
        'Check service status',
        'Contact support if urgent'
      ],
      'unknown': [
        'Try again',
        'Refresh the page',
        'Contact support with error details'
      ]
    };

    return recoveryActions[errorType] || recoveryActions['unknown'];
  }

  /**
   * Graceful degradation helper
   */
  static async withFallback(primaryOperation, fallbackOperation, context = {}) {
    try {
      return await primaryOperation();
    } catch (primaryError) {
      logger.info('Primary operation failed, attempting fallback', {
        primary_error: primaryError.message,
        context
      });

      try {
        const fallbackResult = await fallbackOperation();
        logger.info('Fallback operation succeeded', { context });
        return fallbackResult;
      } catch (fallbackError) {
        logger.error('Both primary and fallback operations failed', {
          primary_error: primaryError.message,
          fallback_error: fallbackError.message,
          context
        });
        throw primaryError; // Throw the original error
      }
    }
  }

  /**
   * Batch operation error handling
   */
  static async processBatchWithErrorHandling(items, processor, options = {}) {
    const {
      maxConcurrency = 5,
      continueOnError = true,
      collectErrors = true
    } = options;

    const results = [];
    const errors = [];
    const chunks = ErrorUtils.chunkArray(items, maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (item, index) => {
        try {
          const result = await processor(item, index);
          return { success: true, item, result };
        } catch (error) {
          const errorInfo = { success: false, item, error };

          if (collectErrors) {
            errors.push(errorInfo);
          }

          if (!continueOnError) {
            throw error;
          }

          return errorInfo;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return {
      results,
      errors,
      successCount: results.filter(r => r.success).length,
      errorCount: errors.length,
      totalCount: items.length
    };
  }

  /**
   * Utility to chunk array for batch processing
   */
  static chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

module.exports = ErrorUtils;