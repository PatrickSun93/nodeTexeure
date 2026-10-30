const express = require('express');
const { protect, protectOptional } = require('../middleware/authMiddleware');
const DatabaseUtil = require('../utils/database');
const InventoryService = require('../services/inventoryService');
const ResponseFormatter = require('../utils/responseFormatter');
const EmailQueueService = require('../services/emailQueueService');
const AbandonedCartService = require('../services/abandonedCartService');
const crypto = require('crypto');
const router = express.Router();

// Initialize services
const emailQueueService = new EmailQueueService();
// Reuse the one shared AbandonedCartService instance so the abandoned-cart recovery
// route can share it without starting a second background detection interval.
const abandonedCartService = AbandonedCartService.getShared();

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
    const itemsResult = await DatabaseUtil.executeQuery(`
      SELECT 
        ci.*,
        p.name,
        p.base_price,
        pv.size,
        pv.color,
        pv.pattern,
        pv.price_adjustment,
        pv.sku as variant_sku,
        i.quantity_available,
        i.quantity_reserved
      FROM cart_items ci 
      JOIN products p ON ci.product_id = p.id 
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      LEFT JOIN inventory i ON ci.product_id = i.product_id AND ci.variant_id = i.variant_id
      WHERE ci.cart_id = ?
    `, [cartId]);
    
    // Add availability info to each item
    const itemsWithAvailability = itemsResult.data.map(item => ({
      ...item,
      in_stock: item.quantity_available >= item.quantity,
      available_quantity: item.quantity_available || 0
    }));

    // Track cart activity for abandonment detection
    const userEmail = req.user ? req.user.email : null;
    const sessionId = req.cookies.sessionId || null;
    await abandonedCartService.trackCartActivity(cartId, userEmail, sessionId);
    
    res.json(ResponseFormatter.success('Cart fetched', { 
      cartId, 
      items: itemsWithAvailability 
    }));
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get cart'));
  }
});

// POST /api/cart/add - Add item to cart
router.post('/add', protectOptional, async (req, res) => {
  try {
    const { product_id, variant_id } = req.body;

    // Validate quantity: must be a positive integer (capped to prevent abuse)
    const quantity = Number.parseInt(req.body.quantity ?? 1, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json(ResponseFormatter.failure('Quantity must be a positive integer'));
    }
    if (quantity > 999) {
      return res.status(400).json(ResponseFormatter.failure('Quantity cannot exceed 999'));
    }

    const cartId = await getOrCreateCart(req, res);
    
    // Check inventory availability
    const availabilityResult = await InventoryService.getAvailability(product_id, variant_id);
    if (!availabilityResult.success) {
      return res.status(400).json(ResponseFormatter.failure('Failed to check inventory availability'));
    }
    
    if (!availabilityResult.data.in_stock || availabilityResult.data.available < quantity) {
      return res.status(400).json(ResponseFormatter.failure(
        `Insufficient stock. Available: ${availabilityResult.data.available}, Requested: ${quantity}`
      ));
    }
    
    // Check if item exists
    const checkResult = await DatabaseUtil.executeQuery(
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?',
      [cartId, product_id, variant_id]
    );
    
    if (checkResult.data.length > 0) {
      // Update quantity - check total doesn't exceed available stock
      const existingQuantity = checkResult.data[0].quantity;
      const newTotalQuantity = existingQuantity + quantity;
      
      if (newTotalQuantity > availabilityResult.data.available) {
        return res.status(400).json(ResponseFormatter.failure(
          `Cannot add ${quantity} items. Total would be ${newTotalQuantity}, but only ${availabilityResult.data.available} available`
        ));
      }
      
      await DatabaseUtil.executeQuery(
        'UPDATE cart_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantity, checkResult.data[0].id]
      );
    } else {
      // Insert new
      const itemIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("CARTITEM") as id');
      const itemId = itemIdResult.data[0].id;
      
      // Get price (base price + variant adjustment)
      let price;
      if (variant_id) {
        const priceResult = await DatabaseUtil.executeQuery(
          'SELECT p.base_price, pv.price_adjustment FROM products p JOIN product_variants pv ON p.id = pv.product_id WHERE p.id = ? AND pv.id = ?',
          [product_id, variant_id]
        );
        if (priceResult.data.length === 0) {
          return res.status(400).json(ResponseFormatter.failure('Product variant not found'));
        }
        price = parseFloat(priceResult.data[0].base_price) + parseFloat(priceResult.data[0].price_adjustment);
      } else {
        const priceResult = await DatabaseUtil.executeQuery('SELECT base_price FROM products WHERE id = ?', [product_id]);
        if (priceResult.data.length === 0) {
          return res.status(400).json(ResponseFormatter.failure('Product not found'));
        }
        price = priceResult.data[0].base_price;
      }
      
      await DatabaseUtil.executeQuery(
        'INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
        [itemId, cartId, product_id, variant_id, quantity, price]
      );
    }

    // Track cart activity for abandonment detection
    const userEmail = req.user ? req.user.email : null;
    const sessionId = req.cookies.sessionId || null;
    await abandonedCartService.trackCartActivity(cartId, userEmail, sessionId);
    
    res.json(ResponseFormatter.success('Item added to cart'));
  } catch (error) {
    console.error('Error adding item to cart:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to add item'));
  }
});

