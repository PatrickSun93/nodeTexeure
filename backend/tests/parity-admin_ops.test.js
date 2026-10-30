// Node ↔ Rust parity for the admin orders / users / settings areas
// (backend/routes/admin/{orders,users,settings}.js →
// rust/crates/api/src/routes/admin/{orders,users,settings}.rs) and the whole
// /api/settings group (routes/systemSettingsRoutes.js → routes/settings.rs).
//
// Runs when RUST_API_URL is set and the API binary is built: backOffice()
// starts a Rust API of this file's own (see parityHelpers.js). The admin
// limiters have no skip in tests, so this file trusts one proxy hop on both
// sides and gives every test its own X-Forwarded-For address: each test starts
// with full adminLimiter / adminRead / adminWrite budgets, and both sides see
// the same request sequence per address (RateLimit-* headers compared).
//
//   (cd ../rust && cargo build -p api) && RUST_API_URL=http://127.0.0.1:7052 DB_HOST=127.0.0.1 \
//     DB_PORT=3307 DB_PASSWORD=noirae_dev DB_NAME=nt_x npx jest tests/parity-admin_ops.test.js
//
// Writes run on separate fixtures per side (ids, emails and setting keys carry
// an `n<ts>` / `r<ts>` tag that the comparisons normalize), or one side after
// the other with the rows restored in between where the rows are fixed (the
// general settings). DB effects are compared field by field.
process.env.TRUST_PROXY = '1';

const bcrypt = require('bcryptjs');
const { DatabaseUtil } = require('./helpers');
const P = require('./parityHelpers');

const BO = P.backOffice();

const TS = Date.now().toString(36);
const TAG = { node: `n${TS}`, rust: `r${TS}` };
const SIDES = ['node', 'rust'];

// --- helpers ------------------------------------------------------------------

