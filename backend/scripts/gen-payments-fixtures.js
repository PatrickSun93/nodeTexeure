#!/usr/bin/env node
/**
 * Records what the real Node code does for the Rust port of /api/payments and
 * /api/images, for the Rust unit tests:
 *
 *   cd backend && node scripts/gen-payments-fixtures.js
 *   → rust/crates/api/fixtures/payments_images.json (commit it)
 *
 * - `stripe.requests`: services/stripeService.js (the real module) with a
 *   Stripe client pointed at a local HTTP server: every request the SDK sent
 *   (method, path, the headers that matter, body) for each call.
 * - `stripe.responses`: canned answers (API errors, OAuth errors, bad JSON,
 *   500s that the SDK retries, a closed port) and what the call resolved to or
 *   the error message it threw, plus how many requests the SDK made.
 * - `webhooks`: stripe.webhooks.constructEvent on signed / unsigned / broken
 *   payloads and headers, with a fixed clock: the event or the error message.
 * - `thumbnails`: sharp's resize(w, w, { fit: 'cover', withoutEnlargement })
 *   → jpeg({ quality: 85 }) on generated images: input (base64) and the output
 *   size and format for each thumbnail width.
 * - `paths`: path.extname / the upload route's safe extension / getMimeType.
 * Output is deterministic (no clocks or randomness reach it).
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', '..', 'rust', 'crates', 'api', 'fixtures', 'payments_images.json');

// --- a local "Stripe" -------------------------------------------------------

const KEEP_HEADERS = ['accept', 'authorization', 'content-type', 'content-length', 'stripe-version', 'idempotency-key'];

function mockServer() {
  const state = { requests: [], answers: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const headers = {};
      for (const h of KEEP_HEADERS) if (req.headers[h] !== undefined) headers[h] = req.headers[h];
      if (headers['idempotency-key']) {
        headers['idempotency-key'] = headers['idempotency-key'].replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'UUID');
      }
      state.requests.push({ method: req.method, path: req.url, headers, body });
      const answer = state.answers.shift() || { status: 200, body: '{"id":"obj_1","object":"thing"}' };
      res.writeHead(answer.status, { 'Content-Type': 'application/json', ...(answer.headers || {}) });
      res.end(answer.body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port })));
}

/** services/stripeService.js with its Stripe client sent to 127.0.0.1:port. */
function loadStripeService(port) {
  const Real = require('stripe');
  const id = require.resolve('stripe');
  const wrapped = function Stripe(key, opts) {
    return new Real(key, { ...opts, host: '127.0.0.1', port, protocol: 'http' });
  };
  require.cache[id].exports = wrapped;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_key';
  delete require.cache[require.resolve('../services/stripeService')];
  const service = require('../services/stripeService');
  require.cache[id].exports = Real;
  return service;
}

const URLS = ['http://localhost:3000/order/confirmation/ord-1?session_id={CHECKOUT_SESSION_ID}', 'http://localhost:3000/checkout?cancelled=true'];

const REQUEST_CASES = [
  { name: 'checkout typical', fn: 'createCheckoutSession', args: ['3f1c2b9e-1111-4222-8333-444455556666', [
    { name: 'Mulberry Silk Pillowcase', quantity: 2, unitAmount: 4999 },
    { name: 'Tax', quantity: 1, unitAmount: 800 },
    { name: 'Shipping', quantity: 1, unitAmount: 1500 },
  ], 'alice.customer@example.com', ...URLS] },
  { name: 'checkout odd values', fn: 'createCheckoutSession', args: ['ORD x/y?z', [
    { name: null, quantity: 1, unitAmount: 1999.5 },
    { name: "Soie & Cachemire — 100% «luxe» ✓ 😀 a+b=c [x] (y) !*'~", quantity: 3, unitAmount: 1e21 },
    { name: 'neg', quantity: 1, unitAmount: -0.5 },
  ], null, ...URLS] },
  { name: 'checkout no items', fn: 'createCheckoutSession', args: ['o', [], 'x@y.z', 'a', 'b'] },
  { name: 'intent typical', fn: 'createPaymentIntent', args: [12345, 'usd', { orderId: 'ord-1', orderNumber: 'NOR-ABCDE-12345' }] },
  { name: 'intent odd', fn: 'createPaymentIntent', args: [NaN, 'usd', { orderId: 'o', orderNumber: null }] },
  { name: 'intent big', fn: 'createPaymentIntent', args: [123456789012345680000, 'usd', { orderId: 'o' }] },
  { name: 'refund full', fn: 'processRefund', args: ['pi_123', null] },
  { name: 'refund partial', fn: 'processRefund', args: ['pi_123', 500] },
  { name: 'refund rounded', fn: 'processRefund', args: ['pi_123', 0.4] },
  { name: 'refund NaN', fn: 'processRefund', args: ['pi_123', NaN] },
  { name: 'session', fn: 'getCheckoutSession', args: ['cs_test_a1B2'] },
  { name: 'session odd id', fn: 'getCheckoutSession', args: ["a/b c?d#é&x=1!*'()"] },
];

