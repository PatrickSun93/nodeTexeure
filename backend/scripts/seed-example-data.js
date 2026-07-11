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
const { buildUnsubscribeToken } = require('../utils/emailSuppression');

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
  console.log('Registering transno prefixes (OITEM, IMG, CARTITEM, INVMOV, JRNL)...');
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('OITEM', 0, 'order item id')");
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('IMG', 0, 'product image id')");
  // CARTITEM/INVMOV are used by cart-add and inventory movements but were missing
  // from the base schema — without them get_next_id() returns NULL and those insert.
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('CARTITEM', 0, 'cart item id')");
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('INVMOV', 0, 'inventory movement id')");
  // JRNL backs the DB-driven storefront Journal (see routes/journalRoutes.js).
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('JRNL', 0, 'Journal article ID counter')");
  // UNSB backs the email suppression / Unsubscribe feature (see routes/unsubscribeRoutes.js).
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('UNSB', 0, 'Email unsubscribe / suppression ID counter')");
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
  const tables = ['orders', 'order_items', 'payments', 'product_reviews', 'wishlists', 'product_images', 'journal_articles'];
  const out = {};
  for (const t of tables) {
    out[t] = Number(await scalar(`SELECT COUNT(*) FROM ${t}`));
  }
  console.log('\n=== Final table counts ===');
  console.table(out);
  return out;
}

// ---------------------------------------------------------------------------
// Demo product translations (generated with Claude Haiku) so the storefront shows
// localized content out of the box. Keyed by English product name, so it applies
// regardless of the generated product id. For real catalogs, `npm run translate:content`
// auto-translates new products via the model.
const PRODUCT_TRANSLATIONS = {
  'RND Ultra-Soft Cotton Bed Sheet Set': {
    zh: { name: 'RND 超柔软棉布床单套装', short: 'RND 超柔软棉布床单套装 - 优质R&D测试款。', desc: 'RND 超柔软棉布床单套装 - 优质R&D测试款。' },
    fr: { name: 'RND Ensemble de Draps en Coton Ultra-Doux', short: 'RND Ensemble de Draps en Coton Ultra-Doux - article R&D de qualité premium pour test.', desc: 'RND Ensemble de Draps en Coton Ultra-Doux - article R&D de qualité premium pour test.' },
    es: { name: 'RND Juego de Sábanas de Algodón Ultra Suave', short: 'RND Juego de Sábanas de Algodón Ultra Suave - artículo R&D de calidad premium para pruebas.', desc: 'RND Juego de Sábanas de Algodón Ultra Suave - artículo R&D de calidad premium para pruebas.' },
  },
  'RND Premium Silk Pillowcases (Pair)': {
    zh: { name: 'RND 高级丝绸枕套（一对）', short: 'RND 高级丝绸枕套（一对）', desc: 'RND 高级丝绸枕套（一对） - 优质R&D测试款。' },
    fr: { name: "RND Taies d'Oreiller en Soie Premium (Paire)", short: "RND Taies d'Oreiller en Soie Premium (Paire)", desc: "RND Taies d'Oreiller en Soie Premium (Paire) - article R&D de qualité premium pour test." },
    es: { name: 'RND Fundas de Almohada de Seda Premium (Par)', short: 'RND Fundas de Almohada de Seda Premium (Par)', desc: 'RND Fundas de Almohada de Seda Premium (Par) - artículo R&D de calidad premium para pruebas.' },
  },
  'RND Cozy Knit Blanket': {
    zh: { name: 'RND 舒适针织毛毯', short: 'RND 舒适针织毛毯', desc: 'RND 舒适针织毛毯 - 优质R&D测试款。' },
    fr: { name: 'RND Couverture Tricotée Douillette', short: 'RND Couverture Tricotée Douillette', desc: 'RND Couverture Tricotée Douillette - article R&D de qualité premium pour test.' },
    es: { name: 'RND Manta de Punto Acogedora', short: 'RND Manta de Punto Acogedora', desc: 'RND Manta de Punto Acogedora - artículo R&D de calidad premium para pruebas.' },
  },
};

