// Node ↔ Rust parity for the auth half of /api/users (rust/crates/api/src/routes/
// users_auth.rs): register, login (incl. the guest-cart merge and its cookies),
// refresh, session, csrf-token, forgot/reset password and verify-email. Same
// status + JSON, same Set-Cookie, same rows written. Mutating cases run on both
// sides with their own users/fixtures. The rate-limit suite at the bottom
// spawns a production-mode Node server and Rust API.
//
//   RUST_API_URL=http://127.0.0.1:7031 DB_HOST=127.0.0.1 DB_PORT=3307 \
//     DB_PASSWORD=noirae_dev DB_NAME=… npx jest tests/parity-users_auth.test.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app, request, DatabaseUtil, login, registerCustomer } = require('./helpers');
const P = require('./parityHelpers');
const { validateCSRFToken } = require('../middleware/csrfMiddleware');

const { RUST, describeIfRust } = P;
const q = (sql, params) => DatabaseUtil.executeQuery(sql, params);
const first = async (sql, params) => DatabaseUtil.first(await q(sql, params));
const rows = async (sql, params) => DatabaseUtil.rows(await q(sql, params));

const uniqueEmail = (tag) => `test.${Date.now()}${Math.floor(Math.random() * 1e6)}.${tag}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Generated ids, tokens and times.
const norm = P.normalizer([
  [/USER\d{10}/g, 'USER*'],
  [/REFRESH\d{10}/g, 'REFRESH*'],
  [/test\.\d+\.[a-z0-9]+@example\.com/g, 'EMAIL'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'JWT'],
  [/\b[0-9a-f]{128}\b/g, 'HEX128'],
  [/\b[0-9a-f]{64}\b/g, 'HEX64'],
  [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'],
]);

/**
 * One request on one side with a raw or JSON body. `body` (object) is sent as
 * JSON; `raw` as is with `type` (both sides get the same bytes and headers).
 */
async function send(side, method, url, { headers = {}, body, raw, type } = {}) {
  const hdrs = { ...headers };
  let payload;
  if (raw !== undefined) {
    hdrs['Content-Type'] = type;
    payload = raw;
  } else if (body !== undefined) {
    hdrs['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (side === 'node') {
    let req = request(app)[method](url).set(hdrs);
    if (payload !== undefined) req = req.send(payload);
    const res = await req;
    return { status: res.status, body: res.body, headers: res.headers, cookies: P.setCookies(res), res };
  }
  const res = await fetch(RUST + url, { method: method.toUpperCase(), headers: hdrs, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers, cookies: P.setCookies(res), res };
}

/** The same request on both sides; same status and (normalized) JSON. */
async function same(method, url, opts = {}, { fix = (b) => b } = {}) {
  const node = await send('node', method, url, opts.node ?? opts);
  const rust = await send('rust', method, url, opts.rust ?? opts);
  const label = `${method.toUpperCase()} ${url} ${JSON.stringify(opts.body ?? opts.raw ?? '')}`;
  expect({ label, status: rust.status, body: fix(norm(rust.body)) })
    .toEqual({ label, status: node.status, body: fix(norm(node.body)) });
  return { node, rust };
}

/** Same Set-Cookie headers, with JWT / random values compared by kind. */
function expectSameCookies(node, rust) {
  const view = (r) => ({
    headers: {
      'set-cookie': r.cookies.map((c) => c
        .replace(/^(admin_auth=)eyJ[A-Za-z0-9_.-]+/, '$1JWT')
        .replace(/^(csrf_token=)[A-Za-z0-9%]+/, '$1TOKEN')),
    },
  });
  P.expectSameSetCookies(view(node), view(rust));
}

/** Decoded access-token payload without the clock fields (checked separately). */
function tokenClaims(token) {
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  const { iat, exp, ...rest } = claims;
  return { ...rest, ttl: exp - iat, keys: Object.keys(claims) };
}

const variants = async () => rows(
  `SELECT pv.id AS variant_id, pv.product_id FROM product_variants pv
   JOIN products p ON p.id = pv.product_id ORDER BY pv.id LIMIT 3`);

async function newId(prefix) {
  return (await first('SELECT get_next_id(?) AS id', [prefix])).id;
}

/** A guest cart on a fresh session id with these lines; returns the id. */
async function guestCart(lines, sessionId = crypto.randomBytes(16).toString('hex')) {
  const cartId = await newId('CART');
  await q('INSERT INTO shopping_carts (id, session_id) VALUES (?, ?)', [cartId, sessionId]);
  for (const l of lines) {
    await q('INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
      [await newId('CARTITEM'), cartId, l.product_id, l.variant_id, l.quantity, l.price]);
  }
  return sessionId;
}

async function userCart(userId, lines) {
  const cartId = await newId('CART');
  await q('INSERT INTO shopping_carts (id, user_id) VALUES (?, ?)', [cartId, userId]);
  for (const l of lines) {
    await q('INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
      [await newId('CARTITEM'), cartId, l.product_id, l.variant_id, l.quantity, l.price]);
  }
}

/** What a user's carts hold, id-free. */
async function cartState(userId, sessionId) {
  const carts = await rows('SELECT id FROM shopping_carts WHERE user_id = ?', [userId]);
  const lines = await rows(
    `SELECT ci.product_id, ci.variant_id, ci.bundle_id, ci.quantity, CAST(ci.price AS CHAR) AS price
     FROM cart_items ci JOIN shopping_carts c ON c.id = ci.cart_id WHERE c.user_id = ?
     ORDER BY ci.product_id, ci.variant_id, ci.id`, [userId]);
  const guest = await rows('SELECT id FROM shopping_carts WHERE session_id = ?', [sessionId]);
  return { carts: carts.length, lines, guestCarts: guest.length };
}

async function waitForRows(sql, params, n, ms = 5000) {
  const until = Date.now() + ms;
  let found = [];
  while (Date.now() < until) {
    found = await rows(sql, params);
    if (found.length >= n) return found;
    await sleep(100);
  }
  return found;
}

async function emailRows(email) {
  const found = await waitForRows(
    `SELECT q.to_email, q.to_name, q.subject, q.email_content, q.template_id, q.template_data, q.status,
            q.attempts, q.max_attempts, t.name AS template, q.scheduled_at
     FROM email_queue q LEFT JOIN email_templates t ON t.id = q.template_id
     WHERE q.to_email = ? ORDER BY t.name`, [email], 1);
  return found.map((r) => {
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      ...r,
      email_content: parse(r.email_content),
      template_data: parse(r.template_data),
      scheduled_at: Math.abs(new Date(r.scheduled_at) - Date.now()) < 60000,
    };
  });
}

describeIfRust('users auth: register', () => {
  const valid = () => ({ email: uniqueEmail('r'), password: 'Tester@1234', firstName: 'Ada', lastName: 'Lovelace' });

  test('validation branches and non-string inputs', async () => {
    const base = { email: 'someone.new@example.com', password: 'Tester@1234', firstName: 'Ada', lastName: 'Byron' };
    await same('post', '/api/users/register', { body: {} });
    for (const field of ['email', 'password', 'firstName', 'lastName']) {
      for (const value of [undefined, '', 0, 1, true, null, ['a@b.co'], { x: 1 }]) {
        await same('post', '/api/users/register', { body: { ...base, [field]: value } });
      }
    }
    for (const password of ['short1A', 'alllower1', 'ALLUPPER1', 'NoDigitsHere', 'ÄÖÜäöü12', 'Aa1']) {
      await same('post', '/api/users/register', { body: { ...base, email: uniqueEmail('weak'), password } });
    }
    for (const email of ['plain', 'a@b', 'a@b.', '@b.co', 'a b@c.co', 'a@b@c.co', 'a@.b', 'a@b.c\u00a0', 'a@b.c\ufeff']) {
      await same('post', '/api/users/register', { body: { ...base, email } });
    }
    const long = 'x'.repeat(51);
    await same('post', '/api/users/register', { body: { ...base, email: uniqueEmail('l'), firstName: long } });
    await same('post', '/api/users/register', { body: { ...base, email: uniqueEmail('l'), lastName: long } });
    // 26 emoji = 52 UTF-16 units: too long in JS though only 26 characters.
    await same('post', '/api/users/register', { body: { ...base, email: uniqueEmail('l'), firstName: '😀'.repeat(26) } });
    // Taken (the email column's collation is case-insensitive).
    await same('post', '/api/users/register', { body: { ...base, email: 'admin@example.com' } });
    await same('post', '/api/users/register', { body: { ...base, email: 'ADMIN@example.com' } });
  });

  test('bodies: JSON arrays, forms, other types, malformed JSON', async () => {
    await same('post', '/api/users/register', { raw: '[1,2]', type: 'application/json' });
    await same('post', '/api/users/register', { raw: 'email=a%40b.co&password[]=x&firstName=A&lastName=B', type: 'application/x-www-form-urlencoded' });
    await same('post', '/api/users/register', { raw: 'email=admin%40example.com&password=Tester%401234&firstName=A&lastName=B', type: 'application/x-www-form-urlencoded' });
    await same('post', '/api/users/register', { raw: JSON.stringify(valid()), type: 'text/plain' });
    await same('post', '/api/users/register', { raw: JSON.stringify(valid()), type: 'text/json' });
    // express.json() rejects these; the app's error handler answers 500. The
    // V8 SyntaxError text (shown outside production) is not reproduced.
    const noError = (b) => ({ ...b, keyValueTable: { ...b.keyValueTable, error: 'ERR' } });
    await same('post', '/api/users/register', { raw: '{"email":', type: 'application/json' }, { fix: noError });
    await same('post', '/api/users/register', { raw: '"just a string"', type: 'application/json' }, { fix: noError });
    await same('post', '/api/users/register', { raw: '{}', type: 'application/json; charset=latin1' });
    await same('post', '/api/users/register', { raw: JSON.stringify({ pad: 'x'.repeat(110 * 1024) }), type: 'application/json' });
    // Form-body parser errors: charset, size, parameter count, nesting depth.
    const form = 'application/x-www-form-urlencoded';
    await same('post', '/api/users/register', { raw: 'email=a', type: `${form}; charset=latin1` });
    await same('post', '/api/users/register', { raw: `pad=${'x'.repeat(110 * 1024)}`, type: form });
    await same('post', '/api/users/register', { raw: 'a=1&'.repeat(1000) + 'a=1', type: form });
    await same('post', '/api/users/register', { raw: 'a=1&'.repeat(999) + 'a=1', type: form });
    await same('post', '/api/users/register', { raw: `email${'[a]'.repeat(33)}=x`, type: form });
    await same('post', '/api/users/register', { raw: `email${'[a]'.repeat(32)}=x`, type: form });
  });

  test('success: same answer, same users row, same queued emails', async () => {
    const n = valid();
    const r = valid();
    const node = await send('node', 'post', '/api/users/register', { body: n });
    const rust = await send('rust', 'post', '/api/users/register', { body: r });
    expect(rust.status).toBe(201);
    expect({ status: rust.status, body: norm(rust.body) }).toEqual({ status: node.status, body: norm(node.body) });

    const user = async (email) => {
      const u = await first('SELECT * FROM users WHERE email = ?', [email]);
      return u;
    };
    const [un, ur] = [await user(n.email), await user(r.email)];
    expect(ur.id).toBe(rust.body.keyValueTable.userId);
    for (const [u, pw] of [[un, n.password], [ur, r.password]]) {
      expect(u.password_hash).toMatch(/^\$2b\$10\$/);
      expect(bcrypt.compareSync(pw, u.password_hash)).toBe(true);
      expect(u.email_verification_token).toMatch(/^[0-9a-f]{64}$/);
    }
    const view = (u) => norm({
      ...u,
      password_hash: 'HASH',
      created_at: Math.abs(new Date(u.created_at) - Date.now()) < 60000,
      updated_at: Math.abs(new Date(u.updated_at) - Date.now()) < 60000,
    });
    expect(view(ur)).toEqual(view(un));

    const [en, er] = [await waitForRows('SELECT id FROM email_queue WHERE to_email = ?', [n.email], 2),
      await waitForRows('SELECT id FROM email_queue WHERE to_email = ?', [r.email], 2)];
    expect(er.length).toBe(2);
    expect(en.length).toBe(2);
    const mails = async (email, token) => (await emailRows(email)).map((m) => norm(JSON.parse(JSON.stringify(m).split(token).join('TOKEN'))));
    const [mn, mr] = [await mails(n.email, un.email_verification_token), await mails(r.email, ur.email_verification_token)];
    expect(mr).toEqual(mn);
    expect(mr.map((m) => m.template)).toEqual(['email_verification', 'welcome_user']);
    expect(mr[0].template_data.verify_link).toMatch(/\/verify-email\?token=TOKEN$/);
  });
});

describeIfRust('users auth: login', () => {
  test('validation, unknown users, wrong passwords, inactive accounts', async () => {
    await same('post', '/api/users/login', { body: {} });
    for (const email of [undefined, '', 0, 1, true, null, ['admin@example.com'], { a: 1 }]) {
      await same('post', '/api/users/login', { body: { email, password: 'Admin@123' } });
      await same('post', '/api/users/login', { body: { email: 'admin@example.com', password: email } });
    }
    await same('post', '/api/users/login', { body: { email: 'nobody.here@example.com', password: 'Admin@123' } });
    await same('post', '/api/users/login', { body: { email: 'admin@example.com', password: 'wrong' } });
    await same('post', '/api/users/login', { body: { email: 'admin@example.com', password: 'Admin@123'.repeat(20) } });
    const inactive = await registerCustomer();
    const suspended = await registerCustomer();
    await q("UPDATE users SET status = 'inactive' WHERE id = ?", [inactive.userId]);
    await q("UPDATE users SET status = 'suspended' WHERE id = ?", [suspended.userId]);
    await same('post', '/api/users/login', { body: { email: inactive.email, password: inactive.password } });
    await same('post', '/api/users/login', { body: { email: suspended.email, password: suspended.password } });
    await same('post', '/api/users/login', { raw: 'email=admin%40example.com&password=wrong', type: 'application/x-www-form-urlencoded' });
    await same('post', '/api/users/login', { raw: 'email[]=admin%40example.com&password=Admin%40123', type: 'application/x-www-form-urlencoded' });
  });

  test('customer, staff and admin: same tokens, cookies and refresh rows', async () => {
    for (const who of [
      { email: 'alice.customer@example.com', password: 'Customer@123' },
      { email: 'staff@example.com', password: 'Staff@123' },
      { email: 'admin@example.com', password: 'Admin@123' },
      // Different case, same account: the answer carries the stored email.
      { email: 'ADMIN@EXAMPLE.COM', password: 'Admin@123' },
    ]) {
      const { node, rust } = await same('post', '/api/users/login', { body: who });
      expect(rust.status).toBe(200);
      expectSameCookies(node, rust);
      const [kn, kr] = [node.body.keyValueTable, rust.body.keyValueTable];
      expect(tokenClaims(kr.accessToken)).toEqual(tokenClaims(kn.accessToken));
      expect(kr.refreshToken).toMatch(/^[0-9a-f]{128}$/);
      const stored = async (raw) => first('SELECT id, user_id, token_hash, expiry FROM refresh_tokens WHERE token_hash = ?',
        [crypto.createHash('sha256').update(raw).digest('hex')]);
      const [sn, sr] = [await stored(kn.refreshToken), await stored(kr.refreshToken)];
      expect(sr.id).toMatch(/^REFRESH\d{10}$/);
      expect(sr.user_id).toBe(sn.user_id);
      expect(Math.abs(new Date(sr.expiry) - new Date(sn.expiry))).toBeLessThan(5000);
      expect(Math.abs(new Date(sr.expiry) - (Date.now() + 7 * 864e5))).toBeLessThan(60000);
    }
  });

  test('guest cart merge: into an existing cart, into a new cart, cookie shapes', async () => {
    const [a, b, c] = await variants();
    const noVariant = { product_id: c.product_id, variant_id: null };
    const guestLines = [
      { ...a, quantity: 2, price: '10.50' },
      { ...b, quantity: 1, price: '99.99' },
      { ...noVariant, quantity: 3, price: '5.00' },
    ];
    // Per side: a user with a cart holding line `a` (quantities add up), and a
    // user without a cart (one is created).
    for (const withCart of [true, false]) {
      for (const cookie of [(s) => `sessionId=${s}`, (s) => `x=1; sessionId=j:"${s}"`]) {
        const users = { node: await registerCustomer(), rust: await registerCustomer() };
        const sessions = {};
        for (const side of ['node', 'rust']) {
          if (withCart) await userCart(users[side].userId, [{ ...a, quantity: 1, price: '10.00' }, { ...noVariant, quantity: 1, price: '4.00' }]);
          sessions[side] = await guestCart(guestLines);
        }
        const res = {};
        for (const side of ['node', 'rust']) {
          res[side] = await send(side, 'post', '/api/users/login', {
            headers: { Cookie: cookie(sessions[side]) },
            body: { email: users[side].email, password: users[side].password },
          });
        }
        const view = (r) => ({ status: r.status, body: norm(r.body) });
        expect(view(res.rust)).toEqual(view(res.node));
        expectSameCookies(res.node, res.rust);
        expect(res.rust.cookies).toEqual(['sessionId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT']);
        const [cn, cr] = [await cartState(users.node.userId, sessions.node), await cartState(users.rust.userId, sessions.rust)];
        expect(cr).toEqual(cn);
        expect(cr.guestCarts).toBe(0);
        expect(cr.lines.length).toBe(3);
      }
    }
  });

  test('no merge for odd session cookies or back-office logins; cookie still cleared', async () => {
    const [a] = await variants();
    for (const cookie of ['sessionId=j:1', 'sessionId=abc', 'sessionId=', 'other=1', 'sessionId=j:{"a":1}']) {
      const users = { node: await registerCustomer(), rust: await registerCustomer() };
      const res = {};
      for (const side of ['node', 'rust']) {
        res[side] = await send(side, 'post', '/api/users/login', {
          headers: { Cookie: cookie }, body: { email: users[side].email, password: users[side].password },
        });
      }
      expect({ status: res.rust.status, body: norm(res.rust.body) }).toEqual({ status: res.node.status, body: norm(res.node.body) });
      expectSameCookies(res.node, res.rust);
      expect(await cartState(users.rust.userId, 'none')).toEqual(await cartState(users.node.userId, 'none'));
    }
    // Staff with a guest cart: admin_auth + cleared sessionId, the guest cart is untouched.
    const sessions = { node: await guestCart([{ ...a, quantity: 1, price: '1.00' }]), rust: await guestCart([{ ...a, quantity: 1, price: '1.00' }]) };
    const res = {};
    for (const side of ['node', 'rust']) {
      res[side] = await send(side, 'post', '/api/users/login', {
        headers: { Cookie: `sessionId=${sessions[side]}` }, body: { email: 'staff@example.com', password: 'Staff@123' },
      });
    }
    expectSameCookies(res.node, res.rust);
    expect(res.rust.cookies.length).toBe(2);
    for (const side of ['node', 'rust']) {
      expect((await rows('SELECT id FROM shopping_carts WHERE session_id = ? AND user_id IS NULL', [sessions[side]])).length).toBe(1);
    }
  });
});

describeIfRust('users auth: refresh and session', () => {
  test('refresh: validation, unknown, expired, inactive, success', async () => {
    await same('post', '/api/users/refresh', { body: {} });
    for (const refreshToken of ['', 0, 1, true, null, ['x'], { a: 1 }, 'not-a-token', 'f'.repeat(128)]) {
      await same('post', '/api/users/refresh', { body: { refreshToken } });
    }
    const user = await registerCustomer();
    const { node, rust } = await same('post', '/api/users/refresh', { body: { refreshToken: user.refreshToken } });
    expect(rust.status).toBe(200);
    expect(tokenClaims(rust.body.keyValueTable.accessToken)).toEqual(tokenClaims(node.body.keyValueTable.accessToken));
    // A role change is picked up from the DB (tv bumps with it in Node's admin route).
    await q("UPDATE users SET role = 'staff', token_version = token_version + 1 WHERE id = ?", [user.userId]);
    const after = await same('post', '/api/users/refresh', { body: { refreshToken: user.refreshToken } });
    expect(tokenClaims(after.rust.body.keyValueTable.accessToken)).toMatchObject({ isStaff: true, tv: 1 });
    await q("UPDATE users SET status = 'inactive' WHERE id = ?", [user.userId]);
    await same('post', '/api/users/refresh', { body: { refreshToken: user.refreshToken } });
    const other = await registerCustomer();
    await q('UPDATE refresh_tokens SET expiry = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [other.userId]);
    await same('post', '/api/users/refresh', { body: { refreshToken: other.refreshToken } });
  });

  test('session: anonymous, bad tokens, customer, staff and admin (header or cookie)', async () => {
    await same('get', '/api/users/session');
    await same('get', '/api/users/session', { headers: { Authorization: 'Bearer nope' } });
    await same('get', '/api/users/session', { headers: { Authorization: 'Bearer ' } });
    await same('get', '/api/users/session', { headers: { Cookie: 'admin_auth=garbage' } });
    for (const who of ['customer', 'staff', 'admin']) {
      const { accessToken } = await login(who);
      const { rust } = await same('get', '/api/users/session', { headers: P.bearer(accessToken) });
      expect(rust.body.keyValueTable.authenticated).toBe(true);
      await same('get', '/api/users/session', { headers: { Cookie: `admin_auth=${accessToken}` } });
    }
    const revoked = await registerCustomer();
    await q('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [revoked.userId]);
    await same('get', '/api/users/session', { headers: P.bearer(revoked.accessToken) });
    // A user with a phone number: the profile columns come back as stored.
    const phoned = await registerCustomer();
    await q("UPDATE users SET phone = '+1 555 0100' WHERE id = ?", [phoned.userId]);
    await same('get', '/api/users/session', { headers: P.bearer(phoned.accessToken) });
  });
});

describeIfRust('users auth: csrf-token', () => {
  test('401 / 403 exactly like protect + staffOrAdmin', async () => {
    await same('get', '/api/users/csrf-token');
    await same('get', '/api/users/csrf-token', { headers: { Authorization: 'Bearer nope' } });
    const { accessToken } = await login('customer');
    await same('get', '/api/users/csrf-token', { headers: P.bearer(accessToken) });
  });

  test('staff and admin: a token valid for them, the same cookie', async () => {
    for (const who of ['staff', 'admin']) {
      const session = await login(who);
      for (const headers of [P.bearer(session.accessToken), { Cookie: `admin_auth=${session.accessToken}` }]) {
        const { node, rust } = await same('get', '/api/users/csrf-token', { headers },
          { fix: (b) => ({ ...b, keyValueTable: { ...b.keyValueTable, csrfToken: 'TOKEN' } }) });
        expect(rust.status).toBe(200);
        expectSameCookies(node, rust);
        const token = rust.body.keyValueTable.csrfToken;
        expect(validateCSRFToken(token, { id: session.userId })).toBe(true);
        expect(validateCSRFToken(token, { id: 'USER0000000003' })).toBe(false);
        expect(decodeURIComponent(P.parseSetCookie(rust.cookies[0]).value)).toBe(token);
        expect(Math.abs(Date.parse(rust.body.keyValueTable.expires) - Date.parse(node.body.keyValueTable.expires))).toBeLessThan(2000);
      }
    }
  });
});

describeIfRust('users auth: forgot and reset password', () => {
  const resetToken = async (email) => {
    const [mail] = (await emailRows(email)).filter((m) => m.template === 'password_reset');
    return mail.template_data.reset_link.split('token=')[1];
  };

  test('forgot: validation, unknown email, known email (stored hash, queued email)', async () => {
    await same('post', '/api/users/forgot-password', { body: {} });
    for (const email of ['', 0, 1, true, null, ['a@b.co'], { a: 1 }]) {
      await same('post', '/api/users/forgot-password', { body: { email } });
    }
    await same('post', '/api/users/forgot-password', { body: { email: 'nobody.here@example.com' } });
    await same('post', '/api/users/forgot-password', { raw: 'email[a]=b', type: 'application/x-www-form-urlencoded' });

    const users = { node: await registerCustomer(), rust: await registerCustomer() };
    const res = {};
    for (const side of ['node', 'rust']) {
      res[side] = await send(side, 'post', '/api/users/forgot-password', { body: { email: users[side].email } });
    }
    expect({ status: res.rust.status, body: res.rust.body }).toEqual({ status: res.node.status, body: res.node.body });
    const state = async (u) => {
      const row = await first('SELECT password_reset_token, password_reset_expires FROM users WHERE id = ?', [u.userId]);
      const raw = await resetToken(u.email);
      expect(row.password_reset_token).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
      const mails = (await emailRows(u.email)).filter((m) => m.template === 'password_reset');
      return {
        expiresInAnHour: Math.abs(new Date(row.password_reset_expires) - (Date.now() + 3600e3)) < 60000,
        mails: mails.map((m) => norm(JSON.parse(JSON.stringify(m).split(raw).join('TOKEN')))),
      };
    };
    expect(await state(users.rust)).toEqual(await state(users.node));
  });

  test('reset: validation, bad and expired tokens, success revokes sessions, single use', async () => {
    await same('post', '/api/users/reset-password', { body: {} });
    for (const v of ['', 0, true, null, ['x'], { a: 1 }]) {
      await same('post', '/api/users/reset-password', { body: { token: v, newPassword: 'Newpass@123' } });
      await same('post', '/api/users/reset-password', { body: { token: 'abc', newPassword: v } });
    }
    for (const newPassword of ['short1A', 'alllower1', 'ALLUPPER1', 'NoDigitsHere']) {
      await same('post', '/api/users/reset-password', { body: { token: 'abc', newPassword } });
    }
    await same('post', '/api/users/reset-password', { body: { token: 'f'.repeat(64), newPassword: 'Newpass@123' } });

    const users = { node: await registerCustomer(), rust: await registerCustomer() };
    for (const side of ['node', 'rust']) {
      // Use Node for the forgot step on both, so only the reset differs.
      await send('node', 'post', '/api/users/forgot-password', { body: { email: users[side].email } });
      users[side].token = await resetToken(users[side].email);
    }
    const res = {};
    for (const side of ['node', 'rust']) {
      res[side] = await send(side, 'post', '/api/users/reset-password', { body: { token: users[side].token, newPassword: 'Changed@456' } });
    }
    expect({ status: res.rust.status, body: res.rust.body }).toEqual({ status: res.node.status, body: res.node.body });
    expect(res.rust.status).toBe(200);
    const after = async (u) => {
      const row = await first('SELECT password_hash, password_reset_token, password_reset_expires, token_version FROM users WHERE id = ?', [u.userId]);
      const refresh = await rows('SELECT id FROM refresh_tokens WHERE user_id = ?', [u.userId]);
      return {
        newPassword: bcrypt.compareSync('Changed@456', row.password_hash),
        prefix: row.password_hash.slice(0, 7),
        token: row.password_reset_token,
        expires: row.password_reset_expires,
        tv: row.token_version,
        refreshTokens: refresh.length,
      };
    };
    expect(await after(users.rust)).toEqual(await after(users.node));
    // Single use, and the old session is revoked.
    for (const side of ['node', 'rust']) {
      res[side] = await send(side, 'post', '/api/users/reset-password', { body: { token: users[side].token, newPassword: 'Again@7890' } });
    }
    expect(res.rust.body).toEqual(res.node.body);
    expect(res.rust.status).toBe(400);
    await same('get', '/api/users/session', { node: { headers: P.bearer(users.node.accessToken) }, rust: { headers: P.bearer(users.rust.accessToken) } });

    // An expired reset token.
    const late = { node: await registerCustomer(), rust: await registerCustomer() };
    for (const side of ['node', 'rust']) {
      await send('node', 'post', '/api/users/forgot-password', { body: { email: late[side].email } });
      late[side].token = await resetToken(late[side].email);
      await q('UPDATE users SET password_reset_expires = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [late[side].userId]);
    }
    for (const side of ['node', 'rust']) {
      res[side] = await send(side, 'post', '/api/users/reset-password', { body: { token: late[side].token, newPassword: 'Changed@456' } });
    }
    expect({ status: res.rust.status, body: res.rust.body }).toEqual({ status: res.node.status, body: res.node.body });
  });
});

describeIfRust('users auth: verify-email', () => {
  test('missing, empty, non-string (qs) and unknown tokens', async () => {
    for (const qstr of ['', '?', '?token', '?token=', '?token=a&token=b', '?token[]=a', '?token[x]=a', '?token%5Bx%5D=a',
      '?token[=a', '?[token]=nope', '?[token][x]=a', '?token=nope&[token]=', '?token=a&[token]=b', '?token=&token=a',
      '?toke%6E=nope', '?token=%E0%A4%A', '?token=a+b', '?other=1']) {
      await same('get', `/api/users/verify-email${qstr}`);
    }
  });

  test('a real token verifies once', async () => {
    const users = { node: await registerCustomer(), rust: await registerCustomer() };
    const tokens = {};
    for (const side of ['node', 'rust']) {
      tokens[side] = (await first('SELECT email_verification_token AS t FROM users WHERE id = ?', [users[side].userId])).t;
    }
    for (let i = 0; i < 2; i += 1) {
      const res = {};
      for (const side of ['node', 'rust']) res[side] = await send(side, 'get', `/api/users/verify-email?token=${tokens[side]}`);
      expect({ status: res.rust.status, body: norm(res.rust.body) }).toEqual({ status: res.node.status, body: norm(res.node.body) });
      expect(res.rust.status).toBe(i === 0 ? 200 : 400);
    }
    const state = async (u) => first('SELECT email_verified, email_verification_token FROM users WHERE id = ?', [u.userId]);
    expect(await state(users.rust)).toEqual(await state(users.node));
    expect(await state(users.rust)).toEqual({ email_verified: 1, email_verification_token: null });
    // `[token]=` is `token` to qs.
    const other = { node: await registerCustomer(), rust: await registerCustomer() };
    for (const side of ['node', 'rust']) {
      const t = (await first('SELECT email_verification_token AS t FROM users WHERE id = ?', [other[side].userId])).t;
      const r = await send(side, 'get', `/api/users/verify-email?%5Btoken%5D=${t}`);
      expect(r.status).toBe(200);
    }
  });
});

describeIfRust('users auth: other methods on these paths are the app 404', () => {
  test('same 404 body as backend/server.js', async () => {
    const fix = (b) => b;
    for (const [method, url] of [
      ['get', '/api/users/login'], ['put', '/api/users/register'], ['get', '/api/users/refresh?x=1'],
      ['post', '/api/users/session'], ['delete', '/api/users/csrf-token'], ['get', '/api/users/forgot-password'],
      ['patch', '/api/users/reset-password'], ['post', '/api/users/verify-email?token=a'],
    ]) {
      await same(method, url, {}, { fix });
    }
  });
});

// Route limiters: a production-mode Node server and Rust API with one trusted
// proxy hop and a small login limit, the same requests from the same clients.
const describeIfLimiter = RUST && P.rustBin() ? describe : describe.skip;

describeIfLimiter('users auth: route rate limiters match when enabled', () => {
  const env = { NODE_ENV: 'production', TRUST_PROXY: '1', LOGIN_RATE_LIMIT_MAX: '2', RATE_LIMIT_MAX_REQUESTS: '1000' };
  let node; let rust;

  beforeAll(async () => {
    [node, rust] = await Promise.all([
      P.startNode({ port: Number(process.env.PARITY_USERS_NODE_PORT || 7136), env }),
      P.startRust({ port: Number(process.env.PARITY_USERS_RUST_PORT || 7135), env }),
    ]);
  }, 60000);

  afterAll(async () => {
    await Promise.all([node?.stop(), rust?.stop()]);
  });

  const hit = async (base, method, url, xff, { body, raw, type } = {}) => {
    const headers = { 'X-Forwarded-For': xff };
    let payload;
    if (raw !== undefined) { headers['Content-Type'] = type; payload = raw; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    return { status: res.status, headers: res.headers, text: await res.text(), cookies: P.setCookies(res) };
  };
  const pair = async (method, url, xff, opts, label) => {
    const [n, r] = [await hit(node.url, method, url, xff, opts), await hit(rust.url, method, url, xff, opts)];
    const clean = (x) => ({ ...x, text: x.status === 429 ? x.text : JSON.stringify(norm(JSON.parse(x.text))) });
    P.expectSameRateLimit(clean(n), clean(r), `${label}: ${method} ${url}`);
    return { node: n, rust: r };
  };
  const client = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

  test.each([
    ['login', 'POST', '/api/users/login', 2, { body: { email: 'nobody@example.com', password: 'x' } }],
    ['register', 'POST', '/api/users/register', 5, { body: {} }],
    ['refresh', 'POST', '/api/users/refresh', 10, { body: {} }],
    ['forgot-password', 'POST', '/api/users/forgot-password', 3, { body: {} }],
    ['verify-email', 'GET', '/api/users/verify-email', 10, {}],
  ])('%s: counts, headers and the 429', async (name, method, url, limit, opts) => {
    const xff = client();
    // A body express.json() rejects never reaches a route limiter.
    if (method === 'POST') {
      const bad = await pair(method, url, xff, { raw: '{bad', type: 'application/json' }, 'rejected body');
      expect(bad.node.status).toBe(500);
      expect(JSON.parse(bad.rust.text).keyValueTable.error).toBe('Internal server error');
    }
    for (let i = 1; i <= limit; i += 1) {
      const { node: n } = await pair(method, url, xff, opts, `request ${i}`);
      expect(n.status).not.toBe(429);
      expect(n.headers.get('x-ratelimit-remaining')).toBe(String(limit - i));
    }
    const limited = await pair(method, url, xff, opts, 'over the limit');
    expect(limited.node.status).toBe(429);
    // Another method on the path is not counted by the route limiter.
    await pair(method === 'GET' ? 'POST' : 'GET', url, xff, {}, 'other method');
    // Another client has its own bucket.
    const other = await pair(method, url, client().replace('203.0.113', '192.0.2'), opts, 'other client');
    expect(other.node.status).not.toBe(429);
  });

  test('reset-password has no route limiter', async () => {
    const xff = client();
    for (let i = 0; i < 6; i += 1) {
      const { node: n } = await pair('POST', '/api/users/reset-password', xff, { body: {} }, `reset ${i}`);
      expect(n.status).toBe(400);
    }
  });

  test('production cookies: admin_auth is Secure', async () => {
    const xff = client();
    const res = await pair('POST', '/api/users/login', xff, { body: { email: 'admin@example.com', password: 'Admin@123' } }, 'admin login');
    expect(res.node.status).toBe(200);
    expectSameCookies(res.node, res.rust);
    expect(res.rust.cookies[0]).toMatch(/; HttpOnly; Secure; SameSite=Strict$/);
  });
});
