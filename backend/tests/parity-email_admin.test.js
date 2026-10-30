// Node ↔ Rust parity for the admin email queue, email templates, bulk CSV
// operations and /api/database:
//   routes/emailQueueRoutes.js      → rust/crates/api/src/routes/admin/email_queue.rs
//   routes/emailTemplateRoutes.js   → rust/crates/api/src/routes/admin/email_templates.rs
//   routes/bulkOperationsRoutes.js  → rust/crates/api/src/routes/admin/bulk.rs
//   routes/databaseRoutes.js        → rust/crates/api/src/routes/database.rs
//
// Runs when RUST_API_URL is set and the API binary is built (rust/target/debug/api
// or RUST_API_BIN): like every /api/admin parity file it starts Rust APIs of its
// own (fresh limiter stores, and the ENABLE_RAW_SQL / NODE_ENV variants the raw
// query endpoint needs), see backOffice() in parityHelpers.js.
//
//   (cd ../rust && cargo build -p api) && RUST_API_URL=http://127.0.0.1:7054 DB_HOST=127.0.0.1 \
//     DB_PORT=3307 DB_PASSWORD=noirae_dev DB_NAME=nt_x npx jest tests/parity-email_admin.test.js
//
// Mutations use one fixture per side (or run one side, restore, then the other)
// and compare the rows they leave field by field.
const { DatabaseUtil } = require('./helpers');
const P = require('./parityHelpers');

const BO = P.backOffice();
const servers = {}; // extra Rust APIs: { raw, prod }

const q = async (sql, params = []) => {
  const r = await DatabaseUtil.executeQuery(sql, params);
  if (!r.success) throw new Error(`${sql}: ${r.error}`);
  return r.data;
};
const TIME = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g;
const times = P.normalizer([[TIME, 'TIME']]);
const ids = P.normalizer([[/EMAIL\d{10}/g, 'EMAIL*'], [TIME, 'TIME']]);

/** Rows as JSON (dates → ISO → 'TIME'), minus volatile columns. */
async function snapshot(sql, params, drop = []) {
  const rows = JSON.parse(JSON.stringify(await q(sql, params)));
  for (const r of rows) for (const k of drop) delete r[k];
  return times(rows);
}

/** Run BO.same against another Rust API of this file (servers.raw / .prod). */
async function sameAt(server, method, url, opts) {
  const saved = BO.rustUrl;
  BO.rustUrl = server.url;
  try {
    return await BO.same(method, url, opts);
  } finally {
    BO.rustUrl = saved;
  }
}

/** One request per side (different urls/bodies), compared like BO.same. */
async function pair(method, urls, opts, fix = (v) => v) {
  const [nodeUrl, rustUrl] = Array.isArray(urls) ? urls : [urls, urls];
  const [nodeOpts, rustOpts] = Array.isArray(opts) ? opts : [opts, opts];
  const node = await BO.call('node', method, nodeUrl, nodeOpts);
  const rust = await BO.call('rust', method, rustUrl, rustOpts);
  const view = (r) => {
    const rl = P.rateLimitHeaders(r.headers);
    for (const k of ['ratelimit-reset', 'x-ratelimit-reset', 'retry-after']) if (rl[k] !== undefined) rl[k] = 'CLOCK';
    return { status: r.status, body: fix(times(r.body)), rateLimit: rl };
  };
  expect(view(rust)).toEqual(view(node));
  return { node, rust };
}

/**
 * A matching If-None-Match is a 304 on both. (Not through fetch: it adds
 * `Cache-Control: no-cache` to a conditional request, which makes Express
 * answer 200 too.)
 */
