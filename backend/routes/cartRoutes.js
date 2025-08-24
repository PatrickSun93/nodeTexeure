const express = require('express');
const { protect, protectOptional } = require('../middleware/authMiddleware');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const crypto = require('crypto');
const router = express.Router();

// Helper to get or create cart
async function getOrCreateCart(req, res) {
  let cartId;
  if (req.user) {
    // Logged-in user
    const result = await DatabaseUtil.executeQuery('SELECT id FROM shopping_carts WHERE user_id = ?', [req.user.id]);
    if (result.success && result.data.length > 0) {
      cartId = result.data[0].id;
    } else {
      const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("CART") as id');
      cartId = idResult.data[0].id;
      await DatabaseUtil.executeQuery('INSERT INTO shopping_carts (id, user_id) VALUES (?, ?)', [cartId, req.user.id]);
    }
  } else {
    // Guest - use session_id from cookie or create new
    let sessionId = req.cookies.sessionId;
    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('hex');
      res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    }
    const result = await DatabaseUtil.executeQuery('SELECT id FROM shopping_carts WHERE session_id = ?', [sessionId]);
    if (result.success && result.data.length > 0) {
      cartId = result.data[0].id;
    } else {
      const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("CART") as id');
      cartId = idResult.data[0].id;
      await DatabaseUtil.executeQuery('INSERT INTO shopping_carts (id, session_id) VALUES (?, ?)', [cartId, sessionId]);
    }
  }
  return cartId;
}

// GET /api/cart - Get current cart
router.get('/', protectOptional, async (req, res) => {
  try {
    const cartId = await getOrCreateCart(req, res);
    const itemsResult = await DatabaseUtil.executeQuery(
      'SELECT ci.*, p.name, p.base_price FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = ?',
      [cartId]
    );
    res.json(ResponseFormatter.success('Cart fetched', { cartId, items: itemsResult.data }));
  } catch (error) {
    res.status(500).json(ResponseFormatter.failure('Failed to get cart', { error: error.message }));
  }
});

// POST /api/cart/add - Add item to cart
router.post('/add', protectOptional, async (req, res) => {
  try {
    const { product_id, variant_id, quantity = 1 } = req.body;
    const cartId = await getOrCreateCart(req, res);
    // Check if item exists
    const checkResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?',
      [cartId, product_id, variant_id]
    );
    if (checkResult.data.length > 0) {
      // Update quantity
      await DatabaseUtil.executeQuery(
        'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
        [quantity, checkResult.data[0].id]
      );
    } else {
      // Insert new
      const itemIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("CARTITEM") as id');
      const itemId = itemIdResult.data[0].id;
      const priceResult = await DatabaseUtil.executeQuery('SELECT base_price FROM products WHERE id = ?', [product_id]);
      const price = priceResult.data[0].base_price;
      await DatabaseUtil.executeQuery(
        'INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
        [itemId, cartId, product_id, variant_id, quantity, price]
      );
    }
    res.json(ResponseFormatter.success('Item added to cart'));
  } catch (error) {
    res.status(500).json(ResponseFormatter.failure('Failed to add item', { error: error.message }));
  }
});

// PUT /api/cart/update/:itemId - Update item quantity
router.put('/update/:itemId', protectOptional, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity <= 0) {
      return res.status(400).json(ResponseFormatter.failure('Quantity must be positive'));
    }
    const cartId = await getOrCreateCart(req, res);
    const result = await DatabaseUtil.executeQuery(
      'UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?',
      [quantity, req.params.itemId, cartId]
    );
    if (result.success && result.data.affectedRows > 0) {
      res.json(ResponseFormatter.success('Item updated'));
    } else {
      res.status(404).json(ResponseFormatter.failure('Item not found'));
    }
  } catch (error) {
    res.status(500).json(ResponseFormatter.failure('Failed to update item', { error: error.message }));
  }
});

// DELETE /api/cart/remove/:itemId - Remove item from cart
router.delete('/remove/:itemId', protectOptional, async (req, res) => {
  try {
    const cartId = await getOrCreateCart(req, res);
    const result = await DatabaseUtil.executeQuery(
      'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
      [req.params.itemId, cartId]
    );
    if (result.success && result.data.affectedRows > 0) {
      res.json(ResponseFormatter.success('Item removed'));
    } else {
      res.status(404).json(ResponseFormatter.failure('Item not found'));
    }
  } catch (error) {
    res.status(500).json(ResponseFormatter.failure('Failed to remove item', { error: error.message }));
  }
});

module.exports = router;