const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');
const { generateCSRFToken } = require('../middleware/csrfMiddleware');
const crypto = require('crypto');

const router = express.Router();

// Rate limiter for login and forgot password
const ADMIN_ROLES = ['admin', 'staff', 'superadmin', 'owner'];

/**
 * POST /api/users/register
 * Register a new user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {string} address - User's address
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Input validation
    if (!email || !password || !firstName || !lastName) {
      const keyValueTable = {
        error: 'All fields are required: email, password, firstName, lastName'
      };
      return res.status(400).json(ResponseFormatter.failure(
        'Missing required fields',
        keyValueTable
      ));
    }

    // Check if email already exists
    const checkResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (checkResult.data && checkResult.data.length > 0) {
      const keyValueTable = {
        error: 'Email already registered'
      };
      return res.status(400).json(ResponseFormatter.failure(
        'Email already exists',
        keyValueTable
      ));
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Get next user ID
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("USER") as id');
    if (!idResult.success) {
      throw new Error('Failed to generate user ID');
    }
    const userId = idResult.data[0].id;

    // Insert new user
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [userId, email, hashedPassword, firstName, lastName]
    );

    if (insertResult.success) {
      const keyValueTable = {
        userId: userId,
        email: email,
        firstName: firstName,
        lastName: lastName
      };
      res.status(201).json(ResponseFormatter.success(
        'User registered successfully',
        keyValueTable
      ));
    } else {
      throw new Error('Failed to insert user');
    }
  } catch (error) {
    console.error('User registration error:', error);
    const keyValueTable = {
      error: error.message
    };
    res.status(500).json(ResponseFormatter.failure(
      'User registration failed',
      keyValueTable
    ));
  }
});

// Login rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
});

// Forgot password rate limiter
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 requests per windowMs
  message: 'Too many password reset attempts from this IP, please try again after an hour'
});

// Email transporter configuration (use env vars in production)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * POST /api/users/login
 * User login
 * @param {string} email - User's email
 * @param {string} password - User's password
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const keyValueTable = { error: 'Email and password are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required fields', keyValueTable));
    }
    console.log(email);
    console.log(password);
    const result = await DatabaseUtil.executeQuery('SELECT * FROM users WHERE email = ?', [email]);
    console.log(result)
    if (!result.success || result.data.length === 0) {
      const keyValueTable = { error: 'Invalid email or password' };
      return res.status(401).json(ResponseFormatter.failure('Invalid credentials', keyValueTable));
    }

    const user = result.data[0];

    // Only allow admin and staff to login - reject customers
    const userRole = user.role.toLowerCase();
    if (!ADMIN_ROLES.includes(userRole)) {
      const keyValueTable = { error: 'Customer accounts are not allowed to login. This site is for admin and staff only.' };
      return res.status(403).json(ResponseFormatter.failure('Access denied', keyValueTable));
    }

    if (await bcrypt.compare(password, user.password_hash)) {
      // Compute isAdmin from role field
      const isAdmin = ADMIN_ROLES.includes(userRole);
      const accessToken = jwt.sign({ id: user.id, email: user.email, isAdmin }, process.env.JWT_SECRET, { expiresIn: '24h' });
      const refreshToken = crypto.randomBytes(64).toString('hex');
      const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Get next ID for refresh token
      const refreshIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id(?) as id', ['REFRESH']);
      const refreshId = refreshIdResult.data[0].id;

      await DatabaseUtil.executeQuery('INSERT INTO refresh_tokens (id, user_id, token, expiry) VALUES (?, ?, ?, ?)', [refreshId, user.id, refreshToken, refreshExpiry]);

      // Issue HttpOnly authentication cookie for admin logins
      // Secure in production, SameSite=Strict, Path=/, configurable TTL via ADMIN_AUTH_COOKIE_TTL_MS (default: 24h)
      if (isAdmin) {
        const ttlMs = Number.parseInt(process.env.ADMIN_AUTH_COOKIE_TTL_MS || '86400000', 10);
        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('admin_auth', accessToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'strict',
          path: '/',
          maxAge: ttlMs
        });
      }

      // Handle cart merge - skip for admin/staff users
      if (req.cookies.sessionId && !ADMIN_ROLES.includes(userRole)) {
        const sessionId = req.cookies.sessionId;
        const guestCartResult = await DatabaseUtil.executeQuery('SELECT id FROM shopping_carts WHERE session_id = ?', [sessionId]);
        if (guestCartResult.success && guestCartResult.data.length > 0) {
          const guestCartId = guestCartResult.data[0].id;
          // Get or create user cart
          let userCartId;
          const userCartResult = await DatabaseUtil.executeQuery('SELECT id FROM shopping_carts WHERE user_id = ?', [user.id]);
          if (userCartResult.success && userCartResult.data.length > 0) {
            userCartId = userCartResult.data[0].id;
          } else {
            const cartIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id(?) as id', ['CART']);
            userCartId = cartIdResult.data[0].id;
            await DatabaseUtil.executeQuery('INSERT INTO shopping_carts (id, user_id) VALUES (?, ?)', [userCartId, user.id]);
          }
          // Merge items: for each guest item, add or update in user cart
          const guestItems = await DatabaseUtil.executeQuery('SELECT * FROM cart_items WHERE cart_id = ?', [guestCartId]);
          for (const item of guestItems.data) {
            const checkUserItem = await DatabaseUtil.executeQuery(
              'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?',
              [userCartId, item.product_id, item.variant_id]
            );
            if (checkUserItem.data.length > 0) {
              await DatabaseUtil.executeQuery(
                'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
                [item.quantity, checkUserItem.data[0].id]
              );
            } else {
              const itemIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id(?) as id', ['CARTITEM']);
              const newItemId = itemIdResult.data[0].id;
              await DatabaseUtil.executeQuery(
                'INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
                [newItemId, userCartId, item.product_id, item.variant_id, item.quantity, item.price]
              );
            }
          }
          // Delete guest cart
          await DatabaseUtil.executeQuery('DELETE FROM shopping_carts WHERE id = ?', [guestCartId]);
        }
        // Clear session cookie for regular users
        res.clearCookie('sessionId');
      } else if (req.cookies.sessionId && ADMIN_ROLES.includes(userRole)) {
        // For admin/staff users, just clear the session cookie without cart operations
        res.clearCookie('sessionId');
      }
      const keyValueTable = { userId: user.id, email: user.email, accessToken, refreshToken, role: user.role, isAdmin };
      res.json(ResponseFormatter.success('Login successful', keyValueTable));
    } else {
      const keyValueTable = { error: 'Invalid email or password' };
      res.status(401).json(ResponseFormatter.failure('Invalid credentials', keyValueTable));
    }
  } catch (error) {
    console.error('Login error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Login failed', keyValueTable));
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json(ResponseFormatter.failure('Refresh token required'));
    }
    const result = await DatabaseUtil.executeQuery('SELECT * FROM refresh_tokens WHERE token = ? AND expiry > NOW()', [refreshToken]);
    if (!result.success || result.data.length === 0) {
      return res.status(401).json(ResponseFormatter.failure('Invalid or expired refresh token'));
    }
    const { user_id } = result.data[0];
    const userResult = await DatabaseUtil.executeQuery('SELECT id, email, role FROM users WHERE id = ?', [user_id]);
    if (!userResult.success || userResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('User not found'));
    }
    const user = userResult.data[0];
    // Compute isAdmin from role field
    const userRole = user.role.toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(userRole);
    const newAccessToken = jwt.sign({ id: user.id, email: user.email, isAdmin }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json(ResponseFormatter.success('Token refreshed', { accessToken: newAccessToken }));
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json(ResponseFormatter.failure('Token refresh failed'));
  }
});


/**
 * GET /api/users/profile
 * Get user profile
 */
