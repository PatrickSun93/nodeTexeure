// Admin API: Coupons / discount codes.
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { admin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const { adminReadLimiter, adminWriteLimiter } = require('./limiters');
const { isOptionalString } = require('../../utils/params');

const router = express.Router();

// code/name/type are text (type is an ENUM: a number would be written as an
// enum index, and checkout looks codes up as strings).
const TEXT_COLUMNS = ['code', 'name', 'type'];

// Coupon Management
// Add new coupon
router.post('/coupons', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at } = req.body;
    if (![code, name, type].every(isOptionalString)) {
      return res.status(400).json(ResponseFormatter.failure('code, name and type must be text'));
    }
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("DISC") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id;
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO discount_codes (id, code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        code || null,
        name || null,
        JSON.stringify(discount_details || {}),
        type || 'percentage',
        value || 0,
        minimum_order_amount || null,
        maximum_discount_amount || null,
        usage_limit || null,
        usage_limit_per_customer || null,
        starts_at || null,  // Handles '' and undefined
        expires_at || null, // Handles '' and undefined
        created_by
      ]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(ResponseFormatter.success('Coupon added successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    if (error.message && error.message.includes('Duplicate entry')) {
      return res.status(409).json(ResponseFormatter.failure('A coupon with this code already exists'));
    }
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Update coupon
router.put('/coupons/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Whitelist updatable columns to prevent column-name injection & mass assignment
    const ALLOWED_COUPON_COLUMNS = [
      'code', 'name', 'discount_details', 'type', 'value',
      'minimum_order_amount', 'maximum_discount_amount', 'usage_limit',
      'usage_limit_per_customer', 'is_active', 'starts_at', 'expires_at',
    ];
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_COUPON_COLUMNS.includes(key)) continue;
      if (TEXT_COLUMNS.includes(key) && !isOptionalString(value)) {
        return res.status(400).json(ResponseFormatter.failure(`${key} must be text`));
      }
      if (key === 'discount_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value || {}));
      } else {
        updateFields.push(`${key} = ?`);
        // Sanitize empty strings and undefined to NULL for date fields or optional params
        if (value === '' || value === undefined) {
          updateValues.push(null);
        } else {
          updateValues.push(value);
        }
      }
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE discount_codes SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(ResponseFormatter.success('Coupon updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// Delete coupon
router.delete('/coupons/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM discount_codes WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(ResponseFormatter.success('Coupon deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// List coupons (read-only; CSRF not required)
router.get('/coupons', admin, adminReadLimiter, async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM discount_codes');
    if (!listResult.success) throw new Error(listResult.error);

    const coupons = listResult.data.map(c => {
      let status = 'Draft';
      if (c.is_active) {
        const now = new Date();
        const start = c.starts_at ? new Date(c.starts_at) : null;
        const end = c.expires_at ? new Date(c.expires_at) : null;

        if (end && now > end) {
          status = 'Expired';
        } else if (start && now < start) {
          status = 'Scheduled';
        } else {
          status = 'Active';
        }
      }

      return {
        ...c,
        startDate: c.starts_at,
        endDate: c.expires_at,
        status: status
      };
    });

    res.json(ResponseFormatter.success('Coupons fetched successfully', [{ coupons }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

module.exports = router;
