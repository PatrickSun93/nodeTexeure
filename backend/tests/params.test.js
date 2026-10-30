// SQL parameter types. mysql2 binds a number as DOUBLE, a boolean as TINY and an
// array/object as JSON text; compared with a string column MySQL then casts the
// column, so `email = 0` matches every address and `session_id = 1` matches every
// session id starting "1<non-digit>". A cached prepared statement can also keep
// the first parameter type it saw, so each case below also replays the
// "numeric request first, then a legitimate string request" order.
const { app, request, DatabaseUtil, login, registerCustomer, inStockVariant, bearer } = require('./helpers');
const crypto = require('crypto');

const PASSWORDS = ['Admin@123', 'Staff@123', 'Customer@123'];
const NON_STRINGS = [0, 1, true, false, ['alice.customer@example.com'], { a: 1 }];
const REPEAT = 12; // enough to hit every pooled connection's cached statement

const q = (sql, params) => DatabaseUtil.executeQuery(sql, params);
const first = async (sql, params) => DatabaseUtil.first(await q(sql, params));
const rows = async (sql, params) => DatabaseUtil.rows(await q(sql, params));
const hex = (n) => crypto.randomBytes(n).toString('hex');
const unknownEmail = () => `nobody.${hex(4)}@example.com`;

describe('login', () => {
  const post = (body, cookie) => {
    const r = request(app).post('/api/users/login');
    if (cookie) r.set('Cookie', cookie);
    return r.send(body);
  };

  test('non-string email or password is a 400, never a login', async () => {
    for (const email of NON_STRINGS) {
      for (const password of PASSWORDS) {
        const res = await post({ email, password });
        expect({ email, status: res.status }).toEqual({ email, status: 400 });
        expect(res.body.keyValueTable?.accessToken).toBeUndefined();
      }
    }
    for (const password of NON_STRINGS) {
      const res = await post({ email: 'alice.customer@example.com', password });
      expect(res.status).toBe(400);
    }
  });

  test('after numeric emails, unknown addresses still match nobody and real logins still work', async () => {
    for (let i = 0; i < REPEAT; i++) await post({ email: 0, password: 'x' });
    for (const password of PASSWORDS) {
      const res = await post({ email: unknownEmail(), password });
      expect(res.status).toBe(401);
    }
    const alice = await login('customer');
    expect(alice.email).toBe('alice.customer@example.com');
  });
});

describe('forgot-password', () => {
  const resetTokens = async () => Number((await first(
    'SELECT COUNT(*) AS n FROM users WHERE password_reset_token IS NOT NULL')).n);

  test('non-string email is a 400 and issues no reset token', async () => {
    const before = await resetTokens();
    for (const email of NON_STRINGS) {
      const res = await request(app).post('/api/users/forgot-password').send({ email });
      expect({ email, status: res.status }).toEqual({ email, status: 400 });
    }
    expect(await resetTokens()).toBe(before);
  });

  test('after numeric emails, an unknown address still resets nobody', async () => {
    for (let i = 0; i < REPEAT; i++) await request(app).post('/api/users/forgot-password').send({ email: 1 });
    const before = await resetTokens();
    for (let i = 0; i < REPEAT; i++) {
      const res = await request(app).post('/api/users/forgot-password').send({ email: unknownEmail() });
      expect(res.status).toBe(200);
    }
    expect(await resetTokens()).toBe(before);
  });
});

describe('reset-password', () => {
  test('non-string token or password is a 400', async () => {
    for (const token of NON_STRINGS) {
      const res = await request(app).post('/api/users/reset-password').send({ token, newPassword: 'Newpass@123' });
      expect(res.status).toBe(400);
    }
    const res = await request(app).post('/api/users/reset-password').send({ token: 'abc', newPassword: 12345678 });
    expect(res.status).toBe(400);
  });
});

