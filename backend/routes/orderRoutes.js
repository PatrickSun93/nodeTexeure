const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, protectOptional } = require('../middleware/authMiddleware');
const EmailQueueService = require('../services/emailQueueService');
const AbandonedCartService = require('../services/abandonedCartService');
const OrderService = require('../services/orderService');
const taxService = require('../services/taxService');
const couponService = require('../services/couponService');
const db = new DatabaseUtil();

// Initialize services
const emailQueueService = new EmailQueueService();
const abandonedCartService = new AbandonedCartService();
const orderService = new OrderService();

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

// Helper function to validate coupon (deprecated - using couponService now)
async function validateCoupon(code, subtotal, userId = null, cartItems = []) {
  return await couponService.validateCoupon(code, subtotal, userId, cartItems);
}

// POST /api/orders/apply-coupon
router.post('/apply-coupon', protectOptional, async (req, res) => {
  const { cartId, couponCode } = req.body;
  const userId = req.user ? req.user.id : null;

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

    const validation = await couponService.validateCoupon(
      couponCode.toUpperCase(), 
      subtotal, 
      userId, 
      cartItems
    );
    
    if (!validation.valid) {
      return res.status(400).json(ResponseFormatter.failure(validation.message));
    }

    const discountAmount = couponService.calculateDiscountAmount(validation.coupon, subtotal);

    res.json(ResponseFormatter.success('Coupon applied', { 
      discount: discountAmount,
      coupon: {
        code: validation.coupon.code,
        name: validation.coupon.name,
        type: validation.coupon.type
      }
    }));
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to apply coupon'));
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
      return res.status(400).json(ResponseFormatter.failure('Cart is empty'));
    }

    // Calculate subtotal
    let subtotal = 0;
    cartItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    let discountAmount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const validation = await couponService.validateCoupon(
        couponCode.toUpperCase(), 
        subtotal, 
        userId, 
        cartItems
      );
      
      if (!validation.valid) {
        return res.status(400).json(ResponseFormatter.failure(validation.message));
      }
      
      appliedCoupon = validation.coupon;
      discountAmount = couponService.calculateDiscountAmount(appliedCoupon, subtotal);
    }

    // Calculate tax based on billing address
    let taxAmount = 0;
    let taxDetails = [];
    try {
      const taxCalculation = await taxService.calculateTax(billingAddress, cartItems, subtotal);
      taxAmount = taxCalculation.taxAmount;
      taxDetails = taxCalculation.breakdown;
    } catch (error) {
      console.error('Tax calculation failed:', error);
      // Continue with 0 tax if calculation fails
      taxAmount = 0;
    }

    // TODO: Calculate shipping (placeholder for now)
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

    // Record coupon usage if coupon was applied
    if (appliedCoupon && discountAmount > 0) {
      try {
        await couponService.recordCouponUsage(appliedCoupon.id, orderId, userId, discountAmount);
        console.log(`Recorded coupon usage: ${appliedCoupon.code} for order ${orderNumber}`);
      } catch (couponError) {
        console.error('Failed to record coupon usage:', couponError);
        // Don't fail the order creation if coupon recording fails
      }
    }

    // Clear cart
    await db.executeQuery('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
    await db.executeQuery('DELETE FROM shopping_carts WHERE id = ?', [cartId]);

    // Queue order confirmation email and cancel abandoned cart emails
    try {
      const customerEmail = userId ? req.user.email : guestEmail;
      if (customerEmail) {
        // Cancel any pending abandoned cart emails since customer completed purchase
        await emailQueueService.cancelAbandonedCartEmails(customerEmail);
        console.log(`Cancelled abandoned cart emails for ${customerEmail}`);

        const orderData = {
          orderNumber,
          orderId,
          totalAmount: `$${totalAmount.toFixed(2)}`,
          subtotal: `$${subtotal.toFixed(2)}`,
          taxAmount: `$${taxAmount.toFixed(2)}`,
          taxDetails: taxDetails,
          shippingAmount: `$${shippingAmount.toFixed(2)}`,
          discountAmount: `$${discountAmount.toFixed(2)}`,
          items: cartItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: `$${item.price.toFixed(2)}`
          })),
          createdAt: new Date(),
          customerName: userId ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() : 'Guest'
        };

        await emailQueueService.queueOrderConfirmation(customerEmail, orderData);
        console.log(`Order confirmation email queued for ${customerEmail}`);
      }
    } catch (emailError) {
      console.error('Failed to queue order confirmation email:', emailError);
      // Don't fail the order creation if email fails
    }

    // Mark cart as recovered from abandonment
    try {
      await abandonedCartService.markCartRecovered(cartId, orderId);
    } catch (recoveryError) {
      console.warn('Failed to mark cart as recovered:', recoveryError.message);
      // Don't fail the order creation if cart recovery marking fails
    }

    res.json(ResponseFormatter.success('Order created successfully', { orderId, orderNumber }));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Failed to create order'));
  }
});

