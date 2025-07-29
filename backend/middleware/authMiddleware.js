const jwt = require('jsonwebtoken');
const ResponseFormatter = require('../utils/responseFormatter');

// Middleware to protect routes
exports.protect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      const keyValueTable = { error: 'Token is invalid' };
      return res.status(401).json(ResponseFormatter.failure('Not authorized, token failed', keyValueTable));
    }
  }

  if (!token) {
    const keyValueTable = { error: 'No token provided' };
    return res.status(401).json(ResponseFormatter.failure('Not authorized, no token', keyValueTable));
  }
};

// Middleware for admin only
exports.admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    const keyValueTable = { error: 'Admin access required' };
    return res.status(401).json(ResponseFormatter.failure('Not authorized as an admin', keyValueTable));
  }
};