async function db(sql, params = []) {
  const r = await DatabaseUtil.executeQuery(sql, params);
  if (!r.success) throw new Error(`${r.error}\n${sql}`);
  return r.data;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const norm = P.normalizer([
  [new RegExp(`[nr]${TS}`, 'g'), 'SIDE'],
  [UUID, 'UUID'],
  [/SHIP\d{10}/g, 'SHIP*'],
  [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'],
]);

// A fresh client address per test: its own limiter buckets on both sides.
let ipCount = 0;
let IP = '10.77.0.1';
beforeEach(() => {
  ipCount += 1;
  IP = `10.77.${Math.floor(ipCount / 250)}.${(ipCount % 250) + 1}`;
});
const withIp = (o = {}) => ({ ...o, headers: { 'X-Forwarded-For': IP, ...(o.headers || {}) } });

/** The same request on both sides (BO.same) from this test's address. */
const same = (method, url, opts) => BO.same(method, url, withIp(opts));

const CLOCK = ['ratelimit-reset', 'x-ratelimit-reset', 'retry-after'];
function rateView(r, other) {
  const h = P.rateLimitHeaders(r.headers);
  const theirs = P.rateLimitHeaders(other.headers);
  for (const k of CLOCK) {
    if (h[k] !== undefined && theirs[k] !== undefined && Math.abs(Number(h[k]) - Number(theirs[k])) <= 1) h[k] = 'CLOCK';
  }
  return h;
}

/**
 * One request per side, each with its own URL / options (fixtures per side):
 * same status, same normalized JSON, same rate-limit headers.
 */
async function pair(method, url, opts = {}) {
  const at = (v, side) => (typeof v === 'function' ? v(side) : v);
  const node = await BO.call('node', method, at(url, 'node'), withIp(at(opts, 'node')));
  const rust = await BO.call('rust', method, at(url, 'rust'), withIp(at(opts, 'rust')));
  const view = (r, other) => ({ label: `${method} ${at(url, 'node')}`, status: r.status, body: norm(r.body), rateLimit: rateView(r, other) });
  expect(view(rust, node)).toEqual(view(node, rust));
  return { node, rust };
}

/** Field-by-field DB comparison of the two sides' fixtures. */
async function sameRows(read) {
  const node = norm(await read('node'));
  const rust = norm(await read('rust'));
  expect(rust).toEqual(node);
  return node;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Node queues emails without awaiting: poll for the rows. */
async function queued(email, expected) {
  let rows = [];
  for (let i = 0; i < 40; i += 1) {
    rows = await db(
      `SELECT to_email, to_name, subject, email_content, template_id, template_data, status, attempts, max_attempts,
              scheduled_at IS NOT NULL AS scheduled
       FROM email_queue WHERE to_email = ? ORDER BY subject, CAST(template_data AS CHAR)`, [email]);
    if (rows.length >= expected) break;
    await wait(50);
  }
  if (expected === 0) await wait(300);
  return db(
    `SELECT to_email, to_name, subject, email_content, template_id, template_data, status, attempts, max_attempts,
            scheduled_at IS NOT NULL AS scheduled
     FROM email_queue WHERE to_email = ? ORDER BY subject, CAST(template_data AS CHAR)`, [email]);
}

const admin = { as: 'admin' };
const adminW = { as: 'admin', csrf: true };
const staffW = { as: 'staff', csrf: true };

// --- fixtures -------------------------------------------------------------------

const ids = (side) => ({
  user: `OPS${TAG[side]}U1`, // order owner (status emails go to the user)
  user2: `OPS${TAG[side]}U2`, // updated / revoked
  user3: `OPS${TAG[side]}U3`, // deleted
  user4: `OPS${TAG[side]}U4`, // owns an order: delete fails on the FK
  email: `ops.${TAG[side]}.1@example.com`,
  guest: `ops.${TAG[side]}.guest@example.com`,
  order: `OPS${TAG[side]}O1`, // user order
  guestOrder: `OPS${TAG[side]}O2`,
  noEmail: `OPS${TAG[side]}O3`,
  bulk1: `OPS${TAG[side]}O4`,
  bulk2: `OPS${TAG[side]}O5`,
  fkOrder: `OPS${TAG[side]}O6`,
  zone: `OPS${TAG[side]}Z1`,
  zoneDel: `OPS${TAG[side]}Z2`,
});

// Shared read fixtures (both sides read the same rows).
const RX = {
  user: `OPSx${TS}U`,
  badAddrUser: `OPSx${TS}B`,
  orders: [`OPSx${TS}A`, `OPSx${TS}B`, `OPSx${TS}C`, `OPSx${TS}D`],
  zones: [`OPSx${TS}ZA`, `OPSx${TS}ZB`, `OPSx${TS}ZC`],
  setting: `ops_x${TS}_`,
};

const HASH = bcrypt.hashSync('Fixture@123', 4);

async function insertUser(id, email, { role = 'customer', first = 'Ops', last = 'Fixture', phone = null } = {}) {
  await db(`INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, phone)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`, [id, email, HASH, first, last, role, phone]);
}

async function insertOrder(id, { userId = null, guest = null, status = 'pending', tracking = null, address = '{"city":"Austin","country":"US"}', total = '120.50' } = {}) {
  await db(`INSERT INTO orders (id, order_number, user_id, guest_email, status, currency, subtotal, tax_amount,
              shipping_amount, discount_amount, total_amount, shipping_address_json, billing_address_json,
              tracking_number, payment_status)
            VALUES (?, ?, ?, ?, ?, 'USD', ?, 0, 0, 0, ?, CAST(? AS JSON), '{}', ?, 'paid')`,
  [id, `NUM-${id}`, userId, guest, status, total, total, address, tracking]);
}

async function cleanup() {
  const like = `%${TS}%`;
  await db('DELETE FROM order_status_history WHERE order_id LIKE ?', [like]);
  await db('DELETE FROM order_items WHERE order_id LIKE ?', [like]);
  await db('DELETE FROM orders WHERE id LIKE ?', [like]);
  await db('DELETE FROM email_queue WHERE to_email LIKE ?', [like]);
  await db('DELETE FROM user_addresses WHERE user_id LIKE ?', [like]);
  await db('DELETE FROM users WHERE id LIKE ? OR email LIKE ?', [like, like]);
  await db('DELETE FROM shipping_rates WHERE zone_id LIKE ? OR id LIKE ?', [like, like]);
  await db('DELETE FROM shipping_zones WHERE id LIKE ? OR name LIKE ?', [like, like]);
  await db('DELETE FROM system_settings WHERE setting_key LIKE ?', [like]);
}

P.describeBackOffice('admin orders / users / settings + /api/settings', () => {
  beforeAll(async () => {
    await BO.start();
    await cleanup();
    for (const side of SIDES) {
      const f = ids(side);
      await insertUser(f.user, f.email, { first: 'Owner' });
      await insertUser(f.user2, `ops.${TAG[side]}.2@example.com`);
      await insertUser(f.user3, `ops.${TAG[side]}.3@example.com`);
      await insertUser(f.user4, `ops.${TAG[side]}.4@example.com`);
      await insertOrder(f.order, { userId: f.user, status: 'pending' });
      await insertOrder(f.guestOrder, { guest: f.guest, status: 'pending', tracking: 'KEEP-ME' });
      await insertOrder(f.noEmail, { status: 'pending' });
      await insertOrder(f.bulk1, { guest: f.guest });
      await insertOrder(f.bulk2, { guest: f.guest, status: 'shipped' });
      await insertOrder(f.fkOrder, { userId: f.user4 });
      await db("INSERT INTO shipping_zones (id, name, countries, is_active) VALUES (?, ?, '[\"US\"]', 1)", [f.zone, `Zone ${TAG[side]}`]);
      await db("INSERT INTO shipping_zones (id, name, countries, is_active) VALUES (?, ?, '[\"CA\"]', 0)", [f.zoneDel, `Gone ${TAG[side]}`]);
      await db("INSERT INTO shipping_rates (id, zone_id, name, base_rate) VALUES (?, ?, 'Std', 9.5)", [`${f.zoneDel}R`, f.zoneDel]);
    }

    // Read fixtures: odd JSON in the columns the routes parse.
    await insertUser(RX.user, `ops.x${TS}@example.com`, { first: 'Reader', last: '', phone: null });
    await db(`INSERT INTO user_addresses (id, user_id, type, first_name, last_name, phone, address_json, is_default) VALUES
      (?, ?, 'shipping', 'A', 'One', NULL, '{"company":"Acme","address_line_1":"1 Silk Way","city":"Austin","state":"TX","postal_code":"73301","country":"US","extra":1.0}', 0),
      (?, ?, 'billing', 'B', 'Two', '555-0101', CAST('"{\\\\"city\\\\":\\\\"Paris\\\\",\\\\"country\\\\":\\\\"FR\\\\"}"' AS JSON), 1),
      (?, ?, 'shipping', 'C', 'Three', '', CAST('"not json"' AS JSON), 0),
      (?, ?, 'shipping', 'D', 'Four', NULL, '7', 0)`,
    [`${RX.user}A1`, RX.user, `${RX.user}A2`, RX.user, `${RX.user}A3`, RX.user, `${RX.user}A4`, RX.user]);
    await insertUser(RX.badAddrUser, `ops.xb${TS}@example.com`);
    await db(`INSERT INTO user_addresses (id, user_id, type, first_name, last_name, address_json) VALUES
      (?, ?, 'shipping', 'N', 'Ull', CAST('"null"' AS JSON))`, [`${RX.badAddrUser}A`, RX.badAddrUser]);
    const [a, b, c, d] = RX.orders;
    await insertOrder(a, { userId: RX.user, status: 'delivered', address: '"{\\"city\\":\\"Lyon\\",\\"country\\":\\"FR\\"}"', total: '10.00' });
    await insertOrder(b, { userId: RX.user, status: 'cancelled', address: '{"city":"  ","country":"DE"}', total: '99.99' });
    await insertOrder(c, { guest: `ops.xg${TS}@example.com`, status: 'shipped', address: '5' });
    await insertOrder(d, { status: 'processing', address: '["Austin"]' });
    await db(`INSERT INTO order_items (id, order_id, product_id, variant_id, bundle_id, product_name, product_sku,
                variant_details, quantity, unit_price, total_price)
              SELECT ?, ?, product_id, variant_id, bundle_id, product_name, product_sku, variant_details, 2, unit_price,
                total_price FROM order_items ORDER BY id LIMIT 1`, [`${a}I`, a]);
    const [za, zb, zc] = RX.zones;
    await db(`INSERT INTO shipping_zones (id, name, countries, is_active) VALUES
      (?, ?, CAST('"[\\\\"FR\\\\", 1.0]"' AS JSON), 1), (?, ?, '{"a":1}', NULL), (?, ?, '["US","CA"]', 0)`,
    [za, `A zone x${TS}`, zb, `B zone x${TS}`, zc, `C zone x${TS}`]);
    const k = RX.setting;
    await db(`INSERT INTO system_settings (id, setting_key, setting_value, setting_type, is_public) VALUES
      (UUID(), ?, '1', 'boolean', 1), (UUID(), ?, 'yes', 'boolean', 0), (UUID(), ?, '12px', 'integer', 1),
      (UUID(), ?, 'abc', 'integer', 0), (UUID(), ?, '1e3x', 'decimal', 1), (UUID(), ?, '10.0', 'decimal', NULL),
      (UUID(), ?, '{"a":1.0,"b":[2.50]}', 'json', 1), (UUID(), ?, '{bad', 'json', 0), (UUID(), ?, NULL, 'string', 1),
      (UUID(), ?, NULL, 'json', 1)`,
    [`${k}bool1`, `${k}bool2`, `${k}int1`, `${k}int2`, `${k}dec1`, `${k}dec2`, `${k}json1`, `${k}json2`, `${k}str`, `${k}jsonnull`]);
  }, 60000);

  afterAll(async () => {
    await cleanup().catch((e) => console.error('cleanup failed', e));
    await BO.stop();
  });

  // ---------------------------------------------------------------------------
  describe('guards: protect, staffOrAdmin, adminLimiter, CSRF, then the route guard', () => {
    const READS = [
      '/api/admin/orders', '/api/admin/orders/ORDER0000000001', '/api/admin/users', '/api/admin/staff',
      '/api/admin/users/NOPE', '/api/admin/settings/general', '/api/admin/settings', '/api/admin/shipping/zones',
    ];
    // [method, url, route guard]
    const WRITES = [
      ['put', '/api/admin/orders/NOPE/status', 'staff'],
      ['post', '/api/admin/orders/bulk-update', 'staff'],
      ['post', '/api/admin/users', 'admin'],
      ['put', '/api/admin/users/NOPE', 'admin'],
      ['delete', '/api/admin/users/NOPE', 'admin'],
      ['put', '/api/admin/settings/general', 'admin'],
      ['post', '/api/admin/settings/bulk-update', 'admin'],
      ['put', '/api/admin/settings/NOPE', 'admin'],
      ['post', '/api/admin/shipping/zones', 'admin'],
      ['put', '/api/admin/shipping/zones/NOPE', 'admin'],
      ['delete', '/api/admin/shipping/zones/NOPE', 'admin'],
    ];

    test.each(READS)('GET %s: anonymous, forged, customer, staff', async (url) => {
      await same('get', url);
      await same('get', url, { headers: P.bearer('not.a.jwt') });
      await same('get', url, { as: 'customer' });
      await same('get', url, { as: 'staff' });
    });

    test.each(WRITES)('%s %s: anonymous, customer, CSRF missing / mismatched, staff', async (method, url, guard) => {
      await same(method, url, { body: {} });
      await same(method, url, { as: 'customer', csrf: true, body: {} });
      await same(method, url, { as: 'staff', body: {} }); // no CSRF token
      await same(method, url, { as: 'admin', body: {} }); // no CSRF token
      await same(method, url, {
        as: 'admin', body: {},
        headers: { 'X-CSRF-Token': BO.sessions.admin.csrf, Cookie: `csrf_token=${encodeURIComponent(BO.sessions.staff.csrf)}` },
      });
      // Staff with a token: the route's own guard (staff routes reach the
      // handler, and `{}` is a 400 there).
      await same(method, url, { ...staffW, body: guard === 'staff' ? {} : { x: 1 } });
    });

    test('HEAD, trailing slash and case-insensitive paths', async () => {
      await same('head', '/api/admin/orders', admin);
      await same('get', '/api/admin/Orders/', admin);
      await same('get', '/api/admin/STAFF', admin);
      await same('get', '/api/admin/shipping/zones/', admin);
      await same('get', '/api/admin/orders/%E0%A4%A', admin); // decodeURIComponent fails: 500
      await same('patch', '/api/admin/orders', admin); // no such route: 404
      await same('get', '/api/admin/settings/general/x', admin); // 404
    });

    test('adminWriteLimiter: the 61st write in a minute is a 429', async () => {
      const statuses = [];
      for (let i = 0; i < 61; i += 1) {
        const { node } = await same('put', '/api/admin/settings/ratelimit-probe', { ...adminW, body: { type: 'nope' } });
        statuses.push(node.status);
      }
      expect([statuses[0], statuses[59], statuses[60]]).toEqual([400, 400, 429]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('orders', () => {
    test('list, filtered by user, and the user_id type check', async () => {
      const all = await same('get', '/api/admin/orders', admin);
      expect(all.node.body.keyValueTable[0].orders.length).toBeGreaterThan(10);
      const mine = await same('get', `/api/admin/orders?user_id=${RX.user}`, admin);
      expect(mine.node.body.keyValueTable[0].orders.map((o) => o.destination).sort()).toEqual(['DE', 'Lyon, FR']);
      await same('get', '/api/admin/orders?user_id=', admin);
      await same('get', '/api/admin/orders?user_id=NOPE', admin);
      await same('get', '/api/admin/orders?user_id=a&user_id=b', admin);
      await same('get', '/api/admin/orders?user_id[x]=1', admin);
    });

    test('detail by id and by order number, items, 404', async () => {
      const statuses = [];
      for (const id of [...RX.orders, `NUM-${RX.orders[0]}`, 'ORDER0000000001', 'EXAMPLE-0002', 'NOPE']) {
        const { node } = await same('get', `/api/admin/orders/${encodeURIComponent(id)}`, admin);
        statuses.push(node.status);
        if (id === RX.orders[0]) expect(node.body.keyValueTable[0].order.items).toHaveLength(1);
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 404]);
    });

    test.each([
      ['missing status', {}],
      ['numeric status', { status: 3 }],
      ['array status', { status: ['shipped'] }],
      ['object status', { status: { a: 1 } }],
      ['unknown status', { status: 'teleported' }],
      ['numeric tracking_number', { status: 'processing', tracking_number: 12345 }],
      ['boolean tracking_number', { status: 'processing', tracking_number: true }],
      ['object tracking_number', { status: 'processing', tracking_number: { a: 1 } }],
      ['array tracking_number', { status: 'processing', tracking_number: ['x'] }],
      ['overlong tracking_number', { status: 'processing', tracking_number: 'T'.repeat(101) }],
      ['tracking_number over 100 UTF-16 units', { status: 'processing', tracking_number: '😀'.repeat(51) }],
    ])('status update: %s → 400, untouched', async (_label, body) => {
      await same('put', `/api/admin/orders/${ids('node').order}/status`, { ...adminW, body });
      const row = await db('SELECT status, tracking_number FROM orders WHERE id = ?', [ids('node').order]);
      expect(row[0].status).toBe('pending');
    });

    test('status update: unknown order → 404, urlencoded body, array body', async () => {
      await same('put', '/api/admin/orders/NOPE/status', { ...adminW, body: { status: 'processing' } });
      await same('put', '/api/admin/orders/NOPE/status', { ...adminW, raw: { type: 'application/x-www-form-urlencoded', text: 'status=processing' } });
      await same('put', '/api/admin/orders/NOPE/status', { ...adminW, raw: { type: 'application/json', text: '["shipped"]' } });
    });

    const orderState = (key) => async (side) => {
      const id = ids(side)[key];
      return {
        order: await db('SELECT id, status, tracking_number FROM orders WHERE id = ?', [id]),
        history: await db(
          // Rows of one second have no order: compare them as a set.
          `SELECT order_id, status, status_details, changed_by FROM order_status_history WHERE order_id = ?
           ORDER BY status, COALESCE(CAST(status_details AS CHAR), '')`, [id]),
      };
    };

    test('user order: Shipped + tracking + notes → one order_shipped email to the user (no direct SES mail)', async () => {
      await pair('put', (s) => `/api/admin/orders/${ids(s).order}/status`, {
        ...adminW, body: { status: 'Shipped', tracking_number: 'TRK-OPS-1', notes: 'left at door' },
      });
      await sameRows(orderState('order'));
      await sameRows((s) => queued(ids(s).email, 1));
      const rows = await queued(ids('node').email, 1);
      expect(rows.map((r) => r.subject)).toEqual([`Your Order Has Shipped - NUM-${ids('node').order}`]);

      // Same status again: still a success (matched rows, not changed rows).
      await pair('put', (s) => `/api/admin/orders/${ids(s).order}/status`, { ...adminW, body: { status: 'shipped' } });
      await sameRows(orderState('order'));
      await sameRows((s) => queued(ids(s).email, 2));
    });

    test('guest order by staff: tracking kept when absent / null / empty, notes as JSON, guest email', async () => {
      const url = (s) => `/api/admin/orders/${ids(s).guestOrder}/status`;
      await pair('put', url, { ...staffW, body: { status: 'confirmed', notes: { b: [1, 2.5], a: 'x' } } });
      await pair('put', url, { ...staffW, body: { status: 'processing', tracking_number: null, notes: '' } });
      await pair('put', url, { ...staffW, body: { status: 'DELIVERED', tracking_number: '', notes: 0 } });
      await pair('put', url, { ...staffW, raw: { type: 'application/json', text: '{"status":"cancelled","notes":[1.0,1e21,"é"]}' } });
      await pair('put', url, { ...staffW, body: { status: 'pending', notes: 42 } }); // no template
      await pair('put', url, { ...staffW, body: { status: 'refunded', tracking_number: 'é'.repeat(100) } }); // no template
      await sameRows(orderState('guestOrder'));
      await sameRows((s) => queued(ids(s).guest, 4));
    });

    test('order without any email: status changes, nothing queued', async () => {
      await pair('put', (s) => `/api/admin/orders/${ids(s).noEmail}/status`, { ...adminW, body: { status: 'shipped' } });
      await sameRows(orderState('noEmail'));
      const left = await db('SELECT COUNT(*) AS n FROM email_queue WHERE subject IN (?, ?)',
        [`Your Order Has Shipped - NUM-${ids('node').noEmail}`, `Your Order Has Shipped - NUM-${ids('rust').noEmail}`]);
      expect(Number(left[0].n)).toBe(0);
    });

    test.each([
      ['no orderIds', { status: 'processing' }],
      ['empty orderIds', { orderIds: [], status: 'processing' }],
      ['string orderIds', { orderIds: 'ORDER0000000001', status: 'processing' }],
      ['numeric id', { orderIds: [1], status: 'processing' }],
      ['object id', { orderIds: [{ id: 'x' }], status: 'processing' }],
      ['nested array id', { orderIds: [['x']], status: 'processing' }],
      ['empty-string id', { orderIds: [''], status: 'processing' }],
      ['array status', { orderIds: ['NOPE'], status: ['processing'] }],
      ['unknown status', { orderIds: ['NOPE'], status: 'lost' }],
      ['missing status', { orderIds: ['NOPE'] }],
    ])('bulk update: %s → 400', (_label, body) => same('post', '/api/admin/orders/bulk-update', { ...adminW, body }));

    test('bulk update: unknown ids skipped, history per order, no emails', async () => {
      await same('post', '/api/admin/orders/bulk-update', { ...adminW, body: { orderIds: ['NOPE-1', 'NOPE-2'], status: 'processing' } });
      await pair('post', '/api/admin/orders/bulk-update', (s) => ({
        ...staffW, body: { orderIds: [ids(s).bulk1, 'NOPE', ids(s).bulk2, ids(s).bulk1], status: 'Delivered', notes: { by: 'bulk' } },
      }));
      await sameRows(orderState('bulk1'));
      await sameRows(orderState('bulk2'));
      await sameRows((s) => queued(ids(s).guest, 4));
    });
  });

  // ---------------------------------------------------------------------------
  describe('users', () => {
    test('customer list, staff list', async () => {
      await same('get', '/api/admin/users', admin);
      await same('get', '/api/admin/staff', admin);
    });

    test('customer detail: addresses flattened, phone fallback, stats; 404; a null address_json is the 500', async () => {
      const { node } = await same('get', `/api/admin/users/${RX.user}`, admin);
      expect(node.body.keyValueTable[0].customer.addresses).toHaveLength(4);
      expect(node.body.keyValueTable[0].customer.user.phone).toBe('555-0101');
      await same('get', '/api/admin/users/USER0000000003', admin);
      await same('get', `/api/admin/users/${ids('node').user}`, admin);
      await same('get', '/api/admin/users/NOPE', admin);
      expect((await same('get', `/api/admin/users/${RX.badAddrUser}`, admin)).node.status).toBe(500);
    });

    const userRow = (email) => db(
      'SELECT email, first_name, last_name, role, status, phone, token_version, email_verified, password_hash FROM users WHERE email = ?', [email]);

    test('create: validation, duplicate, defaults, bcrypt hash, phone optional', async () => {
      for (const body of [
        {},
        { email: 'a@b.co', password: 'x', first_name: 'A' },
        { email: 5, password: 'x', first_name: 'A', last_name: 'B' },
        { email: ['a@b.co'], password: 'x', first_name: 'A', last_name: 'B' },
        { email: 'a@b.co', password: '', first_name: 'A', last_name: 'B' },
        { email: 'a@b.co', password: 'x', first_name: 'A', last_name: 'B', role: 1 },
        { email: 'a@b.co', password: 'x', first_name: 'A', last_name: 'B', phone: 555 },
        { email: 'a@b.co', password: 'x', first_name: 'A', last_name: 'B', status: { a: 1 } },
      ]) await same('post', '/api/admin/users', { ...adminW, body });
      await same('post', '/api/admin/users', { ...adminW, body: { email: 'ALICE.customer@example.com', password: 'x', first_name: 'A', last_name: 'B' } });
      // An unknown role is the ENUM's error: 500, no row.
      await pair('post', '/api/admin/users', (s) => ({
        ...adminW, body: { email: `ops.${TAG[s]}.bad@example.com`, password: 'x', first_name: 'A', last_name: 'B', role: 'superuser' },
      }));
      await sameRows((s) => userRow(`ops.${TAG[s]}.bad@example.com`));

      const cases = [
        ['c1', { password: 'Secret@123', first_name: 'New', last_name: 'Person' }], // no phone (was a 500 on Node)
        ['c2', { password: 'Secret@123', first_name: 'New', last_name: 'Staff', role: 'staff', status: 'inactive', phone: '555-0199' }],
        ['c3', { password: 'Secret@123', first_name: 'New', last_name: 'Null', role: null, status: '', phone: null }],
      ];
      for (const [n, body] of cases) {
        const { node } = await pair('post', '/api/admin/users', (s) => ({ ...adminW, body: { ...body, email: `ops.${TAG[s]}.${n}@example.com` } }));
        expect(node.status).toBe(201);
        const rows = await sameRows(async (s) => (await userRow(`ops.${TAG[s]}.${n}@example.com`))
          .map(({ password_hash: h, ...r }) => ({ ...r, hash: h.slice(0, 7), ok: bcrypt.compareSync(body.password, h) })));
        expect(rows).toEqual([expect.objectContaining({ hash: '$2b$10$', ok: true })]);
      }
    });

    test('update: whitelist, type checks, token_version bump on role/status, unknown id', async () => {
      const url = (s) => `/api/admin/users/${ids(s).user2}`;
      for (const body of [{}, { password_hash: 'x', id: 'y' }, { role: 5 }, { phone: ['x'] }, { first_name: { a: 1 } }]) {
        await pair('put', url, { ...adminW, body });
      }
      await pair('put', url, { ...adminW, raw: { type: 'application/json', text: '[{"role":"admin"}]' } });
      await pair('put', url, { ...adminW, body: { first_name: 'Renamed', phone: null, nope: 1 } });
      await pair('put', url, { ...adminW, body: { last_name: 'Again', status: 'active' } }); // bump
      await pair('put', url, { ...adminW, raw: { type: 'application/x-www-form-urlencoded', text: 'first_name=Form&role=staff' } }); // bump
      await pair('put', url, { ...adminW, body: { email: null } }); // NOT NULL: 500
      await pair('put', url, { ...adminW, body: { role: 'emperor' } }); // ENUM: 500
      await sameRows(async (s) => (await db(
        'SELECT id, email, first_name, last_name, role, status, phone, token_version FROM users WHERE id = ?', [ids(s).user2])));
      await same('put', '/api/admin/users/NOPE', { ...adminW, body: { first_name: 'Ghost' } });
    });

    test('a role change revokes the user\'s tokens on both sides', async () => {
      const victims = { node: await BO.throwaway('staff'), rust: await BO.throwaway('staff') };
      const ok = async (side) => (await BO.call(side, 'get', '/api/admin/nope', withIp({ as: victims[side] }))).status;
      expect([await ok('node'), await ok('rust')]).toEqual([404, 404]);
      const idOf = async (v) => (await db('SELECT id FROM users WHERE email = ?', [v.email]))[0].id;
      const node = await BO.call('node', 'put', `/api/admin/users/${await idOf(victims.node)}`, withIp({ ...adminW, body: { role: 'customer' } }));
      const rust = await BO.call('rust', 'put', `/api/admin/users/${await idOf(victims.rust)}`, withIp({ ...adminW, body: { role: 'customer' } }));
      expect([node.status, rust.status]).toEqual([200, 200]);
      const after = await Promise.all(SIDES.map((s) => BO.call(s, 'get', '/api/admin/nope', withIp({ as: victims[s] }))));
      expect(after.map((r) => [r.status, r.body.message])).toEqual([
        [401, 'Not authorized, token failed'], [401, 'Not authorized, token failed']]);
    });

    test('delete: removes the user (addresses cascade), unknown id is a success, an FK is the 500', async () => {
      await db(`INSERT INTO user_addresses (id, user_id, type, first_name, last_name, address_json)
                VALUES (?, ?, 'shipping', 'X', 'Y', '{}'), (?, ?, 'shipping', 'X', 'Y', '{}')`,
      [`${ids('node').user3}A`, ids('node').user3, `${ids('rust').user3}A`, ids('rust').user3]);
      await pair('delete', (s) => `/api/admin/users/${ids(s).user3}`, adminW);
      await sameRows(async (s) => ({
        users: await db('SELECT id FROM users WHERE id = ?', [ids(s).user3]),
        addresses: await db('SELECT id FROM user_addresses WHERE user_id = ?', [ids(s).user3]),
      }));
      await same('delete', '/api/admin/users/NOPE', adminW);
      await pair('delete', (s) => `/api/admin/users/${ids(s).user4}`, adminW);
      await sameRows((s) => db('SELECT id, email FROM users WHERE id = ?', [ids(s).user4]));
    });
  });

  // ---------------------------------------------------------------------------
  describe('settings', () => {
    const GENERAL = ['store_name', 'support_email', 'currency', 'timezone'];
    const generalRows = () => db(
      'SELECT setting_key, setting_value, setting_type, is_public, updated_by FROM system_settings WHERE setting_key IN (?, ?, ?, ?) ORDER BY setting_key',
      GENERAL);

    test('general, list, and /api/settings reads', async () => {
      await same('get', '/api/admin/settings/general', admin);
      await same('get', '/api/admin/settings', admin);
    });

    // PUT /settings/general writes four fixed rows: Node first, rows restored,
    // then Rust, and the resulting rows compared.
    test.each([
      ['all four', { storeName: 'Ops Store', supportEmail: 'ops@example.com', currency: 'EUR', timezone: 'Europe/Paris' }],
      ['only storeName (the others are refused by mysql2 and left alone)', { storeName: 'Only' }],
      ['numbers, booleans, null, objects', { storeName: 12.5, supportEmail: true, currency: null, timezone: { tz: 'UTC' } }],
      ['empty body', {}],
      ['an array body', '[1]'],
    ])('PUT /settings/general: %s', async (_label, body) => {
      const before = await db('SELECT * FROM system_settings WHERE setting_key IN (?, ?, ?, ?)', GENERAL);
      const restore = async () => {
        await db('DELETE FROM system_settings WHERE setting_key IN (?, ?, ?, ?)', GENERAL);
        for (const r of before) {
          await db('INSERT INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, is_public, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [r.id, r.setting_key, r.setting_value, r.setting_type, r.setting_details === null ? null : JSON.stringify(r.setting_details), r.is_public, r.updated_by]);
        }
      };
      const opts = typeof body === 'string' ? { ...adminW, raw: { type: 'application/json', text: body } } : { ...adminW, body };
      const results = {};
      try {
        for (const side of SIDES) {
          const r = await BO.call(side, 'put', '/api/admin/settings/general', withIp(opts));
          results[side] = { status: r.status, body: r.body, rows: await generalRows(), general: (await BO.call(side, 'get', '/api/admin/settings/general', withIp(admin))).body };
          await restore();
        }
      } finally {
        await restore();
      }
      expect(results.rust).toEqual(results.node);
    });

    const settingRows = (keys) => db(
      `SELECT setting_key, setting_value, setting_type, is_public, updated_by FROM system_settings
       WHERE setting_key IN (${keys.map(() => '?').join(', ')}) ORDER BY setting_key`, keys);
    const key = (s, n) => `ops_${TAG[s]}_${n}`;

    test('PUT /settings/:key: values, types, the type check, an existing row keeps its type', async () => {
      for (const side of SIDES) {
        await db("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), ?, '5', 'integer')", [key(side, 'existing')]);
      }
      const cases = [
        ['s1', { value: 'plain' }],
        ['s2', { value: 42, type: 'integer' }],
        ['s3', { value: true, type: 'boolean' }],
        ['s4', { value: { a: [1, 2.5] }, type: 'json' }],
        ['s5', { value: null }],
        ['s6', {}],
        ['s7', { value: '0.1', type: '' }],
        ['s8', { value: ['a', 1] }],
        ['existing', { value: 'six' }],
        ['bad1', { value: 'x', type: 'blob' }],
        ['bad2', { value: 'x', type: ['json'] }],
        ['bad3', { value: 'x', type: 7 }],
      ];
      for (const [n, body] of cases) {
        await pair('put', (s) => `/api/admin/settings/${key(s, n)}`, { ...adminW, body });
      }
      await pair('put', (s) => `/api/admin/settings/${key(s, 'raw')}`, { ...adminW, raw: { type: 'application/json', text: '{"value":[1.0,1e21,-0],"type":"json"}' } });
      await pair('put', (s) => `/api/admin/settings/${key(s, 'form')}`, { ...adminW, raw: { type: 'application/x-www-form-urlencoded', text: 'value[a]=1&type=json' } });
      await pair('put', (s) => `/api/admin/settings/${key(s, 'existing')}`, { ...adminW, body: { value: 7, type: 'decimal' } });
      // %20 and a 101-character key (VARCHAR(100): the 500).
      await pair('put', (s) => `/api/admin/settings/${key(s, 'sp')}%20x`, { ...adminW, body: { value: 'x' } });
      await pair('put', (s) => `/api/admin/settings/${key(s, 'L')}${'k'.repeat(100)}`, { ...adminW, body: { value: 'x' } });
      await sameRows((s) => settingRows([...cases.map(([n]) => key(s, n)), key(s, 'raw'), key(s, 'form'), `${key(s, 'sp')} x`]));
    });

    test('POST /settings/bulk-update: validation, skipped entries, upserts', async () => {
      for (const body of [{}, { settings: [] }, { settings: 'x' }, { settings: { key: 'a' } }]) {
        await same('post', '/api/admin/settings/bulk-update', { ...adminW, body });
      }
      const entries = (s) => [
        null, 'str', 5, [], { value: 'no key' }, { key: '' }, { key: 0 },
        { key: key(s, 'b_bad'), value: 'x', type: 'nope' }, { key: key(s, 'b_bad2'), value: 'x', type: ['json'] },
        { key: key(s, 'b1'), value: 'one' },
        { key: key(s, 'b2'), value: 2, type: 'integer' },
        { key: key(s, 'b3'), value: { z: [1] }, type: 'json' },
        { key: key(s, 'b4') },
        { key: key(s, 'b5'), value: false, type: 0 },
        { key: key(s, 'b1'), value: 'one again', type: 'string' },
        { key: `${key(s, 'b_long')}${'k'.repeat(100)}`, value: 'too long' },
      ];
      await pair('post', '/api/admin/settings/bulk-update', (s) => ({ ...adminW, body: { settings: entries(s) } }));
      await sameRows((s) => settingRows(['b_bad', 'b_bad2', 'b1', 'b2', 'b3', 'b4', 'b5'].map((n) => key(s, n))));

      // Non-string keys are bound as mysql2 binds them (same rows both sides:
      // one side after the other, cleaned in between).
      const odd = { settings: [{ key: 4242.5, value: 'num' }, { key: true, value: 'bool' }] };
      const out = {};
      for (const side of SIDES) {
        const r = await BO.call(side, 'post', '/api/admin/settings/bulk-update', withIp({ ...adminW, body: odd }));
        out[side] = { status: r.status, body: r.body, rows: await settingRows(['4242.5', '1']) };
        await db("DELETE FROM system_settings WHERE setting_key IN ('4242.5', '1')");
      }
      expect(out.rust).toEqual(out.node);
    });

    test('shipping zones: list (countries parsed, odd JSON tolerated)', async () => {
      const { node } = await same('get', '/api/admin/shipping/zones', admin);
      const mine = node.body.keyValueTable[0].zones.filter((z) => RX.zones.includes(z.id));
      expect(mine.map((z) => [z.countries, z.is_active])).toEqual([[['FR', 1], true], [[], false], [['US', 'CA'], false]]);
    });

    test('shipping zones: create', async () => {
      for (const body of [
        {}, { name: '', countries: [] }, { name: '   ', countries: [] }, { name: 5, countries: [] },
        { name: ['x'], countries: [] }, { name: 'X' }, { name: 'X', countries: 'US' }, { name: 'X', countries: { a: 1 } },
      ]) await same('post', '/api/admin/shipping/zones', { ...adminW, body });
      const made = [];
      for (const [n, extra] of [['z1', {}], ['z2', { is_active: false }], ['z3', { is_active: 'yes' }], ['z4', { is_active: null }]]) {
        const { node, rust } = await pair('post', '/api/admin/shipping/zones', (s) => ({
          ...adminW, body: { name: `  Zone ${TAG[s]} ${n} `, countries: ['US', 'CA', 1.5], ...extra },
        }));
        made.push({ node: node.body.keyValueTable[0].zone.id, rust: rust.body.keyValueTable[0].zone.id });
      }
      await pair('post', '/api/admin/shipping/zones', (s) => ({
        ...adminW, raw: { type: 'application/json', text: `{"name":"Zone ${TAG[s]} raw","countries":[1.0,{"b":1,"a":2}]}` },
      }));
      await pair('post', '/api/admin/shipping/zones', (s) => ({ ...adminW, body: { name: `Zone ${TAG[s]} ${'n'.repeat(100)}`, countries: [] } }));
      await sameRows((s) => db(
        'SELECT name, countries, is_active FROM shipping_zones WHERE name LIKE ? ORDER BY name', [`%Zone ${TAG[s]}%`]));
      expect(made.every((m) => /^SHIP\d{10}$/.test(m.node) && /^SHIP\d{10}$/.test(m.rust))).toBe(true);
    });

    test('shipping zones: update (404 first, then each field) and delete (rates first)', async () => {
      await same('put', '/api/admin/shipping/zones/NOPE', { ...adminW, body: {} });
      await same('put', '/api/admin/shipping/zones/NOPE', { ...adminW, body: { name: '' } });
      const url = (s) => `/api/admin/shipping/zones/${ids(s).zone}`;
      for (const body of [
        {}, { name: '' }, { name: null }, { name: 0 }, { name: false }, { name: [] }, { name: '  ' },
        { countries: null }, { countries: 'US' }, { other: 1 },
      ]) await pair('put', url, { ...adminW, body });
      for (const body of [
        { name: '  Renamed ' }, { name: 5 }, { name: { a: 1 } }, { name: ['a', 'b'] }, { name: true },
        { countries: ['FR', 2.0] }, { is_active: null }, { is_active: 'on' }, { name: 'All', countries: [], is_active: 0 },
      ]) await pair('put', url, { ...adminW, body });
      await sameRows((s) => db('SELECT name, countries, is_active FROM shipping_zones WHERE id = ?', [ids(s).zone]));

      await pair('delete', (s) => `/api/admin/shipping/zones/${ids(s).zoneDel}`, adminW);
      await pair('delete', (s) => `/api/admin/shipping/zones/${ids(s).zoneDel}`, adminW); // gone: 404
      await sameRows(async (s) => ({
        zone: await db('SELECT id FROM shipping_zones WHERE id = ?', [ids(s).zoneDel]),
        rates: await db('SELECT id FROM shipping_rates WHERE zone_id = ?', [ids(s).zoneDel]),
      }));
    });
  });

  // ---------------------------------------------------------------------------
  describe('/api/settings (whole group)', () => {
    test('GET /public (anonymous; typed values)', () => same('get', '/api/settings/public'));

    test('GET /all: 401 / 403 (customer, staff) / admin', async () => {
      await same('get', '/api/settings/all');
      await same('get', '/api/settings/all', { headers: P.bearer('not.a.jwt') });
      await same('get', '/api/settings/all', { as: 'customer' });
      await same('get', '/api/settings/all', { as: 'staff' });
      const { node } = await same('get', '/api/settings/all', admin);
      expect(node.body.keyValueTable[`${RX.setting}json1`]).toEqual({ value: { a: 1, b: [2.5] }, type: 'json', is_public: 1 });
      await same('get', '/api/settings/all', { headers: { Cookie: `admin_auth=${BO.sessions.admin.token}` } });
    });

    test('Express routing: case, trailing slash, HEAD, other methods and paths are the 404', async () => {
      for (const [method, url, opts] of [
        ['get', '/api/settings/PUBLIC/'],
        ['head', '/api/settings/public'],
        ['get', '/api/settings/All', admin],
        ['post', '/api/settings/public'],
        ['put', '/api/settings/all', admin],
        ['get', '/api/settings'],
        ['get', '/api/settings/'],
        ['get', '/api/settings/nope?x=1'],
        ['get', '/api/settings/public/extra'],
        ['delete', '/api/settings/all'],
      ]) await same(method, url, opts);
    });

    test('a body the parsers reject is the 500, before routing', async () => {
      // (fetch can't send a GET body: POST, which is otherwise the 404.)
      // V8's JSON.parse wording isn't copied for every syntax error (express.rs): dropError.
      await same('post', '/api/settings/public', { raw: { type: 'application/json', text: '{bad' }, dropError: true });
      await same('post', '/api/settings/nope', { raw: { type: 'application/json', text: '"str"' } });
      await same('post', '/api/settings/all', { raw: { type: 'application/json; charset=latin1', text: '{}' } });
      await same('post', '/api/settings/public', { raw: { type: 'application/x-www-form-urlencoded', text: 'a=1' } });
    });
  });
});
