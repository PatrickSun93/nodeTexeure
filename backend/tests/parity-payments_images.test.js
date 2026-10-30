// Node ↔ Rust parity for /api/payments and /api/images
// (rust/crates/api/src/routes/{payments,images}.rs + stripe.rs, s3.rs,
// imaging.rs). Gated on RUST_API_URL like parity.test.js; it starts Rust APIs
// of its own (rust/target/debug/api or RUST_API_BIN), one per Stripe setup:
//
//   none        no STRIPE_SECRET_KEY: API routes 503, the webhook "not configured"
//   placeholder the .env.example key + a webhook secret: API routes 503, the
//               webhook verifies locally signed events and updates orders
//   fake        a test key + both services pointed at one local fake Stripe
//               (Node through a jest.mock of the SDK's host, Rust through
//               STRIPE_API_BASE): every request each side sent is compared
//
//   RUST_API_URL=http://127.0.0.1:7055 DB_HOST=127.0.0.1 DB_PORT=3307 \
//     DB_PASSWORD=noirae_dev DB_NAME=nt_payments_images npx jest tests/parity-payments_images.test.js
//
// Mutations run once per side on that side's own order / product, and the
// rows (and, for images, the files) each side wrote are compared.

// Node's Stripe client follows PARITY_STRIPE_PORT (read when the service
// module constructs it) to the fake Stripe below; without it, the real SDK.
jest.mock('stripe', () => {
  const Real = jest.requireActual('stripe');
  return function Stripe(key, opts) {
    const port = process.env.PARITY_STRIPE_PORT;
    return new Real(key, port ? { ...opts, host: '127.0.0.1', port: Number(port), protocol: 'http' } : opts);
  };
});

// The default app (helpers.app) must load without any Stripe configuration.
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.PARITY_STRIPE_PORT;
for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) delete process.env[k];

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const sharp = require('sharp');
const { app, request, DatabaseUtil, login, bearer } = require('./helpers');
const P = require('./parityHelpers');
const { generateCSRFToken } = require('../middleware/csrfMiddleware');

const describeIf = P.RUST && P.rustBin() ? describe : describe.skip;
const SIDES = ['node', 'rust'];
const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const WEBHOOK_SECRET = 'whsec_parity_payments_images';
const PLACEHOLDER_KEY = 'sk_test_your-stripe-secret-key-here';
const FAKE_KEY = 'sk_test_parity_fake_key';
const UPLOADS = path.join(__dirname, '..', 'uploads');

const q = (sql, params = []) => DatabaseUtil.executeQuery(sql, params);
const rows = async (sql, params) => DatabaseUtil.rows(await q(sql, params));
const parseJson = (text) => {
  try { return JSON.parse(text); } catch { return undefined; }
};

// ---------------------------------------------------------------------------
// The two sides of each setup
// ---------------------------------------------------------------------------

const setups = {}; // name → { app, rust: { url, stop } }
let fakeStripe;
let fakeApp; // the Node app whose Stripe client goes to the fake
const sessions = {};
const created = { orders: [], products: [], files: [] };

