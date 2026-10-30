// Node ↔ Rust parity for route groups ported to rust/crates/api: the same request
// must get the same status and JSON body from both. Runs when RUST_API_URL points
// at a running Rust API (CI's Rust job sets it); otherwise these are skipped.
//
//   RUST_API_URL=http://127.0.0.1:7000 DB_HOST=127.0.0.1 DB_PORT=3307 \
//     DB_PASSWORD=noirae_dev npx jest tests/parity.test.js
const { app, request } = require('./helpers');

const RUST = process.env.RUST_API_URL;
const describeIfRust = RUST ? describe : describe.skip;

// Node caches product responses for minutes; parity needs fresh reads.
const fresh = (url) => url + (url.includes('?') ? '&' : '?') + 'nocache=true';

async function compare(url, headers = {}) {
  const node = await request(app).get(fresh(url)).set(headers);
  const rust = await fetch(RUST + url, { headers });
  const rustBody = await rust.json();
  expect({ url, status: rust.status, body: rustBody }).toEqual({ url, status: node.status, body: node.body });
}

describeIfRust('products: Node and Rust answer identically', () => {
  const urls = [
    '/api/products',
    '/api/products?limit=2&page=2',
    '/api/products?limit=0',
    '/api/products?limit=1000&page=abc',
    '/api/products?limit=-3',
    '/api/products?category=CAT001',
    '/api/products?min_price=50',
    '/api/products?max_price=60&min_price=10',
    '/api/products?materials=100%25%20Cotton',
    '/api/products?materials=100%25%20cotton,%20silk',
    '/api/products?materials[]=100%25%20Cotton',
    '/api/products?material=Silk',
    // Material terms match when the material contains them, ignoring case.
    '/api/products?material=silk',
    '/api/products?material=SILK',
    '/api/products?material=Blend',
    '/api/products?materials=mulberry%20SILK,%20blend',
    '/api/products?materials=Cashmere',
    // An array item is not split, so its comma is part of the term.
    '/api/products?materials[]=Silk,%20Cotton',
    '/api/products?materials[]=Silk,Cotton&materials[]=blend',
    '/api/products?materials=silk&materials=cotton',
    '/api/products?materials[]=',
    // LIKE wildcards and the escape character in a term are literal.
    '/api/products?materials=100%25',
    '/api/products?materials=%25',
    '/api/products?materials=_',
    '/api/products?materials=1_0',
    '/api/products?materials=%5C',
    '/api/products?materials=%5C%25',
    '/api/products?search=Silk',
    '/api/products?search=blanket&locale=zh',
    "/api/products?search=%27%20OR%201%3D1%20--",
    '/api/products?search=%25',
    '/api/products?locale=fr',
    '/api/products?locale=xx',
    '/api/products/PROD0000000001',
    '/api/products/PROD0000000001?locale=es',
    '/api/products/rnd-premium-silk-pillowcases',
    '/api/products/PROD9999999999',
    '/api/products/by-ids?ids=PROD0000000002,PROD0000000001',
    '/api/products/by-ids?ids=PROD0000000001,PROD0000000001,nope',
    '/api/products/by-ids?ids=1,2',
    '/api/products/by-ids',
  ];

  test.each(urls)('%s', (url) => compare(url));

  test('locale from the NEXT_LOCALE cookie', () =>
    compare('/api/products?limit=3', { Cookie: 'theme=dark; NEXT_LOCALE=zh' }));

  // Identical is not enough: both must match what the shop's filter asks for.
  test.each([
    ['material=Silk', ['Mulberry Silk']],
    ['material=blend', ['Polyester Blend']],
    ['materials=SILK,blend', ['Mulberry Silk', 'Polyester Blend']],
    ['materials[]=Silk,%20Cotton', []],
    ['materials=100%25', ['100% Cotton']],
    ['materials=1_0', []],
  ])('material filter %s', async (query, expected) => {
    const url = `/api/products?limit=100&${query}`;
    const node = await request(app).get(fresh(url));
    const rust = await (await fetch(RUST + url)).json();
    for (const body of [node.body, rust]) {
      const found = body.keyValueTable.products.map((p) => p.product_details.material).sort();
      expect({ query, found }).toEqual({ query, found: expected });
      expect(body.keyValueTable.total).toBe(expected.length);
    }
  });
});

