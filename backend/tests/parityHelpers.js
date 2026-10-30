// Shared machinery for Node ↔ Rust parity tests (tests/parity.test.js and the
// per-group parity files of later ports). Node is driven in-process through
// supertest (`app`), Rust over HTTP at RUST_API_URL; both read the same DB.
//
//   const P = require('./parityHelpers');
//   P.describeIfRust('reviews', () => {
//     test('list', () => P.compare('/api/reviews/product/PROD0000000001'));
//     test('write', () => P.compareWith('post', '/api/reviews/create', { headers: P.bearer(t), body: {...} }));
//   });
//
// Exports:
//   RUST, describeIfRust            Rust base URL / describe that skips without it
//   fresh(url)                      adds nocache=true (Node caches product reads)
//   compare(url, headers)           GET on both; same status + JSON body
//   compareWith(method, url, {headers, body, cookies})
//                                   any method; `cookies: true` also compares Set-Cookie
//   normalize(v) / norm(v)          JSON with generated ids/times replaced (see below)
//   normalizer(pairs)               build your own: [[regex, replacement], ...]
//   step(method, url, nodeToken, rustToken, body)
//                                   one step of a two-user sequence (Bearer per side)
//   call(side, method, url, auth, body)
//                                   one request on 'node' or 'rust' → {status, body, cookie, cookies, headers, text}
//   both(sides, method, url, body)  same step on both sides, each with its own auth/state
//   setCookies(res)                 every Set-Cookie of a supertest or fetch response
//   parseSetCookie(str)             → { name, value, attributes: { 'max-age': '60', httponly: true, ... } }
//   expectSameSetCookies(node, rust, { volatile })
//                                   same cookies/attributes; `volatile` names whose values are
//                                   random (compared by shape), Expires within 2 s
//   rateLimitHeaders(headers)       the RateLimit-* / X-RateLimit-* / Retry-After subset
//   expectSameRateLimit(node, rust) same status, content-type, body text and rate-limit headers
//                                   (reset/retry-after/date within 1 s)
//   startNode({ port, env }) / startRust({ port, env, bin })
//                                   a separate server process (e.g. NODE_ENV=production to
//                                   exercise the limiters); → { url, stop() }; bin defaults to
//                                   RUST_API_BIN or ../rust/target/debug/api
//   rustBin()                       that binary path, or null when it isn't built
//   bearer(token)                   { Authorization: 'Bearer …' }
//   backOffice() / describeBackOffice
//                                   /api/admin parity with sessions, CSRF and a Rust API
//                                   of the file's own (fresh admin limiters) — see below
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, request } = require('./helpers');

const RUST = process.env.RUST_API_URL;
const describeIfRust = RUST ? describe : describe.skip;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Node caches product responses for minutes; parity needs fresh reads.
const fresh = (url) => url + (url.includes('?') ? '&' : '?') + 'nocache=true';

const normalizer = (pairs) => (v) => {
  let s = JSON.stringify(v);
  for (const [re, rep] of pairs) s = s.replace(re, rep);
  return s === undefined ? v : JSON.parse(s);
};

