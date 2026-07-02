/**
 * Example / Demo Data Seed Script
 * ================================
 * Populates the storefront + admin with realistic, non-mock data so pages that
 * currently look empty (orders, reviews, wishlist, product imagery) show real
 * rows pulled from MySQL.
 *
 * It seeds, on top of the R&D catalog created by `npm run seed:rnd`:
 *   - product_images  : 2 real bedding photos per product (from public/images/bedding)
 *   - inventory        : quantity_available=100 + a realistic quantity_sold per variant
 *   - orders           : 11 orders across Alice + Bob, mixed statuses, spread over 60 days
 *   - order_items      : 1-3 line items per order (real products/variants + correct money math)
 *   - payments         : one payment per order (Stripe gateway)
 *   - product_reviews  : 6 approved, verified-purchase reviews tied to delivered items
 *   - wishlists        : 3 items for Alice
 *
 * IDEMPOTENT: safe to re-run. It removes the rows it previously created (orders are
 * marked with order_number 'EXAMPLE-####', product images by their /images/bedding/
 * url, wishlist/inventory by natural keys) before re-inserting, so re-running never
 * duplicates data.
 *
 * NOTE on payment status: the payments.status ENUM has no 'succeeded' value; the
 * valid "paid" value is 'completed'. Cancelled orders use 'refunded'. Pending orders
 * use 'pending'.
 *
 * Usage:
 *   From backend/ :  node scripts/seed-example-data.js   (or: npm run seed:example)
 */

const DatabaseUtil = require('../utils/database');

// ---------------------------------------------------------------------------
// Fixed IDs from the R&D seed (see backend/scripts/seed-rnd.js)
// ---------------------------------------------------------------------------
const ADMIN_ID = 'USER0000000001';
const ALICE_ID = 'USER0000000003';
const BOB_ID = 'USER0000000004';
const STRIPE_PM_ID = 'PAY001';

const ORDER_NUMBER_PREFIX = 'EXAMPLE-'; // idempotency marker for orders
const IMAGE_URL_MARKER = '/images/bedding/'; // idempotency marker for product images
const TAX_RATE = 0.08;
const FREE_SHIP_THRESHOLD = 150.0;
const FLAT_SHIP = 9.99;

// One distinct primary bedding photo per product (+ a secondary shot).
const PRODUCT_IMAGES = {
  PROD0000000001: ['/images/bedding/bed-1.jpg', '/images/bedding/bed-2.jpg'],
  PROD0000000002: ['/images/bedding/bed-5.jpg', '/images/bedding/bed-6.jpg'],
  PROD0000000003: ['/images/bedding/bed-9.jpg', '/images/bedding/bed-10.jpg'],
};

// Realistic lifetime units sold per variant (independent of the demo orders below).
const SOLD_BY_VARIANT = {
  'PROD0000000001-VAR-1': 87,
  'PROD0000000001-VAR-2': 54,
  'PROD0000000002-VAR-1': 132,
  'PROD0000000002-VAR-2': 76,
  'PROD0000000003-VAR-1': 61,
  'PROD0000000003-VAR-2': 43,
};

// Customer shipping/billing addresses.
const ADDRESSES = {
  [ALICE_ID]: { name: 'Alice Customer', street: '123 Market Street', city: 'San Francisco', state: 'CA', zip: '94103', country: 'US' },
  [BOB_ID]: { name: 'Bob Customer', street: '500 Elm Street', city: 'Austin', state: 'TX', zip: '73301', country: 'US' },
};

