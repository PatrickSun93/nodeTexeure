const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin, requireRole } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validationMiddleware');
const sessionManager = require('../utils/sessionManager');
const logger = require('../utils/logger');
const crypto = require('crypto');

const router = express.Router();

// Rate limiter for admin login attempts
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 requests per windowMs for admin login
  message: {
    success: false,
    message: 'Too many admin login attempts from this IP, please try again after 15 minutes',
    data: null,
    keyValueTable: {
      error: 'Rate limit exceeded',
      retryAfter: '15 minutes'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/admin/auth/login
 * Admin login with enhanced security
 * @param {string} email - Admin's email
 * @param {string} password - Admin's password
 */
router.post('/auth/login', adminLoginLimiter, validateInput('userLogin'), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const keyValueTable = { error: 'Email and password are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required fields', keyValueTable));
    }

    // Query user with admin/staff role only
    const result = await DatabaseUtil.executeQuery(
      'SELECT * FROM users WHERE email = ? AND role IN (?, ?)', 
      [email, 'admin', 'staff']
    );

    if (!result.success || result.data.length === 0) {
      // Log failed admin login attempt
      logger.warn('Failed admin login attempt', {
        email: email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      const keyValueTable = { error: 'Invalid admin credentials' };
      return res.status(401).json(ResponseFormatter.failure('Invalid credentials', keyValueTable));
    }

    const user = result.data[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Log failed password attempt
      logger.warn('Failed admin password verification', {
        userId: user.id,
        email: email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      const keyValueTable = { error: 'Invalid admin credentials' };
      return res.status(401).json(ResponseFormatter.failure('Invalid credentials', keyValueTable));
    }

    // Check if account is active (not deleted)
    if (user.isDeleted) {
      const keyValueTable = { error: 'Account is deactivated' };
      return res.status(403).json(ResponseFormatter.failure('Account deactivated', keyValueTable));
    }

    // Generate secure session using session manager
    const sessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      loginTime: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    const sessionToken = sessionManager.createSession(sessionData, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      expiresIn: '24h'
    });

    // Set secure HttpOnly cookie for admin authentication
    const isProd = process.env.NODE_ENV === 'production';
    const ttlMs = Number.parseInt(process.env.ADMIN_AUTH_COOKIE_TTL_MS || '86400000', 10); // 24 hours default
    
    res.cookie('admin_auth', sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: ttlMs
    });

    // Log successful admin login
    logger.info('Successful admin login', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    const keyValueTable = {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      sessionToken: sessionToken // Include for API clients that need it
    };

    res.json(ResponseFormatter.success('Admin login successful', keyValueTable));
  } catch (error) {
    logger.error('Admin login error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Admin login failed', keyValueTable));
  }
});

/**
 * POST /api/admin/auth/logout
 * Admin logout - invalidate session
 */
router.post('/auth/logout', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    // Invalidate session if using session manager
    if (req.user.sessionId) {
      sessionManager.invalidateSession(req.user.sessionId);
    }

    // Clear admin auth cookie
    res.clearCookie('admin_auth', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    // Log admin logout
    logger.info('Admin logout', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    const keyValueTable = {
      userId: req.user.id,
      logoutTime: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Admin logout successful', keyValueTable));
  } catch (error) {
    logger.error('Admin logout error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Admin logout failed', keyValueTable));
  }
});

/**
 * GET /api/admin/auth/verify
 * Verify admin session and return user info
 */
router.get('/auth/verify', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    // Get fresh user data from database
    const result = await DatabaseUtil.executeQuery(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = ? AND role IN (?, ?)',
      [req.user.id, 'admin', 'staff']
    );

    if (!result.success || result.data.length === 0) {
      const keyValueTable = { error: 'Admin user not found' };
      return res.status(404).json(ResponseFormatter.failure('User not found', keyValueTable));
    }

    const user = result.data[0];

    const keyValueTable = {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isAdmin: user.role === 'admin',
      createdAt: user.created_at,
      sessionValid: true
    };

    res.json(ResponseFormatter.success('Admin session verified', keyValueTable));
  } catch (error) {
    logger.error('Admin session verification error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Session verification failed', keyValueTable));
  }
});

/**
 * GET /api/admin/auth/profile
 * Get admin user profile
 */