const TIME = [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'];
// Wishlist sequences: generated wishlist ids and timestamps.
const normalize = normalizer([[/WISH\d{10}/g, 'WISH*'], TIME]);
// Cart / checkout sequences: line, cart, user and order ids, UUIDs, test emails.
const norm = normalizer([
  [/CARTITEM\d{10}/g, 'CARTITEM*'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, 'UUID'],
  [/NOR-[0-9A-Z]{5}-[0-9A-Z]{5}/g, 'NOR-*'],
  [/CART\d{10}/g, 'CART*'],
  [/USER\d{10}/g, 'USER*'],
  [/test\.\d+\.[a-z0-9]+@example\.com/g, 'EMAIL'],
  TIME,
]);

// ---------------------------------------------------------------------------
// Set-Cookie
// ---------------------------------------------------------------------------

/** Every Set-Cookie header of a supertest response or a fetch Response. */
function setCookies(res) {
  if (res && res.headers && typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res && res.headers && (res.headers['set-cookie'] ?? res.headers.get?.('set-cookie'));
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** "a=b; Path=/; HttpOnly" → { name: 'a', value: 'b', attributes: { path: '/', httponly: true } } */
function parseSetCookie(str) {
  const [pair, ...attrs] = str.split(';');
  const eq = pair.indexOf('=');
  const attributes = {};
  for (const a of attrs) {
    const i = a.indexOf('=');
    const key = (i === -1 ? a : a.slice(0, i)).trim().toLowerCase();
    attributes[key] = i === -1 ? true : a.slice(i + 1).trim();
  }
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), attributes, order: attrs.map((a) => a.split('=')[0].trim()) };
}

/**
 * Same cookies with the same attributes, in the same attribute order. Values of
 * `volatile` cookies (random ids, fresh tokens) are compared by shape only;
 * Expires may differ by up to 2 s (the two requests are not simultaneous).
 */
function expectSameSetCookies(nodeRes, rustRes, { volatile = [] } = {}) {
  const view = (res) => setCookies(res).map(parseSetCookie);
  const node = view(nodeRes);
  const rust = view(rustRes);
  const shape = (v) => v.replace(/[0-9a-f]/g, 'h').replace(/[A-Za-z0-9%]/g, 'x');
  const comparable = (c, other) => {
    const out = { name: c.name, value: c.value, order: c.order, attributes: { ...c.attributes } };
    if (volatile.includes(c.name)) out.value = shape(c.value);
    const theirs = other?.attributes?.expires;
    if (c.attributes.expires && theirs && Math.abs(Date.parse(c.attributes.expires) - Date.parse(theirs)) <= 2000) {
      out.attributes.expires = 'EXPIRES';
    }
    return out;
  };
  expect(rust.map((c, i) => comparable(c, node[i]))).toEqual(node.map((c, i) => comparable(c, rust[i])));
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

const RATE_LIMIT_HEADERS = ['ratelimit-policy', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset',
  'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];
// Seconds-until/epoch values that may tick between the two requests.
const RATE_LIMIT_CLOCK = ['ratelimit-reset', 'x-ratelimit-reset', 'retry-after'];

/** The rate-limit headers of a supertest headers object or fetch Headers. */
function rateLimitHeaders(headers) {
  const get = (name) => (typeof headers.get === 'function' ? headers.get(name) : headers[name]) ?? undefined;
  const out = {};
  for (const name of RATE_LIMIT_HEADERS) {
    const v = get(name);
    if (v !== undefined && v !== null) out[name] = String(v);
  }
  return out;
}

/**
 * `node`/`rust` are { status, headers, text } (see call()). Same status and
 * same rate-limit headers (the clock-based ones within 1 s of each other). A
 * 429 must also have the same content type and the same body bytes (the
 * limiter's message); other answers are compared as JSON.
 */
function expectSameRateLimit(node, rust, label = '') {
  const view = (r, other) => {
    const h = rateLimitHeaders(r.headers);
    const theirs = rateLimitHeaders(other.headers);
    for (const k of RATE_LIMIT_CLOCK) {
      if (h[k] !== undefined && theirs[k] !== undefined && Math.abs(Number(h[k]) - Number(theirs[k])) <= 1) h[k] = 'CLOCK';
    }
    const type = typeof r.headers.get === 'function' ? r.headers.get('content-type') : r.headers['content-type'];
    const limited = r.status === 429;
    return {
      label,
      status: r.status,
      ...(limited ? { type: type ?? null, text: r.text } : { body: parseJson(r.text) ?? r.text }),
      headers: h,
    };
  };
  expect(view(rust, node)).toEqual(view(node, rust));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function compare(url, headers = {}) {
  const node = await request(app).get(fresh(url)).set(headers);
  const rust = await fetch(RUST + url, { headers });
  const rustBody = await rust.json();
  expect({ url, status: rust.status, body: rustBody }).toEqual({ url, status: node.status, body: node.body });
}

async function compareWith(method, url, { headers = {}, body, cookies = false, volatile } = {}) {
  let nodeReq = request(app)[method](url).set(headers);
  if (body !== undefined) nodeReq = nodeReq.send(body);
  const node = await nodeReq;
  const rust = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { ...headers, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  expect({ url, status: rust.status, body: await rust.json() }).toEqual({ url, status: node.status, body: node.body });
  if (cookies) expectSameSetCookies(node, rust, { volatile });
  return { node, rust };
}

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

const parseJson = (text) => {
  try { return JSON.parse(text); } catch { return undefined; }
};

// One side of the comparison: Node via supertest, Rust via fetch. `auth` is a
// header object (Bearer or guest cookie) kept per side.
async function call(side, method, url, auth, body) {
  if (side === 'node') {
    let req = request(app)[method](url).set(auth);
    if (body !== undefined) req = req.send(body);
    const res = await req;
    const cookies = setCookies(res);
    return { status: res.status, body: res.body, cookie: cookies[0], cookies, headers: res.headers, text: res.text };
  }
  const res = await fetch(RUST + url, {
    method: method.toUpperCase(),
    headers: { ...auth, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const cookies = setCookies(res);
  return { status: res.status, body: parseJson(text), cookie: cookies[0], cookies, headers: res.headers, text };
}

// Run the same step on both sides; `url` and `body` may be functions of the
// side's own state (its cart items, cart id, last order).
async function both(sides, method, url, body) {
  const out = {};
  const pick = (v, s) => (typeof v === 'function' ? v(s) : v);
  for (const [side, s] of Object.entries(sides)) {
    out[side] = await call(side, method, pick(url, s), s.auth, pick(body, s));
    const kvt = out[side].body?.keyValueTable;
    if (kvt?.items) s.items = kvt.items;
    if (kvt?.cartId) s.cartId = kvt.cartId;
    if (kvt?.orderId) s.orderId = kvt.orderId;
  }
  const label = `${method.toUpperCase()} ${pick(url, sides.node)} ${JSON.stringify(pick(body, sides.node) ?? '')}`;
  const view = (r) => ({ label, status: r.status, body: norm(r.body) });
  expect(view(out.rust)).toEqual(view(out.node));
  return out;
}

// ---------------------------------------------------------------------------
// Extra server processes
// ---------------------------------------------------------------------------

const BACKEND_DIR = path.join(__dirname, '..');

function rustBin() {
  const bin = process.env.RUST_API_BIN || path.join(BACKEND_DIR, '..', 'rust', 'target', 'debug', 'api');
  return fs.existsSync(bin) ? bin : null;
}

// The DB the test suite uses, for a child process.
function dbEnv() {
  const { DB_HOST = 'localhost', DB_PORT = '3306', DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'bed_texture_ecommerce' } = process.env;
  return {
    DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
    DATABASE_URL: process.env.DATABASE_URL
      || `mysql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`,
    JWT_SECRET: process.env.JWT_SECRET,
  };
}

async function waitFor(url, child, logs) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${logs.join('')}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`server at ${url} did not start:\n${logs.join('')}`);
}

async function start(cmd, args, { env, probe, cwd }) {
  const logs = [];
  const child = spawn(cmd, args, { cwd, env: { PATH: process.env.PATH, ...dbEnv(), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  await waitFor(probe, child, logs);
  return {
    logs,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill('SIGTERM');
    }),
  };
}

/** `node server.js` on `port` with extra env (e.g. NODE_ENV=production). */
async function startNode({ port, env = {} }) {
  const url = `http://127.0.0.1:${port}`;
  // Probe outside /api so the global limiter doesn't count it.
  const server = await start(process.execPath, ['server.js'], { cwd: BACKEND_DIR, env: { PORT: String(port), ...env }, probe: `${url}/` });
  return { url, ...server };
}

/** The Rust API binary on `port` with extra env. */
async function startRust({ port, env = {}, bin = rustBin() }) {
  if (!bin) throw new Error('Rust API binary not found: build it (cd rust && cargo build -p api) or set RUST_API_BIN');
  const url = `http://127.0.0.1:${port}`;
  const server = await start(bin, [], { cwd: BACKEND_DIR, env: { API_PORT: String(port), RUST_LOG: 'warn', ...env }, probe: `${url}/health` });
  return { url, ...server };
}

// ---------------------------------------------------------------------------
// Back office (/api/admin): sessions, CSRF, and a Rust API of the file's own
// ---------------------------------------------------------------------------
//
// The admin limiters (adminLimiter: 100/min on everything that reaches the
// /api/admin router; adminRead/WriteLimiter and email-queue's own pair per
// route) have no `skip`, not even under NODE_ENV=test. Node's `app` is new in
// every test file, so its counts start at 0; backOffice() starts a Rust API for
// the file too (the binary at RUST_API_BIN or ../rust/target/debug/api — run
// `cargo build -p api` first), so both sides get the same request sequence and
// their RateLimit-* headers and 429s compare exactly, and the shared
// RUST_API_URL server never runs out of admin budget.
//
//   const BO = P.backOffice();
//   P.describeBackOffice('admin coupons', () => {
//     beforeAll(() => BO.start(), 60000);
//     afterAll(() => BO.stop());
//     test('list', () => BO.same('get', '/api/admin/coupons', { as: 'admin' }));
//     test('create', () => BO.same('post', '/api/admin/coupons', { as: 'admin', csrf: true, body: {...} }));
//   });
//
//   BO.same(method, url, opts)    same request on both sides: same status, same
//                                 JSON (timestamps normalized; `dropError`
//                                 ignores keyValueTable.error), same rate-limit
//                                 headers; a non-JSON answer (CSV, 429 text)
//                                 must match byte for byte with its Content-Type
//                                 (`text: true`; charset ignored). → { node, rust }
//   BO.call(side, method, url, opts)  one side → { status, headers, text, body, cookies }
//   opts: { as: 'admin'|'staff'|'customer'|session, csrf: true, headers, body,
//           raw: { type, text } (a body sent as is), normalize: fn }
//   BO.sessions.{admin,staff,customer}   { token, csrf, user } (one login each)
//   BO.throwaway(role)            a fresh user with that role, logged in, with a
//                                 CSRF token — for sequences that revoke it
//   BO.headers(session, { csrf }) Authorization (+ X-CSRF-Token and csrf_token cookie)
//   BO.rustUrl                    the file's own Rust API
const describeBackOffice = RUST && rustBin() ? describe : describe.skip;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const TIMESTAMPS = normalizer([TIME]);

function backOffice() {
  const helpers = require('./helpers');
  const { generateCSRFToken } = require('../middleware/csrfMiddleware');
  const bo = { sessions: {}, rustUrl: null, server: null };

  async function csrfFor(token, user) {
    if (user.role === 'customer') return generateCSRFToken(user); // the endpoint is staff/admin only
    const res = await request(app).get('/api/users/csrf-token').set(bearer(token));
    if (res.status !== 200) throw new Error(`csrf-token failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.keyValueTable.csrfToken;
  }

  async function session(who) {
    const kvt = await helpers.login(who);
    const user = { id: kvt.userId, email: kvt.email, role: kvt.role };
    return { token: kvt.accessToken, user, csrf: await csrfFor(kvt.accessToken, user) };
  }

  bo.start = async () => {
    const port = await freePort();
    const env = { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET };
    if (process.env.CSRF_SECRET) env.CSRF_SECRET = process.env.CSRF_SECRET;
    // A file that sets TRUST_PROXY before loading the app (so X-Forwarded-For
    // picks the limiter key on both sides) gets the same rule in Rust.
    if (process.env.TRUST_PROXY) env.TRUST_PROXY = process.env.TRUST_PROXY;
    bo.server = await startRust({ port, env });
    bo.rustUrl = bo.server.url;
    for (const who of ['admin', 'staff', 'customer']) bo.sessions[who] = await session(who);
    return bo;
  };

  bo.stop = async () => {
    if (bo.server) await bo.server.stop();
  };

  bo.throwaway = async (role = 'staff') => {
    const c = await helpers.registerCustomer();
    await helpers.DatabaseUtil.executeQuery('UPDATE users SET role = ? WHERE email = ?', [role, c.email]);
    const s = await session({ email: c.email, password: c.password });
    return { ...s, email: c.email };
  };

  bo.headers = (s, { csrf = false } = {}) => ({
    ...(s && bearer(s.token)),
    ...(csrf && s && { 'X-CSRF-Token': s.csrf, Cookie: `csrf_token=${encodeURIComponent(s.csrf)}` }),
  });

  bo.call = async (side, method, url, { as, csrf = false, headers = {}, body, raw } = {}) => {
    const s = typeof as === 'string' ? bo.sessions[as] : as;
    const all = { ...bo.headers(s, { csrf }), ...headers };
    if (side === 'node') {
      let req = request(app)[method](url).set(all);
      if (raw) req = req.set('Content-Type', raw.type).send(raw.text);
      else if (body !== undefined) req = req.send(body);
      const res = await req;
      return { status: res.status, headers: res.headers, text: res.text ?? '', body: parseJson(res.text), cookies: setCookies(res), res };
    }
    const res = await fetch(bo.rustUrl + url, {
      method: method.toUpperCase(),
      headers: {
        ...all,
        ...(raw && { 'Content-Type': raw.type }),
        ...(!raw && body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: raw ? raw.text : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, body: parseJson(text), cookies: setCookies(res), res };
  };

  bo.same = async (method, url, opts = {}) => {
    const node = await bo.call('node', method, url, opts);
    const rust = await bo.call('rust', method, url, opts);
    const fix = opts.normalize || ((v) => v);
    const type = (r) => {
      const t = typeof r.headers.get === 'function' ? r.headers.get('content-type') : r.headers['content-type'];
      return t ? t.split(';')[0] : null;
    };
    const view = (r, other) => {
      const h = rateLimitHeaders(r.headers);
      const theirs = rateLimitHeaders(other.headers);
      for (const k of RATE_LIMIT_CLOCK) {
        if (h[k] !== undefined && theirs[k] !== undefined && Math.abs(Number(h[k]) - Number(theirs[k])) <= 1) h[k] = 'CLOCK';
      }
      let content;
      if (r.body !== undefined && !opts.text) {
        content = fix(TIMESTAMPS(r.body));
        if (opts.dropError && content?.keyValueTable) delete content.keyValueTable.error;
      } else {
        content = { type: r.text === '' ? null : type(r), text: r.text };
      }
      return { label: `${method.toUpperCase()} ${url}`, status: r.status, content, rateLimit: h };
    };
    expect(view(rust, node)).toEqual(view(node, rust));
    return { node, rust };
  };

  return bo;
}

module.exports = {
  RUST, describeIfRust, bearer, fresh, normalizer, normalize, norm,
  compare, compareWith, step, call, both,
  setCookies, parseSetCookie, expectSameSetCookies,
  rateLimitHeaders, expectSameRateLimit,
  rustBin, startNode, startRust,
  backOffice, describeBackOffice, freePort,
};
