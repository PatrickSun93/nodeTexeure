const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Audit Logging Middleware for Security-Sensitive Operations
 * 
 * This middleware provides comprehensive audit logging for sensitive operations
 * including authentication, authorization, data modifications, and admin actions.
 */

/**
 * List of sensitive operations that require audit logging
 */
const SENSITIVE_OPERATIONS = {
  // Authentication operations
  'POST:/api/users/login': 'USER_LOGIN',
  'POST:/api/users/logout': 'USER_LOGOUT',
  'POST:/api/users/register': 'USER_REGISTER',
  'POST:/api/users/forgot-password': 'PASSWORD_RESET_REQUEST',
  'POST:/api/users/reset-password': 'PASSWORD_RESET',
  'POST:/api/users/verify-email': 'EMAIL_VERIFICATION',
  
  // Admin dashboard operations removed; privileged operations now handled via internal operations tools with RBAC
  
  // Payment operations
  'POST:/api/payments/create-intent': 'PAYMENT_INTENT_CREATE',
  'POST:/api/payments/confirm': 'PAYMENT_CONFIRM',
  'POST:/api/payments/refund': 'PAYMENT_REFUND',
  'POST:/api/payments/webhook': 'PAYMENT_WEBHOOK',
  
  // Order operations
  'POST:/api/orders': 'ORDER_CREATE',
  'PUT:/api/orders': 'ORDER_UPDATE',
  'DELETE:/api/orders': 'ORDER_CANCEL',
  'POST:/api/orders/refund': 'ORDER_REFUND',
  
  // Inventory operations
  'PUT:/api/inventory/stock': 'INVENTORY_UPDATE',
  'POST:/api/inventory/reserve': 'INVENTORY_RESERVE',
  'POST:/api/inventory/release': 'INVENTORY_RELEASE',
  
  // Coupon operations
  'POST:/api/coupons': 'COUPON_CREATE',
  'PUT:/api/coupons': 'COUPON_UPDATE',
  'DELETE:/api/coupons': 'COUPON_DELETE',
  'POST:/api/coupons/apply': 'COUPON_APPLY',
  
  // Email operations
  'POST:/api/emails/send': 'EMAIL_SEND',
  'POST:/api/emails/bulk': 'EMAIL_BULK_SEND',
  
  // Image operations
  'POST:/api/images/upload': 'IMAGE_UPLOAD',
  'DELETE:/api/images': 'IMAGE_DELETE'
};

/**
 * Extract sensitive data from request body for audit logging
 * Removes passwords and other sensitive information
 */
const sanitizeRequestData = (body, operation) => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = [
    'password', 'confirmPassword', 'currentPassword', 'newPassword',
    'token', 'refreshToken', 'secret', 'key', 'apiKey',
    'cardNumber', 'cvv', 'expiryDate', 'paymentMethod'
  ];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  // For payment operations, redact additional sensitive data
  if (operation && operation.includes('PAYMENT')) {
    if (sanitized.billing) {
      sanitized.billing = { ...sanitized.billing };
      if (sanitized.billing.cardNumber) sanitized.billing.cardNumber = '[REDACTED]';
      if (sanitized.billing.cvv) sanitized.billing.cvv = '[REDACTED]';
    }
  }
  
  return sanitized;
};

/**
 * Extract user context for audit logging
 */
const getUserContext = (req) => {
  const user = req.user || {};
  return {
    userId: user.id || null,
    email: user.email || null,
    role: user.role || 'anonymous',
    isAdmin: user.isAdmin || false,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent') || null,
    sessionId: req.sessionID || null
  };
};

/**
 * Main audit logging middleware
 */