router.get('/auth/profile', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery(
      `SELECT 
         u.id,
         u.first_name,
         u.last_name,
         u.phone,
         u.email,
         u.role,
         u.created_at,
         u.updated_at,
         u.last_login
       FROM users u
       WHERE u.id = ? AND u.role IN (?, ?)`,
      [req.user.id, 'admin', 'staff']
    );

    if (!result.success || result.data.length === 0) {
      const keyValueTable = { error: 'Admin user not found' };
      return res.status(404).json(ResponseFormatter.failure('User not found', keyValueTable));
    }

    const user = result.data[0];

    const keyValueTable = {
      ...user,
      isAdmin: user.role === 'admin',
      permissions: user.role === 'admin' ? ['all'] : ['read', 'write'] // Basic permission structure
    };

    res.json(ResponseFormatter.success('Admin profile fetched', keyValueTable));
  } catch (error) {
    logger.error('Get admin profile error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get profile', keyValueTable));
  }
});

/**
 * PUT /api/admin/auth/profile
 * Update admin user profile
 * @param {string} firstName - Admin's first name (optional)
 * @param {string} lastName - Admin's last name (optional)
 * @param {string} phone - Admin's phone (optional)
 * @param {string} currentPassword - Current password (required for password change)
 * @param {string} newPassword - New password (optional)
 */
router.put('/auth/profile', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { firstName, lastName, phone, currentPassword, newPassword } = req.body;
    let updates = [];
    let params = [];

    // Basic profile updates
    if (firstName) {
      updates.push('first_name = ?');
      params.push(firstName);
    }
    if (lastName) {
      updates.push('last_name = ?');
      params.push(lastName);
    }
    if (phone) {
      updates.push('phone = ?');
      params.push(phone);
    }

    // Password change requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        const keyValueTable = { error: 'Current password required for password change' };
        return res.status(400).json(ResponseFormatter.failure('Current password required', keyValueTable));
      }

      // Verify current password
      const userResult = await DatabaseUtil.executeQuery(
        'SELECT password_hash FROM users WHERE id = ?',
        [req.user.id]
      );

      if (!userResult.success || userResult.data.length === 0) {
        const keyValueTable = { error: 'User not found' };
        return res.status(404).json(ResponseFormatter.failure('User not found', keyValueTable));
      }

      const isValidPassword = await bcrypt.compare(currentPassword, userResult.data[0].password_hash);
      if (!isValidPassword) {
        const keyValueTable = { error: 'Current password is incorrect' };
        return res.status(400).json(ResponseFormatter.failure('Invalid current password', keyValueTable));
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12); // Higher salt rounds for admin accounts
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      updates.push('password_hash = ?');
      params.push(hashedPassword);

      // Log password change
      logger.info('Admin password changed', {
        userId: req.user.id,
        email: req.user.email,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    if (updates.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No update fields provided', keyValueTable));
    }

    // Add updated timestamp
    updates.push('updated_at = NOW()');
    params.push(req.user.id);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    const result = await DatabaseUtil.executeQuery(query, params);

    if (result.success) {
      // Log profile update
      logger.info('Admin profile updated', {
        userId: req.user.id,
        email: req.user.email,
        updatedFields: updates.length - 1, // Exclude updated_at from count
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = { 
        userId: req.user.id, 
        updatedFields: updates.length - 1,
        passwordChanged: newPassword ? true : false
      };
      res.json(ResponseFormatter.success('Admin profile updated', keyValueTable));
    } else {
      throw new Error('Failed to update profile');
    }
  } catch (error) {
    logger.error('Update admin profile error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update profile', keyValueTable));
  }
});

/**
 * GET /api/admin/users
 * Get all users for admin management
 */
router.get('/users', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['1=1']; // Base condition
    let queryParams = [];

    // Search filter
    if (search) {
      whereConditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Role filter
    if (role) {
      whereConditions.push('u.role = ?');
      queryParams.push(role);
    }

    // Status filter
    if (status === 'active') {
      whereConditions.push('u.isDeleted = FALSE');
    } else if (status === 'deleted') {
      whereConditions.push('u.isDeleted = TRUE');
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`;
    const countResult = await DatabaseUtil.executeQuery(countQuery, queryParams);
    const total = countResult.success ? countResult.data[0].total : 0;

    // Get users with pagination
    const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.created_at,
        u.last_login,
        u.email_verified,
        u.isDeleted,
        COUNT(o.id) as order_count
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (result.success) {
      const keyValueTable = {
        users: result.data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        },
        filters: { search, role, status }
      };

      res.json(ResponseFormatter.success('Users fetched successfully', keyValueTable));
    } else {
      throw new Error('Failed to fetch users');
    }
  } catch (error) {
    logger.error('Get admin users error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get users', keyValueTable));
  }
});

module.exports = router;