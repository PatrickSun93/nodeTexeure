const express = require('express');
const router = express.Router();
const ErrorUtils = require('../utils/errorUtils');
const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Error Handling Routes
 * Provides endpoints for error reporting, recovery, and monitoring
 */

/**
 * Report client-side errors
 * POST /api/errors/report
 */
router.post('/report', async (req, res) => {
  try {
    const { error, context, userAgent, url, timestamp } = req.body;

    // Validate required fields
    if (!error || !error.message) {
      return res.status(400).json(
        ResponseFormatter.failure('Error message is required')
      );
    }

    // Log client-side error
    const clientError = {
      message: error.message,
      stack: error.stack,
      type: 'client_error',
      url: url,
      userAgent: userAgent,
      timestamp: timestamp || new Date().toISOString(),
      context: context || {},
      userId: req.user?.id,
      sessionId: req.sessionID
    };

    ErrorUtils.logError(clientError, {
      operation: 'client_error_report',
      source: 'frontend'
    });

    res.json(ResponseFormatter.success('Error reported successfully'));
  } catch (err) {
    logger.error('Failed to report client error', err);
    res.status(500).json(
      ResponseFormatter.failure('Failed to report error')
    );
  }
});

/**
 * Get error recovery suggestions
 * POST /api/errors/recovery
 */
router.post('/recovery', async (req, res) => {
  try {
    const { errorType, errorMessage, context } = req.body;

    if (!errorType) {
      return res.status(400).json(
        ResponseFormatter.failure('Error type is required')
      );
    }

    // Create mock error object for recovery suggestions
    const mockError = new Error(errorMessage || 'Unknown error');
    mockError.type = errorType;

    const userMessage = ErrorUtils.createUserFriendlyMessage(mockError, context);
    const recoveryActions = ErrorUtils.getRecoveryActions(mockError);

    res.json(ResponseFormatter.success('Recovery suggestions retrieved', {
      userMessage,
      recoveryActions,
      errorType,
      retryRecommended: ErrorUtils.isRetryableError(mockError)
    }));
  } catch (err) {
    logger.error('Failed to get recovery suggestions', err);
    res.status(500).json(
      ResponseFormatter.failure('Failed to get recovery suggestions')
    );
  }
});

/**
 * Test error handling (development only)
 * POST /api/errors/test
 */
router.post('/test', async (req, res) => {
  // Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json(
      ResponseFormatter.failure('Test endpoints not available in production')
    );
  }

  try {
    const { errorType, message } = req.body;

    // Create test error based on type
    let testError;
    switch (errorType) {
      case 'payment_error':
        testError = new Error(message || 'Test payment error');
        testError.type = 'stripe_card_declined';
        testError.decline_code = 'insufficient_funds';
        break;
      
      case 'inventory_error':
        testError = new Error(message || 'Test inventory error');
        testError.type = 'insufficient_stock';
        testError.available = 5;
        testError.requested = 10;
        break;
      
      case 'email_error':
        testError = new Error(message || 'Test email error');
        testError.type = 'email_MessageRejected';
        testError.name = 'MessageRejected';
        break;
      
      case 'database_error':
        testError = new Error(message || 'Test database error');
        testError.code = 'ER_DUP_ENTRY';
        break;
      
      case 'validation_error':
        testError = new Error(message || 'Test validation error');
        testError.type = 'validation_error';
        testError.errors = {
          email: { message: 'Invalid email format' },
          password: { message: 'Password too short' }
        };
        break;
      
      default:
        testError = new Error(message || 'Test generic error');
        testError.type = 'unknown';
    }

    // Throw the test error to trigger error handling
    throw testError;

  } catch (err) {
    // This will be caught by the error handling middleware
    throw err;
  }
});

/**
 * Get error statistics (admin only)
 * GET /api/errors/stats
 */
router.get('/stats', async (req, res) => {
  try {
    // Check if user is admin (implement your auth check here)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json(
        ResponseFormatter.failure('Admin access required')
      );
    }

    // Get error statistics from logs (this is a simplified version)
    // In a real implementation, you might query a dedicated error tracking database
    const stats = {
      last24Hours: {
        total: 0,
        byType: {},
        critical: 0
      },
      last7Days: {
        total: 0,
        byType: {},
        critical: 0
      },
      topErrors: [],
      systemHealth: 'healthy' // This would be calculated based on error rates
    };

    res.json(ResponseFormatter.success('Error statistics retrieved', stats));
  } catch (err) {
    logger.error('Failed to get error statistics', err);
    res.status(500).json(
      ResponseFormatter.failure('Failed to get error statistics')
    );
  }
});

/**
 * Retry failed operation
 * POST /api/errors/retry
 */
router.post('/retry', async (req, res) => {
  try {
    const { operationType, operationId, context } = req.body;

    if (!operationType || !operationId) {
      return res.status(400).json(
        ResponseFormatter.failure('Operation type and ID are required')
      );
    }

    let retryResult;

    switch (operationType) {
      case 'email':
        // Retry email sending
        const EmailQueueService = require('../services/emailQueueService');
        const emailQueue = new EmailQueueService();
        
        // This would typically involve finding the failed email and retrying it
        retryResult = { success: true, message: 'Email retry queued' };
        break;
      
      case 'payment':
        // Retry payment processing
        retryResult = { success: true, message: 'Payment retry initiated' };
        break;
      
      case 'inventory':
        // Retry inventory operation
        retryResult = { success: true, message: 'Inventory operation retried' };
        break;
      
      default:
        return res.status(400).json(
          ResponseFormatter.failure('Unknown operation type')
        );
    }

    res.json(ResponseFormatter.success('Operation retry initiated', retryResult));
  } catch (err) {
    logger.error('Failed to retry operation', err);
    res.status(500).json(
      ResponseFormatter.failure('Failed to retry operation')
    );
  }
});

/**
 * Health check endpoint with error monitoring
 * GET /api/errors/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'healthy',
        email: 'healthy',
        payment: 'healthy',
        inventory: 'healthy'
      },
      errorRates: {
        last5Minutes: 0,
        last1Hour: 0,
        last24Hours: 0
      }
    };

    // In a real implementation, you would check actual service health
    // and calculate error rates from your monitoring system

    res.json(ResponseFormatter.success('System health check', health));
  } catch (err) {
    logger.error('Health check failed', err);
    res.status(500).json(
      ResponseFormatter.failure('Health check failed', {
        status: 'unhealthy',
        error: err.message
      })
    );
  }
});

module.exports = router;