const json = (status, body, headers) => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body), headers });

const RESPONSE_CASES = [
  { name: 'ok', answers: [json(200, { id: 're_1', amount: 500, status: 'succeeded' })] },
  { name: 'card error', answers: [json(402, { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } })] },
  { name: 'invalid request', answers: [json(400, { error: { type: 'invalid_request_error', message: "No such payment_intent: 'pi_123'" } })] },
  { name: 'auth error', answers: [json(401, { error: { message: 'Invalid API Key provided: sk_test_***' } })] },
  { name: 'oauth string error', answers: [json(400, { error: 'invalid_grant', error_description: 'This authorization code has expired.' })] },
  { name: 'empty error', answers: [json(400, { error: {} })] },
  { name: 'error without message on 200', answers: [json(200, { error: { type: 'api_error' } })] },
  { name: 'falsy error', answers: [json(400, { error: null, id: 're_2' })] },
  { name: 'bad json', answers: [{ status: 200, body: '<html>nope</html>' }] },
  { name: 'null json', answers: [{ status: 200, body: 'null' }] },
  // (A bare number or string makes the SDK's Object.defineProperty throw in a
  // promise nobody handles: an unhandled rejection that takes Node down.)
  { name: 'retry 500 then ok', answers: [json(500, { error: { type: 'api_error', message: 'boom' } }), json(200, { id: 're_3', amount: 1, status: 'pending' })] },
  { name: 'retry 409 then ok', answers: [json(409, { error: { type: 'idempotency_error', message: 'conflict' } }), json(200, { id: 're_4' })] },
  { name: '500 three times', answers: [json(500, { error: { type: 'api_error', message: 'boom 1' } }), json(500, { error: { type: 'api_error', message: 'boom 2' } }), json(503, { error: { type: 'api_error', message: 'boom 3' } })] },
  { name: '500 should-retry false', answers: [json(500, { error: { type: 'api_error', message: 'no retry' } }, { 'Stripe-Should-Retry': 'false' })] },
  { name: '400 should-retry true', answers: [json(400, { error: { type: 'invalid_request_error', message: 'retry me' } }, { 'Stripe-Should-Retry': 'true' }), json(200, { id: 're_5' })] },
];

async function stripeCases() {
  const { server, state, port } = await mockServer();
  const service = loadStripeService(port);
  const requests = [];
  for (const c of REQUEST_CASES) {
    state.requests.length = 0;
    state.answers.length = 0;
    let result;
    try {
      result = { value: await service[c.fn](...c.args) };
    } catch (e) {
      result = { error: e.message };
    }
    // Args through JSON: NaN/1e21 survive as strings so the Rust test can rebuild them.
    const args = JSON.parse(JSON.stringify(c.args, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : typeof v === 'number' && Math.abs(v) >= 1e15 ? `#${v}` : v)));
    requests.push({ name: c.name, fn: c.fn, args, sent: state.requests.slice(), result });
  }
  const responses = [];
  for (const c of RESPONSE_CASES) {
    state.requests.length = 0;
    state.answers = c.answers.slice();
    let outcome;
    try {
      const value = await service.processRefund('pi_123', 500);
      outcome = { value: value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value)) };
    } catch (e) {
      outcome = { error: e.message };
    }
    responses.push({ name: c.name, answers: c.answers, requests: state.requests.length, ...outcome });
  }
  await new Promise((r) => server.close(r));
  // A port nothing listens on: the SDK retries twice, then gives up.
  const closed = await new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const dead = loadStripeService(closed);
  let connection;
  try {
    await dead.processRefund('pi_123', null);
  } catch (e) {
    connection = e.message;
  }
  return { requests, responses, connectionError: connection };
}

