// Node ↔ Rust parity for /api/reviews and /api/returns (rust/crates/api/src/routes/
// reviews.rs, returns.rs). Skipped unless RUST_API_URL points at a running Rust API.
//
// Read-only requests go to both services with the same caller (same rows → same
// JSON). Every write runs once per service, each with its own users and orders, and
// the answers and the rows written are compared after replacing generated ids and
// timestamps.
const crypto = require('crypto');
const P = require('./parityHelpers');
const { app, request, DatabaseUtil, login, registerCustomer } = require('./helpers');

const SIDES = ['node', 'rust'];
const hex = (n = 6) => crypto.randomBytes(n).toString('hex');
const q = async (sql, params) => {
  const res = await DatabaseUtil.executeQuery(sql, params);
  if (!res.success) throw new Error(`${sql}: ${res.error}`);
  return res;
};
const rows = async (sql, params) => DatabaseUtil.rows(await q(sql, params));

const norm = P.normalizer([
  [/RMAITEM\d{10}/g, 'RMAITEM*'],
  [/RMA\d{10}/g, 'RMA*'],
  [/REV\d{10}/g, 'REV*'],
  [/USER\d{10}/g, 'USER*'],
  [/T(ORD|OI|NUM)-[0-9a-f]{12}/g, 'T$1'],
  [/test\.\d+\.[a-z0-9]+@example\.com/g, 'EMAIL'],
  [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'],
]);

const parse = (text) => {
  try { return JSON.parse(text); } catch { return text; }
};

// One request to one side. `json` / `form` / `raw` + `contentType` pick the body.
async function run(side, method, url, { headers = {}, json, form, raw, contentType } = {}) {
  let body;
  let type;
  if (json !== undefined) { body = JSON.stringify(json); type = 'application/json'; }
  if (form !== undefined) { body = form; type = 'application/x-www-form-urlencoded'; }
  if (raw !== undefined) { body = raw; type = contentType; }
  const h = { ...headers, ...(type && { 'Content-Type': type }) };
  if (side === 'node') {
    let r = request(app)[method](url).set(h);
    if (body !== undefined) r = r.send(body);
    const res = await r;
    return { status: res.status, body: method === 'head' ? '' : parse(res.text), text: res.text };
  }
  const res = await fetch(P.RUST + url, { method: method.toUpperCase(), headers: h, body });
  const text = await res.text();
  return { status: res.status, body: method === 'head' ? '' : parse(text), text };
}

// Values in `opts` (and `url`) may be functions of the side, for per-side users.
const pick = (v, side) => (typeof v === 'function' ? v(side) : v);

async function pair(method, url, opts = {}) {
  const out = {};
  for (const side of SIDES) {
    const o = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, pick(v, side)]));
    out[side] = await run(side, method, pick(url, side), o);
  }
  const sent = pick(opts.json, 'node') ?? pick(opts.form, 'node') ?? pick(opts.raw, 'node') ?? '';
  const label = `${method.toUpperCase()} ${pick(url, 'node')} ${JSON.stringify(sent)}`;
  expect({ label, status: out.rust.status, body: norm(out.rust.body) })
    .toEqual({ label, status: out.node.status, body: norm(out.node.body) });
  return out;
}

/** The same SELECT for each side's id; the rows must match after normalizing. */
async function sameRows(sql, ids) {
  const [node, rust] = [await rows(sql, [ids.node]), await rows(sql, [ids.rust])];
  expect(norm(rust)).toEqual(norm(node));
  return { node, rust };
}

