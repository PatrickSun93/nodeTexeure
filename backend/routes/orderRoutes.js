const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, protectOptional } = require('../middleware/authMiddleware');
const db = new DatabaseUtil();

// Helper function to get cart details
async function getCartDetails(cartId) {
  const cartItemsQuery = `
    SELECT ci.*, p.price, p.name
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = ?
  `;
  return await db.executeQuery(cartItemsQuery, [cartId]);
}

// Helper function to validate coupon
async function validateCoupon(code, subtotal) {
  const couponQuery = `
    SELECT * FROM discount_codes
    WHERE code = ? AND is_active = 1 AND (starts_at <= NOW() OR starts_at IS NULL) AND (expires_at >= NOW() OR expires_at IS NULL)
  `;
  const [coupon] = await db.executeQuery(couponQuery, [code]);

  if (!coupon) {
    return { valid: false, message: 'Invalid or expired coupon' };
  }

  if (subtotal < coupon.minimum_order_amount) {
    return { valid: false, message: `Minimum order amount of ${coupon.minimum_order_amount} required` };
  }

  // Check usage limit, etc. (simplified)
  return { valid: true, coupon };
}

// POST /api/orders/apply-coupon
router.post('/apply-coupon', async (req, res) => {
  const { cartId, couponCode } = req.body;

  try {
    const cartItems = await getCartDetails(cartId);
    if (cartItems.length === 0) {
      return res.status(400).json(ResponseFormatter.format('error', 'Cart is empty'));
    }

    let subtotal = 0;
    cartItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    if (!couponCode) {
      return res.json(ResponseFormatter.format('success', 'No coupon applied', { discount: 0 }));
    }

    const validation = await validateCoupon(couponCode, subtotal);
    if (!validation.valid) {
      return res.status(400).json(ResponseFormatter.format('error', validation.message));
    }

    const coupon = validation.coupon;
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = subtotal * (coupon.value / 100);
      if (coupon.maximum_discount_amount && discountAmount > coupon.maximum_discount_amount) {
        discountAmount = coupon.maximum_discount_amount;
      }
    } else if (coupon.type === 'fixed_amount') {
      discountAmount = coupon.value;
    }

    res.json(ResponseFormatter.format('success', 'Coupon applied', { discount: discountAmount }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.format('error', 'Failed to apply coupon'));
  }
});

// POST /api/orders/create
router.post('/create', protectOptional, async (req, res) => {
  const { cartId, shippingAddress, billingAddress, couponCode } = req.body;
  const userId = req.user ? req.user.id : null;
  const guestEmail = req.body.guestEmail || null;

  try {
    // Get cart details
    const cartItems = await getCartDetails(cartId);
    if (cartItems.length === 0) {
      return res.status(400).json(ResponseFormatter.format('error', 'Cart is empty'));
    }

    // Calculate subtotal
    let subtotal = 0;
    cartItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    let discountAmount = 0;
    if (couponCode) {
      const validation = await validateCoupon(couponCode, subtotal);
      if (!validation.valid) {
        return res.status(400).json(ResponseFormatter.format('error', validation.message));
      }
      const coupon = validation.coupon;
      if (coupon.type === 'percentage') {
        discountAmount = subtotal * (coupon.value / 100);
        if (coupon.maximum_discount_amount && discountAmount > coupon.maximum_discount_amount) {
          discountAmount = coupon.maximum_discount_amount;
        }
      } else if (coupon.type === 'fixed_amount') {
        discountAmount = coupon.value;
      }
    }

    // TODO: Calculate tax, shipping
    const taxAmount = 0; // Placeholder
    const shippingAmount = 0; // Placeholder
    const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

    // Generate order number
    const orderNumber = await db.getNextId('ORDER');

    // Create order
    const orderId = uuidv4();
    const orderQuery = `
      INSERT INTO orders (id, order_number, user_id, guest_email, status, subtotal, tax_amount, shipping_amount, discount_amount, total_amount, shipping_address_json, billing_address_json)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.executeQuery(orderQuery, [orderId, orderNumber, userId, guestEmail, subtotal, taxAmount, shippingAmount, discountAmount, totalAmount, JSON.stringify(shippingAddress), JSON.stringify(billingAddress)]);

    // Create order items
    for (const item of cartItems) {
      const orderItemId = uuidv4();
      const orderItemQuery = `
        INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, product_sku, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await db.executeQuery(orderItemQuery, [orderItemId, orderId, item.product_id, item.variant_id, item.name, item.sku || '', item.quantity, item.price, item.price * item.quantity]);
    }

    // Clear cart
    await db.executeQuery('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
    await db.executeQuery('DELETE FROM shopping_carts WHERE id = ?', [cartId]);

    res.json(ResponseFormatter.format('success', 'Order created successfully', { orderId, orderNumber }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.format('error', 'Failed to create order'));
  }
});

module.exports = router;