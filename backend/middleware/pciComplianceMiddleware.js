/**
 * PCI DSS Compliance Middleware
 * Implements Payment Card Industry Data Security Standard requirements
 */

const logger = require('../utils/logger');
const encryptionUtil = require('../utils/encryption');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * PCI DSS Requirement 3: Protect stored cardholder data
 * Middleware to prevent storage of sensitive authentication data
 */
const preventCardDataStorage = (req, res, next) => {
  // List of prohibited fields that should never be stored
  const prohibitedFields = [
    'cvv', 'cvc', 'cvc2', 'cvv2', 'cid', 'csc',
    'track1', 'track2', 'track_data',
    'magnetic_stripe', 'chip_data',
    'pin', 'pin_block'
  ];
  
  // Check request body for prohibited fields
  if (req.body && typeof req.body === 'object') {
    const foundProhibited = [];
    
    const checkObject = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        // Check if key matches prohibited field
        if (prohibitedFields.some(field => 
          key.toLowerCase().includes(field.toLowerCase())
        )) {
          foundProhibited.push(currentPath);
        }
        
        // Recursively check nested objects
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          checkObject(value, currentPath);
        }
      }
    };
    
    checkObject(req.body);
    
    if (foundProhibited.length > 0) {
      logger.logSecurityViolation('PCI_PROHIBITED_DATA_ATTEMPT', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method,
        prohibitedFields: foundProhibited,
        userId: req.user?.id || null
      });
      
      const keyValueTable = {
        error: 'Prohibited payment data detected',
        prohibitedFields: foundProhibited,
        pciRequirement: 'PCI DSS Requirement 3'
      };
      
      return res.status(400).json(
        ResponseFormatter.failure('Invalid payment data', keyValueTable)
      );
    }
  }
  
  next();
};

/**
 * PCI DSS Requirement 4: Encrypt transmission of cardholder data
 * Ensure HTTPS is used for payment-related endpoints
 */
const enforceHttpsForPayments = (req, res, next) => {
  // Skip in development environment
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  // Check if request is secure
  const isSecure = req.secure || 
                   req.headers['x-forwarded-proto'] === 'https' ||
                   req.headers['x-forwarded-ssl'] === 'on';
  
  if (!isSecure) {
    logger.logSecurityViolation('PCI_INSECURE_PAYMENT_REQUEST', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method,
      protocol: req.protocol,
      headers: {
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-ssl': req.headers['x-forwarded-ssl']
      },
      userId: req.user?.id || null
    });
    
    const keyValueTable = {
      error: 'HTTPS required for payment operations',
      pciRequirement: 'PCI DSS Requirement 4',
      redirectUrl: `https://${req.get('host')}${req.originalUrl}`
    };
    
    return res.status(426).json(
      ResponseFormatter.failure('Upgrade Required - HTTPS only', keyValueTable)
    );
  }
  
  next();
};

/**
 * PCI DSS Requirement 7: Restrict access to cardholder data
 * Validate user authorization for payment operations
 */
const validatePaymentAccess = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    const keyValueTable = {
      error: 'Authentication required for payment operations',
      pciRequirement: 'PCI DSS Requirement 7'
    };
    
    return res.status(401).json(
      ResponseFormatter.failure('Authentication required', keyValueTable)
    );
  }
  
  // Check if user has payment access
  const allowedRoles = ['customer', 'admin', 'staff'];
  if (!allowedRoles.includes(req.user.role)) {
    logger.logSecurityViolation('PCI_UNAUTHORIZED_PAYMENT_ACCESS', {
      ip: req.ip,
      userId: req.user.id,
      userRole: req.user.role,
      url: req.originalUrl,
      method: req.method
    });
    
    const keyValueTable = {
      error: 'Insufficient permissions for payment operations',
      userRole: req.user.role,
      requiredRoles: allowedRoles,
      pciRequirement: 'PCI DSS Requirement 7'
    };
    
    return res.status(403).json(
      ResponseFormatter.failure('Access denied', keyValueTable)
    );
  }
  
  next();
};

/**
 * PCI DSS Requirement 8: Identify and authenticate access
 * Enhanced authentication for payment operations
 */
