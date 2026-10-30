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
