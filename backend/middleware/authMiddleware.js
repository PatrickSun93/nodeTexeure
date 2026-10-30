const jwt = require('jsonwebtoken');
const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');

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

/**
 * Verify the token and re-check the user against the database, so a role change,
 * deactivation, or password reset takes effect immediately rather than when the
 * token expires. Role flags on req.user come from the current DB role, not the
 * token. Returns null for any invalid, revoked, or inactive session.
 * @param {string} token
 * @returns {Promise<object|null>}
 */
const resolveUser = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return null;
  }
  const row = DatabaseUtil.first(await DatabaseUtil.executeQuery(
    'SELECT role, status, token_version FROM users WHERE id = ?',
    [decoded.id]
  ));
  // Tokens issued before migration 009 have no `tv`; they match version 0.
  if (!row || row.status !== 'active' || Number(row.token_version) !== Number(decoded.tv || 0)) {
    return null;
  }
  const role = String(row.role).toLowerCase();
  return { ...decoded, role, isAdmin: role === 'admin', isStaff: role === 'staff' };
};

// Middleware to protect routes
exports.protect = async (req, res, next) => {
  const token = extractAuthToken(req);

  if (!token) {
    const keyValueTable = { error: 'No token provided' };
    return res.status(401).json(
      ResponseFormatter.failure('Not authorized, no token', keyValueTable)
    );
  }

  try {
    const user = await resolveUser(token);
    if (!user) {
      const keyValueTable = { error: 'Token is invalid' };
      return res.status(401).json(
        ResponseFormatter.failure('Not authorized, token failed', keyValueTable)
      );
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    return res.status(500).json(ResponseFormatter.failure('Authentication check failed'));
  }
};

// Middleware for admin only. 403: the caller is authenticated but lacks the role.
exports.admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  console.error('Admin Middleware Denied:', req.user ? `User ${req.user.id} is not admin` : 'No user');
  const keyValueTable = { error: 'Admin access required' };
  return res
    .status(req.user ? 403 : 401)
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
    .status(req.user ? 403 : 401)
    .json(ResponseFormatter.failure('Not authorized as staff or admin', keyValueTable));
};

// Optional protect middleware: an invalid or revoked token proceeds as a guest.
exports.protectOptional = async (req, res, next) => {
  const token = extractAuthToken(req);
  if (token) {
    try {
      const user = await resolveUser(token);
      if (user) req.user = user;
    } catch (error) {
      // Ignore error, proceed without user context
    }
  }
  next();
};