/** One request; `raw` is sent verbatim (Buffer/string, Content-Type in headers). */
async function send(setup, side, method, url, { headers = {}, body, raw } = {}) {
  if (side === 'node') {
    let req = request(setups[setup].app)[method](url).set(headers);
    if (raw !== undefined) req = req.send(raw);
    else if (body !== undefined) req = req.send(body);
    const res = await req;
    const text = res.text ?? (Buffer.isBuffer(res.body) ? res.body.toString() : '');
    return { status: res.status, headers: res.headers, text, body: parseJson(text) };
  }
  const res = await fetch(setups[setup].rust.url + url, {
    method: method.toUpperCase(),
    headers: { ...headers, ...(raw === undefined && body !== undefined && { 'Content-Type': 'application/json' }) },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: parseJson(text) };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;

/** Side-specific ids → placeholders, then times and UUIDs. */
function normalizer(ids = {}) {
  const pairs = [];
  for (const side of SIDES) for (const [name, id] of Object.entries(ids[side] || {})) pairs.push([id, name]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (v) => {
    let s = JSON.stringify(v);
    if (s === undefined) return v;
    for (const [id, name] of pairs) s = s.split(id).join(name);
    s = s.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME').replace(UUID, 'UUID');
    return JSON.parse(s);
  };
}

/**
 * The same request on both sides of a setup: same status, same body
 * (JSON normalized, else the text). `url`/`opts` may be functions of the side.
 */
async function same(setup, method, url, opts = {}, ids = {}) {
  const out = {};
  const pick = (v, side) => (typeof v === 'function' ? v(side) : v);
  for (const side of SIDES) out[side] = await send(setup, side, method, pick(url, side), pick(opts, side) || {});
  const fix = normalizer(ids);
  const view = (r) => ({
    label: `${setup}: ${method.toUpperCase()} ${pick(url, 'node')}`,
    status: r.status,
    body: r.body !== undefined ? fix(r.body) : r.text,
  });
  expect(view(out.rust)).toEqual(view(out.node));
  return out;
}

const auth = (who, { csrf = false } = {}) => {
  const s = typeof who === 'string' ? sessions[who] : who;
  if (!s) return {};
  return {
    ...bearer(s.token),
    ...(csrf && { 'X-CSRF-Token': s.csrf, Cookie: `csrf_token=${encodeURIComponent(s.csrf)}` }),
  };
};

async function session(who) {
  const kvt = await login(who);
  const user = { id: kvt.userId, email: kvt.email, role: kvt.role };
  let csrf;
  if (user.role === 'customer') csrf = generateCSRFToken(user);
  else csrf = (await request(app).get('/api/users/csrf-token').set(bearer(kvt.accessToken))).body.keyValueTable.csrfToken;
  return { token: kvt.accessToken, user, csrf };
}

// ---------------------------------------------------------------------------
// Fixtures: orders and products of each side
// ---------------------------------------------------------------------------

let seq = 0;
const hex = () => `${STAMP}${(seq += 1)}`;

/** An order with two items (19.99 × 2, 60.25 × 1), straight into the DB. */
async function makeOrder({ userId = null, guestEmail = null, total = '110.92', tax = '10.69', shipping = '0.00', pi = null, status = 'pending', paymentStatus = 'pending' } = {}) {
  const id = `TPAY-${hex()}`;
  const result = await q(
    `INSERT INTO orders (id, order_number, user_id, guest_email, status, payment_status, subtotal, tax_amount,
       shipping_amount, total_amount, shipping_address_json, billing_address_json, stripe_payment_intent_id)
     VALUES (?, ?, ?, ?, ?, ?, 100.23, ?, ?, ?, '{}', '{}', ?)`,
    [id, `NUM-${id}`, userId, guestEmail, status, paymentStatus, tax, shipping, total, pi]
  );
  if (!result.success) throw new Error(result.error);
  for (const [n, product, name, qty, price] of [[1, 'PROD0000000001', 'Mulberry Silk Pillowcase', 2, '19.99'], [2, 'PROD0000000002', 'Cashmere Throw', 1, '60.25']]) {
    const r = await q(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`${id}-${n}`, id, product, name, `SKU-${n}`, qty, price, price]
    );
    if (!r.success) throw new Error(r.error);
  }
  created.orders.push(id);
  return id;
}

/** One order per side with the same shape: { node, rust }. */
async function orderPair(opts = {}) {
  const pair = {};
  for (const side of SIDES) {
    const o = typeof opts === 'function' ? opts(side) : opts;
    pair[side] = await makeOrder(o);
  }
  return pair;
}

const ids = (pair, name = 'ORDER') => ({ node: { [name]: pair.node }, rust: { [name]: pair.rust } });

async function orderState(id) {
  const row = DatabaseUtil.first(await q(
    `SELECT status, payment_status, paid_at IS NOT NULL AS paid, stripe_payment_intent_id, stripe_session_id
     FROM orders WHERE id = ?`, [id]));
  return row && { ...row, paid: Number(row.paid) };
}

/** Both sides' orders in the same state (`pi_…_node` / `pi_…_rust` ids alike). */
async function expectSameOrders(pair) {
  const view = async (id) => {
    const row = await orderState(id);
    return row && { ...row, stripe_payment_intent_id: row.stripe_payment_intent_id && row.stripe_payment_intent_id.replace(/_(node|rust)$/, '_SIDE') };
  };
  expect(await view(pair.rust)).toEqual(await view(pair.node));
}

/** A copy of PROD0000000001 without images: { node, rust } product ids. */
async function productPair() {
  const pair = {};
  for (const side of SIDES) {
    const id = `TIMG${side[0].toUpperCase()}${hex()}`.slice(0, 50);
    const r = await q(
      `INSERT INTO products (id, sku, name, slug, category_id, base_price, product_details, created_by)
       SELECT ?, ?, name, ?, category_id, base_price, product_details, created_by FROM products WHERE id = 'PROD0000000001'`,
      [id, `SKU-${id}`, `slug-${id.toLowerCase()}`]
    );
    if (!r.success) throw new Error(r.error);
    created.products.push(id);
    pair[side] = id;
  }
  return pair;
}

// ---------------------------------------------------------------------------
// Fake Stripe: answers by `fakeStripe.respond(req, side)`, records per side
// ---------------------------------------------------------------------------

function startFakeStripe() {
  const fake = { requests: { node: [], rust: [] }, counts: { node: 0, rust: 0 }, respond: null };
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      // The Node SDK says NodeBindings; the Rust client its own name.
      const side = /NodeBindings/.test(req.headers['user-agent'] || '') ? 'node' : 'rust';
      const seen = {
        method: req.method,
        path: req.url,
        headers: {
          accept: req.headers.accept,
          authorization: req.headers.authorization,
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
          'stripe-version': req.headers['stripe-version'],
          'idempotency-key': (req.headers['idempotency-key'] || '').replace(UUID, 'UUID') || undefined,
        },
        body,
      };
      fake.requests[side].push(seen);
      fake.counts[side] += 1;
      const answer = (fake.respond && fake.respond(seen, side, fake.counts[side])) || { status: 200, body: { id: 'obj_1' } };
      res.writeHead(answer.status, { 'Content-Type': 'application/json', ...(answer.headers || {}) });
      res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    fake.port = server.address().port;
    fake.close = () => new Promise((r) => server.close(r));
    resolve(fake);
  }));
}

/** Both sides sent the same Stripe requests (side ids normalized). */
function expectSameStripeRequests(pairIds = {}) {
  const fix = normalizer(pairIds);
  expect(fix(fakeStripe.requests.rust)).toEqual(fix(fakeStripe.requests.node));
}

function resetFake(respond = null) {
  fakeStripe.requests = { node: [], rust: [] };
  fakeStripe.counts = { node: 0, rust: 0 };
  fakeStripe.respond = respond;
}

// ---------------------------------------------------------------------------
// Webhook signing
// ---------------------------------------------------------------------------

const sign = (payload, t = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET) =>
  `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex')}`;

