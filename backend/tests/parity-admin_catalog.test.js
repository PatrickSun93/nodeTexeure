// Node ↔ Rust parity for the admin catalogue routes: backend/routes/admin/
// products.js, coupons.js and inventory.js (+ the inventoryService parts they
// call), ported in rust/crates/api/src/routes/admin/{products,coupons,inventory}.rs.
// Runs when RUST_API_URL is set and the API binary is built: like every
// /api/admin parity file it starts a Rust API of its own (P.backOffice()).
//
//   (cd ../rust && cargo build -p api) && RUST_API_URL=http://127.0.0.1:7051 DB_HOST=127.0.0.1 \
//     DB_PORT=3307 DB_PASSWORD=noirae_dev DB_NAME=nt_x npx jest tests/parity-admin_catalog.test.js
//
// Mutations run once per side on that side's own fixtures: rows named ZZN_* for
// Node and ZZR_* for Rust, written as `ZZ*` in the requests below and
// normalised back to `ZZ*` before comparing (with generated ids, timestamps and
// upload file names). The rows each side wrote are compared column by column.
//
// The admin limiters have no skip in tests (adminLimiter: 100/min for anything
// reaching the /api/admin router, adminWriteLimiter: 60/min), so each block
// starts with fresh budgets on both sides: Node's limiter keys are reset and
// the Rust API is restarted.
const fs = require('fs');
const path = require('path');
const { DatabaseUtil } = require('./helpers');
const P = require('./parityHelpers');
const limiters = require('../routes/admin/limiters');

const BO = P.backOffice();
const SIDE = { node: 'N', rust: 'R' };
const UPLOADS = path.join(__dirname, '..', 'uploads', 'products');

// 'ZZ*' in a request (url, body, raw text) → that side's fixture names.
const sub = (v, side) => {
  if (v === undefined) return v;
  const s = JSON.stringify(v).replace(/ZZ\*/g, `ZZ${SIDE[side]}`);
  return JSON.parse(s);
};

const NORM = P.normalizer([
  [/ZZ[NR]/g, 'ZZ*'],
  [/zz[nr]-/g, 'zz*-'],
  [/(PROD|VAR|INVMOV|INV|DISC|EMAIL)\d{10}/g, '$1#'],
  [/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, 'TIME'],
  [/\b\d{13}-/g, 'TS-'],
]);

const q = async (sql, params = []) => {
  const r = await DatabaseUtil.executeQuery(sql, params);
  if (!r.success) throw new Error(`${sql}: ${r.error}`);
  return r.data;
};

/** Fresh admin limiter budgets on both sides (see the header). */
async function budget() {
  for (const limiter of Object.values(limiters)) {
    for (const key of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) await limiter.resetKey(key);
  }
  await BO.stop();
  await BO.start();
}

const view = (r, other, method, url, fix = (b) => b) => {
  const h = P.rateLimitHeaders(r.headers);
  const theirs = P.rateLimitHeaders(other.headers);
  for (const k of ['ratelimit-reset', 'x-ratelimit-reset', 'retry-after']) {
    if (h[k] !== undefined && theirs[k] !== undefined && Math.abs(Number(h[k]) - Number(theirs[k])) <= 1) h[k] = 'CLOCK';
  }
  const content = r.body !== undefined ? NORM(fix(r.body)) : { text: r.text };
  return { label: `${method.toUpperCase()} ${url}`, status: r.status, content, rateLimit: h };
};

/**
 * The same request on each side's own fixtures (`ZZ*` substituted), compared
 * after normalisation. → { node, rust }
 */
async function pair(method, url, opts = {}) {
  const out = {};
  for (const side of ['node', 'rust']) {
    out[side] = await BO.call(side, method, sub(url, side), {
      ...opts,
      body: sub(opts.body, side),
      raw: opts.raw && sub(opts.raw, side),
    });
  }
  expect(view(out.rust, out.node, method, url, opts.fix)).toEqual(view(out.node, out.rust, method, url, opts.fix));
  return out;
}

/** A movements answer with its rows ordered by id (see the movements tests). */
const byId = (body) => {
  const list = body?.keyValueTable?.[0]?.movements;
  if (!Array.isArray(list)) return body;
  const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ...body, keyValueTable: [{ movements: sorted }] };
};

/** The rows a query returns for each side's fixtures, compared. */
async function rowsSame(sql, params = []) {
  const node = await q(sub(sql, 'node'), sub(params, 'node'));
  const rust = await q(sub(sql, 'rust'), sub(params, 'rust'));
  expect(NORM(rust)).toEqual(NORM(node));
  return { node, rust };
}