async function expectNotModified(url, etag) {
  const headers = { ...BO.headers(BO.sessions.admin), 'If-None-Match': etag };
  const node = await BO.call('node', 'get', url, { headers });
  const rust = await new Promise((resolve, reject) => {
    const req = require('http').request(BO.rustUrl + url, { headers }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end();
  });
  const view = (r) => ({ status: r.status, text: r.text, etag: r.headers.etag, type: r.headers['content-type'] ?? null });
  expect(view(rust)).toEqual(view(node));
  expect(node.status).toBe(304);
}

function multipart(parts, boundary = 'ParityBoundary7MA4YWxk') {
  let text = '';
  for (const p of parts) {
    text += `--${boundary}\r\n`;
    if (p.filename !== undefined) {
      text += `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\n`;
      text += `Content-Type: ${p.type || 'text/csv'}\r\n\r\n${p.value}\r\n`;
    } else {
      text += `Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`;
    }
  }
  text += `--${boundary}--\r\n`;
  return { type: `multipart/form-data; boundary=${boundary}`, text };
}
const csvFile = (value, extra = {}) => multipart([{ name: 'file', filename: 'products.csv', value, ...extra }]);

const VALID_CSV = [
  'sku,name,base_price,sale_price,stock_quantity,status,is_featured,material,thread_count,weight,organic',
  'PARITY-SKU-1,Parity Silk Sheet,450.00,399,50,active,true,Silk,600,2.5,true',
  'parity-sku-2,  Parity Pillowcase  ,89.5,,,draft,0,,,,1',
].join('\r\n');
const INVALID_CSV = [
  'sku,name,base_price,stock_quantity,status',
  'GOOD-1,Good,10,5,active',
  ',Missing Sku,abc,x,bogus',
  'bad sku,No Price,,1,draft',
].join('\n');

P.describeBackOffice('admin email queue, email templates, bulk CSV, /api/database', () => {
  beforeAll(async () => {
    await BO.start();
    const env = { JWT_SECRET: process.env.JWT_SECRET };
    if (process.env.CSRF_SECRET) env.CSRF_SECRET = process.env.CSRF_SECRET;
    servers.raw = await P.startRust({ port: await P.freePort(), env: { ...env, NODE_ENV: 'test', ENABLE_RAW_SQL: 'true' } });
    servers.prod = await P.startRust({ port: await P.freePort(), env: { ...env, NODE_ENV: 'production', ENABLE_RAW_SQL: 'true' } });
  }, 90000);
  afterAll(async () => {
    await BO.stop();
    for (const s of Object.values(servers)) await s.stop();
  });

  // -------------------------------------------------------------------------
  // Guards: 401 / 403 bodies, which mount answers, CSRF, decode errors
  // -------------------------------------------------------------------------
  describe('guards', () => {
    const READS = [
      ['get', '/api/admin/email-queue'],
      ['get', '/api/admin/email-queue/worker-status'],
      ['get', '/api/admin/email-templates'],
      ['get', '/api/admin/email-templates/EMAIL0000000001'],
      ['get', '/api/admin/bulk/products/template'],
      ['get', '/api/admin/bulk/orders/export'],
      ['get', '/api/admin/bulk/products/export'],
      ['get', '/api/admin/bulk/customers/export'],
      ['get', '/api/database/test'],
      ['get', '/api/database/tables'],
      ['get', '/api/database/transno'],
    ];
    const WRITES = [
      ['post', '/api/admin/email-queue/retry-failed'],
      ['post', '/api/admin/email-queue/EQNOPE/retry'],
      ['post', '/api/admin/email-templates'],
      ['put', '/api/admin/email-templates/EMAILNOPE'],
      ['delete', '/api/admin/email-templates/EMAILNOPE'],
      ['post', '/api/admin/bulk/products/validate'],
      ['post', '/api/admin/bulk/products/upload'],
      ['post', '/api/database/query'],
    ];

    test.each([...READS, ...WRITES])('anonymous %s %s', (m, url) => BO.same(m, url));
    test.each([...READS, ...WRITES])('forged token %s %s', (m, url) => BO.same(m, url, { headers: P.bearer('a.b.c') }));
    test.each([...READS, ...WRITES])('customer %s %s', (m, url) => BO.same(m, url, { as: 'customer', csrf: true }));
    test.each([...READS, ...WRITES])('staff %s %s', (m, url) => BO.same(m, url, { as: 'staff', csrf: true }));

    // Admin writes without / with a wrong CSRF token (/validate and /query have none).
    const CSRF_WRITES = WRITES.filter(([, u]) => !u.endsWith('/validate') && !u.endsWith('/query'));
    test.each(CSRF_WRITES)('admin without CSRF %s %s', (m, url) => BO.same(m, url, { as: 'admin', body: {} }));
    test.each(CSRF_WRITES)('admin with a mismatched CSRF %s %s', (m, url) => BO.same(m, url, {
      as: 'admin', body: {},
      headers: { 'X-CSRF-Token': BO.sessions.admin.csrf, Cookie: 'csrf_token=other' },
    }));
    test.each(CSRF_WRITES)('admin with a forged CSRF %s %s', (m, url) => BO.same(m, url, {
      as: 'admin', body: {}, headers: { 'X-CSRF-Token': 'forged', Cookie: 'csrf_token=forged' },
    }));
    test.each(CSRF_WRITES)('admin with the staff user\'s CSRF %s %s', (m, url) => BO.same(m, url, {
      as: 'admin', body: {},
      headers: { 'X-CSRF-Token': BO.sessions.staff.csrf, Cookie: `csrf_token=${encodeURIComponent(BO.sessions.staff.csrf)}` },
    }));

    test.each([
      // not routed by the area: falls through to /api/admin (staffOrAdmin, adminLimiter, CSRF, 404)
      ['get', '/api/admin/email-queue/a/b', 'staff'],
      ['get', '/api/admin/email-queue/a/b', 'admin'],
      ['delete', '/api/admin/email-queue', 'admin'],
      ['get', '/api/admin/email-queue/retry-failed', 'admin'],
      // C and D run `protect, admin` before their router: staff stop there
      ['get', '/api/admin/email-templates/a/b', 'staff'],
      ['get', '/api/admin/email-templates/a/b', 'admin'],
      ['patch', '/api/admin/email-templates/x', 'admin'],
      ['get', '/api/admin/bulk/products/validate', 'admin'],
      ['post', '/api/admin/bulk/orders/export', 'admin'],
      // case-insensitive mounts and routes, trailing slash, double slash
      ['get', '/API/Admin/Email-Queue/Worker-Status/', 'admin'],
      ['get', '/api/admin/email-templates/', 'admin'],
      ['get', '/api/admin//bulk/products/template', 'admin'],
    ])('%s %s as %s', (m, url, as) => BO.same(m, url, { as, csrf: true }));

    test.each([
      ['post', '/api/admin/email-queue/%E0%A4%A/retry', undefined],
      ['post', '/api/admin/email-queue/%E0%A4%A/retry', 'admin'],
      ['get', '/api/admin/email-templates/%zz', 'admin'],
      ['get', '/api/admin/email-templates/%zz', undefined],
      ['delete', '/api/admin/email-templates/%E0%A4%A', 'staff'],
    ])('a param decodeURIComponent rejects: %s %s as %s', (m, url, as) => BO.same(m, url, { as, csrf: true }));

    test('a JSON body the parser rejects is a 500 before auth', () => BO.same('post', '/api/admin/email-templates', {
      raw: { type: 'application/json', text: '{bad' }, dropError: true,
    }));
    test('HEAD and OPTIONS', async () => {
      await BO.same('head', '/api/admin/email-queue', { as: 'admin' });
      await BO.same('options', '/api/admin/email-templates');
      await BO.same('options', '/api/database/query');
    });
  });

  // -------------------------------------------------------------------------
  // Email queue
  // -------------------------------------------------------------------------
  describe('email queue', () => {
    const FIX = 'EQPARITY';
    const parked = []; // failed rows of other tests, set aside while retry-failed runs

    // processing_details variants the list's `error` is read from
    const DETAILS = [
      '{"error_message":"SES throttled","failed_at":"2026-01-01T00:00:00Z","attempt_number":3}',
      '{"error":"legacy error"}',
      '"plain text error"',
      '"{\\"error_message\\":\\"nested\\"}"',
      '[1,2]',
      null,
      '{"error_message":"","error":"fallback"}',
      '0',
      '"5"',
      '{"error_message":{"code":1}}',
    ];
    const STATUSES = ['pending', 'processing', 'sent', 'failed', 'cancelled'];

    async function seed(prefix, { failedOnly = false } = {}) {
      const rows = [];
      for (let i = 0; i < DETAILS.length; i += 1) {
        const status = failedOnly ? 'failed' : STATUSES[i % STATUSES.length];
        rows.push([`${prefix}${String(i).padStart(2, '0')}`, status, DETAILS[i], i]);
      }
      for (const [id, status, details, i] of rows) {
        await q(
          `INSERT INTO email_queue (id, to_email, to_name, subject, email_content, template_id, status, attempts, max_attempts,
             processing_details, scheduled_at, sent_at, created_at)
           VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), ?, DATE_SUB('2026-01-02 00:00:00', INTERVAL ? MINUTE))`,
          [id, `${id.toLowerCase()}@example.com`, i % 3 === 0 ? '' : `Name ${i}`, i === 4 ? '' : `Subject ${i}`,
            i % 2 === 0 ? 'EMAIL0000000001' : null, status, i % 4, i === 5 ? 0 : 3, details, String(120 + i),
            status === 'sent' ? (i === 2 ? new Date(Date.now() - 30 * 60 * 1000) : new Date('2025-12-31T10:00:00Z')) : null,
            String(i)],
        );
      }
      return rows.map((r) => r[0]);
    }

    beforeAll(async () => {
      await q('DELETE FROM email_queue WHERE id LIKE ?', [`${FIX}%`]);
      for (const r of await q("SELECT id FROM email_queue WHERE status = 'failed'")) parked.push(r.id);
      if (parked.length) await q(`UPDATE email_queue SET status = 'cancelled' WHERE id IN (${parked.map(() => '?').join(',')})`, parked);
      await seed(`${FIX}L`);
    });
    afterAll(async () => {
      await q('DELETE FROM email_queue WHERE id LIKE ?', [`${FIX}%`]);
      if (parked.length) await q(`UPDATE email_queue SET status = 'failed' WHERE id IN (${parked.map(() => '?').join(',')})`, parked);
    });

    // The oldest pending row's age is TIMESTAMPDIFF(…, NOW()): it may tick
    // between the two requests, so it is compared within 2 s.
    const age = (v) => {
      const s = JSON.stringify(v).replace(/"oldestQueuedAgeSeconds":\d+/g, '"oldestQueuedAgeSeconds":"AGE"');
      return JSON.parse(s);
    };
    const ageOf = (r) => JSON.stringify(r.body).match(/"oldestQueuedAgeSeconds":(\d+|null)/)[1];
    async function sameList(url) {
      const { node, rust } = await BO.same('get', url, { as: 'admin', normalize: age });
      if (node.status === 200) {
        const [a, b] = [ageOf(node), ageOf(rust)];
        if (a === 'null' || b === 'null') expect(b).toBe(a);
        else expect(Math.abs(Number(a) - Number(b))).toBeLessThanOrEqual(2);
      }
      return { node, rust };
    }

    test.each([
      '', '?status=queued', '?status=sending', '?status=sent', '?status=failed', '?status=cancelled',
      '?status=all', '?status=ALL', '?status=Failed', '?status=bogus', '?status=', '?status=constructor',
      '?status=__proto__', '?status=toString', '?status[]=failed', '?status=failed&status=sent', '?status[a]=b',
      '?limit=1', '?limit=0', '?limit=500', '?limit=abc', '?limit=-3', '?limit=2.9', '?limit=3&offset=2',
      '?offset=-1', '?offset=abc', '?offset=1e3', '?limit=[]', '?limit[]=4&offset[]=1',
      '?offset=99999999999999999999', '?offset=1000000000000000000000', '?offset=1e21', '?status=sent&limit=2&offset=1',
    ])('GET /api/admin/email-queue%s', (qs) => sameList(`/api/admin/email-queue${qs}`));

    test('the list shows the fixtures the way Node shapes them', async () => {
      await sameList('/api/admin/email-queue?limit=200');
      // other test files enqueue mail too: page through to the fixtures (on
      // both sides, so the read limiters keep counting alike)
      const emails = [];
      for (let offset = 0; ; offset += 200) {
        const { node: page } = await sameList(`/api/admin/email-queue?limit=200&offset=${offset}`);
        const list = page.body.keyValueTable[0].emails;
        emails.push(...list.filter((e) => e.id.startsWith(`${FIX}L`)));
        if (list.length < 200) break;
      }
      expect(emails.map((e) => e.error)).toEqual(expect.arrayContaining(['SES throttled', 'legacy error', 'plain text error', 'nested', 'fallback', { code: 1 }]));
    });

    test('worker status', async () => {
      const { node, rust } = await BO.same('get', '/api/admin/email-queue/worker-status', { as: 'admin', normalize: age });
      expect(Math.abs(Number(ageOf(node)) - Number(ageOf(rust)))).toBeLessThanOrEqual(2);
      expect(node.body.keyValueTable[0].worker.sentLastHour).toBeGreaterThanOrEqual(1); // the send 30 min ago
    });

    test('worker status: idle / backlog / active as the table changes', async () => {
      // backlog: pending work, no send in the last 5 minutes, oldest pending > 10 minutes
      await q("UPDATE email_queue SET sent_at = '2025-12-31 10:00:00' WHERE id LIKE ? AND status = 'sent'", [`${FIX}%`]);
      const recent = await q("SELECT COUNT(*) AS n FROM email_queue WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)");
      const { node } = await BO.same('get', '/api/admin/email-queue/worker-status', { as: 'admin', normalize: age });
      if (Number(recent[0].n) === 0) expect(node.body.keyValueTable[0].worker.health).toBe('backlog');
      // active: a send a minute ago
      await q("UPDATE email_queue SET sent_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?", [`${FIX}L02`]);
      const active = await BO.same('get', '/api/admin/email-queue/worker-status', { as: 'admin', normalize: age });
      expect(active.node.body.keyValueTable[0].worker.health).toBe('active');
      await q("UPDATE email_queue SET sent_at = DATE_SUB(NOW(), INTERVAL 30 MINUTE) WHERE id = ?", [`${FIX}L02`]);
    });

    test('POST /retry-failed: same answer and the same rows on each side', async () => {
      // Only this side's fixtures are failed when each request runs.
      const failedNode = await seed(`${FIX}N`, { failedOnly: true });
      await q("UPDATE email_queue SET status = 'sent' WHERE id LIKE ? AND status = 'failed'", [`${FIX}L%`]);
      const node = await BO.call('node', 'post', '/api/admin/email-queue/retry-failed', { as: 'admin', csrf: true });
      const failedRust = await seed(`${FIX}R`, { failedOnly: true });
      const rust = await BO.call('rust', 'post', '/api/admin/email-queue/retry-failed', { as: 'admin', csrf: true });
      expect([rust.status, rust.body]).toEqual([node.status, node.body]);
      expect(node.body.message).toBe(`Requeued ${failedNode.length} failed email(s)`);
      const cols = 'status, attempts, processing_details, TIMESTAMPDIFF(SECOND, scheduled_at, NOW()) <= 5 AS due_now, SUBSTRING(id, 10) AS n';
      expect(await snapshot(`SELECT ${cols} FROM email_queue WHERE id IN (${failedRust.map(() => '?').join(',')}) ORDER BY id`, failedRust))
        .toEqual(await snapshot(`SELECT ${cols} FROM email_queue WHERE id IN (${failedNode.map(() => '?').join(',')}) ORDER BY id`, failedNode));
      // nothing failed any more: both answer 0
      await BO.same('post', '/api/admin/email-queue/retry-failed', { as: 'admin', csrf: true });
    });

    test.each([
      ['failed', 200], ['cancelled', 200], ['pending', 404], ['processing', 404], ['sent', 404],
    ])('POST /:id/retry on a %s row', async (status) => {
      const make = async (id) => {
        await q('DELETE FROM email_queue WHERE id = ?', [id]);
        await q(`INSERT INTO email_queue (id, to_email, subject, email_content, status, attempts, processing_details, scheduled_at)
                 VALUES (?, 'r@example.com', 'S', '{}', ?, 3, '{"error_message":"x"}', '2026-01-01 00:00:00')`, [id, status]);
      };
      const [n, r] = [`${FIX}RN${status}`, `${FIX}RR${status}`];
      await make(n);
      await make(r);
      await pair('post', [`/api/admin/email-queue/${n}/retry`, `/api/admin/email-queue/${r}/retry`],
        { as: 'admin', csrf: true }, (v) => JSON.parse(JSON.stringify(v).replaceAll(n, 'ID').replaceAll(r, 'ID')));
      const cols = 'status, attempts, processing_details, scheduled_at > \'2026-01-01 00:00:00\' AS moved';
      expect(await snapshot(`SELECT ${cols} FROM email_queue WHERE id = ?`, [r]))
        .toEqual(await snapshot(`SELECT ${cols} FROM email_queue WHERE id = ?`, [n]));
    });

    test.each([
      '/api/admin/email-queue/EQ-NOT-THERE/retry',
      '/api/admin/email-queue/with%20space/retry',
      '/api/admin/email-queue/%C3%A9/RETRY/',
    ])('POST %s', (url) => BO.same('post', url, { as: 'admin', csrf: true }));
  });

  // -------------------------------------------------------------------------
  // Email templates
  // -------------------------------------------------------------------------
  describe('email templates', () => {
    const NODE_ID = 'EMAILPARITYN';
    const RUST_ID = 'EMAILPARITYR';
    const created = [];

    async function fixture(id, side) {
      await q('DELETE FROM email_queue WHERE template_id = ?', [id]);
      await q('DELETE FROM email_templates WHERE id = ?', [id]);
      await q(`INSERT INTO email_templates (id, name, subject, template_content, category, type, status, preheader, is_active)
               VALUES (?, ?, 'Fixture subject', '{"html_content":"<p>hi</p>","n":1.5}', 'marketing', 'campaign', 'Draft', 'Pre', 1)`,
      [id, `parity-fixture-${side}`]);
    }
    const tpl = (id) => snapshot('SELECT * FROM email_templates WHERE id = ?', [id], ['id', 'created_at', 'updated_at']);
    const sides = (v) => JSON.parse(JSON.stringify(v)
      .replaceAll(NODE_ID, 'ID').replaceAll(RUST_ID, 'ID')
      .replaceAll('-node', '-SIDE').replaceAll('-rust', '-SIDE'));

    beforeEach(async () => {
      await fixture(NODE_ID, 'node');
      await fixture(RUST_ID, 'rust');
    });
    afterAll(async () => {
      for (const id of [NODE_ID, RUST_ID, 'EMAILPARJSON', 'EMAILPARBAD', ...created]) {
        await q('DELETE FROM email_queue WHERE template_id = ?', [id]);
        await q('DELETE FROM email_templates WHERE id = ?', [id]);
      }
    });

    test('GET / (list)', () => BO.same('get', '/api/admin/email-templates', { as: 'admin' }));
    test.each(['EMAIL0000000001', 'EMAILPARITYN', 'EMAIL-NOPE', 'email0000000001'])('GET /%s', (id) =>
      BO.same('get', `/api/admin/email-templates/${id}`, { as: 'admin' }));

    test('GET /:id with template_content holding a JSON string', async () => {
      await q(`INSERT INTO email_templates (id, name, subject, template_content) VALUES
               ('EMAILPARJSON', 'parity-json-string', 'S', JSON_QUOTE('{"html_content":"<b>x</b>","n":2.0}')),
               ('EMAILPARBAD', 'parity-bad-string', 'S', JSON_QUOTE('not json'))`);
      await BO.same('get', '/api/admin/email-templates/EMAILPARJSON', { as: 'admin' });
      await BO.same('get', '/api/admin/email-templates/EMAILPARBAD', { as: 'admin' });
      await BO.same('get', '/api/admin/email-templates', { as: 'admin' });
    });

    // ---- create: run Node, read and delete its row, then Rust, so unique names never collide
    async function create(body, { raw } = {}) {
      const opts = { as: 'admin', csrf: true, body, raw };
      const node = await BO.call('node', 'post', '/api/admin/email-templates', opts);
      const nodeId = node.body?.keyValueTable?.[0]?.id;
      const nodeRow = nodeId ? await tpl(nodeId) : null;
      if (nodeId) await q('DELETE FROM email_templates WHERE id = ?', [nodeId]);
      const rust = await BO.call('rust', 'post', '/api/admin/email-templates', opts);
      const rustId = rust.body?.keyValueTable?.[0]?.id;
      const rustRow = rustId ? await tpl(rustId) : null;
      if (rustId) created.push(rustId);
      if (rustId) await q('DELETE FROM email_templates WHERE id = ?', [rustId]);
      expect(ids({ status: rust.status, body: rust.body })).toEqual(ids({ status: node.status, body: node.body }));
      expect(rustRow).toEqual(nodeRow);
      return { node, rust };
    }

    test.each([
      [{}],
      [[]],
      [{ name: 'parity-x' }],
      [{ subject: 'S' }],
      [{ name: '', subject: 'S' }],
      [{ name: 0, subject: 'S' }],
      [{ name: 'parity-x', subject: false }],
      [{ name: 'parity-create-min', subject: 'Hello' }],
      [{ name: 'parity-create-full', subject: 'Hello {{first_name}}', category: 'marketing', type: 'campaign', preheader: 'Pre', content: { html_content: '<p>x</p>', blocks: [1, 2.0, 'a'], nested: { b: null } } }],
      [{ name: 'parity-create-falsy', subject: 'S', category: '', type: 0, preheader: null, content: '' }],
      [{ name: 'parity-create-strcontent', subject: 'S', content: 'just a string' }],
      [{ name: 'parity-create-numcontent', subject: 'S', content: 42 }],
      [{ name: 'parity-create-arrcontent', subject: 'S', content: [] }],
      [{ name: 12345, subject: 'numeric name' }],
      [{ name: true, subject: 'boolean name' }],
      [{ name: { a: 1 }, subject: 'object name' }],
      [{ name: ['parity-arr'], subject: ['arr subject'] }],
      [{ name: 'parity-create-cat-obj', subject: 'S', category: { x: 1 }, type: [1, 'b'] }],
      [{ name: 'welcome_user', subject: 'duplicate name' }],
      [{ name: 'x'.repeat(101), subject: 'too long' }],
      [{ name: 'parity-long-subject', subject: 's'.repeat(256) }],
    ])('POST / %j', (body) => create(body));

    test('POST / urlencoded and multipart bodies', async () => {
      await create(undefined, { raw: { type: 'application/x-www-form-urlencoded', text: 'name=parity-form&subject=Form&content[a]=1&category=' } });
      await create(undefined, { raw: multipart([{ name: 'name', value: 'parity-multipart' }, { name: 'subject', value: 'M' }]) });
    });

    // ---- update: each side its own fixture row, same body (names made side-specific)
    async function update(body, { nodeId = NODE_ID, rustId = RUST_ID, raw } = {}) {
      const forSide = (side) => (body && typeof body === 'object' && !Array.isArray(body) && typeof body.name === 'string'
        ? { ...body, name: `${body.name}-${side}` } : body);
      await pair('put', [`/api/admin/email-templates/${nodeId}`, `/api/admin/email-templates/${rustId}`],
        [{ as: 'admin', csrf: true, body: forSide('node'), raw }, { as: 'admin', csrf: true, body: forSide('rust'), raw }], sides);
      expect(sides(await tpl(rustId))).toEqual(sides(await tpl(nodeId)));
    }

    test.each([
      [{}],
      [[]],
      [[{ name: 'x' }]],
      [{ unknown: 1, id: 'EMAILX', is_active: 0 }],
      [{ template_content: { a: 1 } }],
      [{ name: 'parity-renamed' }],
      [{ subject: 'New subject', status: 'Active', preheader: null }],
      [{ category: 'transactional', type: 'system', preheader: 'P2' }],
      [{ content: { html_content: '<h1>New</h1>', n: 3.0, list: [1, { a: 2 }] } }],
      [{ content: null }],
      [{ content: 'string content' }],
      [{ content: 7, template_content: 'ignored', name: 'parity-both' }],
      [{ subject: 12, category: true, type: { t: 1 }, preheader: [1, 2] }],
      [{ status: 'x'.repeat(51) }],
      [{ subject: null }],
    ])('PUT /:id %j', (body) => update(body));

    test('PUT /:id with a name another template has', () => pair('put',
      [`/api/admin/email-templates/${NODE_ID}`, `/api/admin/email-templates/${RUST_ID}`],
      { as: 'admin', csrf: true, body: { name: 'welcome_user' } }));

    test.each([
      [{ name: 'parity-missing' }],
      [{ subject: 'x' }],
      [{}],
    ])('PUT on a missing id %j', (body) => BO.same('put', '/api/admin/email-templates/EMAIL-MISSING', { as: 'admin', csrf: true, body }));

    test('PUT urlencoded', () => update(undefined, { raw: { type: 'application/x-www-form-urlencoded', text: 'subject=Form+subject&content[html]=x&nope=1' } }));

    test('DELETE /:id', async () => {
      await pair('delete', [`/api/admin/email-templates/${NODE_ID}`, `/api/admin/email-templates/${RUST_ID}`], { as: 'admin', csrf: true }, sides);
      expect(await q('SELECT id FROM email_templates WHERE id IN (?, ?)', [NODE_ID, RUST_ID])).toEqual([]);
      // gone now: 404 on both
      await pair('delete', [`/api/admin/email-templates/${NODE_ID}`, `/api/admin/email-templates/${RUST_ID}`], { as: 'admin', csrf: true }, sides);
    });

    test('DELETE a template the queue still references (FK) is a 500', async () => {
      for (const id of [NODE_ID, RUST_ID]) {
        await q(`INSERT INTO email_queue (id, to_email, subject, email_content, template_id) VALUES (?, 'fk@example.com', 'S', '{}', ?)`, [`EQPARITYFK${id.slice(-1)}`, id]);
      }
      await pair('delete', [`/api/admin/email-templates/${NODE_ID}`, `/api/admin/email-templates/${RUST_ID}`], { as: 'admin', csrf: true },
        (v) => sides(JSON.parse(JSON.stringify(v).replace(/`?EQPARITYFK[NR]`?/g, 'FK'))));
      expect(await q('SELECT COUNT(*) AS n FROM email_templates WHERE id IN (?, ?)', [NODE_ID, RUST_ID])).toEqual([{ n: '2' }]);
    });
  });

  // -------------------------------------------------------------------------
  // Bulk CSV
  // -------------------------------------------------------------------------
  describe('bulk CSV', () => {
    test('GET /products/template (bytes, headers)', async () => {
      const { node, rust } = await BO.same('get', '/api/admin/bulk/products/template', { as: 'admin' });
      for (const h of ['content-type', 'content-disposition', 'cache-control', 'pragma', 'etag', 'content-length']) {
        const get = (r) => (typeof r.headers.get === 'function' ? r.headers.get(h) : r.headers[h]);
        expect([h, get(rust)]).toEqual([h, get(node)]);
      }
      await expectNotModified('/api/admin/bulk/products/template', node.headers.etag);
      await BO.same('head', '/api/admin/bulk/products/template', { as: 'admin' });
    });

    test.each([
      ['a valid CSV', csvFile(VALID_CSV)],
      ['rows with errors and warnings', csvFile(INVALID_CSV)],
      ['a BOM, quotes, a semicolon delimiter', csvFile('\uFEFFsku;name;base_price\n"Q-1";"Quoted; name";"1,5"\n"Q-2";"Line\nbreak";2')],
      ['extra and missing columns', csvFile('sku,name,base_price\nX-1,A,1,extra,more\nX-2,B')],
      ['duplicate and padded headers', csvFile(' sku ,name,name,base_price\nD-1,First,Second,3')],
      ['an empty file', csvFile('')],
      ['only a header', csvFile('sku,name,base_price\n')],
      ['text/csv with another extension', multipart([{ name: 'file', filename: 'data.txt', type: 'text/csv', value: VALID_CSV }])],
      ['a .csv sent as text/plain', multipart([{ name: 'file', filename: 'data.csv', type: 'text/plain', value: VALID_CSV }])],
      ['a non-CSV file', multipart([{ name: 'file', filename: 'data.json', type: 'application/json', value: '{}' }])],
      ['the file under another field', multipart([{ name: 'upload', filename: 'p.csv', value: VALID_CSV }])],
      ['text fields only', multipart([{ name: 'note', value: 'hello' }])],
      ['two files', multipart([{ name: 'file', filename: 'a.csv', value: VALID_CSV }, { name: 'file', filename: 'b.csv', value: VALID_CSV }])],
      ['a malformed multipart body', { type: 'multipart/form-data; boundary=zz', text: '--zz\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\n\r\nsku' }],
      ['multipart without a boundary', { type: 'multipart/form-data', text: 'x' }],
      ['a JSON body', { type: 'application/json', text: '{"file":"sku,name"}' }],
      ['non-ASCII text', csvFile('sku,name,base_price\nU-1,caf\u00e9 \u{1F6CF},1')],
    ])('POST /products/validate: %s', (_, raw) => BO.same('post', '/api/admin/bulk/products/validate', { as: 'admin', raw }));

    test('POST /products/validate: a file over 5 MB', () => BO.same('post', '/api/admin/bulk/products/validate', {
      as: 'admin', raw: csvFile(`sku,name,base_price\n${'Z-1,Big,1\n'.repeat(600000)}`),
    }));

    const counts = async () => {
      const [prod] = await q("SELECT count FROM transno WHERE prefix = 'PROD'");
      const [n] = await q('SELECT COUNT(*) AS n FROM products');
      return { prod: Number(prod.count), products: Number(n.n) };
    };

    test.each([
      ['valid rows (each INSERT fails on the products schema: reported, not counted as success)', csvFile(VALID_CSV)],
      ['rows with errors', csvFile(INVALID_CSV)],
      ['an empty file', csvFile('')],
      ['no file', multipart([{ name: 'note', value: 'x' }])],
      ['a non-CSV file', multipart([{ name: 'file', filename: 'x.png', type: 'image/png', value: 'png' }])],
    ])('POST /products/upload: %s', async (_, raw) => {
      const before = await counts();
      const node = await BO.call('node', 'post', '/api/admin/bulk/products/upload', { as: 'admin', csrf: true, raw });
      const mid = await counts();
      const rust = await BO.call('rust', 'post', '/api/admin/bulk/products/upload', { as: 'admin', csrf: true, raw });
      const after = await counts();
      const view = (r) => ({ status: r.status, body: times(r.body) });
      const drop = (v) => { if (v.body?.keyValueTable?.timestamp) v.body.keyValueTable.timestamp = 'TIME'; return v; };
      expect(drop(view(rust))).toEqual(drop(view(node)));
      // same side effects: as many PROD ids consumed, as many products written
      expect({ prod: after.prod - mid.prod, products: after.products - mid.products })
        .toEqual({ prod: mid.prod - before.prod, products: mid.products - before.products });
    });

    test.each([
      '', '?status=pending', '?status=delivered', '?start_date=2020-01-01', '?end_date=2020-01-01',
      '?start_date=2020-01-01&end_date=2030-12-31&status=processing', '?start_date=garbage',
      '?status[]=pending', '?start_date[a]=b', '?end_date=a&end_date=b', '?status=',
    ])('GET /orders/export%s', (qs) => BO.same('get', `/api/admin/bulk/orders/export${qs}`, { as: 'admin' }));

    test.each([
      '', '?status=approved', '?status=draft', '?status=nope', '?category=Sheets', '?category=',
      '?category[]=a', '?status=a&status=b',
    ])('GET /products/export%s', (qs) => BO.same('get', `/api/admin/bulk/products/export${qs}`, { as: 'admin' }));

    test('GET /customers/export', () => BO.same('get', '/api/admin/bulk/customers/export', { as: 'admin' }));

    test('exports carry the download headers and ETag', async () => {
      for (const url of ['/api/admin/bulk/orders/export', '/api/admin/bulk/customers/export']) {
        const node = await BO.call('node', 'get', url, { as: 'admin' });
        const rust = await BO.call('rust', 'get', url, { as: 'admin' });
        for (const h of ['content-type', 'content-disposition', 'cache-control', 'pragma', 'etag', 'content-length']) {
          expect([h, rust.headers.get(h)]).toEqual([h, node.headers[h]]);
        }
        await expectNotModified(url, node.headers.etag);
        await BO.same('head', url, { as: 'admin' });
      }
    });
  });

  // The parity checks above compare whatever Node answers; this pins down that
  // they reach the branches they are named after.
  test('the compared cases reach their branches (Node side)', async () => {
    const call = (m, url, opts) => BO.call('node', m, url, { as: 'admin', csrf: true, ...opts });
    const expectNode = async (m, url, opts, status, message) => {
      const r = await call(m, url, opts);
      expect([url, r.status, r.body?.message]).toEqual([url, status, message]);
      return r;
    };
    await expectNode('get', '/api/admin/email-queue?offset=1000000000000000000000', {}, 500, 'Failed to load email queue');
    const tpl = await expectNode('post', '/api/admin/email-templates', { body: { name: 'parity-branch', subject: 'S' } }, 201, 'Template created successfully');
    const id = tpl.body.keyValueTable[0].id;
    await expectNode('put', `/api/admin/email-templates/${id}`, { body: { subject: 'T' } }, 200, 'Template updated successfully');
    await expectNode('put', `/api/admin/email-templates/${id}`, { body: { nope: 1 } }, 200, 'No changes to save');
    await expectNode('put', `/api/admin/email-templates/${id}`, { body: { subject: null } }, 500, 'Server error');
    await expectNode('post', '/api/admin/email-templates', { body: { name: 'parity-branch', subject: 'S' } }, 409, 'A template with this name already exists');
    await expectNode('delete', `/api/admin/email-templates/${id}`, {}, 200, 'Template deleted successfully');
    await expectNode('post', '/api/admin/email-templates', { body: { name: 'x'.repeat(101), subject: 'S' } }, 500, 'Failed to create template');
    const big = await expectNode('post', '/api/admin/bulk/products/validate', { raw: csvFile(`a\n${'b\n'.repeat(3000000)}`) }, 500, 'Internal server error');
    expect(big.body.keyValueTable.error).toBe('File too large');
    const bad = await expectNode('post', '/api/admin/bulk/products/validate', { raw: multipart([{ name: 'file', filename: 'x.json', type: 'application/json', value: '{}' }]) }, 500, 'Internal server error');
    expect(bad.body.keyValueTable.error).toBe('Only CSV files are allowed');
    const ok = await expectNode('post', '/api/admin/bulk/products/validate', { raw: csvFile(VALID_CSV) }, 200, 'Validation complete');
    expect(ok.body.keyValueTable).toMatchObject({ valid: true, totalRows: 2, warningCount: 1 });
    const up = await expectNode('post', '/api/admin/bulk/products/upload', { raw: csvFile(VALID_CSV) }, 201, 'Bulk upload complete');
    expect(up.body.keyValueTable).toMatchObject({ total: 2, successful: 0, failed: 2 });
    expect(up.body.keyValueTable.errors[0].error).toMatch(/Unknown column/);
    const orders = await call('get', '/api/admin/bulk/orders/export', {});
    expect(orders.text).not.toMatch(/"NaN"/);
    expect((await call('get', '/api/admin/bulk/customers/export', {})).status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // /api/database
  // -------------------------------------------------------------------------
  describe('/api/database', () => {
    test.each([
      ['get', '/api/database/test'],
      ['get', '/api/database/tables'],
      ['get', '/api/database/transno'],
      ['head', '/api/database/test'],
      ['get', '/api/database/TEST/'],
      ['get', '/api/database'],
      ['get', '/api/database/'],
      ['get', '/api/database/nope?x=1'],
      ['post', '/api/database/test'],
      ['get', '/api/database/query'],
      ['put', '/api/database/query'],
      ['get', '/api/database//tables'],
    ])('%s %s as admin', (m, url) => BO.same(m, url, { as: 'admin' }));

    test('a JSON body the parser rejects is a 500 before auth', () => BO.same('post', '/api/database/query', {
      raw: { type: 'application/json', text: '{"query":' }, dropError: true,
    }));

    test('POST /query is disabled without ENABLE_RAW_SQL', async () => {
      const saved = process.env.ENABLE_RAW_SQL;
      delete process.env.ENABLE_RAW_SQL;
      try {
        await BO.same('post', '/api/database/query', { as: 'admin', body: { query: 'SELECT 1' } });
        await BO.same('post', '/api/database/query', { as: 'admin', body: {} });
      } finally {
        if (saved !== undefined) process.env.ENABLE_RAW_SQL = saved;
      }
    });

    test('POST /query is disabled in production even with ENABLE_RAW_SQL=true', async () => {
      const saved = [process.env.NODE_ENV, process.env.ENABLE_RAW_SQL];
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_RAW_SQL = 'true';
      try {
        const node = await BO.call('node', 'post', '/api/database/query', { as: 'admin', body: { query: 'SELECT 1' } });
        const saved2 = BO.rustUrl;
        BO.rustUrl = servers.prod.url;
        const rust = await BO.call('rust', 'post', '/api/database/query', { as: 'admin', body: { query: 'SELECT 1' } }).finally(() => { BO.rustUrl = saved2; });
        // (Rust's production global limiter adds RateLimit-* headers Node's test app skips)
        expect([rust.status, rust.body]).toEqual([node.status, node.body]);
        expect(node.status).toBe(403);
      } finally {
        [process.env.NODE_ENV, process.env.ENABLE_RAW_SQL] = saved;
        if (saved[1] === undefined) delete process.env.ENABLE_RAW_SQL;
      }
    });

    describe('POST /query with NODE_ENV=test and ENABLE_RAW_SQL=true', () => {
      let saved;
      beforeAll(() => { saved = process.env.ENABLE_RAW_SQL; process.env.ENABLE_RAW_SQL = 'true'; });
      afterAll(() => { if (saved === undefined) delete process.env.ENABLE_RAW_SQL; else process.env.ENABLE_RAW_SQL = saved; });
      const raw = (body, opts = {}) => sameAt(servers.raw, 'post', '/api/database/query', { as: 'admin', body, ...opts });

      test.each([
        [{}],
        [[]],
        [{ query: '' }],
        [{ query: 0 }],
        [{ query: null }],
        [{ query: 5 }],
        [{ query: true }],
        [{ query: { sql: 'SELECT 1' } }],
        [{ query: ['SELECT 1'] }],
        [{ query: 'DELETE FROM users' }],
        [{ query: 'UPDATE users SET role = \'admin\' -- a statement that is longer than fifty characters' }],
        [{ query: '  \n\tSELECT 1 AS one' }],
        [{ query: 'SeLeCt 1 AS one' }],
        [{ query: 'selectx' }],
        [{ query: '/* c */ SELECT 1' }],
        [{ query: 'SELECT 1; SELECT 2' }],
        [{ query: 'SELECT * FROM no_such_table' }],
        [{ query: 'SELECT ? AS a', params: ['x'] }],
        [{ query: 'SELECT ? AS a, ? AS b', params: ['x', null] }],
        [{ query: 'SELECT ? AS a', params: [] }],
        [{ query: 'SELECT ? AS a' }],
        [{ query: 'SELECT ? AS a', params: null }],
        [{ query: 'SELECT ? AS a', params: 0 }],
        [{ query: 'SELECT ? AS a', params: 'x' }],
        [{ query: 'SELECT ? AS a', params: { a: 1 } }],
        [{ query: 'SELECT ? AS a', params: true }],
        [{ query: 'SELECT ? AS a, ? AS b', params: ['only one'] }],
        [{ query: 'SELECT ? AS a', params: ['one', 'two', 'three'] }],
        [{ query: 'SELECT 1 AS a', params: ['unused'] }],
        [{ query: 'SELECT ? AS a', params: [['nested', 1]] }],
        [{ query: 'SELECT ? AS a', params: [{ k: 'v' }] }],
        [{ query: 'SELECT ? AS t', params: [true] }],
        [{ query: 'SELECT 1 + 1 AS two, 1 / 3 AS third, NULL AS z, CAST(1.5 AS DOUBLE) AS f, NOW() > \'2000-01-01\' AS b' }],
        [{ query: 'SELECT COUNT(*) AS n, SUM(attempts) AS s FROM email_queue' }],
        [{ query: 'SELECT * FROM email_templates WHERE id = ?', params: ['EMAIL0000000001'] }],
        [{ query: 'SELECT id, sku, base_price, product_details, created_at FROM products ORDER BY id LIMIT 3' }],
        [{ query: 'SELECT * FROM transno ORDER BY prefix LIMIT 5' }],
        [{ query: 'SELECT 1 INTO @parity_x' }],
      ])('%j', (body) => raw(body));

      test('they reach their branches (Node side)', async () => {
        const r = (body) => BO.call('node', 'post', '/api/database/query', { as: 'admin', body });
        expect((await r({ query: 'SELECT 1 AS one' })).body.keyValueTable).toMatchObject({ record_count: 1, results: [{ one: '1' }] });
        expect((await r({ query: 'SELECT ? AS a', params: 'x' })).body.keyValueTable.error).toMatch(/Bind parameters must be array/);
        expect((await r({ query: 'SELECT ? AS a, ? AS b', params: ['x'] })).body.keyValueTable.error).toMatch(/Incorrect arguments/);
        expect((await r({ query: 5 })).body.keyValueTable.error).toBe('query.trim is not a function');
        expect((await r({ query: 'DELETE FROM x' })).status).toBe(403);
      });

      test('urlencoded body', () => raw(undefined, { raw: { type: 'application/x-www-form-urlencoded', text: 'query=SELECT+%3F+AS+a&params[]=v' } }));
      test('staff and customers are still refused', async () => {
        await sameAt(servers.raw, 'post', '/api/database/query', { as: 'staff', body: { query: 'SELECT 1' } });
        await sameAt(servers.raw, 'post', '/api/database/query', { as: 'customer', body: { query: 'SELECT 1' } });
        await sameAt(servers.raw, 'post', '/api/database/query', { body: { query: 'SELECT 1' } });
      });
    });
  });
});