describeIfRust('search: Node and Rust answer identically', () => {
  test.each([
    '/api/search/autocomplete?q=silk',
    '/api/search/autocomplete?q=SILK',
    '/api/search/autocomplete?q=%20%20rnd%20',
    '/api/search/autocomplete?q=cotton',
    '/api/search/autocomplete?q=bed',
    '/api/search/autocomplete?q=s',
    '/api/search/autocomplete?q=',
    '/api/search/autocomplete',
    '/api/search/autocomplete?q=%27%20OR%201%3D1%20--',
    '/api/search/autocomplete?q=%25%25',
    '/api/search/autocomplete?q=%E4%B8%9D%E7%BB%B8',
    '/api/search/suggestions',
    '/api/search/recent?ids=PROD0000000002,PROD0000000001',
    '/api/search/recent?ids=PROD0000000001,PROD0000000001,bad,1',
    '/api/search/recent?ids=',
    '/api/search/recent',
  ])('%s', (url) => compare(url));
});

describeIfRust('journal + public settings: Node and Rust answer identically', () => {
  test.each([
    '/api/journal',
    '/api/journal?limit=2',
    '/api/journal?limit=0',
    '/api/journal?limit=abc',
    '/api/journal?limit=500',
    '/api/journal?category=Care',
    '/api/journal?category=All',
    '/api/journal?category=nope',
    '/api/settings/public',
  ])('%s', (url) => compare(url));

  test('article by id and by slug, and unknown', async () => {
    const list = await request(app).get('/api/journal?limit=1');
    const { id, slug } = list.body.keyValueTable.articles[0];
    await compare(`/api/journal/${id}`);
    await compare(`/api/journal/${slug}`);
    await compare('/api/journal/no-such-article');
  });
});

// ---------------------------------------------------------------------------
// Authenticated routes. Read-only checks reuse one user on both sides (same DB
// rows → same JSON); write sequences run on two fresh users, one per service,
// and compare each step after normalizing generated ids and timestamps.
// ---------------------------------------------------------------------------
const jwt = require('jsonwebtoken');
const { login, registerCustomer, DatabaseUtil } = require('./helpers');

