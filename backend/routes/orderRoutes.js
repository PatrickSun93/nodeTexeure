const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { randomUUID: uuidv4 } = require('crypto');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, protectOptional } = require('../middleware/authMiddleware');
const emailQueueProducer = require('../services/emailQueueProducer');
const shippingService = require('../services/shippingService');
const { guestSessionId } = require('../utils/guestSession');
const db = DatabaseUtil; // executeQuery et al. are static — reference the class, not an instance

// Default tax rate fallback (NY rate)
const DEFAULT_TAX_RATE = parseFloat(process.env.TAX_RATE) || 0.08875;

// Look up tax rate from tax_rates table by state/country, falling back to default
async function getTaxRate(stateCode, countryCode) {
  try {
    const result = await db.executeQuery(
      `SELECT tax_rate FROM tax_rates
       WHERE is_active = 1
         AND JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.country')) = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.state')) = ?
       ORDER BY id LIMIT 1`,
      [String(countryCode || 'US'), String(stateCode || '')]
    );
    const rows = db.rows(result);
    if (rows.length > 0) {
      return parseFloat(rows[0].tax_rate);
    }
    // Try country-level rate
    const countryResult = await db.executeQuery(
      `SELECT tax_rate FROM tax_rates
       WHERE is_active = 1
         AND JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.country')) = ?
         AND (JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.state')) = '' OR JSON_EXTRACT(location_json, '$.state') IS NULL)
       ORDER BY id LIMIT 1`,
      [String(countryCode || 'US')]
    );
    const countryRows = db.rows(countryResult);
    if (countryRows.length > 0) {
      return parseFloat(countryRows[0].tax_rate);
    }
  } catch (err) {
    console.error('Tax rate lookup failed, using default:', err.message);
  }
  return DEFAULT_TAX_RATE;
}

