// Node ↔ Rust parity for /api/unsubscribe, /api/newsletter, /api/contact,
// /api/status and /api/shipping (rust/crates/api/src/routes/{unsubscribe,
// newsletter,contact,status,shipping}.rs + fedex.rs). Gated on RUST_API_URL
// like parity.test.js; the processes it spawns (limiter, FedEx, PORT checks)
// also need the Rust binary (rust/target/debug/api or RUST_API_BIN).
//
//   RUST_API_URL=http://127.0.0.1:7035 DB_HOST=127.0.0.1 DB_PORT=3307 \
//     DB_PASSWORD=noirae_dev DB_NAME=nt_misc npx jest tests/parity-misc.test.js
//
// Mutating cases run once per side with that side's own address/order, and
// the DB rows each side wrote are compared field by field.
const http = require('http');
const { app, request, DatabaseUtil, login, bearer } = require('./helpers');
const P = require('./parityHelpers');
const { buildUnsubscribeToken } = require('../utils/emailSuppression');

const { RUST, describeIfRust } = P;
const SIDES = ['node', 'rust'];
const STAMP = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const mail = (side, tag = '') => `misc.${side}${tag}.${STAMP}@example.com`;

const norm = P.normalizer([
  [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'],
  [/MOCK\d{10}/g, 'MOCK*'],
  [/misc\.(node|rust)([a-z0-9]*)\.\d+@example\.com/g, 'misc.SIDE$2@example.com'],
  [/ORDMISC(N|R)/g, 'ORDMISC*'],
]);

const parseJson = (text) => {
  try { return JSON.parse(text); } catch { return undefined; }
};

/**
 * One request on one side. `body` is sent as JSON; `raw` is sent verbatim
 * (set its Content-Type in `headers`).
 */
async function send(side, method, url, { headers = {}, body, raw } = {}) {
  if (side === 'node') {
    let req = request(app)[method](url).set(headers);
    if (raw !== undefined) req = req.send(raw);
    else if (body !== undefined) req = req.send(body);
    const res = await req;
    return { status: res.status, body: parseJson(res.text) ?? res.text, headers: res.headers };
  }
  const res = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { ...(body !== undefined && raw === undefined && { 'Content-Type': 'application/json' }), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: parseJson(text) ?? text, headers: res.headers };
}

/**
 * The same request on both sides (`opts` may be a function of the side, for
 * per-side addresses/orders); same status and normalized body.
 */
async function same(method, url, opts = {}, { normalize = norm, errorText = false } = {}) {
  const out = {};
  for (const side of SIDES) {
    const o = typeof opts === 'function' ? opts(side) : opts;
    const u = typeof url === 'function' ? url(side) : url;
    out[side] = await send(side, method, u, o);
  }
  const view = (r) => {
    let body = normalize(r.body);
    // V8's JSON.parse wording is not reproduced; the status/message/shape are.
    if (errorText && body?.message === 'Internal server error' && body.keyValueTable?.error) {
      body = { ...body, keyValueTable: { ...body.keyValueTable, error: 'ERROR' } };
    }
    return { label: `${method.toUpperCase()} ${typeof url === 'function' ? url('node') : url}`, status: r.status, body };
  };
  expect(view(out.rust)).toEqual(view(out.node));
  return out;
}

// Flag columns (`x IS NOT NULL AS flag`) come back as BIGINT strings; read them as numbers.
const FLAGS = ['dated', 'scheduled', 'shipped'];
const query = (sql, params) => DatabaseUtil.executeQuery(sql, params).then(DatabaseUtil.rows)
  .then((rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, FLAGS.includes(k) ? Number(v) : v]))));

// ---------------------------------------------------------------------------
// /api/status
// ---------------------------------------------------------------------------

