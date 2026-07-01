#!/usr/bin/env node
/**
 * Smoke test for the NodeTexeure stack.
 *
 * Verifies the backend API, the frontend pages, and the frontend->backend
 * proxy are all healthy. Exits non-zero if any check fails.
 *
 * Usage (with the stack running via `npm run dev`):
 *   node scripts/smoke-test.js
 *   FRONTEND_URL=http://localhost:3000 BACKEND_URL=http://localhost:6666 node scripts/smoke-test.js
 */

// Everything is checked through the frontend origin, which is how the app is
// actually used: the browser talks only to :3000, and Next proxies /api/* to the
// backend. (The backend port 6666 is on the WHATWG "bad ports" list, so browsers
// and Node's fetch refuse to connect to it directly — the proxy is the only path.)
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3000';
const TIMEOUT_MS = 8000;

const checks = [
  { name: 'frontend: home', url: `${FRONTEND}/`, expect: 200 },
  { name: 'frontend: shop', url: `${FRONTEND}/shop`, expect: 200 },
  { name: 'frontend: product detail', url: `${FRONTEND}/products/PROD0000000001`, expect: 200 },
  { name: 'backend (via proxy): products API', url: `${FRONTEND}/api/products`, expect: 200, json: 'SUCCESS' },
  { name: 'backend (via proxy): health', url: `${FRONTEND}/api/status/health`, expect: 200 },
];

async function check({ name, url, expect, json }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status !== expect) return { name, ok: false, detail: `HTTP ${res.status} (expected ${expect})` };
    if (json) {
      const body = await res.json();
      if (body.status !== json) return { name, ok: false, detail: `body.status=${body.status} (expected ${json})` };
    }
    return { name, ok: true, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { name, ok: false, detail: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log(`Smoke test\n  frontend: ${FRONTEND} (backend checked via /api proxy)\n`);
  const results = [];
  for (const c of checks) {
    const r = await check(c);
    results.push(r);
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error('\nSMOKE TEST FAILED. Is the stack running? Start it with `npm run dev`.');
    process.exit(1);
  }
  console.log('SMOKE TEST PASSED');
})();
