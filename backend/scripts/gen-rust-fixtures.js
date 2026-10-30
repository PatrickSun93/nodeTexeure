#!/usr/bin/env node
/**
 * Records what the Node backend's own code produces for a fixed set of inputs,
 * so the Rust API's unit tests can check they match it exactly:
 *
 *   cd backend && node scripts/gen-rust-fixtures.js
 *   → rust/crates/api/fixtures/node_compat.json (commit it)
 *
 * Covered: cookie-parser parsing, Express res.cookie/clearCookie, req.ip with
 * `trust proxy` hops, express-rate-limit's ipKeyGenerator, jsonwebtoken access
 * tokens + the `ms` timespans, bcryptjs hashes, csrfMiddleware tokens
 * (generation, validation, the middleware's answers), Buffer base64 decoding,
 * the email producer's subject interpolation and amount formatting, and the
 * unsubscribe tokens. Time and randomness are pinned so the output is stable.
 */
process.env.NODE_ENV = 'test';
const SECRET = 'fixture-secret-for-node-rust-compat-0123456789';
process.env.JWT_SECRET = SECRET;
delete process.env.CSRF_SECRET;

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const proxyaddr = require('proxy-addr');
const jwt = require('jsonwebtoken');
const ms = require('jsonwebtoken/node_modules/ms');
const bcrypt = require('bcryptjs');
const { ipKeyGenerator } = require('express-rate-limit');
const { compileTrust } = require('express/lib/utils');
const csrf = require('../middleware/csrfMiddleware');
const { buildUnsubscribeToken, buildUnsubscribeUrl } = require('../utils/emailSuppression');

const NOW = Date.UTC(2025, 9, 30, 8, 15, 42, 123);
const realNow = Date.now;
const realRandomBytes = crypto.randomBytes;
const at = (t, fn) => {
  Date.now = () => t;
  try { return fn(); } finally { Date.now = realNow; }
};

const out = { secret: SECRET, now_ms: NOW };

// --- cookie-parser ------------------------------------------------------------
out.cookie_parse = [
  'a=1', 'a=1; a=2', 'b = " x " ', 'c=%E0%A4%A', 'd=%41', '=x', 'e', 'f=j:1', 'g=j:0',
  'h=j:"s"', 'i=j:{"a":[1,2]}', 'j=j:{bad', 'k="', 'l=""', 'm=%2B%2F%3D', 'x=1;;y=2', 'n=a=b',
  ' sp = v ; t\t=\tw\t', 'a', 'q=%ZZ', 'r=%C3%A9', 's=%C3', 'csrf_token=j:123',
  'sessionId=j:true', 'p=j:[]', 'u=j:null', 'w=j:""', 'v=j:"x"; v=2', 'z=%zz%41', 'o;p=1',
  'first=1; second', 'big=j:123456789012345678901234567890', 'neg=j:-0', 'esc=j:"%41"',
].map((header) => {
  const req = { headers: { cookie: header } };
  cookieParser()(req, {}, () => {});
  return { header, cookies: { ...req.cookies } };
});

