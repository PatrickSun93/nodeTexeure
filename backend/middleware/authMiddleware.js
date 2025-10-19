const jwt = require('jsonwebtoken');
const ResponseFormatter = require('../utils/responseFormatter');
const sessionManager = require('../utils/sessionManager');
const logger = require('../utils/logger');

/**
 * Extract JWT from request using the following priority:
 * 1) Authorization: Bearer <token> header
 * 2) HttpOnly cookie named 'admin_auth'
 *
 * This allows backward compatibility with existing header-based auth
 * while enabling cookie-based auth for the admin app.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const extractAuthToken = (req) => {
  // Prefer Authorization header if provided
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  // Fallback to cookie-based auth for admin
  if (req.cookies && req.cookies.admin_auth) {
    return req.cookies.admin_auth;
  }
  return null;
};

// Middleware to protect routes with secure session validation
exports.protect = (req, res, next) => {
  const token = extractAuthToken(req);

  if (!token) {
    const keyValueTable = { error: 'No token provided' };
    return res.status(401).json(
      ResponseFormatter.failure('Not authorized, no token', keyValueTable)
    );
  }

  try {
    // Validate session using secure session manager
    const sessionData = sessionManager.validateSession(token, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      strictIpValidation: process.env.STRICT_IP_VALIDATION === 'true'
    });

    // Attach user data to request
    req.user = {
      id: sessionData.userId,
      email: sessionData.email,
      role: sessionData.role,
      sessionId: sessionData.sessionId,
      isAdmin: sessionData.role === 'admin',
      ...sessionData.sessionData
    };

    // Log successful authentication for audit
    logger.info('User authenticated successfully', {
      userId: sessionData.userId,
      role: sessionData.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method
    });

    next();
  } catch (error) {
    // Log authentication failure
    logger.warn('Authentication failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method
    });

    const keyValueTable = { 
      error: error.message || 'Token validation failed'
    };
    return res.status(401).json(
      ResponseFormatter.failure('Not authorized, session invalid', keyValueTable)
    );
  }
};

// Middleware for admin only
exports.admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  const keyValueTable = { error: 'Admin access required' };
  return res
    .status(401)
    .json(ResponseFormatter.failure('Not authorized as an admin', keyValueTable));
};

// Optional protect middleware with secure session validation
exports.protectOptional = (req, res, next) => {
  const token = extractAuthToken(req);
  if (token) {
    try {
      const sessionData = sessionManager.validateSession(token, {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        strictIpValidation: false // Less strict for optional auth
      });

      req.user = {
        id: sessionData.userId,
        email: sessionData.email,
        role: sessionData.role,
        sessionId: sessionData.sessionId,
        isAdmin: sessionData.role === 'admin',
        ...sessionData.sessionData
      };
    } catch (error) {
      // Ignore error, proceed without user context
      logger.debug('Optional authentication failed', {
        error: error.message,
        ip: req.ip
      });
    }
  }
  next();
};

// Alias for protect (for compatibility)
exports.authenticateToken = exports.protect;

// Role-based access control middleware
exports.requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      const keyValueTable = { error: 'Authentication required' };
      return res.status(401).json(
        ResponseFormatter.failure('Not authorized, no user context', keyValueTable)
      );
    }

    const userRole = req.user.role || 'customer';
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      const keyValueTable = { 
        error: 'Insufficient permissions',
        userRole: userRole,
        requiredRoles: allowedRoles
      };
      return res.status(403).json(
        ResponseFormatter.failure('Access denied', keyValueTable)
      );
    }

    next();
  };
};