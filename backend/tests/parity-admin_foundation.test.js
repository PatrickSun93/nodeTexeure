// Node ↔ Rust parity for the /api/admin skeleton (rust/crates/api/src/admin.rs):
// server.js's mount order (analytics, email-queue, bulk + `protect, admin`,
// email-templates + `protect, admin`, then the admin router behind `protect,
// staffOrAdmin` with adminLimiter + csrfProtection on everything and Express's
// 404 after it), and POST /api/admin/logout. Runs when RUST_API_URL is set and
// the API binary is built (rust/target/debug/api or RUST_API_BIN): the file
// starts a Rust API of its own so the admin limiters start at 0 on both sides
// (see backOffice() in parityHelpers.js).
//
//   (cd ../rust && cargo build -p api) && RUST_API_URL=http://127.0.0.1:7050 DB_HOST=127.0.0.1 \
//     DB_PORT=3307 DB_PASSWORD=noirae_dev DB_NAME=nt_x npx jest tests/parity-admin_foundation.test.js
//
// Only paths no Node admin router defines are compared here (plus logout): the
// area ports add their own files and register their routes in the Rust
// dispatcher, and these answers stay the same.
const { DatabaseUtil } = require('./helpers');
const P = require('./parityHelpers');

const BO = P.backOffice();