/** A signed JSON webhook request for `event` (a function of the side). */
const signed = (event, extra = {}) => (side) => {
  const text = typeof event === 'function' ? JSON.stringify(event(side)) : typeof event === 'string' ? event : JSON.stringify(event);
  return { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(text), ...extra }, raw: text };
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!(P.RUST && P.rustBin())) return;
  fakeStripe = await startFakeStripe();
  // Empty, not absent: the Rust API loads a .env from any parent directory
  // (dotenvy), which never overrides a variable that is set.
  const base = {
    NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
    STRIPE_API_BASE: '', FRONTEND_URL: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', UPLOADS_DIR: '',
  };
  if (process.env.CSRF_SECRET) base.CSRF_SECRET = process.env.CSRF_SECRET;
  const start = async (env) => P.startRust({ port: await P.freePort(), env: { ...base, ...env } });
  setups.none = { app, rust: await start({}) };
  setups.placeholder = { rust: await start({ STRIPE_SECRET_KEY: PLACEHOLDER_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET }) };
  setups.fake = {
    rust: await start({ STRIPE_SECRET_KEY: FAKE_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: `http://127.0.0.1:${fakeStripe.port}`, FRONTEND_URL: 'https://shop.example' }),
  };
  // A second Node app whose Stripe client was built with the fake key and
  // host. stripeService reads the key per call (isAvailable), so the
  // placeholder setup is the same app with the placeholder in the env.
  process.env.STRIPE_SECRET_KEY = FAKE_KEY;
  process.env.PARITY_STRIPE_PORT = String(fakeStripe.port);
  jest.isolateModules(() => { fakeApp = require('../server'); });
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.PARITY_STRIPE_PORT;
  setups.placeholder.app = fakeApp;
  setups.fake.app = fakeApp;
  for (const who of ['admin', 'staff', 'customer']) sessions[who] = await session(who);
  sessions.other = await session({ email: 'bob.customer@example.com', password: 'Customer@123' }).catch(() => null);
}, 120000);

afterAll(async () => {
  for (const s of Object.values(setups)) if (s.rust) await s.rust.stop();
  if (fakeStripe) await fakeStripe.close();
  for (const id of created.orders) {
    await q('DELETE FROM order_items WHERE order_id = ?', [id]);
    await q('DELETE FROM orders WHERE id = ?', [id]);
  }
  for (const id of created.products) {
    await q('DELETE FROM product_images WHERE product_id = ?', [id]);
    await q('DELETE FROM products WHERE id = ?', [id]);
    fs.rmSync(path.join(UPLOADS, 'products', id), { recursive: true, force: true });
  }
  for (const f of created.files) fs.rmSync(f, { force: true });
});

/** Put the env each Node setup reads per call. */
function nodeEnv(setup) {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.FRONTEND_URL;
  if (setup === 'placeholder') {
    process.env.STRIPE_SECRET_KEY = PLACEHOLDER_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  }
  if (setup === 'fake') {
    process.env.STRIPE_SECRET_KEY = FAKE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.FRONTEND_URL = 'https://shop.example';
  }
}

const BAD_IDS = [undefined, '', 123, 0, true, null, ['a'], { id: 'x' }];

// ---------------------------------------------------------------------------
// Routing, parsers, CORS
// ---------------------------------------------------------------------------

describeIf('payments/images routing', () => {
  beforeAll(() => nodeEnv('none'));

  test('paths and methods Node does not route are its 404', async () => {
    for (const [method, url] of [
      ['get', '/api/payments'], ['get', '/api/payments/'], ['post', '/api/payments'], ['get', '/api/payments/webhook'],
      ['put', '/api/payments/refund'], ['get', '/api/payments/session'], ['get', '/api/payments/session/'],
      ['post', '/api/payments/session/cs_1'], ['delete', '/api/payments/refund'], ['get', '/api/payments/nope?x=1&y[]=2'],
      ['get', '/api/payments/session/a/b'], ['patch', '/api/payments/webhook'],
      ['get', '/api/images'], ['get', '/api/images/'], ['get', '/api/images/upload'], ['put', '/api/images/upload'],
      ['post', '/api/images/product'], ['post', '/api/images/product/'], ['get', '/api/images/product/PROD0000000001'],
      ['post', '/api/images/x'], ['delete', '/api/images/a/b'], ['delete', '/api/images'],
    ]) {
      await same('none', method, url);
    }
  });

  test('OPTIONS is the CORS preflight; HEAD runs the GET route', async () => {
    for (const url of ['/api/payments/refund', '/api/payments/nope', '/api/images/upload', '/api/images/x/y']) {
      const r = await same('none', 'options', url);
      expect(r.node.status).toBe(204);
    }
    const head = await same('none', 'head', '/api/payments/session/cs_123');
    expect(head.node.status).toBe(503);
  });

  test('case-insensitive routes, trailing and doubled slashes', async () => {
    await same('none', 'post', '/api/payments/CREATE-CHECKOUT-SESSION/', { body: { orderId: 'x' } });
    await same('none', 'post', '/api/payments//create-payment-intent', { body: {} });
    await same('none', 'get', '/api/payments/Session/cs_1/');
    await same('none', 'post', '/api/images/UPLOAD/');
    await same('none', 'delete', '/api/images//x');
  });

  test('a body the app parsers reject is the 500, before auth or routing', async () => {
    for (const url of ['/api/payments/create-checkout-session', '/api/payments/refund', '/api/payments/nope', '/api/images/upload', '/api/images/x']) {
      for (const [type, raw] of [['application/json', '{bad'], ['application/json', '"str"'], ['application/json; charset=latin1', '{}'], ['application/x-www-form-urlencoded; charset=latin1', 'a=1']]) {
        await same('none', 'post', url, { headers: { 'Content-Type': type }, raw }, {});
      }
    }
    // The webhook path skips express.json() (server.js checks the original URL).
    await same('none', 'post', '/api/payments/webhook', { headers: { 'Content-Type': 'application/json' }, raw: '{bad' });
    await same('none', 'post', '/api/payments/webhook?x=1', { headers: { 'Content-Type': 'application/json' }, raw: '{bad' });
  });

  test('route params that decodeURIComponent rejects are the 500', async () => {
    await same('none', 'get', '/api/payments/session/%E0%A4%A');
    await same('none', 'delete', '/api/images/%E0');
    await same('none', 'post', '/api/images/product/%zz');
  });
});

