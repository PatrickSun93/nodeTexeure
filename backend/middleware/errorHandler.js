const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Comprehensive Error Handling Middleware
 * Handles different types of errors with appropriate responses and logging
 */

class ErrorHandler {
  /**
   * Main error handling middleware
   */
  static handle(err, req, res, next) {
    // Log the error
    logger.error('Unhandled error occurred', err);

    // Determine error type and create appropriate response
    const errorResponse = ErrorHandler.categorizeError(err);
    
    // Set appropriate HTTP status code
    res.status(errorResponse.statusCode);
    
    // Send formatted response
    res.json(ResponseFormatter.failure(errorResponse.message, errorResponse.details));
  }

  /**
   * Categorize error and determine appropriate response
   */
  static categorizeError(err) {
    // Payment errors (Stripe)
    if (err.type && err.type.startsWith('Stripe')) {
      return ErrorHandler.handlePaymentError(err);
    }

    // Database errors
    if (err.code && (err.code.startsWith('ER_') || err.errno)) {
      return ErrorHandler.handleDatabaseError(err);
    }

    // Validation errors
    if (err.name === 'ValidationError' || err.message.includes('validation')) {
      return ErrorHandler.handleValidationError(err);
    }

    // Authentication/Authorization errors
    if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
      return ErrorHandler.handleAuthError(err);
    }

    // Rate limiting errors
    if (err.message.includes('rate limit') || err.status === 429) {
      return ErrorHandler.handleRateLimitError(err);
    }

    // External API errors
    if (err.message.includes('FedEx') || err.message.includes('AWS') || err.message.includes('SES')) {
      return ErrorHandler.handleExternalAPIError(err);
    }

    // Inventory errors
    if (err.message.includes('stock') || err.message.includes('inventory')) {
      return ErrorHandler.handleInventoryError(err);
    }

