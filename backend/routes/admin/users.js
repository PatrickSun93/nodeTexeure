// Admin API: Customers, staff, and user detail.
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { admin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const path = require('path');
const bcrypt = require('bcryptjs');
const { adminReadLimiter, adminWriteLimiter } = require('./limiters');

const router = express.Router();

// User Management
// List users (read-only; CSRF not required)
router.get('/users', admin, adminReadLimiter, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status,
             COUNT(o.id) as orders_count,
             COALESCE(SUM(o.total_amount), 0) as total_spent,
             MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role NOT IN ('admin', 'staff')
      GROUP BY u.id
    `;
    const listResult = await DatabaseUtil.executeQuery(query);
    if (!listResult.success) throw new Error(listResult.error);

    // Map to friendly format
    const users = listResult.data.map(u => ({
      id: u.id,
      name: u.first_name ? `${u.first_name} ${u.last_name || ''}` : 'Guest/Unknown',
      email: u.email,
      role: u.role,
      status: u.status,
      orders: u.orders_count,
      spent: u.total_spent,
      lastOrder: u.last_order_date
    }));

    res.json(ResponseFormatter.success('Users fetched successfully', [{ users }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Create user
router.post('/users', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, status, phone } = req.body;

    // Basic validation
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json(ResponseFormatter.failure('Missing required fields'));
    }

    // Check if user exists
    const checkResult = await DatabaseUtil.executeQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (checkResult.data.length > 0) {
      return res.status(409).json(ResponseFormatter.failure('User with this email already exists'));
    }

    const idResult = await DatabaseUtil.executeQuery('SELECT UUID() as id'); // Or get_next_id if preferred
    const id = idResult.data[0].id;

    const hashedPassword = await bcrypt.hash(password, 10);

    // Default values
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, email, hashedPassword, first_name, last_name, role || 'customer', status || 'active', phone]
    );

    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('User created successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update user
router.put('/users/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Whitelist updatable columns to prevent column-name injection & mass assignment
    const ALLOWED_USER_COLUMNS = ['first_name', 'last_name', 'email', 'phone', 'role', 'status'];
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_USER_COLUMNS.includes(key)) continue;
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    // A role or status change revokes the user's outstanding access tokens.
    if ('role' in updates || 'status' in updates) {
      updateFields.push('token_version = token_version + 1');
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('User updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Delete user
router.delete('/users/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM users WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('User deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Staff Management
// List staff
router.get('/staff', admin, adminReadLimiter, async (req, res) => {
  try {
    const query = `
            SELECT id, email, first_name, last_name, role, status, last_login 
            FROM users 
            WHERE role IN ('admin', 'staff')
        `;
    const listResult = await DatabaseUtil.executeQuery(query);
    if (!listResult.success) throw new Error(listResult.error);

    const staff = listResult.data.map(u => ({
      id: u.id,
      name: u.first_name ? `${u.first_name} ${u.last_name || ''}` : 'Unknown',
      email: u.email,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1),
      status: u.status.charAt(0).toUpperCase() + u.status.slice(1),
      lastActive: u.last_login || 'Never'
    }));

    res.json(ResponseFormatter.success('Staff fetched successfully', [{ staff }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// =====================================================
// Customer detail (single user)
// =====================================================
// GET /api/admin/users/:id — customer profile + addresses + order stats.
// Read-only (CSRF not required). Registered after the /users list route so
// the exact `/users` path still hits the list handler.
router.get('/users/:id', admin, adminReadLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Core user record. `users.phone` exists in the schema, but we still fall
    // back to a default address phone below when it is null.
    const userRes = await DatabaseUtil.executeQuery(
      'SELECT id, first_name, last_name, email, role, status, phone, created_at FROM users WHERE id = ?',
      [id]
    );
    if (!userRes.success) throw new Error(userRes.error);
    const userRow = DatabaseUtil.first(userRes);
    if (!userRow) {
      return res.status(404).json(ResponseFormatter.failure('User not found'));
    }

    // Addresses — flatten the address_json blob into top-level fields.
    const addrRes = await DatabaseUtil.executeQuery(
      'SELECT id, type, first_name, last_name, phone, address_json, is_default FROM user_addresses WHERE user_id = ?',
      [id]
    );
    const addresses = DatabaseUtil.rows(addrRes).map((a) => {
      let addr = {};
      if (a.address_json) {
        try {
          addr = typeof a.address_json === 'string' ? JSON.parse(a.address_json) : a.address_json;
        } catch (e) {
          addr = {};
        }
      }
      return {
        id: a.id,
        type: a.type,
        first_name: a.first_name,
        last_name: a.last_name,
        phone: a.phone || null,
        company: addr.company || null,
        address_line_1: addr.address_line_1 || null,
        address_line_2: addr.address_line_2 || null,
        city: addr.city || null,
        state: addr.state || null,
        postal_code: addr.postal_code || null,
        country: addr.country || null,
        is_default: !!a.is_default,
      };
    });

    // Phone: users.phone, else the default (or first) address phone, else null.
    const defaultAddr = addresses.find((a) => a.is_default) || addresses[0] || null;
    const phone = userRow.phone || (defaultAddr && defaultAddr.phone) || null;

    // Order stats — totalSpent counts only valid (non-cancelled/refunded) orders.
    const statsRes = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END), 0) AS totalSpent,
              MAX(created_at) AS lastOrder
       FROM orders WHERE user_id = ?`,
      [id]
    );
    const statsRow = DatabaseUtil.first(statsRes) || {};
    const stats = {
      orders: Number(statsRow.orders) || 0,
      totalSpent: Number(statsRow.totalSpent) || 0,
      lastOrder: statsRow.lastOrder || null,
    };

    const customer = {
      user: {
        id: userRow.id,
        first_name: userRow.first_name,
        last_name: userRow.last_name,
        email: userRow.email,
        role: userRow.role,
        status: userRow.status,
        created_at: userRow.created_at,
        phone,
      },
      addresses,
      stats,
    };

    res.json(ResponseFormatter.success('Customer fetched successfully', [{ customer }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

module.exports = router;
