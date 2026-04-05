const crypto = require('crypto');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * CSRF Middleware for protecting admin routes from Cross-Site Request Forgery attacks.
 * 
 * This middleware uses the double-submit cookie pattern:
 * 1. Sets a CSRF token in a non-HttpOnly cookie that JavaScript can read
 * 2. Requires the same token to be sent in the X-CSRF-Token header
 * 3. Validates both tokens match for state-changing operations (POST, PUT, DELETE)
 * 
 * The CSRF token is bound to the user session via the JWT payload to prevent
 * token reuse across different user sessions.
 */

/**
 * Generate a CSRF token bound to the user session
 * @param {Object} user - User object from JWT payload (contains id, email, isAdmin)
 * @returns {string} - Base64-encoded CSRF token
 */
const generateCSRFToken = (user) => {
  if (!user || !user.id) {
    throw new Error('User context required for CSRF token generation');
  }
  
  // Create a token that includes user ID and timestamp for session binding
  const tokenData = {
    userId: user.id,
    timestamp: Date.now(),
    random: crypto.randomBytes(16).toString('hex')
  };
  
  // Sign the token data with a secret to prevent tampering
  const secretKey = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  const tokenString = JSON.stringify(tokenData);
  const signature = crypto.createHmac('sha256', secretKey).update(tokenString).digest('hex');
  
  // Combine token data and signature
  const fullToken = Buffer.from(JSON.stringify({ data: tokenData, signature })).toString('base64');
  
  return fullToken;
};

/**
 * Validate a CSRF token against the current user session
 * @param {string} token - Base64-encoded CSRF token
 * @param {Object} user - User object from JWT payload
 * @returns {boolean} - True if token is valid
 */
const validateCSRFToken = (token, user) => {
  try {
    if (!token || !user || !user.id) {
      return false;
    }
    
    // Decode the token
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const { data, signature } = decoded;
    
    // Verify signature
    const secretKey = process.env.CSRF_SECRET || process.env.JWT_SECRET;
    const expectedSignature = crypto.createHmac('sha256', secretKey).update(JSON.stringify(data)).digest('hex');
    
    if (signature !== expectedSignature) {
      return false;
    }
    
    // Verify token is bound to current user
    if (data.userId !== user.id) {
      return false;
    }
    
    // Check token age (valid for 24 hours)
    const tokenAge = Date.now() - data.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (tokenAge > maxAge) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('CSRF token validation error:', error);
    return false;
  }
};

/**
 * Middleware to protect against CSRF attacks
 * Only validates CSRF tokens for state-changing HTTP methods (POST, PUT, DELETE, PATCH)
 * GET, HEAD, OPTIONS are considered safe and don't require CSRF protection
 */
const csrfProtection = (req, res, next) => {
  // Skip CSRF validation for safe HTTP methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  // Require user authentication for CSRF protection
  if (!req.user) {
    const keyValueTable = { error: 'Authentication required for CSRF protection' };
    return res.status(401).json(
      ResponseFormatter.failure('Not authenticated', keyValueTable)
    );
  }
  
  // Extract CSRF token from header and cookie (double-submit requirement)
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies ? req.cookies['csrf_token'] : undefined;
  
  if (!headerToken) {
    const keyValueTable = { error: 'CSRF token missing in X-CSRF-Token header' };
    return res.status(403).json(
      ResponseFormatter.failure('CSRF token required', keyValueTable)
    );
  }

  if (!cookieToken) {
    const keyValueTable = { error: 'CSRF cookie missing' };
    return res.status(403).json(
      ResponseFormatter.failure('CSRF token required', keyValueTable)
    );
  }

  if (headerToken !== cookieToken) {
    const keyValueTable = { error: 'CSRF header and cookie tokens do not match' };
    return res.status(403).json(
      ResponseFormatter.failure('CSRF token mismatch', keyValueTable)
    );
  }
  
  // Validate CSRF token signature, user binding, and age
  if (!validateCSRFToken(headerToken, req.user)) {
    const keyValueTable = { error: 'Invalid or expired CSRF token' };
    return res.status(403).json(
      ResponseFormatter.failure('CSRF token validation failed', keyValueTable)
    );
  }
  
  // CSRF validation passed, proceed to route handler
  next();
};

module.exports = {
  generateCSRFToken,
  validateCSRFToken,
  csrfProtection
};