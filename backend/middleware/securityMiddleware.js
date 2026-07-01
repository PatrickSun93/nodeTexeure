const { combinedRateLimit } = require('./rateLimitMiddleware');
const { auditLogger, auditFailedAuth } = require('./auditMiddleware');
const { sanitizeInput } = require('./validationMiddleware');
const { csrfProtection } = require('./csrfMiddleware');
const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Comprehensive Security Middleware Suite
 * 
 * Combines rate limiting, audit logging, input sanitization, and CSRF protection
 * into a unified security layer for the application.
 */

/**
 * Security headers middleware
 * Adds essential security headers to all responses
 */
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (basic)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com;");
  
  // Strict Transport Security (if HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

/**
 * Request size limiter to prevent DoS attacks
 */
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.headers['content-length'] || '0');
  
  if (contentLength > maxSize) {
    const keyValueTable = {
      error: 'Request too large',
      maxSize: `${maxSize / (1024 * 1024)}MB`,
      receivedSize: `${(contentLength / (1024 * 1024)).toFixed(2)}MB`
    };
    
    // Log security violation
    logger.logSecurityViolation('REQUEST_TOO_LARGE', {
      ip: req.ip,
      contentLength,
      maxSize,
      url: req.originalUrl
    });
    
    return res.status(413).json(
      ResponseFormatter.failure('Request entity too large', keyValueTable)
    );
  }
  
  next();
};

/**
 * Suspicious activity detector
 */
const suspiciousActivityDetector = (req, res, next) => {
  const suspiciousPatterns = [
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
    /(--|\/\*|\*\/|;)/g,
    /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/gi,
    
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    
    // Path traversal patterns
    /\.\.\//g,
    /\.\.\\/g,
    
    // Command injection patterns
    /[;&|`$()]/g
  ];
  
  const checkForSuspiciousContent = (obj, path = '') => {
    if (typeof obj === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(obj)) {
          return { found: true, pattern: pattern.toString(), value: obj, path };
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const result = checkForSuspiciousContent(value, `${path}.${key}`);
        if (result.found) {
          return result;
        }
      }
    }
    return { found: false };
  };
  
  // Check URL, query params, and body
  const urlCheck = checkForSuspiciousContent(req.originalUrl, 'url');
  const queryCheck = checkForSuspiciousContent(req.query, 'query');
  const bodyCheck = checkForSuspiciousContent(req.body, 'body');
  
  if (urlCheck.found || queryCheck.found || bodyCheck.found) {
    const suspiciousData = urlCheck.found ? urlCheck : (queryCheck.found ? queryCheck : bodyCheck);
    
    // Log security violation
    logger.logSecurityViolation('SUSPICIOUS_ACTIVITY', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method,
      suspiciousPattern: suspiciousData.pattern,
      suspiciousValue: suspiciousData.value.substring(0, 200), // Limit logged value
      location: suspiciousData.path,
      userId: req.user?.id || null
    });
    
    const keyValueTable = {
      error: 'Suspicious activity detected',
      location: suspiciousData.path
    };
    
    return res.status(400).json(
      ResponseFormatter.failure('Invalid request content', keyValueTable)
    );
  }
  
  next();
};

/**
 * IP whitelist/blacklist middleware (configurable)
 */
const ipFilter = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Example blacklist (can be moved to environment variables or database)
  const blacklistedIPs = process.env.BLACKLISTED_IPS ? process.env.BLACKLISTED_IPS.split(',') : [];
  
  if (blacklistedIPs.includes(clientIp)) {
    logger.logSecurityViolation('BLACKLISTED_IP_ACCESS', {
      ip: clientIp,
      url: req.originalUrl,
      userAgent: req.get('User-Agent')
    });
    
    const keyValueTable = { error: 'Access denied' };
    return res.status(403).json(
      ResponseFormatter.failure('Access forbidden', keyValueTable)
    );
  }
  
  next();
};

/**
 * Basic security middleware stack for all routes
 */
const basicSecurity = [
  securityHeaders,
  requestSizeLimiter,
  ipFilter,
  suspiciousActivityDetector,
  sanitizeInput(),
  auditFailedAuth
];

/**
 * Enhanced security middleware stack for sensitive routes
 */
const enhancedSecurity = [
  ...basicSecurity,
  combinedRateLimit,
  auditLogger
];

/**
 * Admin security middleware stack
 */
const adminSecurity = [
  ...enhancedSecurity,
  csrfProtection
];

/**
 * Security middleware factory for different security levels
 */
const createSecurityMiddleware = (level = 'basic') => {
  switch (level) {
    case 'basic':
      return basicSecurity;
    case 'enhanced':
      return enhancedSecurity;
    case 'admin':
      return adminSecurity;
    default:
      return basicSecurity;
  }
};

module.exports = {
  basicSecurity,
  enhancedSecurity,
  adminSecurity,
  createSecurityMiddleware,
  securityHeaders,
  requestSizeLimiter,
  suspiciousActivityDetector,
  ipFilter
};