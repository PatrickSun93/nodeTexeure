const express = require('express');
const DatabaseUtil = require('../utils/database');
const { formatResponse } = require('../utils/responseFormatter');
const router = express.Router();

// Product Management
// Add new product
router.post('/products', async (req, res) => {
  try {
    const { sku, name, slug, description, short_description, category_id, base_price, product_details, meta_title, meta_description, meta_keywords } = req.body;
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("PROD") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id; // From auth middleware
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, created_by, meta_title, meta_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, slug, description, short_description, category_id, base_price, JSON.stringify(product_details), created_by, meta_title, meta_description, meta_keywords]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(formatResponse(true, { id }, 'Product added successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Update product
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'product_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(formatResponse(true, null, 'Product updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Delete product
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM products WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(formatResponse(true, null, 'Product deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Coupon Management
// Add new coupon
router.post('/coupons', async (req, res) => {
  try {
    const { code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at } = req.body;
    const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("DISC") as id');
    if (!idResult.success) throw new Error(idResult.error);
    const id = idResult.data[0].id;
    const created_by = req.user.id;
    const insertResult = await DatabaseUtil.executeQuery(
      'INSERT INTO discount_codes (id, code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, code, name, JSON.stringify(discount_details), type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by]
    );
    if (!insertResult.success) throw new Error(insertResult.error);
    res.status(201).json(formatResponse(true, { id }, 'Coupon added successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Update coupon
router.put('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'discount_details') {
        updateFields.push(`${key} = ?`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE discount_codes SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(formatResponse(true, null, 'Coupon updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Delete coupon
router.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM discount_codes WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(formatResponse(true, null, 'Coupon deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Inventory Management
// Update inventory
router.put('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity_available, quantity_reserved, reorder_point, reorder_quantity } = req.body;
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE inventory SET quantity_available = ?, quantity_reserved = ?, reorder_point = ?, reorder_quantity = ? WHERE id = ?',
      [quantity_available, quantity_reserved, reorder_point, reorder_quantity, id]
    );
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(formatResponse(true, null, 'Inventory updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// User Management
// List users
router.get('/users', async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT id, email, first_name, last_name, role, status FROM users');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(formatResponse(true, { users: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updateFields = [];
    const updateValues = [];
    for (const [key, value] of Object.entries(updates)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }
    updateValues.push(id);
    const updateResult = await DatabaseUtil.executeQuery(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!updateResult.success) throw new Error(updateResult.error);
    res.json(formatResponse(true, null, 'User updated successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await DatabaseUtil.executeQuery('DELETE FROM users WHERE id = ?', [id]);
    if (!deleteResult.success) throw new Error(deleteResult.error);
    res.json(formatResponse(true, null, 'User deleted successfully'));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// List products
router.get('/products', async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM products');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(formatResponse(true, { products: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// List coupons
router.get('/coupons', async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM discount_codes');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(formatResponse(true, { coupons: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

// List inventory
router.get('/inventory', async (req, res) => {
  try {
    const listResult = await DatabaseUtil.executeQuery('SELECT * FROM inventory');
    if (!listResult.success) throw new Error(listResult.error);
    res.json(formatResponse(true, { inventory: listResult.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(formatResponse(false, null, 'Server error'));
  }
});

module.exports = router;