// router.get('/profile', protect, async (req, res) => {
router.get('/profile', protect, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery(
      `SELECT 
         u.id,
         u.first_name,
         u.last_name,
         u.phone,
         u.email,
         (
           SELECT COALESCE(
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', ua.id,
                 'type', ua.type,
                 'is_default', ua.is_default,
                 'first_name', ua.first_name,
                 'last_name', ua.last_name,
                 'phone', ua.phone,
                 'address', ua.address_json
               )
             ),
             JSON_ARRAY()
           )
           FROM user_addresses ua
           WHERE ua.user_id = u.id
         ) AS addresses
       FROM users u
       WHERE u.id = ?`,
      [req.user.id]
    );
    console.log(result)
    if (!result.success || result.data.length === 0) {
      const keyValueTable = { error: 'User not found' };
      return res.status(404).json(ResponseFormatter.failure('User not found', keyValueTable));
    }

    res.json(ResponseFormatter.success('User profile fetched', result.data[0]));
  } catch (error) {
    console.error('Get profile error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get profile', keyValueTable));
  }
});

/**
 * PUT /api/users/profile
 * Update user profile
 * @param {string} firstName - User's first name (optional)
 * @param {string} lastName - User's last name (optional)
 * @param {string} phone - User's phone (optional)
 * @param {string} password - New password (optional)
 */