describe('verify-email', () => {
  test('array / object tokens are a 400; the real token still verifies', async () => {
    const user = await registerCustomer();
    const { email_verification_token: token } = await first(
      'SELECT email_verification_token FROM users WHERE id = ?', [user.userId]);
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    for (const query of [`token=${token}&token=${token}`, `token[]=${token}`, `token[a]=${token}`]) {
      const res = await request(app).get(`/api/users/verify-email?${query}`);
      expect({ query, status: res.status }).toEqual({ query, status: 400 });
    }
    expect((await first('SELECT email_verified FROM users WHERE id = ?', [user.userId])).email_verified).toBe(0);

    const ok = await request(app).get('/api/users/verify-email').query({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.keyValueTable.email).toBe(user.email);
  });
});

describe('register', () => {
  const valid = () => ({ email: `reg.${hex(4)}@example.com`, password: 'Tester@1234', firstName: 'Reg', lastName: 'Ister' });

  test('every field must be a string', async () => {
    for (const field of ['email', 'password', 'firstName', 'lastName']) {
      for (const bad of [12345678, true, ['Tester@1234'], { a: 'b' }]) {
        const body = { ...valid(), [field]: bad };
        if (field === 'email' && Array.isArray(bad)) body.email = [valid().email];
        const res = await request(app).post('/api/users/register').send(body);
        expect({ field, bad, status: res.status }).toEqual({ field, bad, status: 400 });
      }
    }
  });

  test('after a numeric email, an unknown address is not "already registered"', async () => {
    for (let i = 0; i < REPEAT; i++) await request(app).post('/api/users/register').send({ ...valid(), email: 0 });
    const res = await request(app).post('/api/users/register').send(valid());
    expect(res.status).toBe(201);
  });
});

// A guest cart whose session id casts to the number 1 ('1a…' — 1 then a
// non-digit), holding one line: the cart a `sessionId=j:1` cookie would match.
async function plantGuestCart() {
  const sessionId = `1a${hex(15)}`;
  const id = (await first("SELECT get_next_id('CART') AS id")).id;
  expect((await q('INSERT INTO shopping_carts (id, session_id) VALUES (?, ?)', [id, sessionId])).success).toBe(true);
  const v = await inStockVariant(1);
  const price = (await first('SELECT base_price FROM products WHERE id = ?', [v.product_id])).base_price;
  const itemId = (await first("SELECT get_next_id('CARTITEM') AS id")).id;
  expect((await q('INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, 1, ?)',
    [itemId, id, v.product_id, v.variant_id, price])).success).toBe(true);
  return { id, sessionId, product_id: v.product_id, variant_id: v.variant_id };
}

const BAD_SESSIONS = ['j:1', 'j:true', 'j:[1]', 'j:{"a":1}', 'j:1e0', 'abc', '1', 'A'.repeat(32), `${hex(16)}0`];
const issuedSession = (res) => {
  const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('sessionId='));
  return cookie ? cookie.split(';')[0].slice('sessionId='.length) : null;
};