// GET /api/orders/history - Get customer order history
router.get('/history', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await orderService.getCustomerOrderHistory(userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch order history'));
  }
});

// GET /api/orders/guest-history/:email - Get guest order history
router.get('/guest-history/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await orderService.getCustomerOrderHistory(null, email);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error fetching guest order history:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch order history'));
  }
});

// GET /api/orders/:id - Get order details
router.get('/:id', protectOptional, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order details
    const orderQuery = `
      SELECT 
        o.*,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), o.guest_email) as customer_name,
        u.email as customer_email,
        u.phone as customer_phone
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `;
    const orderResult = await db.executeQuery(orderQuery, [id]);
    
    if (!orderResult.success || !orderResult.data.length) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }
    
    const order = orderResult.data[0];
    
    // Check if user has access to this order
    if (req.user) {
      // Logged in user - check if it's their order
      if (order.user_id !== req.user.id) {
        return res.status(403).json(ResponseFormatter.failure('Access denied'));
      }
    } else {
      // Guest user - only allow access if they provide the correct email
      const { email } = req.query;
      if (!email || order.guest_email !== email) {
        return res.status(403).json(ResponseFormatter.failure('Access denied'));
      }
    }
    
    // Get order items
    const itemsQuery = `
      SELECT 
        oi.*,
        p.name as current_product_name,
        pi.thumbnail_small_url
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
      WHERE oi.order_id = ?
      ORDER BY oi.created_at
    `;
    const itemsResult = await db.executeQuery(itemsQuery, [id]);
    
    order.items = itemsResult.success ? itemsResult.data : [];
    
    // Parse JSON fields
    if (order.shipping_address_json) {
      order.shipping_address = JSON.parse(order.shipping_address_json);
    }
    if (order.billing_address_json) {
      order.billing_address = JSON.parse(order.billing_address_json);
    }
    
    // Get order status history
    const historyResult = await orderService.getOrderStatusHistory(id);
    order.status_history = historyResult.success ? historyResult.data : [];
    
    res.json(ResponseFormatter.success('Order details fetched successfully', order));
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch order details'));
  }
});

// GET /api/orders/:id/tracking - Get order tracking information
router.get('/:id/tracking', protectOptional, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order with tracking info
    const orderQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.tracking_number,
        o.shipped_at,
        o.delivered_at,
        o.user_id,
        o.guest_email
      FROM orders o
      WHERE o.id = ?
    `;
    const orderResult = await db.executeQuery(orderQuery, [id]);
    
    if (!orderResult.success || !orderResult.data.length) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }
    
    const order = orderResult.data[0];
    
    // Check access permissions
    if (req.user) {
      if (order.user_id !== req.user.id) {
        return res.status(403).json(ResponseFormatter.failure('Access denied'));
      }
    } else {
      const { email } = req.query;
      if (!email || order.guest_email !== email) {
        return res.status(403).json(ResponseFormatter.failure('Access denied'));
      }
    }
    
    // Get status history for tracking timeline
    const historyResult = await orderService.getOrderStatusHistory(id);
    const statusHistory = historyResult.success ? historyResult.data : [];
    
    const trackingInfo = {
      orderNumber: order.order_number,
      status: order.status,
      trackingNumber: order.tracking_number,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
      statusHistory: statusHistory.map(entry => ({
        status: entry.status,
        timestamp: entry.created_at,
        notes: entry.status_details?.notes,
        changedBy: entry.status_details?.changed_by_name
      }))
    };
    
    res.json(ResponseFormatter.success('Tracking information fetched successfully', trackingInfo));
  } catch (error) {
    console.error('Error fetching tracking information:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch tracking information'));
  }
});

module.exports = router;