// Demo orders. `daysAgo` is how long ago the order was placed; delivered/shipped
// timestamps are derived from it. items reference real variant ids + quantities.
const ORDER_SPECS = [
  { seq: 1, user: ALICE_ID, daysAgo: 60, status: 'delivered', method: 'FedEx Home Delivery', items: [['PROD0000000001-VAR-1', 1], ['PROD0000000002-VAR-1', 2]] },
  { seq: 2, user: BOB_ID, daysAgo: 55, status: 'delivered', method: 'FedEx Ground', items: [['PROD0000000003-VAR-1', 1]] },
  { seq: 3, user: ALICE_ID, daysAgo: 48, status: 'delivered', method: 'FedEx Ground', items: [['PROD0000000002-VAR-2', 2], ['PROD0000000003-VAR-2', 1]] },
  { seq: 4, user: BOB_ID, daysAgo: 40, status: 'delivered', method: 'FedEx 2Day', items: [['PROD0000000001-VAR-2', 1], ['PROD0000000002-VAR-1', 1], ['PROD0000000003-VAR-1', 1]] },
  { seq: 5, user: ALICE_ID, daysAgo: 32, status: 'shipped', method: 'FedEx Home Delivery', items: [['PROD0000000001-VAR-1', 1]] },
  { seq: 6, user: BOB_ID, daysAgo: 25, status: 'shipped', method: 'FedEx Ground', items: [['PROD0000000002-VAR-1', 2], ['PROD0000000003-VAR-1', 2]] },
  { seq: 7, user: ALICE_ID, daysAgo: 20, status: 'cancelled', method: 'FedEx Ground', items: [['PROD0000000003-VAR-2', 1]] },
  { seq: 8, user: BOB_ID, daysAgo: 15, status: 'delivered', method: 'FedEx Ground', items: [['PROD0000000002-VAR-1', 1], ['PROD0000000002-VAR-2', 1]] },
  { seq: 9, user: ALICE_ID, daysAgo: 12, status: 'processing', method: 'FedEx 2Day', items: [['PROD0000000001-VAR-2', 1], ['PROD0000000003-VAR-1', 1]] },
  { seq: 10, user: BOB_ID, daysAgo: 8, status: 'processing', method: 'FedEx Ground', items: [['PROD0000000002-VAR-2', 3]] },
  { seq: 11, user: BOB_ID, daysAgo: 4, status: 'pending', method: 'FedEx Ground', items: [['PROD0000000001-VAR-1', 1], ['PROD0000000002-VAR-1', 1]] },
];

// Review copy per product. Index 0 is used by Alice, index 1 by Bob, so the same
// product reviewed by both customers reads differently.
const REVIEW_POOL = {
  PROD0000000001: [
    { rating: 5, title: 'Incredibly soft and breathable', comment: 'These cotton sheets get softer with every wash and I sleep so much cooler now. Worth every penny.' },
    { rating: 5, title: 'Hotel-quality at home', comment: 'The deep pockets fit my thick mattress perfectly and the fabric feels genuinely luxurious. Very happy.' },
  ],
  PROD0000000002: [
    { rating: 5, title: 'My skin and hair love these', comment: 'Fewer sleep creases and way less frizz in the morning. The champagne colour is beautiful in person.' },
    { rating: 3, title: 'Lovely silk, small flaw', comment: 'Cool and smooth to sleep on, but one pillowcase had a loose thread out of the package. Still good overall.' },
  ],
  PROD0000000003: [
    { rating: 4, title: 'Cozy without being heavy', comment: 'Perfect weight for the couch and the knit looks really premium. Holds up well to washing.' },
    { rating: 5, title: 'Warm and beautifully made', comment: 'Soft, warm, and the cream shade matches everything in the room. My favourite blanket now.' },
  ],
};