async function seedProductTranslations() {
  // Self-sufficient for plain `npm run db:init` (docker init.sql / migration 003 also create this).
  await q(`CREATE TABLE IF NOT EXISTS product_translations (
    product_id VARCHAR(50) NOT NULL, locale VARCHAR(10) NOT NULL,
    name VARCHAR(255), short_description TEXT, description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, locale),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
  const rows = (await q('SELECT id, name FROM products')).data || [];
  let n = 0;
  for (const p of rows) {
    const tr = PRODUCT_TRANSLATIONS[p.name];
    if (!tr) continue;
    for (const loc of Object.keys(tr)) {
      await q(
        `INSERT INTO product_translations (product_id, locale, name, short_description, description)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), short_description=VALUES(short_description), description=VALUES(description)`,
        [p.id, loc, tr[loc].name, tr[loc].short, tr[loc].desc]
      );
      n++;
    }
  }
  console.log(`Seeded ${n} product translation row(s).`);
}

// ---------------------------------------------------------------------------
// Journal (editorial blog) articles. These are the real editorial rows behind the
// storefront Journal (/journal + /journal/[slug]); they replace the four hardcoded
// mock articles the page used to render. Content is HTML (trusted, authored copy) and
// is intentionally NOT localized through the i18n catalogs — content is data. Only the
// surrounding UI chrome (labels, filter names) is translated on the frontend.
//
// `daysAgo` controls published_at ordering; the smallest is the newest/featured story.
// Categories map to the storefront filter taxonomy: Care / Guides / Ritual / Craft.
// ---------------------------------------------------------------------------
const JOURNAL_ARTICLES = [
  {
    slug: 'science-of-sleep',
    title: 'The Science of Sleep: Why Quality Bedding Matters',
    category: 'Guides',
    author: 'Dr. Elise Moreau',
    hero_image: '/images/bedding/bed-1.jpg',
    read_minutes: 5,
    daysAgo: 3,
    excerpt: 'Discover how the right bedding materials can transform your sleep quality and overall well-being.',
    content: `
<p>We spend roughly a third of our lives in bed, yet the surface we sleep on is often the last thing we consider. The truth is that the fibres wrapped around us each night play a quiet but decisive role in how deeply, and how well, we rest.</p>
<h2>Temperature is everything</h2>
<p>The body cools by around one degree as it descends into deep sleep, and bedding that traps heat interrupts that natural fall. Breathable natural fibres such as long-staple cotton, mulberry silk and fine cashmere wick moisture and regulate temperature far more gracefully than synthetics, keeping the microclimate around your skin steady through the night.</p>
<h2>The feel of what touches your skin</h2>
<p>Texture matters more than we tend to admit. A smoother, denser weave reduces friction against the skin and hair, which is why silk is so often recommended for those prone to irritation or morning creasing. The absence of small physical stresses lets the nervous system settle sooner.</p>
<p>Investing in considered bedding is not indulgence for its own sake. It is one of the simplest, most reliable ways to improve the quality of your rest, and with it, the quality of your waking hours.</p>`.trim(),
  },
  {
    slug: 'caring-for-silk-bedding',
    title: 'Caring for Your Silk Bedding: A Complete Guide',
    category: 'Care',
    author: 'The Noiraé Atelier',
    hero_image: '/images/bedding/bed-5.jpg',
    read_minutes: 7,
    daysAgo: 12,
    excerpt: 'Learn the best practices for maintaining the luxury and longevity of your silk bedding — washing, drying and storage, done properly.',
    content: `
<p>Fine silk rewards a little care with years of service. Treated gently, mulberry silk keeps its lustre and its cool, fluid hand for a decade or more. The rules are few, and once they become habit they take almost no time at all.</p>
<h2>Washing</h2>
<p>Machine-wash on a delicate, cold cycle inside a mesh laundry bag, or hand-wash in cool water. Use a pH-neutral detergent formulated for silk or wool — never bleach, and never fabric softener, both of which strip the fibre's natural sheen. Wash silk separately from anything with zips or hooks.</p>
<h2>Drying and pressing</h2>
<p>Air-dry flat or on a line away from direct sunlight, which fades the dye over time. Avoid the tumble dryer. If pressing is needed, use a cool iron on the reverse while the fabric is still slightly damp.</p>
<h2>Storing</h2>
<p>Keep silk in a cool, dry, breathable cotton bag rather than plastic, which traps moisture. Rotating between two sets extends the life of each, giving the fibres time to rest and recover their loft between uses.</p>`.trim(),
  },
  {
    slug: 'the-cashmere-story',
    title: 'The Cashmere Story: From Mongolia to Your Bedroom',
    category: 'Craft',
    author: 'Camille Laurent',
    hero_image: '/images/bedding/bed-9.jpg',
    read_minutes: 6,
    daysAgo: 21,
    excerpt: "Follow the journey of cashmere from the high plateaus of Mongolia to the softest bedding you've ever felt.",
    content: `
<p>Cashmere begins where few materials do: on the wind-scoured plateaus of Inner Mongolia, where temperatures fall well below freezing for months at a time. To survive, the region's goats grow an extraordinarily fine undercoat beneath their outer hair. That downy layer is cashmere.</p>
<h2>Gathered, not shorn</h2>
<p>Each spring, as the goats begin to moult, herders comb the soft down out by hand rather than shearing it. A single animal yields only around 150 grams of usable fibre a year, which is why true cashmere remains rare and precious. The finest, longest fibres are sorted painstakingly by hand.</p>
<h2>From fibre to comfort</h2>
<p>The sorted down is washed, dehaired and spun into a yarn that is remarkably light yet insulating — warmer than sheep's wool at a fraction of the weight. Woven or knitted into throws and blankets, it drapes with a softness that is unmistakable the moment you touch it.</p>
<p>When you draw a cashmere blanket over yourself at night, you are wrapped in the end of a long, patient journey — one measured in seasons, altitude and the care of many hands.</p>`.trim(),
  },
  {
    slug: 'perfect-sleep-sanctuary',
    title: 'Creating Your Perfect Sleep Sanctuary',
    category: 'Ritual',
    author: 'Noiraé Studio',
    hero_image: '/images/bedding/bed-3.jpg',
    read_minutes: 4,
    daysAgo: 30,
    excerpt: 'Transform your bedroom into a haven of calm with our approach to styling, light and layered texture.',
    content: `
<p>A restful bedroom is composed, not crowded. The most serene spaces share a quiet discipline: a restrained palette, natural materials and just enough softness to invite you in.</p>
<h2>Build a palette that breathes</h2>
<p>Begin with a warm neutral ground — champagne, oat, soft charcoal — and let texture rather than colour do the work. Layer a fitted sheet, a flat sheet, a folded throw at the foot of the bed and two grades of pillow for depth. The eye reads the layering as comfort before you have even touched it.</p>
<h2>Mind the light</h2>
<p>Cool overhead light keeps the mind alert; swap it for low, warm lamplight in the evening to signal that the day is ending. A dimmer is the single most transformative change most bedrooms can make.</p>
<p>Finish by editing ruthlessly. Clear surfaces, a single considered object, and bedding you look forward to — that is all a sanctuary really asks.</p>`.trim(),
  },
  {
    slug: 'understanding-silk-momme',
    title: 'Understanding Silk Momme: A Buyer’s Guide',
    category: 'Guides',
    author: 'The Noiraé Atelier',
    hero_image: '/images/bedding/bed-6.jpg',
    read_minutes: 5,
    daysAgo: 39,
    excerpt: 'Momme is the number that tells you how good a silk really is. Here is how to read it before you buy.',
    content: `
<p>If thread count is the language of cotton, momme is the language of silk. Yet far fewer shoppers know how to read it — which means it is one of the most useful things you can learn before investing in silk bedding.</p>
<h2>What momme measures</h2>
<p>Momme (pronounced "mommy") measures the weight and density of silk. Technically it is the weight in pounds of a piece of silk 45 inches wide and 100 yards long. In practice, a higher momme means a denser, more durable and more luxurious fabric.</p>
<h2>The numbers that matter</h2>
<p>Bedding silk typically ranges from 16 to 30 momme. Below 16, the fabric feels thin and wears quickly. The sweet spot for pillowcases and sheeting sits between 22 and 25 momme — substantial enough to drape beautifully and last for years, without the stiffness of the very heaviest weaves.</p>
<p>When a listing quotes only "100% silk" and no momme figure, treat it as a question left unanswered. The best makers state it plainly, because they have nothing to hide.</p>`.trim(),
  },
  {
    slug: 'evening-wind-down-ritual',
    title: 'The Evening Wind-Down Ritual',
    category: 'Ritual',
    author: 'Noiraé Studio',
    hero_image: '/images/bedding/bed-11.jpg',
    read_minutes: 4,
    daysAgo: 48,
    excerpt: 'A slow, repeatable close to the day that tells the body it is safe to let go.',
    content: `
<p>Sleep is not a switch but a descent, and the hour before bed is where that descent either begins or stalls. A simple, repeated ritual gives the nervous system the cues it needs to slow down.</p>
<h2>Dim, warm, quiet</h2>
<p>An hour out, lower the lights and set screens aside. Warm, low light nudges the body toward melatonin; bright blue light holds it back. Let the room grow gradually quieter, the way the outside world does at dusk.</p>
<h2>Prepare the bed with intention</h2>
<p>Turn back the covers, smooth the sheet, plump the pillows. This small act of preparation is more than housekeeping — it is a signal to yourself that rest has been made ready and is waiting for you.</p>
<p>Repeated night after night, the ritual becomes its own invitation. The body learns the sequence, and sleep begins to arrive before your head has even touched the pillow.</p>`.trim(),
  },
  {
    slug: 'washing-storing-cashmere',
    title: 'Washing & Storing Cashmere the Right Way',
    category: 'Care',
    author: 'The Noiraé Atelier',
    hero_image: '/images/bedding/bed-10.jpg',
    read_minutes: 6,
    daysAgo: 57,
    excerpt: 'Cashmere is more resilient than its reputation suggests — provided you treat it with a few simple courtesies.',
    content: `
<p>Cashmere has a reputation for fragility that it does not entirely deserve. Handled well, a good cashmere throw softens and improves with age. The key is to respect the fibre, which is fine, natural and happiest when handled gently.</p>
<h2>Wash by hand, dry flat</h2>
<p>Hand-wash in cool water with a little wool-safe detergent, pressing the suds through the fabric without wringing or rubbing. Rinse well, press the water out gently between towels, then reshape and dry flat, away from heat and direct sun. Hanging while wet stretches the fibres out of shape.</p>
<h2>De-pill, do not despair</h2>
<p>A few small pills are normal on natural fibres and are not a fault. A cashmere comb or a gentle fabric shaver removes them in minutes and leaves the surface smooth again.</p>
<h2>Store folded and protected</h2>
<p>Always fold cashmere rather than hanging it, and store it clean — moths are drawn to body oils, not the wool itself. A breathable garment bag with a cedar block is the safest home through the warmer months.</p>`.trim(),
  },
];

// Idempotent: remove any journal rows we previously seeded (by slug) then re-insert.
async function seedJournal() {
  console.log('Seeding journal_articles...');
  // Self-sufficient for plain `npm run db:init` (docker init.sql / migration 004 also
  // create this table + register the JRNL prefix).
  await q(`CREATE TABLE IF NOT EXISTS journal_articles (
    id VARCHAR(50) PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    excerpt TEXT,
    content LONGTEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Ritual',
    author VARCHAR(150) DEFAULT 'The Noiraé Atelier',
    hero_image VARCHAR(500),
    read_minutes INT UNSIGNED DEFAULT 5,
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    published_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_journal_status (status),
    INDEX idx_journal_category (category),
    INDEX idx_journal_published_at (published_at))`);
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('JRNL', 0, 'Journal article ID counter')");

  const slugs = JOURNAL_ARTICLES.map((a) => a.slug);
  await delIn('journal_articles', 'slug', slugs);

  let count = 0;
  for (const a of JOURNAL_ARTICLES) {
    const id = await getNextId('JRNL');
    await q(
      `INSERT INTO journal_articles
         (id, slug, title, excerpt, content, category, author, hero_image, read_minutes, status, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [id, a.slug, a.title, a.excerpt, a.content, a.category, a.author, a.hero_image, a.read_minutes, a.daysAgo, a.daysAgo]
    );
    count++;
  }
  console.log(`  + inserted ${count} journal articles`);
}