async function compareWith(method, url, { headers = {}, body } = {}) {
  let nodeReq = request(app)[method](url).set(headers);
  if (body !== undefined) nodeReq = nodeReq.send(body);
  const node = await nodeReq;
  const rust = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { ...headers, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  expect({ url, status: rust.status, body: await rust.json() }).toEqual({ url, status: node.status, body: node.body });
}

const normalize = (v) => JSON.parse(JSON.stringify(v)
  .replace(/WISH\d{10}/g, 'WISH*')
  .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'));

async function step(method, url, nodeToken, rustToken, body) {
  let nodeReq = request(app)[method](url).set('Authorization', `Bearer ${nodeToken}`);
  if (body !== undefined) nodeReq = nodeReq.send(body);
  const node = await nodeReq;
  const rust = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { Authorization: `Bearer ${rustToken}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const label = `${method.toUpperCase()} ${url} ${JSON.stringify(body ?? '')}`;
  expect({ label, status: rust.status, body: normalize(await rust.json()) })
    .toEqual({ label, status: node.status, body: normalize(node.body) });
}

describeIfRust('auth: Node and Rust reject the same tokens the same way', () => {
  const secret = process.env.JWT_SECRET;
  const sign = (payload, opts = {}) => jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h', ...opts });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

  test('missing, malformed and forged tokens', async () => {
    const bearer = (t) => ({ headers: { Authorization: `Bearer ${t}` } });
    await compareWith('get', '/api/wishlist');
    await compareWith('get', '/api/wishlist', bearer('garbage'));
    await compareWith('get', '/api/wishlist', { headers: { Authorization: 'Bearer ' } });
    await compareWith('get', '/api/wishlist', { headers: { Authorization: 'Token abc' } });
    await compareWith('get', '/api/wishlist', bearer(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 'USER0000000003' })}.`));
    await compareWith('get', '/api/wishlist', bearer(jwt.sign({ id: 'USER0000000003' }, 'another-secret-another-secret-123')));
    await compareWith('get', '/api/wishlist', bearer(sign({ id: 'USER0000000003' }, { expiresIn: -5 })));
    await compareWith('get', '/api/wishlist', bearer(sign({ id: 'USER9999999999' })));
    await compareWith('get', '/api/wishlist', bearer(sign({ email: 'no-id@example.com' })));
  });

  test('valid token via header and via admin_auth cookie', async () => {
    const { accessToken } = await login('customer');
    await compareWith('get', '/api/wishlist', { headers: { Authorization: `Bearer ${accessToken}` } });
    await compareWith('get', '/api/wishlist', { headers: { Cookie: `x=1; admin_auth=${accessToken}` } });
    // An empty Bearer header takes precedence over a valid cookie (Node behaviour).
    await compareWith('get', '/api/wishlist', { headers: { Authorization: 'Bearer ', Cookie: `admin_auth=${accessToken}` } });
  });

  test('revoked and deactivated sessions', async () => {
    const user = await registerCustomer();
    const auth = { headers: { Authorization: `Bearer ${user.accessToken}` } };
    await compareWith('get', '/api/wishlist', auth);
    await DatabaseUtil.executeQuery('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [user.userId]);
    await compareWith('get', '/api/wishlist', auth);
    const other = await registerCustomer();
    await DatabaseUtil.executeQuery("UPDATE users SET status = 'suspended' WHERE id = ?", [other.userId]);
    await compareWith('get', '/api/wishlist', { headers: { Authorization: `Bearer ${other.accessToken}` } });
  });
});

