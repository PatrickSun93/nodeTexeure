// Node ↔ Rust parity for the account half of /api/users (rust/crates/api/src/
// routes/users_account.rs): profile, addresses and the admin user routes. Runs
// when RUST_API_URL points at a running Rust API; otherwise skipped (the Node
// regression tests at the bottom always run).
//
//   RUST_API_URL=http://127.0.0.1:7032 DB_HOST=127.0.0.1 DB_PORT=3307 \
//     DB_PASSWORD=noirae_dev DB_NAME=nt_users_account npx jest tests/parity-users_account.test.js
//
// Read-only checks send the same request with the same user to both sides.
// Writes run on two fresh users (or targets), one per service, and compare each
// answer after normalizing generated ids/timestamps, then the rows each side
// wrote, field by field.
const bcrypt = require('bcryptjs');
const { app, request, login, registerCustomer, DatabaseUtil } = require('./helpers');
const P = require('./parityHelpers');

const TIME = [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'];
const normU = P.normalizer([
  [/USER\d{10}/gi, 'USER*'],
  [/ADDR\d{10}/g, 'ADDR*'],
  [/test\.\d+\.[a-z0-9]+@example\.com/g, 'EMAIL'],
  TIME,
]);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const pick = (v, s) => (typeof v === 'function' ? v(s) : v);

/**
 * The same request on both sides, each with its own state `s` (auth headers in
 * `s.auth`; `url`/`body` may be functions of `s`). Same status and normalized
 * JSON. `dropError` ignores keyValueTable.error (V8's JSON.parse message).
 */
async function pair(sides, method, url, body, { dropError = false } = {}) {
  const out = {};
  for (const side of ['node', 'rust']) {
    const s = sides[side];
    out[side] = await P.call(side, method, pick(url, s), s.auth, pick(body, s));
  }
  const label = `${method.toUpperCase()} ${pick(url, sides.node)} ${JSON.stringify(pick(body, sides.node) ?? '')}`;
  const view = (r) => {
    const b = normU(r.body);
    if (dropError && b?.keyValueTable) delete b.keyValueTable.error;
    return { label, status: r.status, body: b };
  };
  expect(view(out.rust)).toEqual(view(out.node));
  return out;
}

/** Same request, same headers on both sides. */
const same = (method, url, headers = {}, body, opts) => {
  const s = { auth: headers };
  return pair({ node: s, rust: s }, method, url, body, opts);
};

/** A body that isn't JSON.stringify'd (forms, broken JSON). */
async function raw(side, method, url, headers, contentType, text) {
  if (side === 'node') {
    const res = await request(app)[method](url).set(headers).set('Content-Type', contentType).send(text);
    return { status: res.status, body: res.body };
  }
  const res = await fetch(P.RUST + url, { method: method.toUpperCase(), headers: { ...headers, 'Content-Type': contentType }, body: text });
  const t = await res.text();
  let parsed;
  try { parsed = JSON.parse(t); } catch { parsed = t; }
  return { status: res.status, body: parsed };
}

async function rawPair(sides, method, url, contentType, text, { dropError = false } = {}) {
  const out = {};
  for (const side of ['node', 'rust']) out[side] = await raw(side, method, pick(url, sides[side]), sides[side].auth, contentType, text);
  const view = (r) => {
    const b = normU(r.body);
    if (dropError && b?.keyValueTable) delete b.keyValueTable.error;
    return { label: `${method} ${pick(url, sides.node)} ${contentType} ${text}`, status: r.status, body: b };
  };
  expect(view(out.rust)).toEqual(view(out.node));
  return out;
}

const userRow = async (id) => normU(DatabaseUtil.first(await DatabaseUtil.executeQuery(
  `SELECT first_name, last_name, phone, email, role, status, token_version, email_verified
   FROM users WHERE id = ?`, [id])));
const addressRows = async (userId) => normU(DatabaseUtil.rows(await DatabaseUtil.executeQuery(
  'SELECT type, is_default, first_name, last_name, phone, address_json FROM user_addresses WHERE user_id = ? ORDER BY id',
  [userId])));
const refreshCount = async (userId) => DatabaseUtil.first(await DatabaseUtil.executeQuery(
  'SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ?', [userId])).n * 1;

async function csrfFor(token) {
  const res = await request(app).get('/api/users/csrf-token').set(bearer(token));
  if (res.status !== 200) throw new Error(`csrf-token: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.keyValueTable.csrfToken;
}
const csrfHeaders = (token, csrf) => ({ ...bearer(token), 'X-CSRF-Token': csrf, Cookie: `csrf_token=${encodeURIComponent(csrf)}` });

/** Two fresh customers, one per side: { node: { auth, user }, rust: { … } }. */
async function twoCustomers() {
  const [a, b] = [await registerCustomer(), await registerCustomer()];
  return { node: { auth: bearer(a.accessToken), user: a }, rust: { auth: bearer(b.accessToken), user: b } };
}

let admin; let staff; let customer;
P.describeIfRust('users (account): setup', () => {
  test('logins', async () => {
    admin = (await login('admin')).accessToken;
    staff = (await login('staff')).accessToken;
    customer = (await login('customer')).accessToken;
    expect(admin && staff && customer).toBeTruthy();
  });
});

P.describeIfRust('users (account): auth and role denials', () => {
  const routes = [
    ['get', '/api/users/profile'], ['put', '/api/users/profile'],
    ['get', '/api/users/addresses'], ['post', '/api/users/addresses'],
    ['put', '/api/users/addresses/ADDR0000000001'], ['delete', '/api/users/addresses/ADDR0000000001'],
    ['patch', '/api/users/addresses/ADDR0000000001/default'],
    ['get', '/api/users'], ['get', '/api/users/USER0000000003'],
    ['put', '/api/users/USER0000000003'], ['delete', '/api/users/USER0000000003'],
  ];

  test.each(routes)('%s %s without / with bad tokens', async (method, url) => {
    await same(method, url);
    await same(method, url, bearer('garbage'));
    await same(method, url, { Authorization: 'Bearer ' });
    await same(method, url, { Cookie: 'admin_auth=j:0' });
    await same(method, url, { Cookie: 'admin_auth=j:{"a":1}' });
    await same(method, url, { Cookie: 'admin_auth=j:[1]' });
    await same(method, url, { Cookie: 'admin_auth=' });
  });

  test('admin routes refuse customers and staff (403 before CSRF)', async () => {
    for (const [method, url] of routes.slice(7)) {
      const body = method === 'get' ? undefined : { role: 'admin' };
      await same(method, url, bearer(customer), body);
      await same(method, url, bearer(staff), body);
    }
  });

  test('admin_auth cookie: cookie-parser decoding, quotes, j: strings, first occurrence', async () => {
    await same('get', '/api/users/profile', { Cookie: `admin_auth=${customer}` });
    await same('get', '/api/users/profile', { Cookie: `admin_auth="${customer}"` });
    await same('get', '/api/users/profile', { Cookie: `admin_auth=j:${encodeURIComponent(JSON.stringify(customer))}` });
    await same('get', '/api/users/profile', { Cookie: `admin_auth=; admin_auth=${customer}` });
    await same('get', '/api/users', { Cookie: `x=1; admin_auth=${admin}` });
  });

  test('admin writes need the CSRF double submit', async () => {
    const csrf = await csrfFor(admin);
    const body = { firstName: 'Nobody' };
    const url = '/api/users/USER9999999999';
    for (const method of ['put', 'delete']) {
      await same(method, url, bearer(admin), body);
      await same(method, url, { ...bearer(admin), 'X-CSRF-Token': csrf }, body);
      await same(method, url, { ...bearer(admin), Cookie: `csrf_token=${encodeURIComponent(csrf)}` }, body);
      await same(method, url, { ...bearer(admin), 'X-CSRF-Token': csrf, Cookie: 'csrf_token=other' }, body);
      await same(method, url, { ...bearer(admin), 'X-CSRF-Token': 'forged', Cookie: 'csrf_token=forged' }, body);
      await same(method, url, { ...bearer(admin), 'X-CSRF-Token': csrf, Cookie: 'csrf_token=j:0' }, body);
      // A token issued to someone else (staff) does not validate for the admin.
      const staffCsrf = await csrfFor(staff);
      await same(method, url, csrfHeaders(admin, staffCsrf), body);
      // Valid: reaches the route (unknown user → 404).
      await same(method, url, csrfHeaders(admin, csrf), body);
    }
  });
});

P.describeIfRust('users (account): routing like the Express router', () => {
  test('unknown paths and methods are the app 404, not 405', async () => {
    const h = bearer(admin);
    for (const [method, url] of [
      ['get', '/api/users/nope'], ['get', '/api/users/nope?x=1'], ['post', '/api/users'], ['post', '/api/users/'],
      ['patch', '/api/users/profile'], ['delete', '/api/users/profile'], ['post', '/api/users/profile'],
      ['put', '/api/users/addresses'], ['get', '/api/users/addresses/ADDR1'], ['post', '/api/users/addresses/ADDR1'],
      ['patch', '/api/users/addresses/ADDR1'], ['put', '/api/users/addresses/ADDR1/default'],
      ['get', '/api/users/addresses//'], ['get', '/api/users/addresses/a/b'], ['get', '/api/users///profile'],
      ['post', '/api/users/USER0000000003'], ['patch', '/api/users/USER0000000003'],
      ['get', '/api/users/USER'], ['get', '/api/users/USER12x'], ['get', '/api/users/%55SER0000000003'],
      ['get', '/api/users/USER0000000003/x'], ['get', '/api/users/profile//'],
    ]) {
      await same(method, url, h);
      await same(method, url);
    }
  });

  test('case-insensitive paths, one trailing slash, lower-case user ids', async () => {
    await same('get', '/api/users/PROFILE', bearer(customer));
    await same('get', '/api/users/profile/', bearer(customer));
    await same('get', '/api/users/Addresses/', bearer(customer));
    await same('get', '/api/users/', bearer(admin));
    await same('get', '/api/users?limit=1', bearer(admin));
    await same('get', '/api/users/user0000000003', bearer(admin));
    await same('get', '/api/users/USER0000000003/', bearer(admin));
    // The mount path takes one extra slash: //profile is /profile, // is /.
    await same('get', '/api/users//profile', bearer(customer));
    await same('get', '/api/users//', bearer(admin));
    await same('get', '/api/users//addresses//', bearer(customer));
  });

  test('an undecodable route param is the error handler 500, whatever the method or auth', async () => {
    for (const method of ['get', 'put', 'delete', 'post', 'patch']) {
      await same(method, '/api/users/addresses/%E0');
      await same(method, '/api/users/addresses/%E0/default', bearer(customer));
    }
    await same('put', '/api/users/addresses/%zz', bearer(customer), { first_name: 'x' });
  });

  test('a body the parsers reject is the error handler 500, before auth', async () => {
    const s = { auth: {} };
    const sides = { node: s, rust: s };
    await rawPair(sides, 'put', '/api/users/profile', 'application/json', '{bad', { dropError: true });
    await rawPair(sides, 'put', '/api/users/profile', 'application/json', 'null', { dropError: true });
    await rawPair(sides, 'put', '/api/users/profile', 'application/json', '"str"', { dropError: true });
    await rawPair(sides, 'delete', '/api/users/nope', 'application/json', '{"a":', { dropError: true });
    await rawPair(sides, 'put', '/api/users/profile', 'application/json; charset=latin1', '{}');
    await rawPair(sides, 'put', '/api/users/profile', 'application/json', JSON.stringify({ firstName: 'x'.repeat(110 * 1024) }));
    await rawPair(sides, 'put', '/api/users/profile', 'application/x-www-form-urlencoded', 'a=1&'.repeat(1001));
    // Not parsed at all: other content types give an empty body.
    await rawPair({ node: { auth: bearer(customer) }, rust: { auth: bearer(customer) } },
      'put', '/api/users/profile', 'text/plain', '{"firstName":"x"}');
  });

  test('HEAD runs the GET route; OPTIONS is the CORS 204', async () => {
    for (const [url, h] of [['/api/users/profile', bearer(customer)], ['/api/users/profile', {}], ['/api/users', bearer(admin)], ['/api/users/nope', {}]]) {
      const node = await request(app).head(url).set(h);
      const rust = await fetch(P.RUST + url, { method: 'HEAD', headers: h });
      expect({ url, status: rust.status }).toEqual({ url, status: node.status });
    }
    const node = await request(app).options('/api/users/profile');
    const rust = await fetch(P.RUST + '/api/users/profile', { method: 'OPTIONS' });
    expect({ status: rust.status, text: await rust.text() }).toEqual({ status: node.status, text: node.text });
  });
});

P.describeIfRust('users (account): profile', () => {
  test('GET profile (with and without addresses)', async () => {
    await same('get', '/api/users/profile', bearer(customer));
    const stranger = await registerCustomer();
    await same('get', '/api/users/profile', bearer(stranger.accessToken));
  });

  test('PUT profile: validation, password change, DB side effects', async () => {
    const sides = await twoCustomers();
    const s = (method, url, body) => pair(sides, method, url, body);
    const url = '/api/users/profile';
    await s('put', url, {});
    await s('put', url, { firstName: '' });
    await s('put', url, { firstName: 5 });
    await s('put', url, { lastName: ['a'] });
    await s('put', url, { phone: { a: 1 } });
    await s('put', url, { password: 12345678 });
    await s('put', url, { currentPassword: true });
    await s('put', url, { firstName: null, lastName: null });
    await s('put', url, { firstName: 'New' });
    await s('put', url, { firstName: 'New' }); // unchanged row is still "updated"
    await s('put', url, { password: 'Abcdefg1' });
    await s('put', url, { password: 'Abcdefg1', currentPassword: '' });
    for (const weak of ['short1A', 'alllower1', 'ALLUPPER1', 'NoDigitsHere', '密码密码密码密码']) {
      await s('put', url, { password: weak, currentPassword: 'x' });
    }
    await s('put', url, { password: 'Newpass123', currentPassword: 'wrong-password' });
    await s('put', url, (side) => ({ password: 'Newpass123', currentPassword: side.user.password, firstName: 'Fn', lastName: 'Ln', phone: '+1 555' }));
    await s('put', url, { phone: 'x'.repeat(30) }); // too long for VARCHAR(20): the UPDATE fails
    await s('put', url, { firstName: 'y'.repeat(101) });
    await s('get', url);
    // Same rows written.
    expect(await userRow(sides.rust.user.userId)).toEqual(await userRow(sides.node.user.userId));
    for (const side of ['node', 'rust']) {
      const { password_hash: hash } = DatabaseUtil.first(await DatabaseUtil.executeQuery(
        'SELECT password_hash FROM users WHERE id = ?', [sides[side].user.userId]));
      expect({ side, ok: await bcrypt.compare('Newpass123', hash), prefix: hash.slice(0, 7) })
        .toEqual({ side, ok: true, prefix: '$2b$10$' });
    }
    // The password change keeps the session (no token_version bump), on both.
    await s('get', url);
  });

  test('PUT profile with a form body (express.urlencoded / qs)', async () => {
    const sides = await twoCustomers();
    const form = (text) => rawPair(sides, 'put', '/api/users/profile', 'application/x-www-form-urlencoded', text);
    await form('firstName=Form+Name&lastName=%C3%A9');
    await form('firstName[]=a');
    await form('phone[a]=1');
    await form('firstName=a&firstName=b');
    await form('nothing=1');
    await form('');
    expect(await userRow(sides.rust.user.userId)).toEqual(await userRow(sides.node.user.userId));
  });
});

P.describeIfRust('users (account): addresses', () => {
  const valid = {
    first_name: 'Ada', last_name: 'Lovelace', address_line_1: '1 Main St', city: 'Boston',
    state: 'MA', postal_code: '02101', country: 'US',
  };

  test('create / list / update / default / delete, with IDOR and every validation branch', async () => {
    const sides = await twoCustomers();
    const s = (method, url, body, opts) => pair(sides, method, url, body, opts);
    const list = '/api/users/addresses';
    const ids = { node: [], rust: [] };
    const create = async (body) => {
      const out = await s('post', list, body);
      for (const side of ['node', 'rust']) {
        const id = out[side].body?.keyValueTable?.addressId;
        if (id) ids[side].push(id);
      }
    };
    const own = (i) => (side) => `/api/users/addresses/${ids[side === sides.node ? 'node' : 'rust'][i]}`;

    await s('get', list);
    // Validation
    await create({});
    await create({ ...valid, country: '' });
    await create({ ...valid, city: undefined });
    await create({ ...valid, first_name: 5 });
    await create({ ...valid, postal_code: ['02101'] });
    await create({ ...valid, phone: 5 });
    await create({ ...valid, address_line_2: { a: 1 } });
    await create({ ...valid, type: 'home' });
    await create({ ...valid, type: 1 });
    await create({ ...valid, type: ['shipping'] });
    // DB rejections (now 500 on both instead of a phantom 201 on Node)
    await create({ ...valid, country: 'USA' });
    await create({ ...valid, first_name: 'x'.repeat(101) });
    await create({ ...valid, phone: '1'.repeat(21) });
    // Valid
    await create({ ...valid, is_default: true });
    await create({ ...valid, city: 'Cambridge', is_default: 1, phone: '+1 617', address_line_2: 'Apt 2' }); // replaces the default
    await create({ ...valid, type: 'billing', phone: null, address_line_2: null });
    await create({ ...valid, type: '', is_default: 'yes', state: 'NY' });
    await create({ ...valid, type: null, is_default: 0 });
    await s('get', list);
    expect(ids.node).toHaveLength(5);
    expect(ids.rust).toHaveLength(5);

    // Another customer's address is "not found" for every write (IDOR).
    const theirs = (side) => `/api/users/addresses/${ids[side === sides.node ? 'rust' : 'node'][0]}`;
    await s('put', theirs, { first_name: 'Mallory' });
    await s('put', theirs, { first_name: 5 }); // ownership is checked before validation
    await s('delete', theirs);
    await s('patch', (side) => `${theirs(side)}/default`);
    await s('put', '/api/users/addresses/ADDR9999999999', { first_name: 'x' });
    await s('patch', '/api/users/addresses/ADDR9999999999/default');
    await s('delete', '/api/users/addresses/ADDR9999999999');
    await s('put', "/api/users/addresses/x'%20OR%20'1'%3D'1", { first_name: 'x' });

    // Update
    await s('put', own(0), {});
    await s('put', own(0), { first_name: '', type: '' });
    await s('put', own(0), { first_name: 5 });
    await s('put', own(0), { country: ['US'] });
    await s('put', own(0), { type: 'home' });
    await s('put', own(0), { phone: null });
    await s('put', own(0), { phone: '' });
    await s('put', own(0), { phone: '+44 20' });
    await s('put', own(0), { city: 'Paris' }); // rebuilds the whole address JSON
    await s('put', own(0), { first_name: 'Grace', last_name: 'Hopper', address_line_2: 'only line 2' });
    await s('put', own(1), { type: 'billing', is_default: true });
    await s('put', own(2), { is_default: 'true' }); // a billing address, default cleared for 'shipping'
    await s('put', own(0), { country: 'FRA' }); // DB rejects it: 500 now on both
    await s('put', own(0), { last_name: 'z'.repeat(101) });
    await s('put', (side) => `${own(3)(side)}/`, { state: 'CA' });
    await s('get', list);

    // Default
    await s('patch', (side) => `${own(4)(side)}/default`);
    await s('patch', (side) => `${own(2)(side).toUpperCase().replace('/API/USERS', '/api/users')}/DEFAULT/`);
    await s('get', list);
    expect(await addressRows(sides.rust.user.userId)).toEqual(await addressRows(sides.node.user.userId));

    // Delete
    await s('delete', own(3));
    await s('delete', own(3));
    await s('get', list);
    await s('get', '/api/users/profile');
    expect(await addressRows(sides.rust.user.userId)).toEqual(await addressRows(sides.node.user.userId));
  });

  test('form bodies', async () => {
    const sides = await twoCustomers();
    const form = (text) => rawPair(sides, 'post', '/api/users/addresses', 'application/x-www-form-urlencoded', text);
    const base = 'first_name=A&last_name=B&address_line_1=1+St&city=C&state=D&postal_code=1&country=US';
    await form(base);
    await form(`${base}&type[]=billing`);
    await form(`${base}&phone[x]=1`);
    await form(`${base}&is_default=0`); // the string "0" is truthy
    await pair(sides, 'get', '/api/users/addresses');
    expect(await addressRows(sides.rust.user.userId)).toEqual(await addressRows(sides.node.user.userId));
  });
});

P.describeIfRust('users (account): admin list and detail', () => {
  test.each([
    '/api/users',
    '/api/users?limit=2&page=2',
    '/api/users?limit=0',
    '/api/users?limit=abc&page=xyz',
    '/api/users?limit=500',
    '/api/users?limit=-4&page=-2',
    '/api/users?limit=2.9&page=1.5',
    '/api/users?limit=1e2',
    '/api/users?limit[]=3',
    '/api/users?limit=2&limit=5',
    '/api/users?limit[a]=1',
    '/api/users?limit[0]=2&page[1]=9',
    '/api/users?limit=%203',
    '/api/users?page=1000000',
    '/api/users?page=1844674407370955',
    '/api/users?page=99999999999999999999',
    '/api/users?page=' + '9'.repeat(400),
  ])('%s', (url) => same('get', url, bearer(admin)));

  test('user detail', async () => {
    for (const id of ['USER0000000001', 'USER0000000003', 'user0000000004', 'USER9999999999', 'USER0']) {
      await same('get', `/api/users/${id}`, bearer(admin));
    }
    const fresh = await registerCustomer();
    await DatabaseUtil.executeQuery('UPDATE users SET last_login = NOW(), email_verified = TRUE WHERE id = ?', [fresh.userId]);
    await same('get', `/api/users/${fresh.userId}`, bearer(admin));
  });
});

P.describeIfRust('users (account): admin update and deactivate', () => {
  let csrf;
  beforeAll(async () => { csrf = await csrfFor(admin); });

  async function twoTargets() {
    const [a, b] = [await registerCustomer(), await registerCustomer()];
    const auth = csrfHeaders(admin, csrf);
    return { node: { auth, user: a }, rust: { auth, user: b } };
  }
  const at = (side) => `/api/users/${side.user.userId}`;

  test('PUT /:id: validation, role change bumps token_version, DB side effects', async () => {
    const t = await twoTargets();
    const s = (body) => pair(t, 'put', at, body);
    await s({});
    await s({ firstName: '', lastName: null, email: '' });
    await s({ firstName: 5 });
    await s({ email: ['a@b.c'] });
    await s({ lastName: { a: 1 } });
    await s({ role: 'superuser' });
    await s({ role: 'ADMIN' });
    await s({ role: null });
    await s({ role: ['staff'] });
    await s({ firstName: 'Ok', role: 7 }); // an invalid role fails the whole update
    await s({ firstName: 'Renamed' });
    await s({ firstName: 'Renamed' }); // no change, row still matched → updated
    await s({ email: 'admin@example.com' }); // duplicate: the UPDATE fails → 500
    await s({ firstName: 'f'.repeat(101) });
    expect(await userRow(t.rust.user.userId)).toEqual(await userRow(t.node.user.userId));

    // Their token works until the role changes.
    const as = (side) => ({ auth: bearer(side.user.accessToken) });
    await pair({ node: as(t.node), rust: as(t.rust) }, 'get', '/api/users/profile');
    await s({ firstName: 'Staffer', lastName: 'Person', role: 'staff' });
    await s((side) => ({ email: `renamed.${side.user.email}`, role: 'staff' }));
    expect(await userRow(t.rust.user.userId)).toEqual(await userRow(t.node.user.userId));
    await pair({ node: as(t.node), rust: as(t.rust) }, 'get', '/api/users/profile');

    // Lower-case id, trailing slash, unknown user.
    await pair(t, 'put', (side) => `${at(side).toLowerCase()}/`, { lastName: 'Lower' });
    await same('put', '/api/users/USER9999999999', csrfHeaders(admin, csrf), { firstName: 'x' });
    await same('put', '/api/users/USER9999999999', csrfHeaders(admin, csrf), { role: 'customer' });
    expect(await userRow(t.rust.user.userId)).toEqual(await userRow(t.node.user.userId));
  });

  test('DELETE /:id deactivates and revokes sessions', async () => {
    const t = await twoTargets();
    for (const side of ['node', 'rust']) expect(await refreshCount(t[side].user.userId)).toBeGreaterThan(0);
    await pair(t, 'delete', at);
    expect(await userRow(t.rust.user.userId)).toEqual(await userRow(t.node.user.userId));
    for (const side of ['node', 'rust']) {
      expect({ side, n: await refreshCount(t[side].user.userId) }).toEqual({ side, n: 0 });
      expect(await userRow(t[side].user.userId)).toMatchObject({ status: 'inactive', token_version: 1 });
    }
    const as = (side) => ({ auth: bearer(side.user.accessToken) });
    await pair({ node: as(t.node), rust: as(t.rust) }, 'get', '/api/users/profile');
    await pair(t, 'delete', at); // already inactive: still matched, bumps again
    expect(await userRow(t.rust.user.userId)).toEqual(await userRow(t.node.user.userId));
    await same('delete', '/api/users/USER9999999999', csrfHeaders(admin, csrf));
    await pair(t, 'get', at);
  });
});

// In production the error handler hides the parser's message, so a rejected
// body is byte-for-byte the same JSON (bar the timestamp); and the global /api
// limiter counts these routes on both. Separate servers in production mode.
const describeIfProd = P.RUST && P.rustBin() ? describe : describe.skip;

describeIfProd('users (account): production mode', () => {
  const env = { NODE_ENV: 'production', RATE_LIMIT_MAX_REQUESTS: '5', RATE_LIMIT_WINDOW_MS: '60000', TRUST_PROXY: '1' };
  let node; let rust;
  beforeAll(async () => {
    [node, rust] = await Promise.all([
      P.startNode({ port: Number(process.env.PARITY_UA_NODE_PORT || 7041), env }),
      P.startRust({ port: Number(process.env.PARITY_UA_RUST_PORT || 7042), env }),
    ]);
  }, 60000);
  afterAll(async () => { await Promise.all([node?.stop(), rust?.stop()]); });

  const hit = async (base, method, url, xff, contentType, body) => {
    const headers = { 'X-Forwarded-For': xff, ...(contentType && { 'Content-Type': contentType }) };
    const res = await fetch(base + url, { method, headers, body });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };

  test('error handler bodies and the global limiter', async () => {
    const client = `198.51.100.${10 + (Date.now() % 200)}`;
    const cases = [
      ['PUT', '/api/users/profile', 'application/json', '{bad'],
      ['DELETE', '/api/users/addresses/%E0'],
      ['GET', '/api/users/nope'],
      ['GET', '/api/users/profile'],
      ['GET', '/api/users'],
      ['GET', '/api/users/profile'], // the 6th request in the window: 429
    ];
    const statuses = [];
    for (const [method, url, ct, body] of cases) {
      // Timestamps normalized; a 429 is compared byte for byte.
      const view = (x) => (x.status === 429 ? x : { ...x, text: JSON.stringify(normU(JSON.parse(x.text))) });
      const n = view(await hit(node.url, method, url, client, ct, body));
      const r = view(await hit(rust.url, method, url, client, ct, body));
      P.expectSameRateLimit(n, r, `${method} ${url}`);
      statuses.push(n.status);
    }
    expect(statuses).toEqual([500, 500, 404, 401, 401, 429]);
  });
});

// Node regression tests for the bug fixed alongside the port (run without Rust).
describe('addresses: a write the database rejects is not reported as saved', () => {
  test('create and update with a 3-letter country answer 500 and save nothing', async () => {
    const user = await registerCustomer();
    const auth = bearer(user.accessToken);
    const body = { first_name: 'A', last_name: 'B', address_line_1: '1 St', city: 'C', state: 'D', postal_code: '1', country: 'USA' };
    const bad = await request(app).post('/api/users/addresses').set(auth).send(body);
    expect(bad.status).toBe(500);
    expect(bad.body.message).toBe('Failed to create address');
    expect(await addressRows(user.userId)).toEqual([]);

    const ok = await request(app).post('/api/users/addresses').set(auth).send({ ...body, country: 'US' });
    expect(ok.status).toBe(201);
    const upd = await request(app).put(`/api/users/addresses/${ok.body.keyValueTable.addressId}`).set(auth).send({ country: 'FRA' });
    expect(upd.status).toBe(500);
    expect(upd.body.message).toBe('Failed to update address');
    expect((await addressRows(user.userId))[0].address_json.country).toBe('US');
  });
});