// Example suppression rows. These are deliberately obvious throwaway addresses —
// NOT real customers — so the admin suppression view / Email Queue has something to
// render without opting a genuine account out of email.
const UNSUBSCRIBE_EXAMPLES = [
  { email: 'opted.out.example@noirae.test', scope: 'all', reason: 'Too many emails' },
  { email: 'no.marketing.example@noirae.test', scope: 'marketing', reason: 'No longer relevant' },
];

async function seedUnsubscribes() {
  console.log('Seeding email_unsubscribes...');
  // Self-sufficient for plain `npm run db:init` (docker init.sql / migration 005 also
  // create this table + register the UNSB prefix).
  await q(`CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    scope VARCHAR(32) NOT NULL DEFAULT 'all',
    reason VARCHAR(255) NULL,
    unsubscribed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_email_unsub_email (email),
    INDEX idx_email_unsub_email (email))`);
  await q("INSERT IGNORE INTO transno (prefix, count, details) VALUES ('UNSB', 0, 'Email unsubscribe / suppression ID counter')");

  const emails = UNSUBSCRIBE_EXAMPLES.map((u) => u.email);
  await delIn('email_unsubscribes', 'email', emails);

  let count = 0;
  for (const u of UNSUBSCRIBE_EXAMPLES) {
    const id = await getNextId('UNSB');
    await q(
      `INSERT INTO email_unsubscribes (id, email, token, scope, reason, unsubscribed_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, u.email, buildUnsubscribeToken(u.email), u.scope, u.reason]
    );
    count++;
  }
  console.log(`  + inserted ${count} example unsubscribe rows`);
}

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
  await seedProductTranslations();
  await seedJournal();
  await seedUnsubscribes();
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
