// Admin orders API (backend/routes/admin/orders.js): list destination, and type
// validation of client values bound against string columns.
const { app, request, DatabaseUtil, login, bearer } = require('./helpers');

let accessToken;
let csrf;
let order; // a seeded order we mutate, restored in afterAll

const write = (method, url) =>
  request(app)[method](url).set(bearer(accessToken)).set('X-CSRF-Token', csrf).set('Cookie', `csrf_token=${csrf}`);

beforeAll(async () => {
  ({ accessToken } = await login('admin'));
  const tokenRes = await request(app).get('/api/users/csrf-token').set(bearer(accessToken));
  csrf = tokenRes.body.keyValueTable.csrfToken;
  order = DatabaseUtil.first(await DatabaseUtil.executeQuery(
    "SELECT id, status, tracking_number FROM orders WHERE order_number LIKE 'EXAMPLE-%' ORDER BY order_number LIMIT 1"));
  expect(order).toBeTruthy();
});

afterAll(async () => {
  if (order) {
    await DatabaseUtil.executeQuery('UPDATE orders SET status = ?, tracking_number = ? WHERE id = ?',
      [order.status, order.tracking_number, order.id]);
  }
});

describe('GET /api/admin/orders', () => {
  test('destination comes from the shipping address (JSON column), not "N/A"', async () => {
    const res = await request(app).get('/api/admin/orders').set(bearer(accessToken));
    expect(res.status).toBe(200);
    const orders = res.body.keyValueTable.find((x) => x.orders).orders;
    expect(orders.length).toBeGreaterThan(0);

    const rows = DatabaseUtil.rows(await DatabaseUtil.executeQuery('SELECT id, shipping_address_json FROM orders'));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.shipping_address_json]));
    for (const o of orders) {
      const addr = byId[o._id] || {};
      const expected = [addr.city, addr.country].filter(Boolean).join(', ') || 'N/A';
      expect([o._id, o.destination]).toEqual([o._id, expected]);
    }
    expect(orders.some((o) => o.destination !== 'N/A')).toBe(true);
  });

  test('a non-string user_id filter is rejected with 400', async () => {
    for (const qs of ['user_id=a&user_id=b', 'user_id[x]=1']) {
      const res = await request(app).get(`/api/admin/orders?${qs}`).set(bearer(accessToken));
      expect([qs, res.status]).toEqual([qs, 400]);
    }
    const ok = await request(app).get('/api/admin/orders?user_id=NOPE').set(bearer(accessToken));
    expect(ok.status).toBe(200);
  });
});

describe('PUT /api/admin/orders/:id/status', () => {
  test.each([
    ['missing status', {}],
    ['numeric status', { status: 3 }],
    ['array status', { status: ['shipped'] }],
    ['object status', { status: { a: 1 } }],
    ['unknown status', { status: 'teleported' }],
    ['numeric tracking_number', { status: 'processing', tracking_number: 12345 }],
    ['object tracking_number', { status: 'processing', tracking_number: { a: 1 } }],
    ['array tracking_number', { status: 'processing', tracking_number: ['x'] }],
    ['overlong tracking_number', { status: 'processing', tracking_number: 'T'.repeat(101) }],
  ])('%s -> 400 and the order is untouched', async (_label, body) => {
    const res = await write('put', `/api/admin/orders/${order.id}/status`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('FAIL');
    const now = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT status, tracking_number FROM orders WHERE id = ?', [order.id]));
    expect(now).toEqual({ status: order.status, tracking_number: order.tracking_number });
  });

  test('unknown order id -> 404', async () => {
    const res = await write('put', '/api/admin/orders/NO-SUCH-ORDER/status').send({ status: 'processing' });
    expect(res.status).toBe(404);
  });

  test('valid update (capitalised status from the UI) saves status + tracking number', async () => {
    const res = await write('put', `/api/admin/orders/${order.id}/status`)
      .send({ status: 'Processing', tracking_number: 'TRK-ADMIN-TEST' });
    expect(res.status).toBe(200);
    const now = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT status, tracking_number FROM orders WHERE id = ?', [order.id]));
    expect(now).toEqual({ status: 'processing', tracking_number: 'TRK-ADMIN-TEST' });

    // Re-saving the same values is still a success (not a false 404).
    const again = await write('put', `/api/admin/orders/${order.id}/status`).send({ status: 'processing', tracking_number: '' });
    expect(again.status).toBe(200);
    const after = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT tracking_number FROM orders WHERE id = ?', [order.id]));
    expect(after.tracking_number).toBe('TRK-ADMIN-TEST');
  });
});

describe('POST /api/admin/orders/bulk-update', () => {
  test.each([
    ['numeric id', [1]],
    ['object id', [{ id: 'x' }]],
    ['nested array id', [['x']]],
    ['empty-string id', ['']],
  ])('%s in orderIds -> 400', async (_label, orderIds) => {
    const res = await write('post', '/api/admin/orders/bulk-update').send({ orderIds, status: 'processing' });
    expect(res.status).toBe(400);
  });

  test('a non-string status -> 400', async () => {
    const res = await write('post', '/api/admin/orders/bulk-update').send({ orderIds: [order.id], status: ['processing'] });
    expect(res.status).toBe(400);
  });

  test('string ids update (unknown ones are skipped)', async () => {
    const res = await write('post', '/api/admin/orders/bulk-update')
      .send({ orderIds: [order.id, 'NO-SUCH-ORDER'], status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.keyValueTable[0].result.updated).toBe(1);
  });
});

describe('GET /api/admin/analytics/summary', () => {
  test('the conversion rate is a share of visitors (never over 100%), buyers count as visitors', async () => {
    const res = await request(app).get('/api/admin/analytics/summary').set(bearer(accessToken));
    expect(res.status).toBe(200);
    const { conversionRate, visitors } = res.body.keyValueTable[0].metrics;
    // The seed has paid orders but checkout empties carts: buyers must still be visitors.
    const buyers = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      "SELECT COUNT(DISTINCT COALESCE(o.user_id, o.guest_email, o.id)) AS n FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.status = 'completed'"));
    expect(Number(buyers.n)).toBeGreaterThan(0);
    expect(visitors).toBeGreaterThanOrEqual(Number(buyers.n));
    expect(conversionRate).toBeGreaterThan(0);
    expect(conversionRate).toBeLessThanOrEqual(100);
  });
});
