#!/usr/bin/env node
/**
 * Records what the real Node code does for the Rust ports of /api/unsubscribe
 * and /api/shipping, for the Rust unit tests:
 *
 *   cd backend && node scripts/gen-misc-fixtures.js
 *   → rust/crates/api/fixtures/misc_compat.json (commit it)
 *
 * - `query`: Express's own "extended" query parser (qs) on raw query strings.
 * - `urlencoded`: express.urlencoded({ extended: true }) on raw bodies, through
 *   a real Express app (the parsed body, or the error status + message).
 * - `fedex`: services/shippingService.js configured with fake credentials and a
 *   stubbed `fetch` that answers canned responses: every request it made
 *   (method, path, headers, body) and every result or error message.
 * Output is deterministic (no clocks or randomness reach it).
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { compileQueryParser } = require('express/lib/utils');

const QUERIES = [
  '', 'email=a@b.co&token=t', 'email=A%40B.CO', 'email=a&email=b', 'email[]=x@y.z',
  'email[0]=a&email[1]=b', 'email[1]=b&email[0]=a', 'email[x]=1', 'email%5Bx%5D=1',
  'email=a&email[x]=b', 'email[x]=b&email=a', 'email[]=a&email[x]=b', 'email[]=a&email=',
  'email[]=&email[]=', 'email', 'email=', '=x&&', '[email]=x', 'email=%E0%A4%A', 'email=a+b%20c',
  'token=a&token=b', 'token[]=a', 'token[a][b]=1', 'token[=1', 'token]=1', 'a[b][c][d][e][f][g]=1',
  'a[1001]=x', 'a[999]=x&a[]=y', 'a[2]=x&a[2]=y', 'a[0][b]=1&a[0][c]=2', 'a[][b]=1&a[][b]=2',
  '0=a&b=c&1=d', 'email=x%5By%5D', '__proto__[email]=x', 'email[__proto__]=x', 'constructor=1',
  'a=1&a=2&a[]=3&a[x]=4', 'a[x]=1&a=2&a=3', 'email=%F0%9F%98%80&token=%25',
];

const BODIES = [
  'email=a%40b.co&token=x', 'name=Ann+Lee', 'items[0][weight]=3&items[1][weight]=4',
  'destination[postalCode]=10001&destination[city]=NY', 'a[]=1&a[]=2&a[x]=3',
  'a' + '[b]'.repeat(33) + '=1', 'a' + '[b]'.repeat(31) + '=1', 'x=%E0', 'k', '&&', 'a=1&a=2',
];

async function urlencodedCases() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.post('/', (req, res) => res.json({ body: req.body }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ status: err.status, message: err.message }));
  const out = [];
  for (const body of BODIES) {
    const res = await request(app).post('/').set('Content-Type', 'application/x-www-form-urlencoded').send(body);
    out.push({ input: body, ...(res.status === 200 ? { body: res.body.body } : { error: res.body }) });
  }
  return out;
}

// --- FedEx -----------------------------------------------------------------

const TOKEN = { access_token: 'tok-1', expires_in: 3600 };
const json = (status, body) => ({ status, text: typeof body === 'string' ? body : JSON.stringify(body) });

const DESTINATION = { streetLines: ['1 Main St'], city: 'Boston', stateOrProvinceCode: 'MA', postalCode: '02101', countryCode: 'US' };
const PACKAGES = [{ weight: 3, length: 12, width: 10, height: 4 }, { weight: '5', length: 1, width: 2, height: 3 }];
const SHIPMENT = {
  recipient: { streetLines: ['1 Main St'], city: 'Boston', stateOrProvinceCode: 'MA', postalCode: '02101', countryCode: 'US' },
  recipientName: 'Ann Lee', recipientPhone: '5551234', serviceType: 'FEDEX_GROUND', packages: [{ weight: 2 }],
};
const SHIPMENT_BARE = { ...SHIPMENT, recipientName: '', recipientPhone: 12345, serviceType: { odd: true } };

const RATE_REPLY = {
  output: {
    rateReplyDetails: [
      { serviceType: 'FEDEX_GROUND', serviceName: 'FedEx Ground', commit: { dateDetail: { dayFormat: 'MON' } }, ratedShipmentDetails: [{ totalNetCharge: '12.50', currency: 'USD' }] },
      { serviceType: 'PRIORITY_OVERNIGHT', ratedShipmentDetails: [{ totalNetCharge: 45.1 }] },
      { serviceName: '', commit: null, ratedShipmentDetails: 'x' },
      { serviceType: 'X', ratedShipmentDetails: [{ totalNetCharge: 'abc', currency: '' }] },
      { serviceType: 'Y', ratedShipmentDetails: { 0: { totalNetCharge: [7], currency: 'EUR' } } },
      'odd',
    ],
  },
};

const CASES = [
  { name: 'rates: token then quote, mapped', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(200, RATE_REPLY)] } },
  { name: 'rates: the token is cached', calls: [['getRates', DESTINATION, PACKAGES], ['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(200, { output: {} })] } },
  { name: 'rates: no expires_in, a new token each time', calls: [['getRates', DESTINATION, PACKAGES], ['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, { access_token: 'a' }), json(200, { access_token: 'b', expires_in: '120' })], '/rate/v1/rates/quotes': [json(200, {})] } },
  { name: 'rates: missing access_token is sent as undefined', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, { expires_in: 3600 })], '/rate/v1/rates/quotes': [json(200, { output: { rateReplyDetails: [] } })] } },
  { name: 'rates: auth failure falls back', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(401, 'bad client')] } },
  { name: 'rates: quote error falls back', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(500, 'boom')] } },
  { name: 'rates: non-JSON reply falls back', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(200, '<html>')] } },
  { name: 'rates: non-array details fall back', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(200, { output: { rateReplyDetails: { a: 1 } } })] } },
  { name: 'rates: a null detail falls back', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(200, { output: { rateReplyDetails: [null] } })] } },
  { name: 'rates: null reply falls back', calls: [['getRates', DESTINATION, PACKAGES]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/rate/v1/rates/quotes': [json(200, 'null')] } },
  { name: 'rates: network failure falls back', network: true, calls: [['getRates', DESTINATION, PACKAGES]], responses: {} },
  { name: 'ship: label created', calls: [['createShipment', SHIPMENT]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/ship/v1/shipments': [json(200, { output: { transactionShipments: [{ pieceResponses: [{ trackingNumber: '7946', packageDocuments: [{ url: 'https://label/1.pdf' }] }] }] } })] } },
  { name: 'ship: master tracking number, no label', calls: [['createShipment', SHIPMENT_BARE]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/ship/v1/shipments': [json(200, { output: { transactionShipments: [{ pieceResponses: [{ trackingNumber: '' }], masterTrackingNumber: { trackingNumber: 999 } }] } })] } },
  { name: 'ship: nothing in the reply', calls: [['createShipment', SHIPMENT]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/ship/v1/shipments': [json(200, {})] } },
  { name: 'ship: null reply', calls: [['createShipment', SHIPMENT]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/ship/v1/shipments': [json(200, 'null')] } },
  { name: 'ship: FedEx error', calls: [['createShipment', SHIPMENT]],
    responses: { '/oauth/token': [json(200, TOKEN)], '/ship/v1/shipments': [json(422, '{"errors":[{"code":"X"}]}')] } },
  { name: 'ship: auth failure', calls: [['createShipment', SHIPMENT]],
    responses: { '/oauth/token': [json(500, 'down')] } },
  { name: 'ship: network failure', network: true, calls: [['createShipment', SHIPMENT]], responses: {} },
  { name: 'track: scans mapped', calls: [['getTracking', '7946']],
    responses: { '/oauth/token': [json(200, TOKEN)], '/track/v1/trackingnumbers': [json(200, { output: { completeTrackResults: [{ trackResults: [{
      latestStatusDetail: { code: 'IT', description: 'In transit' },
      estimatedDeliveryTimeWindow: { window: { ends: '2026-11-02T20:00:00Z' } },
      scanEvents: [
        { date: '2026-10-30T10:00:00Z', eventDescription: 'Picked up', scanLocation: { city: 'Memphis', stateOrProvinceCode: 'TN' } },
        { date: '2026-10-30T12:00:00Z', eventDescription: 'Left', scanLocation: { city: 'Memphis' } },
        { eventDescription: 'Odd', scanLocation: 'x' },
        { date: 5, scanLocation: null },
        'string event',
      ],
    }] }] } })] } },
  { name: 'track: empty reply', calls: [['getTracking', 'ABC']],
    responses: { '/oauth/token': [json(200, TOKEN)], '/track/v1/trackingnumbers': [json(200, { output: { completeTrackResults: [] } })] } },
  { name: 'track: scanEvents is not an array', calls: [['getTracking', 'ABC']],
    responses: { '/oauth/token': [json(200, TOKEN)], '/track/v1/trackingnumbers': [json(200, { output: { completeTrackResults: [{ trackResults: [{ scanEvents: 'x' }] }] } })] } },
  { name: 'track: a null scan event', calls: [['getTracking', 'ABC']],
    responses: { '/oauth/token': [json(200, TOKEN)], '/track/v1/trackingnumbers': [json(200, { output: { completeTrackResults: [{ trackResults: [{ scanEvents: [null] }] }] } })] } },
  { name: 'track: FedEx error', calls: [['getTracking', 'ABC']],
    responses: { '/oauth/token': [json(200, TOKEN)], '/track/v1/trackingnumbers': [json(404, 'nope')] } },
  { name: 'track: auth reply is null', calls: [['getTracking', 'ABC']],
    responses: { '/oauth/token': [json(200, 'null')] } },
  { name: 'track: non-JSON reply', calls: [['getTracking', 'ABC']],
    responses: { '/oauth/token': [json(200, TOKEN)], '/track/v1/trackingnumbers': [json(200, '<!DOCTYPE html><html></html>')] } },
];

const API = 'http://fedex.test';

async function runCase(c) {
  const queues = Object.fromEntries(Object.entries(c.responses).map(([k, v]) => [k, [...v]]));
  const requests = [];
  global.fetch = async (url, init) => {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
    requests.push({ method: init.method, path: u.pathname, headers, body });
    if (c.network) throw new TypeError('fetch failed');
    const queue = queues[u.pathname] || [];
    const r = queue.length > 1 ? queue.shift() : queue[0];
    if (!r) throw new Error(`no canned response for ${u.pathname}`);
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.FEDEX_API_URL = API;
  process.env.FEDEX_CLIENT_ID = 'client id&1';
  process.env.FEDEX_CLIENT_SECRET = 'se cret+/=';
  process.env.FEDEX_ACCOUNT_NUMBER = '740561073';
  const modulePath = require.resolve('../services/shippingService');
  delete require.cache[modulePath];
  const log = console.log; const warn = console.warn; const error = console.error;
  console.log = console.warn = console.error = () => {};
  const service = require(modulePath);
  const results = [];
  try {
    for (const [fn, ...args] of c.calls) {
      try {
        results.push({ ok: await service[fn](...args) });
      } catch (e) {
        results.push({ error: e.message });
      }
    }
  } finally {
    console.log = log; console.warn = warn; console.error = error;
  }
  return { ...c, requests, results };
}

(async () => {
  const parse = compileQueryParser('extended');
  const query = QUERIES.map((input) => ({ input, value: parse(input) }));
  const urlencoded = await urlencodedCases();
  const realFetch = global.fetch;
  const fedex = [];
  for (const c of CASES) fedex.push(await runCase(c));
  global.fetch = realFetch;

  const out = path.join(__dirname, '..', '..', 'rust', 'crates', 'api', 'fixtures', 'misc_compat.json');
  fs.writeFileSync(out, JSON.stringify({ query, urlencoded, fedex }, null, 1) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), out)}: ${query.length} query, ${urlencoded.length} urlencoded, ${fedex.length} fedex cases`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