describe('guest cart session cookie', () => {
  test("a bad sessionId never resolves a stranger's cart; a fresh session is issued", async () => {
    const planted = await plantGuestCart();
    for (const cookie of BAD_SESSIONS) {
      const res = await request(app).get('/api/cart').set('Cookie', `sessionId=${cookie}`);
      expect(res.status).toBe(200);
      expect({ cookie, cartId: res.body.keyValueTable.cartId }).not.toEqual({ cookie, cartId: planted.id });
      expect(res.body.keyValueTable.items).toEqual([]);
      const issued = issuedSession(res);
      expect(issued).toMatch(/^[a-f0-9]{32}$/);
      const cart = await first('SELECT session_id FROM shopping_carts WHERE id = ?', [res.body.keyValueTable.cartId]);
      expect(cart.session_id).toBe(issued);
    }
    // add / update / remove act on the caller's own (new) cart, not the planted one.
    const add = await request(app).post('/api/cart/add').set('Cookie', 'sessionId=j:1')
      .send({ product_id: planted.product_id, variant_id: planted.variant_id, quantity: 1 });
    expect(add.status).toBe(200);
    const line = await first('SELECT id FROM cart_items WHERE cart_id = ?', [planted.id]);
    for (const [method, url] of [['put', `/api/cart/update/${line.id}`], ['delete', `/api/cart/remove/${line.id}`]]) {
      const res = await request(app)[method](url).set('Cookie', 'sessionId=j:1').send({ quantity: 1 });
      expect(res.status).toBe(404);
    }
    const lines = await rows('SELECT quantity FROM cart_items WHERE cart_id = ?', [planted.id]);
    expect(lines).toEqual([{ quantity: 1 }]);
  });

  test('after bad cookies, the real session still finds its own cart and an unknown one finds nothing', async () => {
    const planted = await plantGuestCart();
    for (let i = 0; i < REPEAT; i++) await request(app).get('/api/cart').set('Cookie', 'sessionId=j:1');
    const own = await request(app).get('/api/cart').set('Cookie', `sessionId=${planted.sessionId}`);
    expect(own.body.keyValueTable.cartId).toBe(planted.id);
    expect(own.body.keyValueTable.items).toHaveLength(1);
    expect(issuedSession(own)).toBeNull();
    const stranger = await request(app).get('/api/cart').set('Cookie', `sessionId=1b${hex(15)}`);
    expect(stranger.body.keyValueTable.cartId).not.toBe(planted.id);
    expect(stranger.body.keyValueTable.items).toEqual([]);
  });

  test('checkout ownership: a bad cookie never owns a guest cart', async () => {
    const planted = await plantGuestCart();
    for (const cookie of BAD_SESSIONS) {
      const res = await request(app).post('/api/orders/apply-coupon').set('Cookie', `sessionId=${cookie}`)
        .send({ cartId: planted.id, couponCode: 'WELCOME10' });
      expect(res.status).toBe(403);
    }
    const own = await request(app).post('/api/orders/apply-coupon').set('Cookie', `sessionId=${planted.sessionId}`)
      .send({ cartId: planted.id });
    expect(own.status).toBe(200);
  });

  const userLines = async (userId) => rows(
    `SELECT ci.product_id, ci.variant_id, ci.quantity FROM cart_items ci
     JOIN shopping_carts c ON ci.cart_id = c.id WHERE c.user_id = ?`, [userId]);

  test("login with a bad cookie merges no stranger's cart; a valid one merges the caller's", async () => {
    const planted = await plantGuestCart();
    const user = await registerCustomer();
    for (const cookie of BAD_SESSIONS) {
      const res = await request(app).post('/api/users/login').set('Cookie', `sessionId=${cookie}`)
        .send({ email: user.email, password: user.password });
      expect(res.status).toBe(200);
    }
    expect(await userLines(user.userId)).toEqual([]);
    expect(await first('SELECT id FROM shopping_carts WHERE id = ?', [planted.id])).toBeTruthy();

    const res = await request(app).post('/api/users/login').set('Cookie', `sessionId=${planted.sessionId}`)
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(await userLines(user.userId)).toEqual([
      { product_id: planted.product_id, variant_id: planted.variant_id, quantity: 1 },
    ]);
    expect(await first('SELECT id FROM shopping_carts WHERE id = ?', [planted.id])).toBeNull();
    // Logging in again with the same (now empty) session changes nothing.
    await request(app).post('/api/users/login').set('Cookie', `sessionId=${planted.sessionId}`)
      .send({ email: user.email, password: user.password });
    expect(await userLines(user.userId)).toHaveLength(1);
  });

  test('a merged line adds to an existing variant line instead of duplicating it', async () => {
    const planted = await plantGuestCart();
    const user = await registerCustomer();
    const add = await request(app).post('/api/cart/add').set(bearer(user.accessToken))
      .send({ product_id: planted.product_id, variant_id: planted.variant_id, quantity: 1 });
    expect(add.status).toBe(200);
    await request(app).post('/api/users/login').set('Cookie', `sessionId=${planted.sessionId}`)
      .send({ email: user.email, password: user.password });
    expect(await userLines(user.userId)).toEqual([
      { product_id: planted.product_id, variant_id: planted.variant_id, quantity: 2 },
    ]);
  });
});