describeIfRust('status: Node and Rust answer identically', () => {
  test.each(['/api/status/health', '/api/status/health/'])('GET %s (uptime and port are per process)', async (url) => {
    const { node, rust } = await same('get', url, {}, {
      normalize: (b) => norm({ ...b, keyValueTable: { ...b.keyValueTable, uptime: 'UPTIME', port: 'PORT' } }),
    });
    for (const r of [node, rust]) expect(r.body.keyValueTable.uptime).toMatch(/^\d+(\.\d+)? seconds$/);
    expect(node.body.keyValueTable.port).toBe(process.env.PORT || 6666);
  });

  test('GET /hello', () => same('get', '/api/status/hello'));

  test.each([
    [{ name: 'Ann' }], [{ name: '  Ann Lee \u00a0' }], [{}], [{ name: '' }], [{ name: '   ' }],
    [{ name: 5 }], [{ name: 0 }], [{ name: ['a'] }], [{ name: [] }], [{ name: { a: 1 } }],
    [{ name: true }], [{ name: false }], [{ name: null }], [[1, 2]], [{ name: '\u0085x\u0085' }],
  ])('POST /hello %j', (body) => same('post', '/api/status/hello', { body }));

  test.each([
    ['urlencoded', { 'Content-Type': 'application/x-www-form-urlencoded' }, 'name=Ann+Lee'],
    ['urlencoded array', { 'Content-Type': 'application/x-www-form-urlencoded' }, 'name[]=Ann'],
    ['text/plain', { 'Content-Type': 'text/plain' }, 'name=Ann'],
    ['no body', {}, undefined],
    // V8's wording for this one is not reproduced (status, message and shape are).
    ['malformed JSON', { 'Content-Type': 'application/json' }, '{bad', true],
    ['JSON scalar (strict)', { 'Content-Type': 'application/json' }, '"Ann"'],
    ['empty JSON body', { 'Content-Type': 'application/json' }, ''],
    ['non-UTF charset', { 'Content-Type': 'application/json; charset=latin1' }, '{"name":"Ann"}'],
    ['too deep urlencoded', { 'Content-Type': 'application/x-www-form-urlencoded' }, `a${'[b]'.repeat(40)}=1`],
    ['JSON number (strict)', { 'Content-Type': 'application/json' }, ' 12'],
    ['truncated JSON', { 'Content-Type': 'application/json' }, '{"name":'],
    ['long strict violation', { 'Content-Type': 'application/json' }, '"a fairly long string body"'],
  ])('POST /hello with %s', (_l, headers, raw, errorText = false) =>
    same('post', '/api/status/hello', { headers, raw }, { errorText }));

  test.each([
    ['get', '/api/status'], ['get', '/api/status/'], ['get', '/api/status/nope?x=1'], ['post', '/api/status/health'],
    ['put', '/api/status/hello'], ['delete', '/api/status/a/b'],
    ['post', '/api/status/hello/'],
  ])('%s %s', (method, url) => same(method, url, method === 'post' ? { body: { name: 'x' } } : {}));
});

// ---------------------------------------------------------------------------
// /api/newsletter
// ---------------------------------------------------------------------------

describeIfRust('newsletter: Node and Rust answer identically', () => {
  const row = async (email) => (await query(
    'SELECT email, status, created_at IS NOT NULL AS dated FROM newsletter_subscribers WHERE email = ?', [email]))[0];

  test('subscribe writes the same row, and again is a no-op', async () => {
    await same('post', '/api/newsletter/subscribe', (side) => ({ body: { email: `  ${mail(side, 'nl').toUpperCase()} ` } }));
    const [n, r] = [await row(mail('node', 'nl')), await row(mail('rust', 'nl'))];
    expect(n).toEqual({ email: mail('node', 'nl'), status: 'subscribed', dated: 1 });
    expect(r).toEqual({ ...n, email: mail('rust', 'nl') });
    await DatabaseUtil.executeQuery("UPDATE newsletter_subscribers SET status = 'unsubscribed' WHERE email IN (?, ?)",
      [mail('node', 'nl'), mail('rust', 'nl')]);
    await same('post', '/api/newsletter/subscribe', (side) => ({ body: { email: mail(side, 'nl') } }));
    expect((await row(mail('rust', 'nl'))).status).toBe('subscribed');
    expect((await row(mail('node', 'nl'))).status).toBe('subscribed');
  });

  test('urlencoded body', () =>
    same('post', '/api/newsletter/subscribe', (side) => ({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      raw: `email=${encodeURIComponent(mail(side, 'nlform'))}`,
    })));

  test.each([
    [{}], [{ email: '' }], [{ email: 'nope' }], [{ email: 'a@b' }], [{ email: 'a@b.' }], [{ email: 'a b@c.de' }],
    [{ email: 5 }], [{ email: ['a@b.co'] }], [{ email: { a: 1 } }], [{ email: null }], [{ email: true }],
    [{ email: `${'a'.repeat(250)}@b.co` }], [{ email: 'a@@b.co' }], [{ email: 'a@b.co\u2028' }],
  ])('invalid %j', (body) => same('post', '/api/newsletter/subscribe', { body }));

  test.each([
    ['get', '/api/newsletter/subscribe'], ['get', '/api/newsletter'], ['post', '/api/newsletter'], ['get', '/api/newsletter/'],
    ['post', '/api/newsletter/other'],
  ])('%s %s', (method, url) => same(method, url));
});

// ---------------------------------------------------------------------------
// /api/contact
// ---------------------------------------------------------------------------