// --- webhooks ---------------------------------------------------------------

const SECRET = 'whsec_fixture_secret';
const NOW = 1761800000; // seconds
const sign = (payload, t = NOW, secret = SECRET) => crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');

function webhookCases() {
  const stripe = require('stripe')('sk_test_x');
  const event = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: { orderId: 'o1' }, amount_total: 1000 } } });
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const cases = [];
  const add = (name, { payload, raw, object, header, secret = SECRET, now = NOW }) => {
    let input;
    if (object !== undefined) input = object;
    else if (raw !== undefined) input = Buffer.from(raw, 'base64');
    else input = Buffer.from(payload, 'utf8');
    let result;
    try {
      result = { event: stripe.webhooks.constructEvent(input, header, secret, undefined, undefined, now * 1000) };
    } catch (e) {
      result = { error: e.message };
    }
    cases.push({
      name,
      payload: object !== undefined ? { object } : { base64: raw !== undefined ? raw : b64(payload) },
      header: header === undefined ? null : header,
      secret,
      now,
      ...result,
    });
  };
  add('valid', { payload: event, header: `t=${NOW},v1=${sign(event)}` });
  add('valid among others', { payload: event, header: `t=${NOW},v1=deadbeef,v0=${sign(event)},v1=${sign(event)}` });
  add('only v0', { payload: event, header: `t=${NOW},v0=${sign(event)}` });
  add('no header', { payload: event, header: undefined });
  add('empty header', { payload: event, header: '' });
  add('garbage header', { payload: event, header: 'garbage' });
  add('no timestamp', { payload: event, header: `v1=${sign(event)}` });
  add('NaN timestamp signed', { payload: event, header: `t=abc,v1=${sign(event, 'NaN')}` });
  add('parseInt timestamp', { payload: event, header: `t=0${NOW}xyz,v1=${sign(event)}` });
  add('spaced timestamp', { payload: event, header: `t= ${NOW},v1=${sign(event)}` });
  add('signed minus zero', { payload: event, header: `t=-0,v1=${sign(event, 0)}`, now: 100 });
  add('huge timestamp', { payload: event, header: `t=99999999999999999999999,v1=${sign(event, '1e+23')}` });
  add('last t wins', { payload: event, header: `t=1,t=${NOW},v1=${sign(event)}` });
  add('too old', { payload: event, header: `t=${NOW - 301},v1=${sign(event, NOW - 301)}` });
  add('just in tolerance', { payload: event, header: `t=${NOW - 300},v1=${sign(event, NOW - 300)}` });
  add('future', { payload: event, header: `t=${NOW + 5000},v1=${sign(event, NOW + 5000)}` });
  add('wrong signature', { payload: event, header: `t=${NOW},v1=${'0'.repeat(64)}` });
  add('wrong secret with whitespace', { payload: event, header: `t=${NOW},v1=${sign(event)}`, secret: `${SECRET}\n` });
  add('right secret with whitespace', { payload: event, header: `t=${NOW},v1=${sign(event, NOW, 'a b')}`, secret: 'a b' });
  add('spaces after commas', { payload: event, header: `t=${NOW}, v1=${sign(event)}` });
  add('joined duplicate header', { payload: event, header: `t=${NOW},v1=${sign(event)}, t=1,v1=x` });
  add('v1 without value', { payload: event, header: `t=${NOW},v1` });
  add('v1 empty', { payload: event, header: `t=${NOW},v1=,v1=${sign(event)}` });
  add('v1 with equals', { payload: event, header: `t=${NOW},v1=${sign(event)}=x` });
  add('uppercase hex', { payload: event, header: `t=${NOW},v1=${sign(event).toUpperCase()}` });
  add('object payload unsigned', { object: { a: 1 }, header: `t=${NOW},v1=${'0'.repeat(64)}` });
  add('object payload whitespace secret', { object: {}, header: `t=${NOW},v1=00`, secret: ' s' });
  add('object payload signed', { object: {}, header: `t=${NOW},v1=${sign('[object Object]')}` });
  add('array payload signed', { object: [1, 2], header: `t=${NOW},v1=${sign('1,2')}` });
  add('empty payload signed', { payload: '', header: `t=${NOW},v1=${sign('')}` });
  const bom = '﻿' + event;
  add('bom payload signed without bom', { payload: bom, header: `t=${NOW},v1=${sign(event)}` });
  add('bom payload signed with bom', { payload: bom, header: `t=${NOW},v1=${sign(bom)}` });
  const bad = Buffer.concat([Buffer.from('{"a":"'), Buffer.from([0xff, 0xc3, 0x28, 0xe2, 0x82]), Buffer.from('"}')]);
  const badText = new TextDecoder('utf8').decode(bad);
  add('invalid utf8 signed', { raw: bad.toString('base64'), header: `t=${NOW},v1=${sign(badText)}` });
  for (const text of ['[object Object]', '1,2', '{"a":1}x', '{"a":tru}', '{a:1}', '[1,]', '"abc', '{"a" 1}', '  ', '-', '1.', '{"a":"\\q"}',
    '[1 2]', 'nul', '{"a":1,}', 'null', '42', '"str"', '[]', '{"a":"\u0001"}', '1e400', '{"a":1e}', '[-]', '01', '{"a":1', '[', '{"x":[1,{"y":', 'tru', 'True', '{"\\u12"}']) {
    add(`json ${text}`, { payload: text, header: `t=${NOW},v1=${sign(text)}` });
  }
  return cases;
}