describe('cart abandonment emails', () => {
  test('signed-in only: a guest is refused before any guestEmail is read', async () => {
    for (const guestEmail of [1, true, ['a@example.com'], { a: 1 }, 'a@example.com']) {
      for (const url of ['/api/cart/track-abandonment', '/api/cart/cancel-abandonment']) {
        const res = await request(app).post(url).send({ guestEmail });
        expect({ url, guestEmail, status: res.status }).toEqual({ url, guestEmail, status: 401 });
      }
    }
  });
});

describe('reviews', () => {
  test('a non-string product_id is a 400; after it, real reviews are neither duplicates nor verified', async () => {
    const user = await registerCustomer();
    const create = (body) => request(app).post('/api/reviews/create').set(bearer(user.accessToken)).send(body);
    for (const product_id of [1, true, ['PROD0000000001'], { a: 1 }]) {
      for (let i = 0; i < REPEAT; i++) {
        const res = await create({ product_id, rating: 5, review_text: 'Lovely' });
        expect(res.status).toBe(400);
      }
    }
    const products = await rows("SELECT id FROM products WHERE status = 'approved' ORDER BY id LIMIT 2");
    for (const { id } of products) {
      const res = await create({ product_id: id, rating: 4, title: 'Nice', review_text: 'Soft' });
      expect({ id, status: res.status }).toEqual({ id, status: 201 });
    }
    const mine = await rows('SELECT is_verified_purchase FROM product_reviews WHERE user_id = ?', [user.userId]);
    expect(mine).toEqual([{ is_verified_purchase: 0 }, { is_verified_purchase: 0 }]);
    const badTitle = await create({ product_id: 'PROD0000000003', rating: 4, title: ['x'], review_text: 'Soft' });
    expect(badTitle.status).toBe(400);
  });
});

describe('wishlist', () => {
  test('non-string ids match no product; after them real adds still work', async () => {
    const user = await registerCustomer();
    const add = (body) => request(app).post('/api/wishlist').set(bearer(user.accessToken)).send(body);
    for (const product_id of [1, true, ['PROD0000000001'], { a: 1 }]) {
      for (let i = 0; i < REPEAT; i++) expect((await add({ product_id })).status).toBe(404);
      expect((await add({ product_id: 'PROD0000000001', variant_id: product_id })).status).toBe(400);
    }
    expect((await add({ product_id: 'PROD0000000001' })).status).toBe(201);
    expect((await add({ product_id: 'PROD0000000002' })).status).toBe(201);
    const mine = await rows('SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY product_id', [user.userId]);
    expect(mine.map((r) => r.product_id)).toEqual(['PROD0000000001', 'PROD0000000002']);
  });
});

describe('returns', () => {
  test('request: non-string ids and unknown reasons are a 400', async () => {
    const user = await registerCustomer();
    const post = (body) => request(app).post('/api/returns/request').set(bearer(user.accessToken)).send(body);
    const items = [{ orderItemId: 'OI1', quantity: 1 }];
    for (const orderId of [1, true, ['x'], { a: 1 }]) {
      expect((await post({ orderId, reason: 'defective', items })).status).toBe(400);
    }
    for (const reason of [1, ['defective'], 'not-a-reason']) {
      expect((await post({ orderId: 'x', reason, items })).status).toBe(400);
    }
    for (const bad of ['OI1', [{ orderItemId: 1 }], [{ orderItemId: ['OI1'] }], [null]]) {
      expect((await post({ orderId: 'x', reason: 'defective', items: bad })).status).toBe(400);
    }
    // A well-formed request for someone else's / no order is still a 404.
    expect((await post({ orderId: 'nope', reason: 'defective', items })).status).toBe(404);
  });
});

