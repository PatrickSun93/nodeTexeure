// Node ↔ Rust parity for /api/admin/analytics: routes/analyticsRoutes.js (its
// own mount, `protect, admin`, no limiter) and the three routes of
// routes/admin/analytics.js that are reached by falling through to the
// /api/admin router (`protect, staffOrAdmin`, adminLimiter, CSRF, then
// `admin, adminReadLimiter`). Rust: rust/crates/api/src/routes/admin/
// {analytics_routes,analytics}.rs and src/js_date.rs (getDateRange).
//
// Runs when RUST_API_URL is set and the API binary is built; the file starts a
// Rust API of its own (fresh admin limiters, see backOffice() in parityHelpers.js).
// Both sides run in this machine's time zone (the Rust child inherits it).
//
// These routes are read-only (no DB side effects to compare). Fixture orders
// with unusual addresses, guests and old dates are added for the run and
// removed afterwards; both sides read them.
const { DatabaseUtil } = require('./helpers');
const P = require('./parityHelpers');

const BO = P.backOffice();
const A = '/api/admin/analytics';

const RANGE_ROUTES = [
  'sales-summary', 'revenue-trend', 'top-products', 'customer-stats', 'revenue-by-category',
  'revenue-by-weekday', 'bottom-products', 'conversion-funnel', 'new-vs-returning', 'revenue-shortfall',
];
const ALL_ROUTES = [...RANGE_ROUTES, 'inventory-status', 'revenue-vs-target'];
const FALLTHROUGH = ['summary', 'revenue', 'sales-by-region'];

// keyValueTable.period carries `new Date()` values taken a few ms apart on the
// two sides, and so does the 404's keyValueTable.timestamp; everything else
// must be identical (BO.same already compares with timestamps normalized).
function withoutNow(body) {
  if (!body || !body.keyValueTable || Array.isArray(body.keyValueTable)) return body;
  const { period, ...rest } = body.keyValueTable;
  if (body.message === 'Endpoint not found') delete rest.timestamp;
  return { ...body, keyValueTable: rest };
}

async function same(url, opts = {}, { exact = false } = {}) {
  const { node, rust } = await BO.same('get', url, { as: 'admin', ...opts });
  const view = (r) => ({ status: r.status, body: exact ? r.body : withoutNow(r.body) });
  expect({ url, ...view(rust) }).toEqual({ url, ...view(node) });
  return { node, rust };
}

const FIXTURE = 'ZZANA';
const DAY = 24 * 3600 * 1000;

async function addFixtures() {
  const user = DatabaseUtil.first(await DatabaseUtil.executeQuery(
    "SELECT id FROM users WHERE email = 'alice.customer@example.com'"));
  const rows = [
    // [suffix, user, status, total, daysAgo, shipping_address_json (SQL JSON text)]
    ['01', null, 'delivered', '19.99', 2, '{"state": 5}'],
    ['02', null, 'pending', '0.125', 3, '{"state": "Unknown"}'],
    ['03', user.id, 'shipped', '10.005', 4, '{"state": "toString"}'],
    ['04', user.id, 'processing', '33.33', 5, '{"state": "toString"}'],
    ['05', null, 'confirmed', '1.00', 6, '{"state": "constructor"}'],
    ['06', null, 'refunded', '50.00', 7, '{"state": "__proto__"}'],
    ['07', null, 'delivered', '7.77', 8, '{"state": "10"}'],
    ['08', null, 'delivered', '8.88', 9, '{"state": "2"}'],
    ['09', null, 'delivered', '9.99', 10, '{"state": ""}'],
    ['10', null, 'delivered', '1.11', 11, '{"state": null}'],
    ['11', null, 'delivered', '2.22', 12, '{"city": "x"}'],
    ['12', null, 'delivered', '3.33', 13, '"{\\"state\\": \\"NY\\"}"'],
    ['13', null, 'delivered', '4.44', 14, '"not json"'],
    ['14', null, 'delivered', '5.55', 15, '["CA"]'],
    ['15', null, 'delivered', '6.66', 16, '42'],
    ['16', null, 'delivered', '7.00', 17, '{"state": ["CA", "TX"]}'],
    ['17', null, 'delivered', '8.00', 18, '{"state": {"a": 1}}'],
    ['18', null, 'cancelled', '99.00', 1, '{"state": "WA"}'],
    ['19', user.id, 'delivered', '120.50', 400, '{"state": "CA"}'],
    ['20', null, 'delivered', '15.00', 200, '{"state": "CA"}'],
    ['21', null, 'delivered', '2.50', 0.01, '{"state": 0}'],
    ['22', null, 'delivered', '12345678.91', 330, '{"state": 1e21}'],
  ];
  for (const [n, userId, status, total, daysAgo, addr] of rows) {
    const r = await DatabaseUtil.executeQuery(
      `INSERT INTO orders (id, order_number, user_id, status, subtotal, tax_amount, shipping_amount, discount_amount,
         total_amount, shipping_address_json, billing_address_json, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, CAST(? AS JSON), '{}', ?)`,
      [`${FIXTURE}${n}`, `${FIXTURE}-${n}`, userId, status, total, total, addr, new Date(Date.now() - daysAgo * DAY)]);
    if (!r.success) throw new Error(`fixture ${n}: ${r.error}`);
  }
}