P.describeBackOffice('/api/admin skeleton', () => {
  beforeAll(() => BO.start(), 60000);
  afterAll(() => BO.stop());

  describe('mount order and guards', () => {
    test.each([
      // no token: the first mount whose `protect` runs answers 401
      ['get', '/api/admin'],
      ['get', '/api/admin/'],
      ['get', '/api/admin/nope'],
      ['post', '/api/admin/nope'],
      ['get', '/api/admin/analytics/nope'],
      ['get', '/api/admin/analytics/sales-summary'],
      ['get', '/api/admin/email-queue/nope'],
      ['get', '/api/admin/bulk/nope'],
      ['delete', '/api/admin/bulk'],
      ['get', '/api/admin/email-templates'],
      ['put', '/api/admin/email-templates/x'],
      ['get', '/api/admin/logout'],
      ['post', '/api/admin/logout'],
      ['get', '/API/ADMIN/Nope'],
      ['get', '/api/admin//nope?x=1'],
    ])('anonymous %s %s', (method, url) => BO.same(method, url));

    test('a forged token', () => BO.same('get', '/api/admin/nope', { headers: P.bearer('not.a.jwt') }));

    test.each([
      ['get', '/api/admin/nope'],
      ['post', '/api/admin/nope'],
      ['get', '/api/admin/bulk/nope'],
      ['get', '/api/admin/email-templates'],
      ['post', '/api/admin/logout'],
    ])('customer %s %s', (method, url) => BO.same(method, url, { as: 'customer', csrf: true }));

    test.each([
      // staff pass E's staffOrAdmin, but not C/D's admin
      ['get', '/api/admin/nope'],
      ['head', '/api/admin/nope'],
      ['get', '/api/admin/bulk/nope'],
      ['post', '/api/admin/bulk/nope'],
      ['get', '/api/admin/email-templates'],
      ['delete', '/api/admin/email-templates/nope'],
      ['get', '/api/admin/analytics/nope'],
      ['get', '/API/Admin/nope/'],
    ])('staff %s %s', (method, url) => BO.same(method, url, { as: 'staff' }));

    test.each([
      // admins fall through C to E's 404; writes stop at E's CSRF check first
      ['get', '/api/admin/nope'],
      ['get', '/api/admin/bulk/nope'],
      ['get', '/api/admin/email-queue/nope/deeper'],
      ['get', '/api/admin/logout'],
      ['post', '/api/admin/nope'],
      ['put', '/api/admin/bulk/nope'],
      ['patch', '/api/admin/nope'],
      ['delete', '/api/admin/analytics/nope'],
    ])('admin without CSRF %s %s', (method, url) => BO.same(method, url, { as: 'admin' }));

    test.each([
      ['post', '/api/admin/nope'],
      ['put', '/api/admin/bulk/nope'],
      ['patch', '/api/admin/nope'],
      ['delete', '/api/admin/x/y/z'],
      ['post', '/api/admin/analytics/sales-summary'],
    ])('admin with CSRF %s %s', (method, url) => BO.same(method, url, { as: 'admin', csrf: true }));
  });

  describe('CSRF on the admin router', () => {
    const admin = () => BO.sessions.admin;
    test('header without cookie', () => BO.same('post', '/api/admin/nope', {
      as: admin(), headers: { 'X-CSRF-Token': admin().csrf },
    }));
    test('cookie and header differ', () => BO.same('post', '/api/admin/nope', {
      as: admin(), headers: { 'X-CSRF-Token': admin().csrf, Cookie: 'csrf_token=other' },
    }));
    test('a token that does not validate', () => BO.same('post', '/api/admin/nope', {
      as: admin(), headers: { 'X-CSRF-Token': 'forged', Cookie: 'csrf_token=forged' },
    }));
    test("another user's token", () => BO.same('post', '/api/admin/nope', {
      as: admin(), headers: { 'X-CSRF-Token': BO.sessions.staff.csrf, Cookie: `csrf_token=${encodeURIComponent(BO.sessions.staff.csrf)}` },
    }));
    test('the admin_auth cookie instead of the header', () => BO.same('post', '/api/admin/nope', {
      headers: {
        Cookie: `admin_auth=${admin().token}; csrf_token=${encodeURIComponent(admin().csrf)}`,
        'X-CSRF-Token': admin().csrf,
      },
    }));
  });

  describe('Express around the routes', () => {
    test('OPTIONS is the CORS preflight', () => BO.same('options', '/api/admin/nope'));
    test('a body express.json() rejects is a 500 before auth', () => BO.same('post', '/api/admin/nope', {
      raw: { type: 'application/json', text: '{bad' }, dropError: true,
    }));
    test('a urlencoded body is parsed, then CSRF', () => BO.same('post', '/api/admin/nope', {
      as: 'admin', raw: { type: 'application/x-www-form-urlencoded', text: 'a=1&b[]=2' },
    }));
    test('a multipart body is left for the route', () => BO.same('post', '/api/admin/nope', {
      as: 'admin', csrf: true, raw: { type: 'multipart/form-data; boundary=x', text: '--x--\r\n' },
    }));
  });

  describe('POST /api/admin/logout', () => {
    const state = async (s) => {
      const row = DatabaseUtil.first(await DatabaseUtil.executeQuery(
        `SELECT token_version, (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = users.id) AS refresh_tokens
         FROM users WHERE id = ?`, [s.user.id]));
      return { token_version: row.token_version, refresh_tokens: Number(row.refresh_tokens) };
    };

    test.each([
      ['/api/admin/logout', 'staff'],
      ['/API/Admin/LOGOUT/', 'admin'],
    ])('%s (%s): revokes the session and clears both cookies', async (url, role) => {
      const out = {};
      for (const side of ['node', 'rust']) {
        const s = await BO.throwaway(role);
        const before = await state(s);
        const res = await BO.call(side, 'post', url, { as: s, csrf: true });
        const after = await state(s);
        // the old token is revoked on both services
        const reuse = await BO.call(side, 'get', '/api/admin/nope', { as: s });
        out[side] = {
          res,
          view: {
            status: res.status,
            body: res.body,
            versionBump: after.token_version - before.token_version,
            refreshBefore: before.refresh_tokens > 0,
            refreshAfter: after.refresh_tokens,
            reuse: { status: reuse.status, body: reuse.body },
          },
        };
      }
      expect(out.rust.view).toEqual(out.node.view);
      expect(out.node.view.status).toBe(200);
      P.expectSameSetCookies(out.node.res.res, out.rust.res.res);
    });

    test('logout needs CSRF like every admin write', () => BO.same('post', '/api/admin/logout', { as: 'staff' }));
  });

  // Last: it uses up adminLimiter's budget for this file.
  test('adminLimiter: headers on every request and the same 429', async () => {
    let limited = 0;
    for (let i = 0; i < 120 && limited < 2; i += 1) {
      const { node } = await BO.same('get', '/api/admin/nope', { as: 'staff' });
      if (node.status === 429) limited += 1;
    }
    expect(limited).toBe(2);
    // a 429 comes before the CSRF check too
    await BO.same('post', '/api/admin/nope', { as: 'admin' });
  }, 60000);
});