    // Default server error
    return ErrorHandler.handleGenericError(err);
  }

  /**
   * Handle payment-related errors
   */
  static handlePaymentError(err) {
    const paymentErrorMap = {
      'card_declined': {
        statusCode: 402,
        message: 'Your card was declined. Please try a different payment method.',
        userMessage: 'Payment declined - please try another card'
      },
      'insufficient_funds': {
        statusCode: 402,
        message: 'Insufficient funds. Please check your account balance or try a different card.',
        userMessage: 'Insufficient funds - please try another payment method'
      },
      'expired_card': {
        statusCode: 402,
        message: 'Your card has expired. Please use a different payment method.',
        userMessage: 'Card expired - please use a different card'
      },
      'incorrect_cvc': {
        statusCode: 402,
        message: 'The security code is incorrect. Please check and try again.',
        userMessage: 'Incorrect security code'
      },
      'processing_error': {
        statusCode: 402,
        message: 'There was an error processing your payment. Please try again.',
        userMessage: 'Payment processing error - please try again'
      },
      'authentication_required': {
        statusCode: 402,
        message: 'Additional authentication is required for this payment.',
        userMessage: 'Additional authentication required'
      }
    };

    const errorType = err.decline_code || err.code || 'processing_error';
    const errorInfo = paymentErrorMap[errorType] || paymentErrorMap['processing_error'];

    return {
      statusCode: errorInfo.statusCode,
      message: errorInfo.userMessage,
      details: {
        type: 'payment_error',
        error_code: errorType,
        retry_allowed: true,
        suggested_actions: [
          'Try a different payment method',
          'Check your card details',
          'Contact your bank if the problem persists'
        ]
      }
    };
  }

  /**
   * Handle database-related errors
   */
  static handleDatabaseError(err) {
    const dbErrorMap = {
      'ER_DUP_ENTRY': {
        statusCode: 409,
        message: 'This record already exists.',
        userMessage: 'Duplicate entry - record already exists'
      },
      'ER_NO_REFERENCED_ROW': {
        statusCode: 400,
        message: 'Referenced record does not exist.',
        userMessage: 'Invalid reference - related record not found'
      },
      'ER_ROW_IS_REFERENCED': {
        statusCode: 409,
        message: 'Cannot delete record as it is being used elsewhere.',
        userMessage: 'Cannot delete - record is in use'
      },
      'ER_DATA_TOO_LONG': {
        statusCode: 400,
        message: 'Data is too long for the field.',
        userMessage: 'Input data is too long'
      },
      'ER_BAD_NULL_ERROR': {
        statusCode: 400,
        message: 'Required field cannot be empty.',
        userMessage: 'Required field is missing'
      },
      'ECONNREFUSED': {
        statusCode: 503,
        message: 'Database connection failed. Please try again later.',
        userMessage: 'Service temporarily unavailable'
      }
    };

    const errorCode = err.code || 'UNKNOWN_DB_ERROR';
    const errorInfo = dbErrorMap[errorCode] || {
      statusCode: 500,
      message: 'Database error occurred.',
      userMessage: 'Database error - please try again'
    };

    return {
      statusCode: errorInfo.statusCode,
      message: errorInfo.userMessage,
      details: {
        type: 'database_error',
        error_code: errorCode,
        retry_allowed: errorCode === 'ECONNREFUSED'
      }
    };
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(err) {
    return {
      statusCode: 400,
      message: 'Invalid input data provided.',
      details: {
        type: 'validation_error',
        validation_errors: ErrorHandler.extractValidationErrors(err),
        retry_allowed: true
      }
    };
  }

  /**
   * Handle authentication/authorization errors
   */
  static handleAuthError(err) {
    return {
      statusCode: 401,
      message: 'Authentication required or access denied.',
      details: {
        type: 'auth_error',
        retry_allowed: false,
        suggested_actions: ['Please log in again', 'Check your permissions']
      }
    };
  }

  /**
   * Handle rate limiting errors
   */
  static handleRateLimitError(err) {
    return {
      statusCode: 429,
      message: 'Too many requests. Please wait before trying again.',
      details: {
        type: 'rate_limit_error',
        retry_allowed: true,
        retry_after: err.retryAfter || 60,
        suggested_actions: ['Wait a moment before trying again']
      }
    };
  }

  /**
   * Handle external API errors
   */
  static handleExternalAPIError(err) {
    let service = 'external service';
    if (err.message.includes('FedEx')) service = 'shipping service';
    if (err.message.includes('AWS') || err.message.includes('SES')) service = 'email service';

    return {
      statusCode: 503,
      message: `${service} is temporarily unavailable. Please try again later.`,
      details: {
        type: 'external_api_error',
        service: service,
        retry_allowed: true,
        suggested_actions: ['Try again in a few minutes', 'Contact support if problem persists']
      }
    };
  }

  /**
   * Handle inventory-related errors
   */
  static handleInventoryError(err) {
    if (err.message.includes('Insufficient')) {
      return {
        statusCode: 409,
        message: 'Not enough items in stock for your request.',
        details: {
          type: 'inventory_error',
          error_subtype: 'insufficient_stock',
          retry_allowed: false,
          suggested_actions: [
            'Reduce quantity',
            'Check product availability',
            'Try again later as stock may be replenished'
          ]
        }
      };
    }

    if (err.message.includes('reservation')) {
      return {
        statusCode: 409,
        message: 'Unable to reserve items. Please try again.',
        details: {
          type: 'inventory_error',
          error_subtype: 'reservation_failed',
          retry_allowed: true,
          suggested_actions: ['Try again immediately', 'Refresh the page']
        }
      };
    }

    return {
      statusCode: 500,
      message: 'Inventory system error. Please try again.',
      details: {
        type: 'inventory_error',
        error_subtype: 'general',
        retry_allowed: true
      }
    };
  }

  /**
   * Handle generic errors
   */
  static handleGenericError(err) {
    return {
      statusCode: 500,
      message: 'An unexpected error occurred. Please try again.',
      details: {
        type: 'server_error',
        retry_allowed: true,
        suggested_actions: ['Try again in a moment', 'Contact support if problem persists']
      }
    };
  }

  /**
   * Extract validation errors from error object
   */
  static extractValidationErrors(err) {
    const errors = [];

    if (err.errors) {
      // Mongoose-style validation errors
      Object.keys(err.errors).forEach(field => {
        errors.push({
          field: field,
          message: err.errors[field].message
        });
      });
    } else if (err.details) {
      // Joi-style validation errors
      err.details.forEach(detail => {
        errors.push({
          field: detail.path.join('.'),
          message: detail.message
        });
      });
    } else {
      // Generic validation error
      errors.push({
        field: 'general',
        message: err.message
      });
    }

    return errors;
  }

  /**
   * Async error wrapper for route handlers
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Create custom error with specific type
   */
  static createError(message, type = 'generic', statusCode = 500, details = {}) {
    const error = new Error(message);
    error.type = type;
    error.statusCode = statusCode;
    error.details = details;
    return error;
  }
}

module.exports = ErrorHandler;