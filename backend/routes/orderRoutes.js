const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, protectOptional } = require('../middleware/authMiddleware');
const emailService = require('../services/emailService');
const shippingService = require('../services/shippingService');
const db = new DatabaseUtil();

// Tax rate (configurable - default NY rate)
const TAX_RATE = parseFloat(process.env.TAX_RATE) || 0.08875;

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

  return { valid: true, coupon };
}

// POST /api/orders/apply-coupon
router.post('/apply-coupon', async (req, res) => {
  const { cartId, couponCode } = req.body;

  try {
    const cartItems = await getCartDetails(cartId);
    if (cartItems.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Cart is empty'));
    }

    let subtotal = 0;
    cartItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    if (!couponCode) {
      return res.json(ResponseFormatter.success('No coupon applied', { discount: 0 }));
    }

    const validation = await validateCoupon(couponCode, subtotal);
    if (!validation.valid) {
      return res.status(400).json(ResponseFormatter.failure(validation.message));
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

    res.json(ResponseFormatter.success('Coupon applied', { discount: discountAmount }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Failed to apply coupon'));
  }
});

// POST /api/orders/create
router.post('/create', protectOptional, async (req, res) => {
  const { cartId, shippingAddress, billingAddress, couponCode, shippingMethod } = req.body;
  const userId = req.user ? req.user.id : null;
  const guestEmail = req.body.guestEmail || null;

  try {
    // Get cart details
    const cartItems = await getCartDetails(cartId);
    if (cartItems.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Cart is empty'));
    }

    // Stock check — verify all items are in stock
    for (const item of cartItems) {
      const stockResult = await DatabaseUtil.executeQuery(
        'SELECT stock_quantity, name FROM products WHERE id = ?',
        [item.product_id]
      );
      if (stockResult.success && stockResult.data.length > 0) {
        const p = stockResult.data[0];
        if (p.stock_quantity !== null && p.stock_quantity < item.quantity) {
          return res.status(400).json(ResponseFormatter.failure(
            `Insufficient stock for "${p.name}". Available: ${p.stock_quantity}, Requested: ${item.quantity}`
          ));
        }
      }
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
        return res.status(400).json(ResponseFormatter.failure(validation.message));
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

    // Calculate tax (8.875% NY rate by default)
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;

    // Calculate shipping (use selected method or default standard)
    let shippingAmount = 9.99;
    if (shippingMethod) {
      const rates = shippingService.DEFAULT_RATES;
      const selected = rates.find(r => r.serviceType === shippingMethod);
      if (selected) {
        shippingAmount = selected.rate;
      }
    }
    // Free shipping over $100
    if (subtotal >= 100) {
      shippingAmount = 0;
    }

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

    // Send order confirmation email (non-blocking)
    const customerEmail = guestEmail || (req.user ? req.user.email : null);
    if (customerEmail) {
      emailService.sendOrderConfirmation({
        order_number: orderNumber,
        customer_name: shippingAddress?.first_name || 'Valued Customer',
        user_email: customerEmail,
        guest_email: guestEmail,
        created_at: new Date(),
        subtotal, tax_amount: taxAmount, shipping_amount: shippingAmount,
        discount_amount: discountAmount, total_amount: totalAmount,
        items: cartItems.map(i => ({ product_name: i.name, quantity: i.quantity, unit_price: i.price })),
      }).catch(err => console.error('Non-fatal: order confirmation email failed:', err.message));
    }

    res.json(ResponseFormatter.success('Order created successfully', { orderId, orderNumber }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Failed to create order'));
  }
});

// GET /api/orders/my-orders — Customer's order list
router.get('/my-orders', protect, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery(
      `SELECT id, order_number, status, subtotal, tax_amount, shipping_amount,
              discount_amount, total_amount, shipping_method, tracking_number,
              created_at, shipped_at, delivered_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    if (!result.success) throw new Error(result.error);
    res.json(ResponseFormatter.success('Orders fetched', { orders: result.data }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch orders'));
  }
});

// GET /api/orders/:id — Order detail (owner or admin)
router.get('/:id', protectOptional, async (req, res) => {
  try {
    const { id } = req.params;
    const orderResult = await DatabaseUtil.executeQuery(
      `SELECT o.*, u.email as user_email, u.first_name, u.last_name
       FROM orders o LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ? OR o.order_number = ?`,
      [id, id]
    );
    if (!orderResult.success || orderResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }
    const order = orderResult.data[0];

    // Check ownership (if logged in, must own order or be admin)
    if (req.user && order.user_id && req.user.id !== order.user_id && !req.user.isAdmin) {
      return res.status(403).json(ResponseFormatter.failure('Access denied'));
    }

    // Fetch order items
    const itemsResult = await DatabaseUtil.executeQuery(
      `SELECT oi.*, pi.thumbnail_small_url as image_url
       FROM order_items oi
       LEFT JOIN product_images pi ON oi.product_id = pi.product_id AND pi.is_primary = 1
       WHERE oi.order_id = ?`,
      [order.id]
    );

    // Fetch status history
    const historyResult = await DatabaseUtil.executeQuery(
      `SELECT osh.status, osh.status_details, osh.created_at,
              u.first_name as changed_by_name
       FROM order_status_history osh
       LEFT JOIN users u ON osh.changed_by = u.id
       WHERE osh.order_id = ? ORDER BY osh.created_at ASC`,
      [order.id]
    );

    res.json(ResponseFormatter.success('Order details fetched', {
      order: {
        ...order,
        items: itemsResult.success ? itemsResult.data : [],
        status_history: historyResult.success ? historyResult.data : [],
      },
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch order'));
  }
});

// GET /api/orders/track/:orderNumber — Public tracking lookup
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const result = await DatabaseUtil.executeQuery(
      `SELECT order_number, status, shipping_method, tracking_number,
              created_at, shipped_at, delivered_at
       FROM orders WHERE order_number = ?`,
      [orderNumber]
    );
    if (!result.success || result.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }

    const historyResult = await DatabaseUtil.executeQuery(
      `SELECT status, created_at FROM order_status_history
       WHERE order_id = (SELECT id FROM orders WHERE order_number = ?)
       ORDER BY created_at ASC`,
      [orderNumber]
    );

    res.json(ResponseFormatter.success('Order tracking', {
      tracking: {
        ...result.data[0],
        history: historyResult.success ? historyResult.data : [],
      },
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch tracking'));
  }
});

module.exports = router;