// PUT /api/cart/update/:itemId - Update item quantity
router.put('/update/:itemId', protectOptional, async (req, res) => {
  try {
    // Validate quantity: must be a positive integer (to remove an item, use DELETE /remove)
    const quantity = Number.parseInt(req.body.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json(ResponseFormatter.failure('Quantity must be a positive integer'));
    }
    if (quantity > 999) {
      return res.status(400).json(ResponseFormatter.failure('Quantity cannot exceed 999'));
    }
    
    const cartId = await getOrCreateCart(req, res);
    
    // Get current cart item details
    const itemResult = await DatabaseUtil.executeQuery(
      'SELECT product_id, variant_id FROM cart_items WHERE id = ? AND cart_id = ?',
      [req.params.itemId, cartId]
    );
    
    if (!itemResult.success || itemResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Item not found'));
    }
    
    const item = itemResult.data[0];
    
    // Check inventory availability for new quantity
    const availabilityResult = await InventoryService.getAvailability(item.product_id, item.variant_id);
    if (!availabilityResult.success) {
      return res.status(400).json(ResponseFormatter.failure('Failed to check inventory availability'));
    }
    
    if (!availabilityResult.data.in_stock || availabilityResult.data.available < quantity) {
      return res.status(400).json(ResponseFormatter.failure(
        `Insufficient stock. Available: ${availabilityResult.data.available}, Requested: ${quantity}`
      ));
    }
    
    const result = await DatabaseUtil.executeQuery(
      'UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cart_id = ?',
      [quantity, req.params.itemId, cartId]
    );
    
    if (result.success && result.data.affectedRows > 0) {
      res.json(ResponseFormatter.success('Item updated'));
    } else {
      res.status(404).json(ResponseFormatter.failure('Item not found'));
    }
  } catch (error) {
    console.error('Error updating cart item:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to update item'));
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
    console.error('Error removing cart item:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to remove item'));
  }
});

// POST /api/cart/reserve-stock - Reserve stock for checkout
router.post('/reserve-stock', protectOptional, async (req, res) => {
  try {
    const cartId = await getOrCreateCart(req, res);
    const userId = req.user ? req.user.id : null;
    
    // Get cart items
    const itemsResult = await DatabaseUtil.executeQuery(
      'SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id = ?',
      [cartId]
    );
    
    if (!itemsResult.success || itemsResult.data.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Cart is empty'));
    }
    
    const items = itemsResult.data;
    const result = await InventoryService.reserveStock(items, cartId, userId);
    
    if (!result.success) {
      // result.error may carry internal detail (DB/service messages) — return a
      // generic, user-facing message instead of leaking it.
      return res.status(400).json(ResponseFormatter.failure('Unable to reserve stock for checkout'));
    }

    res.json(ResponseFormatter.success('Stock reserved for checkout', {
      reservations: result.data,
      expires_in_minutes: 60
    }));
  } catch (error) {
    console.error('Error reserving stock:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to reserve stock'));
  }
});

/**
 * POST /api/cart/track-abandonment
 * Track cart abandonment and schedule recovery emails
 */
router.post('/track-abandonment', protectOptional, async (req, res) => {
  try {
    const cartId = await getOrCreateCart(req, res);
    
    // Get cart items to check if cart has items
    const cartItemsResult = await DatabaseUtil.executeQuery(
      `SELECT ci.*, p.name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id 
       WHERE ci.cart_id = ?`,
      [cartId]
    );

    if (!cartItemsResult.success || cartItemsResult.data.length === 0) {
      return res.json(ResponseFormatter.success('No items in cart to track'));
    }

    // Get customer email
    let customerEmail = null;
    let customerName = 'Guest';

    if (req.user) {
      customerEmail = req.user.email;
      customerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Customer';
    } else if (req.body.guestEmail) {
      customerEmail = req.body.guestEmail;
    }

    if (!customerEmail) {
      return res.json(ResponseFormatter.success('No email available for cart abandonment tracking'));
    }

    // Calculate cart total
    let totalAmount = 0;
    const items = cartItemsResult.data.map(item => {
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;
      return {
        name: item.name,
        quantity: item.quantity,
        price: `$${item.price.toFixed(2)}`
      };
    });

    // Prepare cart data for email
    const cartData = {
      items: items,
      totalAmount: `$${totalAmount.toFixed(2)}`,
      checkoutUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout`,
      customerName: customerName
    };

    // Cancel any existing abandoned cart emails for this customer
    await emailQueueService.cancelAbandonedCartEmails(customerEmail);

    // Queue the abandoned cart email sequence
    const queueIds = [];
    for (let step = 1; step <= 3; step++) {
      const queueId = await emailQueueService.queueAbandonedCartEmail(customerEmail, cartData, step);
      queueIds.push(queueId);
    }

    console.log(`Abandoned cart email sequence queued for ${customerEmail}:`, queueIds);

    res.json(ResponseFormatter.success('Cart abandonment tracking started', {
      customerEmail,
      queueIds,
      totalAmount: cartData.totalAmount,
      itemCount: items.length
    }));

  } catch (error) {
    console.error('Error tracking cart abandonment:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to track cart abandonment'));
  }
});

/**
 * POST /api/cart/cancel-abandonment
 * Cancel abandoned cart emails (called when customer completes purchase)
 */
router.post('/cancel-abandonment', protectOptional, async (req, res) => {
  try {
    let customerEmail = null;

    if (req.user) {
      customerEmail = req.user.email;
    } else if (req.body.guestEmail) {
      customerEmail = req.body.guestEmail;
    }

    if (!customerEmail) {
      return res.json(ResponseFormatter.success('No email to cancel abandonment tracking'));
    }

    const cancelledCount = await emailQueueService.cancelAbandonedCartEmails(customerEmail);

    res.json(ResponseFormatter.success('Abandoned cart emails cancelled', {
      customerEmail,
      cancelledCount
    }));

  } catch (error) {
    console.error('Error cancelling cart abandonment:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to cancel cart abandonment'));
  }
});

module.exports = router;