// Alice's wishlist (product + specific variant).
const WISHLIST_SPECS = [
  { product: 'PROD0000000001', variant: 'PROD0000000001-VAR-2' }, // King Gray sheets
  { product: 'PROD0000000003', variant: 'PROD0000000003-VAR-1' }, // Navy throw blanket
  { product: 'PROD0000000002', variant: 'PROD0000000002-VAR-1' }, // Champagne silk pillowcases
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function q(sql, params = []) {
  const res = await DatabaseUtil.executeQuery(sql, params);
  if (!res.success) {
    throw new Error(`SQL error: ${res.error} (code=${res.code})\n  SQL: ${sql}`);
  }
  return res;
}

async function getNextId(prefix) {
  const res = await q('SELECT get_next_id(?) AS id', [prefix]);
  const id = res.data && res.data[0] && res.data[0].id;
  if (!id) throw new Error(`get_next_id('${prefix}') returned NULL — is the prefix registered in transno?`);
  return id;
}

async function scalar(sql, params = []) {
  const res = await q(sql, params);
  const row = res.data && res.data[0];
  return row ? Object.values(row)[0] : null;
}

async function delIn(table, col, ids, tail = '') {
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  await q(`DELETE FROM ${table} WHERE ${col} IN (${ph}) ${tail}`.trim(), ids);
}

// ---------------------------------------------------------------------------
// Step 1: register OITEM + IMG transno prefixes if missing
// ---------------------------------------------------------------------------
async function registerPrefixes() {
  console.log('Registering transno prefixes (OITEM, IMG, CARTITEM, INVMOV)...');
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('OITEM', 0, 'order item id')");
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('IMG', 0, 'product image id')");
  // CARTITEM/INVMOV are used by cart-add and inventory movements but were missing
  // from the base schema — without them get_next_id() returns NULL and those insert.
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('CARTITEM', 0, 'cart item id')");
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('INVMOV', 0, 'inventory movement id')");
}

// ---------------------------------------------------------------------------
// Load the real catalog (product + variant + computed unit price)
// ---------------------------------------------------------------------------
async function loadCatalog() {
  const res = await q(
    `SELECT p.id AS product_id, p.name AS product_name, p.base_price,
            v.id AS variant_id, v.sku AS variant_sku, v.size, v.color, v.pattern, v.price_adjustment
       FROM products p
       JOIN product_variants v ON v.product_id = p.id`
  );
  const byVariant = {};
  for (const r of res.data) {
    byVariant[r.variant_id] = {
      productId: r.product_id,
      productName: r.product_name,
      variantSku: r.variant_sku,
      unitPrice: money(parseFloat(r.base_price) + parseFloat(r.price_adjustment || 0)),
      details: { size: r.size, color: r.color, ...(r.pattern ? { pattern: r.pattern } : {}) },
    };
  }
  return byVariant;
}

// ---------------------------------------------------------------------------
// Idempotency cleanup: remove rows previously created by THIS script
// ---------------------------------------------------------------------------
async function cleanup() {
  console.log('Cleaning up any previously-seeded example rows...');

  // Orders (+ their children) identified by the EXAMPLE- order_number marker.
  const orderRows = (await q(
    'SELECT id FROM orders WHERE order_number LIKE ?', [`${ORDER_NUMBER_PREFIX}%`]
  )).data;
  const orderIds = orderRows.map((r) => r.id);

  if (orderIds.length) {
    const itemRows = (await q(
      `SELECT id FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')})`, orderIds
    )).data;
    const itemIds = itemRows.map((r) => r.id);

    // reviews reference order_item_id -> delete first
    await delIn('product_reviews', 'order_item_id', itemIds);
    await delIn('payments', 'order_id', orderIds);
    await delIn('order_items', 'order_id', orderIds);
    await delIn('orders', 'id', orderIds);
    console.log(`  - removed ${orderIds.length} example orders (+ items/payments/reviews)`);
  }

  // Product images we own (marked by the local bedding path).
  const imgRes = await q('DELETE FROM product_images WHERE original_url LIKE ?', [`${IMAGE_URL_MARKER}%`]);
  if (imgRes.affectedRows) console.log(`  - removed ${imgRes.affectedRows} example product images`);

  // Alice's wishlist entries for the products we seed.
  const wlProducts = [...new Set(WISHLIST_SPECS.map((w) => w.product))];
  await delIn('wishlists', 'product_id', wlProducts, `AND user_id = '${ALICE_ID}'`);
}

// ---------------------------------------------------------------------------
// Step 2: product images
// ---------------------------------------------------------------------------
async function seedImages() {
  console.log('Seeding product_images...');
  let count = 0;
  for (const [productId, urls] of Object.entries(PRODUCT_IMAGES)) {
    const name = await scalar('SELECT name FROM products WHERE id = ?', [productId]);
    for (let i = 0; i < urls.length; i++) {
      const id = await getNextId('IMG');
      await q(
        `INSERT INTO product_images
           (id, product_id, variant_id, original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url, alt_text, sort_order, is_primary)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [id, productId, urls[i], urls[i], urls[i], urls[i], name, i, i === 0 ? 1 : 0]
      );
      count++;
    }
  }
  console.log(`  + inserted ${count} images`);
}

// ---------------------------------------------------------------------------
// Step 3: inventory
// ---------------------------------------------------------------------------
async function seedInventory() {
  console.log('Updating inventory (quantity_available=100 + realistic quantity_sold)...');
  for (const [variantId, sold] of Object.entries(SOLD_BY_VARIANT)) {
    await q(
      `UPDATE inventory
          SET quantity_available = 100,
              quantity_sold = ?,
              last_restocked_at = DATE_SUB(NOW(), INTERVAL 7 DAY)
        WHERE variant_id = ?`,
      [sold, variantId]
    );
  }
}

// ---------------------------------------------------------------------------
// Step 4: orders + order_items + payments
// ---------------------------------------------------------------------------
function paymentStatusFor(orderStatus) {
  if (orderStatus === 'pending') return 'pending';
  if (orderStatus === 'cancelled') return 'refunded';
  return 'completed';
}

async function seedOrders(catalog) {
  console.log('Seeding orders, order_items, payments...');
  const deliveredItems = []; // for reviews

  for (const spec of ORDER_SPECS) {
    const orderId = await getNextId('ORDER');
    const orderNumber = `${ORDER_NUMBER_PREFIX}${String(spec.seq).padStart(4, '0')}`;
    const addr = ADDRESSES[spec.user];

    // Money math from real catalog prices.
    const lines = spec.items.map(([variantId, qty]) => {
      const c = catalog[variantId];
      if (!c) throw new Error(`Unknown variant in order spec: ${variantId}`);
      return { variantId, qty, ...c, lineTotal: money(c.unitPrice * qty) };
    });
    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    const tax = money(subtotal * TAX_RATE);
    const shipping = subtotal >= FREE_SHIP_THRESHOLD ? 0.0 : FLAT_SHIP;
    const discount = 0.0;
    const total = money(subtotal + tax + shipping - discount);

    const isShipped = spec.status === 'shipped' || spec.status === 'delivered';
    const isDelivered = spec.status === 'delivered';
    const shippedDaysAgo = isShipped ? spec.daysAgo - 2 : null;
    const deliveredDaysAgo = isDelivered ? spec.daysAgo - 5 : null;
    const tracking = isShipped ? `7${String(spec.seq).padStart(11, '0')}` : null;

    // Build INSERT with real relative timestamps computed in SQL.
    const cols = ['id', 'order_number', 'user_id', 'status', 'currency', 'subtotal', 'tax_amount',
      'shipping_amount', 'discount_amount', 'total_amount', 'shipping_address_json',
      'billing_address_json', 'shipping_method', 'tracking_number'];
    const vals = ['?', '?', '?', '?', "'USD'", '?', '?', '?', '?', '?', '?', '?', '?', '?'];
    const params = [orderId, orderNumber, spec.user, spec.status, subtotal, tax, shipping, discount,
      total, JSON.stringify(addr), JSON.stringify(addr), spec.method, tracking];

    cols.push('shipped_at');
    if (shippedDaysAgo != null) { vals.push('DATE_SUB(NOW(), INTERVAL ? DAY)'); params.push(shippedDaysAgo); } else { vals.push('NULL'); }
    cols.push('delivered_at');
    if (deliveredDaysAgo != null) { vals.push('DATE_SUB(NOW(), INTERVAL ? DAY)'); params.push(deliveredDaysAgo); } else { vals.push('NULL'); }
    cols.push('created_at');
    vals.push('DATE_SUB(NOW(), INTERVAL ? DAY)'); params.push(spec.daysAgo);

    await q(`INSERT INTO orders (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params);

    // Order items
    for (const l of lines) {
      const itemId = await getNextId('OITEM');
      await q(
        `INSERT INTO order_items
           (id, order_id, product_id, variant_id, product_name, product_sku, variant_details, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [itemId, orderId, l.productId, l.variantId, l.productName, l.variantSku,
          JSON.stringify(l.details), l.qty, l.unitPrice, l.lineTotal]
      );
      if (isDelivered) {
        deliveredItems.push({ orderItemId: itemId, userId: spec.user, productId: l.productId, deliveredDaysAgo });
      }
    }

    // Payment
    const payId = await getNextId('PAY');
    const payStatus = paymentStatusFor(spec.status);
    const processedExpr = spec.status === 'pending' ? 'NULL' : 'DATE_SUB(NOW(), INTERVAL ? DAY)';
    const payParams = [payId, orderId, STRIPE_PM_ID, `ch_ex_${orderNumber}`, total, payStatus];
    if (spec.status !== 'pending') payParams.push(spec.daysAgo);
    payParams.push(spec.daysAgo); // created_at
    await q(
      `INSERT INTO payments
         (id, order_id, payment_method_id, payment_gateway, gateway_transaction_id, amount, currency, status, processed_at, created_at)
       VALUES (?, ?, ?, 'stripe', ?, ?, 'USD', ?, ${processedExpr}, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      payParams
    );

    console.log(`  + ${orderNumber} [${spec.status}] ${lines.length} item(s) total $${total.toFixed(2)}`);
  }

  return deliveredItems;
}

// ---------------------------------------------------------------------------
// Step 5: reviews (approved, verified purchase, tied to delivered items)
// ---------------------------------------------------------------------------
async function seedReviews(deliveredItems) {
  console.log('Seeding product_reviews...');
  const seen = new Set(); // one review per (user, product)
  let count = 0;
  for (const it of deliveredItems) {
    const key = `${it.userId}:${it.productId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pool = REVIEW_POOL[it.productId];
    if (!pool) continue;
    const idx = it.userId === ALICE_ID ? 0 : 1;
    const r = pool[idx];

    const reviewId = await getNextId('REV');
    const createdDaysAgo = Math.max(0, it.deliveredDaysAgo - 2);
    const approvedDaysAgo = Math.max(0, it.deliveredDaysAgo - 3);
    await q(
      `INSERT INTO product_reviews
         (id, product_id, user_id, order_item_id, rating, review_details, is_verified_purchase, is_approved, approved_by, approved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [reviewId, it.productId, it.userId, it.orderItemId, r.rating,
        JSON.stringify({ title: r.title, comment: r.comment }), ADMIN_ID, approvedDaysAgo, createdDaysAgo]
    );
    count++;
    console.log(`  + review ${reviewId} ${it.userId} -> ${it.productId} (${r.rating}★)`);
  }
  console.log(`  + inserted ${count} reviews`);
}

// ---------------------------------------------------------------------------
// Step 6: wishlist (Alice)
// ---------------------------------------------------------------------------
async function seedWishlist() {
  console.log('Seeding wishlists (Alice)...');
  let count = 0;
  for (const w of WISHLIST_SPECS) {
    const id = await getNextId('WISH');
    await q(
      `INSERT INTO wishlists (id, user_id, product_id, variant_id) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE variant_id = VALUES(variant_id)`,
      [id, ALICE_ID, w.product, w.variant]
    );
    count++;
  }
  console.log(`  + inserted ${count} wishlist items`);
}

// ---------------------------------------------------------------------------
// Final: print counts
// ---------------------------------------------------------------------------
async function printCounts() {
  const tables = ['orders', 'order_items', 'payments', 'product_reviews', 'wishlists', 'product_images'];
  const out = {};
  for (const t of tables) {
    out[t] = Number(await scalar(`SELECT COUNT(*) FROM ${t}`));
  }
  console.log('\n=== Final table counts ===');
  console.table(out);
  return out;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Example Data Seeding ===');
  await registerPrefixes();
  await cleanup();
  const catalog = await loadCatalog();
  await seedImages();
  await seedInventory();
  const deliveredItems = await seedOrders(catalog);
  await seedReviews(deliveredItems);
  await seedWishlist();
  const counts = await printCounts();
  console.log('=== Example Data Seeding Completed ===');
  return counts;
}

main()
  .then(async () => {
    await DatabaseUtil.closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seeding error:', err);
    try { await DatabaseUtil.closePool(); } catch (_) { /* noop */ }
    process.exit(1);
  });
