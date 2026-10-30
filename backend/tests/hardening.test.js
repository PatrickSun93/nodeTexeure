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

describe('unsubscribe addresses match exactly (migration 015)', () => {
  const { buildUnsubscribeToken, isEmailSuppressed } = require('../utils/emailSuppression');
  const victim = `optout.${Date.now()}@example.com`;
  const lookalike = victim.replace('example.com', 'exämple.com');

  test('a look-alike address token neither removes nor rewrites the real opt-out', async () => {
    const opt = await request(app).post('/api/unsubscribe')
      .send({ email: victim, token: buildUnsubscribeToken(victim), reason: 'mine' });
    expect(opt.status).toBe(200);
    expect(await isEmailSuppressed(victim)).toBe(true);

    await request(app).post('/api/unsubscribe/resubscribe')
      .send({ email: lookalike, token: buildUnsubscribeToken(lookalike) });
    await request(app).post('/api/unsubscribe')
      .send({ email: lookalike, token: buildUnsubscribeToken(lookalike), reason: 'attacker' });

    const rows = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      'SELECT email, reason FROM email_unsubscribes WHERE email IN (?, ?) ORDER BY email', [victim, lookalike]));
    expect(rows).toEqual([
      { email: victim, reason: 'mine' },
      { email: lookalike, reason: 'attacker' },
    ]);
    expect(await isEmailSuppressed(victim)).toBe(true);
  });
});

describe('forgot-password mails the stored address', () => {
  test('a look-alike address gets nothing; the reset goes to the account email', async () => {
    const lookalike = 'alice.customer@exämple.com';
    const res = await request(app).post('/api/users/forgot-password').send({ email: lookalike });
    expect(res.status).toBe(200);
    const sentToTyped = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      "SELECT id FROM email_queue WHERE to_email = ? COLLATE utf8mb4_bin", [lookalike]));
    expect(sentToTyped).toEqual([]);
    const sentToAccount = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      `SELECT q.id FROM email_queue q JOIN email_templates t ON t.id = q.template_id
        WHERE q.to_email = 'alice.customer@example.com' COLLATE utf8mb4_bin AND t.name = 'password_reset'`));
    expect(sentToAccount.length).toBeGreaterThan(0);
  });
});