const enhancedPaymentAuth = (req, res, next) => {
  // Check session validity
  if (!req.user.sessionId) {
    const keyValueTable = {
      error: 'Valid session required for payment operations',
      pciRequirement: 'PCI DSS Requirement 8'
    };
    
    return res.status(401).json(
      ResponseFormatter.failure('Invalid session', keyValueTable)
    );
  }
  
  // For high-value transactions, require additional verification
  const transactionAmount = req.body.amount || 0;
  const highValueThreshold = parseFloat(process.env.HIGH_VALUE_THRESHOLD) || 1000;
  
  if (transactionAmount > highValueThreshold) {
    // In a real implementation, this would check for 2FA or additional verification
    logger.info('High-value transaction detected', {
      userId: req.user.id,
      amount: transactionAmount,
      threshold: highValueThreshold,
      requiresAdditionalAuth: true
    });
    
    // For now, just log the high-value transaction
    // In production, implement 2FA verification here
  }
  
  next();
};

/**
 * PCI DSS Requirement 10: Track and monitor access to network resources
 * Log all payment-related activities
 */
const logPaymentActivity = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('Payment operation started', {
    userId: req.user?.id || 'anonymous',
    sessionId: req.user?.sessionId ? encryptionUtil.maskSensitiveData(req.user.sessionId) : null,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
    pciAudit: true
  });
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log response (without sensitive data)
    logger.info('Payment operation completed', {
      userId: req.user?.id || 'anonymous',
      sessionId: req.user?.sessionId ? encryptionUtil.maskSensitiveData(req.user.sessionId) : null,
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      success: res.statusCode < 400,
      timestamp: new Date().toISOString(),
      pciAudit: true
    });
    
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Sanitize payment response data
 * Remove sensitive information from API responses
 */
const sanitizePaymentResponse = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Fields to remove or mask in responses
    const sensitiveFields = [
      'card_number', 'cardNumber', 'number',
      'cvv', 'cvc', 'cvc2', 'cvv2',
      'track1', 'track2', 'track_data',
      'pin', 'pin_block',
      'account_number', 'routing_number'
    ];
    
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      const sanitized = { ...obj };
      
      for (const [key, value] of Object.entries(sanitized)) {
        // Check if field should be sanitized
        if (sensitiveFields.some(field => 
          key.toLowerCase().includes(field.toLowerCase())
        )) {
          if (typeof value === 'string') {
            sanitized[key] = encryptionUtil.maskSensitiveData(value);
          } else {
            sanitized[key] = '[REDACTED]';
          }
        } else if (value && typeof value === 'object') {
          sanitized[key] = sanitizeObject(value);
        }
      }
      
      return sanitized;
    };
    
    const sanitizedData = sanitizeObject(data);
    return originalJson.call(this, sanitizedData);
  };
  
  next();
};

/**
 * Validate PCI DSS environment configuration
 */
const validatePciEnvironment = () => {
  const requiredEnvVars = [
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ];
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    logger.error('PCI compliance check failed - missing environment variables', {
      missingVars: missing,
      pciRequirement: 'PCI DSS Requirements 3, 4, 8'
    });
    
    throw new Error(`PCI compliance error: Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate encryption key strength
  const keyValidation = encryptionUtil.validateKeyStrength(process.env.ENCRYPTION_KEY);
  if (!keyValidation.valid) {
    logger.error('PCI compliance check failed - weak encryption key', {
      issues: keyValidation.issues,
      score: keyValidation.score,
      pciRequirement: 'PCI DSS Requirement 3'
    });
    
    throw new Error('PCI compliance error: Encryption key does not meet security requirements');
  }
  
  logger.info('PCI DSS environment validation passed', {
    encryptionKeyScore: keyValidation.score,
    requiredVarsPresent: requiredEnvVars.length
  });
};

/**
 * Complete PCI compliance middleware stack for payment endpoints
 */
const pciCompliantPaymentMiddleware = [
  enforceHttpsForPayments,
  validatePaymentAccess,
  enhancedPaymentAuth,
  preventCardDataStorage,
  logPaymentActivity,
  sanitizePaymentResponse
];

/**
 * Basic PCI compliance middleware for payment-adjacent endpoints
 */
const basicPciMiddleware = [
  enforceHttpsForPayments,
  logPaymentActivity,
  sanitizePaymentResponse
];

module.exports = {
  preventCardDataStorage,
  enforceHttpsForPayments,
  validatePaymentAccess,
  enhancedPaymentAuth,
  logPaymentActivity,
  sanitizePaymentResponse,
  validatePciEnvironment,
  pciCompliantPaymentMiddleware,
  basicPciMiddleware
};