describeIfRust('contact: Node and Rust answer identically', () => {
  const queued = async (email) => (await query(
    `SELECT id, to_email, to_name, subject, email_content, status, template_id, template_data, attempts,
            max_attempts, scheduled_at IS NOT NULL AS scheduled, sent_at
       FROM email_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(email_content, '$.from_email')) = ?`, [email]));

  const compareQueued = async (tag) => {
    const [[n], [r]] = [await queued(mail('node', tag)), await queued(mail('rust', tag))];
    expect(n).toBeTruthy();
    expect(r).toBeTruthy();
    for (const row of [n, r]) {
      expect(row.id).toMatch(/^EMAIL\d+$/);
      expect(row.email_content.submitted_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    }
    const view = (row) => norm({ ...row, id: 'ID', email_content: { ...row.email_content } });
    expect(view(r)).toEqual(view(n));
    return { n, r };
  };

  test('a message is queued for support with the same row', async () => {
    await same('post', '/api/contact', (side) => ({
      body: { fullName: '  Ann Lee ', email: ` ${mail(side, 'ct')} `, subject: ' Sheets 😀 ', message: ' Hello there ' },
    }));
    const { n } = await compareQueued('ct');
    expect(n.subject).toBe('Contact form: Sheets 😀');
    expect(n.to_name).toBe('Support');
    expect(n.status).toBe('pending');
  });

  test('`name` fallback, no subject, urlencoded', async () => {
    await same('post', '/api/contact', (side) => ({ body: { fullName: 7, name: 'Bo', email: mail(side, 'ct2'), message: 'Hi' } }));
    await compareQueued('ct2');
    await same('post', '/api/contact', (side) => ({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      raw: `name=Cy&email=${encodeURIComponent(mail(side, 'ct3'))}&message=Long+enough&subject=`,
    }));
    await compareQueued('ct3');
  });

  const valid = { fullName: 'Ann', email: 'ann@example.com', message: 'Hello' };
  test.each([
    [{}], [{ ...valid, fullName: '' }], [{ ...valid, fullName: '   ' }], [{ ...valid, fullName: 'x'.repeat(201) }],
    [{ ...valid, fullName: ['Ann'] }], [{ ...valid, fullName: undefined, name: 5 }], [{ ...valid, email: 'bad' }],
    [{ ...valid, email: 5 }], [{ ...valid, email: `${'a'.repeat(250)}@b.co` }], [{ ...valid, message: 'x' }],
    [{ ...valid, message: ' x ' }], [{ ...valid, message: 'x'.repeat(5001) }], [{ ...valid, message: ['Hello'] }],
    [{ ...valid, subject: 's'.repeat(201) }], [{ ...valid, subject: '😀'.repeat(101) }],
    [{ ...valid, fullName: '😀'.repeat(101) }],
  ])('invalid %#', (body) => same('post', '/api/contact', { body }));

  test.each([
    ['get', '/api/contact'], ['put', '/api/contact'], ['post', '/api/contact/x'],
  ])('%s %s', (method, url) => same(method, url));

  test('malformed JSON is the error handler\'s 500', () =>
    same('post', '/api/contact', { headers: { 'Content-Type': 'application/json' }, raw: '{"a":' }));
});

// ---------------------------------------------------------------------------
// /api/unsubscribe
// ---------------------------------------------------------------------------

describeIfRust('unsubscribe: Node and Rust answer identically', () => {
  const token = (email) => buildUnsubscribeToken(email);
  const row = async (email) => (await query(
    'SELECT id, email, token, scope, reason, unsubscribed_at IS NOT NULL AS dated FROM email_unsubscribes WHERE email = ?',
    [email]))[0];
  const q = (params) => `/api/unsubscribe?${params}`;
  const enc = encodeURIComponent;

  test('GET: valid links, and what qs makes of odd query strings', async () => {
    const email = mail('read');
    await same('get', q(`email=${enc(email)}&token=${enc(token(email))}`));
    await same('get', q(`email=${enc(` ${email.toUpperCase()} `)}&token=${enc(token(email))}`));
    // String(['x']) is 'x'; String(['a','b']) is 'a,b'; String({}) is '[object Object]'.
    await same('get', q(`email[]=${enc(email)}&token=${enc(token(email))}`));
    await same('get', q(`email=a&email=b&token=${enc(token('a,b'))}`));
    await same('get', q(`email[x]=1&token=${enc(token('[object Object]'))}`));
    await same('get', q(`email=${enc(email)}&token[]=${enc(token(email))}`));
    await same('get', q(`email=${enc(email)}&token=${enc(token(email))}&token=x`));
    await same('get', q(`[email]=${enc(email)}&token=${enc(token(email))}`));
  });

  test.each([
    [''], ['email=a%40b.co'], ['token=abc'], ['email=a%40b.co&token=abc'], ['email=&token=abc'],
    ['email=a%40b.co&token='], ['email=%E0&token=x'], [`email=a%40b.co&token=${'x'.repeat(43)}`],
    ['email[]=&token=x'], ['email=a%40b.co&token[x]=1'],
  ])('GET invalid ?%s', (params) => same('get', q(params)));

  test('POST: unsubscribe, the row, re-unsubscribe, status, resubscribe', async () => {
    const e = (side) => mail(side, 'u1');
    // Invalid token: nothing recorded.
    await same('post', '/api/unsubscribe', (side) => ({ body: { email: e(side), token: 'nope' } }));
    expect(await row(e('node'))).toBeUndefined();
    expect(await row(e('rust'))).toBeUndefined();

    const reason = `${'r'.repeat(254)}😀tail`;
    await same('post', '/api/unsubscribe', (side) => ({
      body: { email: e(side).toUpperCase(), token: token(e(side)), scope: 'marketing', reason },
    }));
    const compareRows = async () => {
      const [n, r] = [await row(e('node')), await row(e('rust'))];
      expect(n).toBeTruthy();
      expect(n.id).toMatch(/^UNSB\d+$/);
      expect(r.id).toMatch(/^UNSB\d+$/);
      expect(r.token).toBe(token(e('rust')));
      expect(n.token).toBe(token(e('node')));
      const view = (x) => norm({ ...x, id: 'ID', token: 'TOKEN' });
      expect(view(r)).toEqual(view(n));
      return n;
    };
    const first = await compareRows();
    expect(first.scope).toBe('marketing');
    expect(first.reason).toBe(`${'r'.repeat(254)}\ufffd`);

    // Again with an invalid scope and no reason: scope resets, reason stays.
    await same('post', '/api/unsubscribe', (side) => ({ body: { email: e(side), token: token(e(side)), scope: ['all'], reason: 5 } }));
    const second = await compareRows();
    expect(second.scope).toBe('all');
    expect(second.reason).toBe(first.reason);

    await same('get', (side) => q(`email=${enc(e(side))}&token=${enc(token(e(side)))}`));

    await same('post', '/api/unsubscribe/resubscribe', (side) => ({ body: { email: e(side), token: 'bad' } }));
    expect(await row(e('rust'))).toBeTruthy();
    await same('post', '/api/unsubscribe/resubscribe', (side) => ({ body: { email: e(side), token: token(e(side)) } }));
    expect(await row(e('node'))).toBeUndefined();
    expect(await row(e('rust'))).toBeUndefined();
    await same('get', (side) => q(`email=${enc(e(side))}&token=${enc(token(e(side)))}`));
  });

  test('POST urlencoded (a one-click form post)', async () => {
    const e = (side) => mail(side, 'u2');
    await same('post', '/api/unsubscribe', (side) => ({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      raw: `email=${enc(e(side))}&token=${enc(token(e(side)))}&scope=marketing`,
    }));
    const [n, r] = [await row(e('node')), await row(e('rust'))];
    expect(norm({ ...r, id: 'ID', token: 'T' })).toEqual(norm({ ...n, id: 'ID', token: 'T' }));
    await same('post', '/api/unsubscribe/resubscribe', (side) => ({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      raw: `email=${enc(e(side))}&token=${enc(token(e(side)))}`,
    }));
    expect(await row(e('rust'))).toBeUndefined();
  });

  test.each([
    [{}], [{ email: 'a@b.co' }], [{ email: 'a@b.co', token: 5 }], [{ email: 'a@b.co', token: ['x'] }],
    [{ email: 5, token: 'x' }], [{ email: { a: 1 }, token: 'x' }], [{ email: ['A@B.co', 'c'], token: 'x' }],
    [{ email: 0, token: 'x' }], [{ email: '   ', token: 'x' }], [[]],
  ])('POST invalid %j (never recorded)', async (body) => {
    await same('post', '/api/unsubscribe', { body });
    await same('post', '/api/unsubscribe/resubscribe', { body });
  });

  test('a token for one address does not work for another', async () => {
    await same('post', '/api/unsubscribe', (side) => ({ body: { email: mail(side, 'u3'), token: token(mail('other', 'u3')) } }));
    expect(await row(mail('node', 'u3'))).toBeUndefined();
    expect(await row(mail('rust', 'u3'))).toBeUndefined();
  });

  test.each([
    ['get', '/api/unsubscribe/resubscribe'], ['put', '/api/unsubscribe'], ['delete', '/api/unsubscribe/'],
    ['post', '/api/unsubscribe/other'], ['get', '/api/unsubscribe/x/y'],
  ])('%s %s', (method, url) => same(method, url));
});

// ---------------------------------------------------------------------------
// /api/shipping (FedEx not configured: static rates, mock labels/tracking)
// ---------------------------------------------------------------------------

const ADDRESS = {
  first_name: 'Ann', last_name: 'Lee', address_line_1: '1 Main St', city: 'Boston', state: 'MA',
  postal_code: '02101', country: 'US', phone: '5551234',
};

async function makeOrder(id, address) {
  await DatabaseUtil.executeQuery('DELETE FROM orders WHERE id = ?', [id]);
  const res = await DatabaseUtil.executeQuery(
    `INSERT INTO orders (id, order_number, status, subtotal, total_amount, shipping_address_json, billing_address_json)
     VALUES (?, ?, 'processing', 10, 10, ?, '{}')`, [id, `NOR-${id}`, address]);
  if (!res.success) throw new Error(res.error);
}
const orderRow = async (id) => (await query(
  'SELECT status, tracking_number, shipped_at IS NOT NULL AS shipped FROM orders WHERE id = ?', [id]))[0];

describeIfRust('shipping: Node and Rust answer identically', () => {
  const dest = { postalCode: '10001', city: 'New York', stateOrProvinceCode: 'NY', countryCode: 'US' };

  test.each([
    [{ destination: dest }], [{ destination: dest, items: [{ weight: 5 }] }], [{ destination: dest, items: [] }],
    [{ destination: { postalCode: 10001 } }], [{}], [{ destination: '10001' }], [{ destination: { postalCode: '' } }],
    [{ destination: { postalCode: 0 } }], [{ destination: [] }], [{ destination: null }],
    // Where Node's items.map throws, the route answers the fallback rates.
    [{ destination: dest, items: [null] }], [{ destination: dest, items: 'abc' }], [{ destination: dest, items: { length: 2 } }],
    [{ destination: dest, items: { length: '3' } }], [{ destination: dest, items: { length: 0 } }],
    [{ destination: dest, items: { length: [1] } }], [{ destination: dest, items: { length: {} } }],
    [{ destination: dest, items: 5 }], [{ destination: dest, items: true }], [{ destination: dest, items: [1, 'a', [], {}] }],
    [[1]],
  ])('POST /rates %j', (body) => same('post', '/api/shipping/rates', { body }));

  test('POST /rates urlencoded and malformed', async () => {
    await same('post', '/api/shipping/rates', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, raw: 'destination[postalCode]=10001&items[0][weight]=3',
    });
    await same('post', '/api/shipping/rates', { headers: { 'Content-Type': 'application/json' }, raw: '[' });
  });

  test.each([
    ['/api/shipping/track/ABC123'], ['/api/shipping/track/a%20b%2Fc'], ['/api/shipping/track/%E0%A4%A'],
    ['/api/shipping/track/%zz'], ['/api/shipping/track/x/'], ['/api/shipping/track/'], ['/api/shipping/track/a/b'],
    ['/api/shipping/track'], ['/api/shipping'], ['/api/shipping/'], ['/api/shipping/rates'], ['/api/shipping/create-label'],
  ])('GET %s', (url) => same('get', url, {}, { errorText: false }));

  test.each([
    ['post', '/api/shipping/track/ABC'], ['put', '/api/shipping/rates'], ['delete', '/api/shipping/nope'],
  ])('%s %s', (method, url) => same(method, url));

  describe('create-label', () => {
    let admin; let customer; let csrf; let staffToken;
    const adminHeaders = () => ({ ...bearer(admin), 'X-CSRF-Token': csrf, Cookie: `csrf_token=${csrf}` });

    beforeAll(async () => {
      admin = (await login('admin')).accessToken;
      customer = (await login('customer')).accessToken;
      staffToken = (await login('staff')).accessToken;
      csrf = (await request(app).get('/api/users/csrf-token').set(bearer(admin))).body.keyValueTable.csrfToken;
      expect(csrf).toBeTruthy();
    });

    test('auth and CSRF denials', async () => {
      const body = { orderId: 'ORD-NOPE' };
      await same('post', '/api/shipping/create-label', { body });
      await same('post', '/api/shipping/create-label', { body, headers: bearer('not.a.jwt') });
      await same('post', '/api/shipping/create-label', { body, headers: bearer(customer) });
      await same('post', '/api/shipping/create-label', { body, headers: bearer(staffToken) });
      await same('post', '/api/shipping/create-label', { body, headers: bearer(admin) });
      await same('post', '/api/shipping/create-label', { body, headers: { ...bearer(admin), 'X-CSRF-Token': csrf } });
      await same('post', '/api/shipping/create-label', { body, headers: { ...adminHeaders(), 'X-CSRF-Token': 'other' } });
      await same('post', '/api/shipping/create-label', { body, headers: { ...bearer(customer), 'X-CSRF-Token': csrf, Cookie: `csrf_token=${csrf}` } });
      // The body parser runs before auth: a malformed body is a 500 even unauthenticated.
      await same('post', '/api/shipping/create-label', { headers: { 'Content-Type': 'application/json' }, raw: '{x' }, { errorText: true });
    });

    test.each([
      [{}], [{ orderId: '' }], [{ orderId: 5 }], [{ orderId: ['ORD'] }], [{ orderId: { a: 1 } }], [{ orderId: null }],
      [{ orderId: 'ORD-DOES-NOT-EXIST' }],
    ])('invalid %j', (body) => same('post', '/api/shipping/create-label', { body, headers: adminHeaders() }));

    test('a mock label marks each side\'s order shipped', async () => {
      const id = (side) => `ORDMISC${side === 'node' ? 'N' : 'R'}${STAMP}`;
      for (const side of SIDES) await makeOrder(id(side), JSON.stringify(ADDRESS));
      const { node, rust } = await same('post', '/api/shipping/create-label', (side) => ({
        body: { orderId: id(side), serviceType: 'FEDEX_2_DAY' }, headers: adminHeaders(),
      }));
      expect(node.body.keyValueTable.isMock).toBe(true);
      const [n, r] = [await orderRow(id('node')), await orderRow(id('rust'))];
      expect(n).toEqual({ status: 'shipped', tracking_number: node.body.keyValueTable.trackingNumber, shipped: 1 });
      expect(r).toEqual({ status: 'shipped', tracking_number: rust.body.keyValueTable.trackingNumber, shipped: 1 });
    });

    test.each([
      ['a JSON null address', 'null'],
      ['a JSON string that is not JSON', '"abc"'],
      ['a JSON string holding JSON', JSON.stringify(JSON.stringify({ city: 'X', first_name: 5 }))],
      ['a number', '5'],
      ['an array', '[1]'],
      ['odd field types', JSON.stringify({ first_name: ['A', 'B'], last_name: { x: 1 }, phone: 0, city: null })],
    ])('an order with %s', async (_label, address) => {
      const id = (side) => `ORDMISC${side === 'node' ? 'N' : 'R'}${STAMP}X${address.length}`;
      for (const side of SIDES) await makeOrder(id(side), address);
      await same('post', '/api/shipping/create-label', (side) => ({ body: { orderId: id(side) }, headers: adminHeaders() }));
      const [n, r] = [await orderRow(id('node')), await orderRow(id('rust'))];
      expect(norm(r)).toEqual(norm(n));
    });

    test('urlencoded body', async () => {
      const id = (side) => `ORDMISC${side === 'node' ? 'N' : 'R'}${STAMP}F`;
      for (const side of SIDES) await makeOrder(id(side), JSON.stringify(ADDRESS));
      await same('post', '/api/shipping/create-label', (side) => ({
        headers: { ...adminHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' }, raw: `orderId=${id(side)}`,
      }));
    });

    afterAll(async () => {
      await DatabaseUtil.executeQuery("DELETE FROM orders WHERE id LIKE 'ORDMISC%'");
    });
  });
});

// ---------------------------------------------------------------------------
// Spawned servers: the carrier limiter, FedEx configured, PORT in /health
// ---------------------------------------------------------------------------

const describeIfSpawn = RUST && P.rustBin() ? describe : describe.skip;
const BASE = Number(process.env.PARITY_MISC_BASE_PORT || 7135);

describeIfSpawn('shipping carrier limiter: Node and Rust answer alike when enabled', () => {
  const env = { NODE_ENV: 'production', SHIPPING_RATE_LIMIT_MAX: '2', TRUST_PROXY: '1' };
  let node; let rust;
  beforeAll(async () => {
    [node, rust] = await Promise.all([
      P.startNode({ port: BASE, env }),
      P.startRust({ port: BASE + 1, env }),
    ]);
  }, 60000);
  afterAll(async () => { await Promise.all([node?.stop(), rust?.stop()]); });

  const hit = async (base, method, url, xff, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'X-Forwarded-For': xff, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  // Answers other than the 429 are compared normalized (mock tracking times).
  const comparable = (x) => (x.status === 429 ? x : { ...x, text: JSON.stringify(norm(parseJson(x.text))) });
  const sameLimit = async (method, url, xff, label, body) => {
    const n = await hit(node.url, method, url, xff, body);
    const r = await hit(rust.url, method, url, xff, body);
    P.expectSameRateLimit(comparable(n), comparable(r), `${label}: ${method} ${url}`);
    return { n, r };
  };

  test('rates and tracking share one bucket; other routes are not counted', async () => {
    const client = `198.18.0.${10 + (Date.now() % 200)}`;
    const body = { destination: { postalCode: '10001' } };
    expect((await sameLimit('POST', '/api/shipping/rates', client, '1', body)).n.status).toBe(200);
    // A 404 on the group is not behind the carrier limiter.
    await sameLimit('GET', '/api/shipping/rates', client, '404');
    expect((await sameLimit('GET', '/api/shipping/track/NOPE', client, '2')).n.status).toBe(200);
    const limited = await sameLimit('POST', '/api/shipping/rates', client, 'over', body);
    expect(limited.n.status).toBe(429);
    expect(JSON.parse(limited.r.text)).toEqual({ status: 'FAIL', message: 'Too many shipping requests, please try again shortly' });
    const other = await sameLimit('POST', '/api/shipping/rates', client.replace('198.18', '198.19'), 'other client', body);
    expect(other.n.status).toBe(200);
  });
});

describeIfSpawn('FedEx configured: same requests to FedEx, same answers', () => {
  // One fake FedEx per side, each recording what it was sent.
  const RATE_REPLY = {
    output: { rateReplyDetails: [
      { serviceType: 'FEDEX_GROUND', serviceName: 'FedEx Ground', commit: { dateDetail: { dayFormat: 'MON' } }, ratedShipmentDetails: [{ totalNetCharge: '12.50', currency: 'USD' }] },
      { serviceType: 'PRIORITY_OVERNIGHT', ratedShipmentDetails: [{ totalNetCharge: 45.1 }] },
    ] },
  };
  const SHIP_REPLY = { output: { transactionShipments: [{ pieceResponses: [{ trackingNumber: '794612345678', packageDocuments: [{ url: 'https://fedex.test/label.pdf' }] }] }] } };
  const TRACK_REPLY = { output: { completeTrackResults: [{ trackResults: [{
    latestStatusDetail: { code: 'IT', description: 'In transit' },
    estimatedDeliveryTimeWindow: { window: { ends: '2026-11-02T20:00:00Z' } },
    scanEvents: [{ date: '2026-10-30T10:00:00Z', eventDescription: 'Picked up', scanLocation: { city: 'Memphis', stateOrProvinceCode: 'TN' } }],
  }] }] } };

  const fakes = {};
  const startFake = () => new Promise((resolve) => {
    const seen = [];
    let trackFails = false;
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        seen.push({
          method: req.method, path: req.url,
          headers: { 'content-type': req.headers['content-type'], authorization: req.headers.authorization, 'x-locale': req.headers['x-locale'] },
          body: parseJson(data) ?? data,
        });
        const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (req.url === '/oauth/token') return reply(200, { access_token: 'tok-1', expires_in: 3600 });
        if (req.url === '/rate/v1/rates/quotes') return reply(200, RATE_REPLY);
        if (req.url === '/ship/v1/shipments') return reply(200, SHIP_REPLY);
        if (req.url === '/track/v1/trackingnumbers') return trackFails ? reply(503, 'down') : reply(200, TRACK_REPLY);
        return reply(404, {});
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({
      server, seen, url: `http://127.0.0.1:${server.address().port}`, failTracking: (v) => { trackFails = v; },
    }));
  });

  let node; let rust; let admin; let csrf;
  beforeAll(async () => {
    [fakes.node, fakes.rust] = [await startFake(), await startFake()];
    const env = (side) => ({
      NODE_ENV: 'test', FEDEX_API_URL: fakes[side].url, FEDEX_CLIENT_ID: 'client id&1',
      FEDEX_CLIENT_SECRET: 'se cret+/=', FEDEX_ACCOUNT_NUMBER: '740561073',
    });
    [node, rust] = await Promise.all([
      P.startNode({ port: BASE + 2, env: env('node') }),
      P.startRust({ port: BASE + 3, env: env('rust') }),
    ]);
    admin = (await login('admin')).accessToken;
    csrf = (await request(app).get('/api/users/csrf-token').set(bearer(admin))).body.keyValueTable.csrfToken;
  }, 60000);
  afterAll(async () => {
    await Promise.all([node?.stop(), rust?.stop()]);
    for (const f of Object.values(fakes)) f.server.close();
    await DatabaseUtil.executeQuery("DELETE FROM orders WHERE id LIKE 'ORDFDX%'");
  });

  const both = async (method, url, side2opts) => {
    const out = {};
    for (const side of SIDES) {
      const { headers = {}, body } = side2opts(side);
      const res = await fetch((side === 'node' ? node : rust).url + url(side), {
        method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...headers }, body: body && JSON.stringify(body),
      });
      out[side] = { status: res.status, body: parseJson(await res.text()) };
    }
    expect(norm(out.rust)).toEqual(norm(out.node));
    // What each sent to its FedEx since the last step.
    expect(fakes.rust.seen.splice(0)).toEqual(fakes.node.seen.splice(0));
    return out;
  };

  test('rates, label, tracking and a tracking failure', async () => {
    const rates = await both('POST', () => '/api/shipping/rates', () => ({
      body: { destination: { postalCode: '02101', city: 'Boston', streetLines: ['1 Main'] }, items: [{ weight: 3 }, { weight: '4', height: 9 }] },
    }));
    expect(rates.node.body.keyValueTable.isFallback).toBe(false);
    expect(rates.node.body.keyValueTable.rates[0].rate).toBe(12.5);

    const id = (side) => `ORDFDX${side === 'node' ? 'N' : 'R'}${STAMP}`;
    for (const side of SIDES) await makeOrder(id(side), JSON.stringify(ADDRESS));
    const label = await both('POST', () => '/api/shipping/create-label', (side) => ({
      body: { orderId: id(side) }, headers: { ...bearer(admin), 'X-CSRF-Token': csrf, Cookie: `csrf_token=${csrf}` },
    }));
    expect(label.node.body.keyValueTable).toEqual({ trackingNumber: '794612345678', labelUrl: 'https://fedex.test/label.pdf', isMock: false });
    expect(await orderRow(id('rust'))).toEqual(await orderRow(id('node')));
    expect((await orderRow(id('node'))).tracking_number).toBe('794612345678');

    const track = await both('GET', () => '/api/shipping/track/794612345678', () => ({}));
    expect(track.node.body.keyValueTable.events[0].location).toBe('Memphis, TN');

    for (const f of Object.values(fakes)) f.failTracking(true);
    const failed = await both('GET', () => '/api/shipping/track/X1', () => ({}));
    expect(failed.node.status).toBe(500);
    expect(failed.node.body.message).toBe('FedEx tracking lookup failed');
  });
});