// Crockford base32 (drops I, L, O, U so codes are unambiguous when read aloud/printed).
const ORDER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Generate a human-facing order number that is NOT sequential. Sequential numbers
// (get_next_id) are enumerable — they leak order volume and enable order-lookup IDOR.
// This draws ~50 bits of CSPRNG entropy, formatted NOR-XXXXX-XXXXX, and retries on the
// astronomically unlikely collision against the UNIQUE order_number column.
async function generateOrderNumber() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const bytes = crypto.randomBytes(10);
    let code = '';
    for (let i = 0; i < 10; i++) code += ORDER_ALPHABET[bytes[i] & 31];
    const candidate = `NOR-${code.slice(0, 5)}-${code.slice(5)}`;
    const existing = await db.executeQuery(
      'SELECT 1 FROM orders WHERE order_number = ? LIMIT 1',
      [candidate]
    );
    if (!DatabaseUtil.first(existing)) return candidate;
  }
  // Fallback with extra entropy — effectively never reached.
  return `NOR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

// Money is kept in cents-exact numbers: round every derived amount so the stored
// DECIMAL(10,2) parts always add up to the stored total.
const cents = (n) => Math.round(Number(n) * 100) / 100;

// Helper function to get cart details. executeQuery returns { success, data };
// callers iterate the rows, so return the data array (price comes from cart_items).
// sku: the variant's SKU when the line has one, else the product's.
async function getCartDetails(cartId) {
  const cartItemsQuery = `
    SELECT ci.*, p.name, COALESCE(pv.sku, p.sku) AS sku
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    LEFT JOIN product_variants pv ON ci.variant_id = pv.id
    WHERE ci.cart_id = ?
    ORDER BY ci.created_at ASC, ci.id ASC
  `;
  const result = await db.executeQuery(cartItemsQuery, [cartId]);
  if (!result.success) throw new Error(result.error);
  return DatabaseUtil.rows(result);
}

// Subtotal of a cart, in cents.
const cartSubtotal = (items) => cents(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));

// Discount for a validated coupon against a subtotal: { discount, freeShipping }.
// free_shipping coupons carry no subtotal discount — they zero shipping at order
// time. Never below zero or beyond the subtotal (an oversized fixed_amount coupon
// must not produce a negative total).
function couponDiscount(coupon, subtotal) {
  let discount = 0;
  let freeShipping = false;
  if (coupon.type === 'percentage') {
    discount = subtotal * (Number(coupon.value) / 100);
    if (coupon.maximum_discount_amount != null && discount > Number(coupon.maximum_discount_amount)) {
      discount = Number(coupon.maximum_discount_amount);
    }
  } else if (coupon.type === 'fixed_amount') {
    discount = Number(coupon.value);
  } else if (coupon.type === 'free_shipping') {
    freeShipping = true;
  }
  return { discount: cents(Math.max(0, Math.min(discount, subtotal))), freeShipping };
}

const isAddress = (a) => a !== null && typeof a === 'object' && !Array.isArray(a);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ownership guard shared by apply-coupon and create. Cart IDs are sequential and
// enumerable (CART0000000001…), so we must confirm the caller actually owns the
// cart before reading its totals, converting it to an order, or deleting it.
// Ownership mirrors cartRoutes.getOrCreateCart exactly:
//   - logged-in users own the cart whose shopping_carts.user_id equals their id;
//   - guests own the cart whose user_id IS NULL and whose session_id matches the
//     'sessionId' HttpOnly cookie set by cartRoutes.
// A cart owned by a real user_id can never be used by an unauthenticated caller.
// Returns false for a missing cart too, so we never leak cart existence.
async function ownsCart(cartId, req) {
  if (!cartId) return false;
  const result = await db.executeQuery(
    'SELECT user_id, session_id FROM shopping_carts WHERE id = ?',
    [String(cartId)]
  );
  const cart = DatabaseUtil.first(result);
  if (!cart) return false;

  const authUserId = req.user ? req.user.id : null;
  if (authUserId) {
    // Authenticated request: the cart must belong to this account.
    return cart.user_id === authUserId;
  }

  // Unauthenticated (guest): a cart owned by a registered account is off-limits.
  if (cart.user_id) return false;

  // Guest cart: require a positive match on the same session cookie cartRoutes
  // uses (only a session id we issue counts; see utils/guestSession.js).
  const sessionId = guestSessionId(req);
  return sessionId !== null && cart.session_id === sessionId;
}

// Helper function to validate coupon
async function validateCoupon(code, subtotal) {
  const couponQuery = `
    SELECT * FROM discount_codes
    WHERE code = ? AND is_active = 1 AND (starts_at <= NOW() OR starts_at IS NULL) AND (expires_at >= NOW() OR expires_at IS NULL)
    ORDER BY id LIMIT 1
  `;
  // Bind as a string: MySQL fixes a prepared statement's parameter type on first
  // use, so a numeric code (`7`) would make later codes compare as numbers —
  // every code casts to 0, and `code = 0` matches the first coupon.
  const couponResult = await db.executeQuery(couponQuery, [String(code)]);
  const coupon = DatabaseUtil.first(couponResult);

  if (!coupon) {
    return { valid: false, message: 'Invalid or expired coupon' };
  }

  if (subtotal < Number(coupon.minimum_order_amount)) {
    return { valid: false, message: `Minimum order amount of ${coupon.minimum_order_amount} required` };
  }

  return { valid: true, coupon };
}

// POST /api/orders/apply-coupon
router.post('/apply-coupon', protectOptional, async (req, res) => {
  const { cartId, couponCode } = req.body;

  try {
    if (!(await ownsCart(cartId, req))) {
      // Do not leak whether the cart exists — same response as a real mismatch.
      return res.status(403).json(ResponseFormatter.failure('Access denied'));
    }

    const cartItems = await getCartDetails(String(cartId));
    if (cartItems.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Cart is empty'));
    }

    const subtotal = cartSubtotal(cartItems);

    if (!couponCode) {
      return res.json(ResponseFormatter.success('No coupon applied', { discount: 0 }));
    }

    const validation = await validateCoupon(couponCode, subtotal);
    if (!validation.valid) {
      return res.status(400).json(ResponseFormatter.failure(validation.message));
    }

    // freeShipping is surfaced so the checkout UI can reflect it.
    const { discount, freeShipping } = couponDiscount(validation.coupon, subtotal);
    res.json(ResponseFormatter.success('Coupon applied', { discount, freeShipping }));
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
    if (!isAddress(shippingAddress) || !isAddress(billingAddress)) {
      return res.status(400).json(ResponseFormatter.failure('Shipping and billing addresses are required'));
    }
    if (!userId && (typeof guestEmail !== 'string' || !EMAIL_RE.test(guestEmail))) {
      return res.status(400).json(ResponseFormatter.failure('A valid email is required for guest checkout'));
    }

    // Enforce cart ownership before reading totals, converting the cart to an
    // order, decrementing inventory, or deleting it (IDOR guard).
    if (!(await ownsCart(cartId, req))) {
      // Do not leak whether the cart exists — same response as a real mismatch.
      return res.status(403).json(ResponseFormatter.failure('Access denied'));
    }

    // Get cart details (by the same string ownsCart checked)
    const cartKey = String(cartId);
    const cartItems = await getCartDetails(cartKey);
    if (cartItems.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Cart is empty'));
    }

    // Stock check — verify all items are still in stock (inventory is tracked per variant)
    for (const item of cartItems) {
      const stockResult = await DatabaseUtil.executeQuery(
        `SELECT COALESCE(SUM(quantity_available), 0) AS available
         FROM inventory WHERE product_id = ? AND variant_id <=> ?`,
        [item.product_id, item.variant_id]
      );
      if (!stockResult.success) throw new Error(stockResult.error);
      if (stockResult.data.length > 0) {
        const available = Number(stockResult.data[0].available);
        if (available < item.quantity) {
          return res.status(400).json(ResponseFormatter.failure(
            `Insufficient stock for "${item.name}". Available: ${available}, Requested: ${item.quantity}`
          ));
        }
      }
    }

    const subtotal = cartSubtotal(cartItems);

    let discountAmount = 0;
    let appliedCoupon = null; // coupon row (id, usage_limit) for usage accounting inside the order transaction
    let freeShipping = false; // set by a free_shipping coupon; zeroes shipping below
    if (couponCode) {
      const validation = await validateCoupon(couponCode, subtotal);
      if (!validation.valid) {
        return res.status(400).json(ResponseFormatter.failure(validation.message));
      }
      appliedCoupon = validation.coupon;
      ({ discount: discountAmount, freeShipping } = couponDiscount(appliedCoupon, subtotal));
    }

    // Calculate tax from tax_rates table (falls back to default)
    const taxRate = await getTaxRate(shippingAddress?.state, shippingAddress?.country);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = cents(taxableAmount * taxRate);

    // Calculate shipping (use selected method or default standard)
    let shippingAmount = 9.99;
    let shippingMethodName = 'STANDARD';
    if (shippingMethod) {
      const rates = shippingService.DEFAULT_RATES;
      const selected = rates.find(r => r.serviceType === shippingMethod);
      if (selected) {
        shippingAmount = selected.rate;
        shippingMethodName = selected.serviceType;
      }
    }
    // Free shipping over $100
    if (subtotal >= 100) {
      shippingAmount = 0;
    }
    // A free_shipping coupon zeroes the shipping cost regardless of subtotal.
    if (freeShipping) {
      shippingAmount = 0;
    }

    // Discount is already clamped to the subtotal above; the Math.max floor is a
    // hard guarantee that a stored order total can never go negative.
    const totalAmount = cents(Math.max(0, subtotal + taxAmount + shippingAmount - discountAmount));

    // Generate a non-sequential, unguessable order number (see generateOrderNumber).
    const orderNumber = await generateOrderNumber();

    const orderId = uuidv4();

    // Attribute the inventory movement (audit trail). inventory_movements.created_by
    // is NOT NULL with an FK to users(id): use the buyer when logged in, else fall
    // back to a system/admin user so guest orders still log. If neither resolves we
    // skip the movement log (never block the sale on the audit row).
    let movementCreatedBy = userId;
    if (!movementCreatedBy) {
      const sysUser = await db.executeQuery(
        "SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1"
      );
      movementCreatedBy = DatabaseUtil.first(sysUser)?.id ?? null;
    }

    // Order + items + inventory decrement must be one atomic unit so a stock race
    // rolls the whole order back. executeQuery() autocommits per call on its own
    // pooled connection, so we drive a single connection/transaction by hand here.
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Create order
      await connection.execute(
        `INSERT INTO orders (id, order_number, user_id, guest_email, status, subtotal, tax_amount, shipping_amount, discount_amount, total_amount, shipping_address_json, billing_address_json, shipping_method)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, orderNumber, userId, userId ? null : guestEmail, subtotal, taxAmount, shippingAmount, discountAmount, totalAmount, JSON.stringify(shippingAddress), JSON.stringify(billingAddress), shippingMethodName]
      );

      // Record the coupon redemption atomically with the order. The WHERE guard
      // only increments while under usage_limit (a NULL limit always passes, so
      // unlimited coupons still count redemptions for reporting); this single
      // atomic UPDATE stops two concurrent checkouts from both taking the last use.
      if (appliedCoupon) {
        const [couponUpdate] = await connection.execute(
          `UPDATE discount_codes
              SET usage_count = usage_count + 1
            WHERE id = ? AND (usage_limit IS NULL OR usage_count < usage_limit)`,
          [appliedCoupon.id]
        );
        if (couponUpdate.affectedRows === 0) {
          await connection.rollback();
          return res.status(409).json(ResponseFormatter.failure('Coupon usage limit reached'));
        }

        // Per-customer usage cap. The UPDATE above took an exclusive row lock on this
        // discount_codes row, so concurrent checkouts of the SAME coupon serialize
        // here — the COUNT below therefore observes every already-committed redemption,
        // making this check race-safe. Only enforceable for logged-in users (guests
        // have no stable identity); guest redemptions are still logged below.
        const perCustomerLimit = appliedCoupon.usage_limit_per_customer;
        if (userId && perCustomerLimit != null) {
          const [usageRows] = await connection.execute(
            'SELECT COUNT(*) AS cnt FROM discount_code_usage WHERE discount_code_id = ? AND user_id = ?',
            [appliedCoupon.id, userId]
          );
          if (Number(usageRows[0].cnt) >= Number(perCustomerLimit)) {
            await connection.rollback();
            return res.status(409).json(
              ResponseFormatter.failure('You have already used this coupon the maximum number of times')
            );
          }
        }

        // Record the redemption in the usage ledger (the order row was inserted above,
        // so the order_id FK holds). This is what makes per-customer counts work for
        // subsequent orders.
        await connection.execute(
          `INSERT INTO discount_code_usage (id, discount_code_id, order_id, user_id, discount_amount)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), appliedCoupon.id, orderId, userId, discountAmount]
        );
      }

      // Create order items
      for (const item of cartItems) {
        await connection.execute(
          `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, product_sku, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), orderId, item.product_id, item.variant_id ?? null, item.name, item.sku || '', item.quantity, item.price, cents(Number(item.price) * item.quantity)]
        );
      }

      // Decrement stock for each ordered line, guarded against oversell. The
      // `quantity_available >= ?` predicate makes check-and-decrement a single
      // atomic statement: if a concurrent order already claimed the last units,
      // 0 rows change and we roll the entire order back (fail closed). We target
      // the exact inventory row via null-safe equality (variant_id <=> ?), matching
      // the unique (product_id, variant_id) key.
      for (const item of cartItems) {
        const variantId = item.variant_id ?? null;
        const [decrement] = await connection.execute(
          `UPDATE inventory
             SET quantity_available = quantity_available - ?,
                 quantity_sold = quantity_sold + ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE product_id = ? AND variant_id <=> ? AND quantity_available >= ?`,
          [item.quantity, item.quantity, item.product_id, variantId, item.quantity]
        );

        if (decrement.affectedRows === 0) {
          await connection.rollback();
          return res.status(409).json(ResponseFormatter.failure(
            `Insufficient stock for "${item.name}". Another order may have just taken the last units — please review your cart.`
          ));
        }

        // Record a 'sale' movement for the audit trail (best-effort — a failure
        // here must never undo a valid sale, so it is caught and logged).
        if (movementCreatedBy) {
          try {
            const [invRows] = await connection.execute(
              'SELECT id FROM inventory WHERE product_id = ? AND variant_id <=> ?',
              [item.product_id, variantId]
            );
            const inventoryId = invRows[0]?.id;
            if (inventoryId) {
              const [idRows] = await connection.execute("SELECT get_next_id('INVMOV') AS id");
              await connection.execute(
                `INSERT INTO inventory_movements
                   (id, inventory_id, movement_type, quantity_change, reference_type, reference_id, movement_details, created_by)
                 VALUES (?, ?, 'sale', ?, 'order', ?, ?, ?)`,
                [
                  idRows[0].id,
                  inventoryId,
                  -item.quantity,
                  orderId,
                  JSON.stringify({ order_number: orderNumber, product_name: item.name, quantity: item.quantity }),
                  movementCreatedBy,
                ]
              );
            }
          } catch (movementErr) {
            console.error('Non-fatal: inventory movement log failed:', movementErr.message);
          }
        }
      }

      // Clear cart
      await connection.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartKey]);
      await connection.execute('DELETE FROM shopping_carts WHERE id = ?', [cartKey]);

      await connection.commit();
    } catch (txError) {
      try { await connection.rollback(); } catch (rollbackErr) { console.error('Rollback error:', rollbackErr.message); }
      throw txError;
    } finally {
      connection.release();
    }

    // Queue the order confirmation (sent and retried by the email daemon). A
    // queueing failure is logged, never fails the order.
    const customerEmail = req.user ? req.user.email : guestEmail;
    const customerName = shippingAddress.first_name || shippingAddress.firstName || 'Valued Customer';
    const queued = await emailQueueProducer.enqueue(customerEmail, customerName, 'order_confirmation', {
      order_number: orderNumber,
      customer_name: customerName,
      total_amount: totalAmount.toFixed(2),
    });
    if (!queued.queued) console.error('Non-fatal: order confirmation not queued:', queued.reason);

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
       FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
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

    // Ownership: orders that belong to a registered account require that account
    // (or an admin). Guest orders (no user_id) stay viewable via their unguessable
    // id/order_number so guest-checkout confirmation works without an account.
    if (order.user_id) {
      if (!req.user || (req.user.id !== order.user_id && !req.user.isAdmin)) {
        return res.status(403).json(ResponseFormatter.failure('Access denied'));
      }
    }

    // Fetch order items
    const itemsResult = await DatabaseUtil.executeQuery(
      `SELECT oi.*,
              (SELECT pi.thumbnail_small_url FROM product_images pi
                WHERE pi.product_id = oi.product_id AND pi.is_primary = 1
                ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) as image_url
       FROM order_items oi
       WHERE oi.order_id = ?
       ORDER BY oi.created_at ASC, oi.id ASC`,
      [order.id]
    );

    // Fetch status history
    const historyResult = await DatabaseUtil.executeQuery(
      `SELECT osh.status, osh.status_details, osh.created_at,
              u.first_name as changed_by_name
       FROM order_status_history osh
       LEFT JOIN users u ON osh.changed_by = u.id
       WHERE osh.order_id = ? ORDER BY osh.created_at ASC, osh.id ASC`,
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
       ORDER BY created_at ASC, id ASC`,
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

// POST /api/orders/calculate-tax
router.post('/calculate-tax', async (req, res) => {
  try {
    const { stateCode, countryCode, subtotal } = req.body;
    if (subtotal == null || subtotal < 0) {
      return res.status(400).json(ResponseFormatter.failure('subtotal is required'));
    }
    const taxRate = await getTaxRate(stateCode, countryCode);
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    res.json(ResponseFormatter.success('Tax calculated', { taxRate, taxAmount }));
  } catch (error) {
    console.error('Tax calculation error:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to calculate tax'));
  }
});

module.exports = router;