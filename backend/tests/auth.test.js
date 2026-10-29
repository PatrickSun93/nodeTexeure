const jwt = require('jsonwebtoken');
const { app, request, login, bearer } = require('./helpers');

const forge = (payload, secret, opts = {}) => jwt.sign(payload, secret, { algorithm: 'HS256', ...opts });

// Hand-built unsigned token: jsonwebtoken refuses to sign alg:none itself.
const unsigned = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
};

describe('authentication', () => {
  test('health endpoint is public', async () => {
    const res = await request(app).get('/api/status/health');
    expect(res.status).toBe(200);
  });

  test('valid credentials return tokens and role flags', async () => {
    const admin = await login('admin');
    expect(admin.accessToken).toBeTruthy();
    expect(admin.isAdmin).toBe(true);
    const staff = await login('staff');
    expect(staff.isAdmin).toBe(false);
    expect(staff.isStaff).toBe(true);
  });

  test('wrong password is rejected', async () => {
    const res = await request(app).post('/api/users/login')
      .send({ email: 'admin@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('FAIL');
  });

  test('protected route without a token is 401', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  test('token signed with a different secret is rejected', async () => {
    const token = forge({ id: 'USER0000000001', isAdmin: true }, 'attacker-secret-attacker-secret-1234');
    const res = await request(app).get('/api/admin/dashboard').set(bearer(token));
    expect(res.status).toBe(401);
  });

  test('alg:none token is rejected', async () => {
    const res = await request(app).get('/api/users/profile')
      .set(bearer(unsigned({ id: 'USER0000000001', isAdmin: true })));
    expect(res.status).toBe(401);
  });

  test('expired token is rejected', async () => {
    const token = forge({ id: 'USER0000000003' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/users/profile').set(bearer(token));
    expect(res.status).toBe(401);
  });
});

describe('authorization', () => {
  test('customer cannot reach admin routes (403, not 401)', async () => {
    const { accessToken } = await login('customer');
    for (const url of ['/api/users', '/api/admin/analytics/sales-summary', '/api/database/tables']) {
      const res = await request(app).get(url).set(bearer(accessToken));
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  test('staff cannot reach admin-only routes', async () => {
    const { accessToken } = await login('staff');
    const res = await request(app).get('/api/users').set(bearer(accessToken));
    expect(res.status).toBe(403);
  });

  test('admin can list users', async () => {
    const { accessToken } = await login('admin');
    const res = await request(app).get('/api/users').set(bearer(accessToken));
    expect(res.status).toBe(200);
  });

  test('profile update cannot escalate role', async () => {
    const { accessToken } = await login('customer');
    await request(app).put('/api/users/profile').set(bearer(accessToken))
      .send({ firstName: 'Alice', role: 'admin', isAdmin: true });
    const again = await login('customer');
    expect(again.isAdmin).toBe(false);
    expect(again.role).toBe('customer');
  });

  test('admin writes require a CSRF token', async () => {
    const { accessToken } = await login('admin');
    const res = await request(app).post('/api/admin/email-queue/retry-failed').set(bearer(accessToken));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/CSRF/i);
  });

  test('admin write succeeds with a valid CSRF token', async () => {
    const { accessToken } = await login('admin');
    const tokenRes = await request(app).get('/api/users/csrf-token').set(bearer(accessToken));
    expect(tokenRes.status).toBe(200);
    const csrf = tokenRes.body.keyValueTable.csrfToken;
    expect(csrf).toBeTruthy();
    const res = await request(app).post('/api/admin/email-queue/retry-failed')
      .set(bearer(accessToken)).set('X-CSRF-Token', csrf)
      .set('Cookie', `csrf_token=${csrf}`);
    expect(res.status).toBe(200);
  });
});

describe('public account flows', () => {
  test('verify-email is reachable without auth (not shadowed by /:id)', async () => {
    const res = await request(app).get('/api/users/verify-email').query({ token: 'bogus' });
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(500);
  });
});

describe('session revocation', () => {
  const { registerCustomer, DatabaseUtil } = require('./helpers');

  test('deactivating a user revokes their existing token', async () => {
    const user = await registerCustomer();
    expect((await request(app).get('/api/users/profile').set(bearer(user.accessToken))).status).toBe(200);

    await DatabaseUtil.executeQuery(
      "UPDATE users SET status = 'inactive', token_version = token_version + 1 WHERE id = ?", [user.userId]);
    expect((await request(app).get('/api/users/profile').set(bearer(user.accessToken))).status).toBe(401);
  });

  test('demotion takes effect immediately, not when the token expires', async () => {
    const user = await registerCustomer();
    await DatabaseUtil.executeQuery("UPDATE users SET role = 'admin' WHERE id = ?", [user.userId]);
    // Token says isAdmin:false but the DB now says admin — DB wins.
    expect((await request(app).get('/api/users').set(bearer(user.accessToken))).status).toBe(200);
    await DatabaseUtil.executeQuery("UPDATE users SET role = 'customer' WHERE id = ?", [user.userId]);
    expect((await request(app).get('/api/users').set(bearer(user.accessToken))).status).toBe(403);
  });

  test('customers cannot upload images', async () => {
    const { accessToken } = await login('customer');
    const res = await request(app).post('/api/images/upload').set(bearer(accessToken))
      .attach('image', Buffer.from('fake'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });
});

describe('password reset', () => {
  const { registerCustomer, DatabaseUtil } = require('./helpers');
  const crypto = require('crypto');

  test('a reset token works once and revokes old sessions', async () => {
    const user = await registerCustomer();
    const forgot = await request(app).post('/api/users/forgot-password').send({ email: user.email });
    expect(forgot.status).toBe(200);

    const row = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT password_reset_token FROM users WHERE id = ?', [user.userId]));
    expect(row.password_reset_token).toMatch(/^[0-9a-f]{64}$/);

    // The raw token only exists in the emailed link; plant a known one to drive the flow.
    const token = crypto.randomBytes(32).toString('hex');
    await DatabaseUtil.executeQuery('UPDATE users SET password_reset_token = ? WHERE id = ?',
      [crypto.createHash('sha256').update(token).digest('hex'), user.userId]);

    const reset = await request(app).post('/api/users/reset-password').send({ token, newPassword: 'Changed@5678' });
    expect(reset.status).toBe(200);
    expect((await request(app).post('/api/users/reset-password').send({ token, newPassword: 'Again@5678x' })).status).toBe(400);
    expect((await request(app).get('/api/users/profile').set(bearer(user.accessToken))).status).toBe(401);
    await login({ email: user.email, password: 'Changed@5678' });
  });
});

describe('back office', () => {
  const csrfFor = async (accessToken) => {
    const res = await request(app).get('/api/users/csrf-token').set(bearer(accessToken));
    expect(res.status).toBe(200);
    return res.body.keyValueTable.csrfToken;
  };
  const write = (method, url, accessToken, csrf) =>
    request(app)[method](url).set(bearer(accessToken)).set('X-CSRF-Token', csrf).set('Cookie', `csrf_token=${csrf}`);

  test('staff can use staff routes but not admin-only ones', async () => {
    const { accessToken } = await login('staff');
    const csrf = await csrfFor(accessToken);
    const order = (await request(app).get('/api/orders/my-orders').set(bearer(accessToken))).status;
    expect(order).toBe(200);

    // staffOrAdmin route: passes the guard (400 = reached validation).
    const status = await write('post', '/api/admin/orders/bulk-update', accessToken, csrf).send({});
    expect(status.status).toBe(400);
    // admin-only routes stay closed.
    expect((await request(app).get('/api/admin/users').set(bearer(accessToken))).status).toBe(403);
    expect((await write('delete', '/api/admin/coupons/NOPE', accessToken, csrf)).status).toBe(403);
  });

  test('every admin area responds for an admin', async () => {
    const { accessToken } = await login('admin');
    for (const url of ['/api/admin/products', '/api/admin/categories', '/api/admin/coupons',
      '/api/admin/inventory', '/api/admin/users', '/api/admin/staff', '/api/admin/orders',
      '/api/admin/analytics/summary', '/api/admin/settings', '/api/admin/shipping/zones',
      '/api/admin/email-templates']) {
      const res = await request(app).get(url).set(bearer(accessToken));
      expect([url, res.status]).toEqual([url, 200]);
    }
  });

  test('logout clears the cookie and revokes the session', async () => {
    const { accessToken } = await login('staff');
    const csrf = await csrfFor(accessToken);
    const res = await write('post', '/api/admin/logout', accessToken, csrf);
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/admin_auth=;/);
    expect((await request(app).get('/api/users/profile').set(bearer(accessToken))).status).toBe(401);
  });
});
