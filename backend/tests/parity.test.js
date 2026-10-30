// Node ↔ Rust parity for route groups ported to rust/crates/api: the same request
// must get the same status and JSON body from both. Runs when RUST_API_URL points
// at a running Rust API (CI's Rust job sets it); otherwise these are skipped.
//
//   RUST_API_URL=http://127.0.0.1:7000 DB_HOST=127.0.0.1 DB_PORT=3307 \
//     DB_PASSWORD=noirae_dev npx jest tests/parity.test.js
const { app, request } = require('./helpers');

const RUST = process.env.RUST_API_URL;
const describeIfRust = RUST ? describe : describe.skip;

// Node caches product responses for minutes; parity needs fresh reads.
const fresh = (url) => url + (url.includes('?') ? '&' : '?') + 'nocache=true';

async function compare(url, headers = {}) {
  const node = await request(app).get(fresh(url)).set(headers);
  const rust = await fetch(RUST + url, { headers });
  const rustBody = await rust.json();
  expect({ url, status: rust.status, body: rustBody }).toEqual({ url, status: node.status, body: node.body });
}

describeIfRust('products: Node and Rust answer identically', () => {
  const urls = [
    '/api/products',
    '/api/products?limit=2&page=2',
    '/api/products?limit=0',
    '/api/products?limit=1000&page=abc',
    '/api/products?limit=-3',
    '/api/products?category=CAT001',
    '/api/products?min_price=50',
    '/api/products?max_price=60&min_price=10',
    '/api/products?materials=100%25%20Cotton',
    '/api/products?materials=100%25%20cotton,%20silk',
    '/api/products?materials[]=100%25%20Cotton',
    '/api/products?material=Silk',
    '/api/products?search=Silk',
    '/api/products?search=blanket&locale=zh',
    "/api/products?search=%27%20OR%201%3D1%20--",
    '/api/products?search=%25',
    '/api/products?locale=fr',
    '/api/products?locale=xx',
    '/api/products/PROD0000000001',
    '/api/products/PROD0000000001?locale=es',
    '/api/products/rnd-premium-silk-pillowcases',
    '/api/products/PROD9999999999',
    '/api/products/by-ids?ids=PROD0000000002,PROD0000000001',
    '/api/products/by-ids?ids=PROD0000000001,PROD0000000001,nope',
    '/api/products/by-ids?ids=1,2',
    '/api/products/by-ids',
  ];

  test.each(urls)('%s', (url) => compare(url));

  test('locale from the NEXT_LOCALE cookie', () =>
    compare('/api/products?limit=3', { Cookie: 'theme=dark; NEXT_LOCALE=zh' }));
});

describeIfRust('search: Node and Rust answer identically', () => {
  test.each([
    '/api/search/autocomplete?q=silk',
    '/api/search/autocomplete?q=SILK',
    '/api/search/autocomplete?q=%20%20rnd%20',
    '/api/search/autocomplete?q=cotton',
    '/api/search/autocomplete?q=bed',
    '/api/search/autocomplete?q=s',
    '/api/search/autocomplete?q=',
    '/api/search/autocomplete',
    '/api/search/autocomplete?q=%27%20OR%201%3D1%20--',
    '/api/search/autocomplete?q=%25%25',
    '/api/search/autocomplete?q=%E4%B8%9D%E7%BB%B8',
    '/api/search/suggestions',
    '/api/search/recent?ids=PROD0000000002,PROD0000000001',
    '/api/search/recent?ids=PROD0000000001,PROD0000000001,bad,1',
    '/api/search/recent?ids=',
    '/api/search/recent',
  ])('%s', (url) => compare(url));
});

describeIfRust('journal + public settings: Node and Rust answer identically', () => {
  test.each([
    '/api/journal',
    '/api/journal?limit=2',
    '/api/journal?limit=0',
    '/api/journal?limit=abc',
    '/api/journal?limit=500',
    '/api/journal?category=Care',
    '/api/journal?category=All',
    '/api/journal?category=nope',
    '/api/settings/public',
  ])('%s', (url) => compare(url));

  test('article by id and by slug, and unknown', async () => {
    const list = await request(app).get('/api/journal?limit=1');
    const { id, slug } = list.body.keyValueTable.articles[0];
    await compare(`/api/journal/${id}`);
    await compare(`/api/journal/${slug}`);
    await compare('/api/journal/no-such-article');
  });
});

// ---------------------------------------------------------------------------
// Authenticated routes. Read-only checks reuse one user on both sides (same DB
// rows → same JSON); write sequences run on two fresh users, one per service,
// and compare each step after normalizing generated ids and timestamps.
// ---------------------------------------------------------------------------
const jwt = require('jsonwebtoken');
const { login, registerCustomer, DatabaseUtil } = require('./helpers');

