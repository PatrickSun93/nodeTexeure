// node --test admin-dashboard/rustRoutes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRewrites, apiBaseUrl, rustRouting } from './rustRoutes.mjs';

const NODE = 'http://backend:6666';
const RUST = 'http://api:7000';

test('unset or empty routes: everything to Node', () => {
  const all = [{ source: '/api/:path*', destination: `${NODE}/api/:path*` }];
  assert.deepEqual(apiRewrites(NODE, {}), all);
  assert.deepEqual(apiRewrites(NODE, { RUST_API_URL: RUST }), all);
  assert.deepEqual(apiRewrites(NODE, { RUST_API_URL: RUST, RUST_API_ROUTES: '' }), all);
  // routes without a URL are ignored
  assert.deepEqual(apiRewrites(NODE, { RUST_API_ROUTES: 'admin' }), all);
  assert.equal(apiBaseUrl('/api/admin/logout', NODE, { RUST_API_ROUTES: 'admin' }), NODE);
});

test('groups, single paths and partial groups', () => {
  const env = { RUST_API_URL: ` ${RUST}/ `, RUST_API_ROUTES: 'users, settings/public,admin' };
  assert.deepEqual(rustRouting(env), { url: RUST, entries: ['users', 'settings/public', 'admin'] });
  assert.deepEqual(apiRewrites(NODE, env), [
    { source: '/api/settings/public', destination: `${RUST}/api/settings/public` },
    { source: '/api/users/:path*', destination: `${RUST}/api/users/:path*` },
    { source: '/api/admin/:path*', destination: `${RUST}/api/admin/:path*` },
    { source: '/api/:path*', destination: `${NODE}/api/:path*` },
  ]);
  const partial = { admin: ['admin/logout', 'admin/coupons/:id([A-Z0-9]+)'] };
  assert.deepEqual(apiRewrites(NODE, { RUST_API_URL: RUST, RUST_API_ROUTES: 'admin' }, partial), [
    { source: '/api/admin/logout', destination: `${RUST}/api/admin/logout` },
    { source: '/api/admin/coupons/:id([A-Z0-9]+)', destination: `${RUST}/api/admin/coupons/:id` },
    { source: '/api/:path*', destination: `${NODE}/api/:path*` },
  ]);
  assert.equal(apiBaseUrl('/api/admin/logout', NODE, { RUST_API_URL: RUST, RUST_API_ROUTES: 'admin' }, partial), RUST);
  assert.equal(apiBaseUrl('/api/admin/orders?x=1', NODE, { RUST_API_URL: RUST, RUST_API_ROUTES: 'admin' }, partial), NODE);
  assert.equal(apiBaseUrl('api/settings/public/', NODE, env), RUST);
  assert.equal(apiBaseUrl('/api/settings/all', NODE, env), NODE);
});