// --- res.cookie / res.clearCookie ------------------------------------------------
const cookieCases = [
  { name: 'sessionId', value: '0123456789abcdef0123456789abcdef', options: { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 } },
  { name: 'admin_auth', value: 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IlUifQ.sig-_', options: { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 86400000 } },
  { name: 'csrf_token', value: 'eyJkYXRhIjp7fQ+/==', options: { httpOnly: false, secure: false, sameSite: 'strict', path: '/', maxAge: 86400000 } },
  { name: 'a', value: 'x', options: { maxAge: 1500 } },
  { name: 'a', value: 'x', options: { maxAge: -500 } },
  { name: 'a', value: 'x', options: { maxAge: 0 } },
  { name: 'a', value: 'x', options: { maxAge: 'NaN' } },
  { name: 'a', value: 'x', options: { path: '' } },
  { name: 'a', value: 'x', options: { path: '/api', domain: 'example.com', sameSite: 'lax' } },
  { name: 'a', value: 'x', options: { sameSite: 'none', secure: true } },
  { name: 'a', value: 'é ü;,"\\', options: {} },
  { name: 'a', value: 'x', options: { expires_ms: Date.UTC(2030, 0, 2, 3, 4, 5, 678) } },
  { name: 'a b', value: 'x', options: {} },
  { name: 'admin_auth', clear: true, options: { path: '/', sameSite: 'strict', secure: true, httpOnly: true } },
  { name: 'csrf_token', clear: true, options: { path: '/', sameSite: 'strict', secure: false } },
  { name: 'sessionId', clear: true, options: {} },
  { name: 'old', clear: true, options: { maxAge: 1000 } },
];
const cookieApp = express();
cookieApp.get('/c/:i', (req, res) => {
  const c = cookieCases[Number(req.params.i)];
  const opts = { ...c.options };
  if (opts.maxAge === 'NaN') opts.maxAge = NaN;
  if (opts.expires_ms !== undefined) { opts.expires = new Date(opts.expires_ms); delete opts.expires_ms; }
  try {
    if (c.clear) res.clearCookie(c.name, opts); else res.cookie(c.name, c.value, opts);
    res.json({ setCookie: res.get('Set-Cookie') });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// --- req.ip --------------------------------------------------------------------
const ipCases = [];
for (const xff of [[], ['1.1.1.1'], ['1.1.1.1, 2.2.2.2'], ['1.1.1.1', '3.3.3.3'], [' , ,5.5.5.5 ,'],
  ['garbage'], ['9.9.9.9,8.8.8.8 ,7.7.7.7'], ['2001:db8::1']]) {
  for (const hops of [0, 1, 2, 3]) {
    const req = { headers: xff.length ? { 'x-forwarded-for': xff.join(', ') } : {}, socket: { remoteAddress: '10.0.0.2' } };
    ipCases.push({ socket: '10.0.0.2', xff, hops, ip: proxyaddr(req, compileTrust(hops)) });
  }
}
out.req_ip = ipCases;

out.ip_key = ['127.0.0.1', '::1', '::ffff:10.1.2.3', '2001:db8:1234:5678::1', '2001:db8:12ff:5678::1',
  '::1.2.3.4', 'fe80::1%eth0', 'garbage', '::', '2001:db8::', 'unknown', '::ffff:7f00:1']
  .map((ip) => [ip, ipKeyGenerator(ip)]);

// --- ms + jsonwebtoken ------------------------------------------------------------
out.ms = ['24h', '15m', '3600', '1.5h', '2 days', '-1h', 'abc', '1y', '1 week', '.5s', '5.', '5 ',
  '5  h', '5\th', '10MS', '1e3', '-.5h', '7d', '1 Hour', '2hrs', '3 mins', '100', '-5', '1.', 'h',
  '30 seconds', '2.5 yrs', '1msecs', 'x'.repeat(101)].map((s) => [s, ms(s) ?? null]);

// Exactly userRoutes.js signAccessToken, with expiresIn from ACCESS_TOKEN_TTL.
const signAccessToken = (user, ttl) => {
  const role = String(user.role).toLowerCase();
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: role === 'admin', isStaff: role === 'staff', tv: Number(user.token_version) || 0 },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: ttl }
  );
};
const users = [
  { id: 'USER0000000001', email: 'admin@example.com', role: 'admin', token_version: 0 },
  { id: 'USER0000000002', email: 'staff@example.com', role: 'Staff', token_version: 3 },
  { id: 'USER0000000003', email: null, role: 'CUSTOMER', token_version: 12 },
  { id: 'USER0000000004', email: 'zoë"\\@example.com', role: 'customer', token_version: 1 },
];
out.jwt = [];
for (const user of users) {
  for (const ttl of ['24h', '15m', '3600', '1.5h', '-1h', 'abc', '7 days', '2.5 yrs']) {
    let token = null;
    try { token = at(NOW, () => signAccessToken(user, ttl)); } catch { token = null; }
    out.jwt.push({ user, ttl, token });
  }
}

// --- bcryptjs ---------------------------------------------------------------------
const salt = (prefix) => `${prefix}abcdefghijklmnopqrstuv`;
out.bcrypt_hash = [];
for (const [prefix, pws] of [
  ['$2b$10$', ['Customer@123']],
  ['$2a$04$', ['Customer@123', '', 'pässwörd', 'a'.repeat(80), '😀 emoji']],
  ['$2b$04$', ['Admin@123', 'x'.repeat(71), 'x'.repeat(72), 'x'.repeat(73)]],
  ['$2y$05$', ['Staff@123']],
]) {
  for (const password of pws) out.bcrypt_hash.push({ password, hash: bcrypt.hashSync(password, salt(prefix)) });
}
const known = bcrypt.hashSync('Customer@123', salt('$2b$04$'));
const compareCases = [
  ['Customer@123', known],
  ['customer@123', known],
  ['Customer@123', known.slice(0, 59)],
  ['Customer@123', `${known}x`],
  ['Customer@123', known.slice(0, -1) + (known.endsWith('a') ? 'b' : 'a')],
  ['Customer@123', `$2x$${known.slice(4)}`],
  ['Customer@123', `$1$${known.slice(3)}`],
  ['a'.repeat(72) + 'b'.repeat(8), bcrypt.hashSync('a'.repeat(80), salt('$2b$04$'))],
  ['Customer@123', ''],
];
out.bcrypt_compare = compareCases.map(([password, hash]) => {
  let result;
  try { result = String(bcrypt.compareSync(password, hash)); } catch { result = 'throws'; }
  return { password, hash, result };
});

// --- CSRF ---------------------------------------------------------------------------
const withRandom = (hex, fn) => {
  crypto.randomBytes = (n) => Buffer.from(hex.padEnd(n * 2, '0').slice(0, n * 2), 'hex');
  try { return fn(); } finally { crypto.randomBytes = realRandomBytes; }
};
out.csrf = { generated: [], validate: [], middleware: [] };
for (const [userId, ts, random] of [
  ['USER0000000001', NOW, '00112233445566778899aabbccddeeff'],
  ['USER0000000042', NOW - 5000, 'ffffffffffffffffffffffffffffffff'],
  ['Zoë "quoted" \\ id', NOW + 1, '0123456789abcdef0123456789abcdef'],
]) {
  const token = withRandom(random, () => at(ts, () => csrf.generateCSRFToken({ id: userId })));
  out.csrf.generated.push({ userId, timestamp: ts, random, token });
}
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const b64 = (s) => Buffer.from(s).toString('base64');
// A token whose data text is `dataText`, signed the way validation recomputes it.
const signed = (dataText, sig) => b64(`{"data":${dataText},"signature":${JSON.stringify(sig ?? hmac(JSON.stringify(JSON.parse(dataText))))}}`);
const good = out.csrf.generated[0].token;
const U = 'USER0000000001';
const T = NOW;
const v = (label, token, userId = U, now = NOW + 1000) =>
  out.csrf.validate.push({ label, token, userId, now, valid: at(now, () => csrf.validateCSRFToken(token, { id: userId })) });
v('fresh', good);
v('wrong user', good, 'USER0000000002');
v('empty user', good, '');
v('expired by 1ms', good, U, T + 86400001);
v('exactly 24h old', good, U, T + 86400000);
v('from the future', good, U, T - 999999);
v('base64url, unpadded', good.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
v('junk and whitespace inside', `${good.slice(0, 10)} \n*${good.slice(10, 30)}\t${good.slice(30)}`);
v('padding then junk', `${good}=AAAA`);
v('truncated', good.slice(0, good.length - 8));
v('empty token', '');
v('not base64 json', b64('not json'));
v('json null', b64('null'));
v('json string', b64('"x"'));
v('signature flipped', b64(Buffer.from(good, 'base64').toString().replace(/"signature":"./, '"signature":"0')));
v('reordered keys', signed(`{"random":"ab","userId":"${U}","timestamp":${T}}`));
v('integer-like keys', signed(`{"b":1,"2":"two","userId":"${U}","1":"one","timestamp":${T}}`));
v('no timestamp never expires', signed(`{"userId":"${U}"}`), U, T + 10 * 86400000);
v('string timestamp', signed(`{"userId":"${U}","timestamp":"${T}"}`));
v('stale string timestamp', signed(`{"userId":"${U}","timestamp":"123"}`));
v('null timestamp', signed(`{"userId":"${U}","timestamp":null}`));
v('array timestamp', signed(`{"userId":"${U}","timestamp":["${T}"]}`));
v('bool timestamp', signed(`{"userId":"${U}","timestamp":true}`));
v('object timestamp', signed(`{"userId":"${U}","timestamp":{}}`), U, T);
v('float timestamp text', signed(`{"userId":"${U}","timestamp":1.761812142123e12,"x":[1.50,-0.0,1e21,1E-7,100]}`));
v('numeric userId', signed(`{"userId":1,"timestamp":${T}}`), '1');
v('data null', signed('null'));
v('data string', signed('"abc"'));
v('data array', signed(`["${U}"]`));
v('duplicate keys: last value wins', signed(`{"userId":"X","timestamp":${T},"userId":"${U}"}`));
v('unicode + escapes', signed(`{"userId":"Zo\\u00eb \\"q\\" \\\\ \\n","timestamp":${T},"r":"\\u2028\\u0001\\/"}`), 'Zoë "q" \\ \n');
v('signature as number', b64(`{"data":{"userId":"${U}","timestamp":${T}},"signature":12}`));
v('whitespace in json', b64(`{ "data" : { "userId" : "${U}" , "timestamp" : ${T} } , "signature" : "${hmac(JSON.stringify({ userId: U, timestamp: T }))}" }`));
v('invalid utf-8 in data', Buffer.concat([Buffer.from(`{"data":{"userId":"${U}","t":"`), Buffer.from([0xff, 0xfe]), Buffer.from(`"},"signature":"${hmac(JSON.stringify({ userId: U, t: '��' }))}"}`)]).toString('base64'));
v('other secret', b64(`{"data":{"userId":"${U}","timestamp":${T}},"signature":"${crypto.createHmac('sha256', 'nope').update(JSON.stringify({ userId: U, timestamp: T })).digest('hex')}"}`));

const mwApp = express();
mwApp.use(cookieParser());
mwApp.all('/w', (req, res, next) => {
  if (req.headers['x-test-user']) req.user = { id: req.headers['x-test-user'] };
  next();
}, csrf.csrfProtection, (req, res) => res.status(200).json(null));
const enc = encodeURIComponent;
const mwCases = [
  ['POST without a user', 'POST', null, {}],
  ['POST without header', 'POST', U, { Cookie: `csrf_token=${enc(good)}` }],
  ['POST with empty header', 'POST', U, { 'X-CSRF-Token': '', Cookie: `csrf_token=${enc(good)}` }],
  ['POST without cookie', 'POST', U, { 'X-CSRF-Token': good }],
  ['POST with empty cookie', 'POST', U, { 'X-CSRF-Token': good, Cookie: 'csrf_token=' }],
  ['POST mismatch', 'POST', U, { 'X-CSRF-Token': good, Cookie: 'csrf_token=other' }],
  ['POST valid', 'POST', U, { 'X-CSRF-Token': good, Cookie: `x=1; csrf_token=${enc(good)}` }],
  ['POST valid, cookie not encoded', 'POST', U, { 'X-CSRF-Token': good, Cookie: `csrf_token=${good}` }],
  ['POST wrong user', 'POST', 'USER0000000009', { 'X-CSRF-Token': good, Cookie: `csrf_token=${enc(good)}` }],
  ['POST same garbage twice', 'POST', U, { 'X-CSRF-Token': 'abc', Cookie: 'csrf_token=abc' }],
  ['POST j: cookie string', 'POST', U, { 'X-CSRF-Token': good, Cookie: `csrf_token=j:${enc(JSON.stringify(good))}` }],
  ['POST j: cookie number', 'POST', U, { 'X-CSRF-Token': '123', Cookie: 'csrf_token=j:123' }],
  ['PUT valid', 'PUT', U, { 'X-CSRF-Token': good, Cookie: `csrf_token=${enc(good)}` }],
  ['DELETE mismatch', 'DELETE', U, { 'X-CSRF-Token': good, Cookie: 'csrf_token=x' }],
  ['PATCH without header', 'PATCH', U, {}],
  ['GET skips', 'GET', null, {}],
  ['OPTIONS skips', 'OPTIONS', null, {}],
];

async function main() {
  out.set_cookie = [];
  for (let i = 0; i < cookieCases.length; i += 1) {
    Date.now = () => NOW;
    const res = await request(cookieApp).get(`/c/${i}`);
    Date.now = realNow;
    const c = cookieCases[i];
    out.set_cookie.push({
      name: c.name, value: c.value ?? '', clear: !!c.clear, options: c.options,
      set_cookie: [].concat(res.body.setCookie ?? [])[0] ?? null,
    });
  }
  out.encode_uri_component = ['abc', 'a+b/c=d', 'é ü', ';,"\\', "!*'()~-_.", '😀', '%'].map((s) => [s, encodeURIComponent(s)]);

  for (const [label, method, userId, headers] of mwCases) {
    Date.now = () => NOW + 1000;
    let req = request(mwApp)[method.toLowerCase()]('/w');
    if (userId) req = req.set('X-Test-User', userId);
    for (const [k, val] of Object.entries(headers)) req = req.set(k, val);
    const res = await req;
    Date.now = realNow;
    const sent = { ...headers };
    out.csrf.middleware.push({ label, method, userId, now: NOW + 1000, headers: sent, status: res.status, body: res.body ?? null });
  }

  out.base64 = ['YWJj', 'YWJ j', 'YW*Jj', 'YWI=', 'YWI=YWJj', 'YW=Jj', 'YWI', 'YQ', 'Y', '-_-_', '+/+/',
    'YWJj\n', 'YQ===', 'YQ=x=', 'Y=Q', '', '====', 'éYWJj']
    .map((s) => [s, Buffer.from(s, 'base64').toString('hex')]);

  // emailQueueProducer.enqueue's subject interpolation, verbatim.
  const interpolate = (template, variables) => {
    let subject = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(regex, String(value));
    });
    return subject;
  };
  out.subject = [
    ['Order {{ order_number }} / {{order_number}} {{other}}', { order_number: 'NOR-1' }],
    ['{{{order_number}}}', { order_number: 'X' }],
    ['{{  name\t}} and {{name}}', { name: 'Ada $& $$ $` $\' $1 $' }],
    ['Hi {{ first_name }}', { first_name: 7 }],
    ['Hi {{ first_name }}', { first_name: null }],
    ['Hi {{ first_name }}', { first_name: [1, 2] }],
    ['Hi {{ first_name }}', { first_name: { a: 1 } }],
    ['{{ a }}{{ b }}', { a: '1', b: '2' }],
    ['No placeholders', { a: 'x' }],
    ['{{ a }', { a: 'x' }],
    ['{{ a　}}', { a: 'wide spaces' }],
  ].map(([template, variables]) => ({ template, variables, subject: interpolate(template, variables) }));

  // emailQueueService's formatAmount, verbatim.
  const formatAmount = (value) => {
    const n = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  };
  out.format_amount = ['$123.40', '123.4', '$0.125', '', 'abc', '$1,234.565', '-5', '1.2.3', '--5', '5-3',
    '.5', '-.5', '0.375', '$9.995', '1e5'].map((s) => [s, formatAmount(s)]);

  out.unsubscribe = ['alice@example.com', ' Alice@Example.COM ', 'zoë+tag@example.com', 'a b@c.d']
    .map((email) => ({ email, token: buildUnsubscribeToken(email), url: buildUnsubscribeUrl(email, { baseUrl: 'http://shop.test/' }) }));

  const file = path.join(__dirname, '..', '..', 'rust', 'crates', 'api', 'fixtures', 'node_compat.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