describeIfRust('wishlist: same sequence, same answers', () => {
  test('add / duplicate / validate / list / check / remove', async () => {
    const a = (await registerCustomer()).accessToken; // Node
    const b = (await registerCustomer()).accessToken; // Rust
    const s = (method, url, body) => step(method, url, a, b, body);

    await s('get', '/api/wishlist');
    await s('post', '/api/wishlist', {});
    await s('post', '/api/wishlist', { product_id: '' });
    await s('post', '/api/wishlist', { product_id: 'PROD9999999999' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000001' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000001' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000002', variant_id: 'PROD0000000001-VAR-1' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000002', variant_id: 'PROD0000000002-VAR-2' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000002', variant_id: 'PROD0000000002-VAR-2' });
    await s('get', '/api/wishlist');
    await s('get', '/api/wishlist/check/PROD0000000001');
    await s('get', '/api/wishlist/check/PROD0000000003');
    await s('delete', '/api/wishlist/PROD0000000001');
    await s('delete', '/api/wishlist/PROD0000000001');
    await s('get', '/api/wishlist');
  });
});

describeIfRust('orders (read routes): Node and Rust answer identically', () => {
  const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
  let customer; let admin; let staff; let stranger; let order;

  beforeAll(async () => {
    customer = (await login('customer')).accessToken;
    admin = (await login('admin')).accessToken;
    staff = (await login('staff')).accessToken;
    stranger = (await registerCustomer()).accessToken;
    const mine = await request(app).get('/api/orders/my-orders').set('Authorization', `Bearer ${customer}`);
    [order] = mine.body.keyValueTable.orders;
  });

  test('my orders', async () => {
    expect(order).toBeDefined();
    await compareWith('get', '/api/orders/my-orders', auth(customer));
    await compareWith('get', '/api/orders/my-orders', auth(stranger));
    await compareWith('get', '/api/orders/my-orders');
    await compareWith('get', '/api/orders/my-orders', auth('garbage'));
  });

  test('order detail: owner, admin, others, unknown', async () => {
    for (const key of [order.id, order.order_number]) {
      const url = `/api/orders/${encodeURIComponent(key)}`;
      await compareWith('get', url, auth(customer));
      await compareWith('get', url, auth(admin));
      await compareWith('get', url, auth(staff));
      await compareWith('get', url, auth(stranger));
      await compareWith('get', url, auth('garbage'));
      await compareWith('get', url);
    }
    await compareWith('get', '/api/orders/no-such-order', auth(customer));
    await compareWith('get', "/api/orders/x'%20OR%20'1'%3D'1", auth(customer));
  });

  test('guest order is viewable by id/number without an account', async () => {
    const id = `parity-guest-${Date.now()}`;
    const number = `NOR-PARITY-${Date.now()}`;
    const address = JSON.stringify({ first_name: 'Guest', city: 'New York', country: 'US' });
    await DatabaseUtil.executeQuery(
      `INSERT INTO orders (id, order_number, guest_email, status, subtotal, tax_amount, shipping_amount,
         total_amount, shipping_address_json, billing_address_json, shipping_method)
       VALUES (?, ?, 'guest@example.com', 'confirmed', 120.50, 10.69, 0, 131.19, ?, ?, 'standard')`,
      [id, number, address, address]
    );
    try {
      await DatabaseUtil.executeQuery(
        `INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, variant_details, quantity, unit_price, total_price)
         VALUES (?, ?, 'PROD0000000001', 'Snapshot name', 'SKU-1', ?, 2, 60.25, 120.50)`,
        [`${id}-item`, id, JSON.stringify({ size: 'Queen', note: 1.5 })]
      );
      await DatabaseUtil.executeQuery(
        `INSERT INTO order_status_history (id, order_id, status, status_details) VALUES (?, ?, 'confirmed', ?)`,
        [`${id}-h1`, id, JSON.stringify({ reason: 'paid' })]
      );
      await compareWith('get', `/api/orders/${id}`);
      await compareWith('get', `/api/orders/${number}`, auth(stranger));
      await compareWith('get', `/api/orders/track/${number}`);
    } finally {
      await DatabaseUtil.executeQuery('DELETE FROM order_status_history WHERE order_id = ?', [id]);
      await DatabaseUtil.executeQuery('DELETE FROM order_items WHERE order_id = ?', [id]);
      await DatabaseUtil.executeQuery('DELETE FROM orders WHERE id = ?', [id]);
    }
  });

  test('public tracking', async () => {
    await compareWith('get', `/api/orders/track/${encodeURIComponent(order.order_number)}`);
    await compareWith('get', '/api/orders/track/NOR-NOPE-NOPE');
  });
});

// Two-sided runner for write sequences: each side keeps its own auth (Bearer
// or guest cookie) and its own data; responses are compared after normalizing
// generated ids and timestamps.
const { inStockVariant } = require('./helpers');
const norm = (v) => JSON.parse(JSON.stringify(v)
  .replace(/CARTITEM\d{10}/g, 'CARTITEM*')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, 'UUID')
  .replace(/NOR-[0-9A-Z]{5}-[0-9A-Z]{5}/g, 'NOR-*')
  .replace(/CART\d{10}/g, 'CART*')
  .replace(/USER\d{10}/g, 'USER*')
  .replace(/test\.\d+\.[a-z0-9]+@example\.com/g, 'EMAIL')
  .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'));

// One side of the comparison: Node via supertest, Rust via fetch. `auth` is a
// header object (Bearer or guest cookie) kept per side.
async function call(side, method, url, auth, body) {
  if (side === 'node') {
    let req = request(app)[method](url).set(auth);
    if (body !== undefined) req = req.send(body);
    const res = await req;
    return { status: res.status, body: res.body, cookie: res.headers['set-cookie']?.[0] };
  }
  const res = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { ...auth, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') ?? undefined };
}

// Run the same step on both sides; `url` and `body` may be functions of the
// side's own state (its cart items, cart id, last order).
async function both(sides, method, url, body) {
  const out = {};
  const pick = (v, s) => (typeof v === 'function' ? v(s) : v);
  for (const [side, s] of Object.entries(sides)) {
    out[side] = await call(side, method, pick(url, s), s.auth, pick(body, s));
    const kvt = out[side].body?.keyValueTable;
    if (kvt?.items) s.items = kvt.items;
    if (kvt?.cartId) s.cartId = kvt.cartId;
    if (kvt?.orderId) s.orderId = kvt.orderId;
  }
  const label = `${method.toUpperCase()} ${pick(url, sides.node)} ${JSON.stringify(pick(body, sides.node) ?? '')}`;
  const view = (r) => ({ label, status: r.status, body: norm(r.body) });
  expect(view(out.rust)).toEqual(view(out.node));
  return out;
}

describeIfRust('cart: same sequence, same answers', () => {
  const item0 = (s) => `/api/cart/update/${s.items[0]?.id ?? 'none'}`;
  const remove0 = (s) => `/api/cart/remove/${s.items[0]?.id ?? 'none'}`;

  async function sequence(sides) {
    const v = await inStockVariant(3);
    const other = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT id FROM product_variants WHERE product_id <> ? LIMIT 1', [v.product_id]));
    const add = (body) => both(sides, 'post', '/api/cart/add', body);

    await both(sides, 'get', '/api/cart');
    await add({});
    await add({ product_id: 5 });
    await add({ product_id: 'PROD9999999999' });
    await add({ product_id: v.product_id, variant_id: other.id });
    await add({ product_id: v.product_id, variant_id: 7 });
    await add({ product_id: v.product_id }); // no variant-less stock row
    for (const quantity of [0, -1, 1000, 'abc', '2 pcs', 1.9, [1], true]) {
      await add({ product_id: v.product_id, variant_id: v.variant_id, quantity });
    }
    await add({ product_id: v.product_id, variant_id: v.variant_id, quantity: v.quantity_available + 1 });
    await add({ product_id: v.product_id, variant_id: v.variant_id });
    await add({ product_id: v.product_id, variant_id: v.variant_id, quantity: v.quantity_available });
    const view = await both(sides, 'get', '/api/cart');
    // Each line carries its product's primary image (the seeded products all have one).
    for (const side of ['node', 'rust']) {
      const items = view[side].body.keyValueTable.items;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item.image).toEqual(expect.stringMatching(/\S/));
    }
    for (const quantity of [undefined, 0, 1000, v.quantity_available + 1, 2, 2]) {
      await both(sides, 'put', item0, quantity === undefined ? {} : { quantity });
    }
    await both(sides, 'put', '/api/cart/update/CARTITEM9999999999', { quantity: 1 });
    await both(sides, 'get', '/api/cart');
    await both(sides, 'delete', remove0);
    await both(sides, 'delete', '/api/cart/remove/CARTITEM9999999999');
    await both(sides, 'get', '/api/cart');
  }

  test('signed-in customer', async () => {
    const a = (await registerCustomer()).accessToken;
    const b = (await registerCustomer()).accessToken;
    await sequence({
      node: { auth: { Authorization: `Bearer ${a}` } },
      rust: { auth: { Authorization: `Bearer ${b}` } },
    });
  });

  test('guest: issues the same sessionId cookie, then keeps the cart on it', async () => {
    const first = await both({ node: { auth: {} }, rust: { auth: {} } }, 'get', '/api/cart');
    const shape = (c) => c.replace(/sessionId=[0-9a-f]{32}/, 'sessionId=ID').replace(/Expires=[^;]+/, 'Expires=DATE');
    expect(shape(first.rust.cookie)).toBe(shape(first.node.cookie));
    const jar = (c) => ({ Cookie: c.split(';')[0] });
    await sequence({ node: { auth: jar(first.node.cookie) }, rust: { auth: jar(first.rust.cookie) } });
  });

  test('a bad token is a guest', async () => {
    await both({ node: { auth: { Authorization: 'Bearer nope' } }, rust: { auth: { Authorization: 'Bearer nope' } } },
      'post', '/api/cart/add', {});
  });
});

describeIfRust('checkout: tax, coupons and order creation', () => {
  const post = (url, body) => compareWith('post', url, { body });

  test('calculate-tax', async () => {
    for (const body of [{}, { subtotal: null }, { subtotal: -1 }, { subtotal: 0 }, { subtotal: 100 },
      { subtotal: '59.99' }, { subtotal: 'abc' }, { subtotal: true }, { subtotal: [12] },
      { subtotal: 59.99, stateCode: 'NY', countryCode: 'US' }, { subtotal: 10, countryCode: 'CA' }]) {
      await post('/api/orders/calculate-tax', body);
    }
  });

  const address = { first_name: 'Ada', last_name: 'L', address_line_1: '1 Silk Way', city: 'Austin',
    state: 'TX', postal_code: '73301', country: 'US' };

  // Fill each side's cart with the same lines.
  async function fill(sides, v, quantity) {
    await both(sides, 'get', '/api/cart');
    await both(sides, 'post', '/api/cart/add', { product_id: v.product_id, variant_id: v.variant_id, quantity });
  }

  async function signedIn() {
    const a = (await registerCustomer()).accessToken;
    const b = (await registerCustomer()).accessToken;
    return { node: { auth: { Authorization: `Bearer ${a}` } }, rust: { auth: { Authorization: `Bearer ${b}` } } };
  }

  test('apply-coupon', async () => {
    const sides = await signedIn();
    const v = await inStockVariant(4);
    const coupon = (couponCode) => both(sides, 'post', '/api/orders/apply-coupon', (s) => ({ cartId: s.cartId, couponCode }));
    await both(sides, 'post', '/api/orders/apply-coupon', {});
    await both(sides, 'post', '/api/orders/apply-coupon', { cartId: 'CART0000000001', couponCode: 'WELCOME10' });
    await both(sides, 'get', '/api/cart');
    await coupon('WELCOME10'); // empty cart
    await fill(sides, v, 1);
    for (const code of [undefined, '', 'WELCOME10', 'welcome10', 'SAVE20', 'FREESHIP', 'NOPE', 7]) await coupon(code);
    await both(sides, 'post', '/api/cart/add', { product_id: v.product_id, variant_id: v.variant_id, quantity: 2 });
    for (const code of ['WELCOME10', 'SAVE20', 'FREESHIP']) await coupon(code);
  });

  test('create: validation, ownership, empty cart', async () => {
    const sides = await signedIn();
    const create = (body) => both(sides, 'post', '/api/orders/create', body);
    await create({});
    await create({ shippingAddress: address });
    await create({ shippingAddress: [], billingAddress: address });
    await create({ shippingAddress: address, billingAddress: address });
    await create({ cartId: 'CART0000000001', shippingAddress: address, billingAddress: address });
    await both(sides, 'get', '/api/cart');
    await create((s) => ({ cartId: s.cartId, shippingAddress: address, billingAddress: address }));
    // Guests: email required and checked before anything else.
    const guests = { node: { auth: {} }, rust: { auth: {} } };
    for (const guestEmail of [undefined, '', 'nope', 'a@b', 'a b@c.d', 42]) {
      await both(guests, 'post', '/api/orders/create', { cartId: 'CART0000000001', shippingAddress: address, billingAddress: address, guestEmail });
    }
    await both(guests, 'post', '/api/orders/create', { cartId: 'CART0000000001', shippingAddress: address, billingAddress: address, guestEmail: 'g@example.com' });
  });

  async function placeAndCompare(sides, body) {
    const before = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT quantity_available FROM inventory WHERE variant_id = ?', [body.variant.variant_id])).quantity_available;
    const placed = await both(sides, 'post', '/api/orders/create', (s) => ({ cartId: s.cartId, ...body.order }));
    expect(placed.node.status).toBe(200);
    const after = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT quantity_available FROM inventory WHERE variant_id = ?', [body.variant.variant_id])).quantity_available;
    expect(before - after).toBe(2 * body.quantity); // both sides decremented the same amount

    // The stored orders match field for field (as each owner sees them).
    await both(sides, 'get', (s) => `/api/orders/${s.orderId}`);
    // The cart is gone and a new one starts empty.
    await both(sides, 'get', '/api/cart');
    // Each queued exactly one confirmation with the same subject/content shape.
    const mails = [];
    for (const s of Object.values(sides)) {
      const order = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT order_number FROM orders WHERE id = ?', [s.orderId]));
      const rows = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
        'SELECT to_name, subject, email_content, template_data, status, max_attempts FROM email_queue WHERE subject LIKE ?',
        [`%${order.order_number}%`]));
      expect(rows).toHaveLength(1);
      mails.push(norm(rows[0]));
    }
    expect(mails[1]).toEqual(mails[0]);
    // The confirmation carries the order itself (migration 014), as raw values:
    // the email daemon HTML-escapes them when it renders the HTML body.
    const vars = mails[0].template_data;
    expect(vars.items).toEqual([expect.objectContaining({ quantity: body.quantity })]);
    expect(vars.has_discount).toBe(body.hasDiscount);
    expect(vars.shipping_address_lines).toEqual(body.addressLines);
    for (const k of ['subtotal', 'discount_amount', 'shipping_amount', 'tax_amount', 'total_amount']) {
      expect(vars[k]).toMatch(/^\d+\.\d\d$/);
    }
    // Coupon redemptions were recorded the same way.
    const usage = [];
    for (const s of Object.values(sides)) {
      usage.push(DatabaseUtil.rows(await DatabaseUtil.executeQuery(
        'SELECT discount_amount FROM discount_code_usage WHERE order_id = ?', [s.orderId])));
    }
    expect(usage[1]).toEqual(usage[0]);
  }

  test('create: signed-in order with a coupon and express shipping', async () => {
    const sides = await signedIn();
    const v = await inStockVariant(10);
    await fill(sides, v, 3);
    await placeAndCompare(sides, {
      variant: v, quantity: 3, hasDiscount: true,
      addressLines: ['Ada L', '1 Silk Way', 'Austin, TX 73301', 'US'],
      order: { shippingAddress: address, billingAddress: { ...address, first_name: 'Bill' }, couponCode: 'WELCOME10', shippingMethod: 'EXPRESS' },
    });
  });

  test('create: guest order on the session cookie', async () => {
    const first = await both({ node: { auth: {} }, rust: { auth: {} } }, 'get', '/api/cart');
    const jar = (c) => ({ Cookie: c.split(';')[0] });
    const sides = { node: { auth: jar(first.node.cookie) }, rust: { auth: jar(first.rust.cookie) } };
    const v = await inStockVariant(10);
    await fill(sides, v, 1);
    // Another browser cannot use this cart.
    await both({ node: { auth: {} }, rust: { auth: {} } }, 'post', '/api/orders/create',
      { cartId: sides.node.cartId, shippingAddress: address, billingAddress: address, guestEmail: 'g@example.com' });
    // Markup in a name or address reaches the queue raw on both sides; blank and
    // non-string parts are dropped from the address lines the same way.
    const shippingAddress = { ...address, first_name: 'Zoë <b>&', last_name: '', address_line_2: 'Apt "4"',
      postal_code: 73301, phone: { n: 1 } };
    await placeAndCompare(sides, {
      variant: v, quantity: 1, hasDiscount: false,
      addressLines: ['Zoë <b>&', '1 Silk Way', 'Apt "4"', 'Austin, TX 73301', 'US'],
      order: { shippingAddress, billingAddress: address, guestEmail: 'guest.parity@example.com', shippingMethod: 'NOPE' },
    });
  });

  test('GET on the POST-only paths is an order lookup', async () => {
    for (const p of ['create', 'apply-coupon', 'calculate-tax']) await compareWith('get', `/api/orders/${p}`);
  });
});