describe('payments', () => {
  test('a non-string orderId is a 400 (checked before anything else)', async () => {
    const user = await registerCustomer();
    for (const url of ['/api/payments/create-checkout-session', '/api/payments/create-payment-intent']) {
      for (const orderId of [1, true, ['x'], { a: 1 }]) {
        const res = await request(app).post(url).set(bearer(user.accessToken)).send({ orderId });
        expect({ url, orderId, status: res.status }).toEqual({ url, orderId, status: 400 });
      }
    }
  });
});

describe('unsubscribe', () => {
  const { buildUnsubscribeToken } = require('../utils/emailSuppression');
  test('a non-string token never records an opt-out', async () => {
    const email = unknownEmail();
    const token = buildUnsubscribeToken(email);
    for (const bad of [[token], { token }]) {
      const res = await request(app).post('/api/unsubscribe').send({ email, token: bad });
      expect(res.status).toBe(200);
      expect(res.body.keyValueTable[0].recorded).toBe(false);
    }
    const qs = `email=${encodeURIComponent(email)}`;
    for (const query of [`${qs}&token[]=${token}`, `${qs}&token=${token}&token=${token}`, `${qs}&token[a]=${token}`]) {
      const get = await request(app).get(`/api/unsubscribe?${query}`);
      expect({ query, status: get.status }).toEqual({ query, status: 400 });
    }
    expect((await request(app).get('/api/unsubscribe').query({ email, token })).status).toBe(200);
    expect(await first('SELECT id FROM email_unsubscribes WHERE email = ?', [email])).toBeNull();
    const ok = await request(app).post('/api/unsubscribe').send({ email, token });
    expect(ok.body.keyValueTable[0].recorded).toBe(true);
  });
});

describe('addresses', () => {
  test('type must be shipping or billing', async () => {
    const user = await registerCustomer();
    const body = { first_name: 'A', last_name: 'B', address_line_1: '1 Way', city: 'X', state: 'TX', postal_code: '1', country: 'US' };
    for (const type of [1, true, ['billing'], 'home']) {
      const res = await request(app).post('/api/users/addresses').set(bearer(user.accessToken)).send({ ...body, type });
      expect({ type, status: res.status }).toEqual({ type, status: 400 });
    }
    const ok = await request(app).post('/api/users/addresses').set(bearer(user.accessToken)).send({ ...body, type: 'billing' });
    expect(ok.status).toBe(201);
  });
});

