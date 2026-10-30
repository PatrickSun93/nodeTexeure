// TRUST_PROXY → Express `trust proxy` → req.ip, the key of every rate limiter.
// The Rust API applies the same rule (rust/crates/api/src/client_ip.rs, whose
// tests replay Express's answers from fixtures/node_compat.json).
const express = require('express');
const rateLimit = require('express-rate-limit');
const request = require('supertest');
const { parseTrustProxy } = require('../utils/trustProxy');
const server = require('../server');

describe('TRUST_PROXY', () => {
  test('parses hop counts only', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTrustProxy(undefined)).toBe(0);
    expect(parseTrustProxy('')).toBe(0);
    expect(parseTrustProxy(' 1 ')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
    for (const bad of ['true', '-1', 'loopback', '1.5']) expect(parseTrustProxy(bad)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  test('the backend trusts no proxy unless told to', () => {
    expect(server.get('trust proxy')).toBe(parseTrustProxy(process.env.TRUST_PROXY));
    if (process.env.TRUST_PROXY === undefined) expect(server.get('trust proxy')).toBe(0);
  });

  const appWith = (hops, limit) => {
    const app = express();
    app.set('trust proxy', parseTrustProxy(hops));
    if (limit) app.use(rateLimit({ windowMs: 60000, limit, standardHeaders: true, legacyHeaders: false, message: 'slow' }));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    return app;
  };

  test('req.ip is the socket peer at 0 hops and the right-most entry at 1', async () => {
    const xff = { 'X-Forwarded-For': '6.6.6.6, 203.0.113.9' };
    const direct = await request(appWith('0')).get('/ip').set(xff);
    expect(direct.body.ip).toMatch(/127\.0\.0\.1$/);
    expect((await request(appWith('1')).get('/ip').set(xff)).body.ip).toBe('203.0.113.9');
    expect((await request(appWith('2')).get('/ip').set(xff)).body.ip).toBe('6.6.6.6');
  });

  test('behind one proxy, each forwarded client gets its own rate-limit bucket', async () => {
    const app = appWith('1', 1);
    const from = (ip) => request(app).get('/ip').set('X-Forwarded-For', ip);
    expect((await from('203.0.113.1')).status).toBe(200);
    expect((await from('203.0.113.2')).status).toBe(200);
    expect((await from('203.0.113.1')).status).toBe(429);
    // Without trust, the same requests share the proxy's one bucket.
    const shared = appWith('0', 1);
    expect((await request(shared).get('/ip').set('X-Forwarded-For', '203.0.113.1')).status).toBe(200);
    expect((await request(shared).get('/ip').set('X-Forwarded-For', '203.0.113.2')).status).toBe(429);
  });
});
