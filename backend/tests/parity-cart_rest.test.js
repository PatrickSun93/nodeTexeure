// Node ↔ Rust parity for the rest of /api/cart (reserve-stock, track-abandonment,
// cancel-abandonment) and /api/abandoned-cart (recovery links), plus Express's
// 404 for the paths and methods these groups don't route. Runs when
// RUST_API_URL points at a running Rust API; skipped otherwise.
//
// Every mutating step runs once per side with that side's own user / guest
// cookie / email / cart, and the resulting rows (stock_reservations, inventory,
// email_queue, abandoned_cart_recovery) are compared field by field.
const crypto = require('crypto');
const { DatabaseUtil, registerCustomer } = require('./helpers');
const { describeIfRust, call, normalizer, expectSameSetCookies } = require('./parityHelpers');
const { buildUnsubscribeUrl } = require('../utils/emailSuppression');

const SIDES = ['node', 'rust'];

// Generated ids, tokens, timestamps and each side's own email/cart.
const N = normalizer([
  [/STOCK\d{10}/g, 'STOCK*'],
  [/CARTITEM\d{10}/g, 'CARTITEM*'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, 'UUID'],
  [/CART\d{10}/g, 'CART*'],
  [/USER\d{10}/g, 'USER*'],
  [/test\.\d+\.[a-z0-9]+@example\.com/g, 'EMAIL'],
  [/cr\.(node|rust)\.[a-z0-9]+@example\.com/gi, 'GUEST'],
  [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'],
]);

const rows = async (sql, params = []) => DatabaseUtil.rows(await DatabaseUtil.executeQuery(sql, params));
const first = async (sql, params = []) => (await rows(sql, params))[0] || null;

const pick = (v, s) => (typeof v === 'function' ? v(s) : v);

// The same request on both sides (each with its own auth/state); same status and
// normalized JSON. `cookies: true` also compares the Set-Cookie headers.
async function same(sides, method, url, body, { cookies = false } = {}) {
  const out = {};
  for (const side of SIDES) {
    const s = sides[side];
    out[side] = await call(side, method, pick(url, s), s.auth, pick(body, s));
    const kvt = out[side].body?.keyValueTable;
    if (kvt?.cartId) s.cartId = kvt.cartId;
  }
  const label = `${method.toUpperCase()} ${pick(url, sides.node)} ${JSON.stringify(pick(body, sides.node) ?? '')}`;
  const view = (r) => ({ label, status: r.status, body: N(r.body ?? r.text) });
  expect(view(out.rust)).toEqual(view(out.node));
  if (cookies) expectSameSetCookies(out.node, out.rust, { volatile: ['sessionId'] });
  return out;
}

const guestEmail = (side) => `cr.${side}.${crypto.randomBytes(5).toString('hex')}@example.com`;

// Two signed-in customers, one per side.
async function customers() {
  const out = {};
  for (const side of SIDES) {
    const c = await registerCustomer();
    out[side] = { auth: { Authorization: `Bearer ${c.accessToken}` }, email: c.email, userId: c.userId, token: c.accessToken };
  }
  return out;
}

// Two guests, each with the sessionId cookie its own service issued.
async function guests() {
  const sides = { node: { auth: {} }, rust: { auth: {} } };
  const res = await same(sides, 'get', '/api/cart', undefined, { cookies: true });
  for (const side of SIDES) {
    sides[side].auth = { Cookie: res[side].cookie.split(';')[0] };
    sides[side].email = guestEmail(side);
  }
  return sides;
}

// Two in-stock variants of different approved products.
async function variants() {
  const list = await rows(
    `SELECT i.product_id, i.variant_id, i.quantity_available FROM inventory i
     JOIN products p ON p.id = i.product_id AND p.status = 'approved'
     WHERE i.variant_id IS NOT NULL AND i.quantity_available >= 10
     ORDER BY i.product_id, i.variant_id`);
  const a = list[0];
  const b = list.find((v) => v.product_id !== a.product_id);
  return [a, b];
}

async function fill(sides, lines) {
  for (const [v, quantity] of lines) {
    await same(sides, 'post', '/api/cart/add', { product_id: v.product_id, variant_id: v.variant_id, quantity });
  }
  await same(sides, 'get', '/api/cart');
}

// A cart line written straight to the table (states the API can't create).
async function rawLine(cartId, productId, variantId, quantity, price = '10.00') {
  const id = (await first("SELECT get_next_id('CARTITEM') AS id")).id;
  const r = await DatabaseUtil.executeQuery(
    'INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
    [id, cartId, productId, variantId, quantity, price]);
  expect(r.success).toBe(true);
  return id;
}

const reserved = async (v) => (await first(
  'SELECT quantity_reserved FROM inventory WHERE product_id = ? AND variant_id <=> ?', [v.product_id, v.variant_id])).quantity_reserved;

// A side's stock_reservations rows, comparable across sides.
async function reservationsOf(s) {
  const list = await rows(
    `SELECT id, product_id, variant_id, cart_id, user_id, quantity,
            TIMESTAMPDIFF(SECOND, created_at, expires_at) AS ttl
     FROM stock_reservations WHERE cart_id = ? ORDER BY id`, [s.cartId]);
  return list.map((r) => {
    expect(r.cart_id).toBe(s.cartId);
    expect(r.user_id).toBe(s.userId ?? null);
    expect(Math.abs(r.ttl - 3600)).toBeLessThanOrEqual(2);
    return { ...N(r), ttl: 'TTL', user_id: r.user_id ? 'USER' : null };
  });
}

// A side's abandoned-cart emails, oldest first.
async function mailsOf(email) {
  const list = await rows(
    `SELECT q.to_email, q.to_name, q.subject, q.email_content, q.template_data, q.status,
            q.attempts, q.max_attempts, TIMESTAMPDIFF(SECOND, q.created_at, q.scheduled_at) AS delay
     FROM email_queue q JOIN email_templates t ON t.id = q.template_id
     WHERE q.to_email = ? AND t.name = 'abandoned_cart'
     ORDER BY q.status = 'pending', JSON_EXTRACT(q.template_data, '$.sequence_step')`, [email]);
  return list.map((m) => {
    const data = typeof m.template_data === 'string' ? JSON.parse(m.template_data) : m.template_data;
    // Each side's link is for its own address.
    expect(data.unsubscribe_link).toBe(buildUnsubscribeUrl(email));
    const step = data.sequence_step;
    expect(Math.abs(m.delay - { 1: 3600, 2: 86400, 3: 259200 }[step])).toBeLessThanOrEqual(5);
    return N({ ...m, template_data: { ...data, unsubscribe_link: 'UNSUB' }, delay: `step${step}` });
  });
}

async function expectSameMails(sides) {
  const node = await mailsOf(sides.node.email);
  const rust = await mailsOf(sides.rust.email);
  expect(rust).toEqual(node);
  return node;
}

async function expectSameReservations(sides) {
  const node = await reservationsOf(sides.node);
  const rust = await reservationsOf(sides.rust);
  expect(rust).toEqual(node);
  return node;
}

// ---------------------------------------------------------------------------

describeIfRust('cart + abandoned-cart: paths and methods Express does not route', () => {
  test('wrong method or unknown path → Express 404 with path and timestamp', async () => {
    const anon = { node: { auth: {} }, rust: { auth: {} } };
    const cases = [
      ['get', '/api/cart/add'], ['post', '/api/cart'], ['put', '/api/cart'], ['delete', '/api/cart'],
      ['get', '/api/cart/reserve-stock'], ['put', '/api/cart/track-abandonment'],
      ['get', '/api/cart/cancel-abandonment'], ['post', '/api/cart/update/CARTITEM0000000001'],
      ['get', '/api/cart/remove/CARTITEM0000000001'], ['delete', '/api/cart/update/x'],
      ['get', '/api/cart/nope'], ['post', '/api/cart/nope/deeper?x=1'], ['get', '/api/cart/update/'],
      ['get', '/api/cart/update/a/b'],
      ['get', '/api/abandoned-cart'], ['get', '/api/abandoned-cart/recovery'],
      ['get', '/api/abandoned-cart/recovery/'], ['get', '/api/abandoned-cart/recovery/a/b'],
      ['post', `/api/abandoned-cart/recovery/${'a'.repeat(64)}`], ['delete', '/api/abandoned-cart/x?y=%20'],
    ];
    for (const [method, url] of cases) {
      const out = await same(anon, method, url, method === 'get' ? undefined : {});
      expect(out.node.status).toBe(404);
      expect(out.node.body.keyValueTable.path).toBe(url);
    }
  });
});

describeIfRust('POST /api/cart/reserve-stock', () => {
  test('empty carts: guest (new cookie, j: cookie), signed-in, bad token', async () => {
    await same({ node: { auth: {} }, rust: { auth: {} } }, 'post', '/api/cart/reserve-stock', undefined, { cookies: true });
    // cookie-parser turns j:1 into the number 1: not a session we issue → a new one.
    const j = { node: { auth: { Cookie: 'sessionId=j:1' } }, rust: { auth: { Cookie: 'sessionId=j:1' } } };
    await same(j, 'post', '/api/cart/reserve-stock', {}, { cookies: true });
    const users = await customers();
    await same(users, 'post', '/api/cart/reserve-stock', {}, { cookies: true });
    const bad = { node: { auth: { Authorization: 'Bearer nope' } }, rust: { auth: { Authorization: 'Bearer nope' } } };
    await same(bad, 'post', '/api/cart/reserve-stock', {}, { cookies: true });
  });

  test('signed-in: reserves every line for an hour, again on a second call', async () => {
    const users = await customers();
    const [a, b] = await variants();
    await fill(users, [[a, 2], [b, 3]]);
    const before = [await reserved(a), await reserved(b)];
    const out = await same(users, 'post', '/api/cart/reserve-stock', { ignored: true });
    expect(out.node.status).toBe(200);
    expect(out.node.body.keyValueTable.reservations).toHaveLength(2);
    // Both sides reserved the same quantities on the same rows.
    expect([await reserved(a) - before[0], await reserved(b) - before[1]]).toEqual([4, 6]);
    let list = await expectSameReservations(users);
    expect(list).toHaveLength(2);
    // The response's expires_at is the row's.
    for (const side of SIDES) {
      const [r] = out[side].body.keyValueTable.reservations;
      const row = await first('SELECT expires_at FROM stock_reservations WHERE id = ?', [r.reservation_id]);
      expect(Math.abs(new Date(r.expires_at) - row.expires_at)).toBeLessThanOrEqual(1000);
    }

    // No dedupe: a second call holds the stock again.
    await same(users, 'post', '/api/cart/reserve-stock');
    list = await expectSameReservations(users);
    expect(list).toHaveLength(4);
    expect([await reserved(a) - before[0], await reserved(b) - before[1]]).toEqual([8, 12]);
  });

  test('guest: reservations carry no user', async () => {
    const sides = await guests();
    const [a] = await variants();
    await fill(sides, [[a, 1]]);
    await same(sides, 'post', '/api/cart/reserve-stock', undefined, { cookies: true });
    const list = await expectSameReservations(sides);
    expect(list).toHaveLength(1);
    expect(list[0].user_id).toBeNull();
  });

  test('a line short of stock rolls every reservation back', async () => {
    const users = await customers();
    const [a, b] = await variants();
    await fill(users, [[a, 1], [b, 1]]);
    const before = [await reserved(a), await reserved(b)];
    // The second line now wants more than there is.
    for (const side of SIDES) {
      const avail = (await first('SELECT quantity_available FROM inventory WHERE variant_id = ?', [b.variant_id])).quantity_available;
      await DatabaseUtil.executeQuery('UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND variant_id = ?',
        [avail + 1, users[side].cartId, b.variant_id]);
    }
    const out = await same(users, 'post', '/api/cart/reserve-stock');
    expect(out.node.status).toBe(400);
    expect(await expectSameReservations(users)).toHaveLength(0);
    expect([await reserved(a), await reserved(b)]).toEqual(before);
  });

  test('a line with no stock row stops there and keeps the earlier reservation (as Node does)', async () => {
    const users = await customers();
    const [a, b] = await variants();
    await fill(users, [[a, 1]]);
    const before = await reserved(a);
    // Variant-less line: there is no variant-less inventory row.
    for (const side of SIDES) await rawLine(users[side].cartId, b.product_id, null, 1);
    const out = await same(users, 'post', '/api/cart/reserve-stock');
    expect(out.node.status).toBe(400);
    const list = await expectSameReservations(users);
    expect(list).toHaveLength(1);
    expect(await reserved(a) - before).toBe(2);
  });

  test('a zero-quantity line is invalid item data', async () => {
    const users = await customers();
    const [a] = await variants();
    await same(users, 'get', '/api/cart');
    for (const side of SIDES) await rawLine(users[side].cartId, a.product_id, a.variant_id, 0);
    const out = await same(users, 'post', '/api/cart/reserve-stock');
    expect(out.node.status).toBe(400);
    expect(await expectSameReservations(users)).toHaveLength(0);
  });

  test('a signed-in user reserves their own cart, never the guest cart of the cookie they send', async () => {
    const owner = await guests();
    const [a] = await variants();
    await fill(owner, [[a, 1]]);
    const users = await customers();
    for (const side of SIDES) users[side].auth = { ...users[side].auth, Cookie: owner[side].auth.Cookie };
    const out = await same(users, 'post', '/api/cart/reserve-stock');
    expect(out.node.body.message).toBe('Cart is empty');
    expect(await expectSameReservations(owner)).toHaveLength(0);
  });
});

describeIfRust('POST /api/cart/track-abandonment', () => {
  const track = (sides, body, opts) => same(sides, 'post', '/api/cart/track-abandonment', body, opts);

  test('guest email validation (before any cart is made)', async () => {
    const anon = { node: { auth: {} }, rust: { auth: {} } };
    const bad = ['nope', 'a@b', 'a b@c.d', 'a@b@c.d', '@b.co', 'a@.co', 'a@b.', 'a\u00a0b@c.d', 'a\u2028@c.d',
      'a\ufeff@c.d', `${'x'.repeat(251)}@b.co`, 42, true, [], ['a@b.co'], { e: 'a@b.co' }];
    for (const guestEmail of bad) {
      const out = await track(anon, { guestEmail }, { cookies: true });
      expect(out.node.status).toBe(400);
      expect(out.node.cookies).toHaveLength(0);
    }
    // Falsy values count as no email; valid (by EMAIL_RE) ones pass, incl. U+0085 and 255 chars.
    for (const guestEmail of [undefined, '', 0, false, null, 'a\u0085b@c.d', `${'x'.repeat(250)}@b.c`, 'a@.b.c']) {
      const out = await track(anon, { guestEmail }, { cookies: true });
      expect(out.node.status).toBe(200);
      expect(out.node.body.message).toBe('No items in cart to track');
    }
  });

  test('guest: no email, then the 3-step sequence, then a re-track cancels and requeues', async () => {
    const sides = await guests();
    const [a, b] = await variants();
    await track(sides, (s) => ({ guestEmail: s.email }));
    await fill(sides, [[a, 3], [b, 1]]);
    let out = await track(sides, {});
    expect(out.node.body.message).toBe('No email available for cart abandonment tracking');
    expect(await expectSameMails(sides)).toHaveLength(0);

    out = await track(sides, (s) => ({ guestEmail: s.email }));
    expect(out.node.body.keyValueTable.queueIds).toHaveLength(3);
    let mails = await expectSameMails(sides);
    expect(mails.map((m) => [m.status, m.to_name, m.template_data.sequence_step])).toEqual(
      [['pending', 'Guest', 1], ['pending', 'Guest', 2], ['pending', 'Guest', 3]]);
    expect(mails[0].template_data.recovery_link).toBe(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout`);

    // The queue ids in the response are the rows written.
    for (const side of SIDES) {
      const ids = out[side].body.keyValueTable.queueIds;
      const found = await rows(`SELECT id FROM email_queue WHERE id IN (?, ?, ?) AND to_email = ?`, [...ids, sides[side].email]);
      expect(found).toHaveLength(3);
    }

    await track(sides, (s) => ({ guestEmail: s.email }));
    mails = await expectSameMails(sides);
    expect(mails.map((m) => m.status)).toEqual(['cancelled', 'cancelled', 'cancelled', 'pending', 'pending', 'pending']);
  });

  test('signed-in: the account email, guestEmail ignored, totals in JS arithmetic', async () => {
    const users = await customers();
    await track(users, { guestEmail: 'nope' }, { cookies: true }); // empty cart, no 400
    const [a, b] = await variants();
    await fill(users, [[a, 3], [b, 7]]);
    // Prices that don't sum exactly in binary.
    for (const side of SIDES) {
      await DatabaseUtil.executeQuery('UPDATE cart_items SET price = ? WHERE cart_id = ? AND variant_id = ?', ['0.10', users[side].cartId, a.variant_id]);
      await DatabaseUtil.executeQuery('UPDATE cart_items SET price = ? WHERE cart_id = ? AND variant_id = ?', ['0.70', users[side].cartId, b.variant_id]);
    }
    const out = await track(users, { guestEmail: 'someone.else@example.com' });
    expect(out.node.body.keyValueTable.customerEmail).toBe(users.node.email);
    expect(out.node.body.keyValueTable.totalAmount).toBe(`$${(0.1 * 3 + 0.7 * 7).toFixed(2)}`);
    const mails = await expectSameMails(users);
    expect(mails.map((m) => m.to_name)).toEqual(['Customer', 'Customer', 'Customer']);
    expect(await rows("SELECT id FROM email_queue WHERE to_email = 'someone.else@example.com'")).toHaveLength(0);
  });

  test('admin_auth cookie and revoked tokens', async () => {
    const users = await customers();
    const viaCookie = {};
    for (const side of SIDES) viaCookie[side] = { ...users[side], auth: { Cookie: `admin_auth=${users[side].token}` } };
    const [a] = await variants();
    await fill(viaCookie, [[a, 1]]);
    await track(viaCookie, {});
    expect(await expectSameMails(users)).toHaveLength(3);
    // Revoked: now a guest, so a bad guestEmail is a 400 again.
    for (const side of SIDES) {
      await DatabaseUtil.executeQuery('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [users[side].userId]);
    }
    const out = await track(users, { guestEmail: 'nope' }, { cookies: true });
    expect(out.node.status).toBe(400);
  });

  test('unsubscribed address: nothing queued, ids are null, old reminders still cancelled', async () => {
    const sides = await guests();
    const [a] = await variants();
    await fill(sides, [[a, 1]]);
    await track(sides, (s) => ({ guestEmail: s.email }));
    for (const side of SIDES) {
      await DatabaseUtil.executeQuery(
        "INSERT INTO email_unsubscribes (id, email, token) VALUES (get_next_id('UNSB'), ?, 'test')", [sides[side].email]);
    }
    const out = await track(sides, (s) => ({ guestEmail: s.email }));
    expect(out.node.body.keyValueTable.queueIds).toEqual([null, null, null]);
    expect((await expectSameMails(sides)).map((m) => m.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });
});

describeIfRust('POST /api/cart/cancel-abandonment', () => {
  const cancel = (sides, body) => same(sides, 'post', '/api/cart/cancel-abandonment', body, { cookies: true });

  test('validation and no-email answers (no cart, no cookie)', async () => {
    const anon = { node: { auth: {} }, rust: { auth: {} } };
    await cancel(anon, undefined);
    for (const guestEmail of [undefined, '', 0, false, null]) {
      const out = await cancel(anon, { guestEmail });
      expect(out.node.body.message).toBe('No email to cancel abandonment tracking');
    }
    for (const guestEmail of ['nope', 'a b@c.d', 7, true, [], ['x@y.z'], { a: 1 }, `${'x'.repeat(251)}@b.co`]) {
      const out = await cancel(anon, { guestEmail });
      expect(out.node.status).toBe(400);
    }
  });

  test('guest and signed-in: counts the cancelled reminders', async () => {
    const sides = await guests();
    const [a] = await variants();
    await fill(sides, [[a, 1]]);
    await same(sides, 'post', '/api/cart/track-abandonment', (s) => ({ guestEmail: s.email }));
    let out = await cancel(sides, (s) => ({ guestEmail: s.email.toUpperCase() })); // case-insensitive column
    expect(out.node.body.keyValueTable.cancelledCount).toBe(3);
    out = await cancel(sides, (s) => ({ guestEmail: s.email }));
    expect(out.node.body.keyValueTable.cancelledCount).toBe(0);
    expect((await expectSameMails(sides)).map((m) => m.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);

    const users = await customers();
    await fill(users, [[a, 1]]);
    await same(users, 'post', '/api/cart/track-abandonment', {});
    out = await cancel(users, { guestEmail: 'nope' });
    expect(out.node.body.keyValueTable).toEqual({ customerEmail: users.node.email, cancelledCount: 3 });
  });

  test('known issue, kept for parity: an anonymous caller can cancel any address', async () => {
    const users = await customers();
    const [a] = await variants();
    await fill(users, [[a, 1]]);
    await same(users, 'post', '/api/cart/track-abandonment', {});
    const anon = { node: { auth: {}, email: users.node.email }, rust: { auth: {}, email: users.rust.email } };
    const out = await cancel(anon, (s) => ({ guestEmail: s.email }));
    expect(out.node.body.keyValueTable.cancelledCount).toBe(3);
    expect((await expectSameMails(users)).map((m) => m.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });
});

describeIfRust('GET /api/abandoned-cart/recovery/:token', () => {
  const recover = (sides, token) => same(sides, 'get', (s) => `/api/abandoned-cart/recovery/${pick(token, s)}`);

  async function recoveryRow(cartId, email) {
    const token = crypto.randomBytes(32).toString('hex');
    const id = `RECOVERY_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const r = await DatabaseUtil.executeQuery(
      'INSERT INTO abandoned_cart_recovery (id, cart_id, email, recovery_token, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, cartId, email, token]);
    expect(r.success).toBe(true);
    return { id, token };
  }

  const recoveryState = async (id) => {
    const r = await first('SELECT recovered_at, recovery_order_id, email_sent_count FROM abandoned_cart_recovery WHERE id = ?', [id]);
    return { recovered: r.recovered_at !== null, recovery_order_id: r.recovery_order_id, email_sent_count: r.email_sent_count };
  };

  test('bad and unknown tokens', async () => {
    const anon = { node: { auth: {} }, rust: { auth: {} } };
    for (const token of ['short', '%20%20abc', 'x'.repeat(15), 'x'.repeat(256), '%E2%80%A8'.repeat(20),
      'a'.repeat(64), `%20${'a'.repeat(64)}%09`, '%zz', '%', '%E0%A4%A', '%C0%AF'.repeat(10), `${'%F0%9F%98%80'.repeat(8)}`,
       encodeURIComponent("' OR 1=1 -- xxxxxxxxxxxxxx"), '%2F'.repeat(20)]) {
      await recover(anon, token);
    }
  });

  test('marks the cart recovered once, cancels its reminders, returns the lines', async () => {
    const sides = await guests();
    const [a, b] = await variants();
    await fill(sides, [[a, 2], [b, 1]]);
    await same(sides, 'post', '/api/cart/track-abandonment', (s) => ({ guestEmail: s.email }));
    for (const side of SIDES) Object.assign(sides[side], await recoveryRow(sides[side].cartId, sides[side].email));

    // Padded with white space: Node trims the token.
    const out = await recover(sides, (s) => `%20${s.token}%0A`);
    expect(out.node.body.keyValueTable.redirectTo).toBe('/checkout');
    expect(out.node.body.keyValueTable.items).toHaveLength(2);
    for (const side of SIDES) {
      expect(await recoveryState(sides[side].id)).toEqual({ recovered: true, recovery_order_id: null, email_sent_count: 0 });
    }
    expect((await expectSameMails(sides)).map((m) => m.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);

    // Already recovered: the row is left alone and new reminders stay pending.
    await same(sides, 'post', '/api/cart/track-abandonment', (s) => ({ guestEmail: s.email }));
    const at = {};
    for (const side of SIDES) at[side] = (await first('SELECT recovered_at FROM abandoned_cart_recovery WHERE id = ?', [sides[side].id])).recovered_at;
    await recover(sides, (s) => s.token);
    for (const side of SIDES) {
      expect((await first('SELECT recovered_at FROM abandoned_cart_recovery WHERE id = ?', [sides[side].id])).recovered_at).toEqual(at[side]);
    }
    expect((await expectSameMails(sides)).map((m) => m.status)).toEqual(
      ['cancelled', 'cancelled', 'cancelled', 'pending', 'pending', 'pending']);
  });

  test('an emptied cart sends the shopper to /cart', async () => {
    const sides = await guests();
    for (const side of SIDES) Object.assign(sides[side], await recoveryRow(sides[side].cartId, sides[side].email));
    const out = await recover(sides, (s) => s.token);
    expect(out.node.body.keyValueTable).toEqual(expect.objectContaining({ items: [], itemCount: 0, redirectTo: '/cart' }));
  });
});