describe('admin', () => {
  let auth;
  beforeAll(async () => {
    const { accessToken } = await login('admin');
    const res = await request(app).get('/api/users/csrf-token').set(bearer(accessToken));
    const csrf = res.body.keyValueTable.csrfToken;
    auth = (r) => r.set(bearer(accessToken)).set('X-CSRF-Token', csrf).set('Cookie', `csrf_token=${csrf}`);
  });
  const productCount = async () => Number((await first("SELECT COUNT(*) AS n FROM products WHERE status <> 'discontinued'")).n);

  test('bulk product actions reject non-string ids (id = 0 would match every product)', async () => {
    const before = await productCount();
    for (const productIds of [[0], [1], [true], [['PROD0000000001']], ['PROD0000000001', 0]]) {
      const del = await auth(request(app).post('/api/admin/products/bulk-delete')).send({ productIds });
      expect({ productIds, status: del.status }).toEqual({ productIds, status: 400 });
      const upd = await auth(request(app).post('/api/admin/products/bulk-update')).send({ productIds, updates: { is_featured: 1 } });
      expect({ productIds, status: upd.status }).toEqual({ productIds, status: 400 });
    }
    expect(await productCount()).toBe(before);
  });

  test('create user: non-string email is a 400', async () => {
    for (const email of [0, true, ['a@example.com']]) {
      const res = await auth(request(app).post('/api/admin/users'))
        .send({ email, password: 'Admin@12345', first_name: 'A', last_name: 'B' });
      expect(res.status).toBe(400);
    }
  });

  test('stock adjustment: non-string product/variant ids are a 400', async () => {
    for (const product_id of [1, true, ['PROD0000000001']]) {
      const res = await auth(request(app).post('/api/admin/inventory/adjust')).send({ product_id, quantity_change: 1 });
      expect(res.status).toBe(400);
    }
    const res = await auth(request(app).post('/api/admin/inventory/adjust'))
      .send({ product_id: 'PROD0000000001', variant_id: 7, quantity_change: 1 });
    expect(res.status).toBe(400);
  });

  test('exports and lists reject array / object filters', async () => {
    for (const url of ['/api/admin/bulk/orders/export?status[]=pending', '/api/admin/bulk/products/export?category[a]=b',
      '/api/returns/admin/all?status=a&status=b', '/api/admin/inventory/movements?product_id[]=x']) {
      const res = await auth(request(app).get(url));
      expect({ url, status: res.status }).toEqual({ url, status: 400 });
    }
    // The returns list binds its filter as a string and inlines LIMIT/OFFSET.
    for (const url of ['/api/returns/admin/all', '/api/returns/admin/all?status=requested&page=2&limit=5']) {
      const res = await auth(request(app).get(url));
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });
});

// Node ↔ Rust: the Rust API serves cart and wishlist in production, so it must
// treat the same inputs the same way (parity.test.js covers the valid paths).
const RUST = process.env.RUST_API_URL;
(RUST ? describe : describe.skip)('Rust API: same handling of non-string values', () => {
  async function rustCall(method, url, headers = {}, body) {
    const res = await fetch(RUST + url, {
      method: method.toUpperCase(),
      headers: { ...headers, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') ?? undefined };
  }
  async function nodeCall(method, url, headers = {}, body) {
    let r = request(app)[method](url).set(headers);
    if (body !== undefined) r = r.send(body);
    const res = await r;
    return { status: res.status, body: res.body, cookie: res.headers['set-cookie']?.find((c) => c.startsWith('sessionId=')) };
  }

  test('guest session cookies', async () => {
    const planted = await plantGuestCart();
    const view = (r) => ({
      status: r.status,
      issued: r.cookie ? /^sessionId=[a-f0-9]{32};/.test(r.cookie) : false,
      planted: r.body.keyValueTable.cartId === planted.id,
      items: r.body.keyValueTable.items.map((i) => [i.product_id, i.variant_id, i.quantity]),
    });
    const cookies = [...BAD_SESSIONS, planted.sessionId, `"${planted.sessionId}"`, `j:"${planted.sessionId}"`,
      `j:%22${planted.sessionId}%22`, ''];
    for (const cookie of cookies) {
      const headers = { Cookie: `sessionId=${cookie}` };
      const node = view(await nodeCall('get', '/api/cart', headers));
      const rust = view(await rustCall('get', '/api/cart', headers));
      expect({ cookie, ...rust }).toEqual({ cookie, ...node });
      expect(node.planted).toBe(!BAD_SESSIONS.includes(cookie) && cookie !== '');
    }
  });

  test('wishlist ids that are not strings', async () => {
    const { accessToken } = await registerCustomer();
    const headers = bearer(accessToken);
    for (const product_id of [1, 1.5, true, ['PROD0000000001'], { a: 1 }]) {
      for (const body of [{ product_id }, { product_id: 'PROD0000000001', variant_id: product_id }]) {
        const node = await nodeCall('post', '/api/wishlist', headers, body);
        const rust = await rustCall('post', '/api/wishlist', headers, body);
        expect({ body, status: rust.status, res: rust.body }).toEqual({ body, status: node.status, res: node.body });
      }
    }
  });
});
