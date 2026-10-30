// Follow-ups from the system-test review: HTML escaping of mail sent directly by
// the backend, all-or-nothing admin product updates, CSRF on create-label.
const { app, request, DatabaseUtil, login, bearer } = require('./helpers');
const { escapeHtml } = require('../utils/escapeHtml');

describe('escapeHtml', () => {
  test('matches the email daemon rules (render.rs escape_html)', () => {
    expect(escapeHtml(`<a href="x">O'Neil & co</a>`))
      .toBe('&lt;a href=&quot;x&quot;&gt;O&#39;Neil &amp; co&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(3)).toBe('3');
  });
});

describe('admin writes', () => {
  let accessToken;
  let csrf;
  let product;

  const write = (method, url) =>
    request(app)[method](url).set(bearer(accessToken)).set('X-CSRF-Token', csrf).set('Cookie', `csrf_token=${csrf}`);

  beforeAll(async () => {
    ({ accessToken } = await login('admin'));
    const tokenRes = await request(app).get('/api/users/csrf-token').set(bearer(accessToken));
    csrf = tokenRes.body.keyValueTable.csrfToken;
    product = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT id, name FROM products ORDER BY id LIMIT 1'));
    expect(product).toBeTruthy();
  });

  test.each([
    ['a numeric variant id', [{ sku: 'NEW-SKU-HARDENING' }, { id: 5 }]],
    ['a null variant', [null]],
    ['variants that are not an array', { id: 'x' }],
  ])('PUT /api/admin/products/:id with %s is a 400 and writes nothing', async (_label, variants) => {
    const before = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      'SELECT id FROM product_variants WHERE product_id = ?', [product.id])).length;
    const res = await write('put', `/api/admin/products/${product.id}`)
      .send({ name: 'Renamed by a rejected request', variants });
    expect(res.status).toBe(400);
    const after = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT name FROM products WHERE id = ?', [product.id]));
    expect(after.name).toBe(product.name);
    const count = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      'SELECT id FROM product_variants WHERE product_id = ?', [product.id])).length;
    expect(count).toBe(before);
  });

  test('POST /api/shipping/create-label requires a CSRF token', async () => {
    const res = await request(app).post('/api/shipping/create-label')
      .set(bearer(accessToken)).send({ orderId: 'does-not-exist' });
    expect(res.status).toBe(403);
    const withCsrf = await write('post', '/api/shipping/create-label').send({ orderId: 'does-not-exist' });
    expect(withCsrf.status).toBe(404);
  });
});