describeIfSpawn('status: PORT is reported the same way', () => {
  let node; let rust;
  beforeAll(async () => {
    [node, rust] = await Promise.all([
      P.startNode({ port: BASE + 4, env: { NODE_ENV: 'test' } }),
      // The same PORT value as the Node process (Rust listens on API_PORT).
      P.startRust({ port: BASE + 5, env: { NODE_ENV: 'test', PORT: String(BASE + 4) } }),
    ]);
  }, 60000);
  afterAll(async () => { await Promise.all([node?.stop(), rust?.stop()]); });

  test('GET /api/status/health', async () => {
    const get = async (base) => (await fetch(`${base}/api/status/health`)).json();
    const [n, r] = [await get(node.url), await get(rust.url)];
    const view = (b) => ({ ...b, keyValueTable: { ...b.keyValueTable, uptime: b.keyValueTable.uptime.replace(/[\d.e+-]+/, 'N') } });
    expect(view(r)).toEqual(view(n));
    expect(n.keyValueTable.port).toBe(String(BASE + 4));
  });
});

// ---------------------------------------------------------------------------
// Node bug fix (runs without Rust too)
// ---------------------------------------------------------------------------

describe('create-label records the label on the order (Node)', () => {
  test('the order is marked shipped with the tracking number', async () => {
    const admin = (await login('admin')).accessToken;
    const csrf = (await request(app).get('/api/users/csrf-token').set(bearer(admin))).body.keyValueTable.csrfToken;
    const id = `ORDMISCB${STAMP}`;
    await makeOrder(id, JSON.stringify(ADDRESS));
    const res = await request(app).post('/api/shipping/create-label')
      .set(bearer(admin)).set('X-CSRF-Token', csrf).set('Cookie', `csrf_token=${csrf}`)
      .send({ orderId: id });
    expect(res.status).toBe(200);
    // Before the fix the UPDATE named a column orders does not have
    // (shipping_carrier), failed silently, and the order never changed.
    expect(await orderRow(id)).toEqual({ status: 'shipped', tracking_number: res.body.keyValueTable.trackingNumber, shipped: 1 });
    await DatabaseUtil.executeQuery('DELETE FROM orders WHERE id = ?', [id]);
  });
});