const multipart = (field, filename, type, content, boundary = 'zzboundary') => ({
  type: `multipart/form-data; boundary=${boundary}`,
  text: `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n`
    + `Content-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function cleanup() {
  await q("DELETE FROM order_items WHERE id LIKE 'ZZ%'");
  await q("DELETE FROM email_queue WHERE subject LIKE 'Low Stock Alert - ZZ%'");
  await q("DELETE FROM products WHERE id LIKE 'ZZ%' OR sku LIKE 'ZZ%'");
  await q("DELETE FROM discount_codes WHERE id LIKE 'ZZ%' OR code LIKE 'ZZ%'");
  for (const s of ['N', 'R']) {
    for (const p of ['P1', 'P5']) fs.rmSync(path.join(UPLOADS, `ZZ${s}_${p}`), { recursive: true, force: true });
  }
}

async function fixtures() {
  const order = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT id FROM orders ORDER BY id LIMIT 1'));
  for (const s of ['N', 'R']) {
    const product = (n, extra = {}) => q(
      `INSERT INTO products (id, sku, name, slug, category_id, base_price, product_details, created_by, status, approval_details)
       VALUES (?, ?, ?, ?, 'CAT001', ?, ?, 'USER0000000001', ?, ?)`,
      [`ZZ${s}_P${n}`, `ZZ${s}-SKU-${n}`, extra.name || `ZZ Parity Sheet ${n}`, `zz${s.toLowerCase()}-sheet-${n}`,
        extra.price || '49.50', '{"material": "silk", "weight": 1.5}', extra.status || 'draft', extra.approval ?? null],
    );
    await product(1, { status: 'approved' });
    await product(2);
    await product(3);
    await product(4);
    await product(5);
    await product(6, { approval: '{"history": "notarray", "x": 1, "notes": "old"}' });
    await product(7, { approval: '"{\\"history\\": [{\\"status\\": \\"draft\\"}]}"' });
    await product(8, { approval: '[1, 2]' });
    await q(`INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, 'Queen', 'Ivory', '5.25')`,
      [`ZZ${s}_V1`, `ZZ${s}_P1`, `ZZ${s}-VSKU-1`]);
    await q(`INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, NULL, 'Sand', NULL)`,
      [`ZZ${s}_V2`, `ZZ${s}_P1`, `ZZ${s}-VSKU-2`]);
    const inv = (id, product, variant, qty, rp = 10, rq = 50) => q(
      'INSERT INTO inventory (id, product_id, variant_id, quantity_available, reorder_point, reorder_quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [`ZZ${s}_${id}`, `ZZ${s}_${product}`, variant && `ZZ${s}_${variant}`, qty, rp, rq],
    );
    await inv('I0', 'P1', null, 20);
    await inv('I1', 'P1', 'V1', 12);
    await inv('I2', 'P2', null, 11, 10, null);
    await inv('I3', 'P3', null, 5);
    if (order) {
      await q(`INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
               VALUES (?, ?, ?, 'ZZ', 'ZZ', 1, '1.00', '1.00')`, [`ZZ${s}_OI`, order.id, `ZZ${s}_P4`]);
    }
    const coupon = (n, active, starts, expires) => q(
      `INSERT INTO discount_codes (id, code, name, discount_details, type, value, is_active, starts_at, expires_at, created_by)
       VALUES (?, ?, 'ZZ coupon', '{"description": "d"}', 'percentage', '10.00', ?, ?, ?, 'USER0000000001')`,
      [`ZZ${s}_C${n}`, `ZZ${s}CODE${n}`, active, starts, expires],
    );
    await coupon(1, 1, '2020-01-01 00:00:00', '2021-01-01 00:00:00');
    await coupon(2, 1, '2037-12-31 00:00:00', null);
    await coupon(3, 0, null, null);
    await coupon(4, 1, null, null);
    await coupon(5, 1, null, null);
  }
}

// Every route: [method, path] (ZZ* ids are fine for the guard checks).
const ROUTES = [
  ['post', '/api/admin/products'],
  ['put', '/api/admin/products/ZZ*_P1'],
  ['delete', '/api/admin/products/ZZ*_P5'],
  ['put', '/api/admin/products/ZZ*_P1/status'],
  ['get', '/api/admin/categories'],
  ['get', '/api/admin/products'],
  ['get', '/api/admin/products/ZZ*_P1'],
  ['post', '/api/admin/products/ZZ*_P1/image'],
  ['post', '/api/admin/products/bulk-update'],
  ['post', '/api/admin/products/bulk-delete'],
  ['post', '/api/admin/coupons'],
  ['put', '/api/admin/coupons/ZZ*_C1'],
  ['delete', '/api/admin/coupons/ZZ*_C5'],
  ['get', '/api/admin/coupons'],
  ['put', '/api/admin/inventory/ZZ*_I0'],
  ['post', '/api/admin/inventory/adjust'],
  ['post', '/api/admin/inventory/bulk-adjust'],
  ['put', '/api/admin/inventory/ZZ*_I0/reorder-points'],
  ['get', '/api/admin/inventory/movements'],
  ['get', '/api/admin/inventory'],
];
const WRITES = ROUTES.filter(([m]) => m !== 'get');

P.describeBackOffice('admin catalogue (products, coupons, inventory)', () => {
  beforeAll(async () => {
    await cleanup();
    await fixtures();
    await BO.start();
  }, 60000);
  afterAll(async () => {
    await BO.stop();
    await cleanup();
  });

  // -------------------------------------------------------------------------
  describe('guards: protect, staffOrAdmin, admin, CSRF', () => {
    beforeAll(budget, 60000);

    test.each(ROUTES)('anonymous %s %s', (m, url) => pair(m, url));
    test.each(ROUTES)('customer %s %s', (m, url) => pair(m, url, { as: 'customer', csrf: true }));
    test.each(ROUTES)('staff %s %s', (m, url) => pair(m, url, { as: 'staff', csrf: true, body: m === 'get' ? undefined : {} }));
    test('a forged token', () => pair('get', '/api/admin/coupons', { headers: P.bearer('x.y.z') }));
  });

  describe('guards: CSRF on every write', () => {
    beforeAll(budget, 60000);

    test.each(WRITES)('admin without a token %s %s', (m, url) => pair(m, url, { as: 'admin' }));
    test.each(WRITES)('admin, cookie and header differ %s %s', (m, url) => pair(m, url, {
      as: 'admin', headers: { 'X-CSRF-Token': BO.sessions.admin.csrf, Cookie: 'csrf_token=other' },
    }));
    test('staff without a token on the staff route', () => pair('post', '/api/admin/products', { as: 'staff' }));
    test('header without cookie', () => pair('put', '/api/admin/coupons/ZZ*_C1', {
      as: 'admin', headers: { 'X-CSRF-Token': BO.sessions.admin.csrf }, body: { name: 'x' },
    }));
  });

  // -------------------------------------------------------------------------
  describe('reads', () => {
    beforeAll(budget, 60000);

    test('GET /categories', () => pair('get', '/api/admin/categories', { as: 'admin' }));
    test('GET /products', () => pair('get', '/api/admin/products', { as: 'admin' }));
    test('GET /products/ (trailing slash, case)', () => pair('get', '/API/admin/Products/', { as: 'admin' }));
    test.each([
      '/api/admin/products/ZZ*_P1',
      '/api/admin/products/ZZ*_P2',
      '/api/admin/products/PROD0000000001',
      '/api/admin/products/nope',
      '/api/admin/products/bulk-update',
      '/api/admin/products/ZZ%2A_P1',
    ])('GET %s', (url) => pair('get', url, { as: 'admin' }));
    test('GET /products/%E0 is a decode error', () => pair('get', '/api/admin/products/%E0', { as: 'admin' }));
    test('HEAD /products', () => pair('head', '/api/admin/products', { as: 'admin' }));
    test('GET /coupons (statuses)', () => pair('get', '/api/admin/coupons', { as: 'admin' }));
    test('GET /inventory', () => pair('get', '/api/admin/inventory', { as: 'admin' }));
    test.each([
      '',
      '?inventory_id=ZZ*_I0',
      '?product_id=a&product_id=b',
      '?product_id[x]=1',
      '?movement_type[]=adjustment',
      '?date_from[a]=1',
      '?inventory_id=ZZ*_I0&movement_type=adjustment&reference_type=manual&date_from=2000-01-01&date_to=2999-01-01',
      '?limit=2',
      '?limit=abc',
      '?limit=0x2',
      '?limit=-1',
      '?limit=0',
      '?limit=2.9junk',
      '?limit=1&limit=2',
      '?limit[a]=1',
      '?limit=',
      '?date_from=not-a-date',
      "?product_id=' OR 1=1 --",
    ])('GET /inventory/movements%s', (qs) => pair('get', `/api/admin/inventory/movements${qs}`, { as: 'admin' }));
  });

  // -------------------------------------------------------------------------
  describe('products: create', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };

    test.each([
      [{}],
      [{ name: 'x' }],
      [{ name: 'x', base_price: 1 }],
      [{ name: 'x', base_price: null, category_id: 'CAT001' }],
      [{ name: '', base_price: 1, category_id: 'CAT001' }],
      [{ name: 'x', base_price: 1, category_id: 0 }],
      [[{ name: 'x' }]],
    ])('validation %j', (body) => pair('post', '/api/admin/products', { ...as, body }));

    test('without a SKU the INSERT fails (sku NOT NULL): 500', () => pair('post', '/api/admin/products', {
      ...as, body: { name: 'ZZ* no sku', base_price: 1, category_id: 'CAT001' },
    }));
    test('an unknown category: 500', () => pair('post', '/api/admin/products', {
      ...as, body: { name: 'ZZ* bad cat', sku: 'ZZ*-BADCAT', base_price: 1, category_id: 'NOPE' },
    }));

    test('product + base stock + variants (one variant missing size/color)', async () => {
      const { node, rust } = await pair('post', '/api/admin/products', {
        ...as,
        body: {
          name: 'ZZ* New Product!', sku: 'ZZ*-NEW-1', base_price: 10.5, category_id: 'CAT001', stock: 7,
          description: 'D', short_description: '', product_details: { b: 2, a: [1, 1.5] }, meta_title: 'MT',
          variants: [
            { sku: 'ZZ*-NV-1', size: 'King', color: 'Sand', price_adjustment: 2, stock: 3 },
            { sku: 'ZZ*-NV-2' },
            { sku: 'ZZ*-NV-3', size: 'Twin', color: null },
          ],
        },
      });
      expect(node.status).toBe(201);
      const ids = { node: node.body.keyValueTable[0].id, rust: rust.body.keyValueTable[0].id };
      const cols = (side) => q(`SELECT sku, name, slug, description, short_description, category_id, base_price, product_details,
        status, approval_details, created_by, meta_title, meta_description, meta_keywords FROM products WHERE id = ?`, [ids[side]]);
      expect(NORM(await cols('rust'))).toEqual(NORM(await cols('node')));
      const inv = (side) => q(`SELECT i.variant_id IS NULL AS base, v.sku, v.size, v.color, v.price_adjustment, i.quantity_available,
        i.quantity_reserved, i.reorder_point FROM inventory i LEFT JOIN product_variants v ON v.id = i.variant_id
        WHERE i.product_id = ? ORDER BY base DESC, v.sku`, [ids[side]]);
      expect(NORM(await inv('rust'))).toEqual(NORM(await inv('node')));
      const vars = (side) => q('SELECT sku, size, color, pattern, price_adjustment, is_active FROM product_variants WHERE product_id = ? ORDER BY sku', [ids[side]]);
      expect(NORM(await vars('rust'))).toEqual(NORM(await vars('node')));
    });

    test('duplicate SKU: 409', () => pair('post', '/api/admin/products', {
      ...as, body: { name: 'ZZ* dup', sku: 'ZZ*-NEW-1', base_price: 1, category_id: 'CAT001' },
    }));
    test('duplicate slug: 409', () => pair('post', '/api/admin/products', {
      ...as, body: { name: 'ZZ* New Product', sku: 'ZZ*-NEW-2', base_price: 1, category_id: 'CAT001' },
    }));
    test('staff may create', () => pair('post', '/api/admin/products', {
      as: 'staff', csrf: true, body: { name: 'ZZ* staff made', sku: 'ZZ*-STAFF', base_price: '3.10', category_id: 'CAT001', stock: 'abc' },
    }));
    test('a null variant: 500 after the product row', async () => {
      await pair('post', '/api/admin/products', {
        ...as, body: { name: 'ZZ* null variant', sku: 'ZZ*-NULLV', base_price: 1, category_id: 'CAT001', variants: [{ sku: 'ZZ*-NULLV-1', size: 'S', color: 'C' }, null] },
      });
      await rowsSame(`SELECT p.sku, p.slug, (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
        (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id) AS inventory FROM products p WHERE p.sku = 'ZZ*-NULLV'`);
    });
    test('non-string inputs (numbers, booleans, objects)', async () => {
      await pair('post', '/api/admin/products', {
        ...as, body: { name: 4242, sku: 'ZZ*-NUM', base_price: '7', category_id: 'CAT001', slug: 'ZZ*-num-slug', product_details: 'plain', stock: true, variants: 'no' },
      });
      await rowsSame("SELECT name, slug, base_price, product_details, (SELECT quantity_available FROM inventory WHERE product_id = products.id) AS stock FROM products WHERE sku = 'ZZ*-NUM'");
    });
    test('a urlencoded body', async () => {
      await pair('post', '/api/admin/products', {
        ...as, raw: { type: 'application/x-www-form-urlencoded', text: 'name=ZZ*%20Form&sku=ZZ*-FORM&base_price=12.00&category_id=CAT001&variants[0][sku]=ZZ*-FORM-V&variants[0][size]=M&variants[0][color]=Red&stock=2' },
      });
      await rowsSame(`SELECT p.name, p.slug, p.base_price, v.sku, v.size, v.price_adjustment, i.quantity_available FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id LEFT JOIN inventory i ON i.variant_id = v.id WHERE p.sku = 'ZZ*-FORM'`);
    });
  });

  // -------------------------------------------------------------------------
  describe('products: update, status, delete', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };
    const product = 'SELECT sku, name, slug, base_price, status, product_details, approval_details, meta_title, meta_keywords FROM products WHERE id = ?';

    test.each([
      [{ variants: 'x' }],
      [{ variants: false }],
      [{ variants: [null] }],
      [{ variants: [{ id: 5 }] }],
      [{ variants: [3] }],
      [{ variants: {} }],
    ])('PUT validation %j', (body) => pair('put', '/api/admin/products/ZZ*_P1', { ...as, body }));

    test('PUT allowed columns only; product_details JSON', async () => {
      await pair('put', '/api/admin/products/ZZ*_P1', {
        ...as, body: { base_price: 55, status: 'approved', meta_title: 'T', meta_keywords: null, product_details: { z: 1, a: 'b' }, id: 'hack', created_by: 'x' },
      });
      await rowsSame(product, ['ZZ*_P1']);
    });
    test('PUT a name change trips the products trigger (audit_logs): 500', () => pair('put', '/api/admin/products/ZZ*_P1', { ...as, body: { name: 'ZZ renamed' } }));
    test('PUT an unknown allowed column (sale_price): 500', () => pair('put', '/api/admin/products/ZZ*_P1', { ...as, body: { sale_price: 3 } }));
    test('PUT a bad status value: 500', () => pair('put', '/api/admin/products/ZZ*_P1', { ...as, body: { status: 'bogus' } }));
    test('PUT product_details null', async () => {
      await pair('put', '/api/admin/products/ZZ*_P2', { ...as, body: { product_details: null, sku: 'ZZ*-SKU-2b' } });
      await rowsSame(product, ['ZZ*_P2']);
    });
    test('PUT nothing to change / unknown product: 200', async () => {
      await pair('put', '/api/admin/products/ZZ*_P1', { ...as, body: {} });
      await pair('put', '/api/admin/products/nope', { ...as, body: { meta_title: 'x' } });
      await pair('put', '/api/admin/products/ZZ*_P1', { ...as, body: [] });
    });
    test('PUT variants: update existing (+stock), add new, empty id is new', async () => {
      await pair('put', '/api/admin/products/ZZ*_P1', {
        ...as,
        body: {
          variants: [
            { id: 'ZZ*_V1', sku: 'ZZ*-VSKU-1', size: 'Queen', color: 'Ivory', price_adjustment: 6.5, stock: 9 },
            { id: 'ZZ*_V2', sku: 'ZZ*-VSKU-2', color: 'Sand' },
            { sku: 'ZZ*-VSKU-NEW', size: 'Twin', color: 'Gray', stock: 4 },
            { id: '', sku: 'ZZ*-VSKU-NEW2', size: 'Full', color: 'Blue' },
            [],
          ],
        },
      });
      await rowsSame(`SELECT v.sku, v.size, v.color, v.price_adjustment, i.quantity_available FROM product_variants v
        LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.product_id = ? ORDER BY v.sku`, ['ZZ*_P1']);
    });
    test('PUT variant stock null fails silently', async () => {
      await pair('put', '/api/admin/products/ZZ*_P1', { ...as, body: { variants: [{ id: 'ZZ*_V1', sku: 'ZZ*-VSKU-1', size: 'Q', color: 'I', stock: null }] } });
      await rowsSame("SELECT v.size, i.quantity_available FROM product_variants v JOIN inventory i ON i.variant_id = v.id WHERE v.id = 'ZZ*_V1'");
    });

    test.each([
      [{}],
      [{ status: 'bogus' }],
      [{ status: 5 }],
      [{ status: ['draft'] }],
      [{ status: 'discontinued' }],
    ])('PUT /status validation %j', (body) => pair('put', '/api/admin/products/ZZ*_P1/status', { ...as, body }));
    test('PUT /status unknown product: 404', () => pair('put', '/api/admin/products/nope/status', { ...as, body: { status: 'draft' } }));
    test('PUT /status records history', async () => {
      await pair('put', '/api/admin/products/ZZ*_P3/status', { ...as, body: { status: 'pending_approval', notes: 'first' } });
      await pair('put', '/api/admin/products/ZZ*_P3/status', { ...as, body: { status: 'approved' } });
      await pair('put', '/api/admin/products/ZZ*_P3/status', { ...as, body: { status: 'rejected', notes: { why: 1 } } });
      await rowsSame(product, ['ZZ*_P3']);
    });
    test.each([['ZZ*_P6'], ['ZZ*_P7'], ['ZZ*_P8']])('PUT /status over odd approval_details (%s)', async (id) => {
      await pair('put', `/api/admin/products/${id}/status`, { ...as, body: { status: 'draft', notes: 7 } });
      await rowsSame(product, [id]);
    });

    test('DELETE an unreferenced product', async () => {
      await pair('delete', '/api/admin/products/ZZ*_P5', as);
      await rowsSame("SELECT COUNT(*) AS n FROM products WHERE id = 'ZZ*_P5'");
    });
    test('DELETE a product with order items: 500', () => pair('delete', '/api/admin/products/ZZ*_P4', as));
    test('DELETE an unknown product: 200', () => pair('delete', '/api/admin/products/nope', as));
  });

  // -------------------------------------------------------------------------
  describe('products: image upload', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };
    const files = (side) => {
      const dir = path.join(UPLOADS, `ZZ${SIDE[side]}_P1`);
      if (!fs.existsSync(dir)) return null;
      return fs.readdirSync(dir).sort().map((f) => ({ name: f.replace(/^\d{13}-/, 'TS-'), data: fs.readFileSync(path.join(dir, f), 'utf8') }));
    };

    test('an invalid id: 400', () => pair('post', '/api/admin/products/a.b/image', as));
    test('an unknown product: 404', () => pair('post', '/api/admin/products/nope/image', { ...as, raw: multipart('image', 'a.png', 'image/png', 'x') }));
    test('no multipart body: 400', () => pair('post', '/api/admin/products/ZZ*_P1/image', { ...as, body: { image: 'x' } }));
    test('a multipart body without the file', () => pair('post', '/api/admin/products/ZZ*_P1/image', {
      ...as, raw: { type: 'multipart/form-data; boundary=b', text: '--b\r\nContent-Disposition: form-data; name="image"\r\n\r\nnot a file\r\n--b--\r\n' },
    }));
    test('another field name: Upload failed', () => pair('post', '/api/admin/products/ZZ*_P1/image', { ...as, raw: multipart('file', 'a.png', 'image/png', 'x') }));
    test('not an image: Upload failed', () => pair('post', '/api/admin/products/ZZ*_P1/image', { ...as, raw: multipart('image', 'a.txt', 'text/plain', 'x') }));
    test('a malformed multipart body', () => pair('post', '/api/admin/products/ZZ*_P1/image', { ...as, raw: { type: 'multipart/form-data; boundary=b', text: '--b\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\n\r\nxx' } }));
    test('too large: Upload failed', () => pair('post', '/api/admin/products/ZZ*_P1/image', {
      ...as, raw: multipart('image', 'big.png', 'image/png', 'a'.repeat(5 * 1024 * 1024 + 1)),
    }));
    test('an image is written, then the thumbnail UPDATE fails (no such column): 500', async () => {
      await pair('post', '/api/admin/products/ZZ*_P1/image', { ...as, raw: multipart('image', 'dir/My Photo (1)é.png', 'image/png', 'PNGDATA-ZZ*') });
      // busboy reads the plain filename as latin1: é arrives as two characters
      expect(files('node')).toEqual([{ name: 'TS-My_Photo__1___.png', data: 'PNGDATA-ZZN' }]);
      expect(NORM(files('rust'))).toEqual(NORM(files('node')));
    });
  });

  // -------------------------------------------------------------------------
  describe('products: bulk update / delete', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };

    test.each([
      [{}],
      [{ productIds: [] }],
      [{ productIds: 'ZZ*_P2' }],
      [{ productIds: [5] }],
      [{ productIds: [''] }],
      [{ productIds: ['ZZ*_P2'] }],
      [{ productIds: ['ZZ*_P2'], updates: [] }],
      [{ productIds: ['ZZ*_P2'], updates: 'x' }],
      [{ productIds: ['ZZ*_P2'], updates: null }],
      [{ productIds: ['ZZ*_P2'], updates: { bogus: 1 } }],
    ])('bulk-update validation %j', (body) => pair('post', '/api/admin/products/bulk-update', { ...as, body }));
    test('bulk-update counts matched rows', async () => {
      await pair('post', '/api/admin/products/bulk-update', {
        ...as, body: { productIds: ['ZZ*_P2', 'nope', 'ZZ*_P2', 'ZZ*_P3'], updates: { status: 'pending_approval', product_details: null, meta_title: '' } },
      });
      await rowsSame("SELECT id, status, product_details, meta_title FROM products WHERE id IN ('ZZ*_P2', 'ZZ*_P3') ORDER BY id");
    });
    test('bulk-update with a failing column counts nothing', () => pair('post', '/api/admin/products/bulk-update', {
      ...as, body: { productIds: ['ZZ*_P2'], updates: { cost_price: 1 } },
    }));

    test.each([
      [{}],
      [{ productIds: [] }],
      [{ productIds: [0] }],
      [{ productIds: 'x' }],
    ])('bulk-delete validation %j', (body) => pair('post', '/api/admin/products/bulk-delete', { ...as, body }));
    test('bulk-delete: hard for unreferenced, soft for ordered products', async () => {
      await pair('post', '/api/admin/products/bulk-delete', { ...as, body: { productIds: ['ZZ*_P8', 'ZZ*_P4', 'nope', 'ZZ*_P8'] } });
      await rowsSame("SELECT id, status FROM products WHERE id IN ('ZZ*_P8', 'ZZ*_P4') ORDER BY id");
    });
  });

  // -------------------------------------------------------------------------
  describe('coupons', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };
    const coupon = `SELECT code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit,
      usage_count, usage_limit_per_customer, is_active, starts_at, expires_at, created_by FROM discount_codes WHERE code = ?`;

    test.each([
      [{ code: 5 }],
      [{ name: ['x'] }],
      [{ type: {} }],
      [{ code: true, name: 'x' }],
    ])('POST validation %j', (body) => pair('post', '/api/admin/coupons', { ...as, body }));
    test('POST without a code: 500', () => pair('post', '/api/admin/coupons', { ...as, body: { name: 'x' } }));
    test('POST a bad type: 500', () => pair('post', '/api/admin/coupons', { ...as, body: { code: 'ZZ*BADTYPE', name: 'x', type: 'bogus' } }));
    test('POST creates a coupon', async () => {
      await pair('post', '/api/admin/coupons', {
        ...as,
        body: {
          code: 'ZZ*NEW1', name: 'ZZ new', type: 'fixed_amount', value: 15, minimum_order_amount: '50', maximum_discount_amount: 0,
          usage_limit: 100, starts_at: '2026-01-01 00:00:00', expires_at: '', discount_details: { description: 'd', n: 2.0 },
        },
      });
      await rowsSame(coupon, ['ZZ*NEW1']);
    });
    test('POST defaults (type percentage, value 0, details {})', async () => {
      await pair('post', '/api/admin/coupons', { ...as, body: { code: 'ZZ*NEW2', name: 'ZZ defaults' } });
      await rowsSame(coupon, ['ZZ*NEW2']);
    });
    test('POST duplicate code: 409', () => pair('post', '/api/admin/coupons', { ...as, body: { code: 'ZZ*NEW1', name: 'again' } }));
    test('POST a bad date: 500', () => pair('post', '/api/admin/coupons', { ...as, body: { code: 'ZZ*BADDATE', name: 'x', starts_at: 'soon' } }));

    test.each([
      [{}],
      [{ bogus: 1 }],
      [[]],
      [{ name: 5 }],
      [{ code: ['A'] }],
      [{ type: { a: 1 }, value: 1 }],
    ])('PUT validation %j', (body) => pair('put', '/api/admin/coupons/ZZ*_C4', { ...as, body }));
    test('PUT updates, empty strings become NULL', async () => {
      await pair('put', '/api/admin/coupons/ZZ*_C4', {
        ...as, body: { name: 'ZZ changed', value: '20.5', is_active: false, expires_at: '', usage_limit: null, discount_details: null, id: 'nope' },
      });
      await rowsSame(coupon, ['ZZ*CODE4']);
    });
    test('PUT discount_details object and a boolean flag', async () => {
      await pair('put', '/api/admin/coupons/ZZ*_C4', { ...as, body: { discount_details: { terms: 'T' }, is_active: true, code: 'ZZ*CODE4' } });
      await rowsSame(coupon, ['ZZ*CODE4']);
    });
    test('PUT a duplicate code: 500', () => pair('put', '/api/admin/coupons/ZZ*_C4', { ...as, body: { code: 'ZZ*CODE1' } }));
    test('PUT an unknown coupon: 200', () => pair('put', '/api/admin/coupons/nope', { ...as, body: { name: 'x' } }));
    test('PUT a urlencoded body', async () => {
      await pair('put', '/api/admin/coupons/ZZ*_C3', { ...as, raw: { type: 'application/x-www-form-urlencoded', text: 'usage_limit=5&minimum_order_amount=&name=ZZ%20form' } });
      await rowsSame(coupon, ['ZZ*CODE3']);
    });
    test('DELETE', async () => {
      await pair('delete', '/api/admin/coupons/ZZ*_C5', as);
      await pair('delete', '/api/admin/coupons/nope', as);
      await rowsSame("SELECT COUNT(*) AS n FROM discount_codes WHERE id = 'ZZ*_C5'");
    });
    test('GET after the writes', () => pair('get', '/api/admin/coupons', { as: 'admin' }));
  });

  // -------------------------------------------------------------------------
  describe('inventory: levels and reorder points', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };
    const level = 'SELECT quantity_available, quantity_reserved, quantity_sold, reorder_point, reorder_quantity FROM inventory WHERE id = ?';

    test('PUT with missing fields (undefined bind): 500', () => pair('put', '/api/admin/inventory/ZZ*_I3', { ...as, body: { quantity_available: 1 } }));
    test('PUT a negative quantity: 500', () => pair('put', '/api/admin/inventory/ZZ*_I3', {
      ...as, body: { quantity_available: -1, quantity_reserved: 0, reorder_point: 1, reorder_quantity: 1 },
    }));
    test('PUT sets all four', async () => {
      await pair('put', '/api/admin/inventory/ZZ*_I3', {
        ...as, body: { quantity_available: '8', quantity_reserved: 1, reorder_point: 2.4, reorder_quantity: null },
      });
      await rowsSame(level, ['ZZ*_I3']);
    });
    test('PUT an unknown id: 200', () => pair('put', '/api/admin/inventory/nope', {
      ...as, body: { quantity_available: 1, quantity_reserved: 0, reorder_point: 1, reorder_quantity: 1 },
    }));

    test('reorder-points: unknown id: 404', () => pair('put', '/api/admin/inventory/nope/reorder-points', { ...as, body: { reorder_point: 1, reorder_quantity: 1 } }));
    test.each([
      [{ reorder_point: 4 }],
      [{ reorder_point: 'abc', reorder_quantity: 1 }],
      [{ reorder_point: -1, reorder_quantity: 1 }],
      [{ reorder_point: true, reorder_quantity: [] }],
      [{ reorder_point: { a: 1 }, reorder_quantity: 1 }],
    ])('reorder-points errors are 400s with the DB message %j', (body) => pair('put', '/api/admin/inventory/ZZ*_I3/reorder-points', { ...as, body }));
    test('reorder-points updates only the thresholds', async () => {
      await pair('put', '/api/admin/inventory/ZZ*_I3/reorder-points', { ...as, body: { reorder_point: 3, reorder_quantity: '25' } });
      await rowsSame(level, ['ZZ*_I3']);
      await pair('put', '/api/admin/inventory/ZZ*_I3/reorder-points', { ...as, body: { reorder_point: null, reorder_quantity: null } });
      await rowsSame(level, ['ZZ*_I3']);
    });
  });

  // -------------------------------------------------------------------------
  describe('inventory: adjustments, movements, low-stock alerts', () => {
    beforeAll(budget, 60000);
    const as = { as: 'admin', csrf: true };
    const level = 'SELECT quantity_available, quantity_reserved, quantity_sold FROM inventory WHERE id = ?';
    const moves = `SELECT movement_type, quantity_change, reference_type, reference_id, movement_details, created_by
      FROM inventory_movements WHERE inventory_id = ? ORDER BY id`;

    test.each([
      [{}],
      [{ product_id: 5, quantity_change: 1 }],
      [{ product_id: '', quantity_change: 1 }],
      [{ product_id: 'ZZ*_P1', variant_id: 5, quantity_change: 1 }],
      [{ product_id: 'ZZ*_P1' }],
      [{ product_id: 'ZZ*_P1', quantity_change: null }],
      [{ product_id: 'ZZ*_P1', quantity_change: 'abc' }],
      [{ product_id: 'ZZ*_P1', quantity_change: {} }],
      [{ product_id: ['ZZ*_P1'], quantity_change: 1 }],
    ])('adjust validation %j', (body) => pair('post', '/api/admin/inventory/adjust', { ...as, body }));
    test('adjust: unknown product', () => pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'NOPE', quantity_change: 1 } }));
    test('adjust: insufficient stock', () => pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P1', quantity_change: -1000 } }));
    test('adjust: -Infinity-like string', () => pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P1', quantity_change: '-Infinity' } }));
    test('adjust: base stock (+5, reason/notes), movement logged', async () => {
      await pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P1', quantity_change: 5, reason: 'recount', notes: { n: 1 } } });
      await rowsSame(level, ['ZZ*_I0']);
      await rowsSame(moves, ['ZZ*_I0']);
    });
    test('adjust: variant, string/odd numbers ("0x10", true, "", 1.5)', async () => {
      for (const quantity_change of ['0x10', true, '', 1.5, ' -2 ']) {
        await pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P1', variant_id: 'ZZ*_V1', quantity_change } });
      }
      await rowsSame(level, ['ZZ*_I1']);
      await rowsSame(moves, ['ZZ*_I1']);
    });
    test('adjust: an empty variant id means the base row', async () => {
      await pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P1', variant_id: '', quantity_change: '-1' } });
      await rowsSame(level, ['ZZ*_I0']);
    });
    test('adjust: an out-of-range result fails the UPDATE', () => pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P1', quantity_change: 1e12 } }));

    test('adjust below the reorder point queues one alert per admin, once a day', async () => {
      const emails = `SELECT id, to_email, to_name, subject, email_content, template_id, template_data, status, attempts, max_attempts
        FROM email_queue WHERE subject = 'Low Stock Alert - ZZ Parity Sheet 2' AND template_data->>'$.product_id' = 'ZZ*_P2' ORDER BY id`;
      await pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P2', quantity_change: -2 } });
      const { node } = await rowsSame(emails);
      expect(node.length).toBeGreaterThan(0);
      // a second drop within 24 h: no new alert
      await pair('post', '/api/admin/inventory/adjust', { ...as, body: { product_id: 'ZZ*_P2', quantity_change: -1 } });
      const again = await rowsSame(emails);
      expect(again.node.length).toBe(node.length);
      await rowsSame(moves, ['ZZ*_I2']);
    });

    test.each([
      [{}],
      [{ adjustments: [] }],
      [{ adjustments: 'x' }],
      [{ adjustments: {} }],
    ])('bulk-adjust validation %j', (body) => pair('post', '/api/admin/inventory/bulk-adjust', { ...as, body }));
    test('bulk-adjust: a null entry is a 500 (after the entries before it)', async () => {
      await pair('post', '/api/admin/inventory/bulk-adjust', { ...as, body: { adjustments: [{ product_id: 'ZZ*_P3', quantity_change: 1 }, null] } });
      await rowsSame(level, ['ZZ*_I3']);
    });
    test('bulk-adjust: mixed results, shared reason/notes', async () => {
      await pair('post', '/api/admin/inventory/bulk-adjust', {
        ...as,
        body: {
          reason: 'audit',
          notes: 'shared',
          adjustments: [
            { product_id: 'ZZ*_P3', quantity_change: 2, notes: 'own' },
            { product_id: 5, quantity_change: 1 },
            7,
            0,
            [],
            { product_id: '', quantity_change: 1 },
            { product_id: 'ZZ*_P1', variant_id: 'ZZ*_V1', quantity_change: 'x' },
            { product_id: 'ZZ*_P1', variant_id: 'ZZ*_V1', quantity_change: null },
            { product_id: 'NOPE', quantity_change: 1 },
            { product_id: 'ZZ*_P3', quantity_change: -9999, reason: 'own' },
          ],
        },
      });
      await rowsSame(level, ['ZZ*_I3']);
      await rowsSame(moves, ['ZZ*_I3']);
    });

    // Each side reads its own rows here, and ORDER BY im.created_at (seconds)
    // leaves rows of the same second in no defined order: compare them by id.
    test('movements of one inventory row', () => pair('get', '/api/admin/inventory/movements?inventory_id=ZZ*_I1', { as: 'admin', fix: byId }));
    test('movements of a product, limited', () => pair('get', '/api/admin/inventory/movements?product_id=ZZ*_P3&limit=10', { as: 'admin', fix: byId }));
    test('GET /inventory after the writes', () => pair('get', '/api/admin/inventory', { as: 'admin' }));
    test.each([
      '',
      '?limit=3',
      '?limit=0x2',
      '?limit=1&limit=2',
      '?limit=2.9junk',
      '?movement_type=adjustment&reference_type=manual&limit=4',
      '?inventory_id=ZZ*_I0&movement_type=adjustment&reference_type=manual&date_from=2000-01-01&date_to=2999-01-01',
      '?product_id=ZZ*_P1&date_to=2000-01-01',
      '?movement_type=sale',
    ])('GET /inventory/movements%s after the writes', (qs) => pair('get', `/api/admin/inventory/movements${qs}`, {
      as: 'admin', fix: qs.includes('ZZ*') ? byId : undefined,
    }));
  });

  // -------------------------------------------------------------------------
  describe('rate limits', () => {
    beforeAll(budget, 60000);

    test('adminWriteLimiter: the 61st write is the same 429, before the CSRF check', async () => {
      for (let i = 0; i < 60; i += 1) {
        await pair('put', '/api/admin/coupons/nope', { as: 'admin', csrf: true, body: { name: 'x' } });
      }
      const { node, rust } = await pair('put', '/api/admin/coupons/nope', { as: 'admin', csrf: true, body: { name: 'x' } });
      expect(node.status).toBe(429);
      P.expectSameRateLimit(node, rust);
      await pair('post', '/api/admin/inventory/adjust', { as: 'admin' });
      // reads have their own limiter
      await pair('get', '/api/admin/coupons', { as: 'admin' });
    }, 60000);
  });
});