async function removeFixtures() {
  await DatabaseUtil.executeQuery(`DELETE FROM orders WHERE id LIKE '${FIXTURE}%'`);
}

P.describeBackOffice('/api/admin/analytics', () => {
  beforeAll(async () => {
    await removeFixtures();
    await BO.start();
  }, 60000);
  afterAll(async () => {
    await BO.stop();
    await removeFixtures();
  });

  describe('guards: analyticsRoutes is protect + admin, no limiter', () => {
    test.each(ALL_ROUTES)('anonymous %s', (r) => BO.same('get', `${A}/${r}`));
    test.each(ALL_ROUTES)('forged token %s', (r) => BO.same('get', `${A}/${r}`, { headers: P.bearer('not.a.jwt') }));
    test.each(ALL_ROUTES)('customer %s', (r) => BO.same('get', `${A}/${r}`, { as: 'customer' }));
    test.each(ALL_ROUTES)('staff %s', (r) => BO.same('get', `${A}/${r}`, { as: 'staff' }));
    test('the admin_auth cookie works like the header', () => BO.same('get', `${A}/sales-summary`, {
      headers: { Cookie: `admin_auth=${BO.sessions.admin.token}` },
    }));
    test('a revoked session', async () => {
      const s = await BO.throwaway('admin');
      await DatabaseUtil.executeQuery('UPDATE users SET token_version = token_version + 1 WHERE email = ?', [s.email]);
      await BO.same('get', `${A}/inventory-status`, { as: s });
    });
  });

  describe('guards: the fall-through routes are behind the /api/admin router', () => {
    test.each(FALLTHROUGH)('anonymous %s', (r) => BO.same('get', `${A}/${r}`));
    test.each(FALLTHROUGH)('customer %s', (r) => BO.same('get', `${A}/${r}`, { as: 'customer' }));
    // staff pass the router's staffOrAdmin but not the route's admin
    test.each(FALLTHROUGH)('staff %s', (r) => BO.same('get', `${A}/${r}`, { as: 'staff' }));
    test.each(FALLTHROUGH)('admin %s', (r) => same(`${A}/${r}`, {}, { exact: true }));
    test('GET needs no CSRF token, a forged one is ignored', () => same(`${A}/summary`, {
      headers: { 'X-CSRF-Token': 'forged', Cookie: 'csrf_token=other' },
    }, { exact: true }));
    test.each([
      ['post', `${A}/summary`, false],
      ['post', `${A}/summary`, true],
      ['put', `${A}/sales-summary`, false],
      ['delete', `${A}/revenue-trend`, true],
      ['post', `${A}/nope`, true],
    ])('%s %s (csrf: %s) falls through to the admin router', (method, url, csrf) =>
      BO.same(method, url, { as: 'admin', csrf }));
    test.each([
      `${A}/nope`, `${A}`, `${A}/`, `${A}/summary/extra`, `${A}/sales-summary/x`,
    ])('admin GET %s: not an analytics route → 404', (url) => BO.same('get', url, { as: 'admin' }));
  });

  describe('Express routing', () => {
    test.each([
      `${A}/Sales-Summary`, `${A}/sales-summary/`, '/API/ADMIN/ANALYTICS/inventory-status',
      '/api/admin//analytics/inventory-status', `${A}//inventory-status`, '/api/Admin/Analytics/Summary/',
    ])('%s', (url) => same(url));
    test.each([`${A}/inventory-status`, `${A}/summary`, `${A}/sales-summary`])('HEAD %s', (url) =>
      BO.same('head', url, { as: 'admin' }));
  });

  describe('with fixture orders', () => {
    beforeAll(addFixtures);

    test.each(ALL_ROUTES)('admin %s (defaults)', (r) => same(`${A}/${r}`));
    test.each(FALLTHROUGH)('admin %s', (r) => same(`${A}/${r}`, {}, { exact: true }));

    const PERIODS = ['today', 'yesterday', 'week', 'month', 'year', 'custom', '', 'bogus', 'MONTH'];
    test.each(RANGE_ROUTES.flatMap((r) => PERIODS.map((p) => [r, p])))('%s period=%s', (r, p) =>
      same(`${A}/${r}?period=${encodeURIComponent(p)}`));
    test.each(RANGE_ROUTES)('%s period[]=year (not a string)', (r) => same(`${A}/${r}?period[]=year`));
    test.each(RANGE_ROUTES)('%s period[a]=b', (r) => same(`${A}/${r}?period[a]=b`));

    // A fixed custom range: the whole answer is deterministic.
    test.each(RANGE_ROUTES)('%s custom 2026-01-01 → 2027-01-01', (r) =>
      same(`${A}/${r}?period=custom&start_date=2026-01-01&end_date=2027-01-01`, {}, { exact: true }));

    const STARTS = [
      'garbage', '2026-10-01T10:00', '2026-10-01 10:00', '10/01/2026', 'Oct 1 2026', 'Thu, 01 Oct 2026 00:00:00 GMT',
      '2026-10-01T00:00:00+05:30', '+010000-01-01', '+070000-01-01', '-000100-01-01', '0000-01-01', '2026-02-31',
      '2026-13-01', '1', '%5Bobject%20Object%5D', '2026-09-01%00x',
    ];
    test.each(RANGE_ROUTES.flatMap((r) => STARTS.map((s) => [r, s])))('%s start_date=%s', (r, s) =>
      same(`${A}/${r}?period=custom&start_date=${s}&end_date=2026-12-31T23:59:59.999Z`, {}, { exact: true }));
    test.each(RANGE_ROUTES.flatMap((r) => [
      'end_date=garbage', 'end_date=%2B070000-01-01', 'end_date=2020-01-01', 'start_date=2027-01-01',
      'start_date[]=2026-09-01&start_date[]=2026-10-01', 'start_date[]=2026-09-01', 'start_date[a]=2026-09-01',
      'start_date=&end_date=', 'start_date', 'end_date[]=',
    ].map((q) => [r, q])))('%s custom %s', (r, q) => same(`${A}/${r}?period=custom&${q}`));
    test.each(RANGE_ROUTES)('%s start/end without period=custom are ignored', (r) =>
      same(`${A}/${r}?start_date=2020-01-01&end_date=2020-02-01`));

    test.each(['hour', 'day', 'week', 'month', 'year', '', 'HOUR'])('revenue-trend group_by=%s', (g) =>
      same(`${A}/revenue-trend?period=year&group_by=${g}`));
    test.each(['group_by[]=hour', 'group_by[a]=b', 'group_by=week&group_by=month', 'group_by'])('revenue-trend %s', (q) =>
      same(`${A}/revenue-trend?period=custom&start_date=2025-01-01&end_date=2027-01-01&${q}`, {}, { exact: true }));

    const LIMITS = ['0', '-1', '1', '3', '100', '101', '1000', 'abc', '5x', '2.9', '', 'limit[]=2', 'limit[a]=2', 'limit=7&limit=1'];
    test.each(['top-products', 'bottom-products'].flatMap((r) => LIMITS.map((l) => [r, l])))('%s limit %s', (r, l) =>
      same(`${A}/${r}?period=year&${l.includes('=') ? l : `limit=${l}`}`));

    const MONTHS = ['1', '2', '12', '24', '25', '0', '-5', 'abc', '3.9', '', 'months[]=3', 'months[a]=3', 'months=6&months=2'];
    test.each(MONTHS)('revenue-vs-target months %s', (m) =>
      same(`${A}/revenue-vs-target?${m.includes('=') ? m : `months=${m}`}`, {}, { exact: true }));

    test('inventory-status ignores the query', () => same(`${A}/inventory-status?period=today&limit=1`, {}, { exact: true }));
  });

  describe('without the fixtures: an empty window', () => {
    beforeAll(removeFixtures);
    test.each(RANGE_ROUTES)('%s over a range with no orders', (r) =>
      same(`${A}/${r}?period=custom&start_date=2000-01-01&end_date=2000-02-01`, {}, { exact: true }));
    test.each(['1', '24'])('revenue-vs-target months=%s', (m) => same(`${A}/revenue-vs-target?months=${m}`, {}, { exact: true }));
    test.each(FALLTHROUGH)('%s', (r) => same(`${A}/${r}`, {}, { exact: true }));
  });

  // Last: it uses up adminLimiter's (100/min) and adminReadLimiter's budget.
  test('the fall-through routes count against adminLimiter and adminReadLimiter, then 429', async () => {
    let limited = 0;
    for (let i = 0; i < 130 && limited < 2; i += 1) {
      const { node } = await BO.same('get', `${A}/summary`, { as: 'admin' });
      if (node.status === 429) limited += 1;
    }
    expect(limited).toBe(2);
    // analyticsRoutes has no limiter: still answers
    const { node } = await same(`${A}/inventory-status`);
    expect(node.status).toBe(200);
  }, 120000);
});
