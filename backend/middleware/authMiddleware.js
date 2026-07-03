const jwt = require('jsonwebtoken');
const ResponseFormatter = require('../utils/responseFormatter');

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

// Middleware to protect routes
exports.protect = (req, res, next) => {
  const token = extractAuthToken(req);

  if (!token) {
    const keyValueTable = { error: 'No token provided' };
    return res.status(401).json(
      ResponseFormatter.failure('Not authorized, no token', keyValueTable)
    );
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    const keyValueTable = { error: 'Token is invalid' };
    return res.status(401).json(
      ResponseFormatter.failure('Not authorized, token failed', keyValueTable)
    );
  }
};

// Middleware for admin only
exports.admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  console.error('Admin Middleware Denied:', req.user ? `User ${req.user.id} is not admin` : 'No user');
  const keyValueTable = { error: 'Admin access required' };
  return res
    .status(401)
    .json(ResponseFormatter.failure('Not authorized as an admin', keyValueTable));
};

// Middleware for staff OR admin access. Allows role 'admin' (isAdmin) or 'staff'
// (isStaff). Must run after `protect` so req.user is populated from the verified
// JWT. Admin-only routes must keep using `admin`, not this middleware.
exports.staffOrAdmin = (req, res, next) => {
  if (req.user && (req.user.isAdmin || req.user.isStaff)) {
    return next();
  }
  console.error(
    'StaffOrAdmin Middleware Denied:',
    req.user ? `User ${req.user.id} is neither staff nor admin` : 'No user'
  );
  const keyValueTable = { error: 'Staff or admin access required' };
  return res
    .status(401)
    .json(ResponseFormatter.failure('Not authorized as staff or admin', keyValueTable));
};

// Optional protect middleware
exports.protectOptional = (req, res, next) => {
  const token = extractAuthToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      req.user = decoded;
    } catch (error) {
      // Ignore error, proceed without user context
    }
  }
  next();
};