// ---------------------------------------------------------------------------
// Payments without Stripe (none / placeholder)
// ---------------------------------------------------------------------------

describeIf('payments without a usable Stripe key', () => {
  for (const setup of ['none', 'placeholder']) {
    describe(setup, () => {
      beforeAll(() => nodeEnv(setup));

      test('checkout session / payment intent: validation, then 503', async () => {
        for (const url of ['/api/payments/create-checkout-session', '/api/payments/create-payment-intent']) {
          for (const orderId of BAD_IDS) await same(setup, 'post', url, { body: orderId === undefined ? {} : { orderId } });
          await same(setup, 'post', url);
          await same(setup, 'post', url, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, raw: 'orderId=abc' });
          await same(setup, 'post', url, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, raw: 'orderId[]=abc' });
          for (const who of [undefined, 'customer', 'admin']) await same(setup, 'post', url, { headers: auth(who), body: { orderId: 'nope' } });
          await same(setup, 'post', url, { headers: { Authorization: 'Bearer garbage' }, body: { orderId: 'nope' } });
        }
      });

      test('refund: protect, admin, csrf, validation, then 503', async () => {
        const url = '/api/payments/refund';
        await same(setup, 'post', url, { body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: { Authorization: 'Bearer garbage' }, body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: auth('customer', { csrf: true }), body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: auth('staff', { csrf: true }), body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: auth('admin'), body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: { ...auth('admin'), 'X-CSRF-Token': sessions.admin.csrf }, body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: { ...auth('admin', { csrf: true }), 'X-CSRF-Token': sessions.staff.csrf }, body: { orderId: 'x' } });
        await same(setup, 'post', url, { headers: { ...auth('admin'), 'X-CSRF-Token': 'forged', Cookie: 'csrf_token=forged' }, body: { orderId: 'x' } });
        for (const orderId of BAD_IDS) {
          await same(setup, 'post', url, { headers: auth('admin', { csrf: true }), body: orderId === undefined ? { amount: 5 } : { orderId, amount: 5 } });
        }
        await same(setup, 'post', url, { headers: auth('admin', { csrf: true }), body: { orderId: 'nope', amount: '5' } });
      });

      test('session lookup is 503', async () => {
        for (const who of [undefined, 'customer', 'admin']) await same(setup, 'get', '/api/payments/session/cs_test_1', { headers: auth(who) });
      });
    });
  }

  test('webhook without a key: "Stripe is not configured"', async () => {
    nodeEnv('none');
    await same('none', 'post', '/api/payments/webhook', signed({ type: 'checkout.session.completed' }));
    await same('none', 'post', '/api/payments/webhook');
  });
});

// ---------------------------------------------------------------------------
// Webhook (placeholder key + secret): locally signed events
// ---------------------------------------------------------------------------