router.put('/profile', protect, async (req, res) => {
  try {
    const { firstName, lastName, phone, password } = req.body;
    let updates = [];
    let params = [];

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
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updates.push('password_hash = ?');
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No update fields provided', keyValueTable));
    }

    params.push(req.user.id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    const result = await DatabaseUtil.executeQuery(query, params);

    if (result.success) {
      const keyValueTable = { userId: req.user.id, updatedFields: updates.length };
      res.json(ResponseFormatter.success('Profile updated', keyValueTable));
    } else {
      throw new Error('Failed to update profile');
    }
  } catch (error) {
    console.error('Update profile error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update profile', keyValueTable));
  }
});

/**
 * GET /api/users
 * Get all users (admin)
 */
router.get('/', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const result = await DatabaseUtil.executeQuery('SELECT id, name, email, isAdmin FROM users WHERE isDeleted = FALSE LIMIT ? OFFSET ?', [parseInt(limit), offset]);

    if (result.success) {
      res.json(ResponseFormatter.success('Users fetched', { users: result.data }));
    } else {
      throw new Error('Failed to fetch users');
    }
  } catch (error) {
    console.error('Get all users error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get users', keyValueTable));
  }
});

/**
 * GET /api/users/csrf-token
 * Generate and return a CSRF token for admin authentication
 * Requires user to be authenticated and an admin
 */
router.get('/csrf-token', protect, admin, async (req, res) => {
  try {
    // Generate CSRF token bound to the current user session
    const csrfToken = generateCSRFToken(req.user);

    // Set CSRF token in a non-HttpOnly cookie that JavaScript can read
    // This follows the double-submit cookie pattern for CSRF protection
    const ttlMs = Number.parseInt(process.env.CSRF_TOKEN_TTL_MS || '86400000', 10); // 24 hours default
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // JavaScript needs to read this for the X-CSRF-Token header
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: ttlMs
    });

    // Also return token in response body for immediate use
    const keyValueTable = {
      csrfToken,
      expires: new Date(Date.now() + ttlMs).toISOString(),
      usage: 'Include this token in X-CSRF-Token header for admin API requests'
    };

    res.json(ResponseFormatter.success('CSRF token generated successfully', keyValueTable));
  } catch (error) {
    console.error('CSRF token generation error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to generate CSRF token', keyValueTable));
  }
});