/** An order (with items) for `userId`, straight into the DB. */
async function makeOrder(userId, status = 'delivered', products = ['PROD0000000002', 'PROD0000000003']) {
  const id = `TORD-${hex()}`;
  await q(
    `INSERT INTO orders (id, order_number, user_id, status, subtotal, total_amount,
       shipping_address_json, billing_address_json)
     VALUES (?, ?, ?, ?, 100, 100, '{}', '{}')`,
    [id, `TNUM-${hex()}`, userId, status]
  );
  const items = [];
  for (const product of products) {
    const itemId = `TOI-${hex()}`;
    await q(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, 2, 49.5, 99)`,
      [itemId, id, product, `Item ${product}`, `SKU-${product}`]
    );
    items.push(itemId);
  }
  return { id, items };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
let admin; // { token, csrf, headers }
let staff;

beforeAll(async () => {
  if (!P.RUST) return;
  const a = await login('admin');
  const res = await request(app).get('/api/users/csrf-token').set(bearer(a.accessToken));
  const csrf = res.body.keyValueTable.csrfToken;
  admin = {
    token: a.accessToken,
    headers: { ...bearer(a.accessToken), 'X-CSRF-Token': csrf, Cookie: `csrf_token=${csrf}` },
  };
  const s = await login('staff');
  const sres = await request(app).get('/api/users/csrf-token').set(bearer(s.accessToken));
  const scsrf = sres.body.keyValueTable.csrfToken;
  staff = { headers: { ...bearer(s.accessToken), 'X-CSRF-Token': scsrf, Cookie: `csrf_token=${scsrf}` } };
});

// ---------------------------------------------------------------------------
// Routing: Express's router decides, including the overlapping paths.
// ---------------------------------------------------------------------------
P.describeIfRust('reviews/returns routing: same 404s, errors and overlaps', () => {
  test('paths and methods Node does not route are its 404', async () => {
    for (const [method, url] of [
      ['get', '/api/reviews'], ['get', '/api/reviews/'], ['post', '/api/reviews'],
      ['get', '/api/reviews/create'], ['get', '/api/reviews/REV0000000001'],
      ['delete', '/api/reviews/product/PROD0000000001'], ['post', '/api/reviews/product/PROD0000000001'],
      ['patch', '/api/reviews/REV0000000001'], ['get', '/api/reviews/a/b/c?x=1&y[]=2'],
      ['put', '/api/reviews/admin/pending'], ['post', '/api/reviews/admin/REV1/approve'],
      ['get', '/api/reviews/admin/REV1/approve'], ['put', '/api/reviews/admin/approve'],
      ['get', '/api/returns'], ['get', '/api/returns/'], ['post', '/api/returns/my-returns'],
      ['delete', '/api/returns/RMA1'], ['post', '/api/returns/RMA1/status'],
      ['get', '/api/returns/RMA1/status'], ['put', '/api/returns/admin/all'],
      ['get', '/api/returns/admin/all/x'], ['post', '/api/returns/request/x'],
    ]) {
      await pair(method, url);
    }
  });

  test('overlapping paths go where Express sends them (auth runs first)', async () => {
    for (const [method, url] of [
      ['post', '/api/reviews/product/helpful'], // helpful vote on review "product"
      ['post', '/api/reviews/user/helpful'],
      ['post', '/api/reviews/admin/helpful'],
      ['put', '/api/reviews/create'], // edit review "create"
      ['delete', '/api/reviews/create'],
      ['put', '/api/reviews/product'],
      ['get', '/api/reviews/user/x'],
      ['get', '/api/returns/request'], // return id "request"
      ['get', '/api/returns/admin'],
      ['put', '/api/returns/admin/status'],
      ['put', '/api/returns/my-returns/status'],
      ['post', '/api/reviews/CREATE/'], // literals ignore case; a trailing slash is fine
      ['get', '/api/returns/MY-RETURNS'],
    ]) {
      await pair(method, url);
    }
    const alice = await login('customer');
    const h = bearer(alice.accessToken);
    for (const [method, url] of [
      ['post', '/api/reviews/product/helpful'], ['put', '/api/reviews/create'],
      ['delete', '/api/reviews/create'], ['get', '/api/returns/request'],
      ['get', '/api/returns/admin'], ['get', '/api/returns/MY-RETURNS/'],
      ['get', '/api/reviews/PRODUCT/PROD0000000001/'],
    ]) {
      await pair(method, url, { headers: h });
    }
  });

  test('HEAD answers like GET', async () => {
    await pair('head', '/api/reviews/product/PROD0000000001');
    await pair('head', '/api/returns/my-returns');
  });

  test('a param decodeURIComponent rejects is a 500, whatever the method', async () => {
    for (const [method, url] of [
      ['get', '/api/reviews/product/%ZZ'], ['get', '/api/reviews/%E0%A4%A'],
      ['put', '/api/reviews/%ZZ'], ['post', '/api/reviews/%ZZ/helpful'],
      ['get', '/api/returns/%ZZ'], ['put', '/api/returns/%C0%AF/status'],
    ]) {
      await pair(method, url);
    }
    // Escapes that decode are params like any other.
    await pair('get', '/api/reviews/product/PROD%30000000001');
  });

  test('a body express.json() rejects is a 500 before any route or auth', async () => {
    for (const raw of ['{bad', '1', '"x"', '   ']) {
      const out = {};
      for (const side of SIDES) {
        out[side] = await run(side, 'post', '/api/reviews/create', { raw, contentType: 'application/json' });
      }
      // Outside production the error text is V8's JSON.parse message, which Rust doesn't copy.
      const view = (r) => ({ status: r.status, message: r.body.message, keys: Object.keys(r.body.keyValueTable).sort() });
      expect({ raw, ...view(out.rust) }).toEqual({ raw, ...view(out.node) });
    }
    // body-parser's own errors have fixed text.
    for (const [raw, contentType] of [
      ['{}', 'application/json; charset=latin1'],
      ['a=1', 'application/x-www-form-urlencoded; charset="ISO-8859-1"'],
      [`{"a":"${'x'.repeat(110 * 1024)}"}`, 'application/json'],
      [`a=${'x'.repeat(110 * 1024)}`, 'application/x-www-form-urlencoded'],
      ['a=1&'.repeat(1000), 'application/x-www-form-urlencoded'],
    ]) {
      await pair('post', '/api/returns/request', { raw, contentType });
    }
    // Other types are not parsed: the route sees {} (and auth comes first).
    await pair('post', '/api/reviews/create', { raw: '{bad', contentType: 'text/plain' });
  });
});

// ---------------------------------------------------------------------------
// Public review list
// ---------------------------------------------------------------------------
P.describeIfRust('reviews: product list', () => {
  test.each([
    '/api/reviews/product/PROD0000000001',
    '/api/reviews/product/PROD0000000002',
    '/api/reviews/product/PROD9999999999',
    '/api/reviews/product/PROD0000000001?page=2&limit=1',
    '/api/reviews/product/PROD0000000001?limit=1&sort=helpful',
    '/api/reviews/product/PROD0000000001?sort=rating_high',
    '/api/reviews/product/PROD0000000001?sort=rating_low',
    '/api/reviews/product/PROD0000000001?sort=bogus',
    '/api/reviews/product/PROD0000000001?sort[]=helpful',
    '/api/reviews/product/PROD0000000001?page=0&limit=0',
    '/api/reviews/product/PROD0000000001?page=-3&limit=-5',
    '/api/reviews/product/PROD0000000001?page=abc&limit=1000',
    '/api/reviews/product/PROD0000000001?page=1.9&limit=1.9',
    '/api/reviews/product/PROD0000000001?page[]=2&limit[]=1',
    '/api/reviews/product/PROD0000000001?page=2&page=3&limit=1',
    '/api/reviews/product/PROD0000000001?page[a]=2&limit[b]=1',
    '/api/reviews/product/PROD0000000001?page=99999999999999999999',
    '/api/reviews/product/PROD0000000001?page=9999999999999&limit=100',
    '/api/reviews/product/%27%20OR%201%3D1%20--',
  ])('%s', (url) => P.compare(url));
});

// ---------------------------------------------------------------------------
// Auth on every protected route
// ---------------------------------------------------------------------------
P.describeIfRust('reviews/returns: same auth answers', () => {
  // Unknown ids: a request that gets past auth and CSRF changes nothing.
  const PROTECTED = [
    ['post', '/api/reviews/create'], ['put', '/api/reviews/REV9999999999'],
    ['delete', '/api/reviews/REV9999999999'], ['post', '/api/reviews/REV9999999999/helpful'],
    ['get', '/api/reviews/user/USER0000000003'], ['get', '/api/reviews/admin/pending'],
    ['put', '/api/reviews/admin/REV9999999999/approve'], ['put', '/api/reviews/admin/REV9999999999/reject'],
    ['post', '/api/returns/request'], ['get', '/api/returns/my-returns'], ['get', '/api/returns/RMA9999999999'],
    ['put', '/api/returns/RMA9999999999/status'], ['get', '/api/returns/admin/all'],
  ];
  const ADMIN = PROTECTED.filter(([, url]) => url.includes('/admin') || url.endsWith('/status'));

  test('missing, malformed and cookie-borne tokens', async () => {
    const alice = await login('customer');
    const headerSets = [
      {},
      bearer('garbage'),
      { Authorization: 'Bearer ' },
      { Cookie: 'admin_auth=' },
      { Cookie: 'admin_auth=garbage' },
      { Cookie: 'admin_auth=j:{"a":1}' },
      { Cookie: 'admin_auth=j:0' },
      { Cookie: 'admin_auth=; admin_auth=x' },
    ];
    for (const [method, url] of PROTECTED) {
      for (const headers of headerSets) await pair(method, url, { headers });
    }
    // A cookie value is decoded and `j:"…"` is the JSON string: both authenticate.
    for (const cookie of [`admin_auth=j:"${alice.accessToken}"`, `admin_auth=${encodeURIComponent(alice.accessToken)}`]) {
      await pair('get', '/api/returns/my-returns', { headers: { Cookie: cookie } });
      await pair('get', '/api/reviews/admin/pending', { headers: { Cookie: cookie } });
    }
  });

  test('customers and staff are 403 on the admin routes; CSRF on admin writes', async () => {
    const alice = await login('customer');
    for (const [method, url] of ADMIN) {
      await pair(method, url, { headers: bearer(alice.accessToken) });
      await pair(method, url, { headers: staff.headers });
    }
    const writes = ADMIN.filter(([method]) => method === 'put');
    const csrf = admin.headers['X-CSRF-Token'];
    for (const [method, url] of writes) {
      await pair(method, url, { headers: bearer(admin.token) });
      await pair(method, url, { headers: { ...bearer(admin.token), 'X-CSRF-Token': csrf } });
      await pair(method, url, { headers: { ...bearer(admin.token), Cookie: `csrf_token=${csrf}` } });
      await pair(method, url, { headers: { ...bearer(admin.token), 'X-CSRF-Token': csrf, Cookie: 'csrf_token=other' } });
      await pair(method, url, { headers: { ...bearer(admin.token), 'X-CSRF-Token': 'forged', Cookie: 'csrf_token=forged' } });
      await pair(method, url, { headers: { ...bearer(admin.token), 'X-CSRF-Token': csrf, Cookie: `csrf_token=j:"${csrf}"` } });
    }
    // Another admin session's token does not validate for a different user.
    await pair('put', '/api/reviews/admin/REV9999999999/approve', { headers: { ...staff.headers, Authorization: `Bearer ${admin.token}` } });
  });
});

// ---------------------------------------------------------------------------
// Review writes: one customer per side
// ---------------------------------------------------------------------------
P.describeIfRust('reviews: create / edit / vote / moderate / delete', () => {
  const ctx = {};
  const as = (s) => bearer(ctx[s].user.accessToken);
  const other = (s) => bearer(ctx[s].other.accessToken);

  beforeAll(async () => {
    for (const side of SIDES) {
      const user = await registerCustomer();
      const otherUser = await registerCustomer();
      const voter = await registerCustomer();
      // A delivered order of PROD0000000002 makes that review a verified purchase.
      const order = await makeOrder(user.userId, 'delivered', ['PROD0000000002']);
      ctx[side] = { user, other: otherUser, voter, order, reviews: {} };
    }
  });

  test('create: validation, types, duplicates and verified purchases', async () => {
    const bad = [
      {}, { product_id: 'PROD0000000001' }, { product_id: 'PROD0000000001', rating: 5 },
      { product_id: '', rating: 5, review_text: 'x' }, { rating: 5, review_text: 'x' },
      { product_id: 'PROD0000000001', rating: null, review_text: 'x' },
      { product_id: 'PROD0000000001', rating: 5, review_text: '' },
      { product_id: 'PROD0000000001', rating: 5, review_text: 0 },
      ...[1, true, ['PROD0000000001'], { a: 1 }].map((product_id) => ({ product_id, rating: 5, review_text: 'x' })),
      ...[['x'], { a: 1 }, 5, true].map((title) => ({ product_id: 'PROD0000000001', rating: 5, title, review_text: 'x' })),
      ...['abc', 0, 6, -1, '0x5', [], {}, false, '99999999999999999999'].map((rating) => ({ product_id: 'PROD0000000001', rating, review_text: 'x' })),
      ...[5, true, ['x'], { a: 1 }, '   ', '\u00a0\ufeff\n'].map((review_text) => ({ product_id: 'PROD0000000001', rating: 5, review_text })),
    ];
    for (const json of bad) await pair('post', '/api/reviews/create', { headers: as, json });
    // A product that doesn't exist fails the INSERT (foreign key).
    await pair('post', '/api/reviews/create', { headers: as, json: { product_id: 'PROD9999999999', rating: 4, review_text: 'x' } });

    const created = await pair('post', '/api/reviews/create', {
      headers: as,
      json: { product_id: 'PROD0000000001', rating: '4.9 stars', title: '  Soft\u00a0', review_text: '\ufeff Lovely sheets \u2028' },
    });
    expect(created.node.status).toBe(201);
    for (const side of SIDES) ctx[side].reviews.plain = created[side].body.keyValueTable.id;
    await pair('post', '/api/reviews/create', { headers: as, json: { product_id: 'PROD0000000001', rating: 5, review_text: 'again' } });

    const verified = await pair('post', '/api/reviews/create', {
      headers: as, json: { product_id: 'PROD0000000002', rating: 1e21, title: null, review_text: 'ok' },
    });
    expect(verified.node.status).toBe(201);
    for (const side of SIDES) ctx[side].reviews.verified = verified[side].body.keyValueTable.id;
    // An urlencoded body is parsed too (all strings).
    const form = await pair('post', '/api/reviews/create', {
      headers: as, form: 'product_id=PROD0000000003&rating=2&title=Form+title&review_text=from%20a%20form',
    });
    expect(form.node.status).toBe(201);
    for (const side of SIDES) ctx[side].reviews.form = form[side].body.keyValueTable.id;

    await sameRows(
      `SELECT id, product_id, user_id, order_item_id IS NOT NULL AS linked, rating, review_details,
         CAST(review_details AS CHAR) AS raw, is_verified_purchase, is_approved, approved_by, approved_at
       FROM product_reviews WHERE user_id = ? ORDER BY product_id`,
      { node: ctx.node.user.userId, rust: ctx.rust.user.userId }
    );
    const [linked] = await rows('SELECT order_item_id FROM product_reviews WHERE id = ?', [ctx.rust.reviews.verified]);
    expect(linked.order_item_id).toBe(ctx.rust.order.items[0]);
  });

  test('own list, others\' lists and the admin view', async () => {
    await pair('get', (s) => `/api/reviews/user/${ctx[s].user.userId}`, { headers: as });
    await pair('get', (s) => `/api/reviews/user/${ctx[s].user.userId}`, { headers: other });
    await pair('get', (s) => `/api/reviews/user/${ctx[s].user.userId}`, { headers: bearer(admin.token) });
    await pair('get', '/api/reviews/user/USER9999999999', { headers: bearer(admin.token) });
    await pair('get', '/api/reviews/user/USER0000000003', { headers: staff.headers });
  });

  test('edit: owner only, validation, merge into review_details, back to pending', async () => {
    const url = (s) => `/api/reviews/${ctx[s].reviews.plain}`;
    await pair('put', '/api/reviews/REV9999999999', { headers: as, json: { rating: 5 } });
    await pair('put', url, { headers: other, json: { rating: 5 } });
    await pair('put', url, { headers: bearer(admin.token), json: { rating: 5 } });
    for (const json of [{ rating: 'x' }, { rating: 0 }, { rating: null }, { rating: [] }, { review_text: '' },
      { review_text: '  ' }, { review_text: [] }]) {
      await pair('put', url, { headers: as, json });
    }
    await pair('put', url, { headers: as, json: {} });
    await sameRows('SELECT rating, review_details, is_approved FROM product_reviews WHERE id = ?',
      { node: ctx.node.reviews.plain, rust: ctx.rust.reviews.plain });
    // String(x) for non-strings: null → "null", numbers, arrays, objects.
    await pair('put', url, { headers: as, json: { rating: '2', title: 5, review_text: null } });
    await pair('put', url, { headers: as, json: { title: ['a', 'b'], review_text: { a: 1 } } });
    await pair('put', url, { headers: as, json: { title: null, review_text: 1e21 } });
    await pair('put', url, { headers: as, json: { rating: 3.7, title: ' Edited ', review_text: ' Better now ' } });
    await sameRows('SELECT rating, review_details, CAST(review_details AS CHAR) AS raw, is_approved, approved_by FROM product_reviews WHERE id = ?',
      { node: ctx.node.reviews.plain, rust: ctx.rust.reviews.plain });
  });

  test('helpful votes need an approved review; moderation with CSRF', async () => {
    const id = (s) => ctx[s].reviews.plain;
    await pair('post', (s) => `/api/reviews/${id(s)}/helpful`, { headers: as }); // still pending
    await pair('post', '/api/reviews/REV9999999999/helpful', { headers: as });

    await P.compare('/api/reviews/admin/pending', bearer(admin.token));
    await pair('put', '/api/reviews/admin/REV9999999999/approve', { headers: admin.headers });
    await pair('put', (s) => `/api/reviews/admin/${id(s)}/approve`, { headers: admin.headers });
    // Approving again in the same second still matches the row (found rows).
    await pair('put', (s) => `/api/reviews/admin/${id(s)}/approve`, { headers: admin.headers });
    await sameRows('SELECT is_approved, approved_by, approved_at IS NOT NULL AS stamped FROM product_reviews WHERE id = ?',
      { node: id('node'), rust: id('rust') });

    await pair('post', (s) => `/api/reviews/${id(s)}/helpful`, { headers: as });
    await pair('post', (s) => `/api/reviews/${id(s)}/helpful`, { headers: as }); // repeat: no-op
    await pair('post', (s) => `/api/reviews/${id(s)}/helpful`, { headers: (s) => bearer(ctx[s].voter.accessToken) });
    await sameRows(
      `SELECT review_details, JSON_TYPE(JSON_EXTRACT(review_details, '$.helpful_count')) AS type,
         (SELECT COUNT(*) FROM review_helpful_votes v WHERE v.review_id = r.id) AS votes
       FROM product_reviews r WHERE id = ?`,
      { node: id('node'), rust: id('rust') }
    );
    // Both approved reviews are now in the public list (same rows on both sides).
    await P.compare('/api/reviews/product/PROD0000000001?sort=helpful');
    await P.compare('/api/reviews/product/PROD0000000001?limit=100');
    await pair('get', (s) => `/api/reviews/user/${ctx[s].user.userId}`, { headers: as });

    // Editing sends it back to moderation (and keeps the tally).
    await pair('put', (s) => `/api/reviews/${id(s)}`, { headers: as, json: { review_text: 'Edited again' } });
    await sameRows('SELECT review_details, is_approved, approved_by, approved_at FROM product_reviews WHERE id = ?',
      { node: id('node'), rust: id('rust') });
    await pair('post', (s) => `/api/reviews/${id(s)}/helpful`, { headers: as });

    await pair('put', '/api/reviews/admin/REV9999999999/reject', { headers: admin.headers });
    await pair('put', (s) => `/api/reviews/admin/${ctx[s].reviews.form}/reject`, { headers: admin.headers });
    await pair('put', (s) => `/api/reviews/admin/${ctx[s].reviews.form}/reject`, { headers: admin.headers });
    expect(await rows('SELECT id FROM product_reviews WHERE id IN (?, ?)', [ctx.node.reviews.form, ctx.rust.reviews.form])).toEqual([]);
  });

  test('delete: owner or admin, votes go with it', async () => {
    await pair('delete', '/api/reviews/REV9999999999', { headers: as });
    await pair('delete', (s) => `/api/reviews/${ctx[s].reviews.plain}`, { headers: other });
    await pair('delete', (s) => `/api/reviews/${ctx[s].reviews.plain}`, { headers: as });
    await pair('delete', (s) => `/api/reviews/${ctx[s].reviews.plain}`, { headers: as });
    await pair('delete', (s) => `/api/reviews/${ctx[s].reviews.verified}`, { headers: bearer(admin.token) });
    for (const side of SIDES) {
      const id = ctx[side].reviews.plain;
      expect(await rows('SELECT review_id FROM review_helpful_votes WHERE review_id = ?', [id])).toEqual([]);
    }
    await pair('get', (s) => `/api/reviews/user/${ctx[s].user.userId}`, { headers: as });
  });
});

// ---------------------------------------------------------------------------
// Returns: one customer (with orders) per side
// ---------------------------------------------------------------------------
P.describeIfRust('returns: request / list / detail / admin', () => {
  const ctx = {};
  const as = (s) => bearer(ctx[s].user.accessToken);
  const items = (s, extra = {}) => ctx[s].delivered.items.map((orderItemId) => ({ orderItemId, ...extra }));

  beforeAll(async () => {
    for (const side of SIDES) {
      const user = await registerCustomer();
      const stranger = await registerCustomer();
      ctx[side] = {
        user,
        stranger,
        delivered: await makeOrder(user.userId),
        second: await makeOrder(user.userId, 'delivered', ['PROD0000000001']),
        pending: await makeOrder(user.userId, 'pending'),
        theirs: await makeOrder(stranger.userId),
      };
    }
  });

  test('request: validation of every field (types, ENUM reason, items)', async () => {
    const order = (s) => ctx[s].delivered.id;
    const body = (over) => (s) => ({ orderId: order(s), reason: 'defective', items: items(s), ...over(s) });
    const cases = [
      () => ({ orderId: undefined }), () => ({ orderId: '' }),
      ...[1, true, ['x'], { a: 1 }].map((orderId) => () => ({ orderId })),
      ...[undefined, 1, ['defective'], 'not-a-reason', 'DEFECTIVE', ''].map((reason) => () => ({ reason })),
      ...[undefined, 'OI1', [], {}, [null], ['x'], [{}], [{ orderItemId: 1 }], [{ orderItemId: ['x'] }], [{ orderItemId: '' }]]
        .map((v) => () => ({ items: v })),
      (s) => ({ items: items(s, { reason: 5 }) }),
      (s) => ({ items: items(s, { reason: ['x'] }) }),
      ...[1.5, '2', -1, true, 4294967296, [1], { n: 1 }].map((quantity) => (s) => ({ items: items(s, { quantity }) })),
      ...[5, ['x'], { a: 1 }, true].map((description) => () => ({ description })),
    ];
    for (const over of cases) await pair('post', '/api/returns/request', { headers: as, json: body(over) });
  });

  test('request: ownership (IDOR), order state, foreign items, then a return', async () => {
    const send = (json) => pair('post', '/api/returns/request', { headers: as, json });
    await send((s) => ({ orderId: ctx[s].theirs.id, reason: 'defective', items: ctx[s].theirs.items.map((orderItemId) => ({ orderItemId })) }));
    await send(() => ({ orderId: 'TORD-000000000000', reason: 'defective', items: [{ orderItemId: 'x' }] }));
    await send((s) => ({ orderId: ctx[s].pending.id, reason: 'other', items: ctx[s].pending.items.map((orderItemId) => ({ orderItemId })) }));
    // Items of another order (even the customer's own) don't belong.
    await send((s) => ({ orderId: ctx[s].delivered.id, reason: 'defective', items: [{ orderItemId: ctx[s].second.items[0] }] }));
    await send((s) => ({ orderId: ctx[s].delivered.id, reason: 'defective', items: [{ orderItemId: ctx[s].theirs.items[0] }] }));

    const created = await send((s) => ({
      orderId: ctx[s].delivered.id, reason: 'damaged_shipping', description: 'Torn on arrival',
      items: [
        { orderItemId: ctx[s].delivered.items[0], quantity: 2, reason: 'torn' },
        { orderItemId: ctx[s].delivered.items[1], quantity: 0, reason: null },
        { orderItemId: ctx[s].delivered.items[1] },
      ],
    }));
    expect(created.node.status).toBe(201);
    for (const side of SIDES) ctx[side].returnId = created[side].body.keyValueTable.returnId;
    await send((s) => ({ orderId: ctx[s].delivered.id, reason: 'other', items: [{ orderItemId: ctx[s].delivered.items[0] }] }));

    // An urlencoded body works too.
    const form = await pair('post', '/api/returns/request', {
      headers: as,
      form: (s) => `orderId=${ctx[s].second.id}&reason=wrong_item&items[0][orderItemId]=${ctx[s].second.items[0]}`,
    });
    expect(form.node.status).toBe(201);
    for (const side of SIDES) ctx[side].formReturnId = form[side].body.keyValueTable.returnId;

    await sameRows(
      `SELECT id, order_id, user_id, return_number, status, reason, return_details, refund_amount,
         return_tracking_number, approved_by, approved_at, received_at, processed_at
       FROM returns WHERE user_id = ? ORDER BY return_number`,
      { node: ctx.node.user.userId, rust: ctx.rust.user.userId }
    );
    await sameRows(
      `SELECT ri.id, ri.return_id, ri.order_item_id, ri.quantity, ri.reason, ri.condition_on_receipt
       FROM return_items ri JOIN returns r ON ri.return_id = r.id WHERE r.user_id = ? ORDER BY ri.id`,
      { node: ctx.node.user.userId, rust: ctx.rust.user.userId }
    );
  });

  test('my returns and detail: owner or admin only', async () => {
    await pair('get', '/api/returns/my-returns', { headers: as });
    await pair('get', '/api/returns/my-returns', { headers: (s) => bearer(ctx[s].stranger.accessToken) });
    await pair('get', (s) => `/api/returns/${ctx[s].returnId}`, { headers: as });
    await pair('get', (s) => `/api/returns/${ctx[s].returnId}`, { headers: (s) => bearer(ctx[s].stranger.accessToken) });
    await pair('get', (s) => `/api/returns/${ctx[s].returnId}`, { headers: staff.headers });
    await pair('get', (s) => `/api/returns/${ctx[s].returnId}`, { headers: bearer(admin.token) });
    await pair('get', '/api/returns/RMA9999999999', { headers: bearer(admin.token) });
  });

  test('admin status update: validation, timestamps, refund, notes, MySQL refusals', async () => {
    const url = (s) => `/api/returns/${ctx[s].returnId}/status`;
    const put = (json, u = url) => pair('put', u, { headers: admin.headers, json });
    for (const json of [{}, { status: 'bogus' }, { status: ['approved'] }, { status: 1 },
      { status: 'approved', admin_notes: 5 }, { status: 'approved', return_tracking_number: ['x'] },
      { status: 'approved', admin_notes: { a: 1 } }]) {
      await put(json);
    }
    const state = () => sameRows(
      `SELECT status, return_details, refund_amount, return_tracking_number, approved_by,
         approved_at IS NOT NULL AS approved, received_at IS NOT NULL AS received,
         processed_at IS NOT NULL AS processed
       FROM returns WHERE id = ?`,
      { node: ctx.node.returnId, rust: ctx.rust.returnId }
    );
    await put({ status: 'approved', admin_notes: 'Looks fine', return_tracking_number: '1Z999', refund_amount: 12.345 });
    await state();
    await put({ status: 'shipped_back', admin_notes: '', return_tracking_number: '', refund_amount: '20.5' });
    await state();
    await put({ status: 'received', refund_amount: null });
    await state();
    await put({ status: 'processed', refund_amount: true });
    await state();
    // Values MySQL refuses fail the whole UPDATE (a 500, nothing written).
    for (const json of [{ status: 'closed', refund_amount: 'abc' }, { status: 'closed', refund_amount: [1] },
      { status: 'closed', refund_amount: { a: 1 } }, { status: 'closed', refund_amount: 1e12 },
      { status: 'closed', return_tracking_number: 'x'.repeat(101) }]) {
      await put(json);
    }
    await state();
    await put({ status: 'closed', return_tracking_number: 'y'.repeat(100), refund_amount: 0 });
    await state();
    // Node does not check that the return exists.
    await put({ status: 'approved' }, '/api/returns/RMA9999999999/status');
    await pair('get', (s) => `/api/returns/${ctx[s].returnId}`, { headers: as });
    // A closed return no longer blocks a new request for the order.
    await pair('post', '/api/returns/request', {
      headers: as,
      json: (s) => ({ orderId: ctx[s].delivered.id, reason: 'other', items: [{ orderItemId: ctx[s].delivered.items[0] }] }),
    });
  });

  test('admin list: filters, pagination, bad input', async () => {
    const h = bearer(admin.token);
    for (const url of [
      '/api/returns/admin/all', '/api/returns/admin/all?status=requested', '/api/returns/admin/all?status=closed',
      '/api/returns/admin/all?status=', '/api/returns/admin/all?status=bogus', '/api/returns/admin/all?page=2&limit=1',
      '/api/returns/admin/all?limit=0&page=0', '/api/returns/admin/all?limit=500', '/api/returns/admin/all?limit=-1&page=-1',
      '/api/returns/admin/all?page[]=2&limit[]=1', '/api/returns/admin/all?page=1&page=2',
      '/api/returns/admin/all?status=a&status=b', '/api/returns/admin/all?status[]=requested',
      '/api/returns/admin/all?status[a]=b', '/api/returns/admin/all?page=100000000000000000',
      '/api/returns/admin/all?page=1000000000000000000', '/api/returns/admin/all?page=99999999999999999999',
    ]) {
      await pair('get', url, { headers: h });
    }
  });
});

// ---------------------------------------------------------------------------
// Production: the error handler's body is fixed text, so it compares exactly.
// ---------------------------------------------------------------------------
(P.RUST && P.rustBin() ? describe : describe.skip)('reviews/returns in production: same error bodies', () => {
  let servers = [];
  const env = { NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' };
  beforeAll(async () => {
    servers = await Promise.all([P.startNode({ port: 17034, env }), P.startRust({ port: 17033, env })]);
  }, 30000);
  afterAll(() => Promise.all(servers.map((s) => s.stop())));

  test.each([
    ['post', '/api/reviews/create', '{bad', 'application/json'],
    ['post', '/api/reviews/create', '1', 'application/json; charset=utf-8'],
    ['put', '/api/returns/RMA1/status', '[', 'application/json'],
    ['post', '/api/returns/request', 'a=1', 'application/x-www-form-urlencoded; charset=latin1'],
    ['post', '/api/returns/request', 'a=1', 'application/json; charset=latin1'],
    ['get', '/api/returns/%ZZ', undefined, undefined],
    ['get', '/api/reviews/product/%E0%A4%A', undefined, undefined],
  ])('%s %s %s', async (method, url, body, type) => {
    const [node, rust] = await Promise.all(servers.map(async (s) => {
      const res = await fetch(s.url + url, { method: method.toUpperCase(), headers: type ? { 'Content-Type': type } : {}, body });
      return { status: res.status, body: norm(parse(await res.text())) };
    }));
    expect(rust).toEqual(node);
    expect(node.status).toBe(500);
  });
});