// --- thumbnails -------------------------------------------------------------

const SIZES = { small: 150, medium: 400, large: 800 };
const INPUTS = [
  ['jpeg', 1600, 1200], ['jpeg', 1001, 333], ['jpeg', 640, 480], ['jpeg', 150, 150], ['jpeg', 100, 80],
  ['png', 2000, 100], ['png', 100, 2000], ['png', 800, 800], ['png', 799, 801], ['png', 401, 399], ['png', 300, 200],
  ['webp', 1200, 900], ['webp', 151, 149], ['gif', 500, 1000], ['gif', 64, 64], ['tiff', 900, 600], ['tiff-jpeg', 300, 200],
  ['jpeg', 3001, 2001], ['png', 1, 1], ['png', 1000, 3],
];

async function thumbnailCases() {
  const out = [];
  for (const [format, width, height] of INPUTS) {
    // TIFF: LZW, and sharp's default (JPEG-compressed YCbCr, which the Rust
    // decoder does not read — a known difference, see imaging.rs).
    const encode = format === 'tiff' ? ['tiff', { compression: 'lzw' }] : format === 'tiff-jpeg' ? ['tiff'] : [format];
    const input = await sharp({ create: { width, height, channels: format === 'png' ? 4 : 3, background: { r: 180, g: 150, b: 110, alpha: 0.8 } } })
      .toFormat(...encode)
      .toBuffer();
    const thumbnails = {};
    for (const [name, size] of Object.entries(SIZES)) {
      const buf = await sharp(input).resize(size, size, { fit: 'cover', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      const meta = await sharp(buf).metadata();
      thumbnails[name] = { width: meta.width, height: meta.height, format: meta.format };
    }
    out.push({ format, width, height, input: input.toString('base64'), thumbnails });
  }
  // Not an image: every thumbnail fails.
  for (const bytes of [Buffer.from('definitely not an image'), Buffer.alloc(0)]) {
    let error;
    try {
      await sharp(bytes).resize(150, 150, { fit: 'cover', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch (e) {
      error = e.message;
    }
    out.push({ format: 'none', input: bytes.toString('base64'), error });
  }
  return out;
}

// --- paths ------------------------------------------------------------------

function pathCases() {
  const names = ['photo.JPG', 'a.b.c.png', '.bashrc', 'noext', 'trailing.', 'x..', 'résumé.Jpeg', 'a.PNG ', 'b.webp?x', 'c.tar.gz', '..', '.', '',
    'evil.ph p', 'ΣΑΣ.ΣΣ', 'x.İ', 'z.GIF', 'y.svg', '..png', 'a.jpe g'];
  return names.map((name) => {
    const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safe = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const productExt = path.extname(name).toLowerCase() || '.jpg';
    const mime = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    }[productExt.toLowerCase()] || 'application/octet-stream';
    return { name, extname: path.extname(name), uploadExt: safe, productExt, mime };
  });
}

(async () => {
  const fixtures = {
    stripe: await stripeCases(),
    webhooks: webhookCases(),
    thumbnails: await thumbnailCases(),
    paths: pathCases(),
  };
  fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 1) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