/**
 * GET /api/users/:id
 * Get user by ID (admin)
 */
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('SELECT id, name, email, address, isAdmin FROM users WHERE id = ? AND isDeleted = FALSE', [req.params.id]);

    if (!result.success || result.data.length === 0) {
      const keyValueTable = { error: 'User not found' };
      return res.status(404).json(ResponseFormatter.failure('User not found', keyValueTable));
    }

    res.json(ResponseFormatter.success('User fetched', result.data[0]));
  } catch (error) {
    console.error('Get user by ID error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get user', keyValueTable));
  }
});

/**
 * PUT /api/users/:id
 * Update user (admin)
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {boolean} isAdmin - Admin status
 */
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const { name, email, isAdmin } = req.body;
    let updates = [];
    let params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    if (email) {
      updates.push('email = ?');
      params.push(email);
    }
    if (typeof isAdmin !== 'undefined') {
      updates.push('isAdmin = ?');
      params.push(isAdmin);
    }

    if (updates.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No update fields provided', keyValueTable));
    }

    params.push(req.params.id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    const result = await DatabaseUtil.executeQuery(query, params);

    if (result.success) {
      const keyValueTable = { userId: req.params.id, updatedFields: updates.length };
      res.json(ResponseFormatter.success('User updated', keyValueTable));
    } else {
      throw new Error('Failed to update user');
    }
  } catch (error) {
    console.error('Update user error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update user', keyValueTable));
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin) - soft delete
 */
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('UPDATE users SET isDeleted = TRUE WHERE id = ?', [req.params.id]);

    if (result.success && result.data.affectedRows > 0) {
      const keyValueTable = { userId: req.params.id };
      res.json(ResponseFormatter.success('User deleted', keyValueTable));
    } else {
      const keyValueTable = { error: 'User not found' };
      res.status(404).json(ResponseFormatter.failure('User not found', keyValueTable));
    }
  } catch (error) {
    console.error('Delete user error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete user', keyValueTable));
  }
});

/**
 * POST /api/users/forgot-password
 * Forgot password
 * @param {string} email - User's email
 */
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      const keyValueTable = { error: 'Email is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing email', keyValueTable));
    }

    const result = await DatabaseUtil.executeQuery('SELECT id FROM users WHERE email = ?', [email]);

    if (!result.success || result.data.length === 0) {
      const keyValueTable = { message: 'If the email exists, a reset link has been sent' }; // Security: don't reveal if email exists
      return res.json(ResponseFormatter.success('Password reset email sent if email exists', keyValueTable));
    }

    const userId = result.data[0].id;
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

    await DatabaseUtil.executeQuery('UPDATE users SET resetToken = ?, resetTokenExpiry = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [token, userId]);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset',
      text: `You requested a password reset. Click this link to reset: http://yourdomain.com/reset-password?token=${token}`
    };

    await transporter.sendMail(mailOptions);

    const keyValueTable = { message: 'Password reset email sent' };
    res.json(ResponseFormatter.success('Email sent', keyValueTable));
  } catch (error) {
    console.error('Forgot password error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to process forgot password', keyValueTable));
  }
});

/**
 * POST /api/users/reset-password
 * Reset password
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      const keyValueTable = { error: 'Token and new password are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required fields', keyValueTable));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const keyValueTable = { error: 'Invalid or expired token' };
      return res.status(400).json(ResponseFormatter.failure('Invalid token', keyValueTable));
    }

    const result = await DatabaseUtil.executeQuery('SELECT id FROM users WHERE resetToken = ? AND resetTokenExpiry > NOW()', [token]);

    if (!result.success || result.data.length === 0) {
      const keyValueTable = { error: 'Invalid or expired token' };
      return res.status(400).json(ResponseFormatter.failure('Invalid token', keyValueTable));
    }

    const userId = result.data[0].id;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await DatabaseUtil.executeQuery('UPDATE users SET password = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ?', [hashedPassword, userId]);

    const keyValueTable = { message: 'Password has been reset' };
    res.json(ResponseFormatter.success('Password reset successful', keyValueTable));
  } catch (error) {
    console.error('Reset password error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to reset password', keyValueTable));
  }
});



module.exports = router;