async function compareWith(method, url, { headers = {}, body } = {}) {
  let nodeReq = request(app)[method](url).set(headers);
  if (body !== undefined) nodeReq = nodeReq.send(body);
  const node = await nodeReq;
  const rust = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { ...headers, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  expect({ url, status: rust.status, body: await rust.json() }).toEqual({ url, status: node.status, body: node.body });
}

const normalize = (v) => JSON.parse(JSON.stringify(v)
  .replace(/WISH\d{10}/g, 'WISH*')
  .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'));

async function step(method, url, nodeToken, rustToken, body) {
  let nodeReq = request(app)[method](url).set('Authorization', `Bearer ${nodeToken}`);
  if (body !== undefined) nodeReq = nodeReq.send(body);
  const node = await nodeReq;
  const rust = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { Authorization: `Bearer ${rustToken}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const label = `${method.toUpperCase()} ${url} ${JSON.stringify(body ?? '')}`;
  expect({ label, status: rust.status, body: normalize(await rust.json()) })
    .toEqual({ label, status: node.status, body: normalize(node.body) });
}

describeIfRust('auth: Node and Rust reject the same tokens the same way', () => {
  const secret = process.env.JWT_SECRET;
  const sign = (payload, opts = {}) => jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h', ...opts });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

  test('missing, malformed and forged tokens', async () => {
    const bearer = (t) => ({ headers: { Authorization: `Bearer ${t}` } });
    await compareWith('get', '/api/wishlist');
    await compareWith('get', '/api/wishlist', bearer('garbage'));
    await compareWith('get', '/api/wishlist', { headers: { Authorization: 'Bearer ' } });
    await compareWith('get', '/api/wishlist', { headers: { Authorization: 'Token abc' } });
    await compareWith('get', '/api/wishlist', bearer(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 'USER0000000003' })}.`));
    await compareWith('get', '/api/wishlist', bearer(jwt.sign({ id: 'USER0000000003' }, 'another-secret-another-secret-123')));
    await compareWith('get', '/api/wishlist', bearer(sign({ id: 'USER0000000003' }, { expiresIn: -5 })));
    await compareWith('get', '/api/wishlist', bearer(sign({ id: 'USER9999999999' })));
    await compareWith('get', '/api/wishlist', bearer(sign({ email: 'no-id@example.com' })));
  });

  test('valid token via header and via admin_auth cookie', async () => {
    const { accessToken } = await login('customer');
    await compareWith('get', '/api/wishlist', { headers: { Authorization: `Bearer ${accessToken}` } });
    await compareWith('get', '/api/wishlist', { headers: { Cookie: `x=1; admin_auth=${accessToken}` } });
    // An empty Bearer header takes precedence over a valid cookie (Node behaviour).
    await compareWith('get', '/api/wishlist', { headers: { Authorization: 'Bearer ', Cookie: `admin_auth=${accessToken}` } });
  });

  test('revoked and deactivated sessions', async () => {
    const user = await registerCustomer();
    const auth = { headers: { Authorization: `Bearer ${user.accessToken}` } };
    await compareWith('get', '/api/wishlist', auth);
    await DatabaseUtil.executeQuery('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [user.userId]);
    await compareWith('get', '/api/wishlist', auth);
    const other = await registerCustomer();
    await DatabaseUtil.executeQuery("UPDATE users SET status = 'suspended' WHERE id = ?", [other.userId]);
    await compareWith('get', '/api/wishlist', { headers: { Authorization: `Bearer ${other.accessToken}` } });
  });
});

describeIfRust('wishlist: same sequence, same answers', () => {
  test('add / duplicate / validate / list / check / remove', async () => {
    const a = (await registerCustomer()).accessToken; // Node
    const b = (await registerCustomer()).accessToken; // Rust
    const s = (method, url, body) => step(method, url, a, b, body);

    await s('get', '/api/wishlist');
    await s('post', '/api/wishlist', {});
    await s('post', '/api/wishlist', { product_id: '' });
    await s('post', '/api/wishlist', { product_id: 'PROD9999999999' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000001' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000001' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000002', variant_id: 'PROD0000000001-VAR-1' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000002', variant_id: 'PROD0000000002-VAR-2' });
    await s('post', '/api/wishlist', { product_id: 'PROD0000000002', variant_id: 'PROD0000000002-VAR-2' });
    await s('get', '/api/wishlist');
    await s('get', '/api/wishlist/check/PROD0000000001');
    await s('get', '/api/wishlist/check/PROD0000000003');
    await s('delete', '/api/wishlist/PROD0000000001');
    await s('delete', '/api/wishlist/PROD0000000001');
    await s('get', '/api/wishlist');
  });
});