describeIf('payments webhook', () => {
  beforeAll(() => nodeEnv('placeholder'));
  const url = '/api/payments/webhook';
  const event = (type, object) => ({ id: `evt_${STAMP}`, type, data: { object } });

  test('signature checks', async () => {
    const body = JSON.stringify(event('payment_intent.succeeded', { id: 'pi_x', metadata: {} }));
    const t = Math.floor(Date.now() / 1000);
    for (const headers of [
      {}, { 'Stripe-Signature': '' }, { 'Stripe-Signature': 'garbage' }, { 'Stripe-Signature': `t=${t}` },
      { 'Stripe-Signature': `t=${t},v0=abc` }, { 'Stripe-Signature': `t=${t},v1=${'0'.repeat(64)}` },
      { 'Stripe-Signature': sign(body, t - 301) }, { 'Stripe-Signature': `t=${t},v1` }, { 'Stripe-Signature': `t=${t},v1=` },
      { 'Stripe-Signature': sign(body, t, 'whsec_other') }, { 'Stripe-Signature': `${sign(body)}, t=1,v1=zz` },
      { 'Stripe-Signature': sign(body).replace(/^t=\d+/, 't=-1') },
    ]) {
      await same('placeholder', 'post', url, { headers: { 'Content-Type': 'application/json', ...headers }, raw: body });
    }
    // A signature over the bytes as sent, with a timestamp in the future.
    await same('placeholder', 'post', url, { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(body, t + 1000) }, raw: body });
  });

  test('bodies the raw parser does not see: parsed objects fail verification', async () => {
    const body = JSON.stringify(event('payment_intent.succeeded', { id: 'pi_x', metadata: {} }));
    await same('placeholder', 'post', url, { headers: { 'Content-Type': 'text/plain', 'Stripe-Signature': sign(body) }, raw: body });
    await same('placeholder', 'post', url, { headers: { 'Stripe-Signature': sign('[object Object]') } });
    await same('placeholder', 'post', url, { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Signature': sign('a=1') }, raw: 'a=1' });
    // express.json() did run here (the original URL isn't /api/payments/webhook…).
    await same('placeholder', 'post', '/api/payments//webhook', { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(body) }, raw: body });
    await same('placeholder', 'post', '/api/payments/WEBHOOK', { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign('[object Object]') }, raw: '{}' });
    // Signed exactly as the SDK signs a parsed object: then JSON.parse fails.
    await same('placeholder', 'post', '/api/payments//webhook', { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign('[object Object]') }, raw: '{"a":1}' });
  });

  test('signed but not an event', async () => {
    for (const text of ['', '{bad', 'null', '42', '"str"', '[]', '{}', '{"type":"checkout.session.completed"}',
      '{"type":"checkout.session.completed","data":null}', '{"type":"checkout.session.completed","data":{}}',
      '{"type":"checkout.session.completed","data":{"object":{"metadata":null}}}',
      '{"type":"payment_intent.succeeded","data":{"object":{"metadata":"x"}}}',
      '{"type":"charge.refunded","data":{}}', '{"type":"charge.refunded","data":{"object":{}}}',
      '{"type":"invoice.paid","data":{"object":{}}}', '{"type":5}', '{"a":1}x']) {
      await same('placeholder', 'post', url, signed(text));
    }
  });

  // supertest re-encodes a Buffer sent with Content-Encoding, so this one
  // talks to a real `node server.js` (same env) over HTTP on both sides.
  test('gzip and deflate bodies are inflated; other encodings are refused', async () => {
    const node = await P.startNode({ port: await P.freePort(), env: { NODE_ENV: 'test', STRIPE_SECRET_KEY: PLACEHOLDER_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    try {
      const post = async (side, { headers, raw }) => {
        const res = await fetch((side === 'node' ? node.url : setups.placeholder.rust.url) + url, { method: 'POST', headers, body: raw });
        const text = await res.text();
        return { status: res.status, body: parseJson(text) ?? text };
      };
      const both = async (opts, pair) => {
        const out = {};
        for (const side of SIDES) out[side] = await post(side, typeof opts === 'function' ? opts(side) : opts);
        const fix = normalizer(pair ? ids(pair) : {});
        expect(fix(out.rust)).toEqual(fix(out.node));
        return out;
      };
      const pair = await orderPair({ guestEmail: 'g@example.com' });
      const text = (side) => JSON.stringify(event('payment_intent.succeeded', { id: `pi_gz_${side}`, amount_received: 11092, metadata: { orderId: pair[side] } }));
      const r = await both((side) => ({
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Stripe-Signature': sign(text(side)) },
        raw: zlib.gzipSync(text(side)),
      }), pair);
      expect(r.node.status).toBe(200);
      await expectSameOrders(pair);
      expect((await orderState(pair.node)).payment_status).toBe('paid');
      await both((side) => ({
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'DEFLATE', 'Stripe-Signature': sign(text(side)) },
        raw: zlib.deflateSync(text(side)),
      }), pair);
      await both({ headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br', 'Stripe-Signature': 't=1,v1=x' }, raw: '{}' });
      await both({ headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=x' }, raw: `{"a":"${'x'.repeat(110 * 1024)}"}` });
      await both({ headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Stripe-Signature': 't=1,v1=x' }, raw: zlib.gzipSync(`{"a":"${'x'.repeat(110 * 1024)}"}`) });
    } finally {
      await node.stop();
    }
  }, 60000);

  test('checkout.session.completed marks the order paid (amount checked)', async () => {
    const pair = await orderPair({ guestEmail: 'g@example.com' });
    const completed = (overrides) => (side) => event('checkout.session.completed', {
      id: `cs_${side}`, amount_total: 11092, payment_intent: `pi_cs_${side}`, metadata: { orderId: pair[side] }, ...overrides(side),
    });
    // Too little paid: unchanged.
    await same('placeholder', 'post', url, signed(completed(() => ({ amount_total: 11091 }))), ids(pair));
    await expectSameOrders(pair);
    await same('placeholder', 'post', url, signed(completed(() => ({ amount_total: '11000' }))), ids(pair));
    await expectSameOrders(pair);
    // No orderId: nothing happens.
    await same('placeholder', 'post', url, signed(completed(() => ({ metadata: {} }))), ids(pair));
    await same('placeholder', 'post', url, signed(completed(() => ({ metadata: { orderId: '' } }))), ids(pair));
    // Unknown order: no amount check, the UPDATE matches nothing.
    await same('placeholder', 'post', url, signed(completed(() => ({ metadata: { orderId: `nope-${STAMP}` } }))));
    expect((await orderState(pair.node)).payment_status).toBe('pending');
    // Paid.
    await same('placeholder', 'post', url, signed(completed(() => ({}))), ids(pair));
    await expectSameOrders(pair);
    const paid = await orderState(pair.node);
    expect(paid).toMatchObject({ status: 'confirmed', payment_status: 'paid', paid: 1 });
    // Again, without a payment_intent: idempotent, the stored one kept.
    await same('placeholder', 'post', url, signed(completed(() => ({ payment_intent: undefined, amount_total: 99999 }))), ids(pair));
    await expectSameOrders(pair);
  });

  test('a write that fails is a non-2xx answer (Stripe retries)', async () => {
    const pair = await orderPair({ guestEmail: 'g@example.com' });
    await same('placeholder', 'post', url, signed((side) => event('checkout.session.completed', {
      amount_total: 11092, payment_intent: `pi_${'x'.repeat(300)}`, metadata: { orderId: pair[side] },
    })), ids(pair));
    await expectSameOrders(pair);
    expect((await orderState(pair.node)).payment_status).toBe('pending');
  });

  test('payment_intent.succeeded', async () => {
    const pair = await orderPair({ guestEmail: 'g@example.com', status: 'processing' });
    await same('placeholder', 'post', url, signed((side) => event('payment_intent.succeeded', {
      id: `pi_ok_${side}`, amount_received: 11092, metadata: { orderId: pair[side], extra: 1 },
    })), ids(pair));
    await expectSameOrders(pair);
    expect(await orderState(pair.node)).toMatchObject({ status: 'processing', payment_status: 'paid', stripe_payment_intent_id: 'pi_ok_node' });
  });

  test('charge.refunded: partial, then full', async () => {
    const pair = await orderPair((side) => ({ guestEmail: 'g@example.com', status: 'confirmed', paymentStatus: 'paid', pi: `pi_ref_${STAMP}_${side}` }));
    const refunded = (amounts) => signed((side) => event('charge.refunded', { payment_intent: `pi_ref_${STAMP}_${side}`, ...amounts }));
    await same('placeholder', 'post', url, refunded({ amount: 11092, amount_refunded: 500 }), ids(pair));
    await expectSameOrders(pair);
    expect((await orderState(pair.node)).payment_status).toBe('partially_refunded');
    await same('placeholder', 'post', url, refunded({ amount: 11092, amount_refunded: 11092 }), ids(pair));
    await expectSameOrders(pair);
    expect(await orderState(pair.node)).toMatchObject({ status: 'refunded', payment_status: 'refunded' });
    // Unknown / missing payment intent: nothing to do.
    await same('placeholder', 'post', url, signed(event('charge.refunded', { payment_intent: 'pi_nobody' })));
    await same('placeholder', 'post', url, signed(event('charge.refunded', { amount: 1 })));
    await same('placeholder', 'post', url, signed(event('charge.refunded', { payment_intent: null })));
  });
});

// ---------------------------------------------------------------------------
// Payments against a fake Stripe
// ---------------------------------------------------------------------------

describeIf('payments with Stripe (fake)', () => {
  beforeAll(() => nodeEnv('fake'));
  afterEach(() => resetFake());

  const sessionObject = (id, extra = {}) => ({ id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}`, ...extra });

  test('checkout session for a guest order: the request Stripe gets, the stored session id', async () => {
    const pair = await orderPair({ guestEmail: 'guest.parity@example.com' });
    resetFake(() => ({ status: 200, body: sessionObject('cs_test_parity') }));
    await same('fake', 'post', '/api/payments/create-checkout-session', (side) => ({ body: { orderId: pair[side] } }), ids(pair));
    expectSameStripeRequests(ids(pair));
    expect(fakeStripe.requests.node).toHaveLength(1);
    expect(fakeStripe.requests.node[0].body).toContain('line_items[0][price_data][unit_amount]=1999');
    await expectSameOrders(pair);
    expect((await orderState(pair.node)).stripe_session_id).toBe('cs_test_parity');
  });

  test('checkout session: ownership, customer email from the token, tax/shipping lines', async () => {
    const owner = sessions.customer;
    const pair = await orderPair({ userId: owner.user.id, tax: '0.00', shipping: '15.50' });
    resetFake(() => ({ status: 200, body: sessionObject('cs_owned') }));
    const go = (who) => same('fake', 'post', '/api/payments/create-checkout-session', (side) => ({ headers: auth(who), body: { orderId: pair[side] } }), ids(pair));
    for (const who of [undefined, 'staff', ...(sessions.other ? ['other'] : [])]) {
      const r = await go(who);
      expect(r.node.status).toBe(403);
    }
    await go('customer');
    await go('admin');
    expectSameStripeRequests(ids(pair));
    expect(fakeStripe.requests.node[0].body).toContain(`customer_email=${encodeURIComponent(owner.user.email)}`);
    await expectSameOrders(pair);
    await same('fake', 'post', '/api/payments/create-checkout-session', { body: { orderId: `nope-${STAMP}` } });
  });

  test('checkout session: Stripe errors and odd answers', async () => {
    const pair = await orderPair({ guestEmail: 'g@example.com' });
    const go = () => same('fake', 'post', '/api/payments/create-checkout-session', (side) => ({ body: { orderId: pair[side] } }), ids(pair));
    for (const answer of [
      { status: 402, body: { error: { type: 'card_error', message: 'Your card was declined.' } } },
      { status: 400, body: { error: 'invalid_grant', error_description: 'Expired.' } },
      { status: 400, body: { error: {} } },
      { status: 200, body: '<html>' },
      { status: 200, body: 'null' },
      { status: 200, body: { object: 'checkout.session' } }, // no id: the UPDATE can't bind undefined
      { status: 200, body: { id: `cs_${'y'.repeat(300)}` } }, // too long for the column
    ]) {
      resetFake(() => answer);
      await go();
      expectSameStripeRequests(ids(pair));
      await expectSameOrders(pair);
    }
  });

  test('a 500 is retried with the same idempotency key', async () => {
    const pair = await orderPair({ guestEmail: 'g@example.com' });
    resetFake((req, side, n) => (n === 1 ? { status: 500, body: { error: { type: 'api_error', message: 'boom' } } } : { status: 200, body: sessionObject('cs_retry') }));
    await same('fake', 'post', '/api/payments/create-checkout-session', (side) => ({ body: { orderId: pair[side] } }), ids(pair));
    expectSameStripeRequests(ids(pair));
    for (const side of SIDES) {
      const [a, b] = fakeStripe.requests[side];
      expect(b.headers['idempotency-key']).toBe(a.headers['idempotency-key']);
    }
    expect(fakeStripe.requests.rust).toHaveLength(2);
  }, 20000);

  test('payment intent', async () => {
    const owner = sessions.customer;
    const pair = await orderPair({ userId: owner.user.id, total: '131.19' });
    resetFake(() => ({ status: 200, body: { id: 'pi_parity', client_secret: 'pi_parity_secret_x', amount: 13119 } }));
    for (const who of [undefined, 'staff']) await same('fake', 'post', '/api/payments/create-payment-intent', (side) => ({ headers: auth(who), body: { orderId: pair[side] } }), ids(pair));
    await same('fake', 'post', '/api/payments/create-payment-intent', (side) => ({ headers: auth('customer'), body: { orderId: pair[side] } }), ids(pair));
    expectSameStripeRequests(ids(pair));
    expect(fakeStripe.requests.node[0].body).toContain('amount=13119');
    await expectSameOrders(pair);
    resetFake(() => ({ status: 400, body: { error: { type: 'invalid_request_error', message: 'Amount must be at least $0.50 usd' } } }));
    await same('fake', 'post', '/api/payments/create-payment-intent', (side) => ({ headers: auth('admin'), body: { orderId: pair[side] } }), ids(pair));
    await same('fake', 'post', '/api/payments/create-payment-intent', { body: { orderId: `nope-${STAMP}` } });
  });

  test('refund: no payment, full and partial refunds, amounts, Stripe errors', async () => {
    const url = '/api/payments/refund';
    const admin = auth('admin', { csrf: true });
    const none = await orderPair({ guestEmail: 'g@example.com' });
    await same('fake', 'post', url, (side) => ({ headers: admin, body: { orderId: none[side] } }), ids(none));
    for (const [amount, refunded] of [[undefined, 11092], [5, 500], ['2.5', 250], [0, 11092], [0.004, 11092], [110.92, 11092], ['abc', 11092]]) {
      const pair = await orderPair((side) => ({ guestEmail: 'g@example.com', status: 'confirmed', paymentStatus: 'paid', pi: `pi_rf_${STAMP}_${side}` }));
      resetFake(() => ({ status: 200, body: { id: 're_parity', amount: refunded, status: 'succeeded' } }));
      await same('fake', 'post', url, (side) => ({ headers: admin, body: amount === undefined ? { orderId: pair[side] } : { orderId: pair[side], amount } }), ids(pair));
      expectSameStripeRequests({ node: { PI: `pi_rf_${STAMP}_node` }, rust: { PI: `pi_rf_${STAMP}_rust` } });
      await expectSameOrders(pair);
    }
    const pair = await orderPair((side) => ({ guestEmail: 'g@example.com', status: 'confirmed', paymentStatus: 'paid', pi: `pi_rf2_${STAMP}_${side}` }));
    for (const answer of [
      { status: 400, body: { error: { type: 'invalid_request_error', message: "Charge ch_1 has already been refunded." } } },
      { status: 200, body: { id: 're_odd' } },
      { status: 200, body: { id: 're_str', amount: '500', status: null } },
    ]) {
      resetFake(() => answer);
      await same('fake', 'post', url, (side) => ({ headers: admin, body: { orderId: pair[side] } }), ids(pair));
      await expectSameOrders(pair);
    }
    await same('fake', 'post', url, { headers: admin, body: { orderId: `nope-${STAMP}` } });
  });

  test('session lookup: guest, owner, others, Stripe errors', async () => {
    const owner = sessions.customer;
    const owned = await makeOrder({ userId: owner.user.id });
    const guest = await makeOrder({ guestEmail: 'g@example.com' });
    const answer = (orderId, extra) => () => ({ status: 200, body: { id: 'cs_look', status: 'complete', payment_status: 'paid', amount_total: 11092, customer_email: 'x@example.com', metadata: { orderId }, ...extra } });
    const look = (who, id = 'cs_look') => same('fake', 'get', `/api/payments/session/${id}`, { headers: auth(who) });
    resetFake(answer(owned));
    for (const who of [undefined, 'staff', 'customer', 'admin']) await look(who);
    resetFake(answer(guest));
    await look(undefined);
    resetFake(answer(`nope-${STAMP}`));
    await look(undefined);
    resetFake(answer(undefined, { metadata: null, amount_total: null, customer_email: undefined }));
    await look(undefined);
    resetFake(answer(undefined, { metadata: 'x', amount_total: '1999' }));
    await look(undefined);
    resetFake(() => ({ status: 404, body: { error: { type: 'invalid_request_error', message: "No such checkout.session: 'cs_x'" } } }));
    await look(undefined, "cs%2F..%2Fx%20y'(z)");
    expectSameStripeRequests();
    expect(fakeStripe.requests.node[0].path).toBe("/v1/checkout/sessions/cs%2F..%2Fx%20y'(z)?expand[0]=payment_intent&expand[1]=line_items");
  });
});

// ---------------------------------------------------------------------------
// Images (local storage: backend/uploads on both sides)
// ---------------------------------------------------------------------------

const BOUNDARY = '----parityBoundary7MA4YWxkTrZu0gW';
function multipart(parts) {
  const chunks = [];
  for (const p of parts) {
    let head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename !== undefined) head += `; filename="${p.filename}"`;
    head += '\r\n';
    if (p.type) head += `Content-Type: ${p.type}\r\n`;
    chunks.push(Buffer.from(`${head}\r\n`), Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}
const form = (who, parts) => ({ headers: { ...auth(who), 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` }, raw: multipart(parts) });

async function imageRows(productId) {
  return rows(
    `SELECT product_id, original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url, sort_order, is_primary, alt_text
     FROM product_images WHERE product_id = ? ORDER BY sort_order, original_url`, [productId]);
}

async function fileInfo(url) {
  if (!url || !url.startsWith('/uploads/')) return null;
  const file = path.join(UPLOADS, url.slice('/uploads/'.length));
  if (!fs.existsSync(file)) return { exists: false };
  const meta = await sharp(file).metadata().catch(() => null);
  return { exists: true, format: meta && meta.format, width: meta && meta.width, height: meta && meta.height };
}

describeIf('images', () => {
  let png;
  let jpeg;
  beforeAll(async () => {
    nodeEnv('none');
    png = await sharp({ create: { width: 1000, height: 333, channels: 4, background: { r: 200, g: 180, b: 150, alpha: 0.5 } } }).png().toBuffer();
    jpeg = await sharp({ create: { width: 120, height: 900, channels: 3, background: '#aa8866' } }).jpeg().toBuffer();
  });

  test('auth: protect then admin (no CSRF on these routes)', async () => {
    for (const [method, url] of [['post', '/api/images/upload'], ['post', '/api/images/product/PROD0000000001'], ['delete', '/api/images/nope']]) {
      for (const who of [undefined, 'customer', 'staff']) await same('none', method, url, form(who, [{ name: 'image', filename: 'a.png', type: 'image/png', data: png }]));
      await same('none', method, url, { headers: { Authorization: 'Bearer garbage' } });
    }
    await same('none', 'delete', '/api/images/nope', { headers: auth('admin') });
    await same('none', 'delete', '/api/images/upload', { headers: auth('admin') });
  });

  test('upload: multer errors and missing files', async () => {
    for (const url of ['/api/images/upload', '/api/images/product/PROD0000000001']) {
      await same('none', 'post', url, { headers: auth('admin') });
      await same('none', 'post', url, { headers: auth('admin'), body: { image: 'x' } });
      await same('none', 'post', url, form('admin', [{ name: 'other', filename: 'a.png', type: 'image/png', data: png }]));
      await same('none', 'post', url, form('admin', [{ name: 'image', filename: 'a.svg', type: 'image/svg+xml', data: '<svg/>' }]));
      await same('none', 'post', url, form('admin', [{ name: 'image', data: 'just a field' }]));
      await same('none', 'post', url, form('admin', [{ name: 'image', filename: 'big.png', type: 'image/png', data: Buffer.alloc(10 * 1024 * 1024 + 1) }]));
      await same('none', 'post', url, { headers: { ...auth('admin'), 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` }, raw: `--${BOUNDARY}\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\n\r\nabc` });
      await same('none', 'post', url, { headers: { ...auth('admin'), 'Content-Type': 'multipart/form-data' }, raw: 'x' });
    }
  });

  test('upload: a general image (key from a uuid and a safe extension)', async () => {
    for (const filename of ['photo.PNG', 'x.webp?evil', '../../etc/passwd', 'a.b.JPEG', 'noext']) {
      const r = await same('none', 'post', '/api/images/upload', form('admin', [{ name: 'image', filename, type: 'image/png', data: png }]));
      for (const side of SIDES) {
        const { url, key } = r[side].body.keyValueTable;
        expect(url).toBe(`/uploads/${key}`);
        const file = path.join(UPLOADS, key);
        created.files.push(file);
        expect(fs.readFileSync(file).equals(png)).toBe(true);
      }
    }
  });

  test('product image: original + three thumbnails, rows and files', async () => {
    const products = await productPair();
    const pid = {
      node: { PRODUCT: products.node, product: products.node.toLowerCase() },
      rust: { PRODUCT: products.rust, product: products.rust.toLowerCase() },
    };
    await same('none', 'post', `/api/images/product/NOPE${STAMP}`, form('admin', [{ name: 'image', filename: 'a.png', type: 'image/png', data: png }]));
    const first = await same('none', 'post', (side) => `/api/images/product/${products[side]}`, form('admin', [{ name: 'image', filename: 'Wide.PNG', type: 'image/png', data: png }]), pid);
    await same('none', 'post', (side) => `/api/images/product/${products[side]}`, form('admin', [{ name: 'image', filename: 'tall.jpg', type: 'image/jpeg', data: jpeg }]), pid);
    // Not an image: every thumbnail falls back to the original.
    await same('none', 'post', (side) => `/api/images/product/${products[side]}`, form('admin', [{ name: 'image', filename: 'fake.gif', type: 'image/gif', data: 'GIF89a nope' }]), pid);
    // The product id as typed in the URL (MySQL matched it case-insensitively).
    await same('none', 'post', (side) => `/api/images/product/${products[side].toLowerCase()}`, form('admin', [{ name: 'image', filename: 'c.webp', type: 'image/webp', data: png }]), pid);

    const fix = normalizer(pid);
    const [nodeRows, rustRows] = [await imageRows(products.node), await imageRows(products.rust)];
    expect(nodeRows.map((r) => r.sort_order)).toEqual([1, 2, 3, 4]);
    expect(fix(rustRows)).toEqual(fix(nodeRows));
    // The files each side wrote: same formats and sizes.
    for (let i = 0; i < nodeRows.length; i += 1) {
      for (const col of ['original_url', 'thumbnail_small_url', 'thumbnail_medium_url', 'thumbnail_large_url']) {
        expect({ i, col, ...(await fileInfo(rustRows[i][col])) }).toEqual({ i, col, ...(await fileInfo(nodeRows[i][col])) });
      }
    }
    const kvt = first.node.body.keyValueTable;
    expect(await fileInfo(kvt.thumbnails.small)).toMatchObject({ format: 'jpeg', width: 150, height: 150 });
    expect(await fileInfo(kvt.thumbnails.medium)).toMatchObject({ width: 400, height: 333 });

    // Delete: files and row gone on each side; deleting again is a 404.
    const imageIds = { node: first.node.body.keyValueTable.imageId, rust: first.rust.body.keyValueTable.imageId };
    const urls = {};
    for (const side of SIDES) urls[side] = (await rows('SELECT * FROM product_images WHERE id = ?', [imageIds[side]]))[0];
    await same('none', 'delete', (side) => `/api/images/${imageIds[side]}`, { headers: auth('admin') });
    for (const side of SIDES) {
      expect(await rows('SELECT id FROM product_images WHERE id = ?', [imageIds[side]])).toEqual([]);
      for (const col of ['original_url', 'thumbnail_small_url', 'thumbnail_medium_url', 'thumbnail_large_url']) {
        expect(await fileInfo(urls[side][col])).toEqual({ exists: false });
      }
    }
    await same('none', 'delete', (side) => `/api/images/${imageIds[side]}`, { headers: auth('admin') });
  });

  test('delete: stored URLs outside /uploads, and keys that would escape it', async () => {
    const products = await productPair();
    const outside = path.join(UPLOADS, '..', `parity-keep-${STAMP}.txt`);
    fs.writeFileSync(outside, 'keep');
    created.files.push(outside);
    const imgs = {};
    for (const side of SIDES) {
      imgs[side] = `TIMGROW-${hex()}`;
      await q(`INSERT INTO product_images (id, product_id, original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url, sort_order)
               VALUES (?, ?, '/images/bedding/silk-1.jpg', ?, '', NULL, 1)`, [imgs[side], products[side], `/uploads/../parity-keep-${STAMP}.txt`]);
    }
    await same('none', 'delete', (side) => `/api/images/${imgs[side]}`, { headers: auth('admin') });
    expect(fs.readFileSync(outside, 'utf8')).toBe('keep');
  });
});