const auditLogger = async (req, res, next) => {
  const startTime = Date.now();
  const operationKey = `${req.method}:${req.route ? req.route.path : req.path}`;
  const operation = SENSITIVE_OPERATIONS[operationKey];
  
  // Only log sensitive operations
  if (!operation) {
    return next();
  }
  
  const userContext = getUserContext(req);
  const requestData = sanitizeRequestData(req.body, operation);
  
  // Log the audit event
  const auditEvent = {
    timestamp: new Date().toISOString(),
    operation: operation,
    operationKey: operationKey,
    user: userContext,
    request: {
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query,
      body: requestData,
      headers: {
        'content-type': req.get('Content-Type'),
        'authorization': req.get('Authorization') ? '[PRESENT]' : '[ABSENT]',
        'x-csrf-token': req.get('X-CSRF-Token') ? '[PRESENT]' : '[ABSENT]'
      }
    },
    metadata: {
      requestId: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'audit_middleware'
    }
  };
  
  try {
    await logger.logAudit(auditEvent);
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't fail the request if audit logging fails
  }
  
  // Store original response methods to capture response data
  const originalJson = res.json;
  const originalSend = res.send;
  
  // Override res.json to capture response for audit
  res.json = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log the response asynchronously
    setImmediate(async () => {
      try {
        const responseAudit = {
          ...auditEvent,
          response: {
            statusCode: res.statusCode,
            success: res.statusCode >= 200 && res.statusCode < 300,
            responseTime: responseTime,
            data: sanitizeResponseData(data, operation)
          }
        };
        
        await logger.logAudit(responseAudit);
      } catch (error) {
        console.error('Failed to log audit response:', error);
      }
    });
    
    return originalJson.call(this, data);
  };
  
  // Override res.send for non-JSON responses
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    setImmediate(async () => {
      try {
        let responseData;
        try {
          responseData = typeof data === 'string' ? JSON.parse(data) : data;
        } catch {
          responseData = { rawData: '[NON_JSON_RESPONSE]' };
        }
        
        const responseAudit = {
          ...auditEvent,
          response: {
            statusCode: res.statusCode,
            success: res.statusCode >= 200 && res.statusCode < 300,
            responseTime: responseTime,
            data: sanitizeResponseData(responseData, operation)
          }
        };
        
        await logger.logAudit(responseAudit);
      } catch (error) {
        console.error('Failed to log audit response:', error);
      }
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Sanitize response data for audit logging
 */
const sanitizeResponseData = (data, operation) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sanitized = { ...data };
  
  // Remove sensitive response fields
  if (sanitized.token) sanitized.token = '[REDACTED]';
  if (sanitized.refreshToken) sanitized.refreshToken = '[REDACTED]';
  if (sanitized.password) sanitized.password = '[REDACTED]';
  
  // For payment operations, redact payment details
  if (operation && operation.includes('PAYMENT')) {
    if (sanitized.paymentMethod) {
      sanitized.paymentMethod = { type: sanitized.paymentMethod.type || 'unknown' };
    }
    if (sanitized.clientSecret) sanitized.clientSecret = '[REDACTED]';
  }
  
  return sanitized;
};

/**
 * Audit middleware specifically for failed authentication attempts
 */
const auditFailedAuth = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Check if this is a failed authentication response
    if (res.statusCode === 401 || res.statusCode === 403) {
      const userContext = getUserContext(req);
      const auditEvent = {
        timestamp: new Date().toISOString(),
        operation: 'AUTH_FAILURE',
        user: userContext,
        request: {
          method: req.method,
          url: req.originalUrl,
          body: sanitizeRequestData(req.body, 'AUTH_FAILURE')
        },
        response: {
          statusCode: res.statusCode,
          message: data.message || 'Authentication failed'
        },
        metadata: {
          requestId: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          source: 'auth_audit_middleware'
        }
      };
      
      setImmediate(async () => {
        try {
          await logger.logAudit(auditEvent);
        } catch (error) {
          console.error('Failed to log auth failure audit:', error);
        }
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

module.exports = {
  auditLogger,
  auditFailedAuth,
  SENSITIVE_OPERATIONS
};