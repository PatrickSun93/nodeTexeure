#!/usr/bin/env node
/**
 * Records what the Node side does for the Wave B Rust foundation modules, so
 * the Rust unit tests can require identical output:
 *
 *   csv     backend/utils/csvExporter.js + csvParser.js (papaparse) — export
 *           rows (real seeded rows and edge cases), the product template, and
 *           Papa.parse + validateProducts + transformProductRow on uploads
 *   multer  upload.single('file') (multer 2 / busboy) on raw multipart bodies:
 *           req.file, req.body or the error passed to next(err)
 *   mysql2  rows of a temporary table with every column type, through
 *           connection.execute with backend/utils/database.js's pool options
 *
 * Output: rust/crates/api/fixtures/foundation_b.json. Needs the seeded DB
 * (DB_* env, like the tests). Run from backend/:
 *   DB_HOST=127.0.0.1 DB_PORT=3307 DB_PASSWORD=noirae_dev node scripts/gen-foundation-fixtures.js
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const request = require('supertest');
const DatabaseUtil = require('../utils/database');
const CSVExporter = require('../utils/csvExporter');
const CSVParser = require('../utils/csvParser');

const OUT = path.join(__dirname, '..', '..', 'rust', 'crates', 'api', 'fixtures', 'foundation_b.json');

// JSON the way res.json would send a row (Dates → ISO, Buffers → {type,data}).
const asJson = (v) => JSON.parse(JSON.stringify(v));

async function csvFixtures() {
  const rows = async (sql) => DatabaseUtil.rows(await DatabaseUtil.executeQuery(sql));
  const orders = await rows(`SELECT o.*, u.email as user_email FROM orders o
    LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC, o.id LIMIT 6`);
  const products = await rows('SELECT * FROM products ORDER BY created_at DESC, id LIMIT 6');
  const customers = await rows(`SELECT u.*, COUNT(o.id) as total_orders,
      SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total ELSE 0 END) as lifetime_value
    FROM users u LEFT JOIN orders o ON u.id = o.user_id
    WHERE u.role = 'customer' GROUP BY u.id ORDER BY u.created_at DESC, u.id LIMIT 6`);

  // Edge cases: formula injection, quotes, delimiters, nulls, falsy strings.
  const edgeOrders = [{
    id: '=HYPERLINK("x")', order_number: '+1,2', user_email: '', status: '-x', payment_status: '@sum',
    subtotal: '12.345', discount_amount: null, tax_amount: '0.00', shipping_amount: 'abc', total: '-5.5',
    created_at: new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 6)), shipped_at: null, delivered_at: new Date(Date.UTC(2025, 5, 6)),
  }, {
    id: 'ORD"q"', order_number: ' lead', user_email: 'a@b.c', status: 'trail ', payment_status: 'line\nbreak',
    subtotal: 1.005, discount_amount: '2', tax_amount: 0, shipping_amount: undefined, total: null,
    created_at: '2024-01-01 00:00:00', shipped_at: '', delivered_at: new Date(NaN),
  }];
  const edgeProducts = [{
    id: 'P1', sku: '\tTAB', name: 'Silk "Deluxe", King', slug: 's', category_name: null, base_price: '450.00',
    sale_price: '0.00', stock_quantity: 0, status: 'active', is_active: 0, is_featured: 1, created_at: null,
  }, { id: 'P2', sku: 'X', name: 'Y', slug: 'y', base_price: null, sale_price: null, stock_quantity: null, is_featured: '0' }];
  const edgeCustomers = [{
    id: 'U1', email: '\rcr@x.y', first_name: 'Ann', last_name: null, phone: null, status: 'active',
    email_verified: 0, total_orders: '0', lifetime_value: null, created_at: new Date(0), last_login: null,
  }, { id: 'U2', email: 'b@c.d', total_orders: 3, lifetime_value: '1234.5', email_verified: 1 }];
  const analytics = {
    sales: [{ period: '2024-01', order_count: '3', revenue: '100.456', avg_order_value: null }],
    products: [{ name: '=cmd', times_sold: 2, total_quantity: '4', total_revenue: '9.999', avg_rating: null },
      { name: 'b', times_sold: 0, total_quantity: null, total_revenue: '0', avg_rating: '4.5000' }],
    customers: [{ b: 1, a: '-2', 2: 'two', 1: 'one', c: null, buf: Buffer.from('hi'), when: new Date(Date.UTC(2020, 1, 3)) }],
  };

  // Rows keep their JS types and key order: [[key, value]], a Date as
  // { $date: iso | null } (null = Invalid Date), a Buffer as { $buffer }.
  const typed = (v) => {
    if (v instanceof Date) return { $date: Number.isNaN(v.getTime()) ? null : v.toISOString() };
    if (Buffer.isBuffer(v)) return { $buffer: [...v] };
    return v === undefined ? null : v;
  };
  const exports = [];
  const add = (kind, input, csv) => exports.push({
    kind, rows: input.map((r) => Object.entries(r).map(([k, v]) => [k, typed(v)])), csv,
  });
  add('orders', orders, CSVExporter.exportOrders(orders));
  add('orders', edgeOrders, CSVExporter.exportOrders(edgeOrders));
  add('orders', [], CSVExporter.exportOrders([]));
  add('products', products, CSVExporter.exportProducts(products));
  add('products', edgeProducts, CSVExporter.exportProducts(edgeProducts));
  add('customers', customers, CSVExporter.exportCustomers(customers));
  add('customers', edgeCustomers, CSVExporter.exportCustomers(edgeCustomers));
  add('rows', customers, CSVExporter.export(customers));
  for (const [type, data] of Object.entries(analytics)) add(`analytics:${type}`, data, CSVExporter.exportAnalytics(data, type));

  const template = CSVParser.generateProductTemplate();
  const inputs = [
    template,
    `\ufeffsku,name,base_price,stock_quantity,status\r\nA-1,Sheet,10,5,Active\r\n\r\nb-2,, 3 ,x,gone\r\n`,
    'sku;name;base_price\nX1;"Semi;colon";12.50\nX2;"Quote ""inside""";0x10\n',
    'sku\tname\tbase_price\tslug\nT1\t  Tab Name  \t1e3\t\n',
    ' sku , name ,base_price,name\nS1,One,1,Dup\nS2,Two\nS3,Three,3,x,extra1,extra2\n',
    'sku,name,base_price,description\n"S4","Multi\nline","4","He said ""hi"""\n"S5","Bad"x,5,\n',
    'sku,name,base_price,is_featured,organic,thread_count,weight,material,meta_title\nS6,Name & Co!,  7.5kg,1,true,600 thr,2.5,  Silk  ,\n',
    'just one column\nvalue\n',
    '',
    'sku,name,base_price\r\n"S7","unterminated,9\r\n',
  ];
  const parse = [];
  for (const input of inputs) {
    const parsed = await CSVParser.parse(input);
    const validation = CSVParser.validateProducts(parsed.data);
    const transformed = validation.data.map((row) => {
      const p = CSVParser.transformProductRow(row);
      const { product_details: details, ...rest } = p;
      return { ...rest, product_details: details, details_json: JSON.stringify(details) };
    });
    parse.push({
      input,
      data: asJson(parsed.data),
      errors: parsed.errors.map(({ type, code, message, row }) => ({ type, code, message, ...(row !== undefined && { row }) })),
      delimiter: parsed.meta.delimiter,
      linebreak: parsed.meta.linebreak,
      validation: asJson(validation),
      transformed: asJson(transformed),
    });
  }
  return { exports, template, parse };
}

// ---------------------------------------------------------------------------

const CONFIGS = {
  // bulkOperationsRoutes.js, with a 10-byte fileSize so the limit is testable.
  csv_small: multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
      else cb(new Error('Only CSV files are allowed'));
    },
  }),
  // imageRoutes.js (10 MB).
  image: multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    },
  }),
  // busboy's fieldSize limit (1 MB by default), made small.
  field_small: multer({ storage: multer.memoryStorage(), limits: { fieldSize: 8 } }),
  // No filter, rejecting via `cb(null, false)` for .skip names.
  open: multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => cb(null, !file.originalname.endsWith('.skip')),
  }),
};

function multerApp(upload, field) {
  const app = express();
  app.use(express.json());
  app.post('/u', upload.single(field), (req, res) => {
    const f = req.file && { ...req.file, buffer: req.file.buffer && req.file.buffer.toString('base64') };
    res.json({ file: f || null, body: req.body === undefined ? null : req.body });
  });
  app.use((err, req, res, next) => res.status(500).json({
    error: { message: err.message, code: err.code ?? null, field: err.field ?? null, filename: err.filename ?? null },
  }));
  return app;
}

const B = 'XyZ';
const part = (headers, content) => `--${B}\r\n${headers.join('\r\n')}\r\n\r\n${content}\r\n`;
const fileHdr = (name, filename, type) => [
  `Content-Disposition: form-data; name="${name}"; filename="${filename}"`,
  ...(type ? [`Content-Type: ${type}`] : []),
];
const field = (name, value) => part([`Content-Disposition: form-data; name="${name}"`], value);
const end = `--${B}--\r\n`;

async function multerFixtures() {
  const ct = `multipart/form-data; boundary=${B}`;
  const cases = [
    ['csv_small', 'file', ct, part(fileHdr('file', 'a.csv', 'text/csv'), 'sku,n') + end],
    ['csv_small', 'file', ct, part(fileHdr('file', 'a.txt', 'text/plain'), 'x') + end],
    ['csv_small', 'file', ct, part(fileHdr('file', 'a.txt', 'text/csv'), '0123456789') + end],
    ['csv_small', 'file', ct, part(fileHdr('file', 'a.csv', 'text/csv'), '0123456789A') + end],
    ['csv_small', 'file', ct, part(fileHdr('other', 'a.csv', 'text/csv'), 'x') + end],
    ['csv_small', 'file', ct, part(fileHdr('file', 'a.csv'), '1') + part(fileHdr('file', 'b.csv'), '2') + end],
    ['csv_small', 'file', ct, field('a[b]', '1') + field('a[c][]', '2') + field('a[c][]', '3') + field('n', 'x') + field('n', 'y') + part(fileHdr('file', 'C:\\dir\\p.csv', 'TEXT/CSV; charset=UTF-8'), 'r') + end],
    ['csv_small', 'file', ct, field('only', 'fields') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="file"; filename=""'], 'ignored') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; filename="x.csv"'], 'nameless') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data'], 'nameless field') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="file"; filename*=utf-8\'\'%E2%82%AC.csv'], 'e') + end],
    ['csv_small', 'file', ct, `--${B}\r\nContent-Disposition: form-data; name="file"; filename="\u00c3\u00a9.csv"\r\n\r\nz\r\n` + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="f%22q%0A"'], 'v') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="l1"', 'Content-Type: text/plain; charset=latin1'], '\u00e9') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="u16"', 'Content-Type: text/plain; charset=utf-16le'], 'a\u0000b\u0000') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="x"', 'Content-Type: text/plain; charset=koi8-r'], 'k') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: attachment; name="att"'], 'skipped') + part(['X-Other: 1'], 'no disposition') + end],
    ['csv_small', 'file', ct, part(['Content-Disposition: form-data; name="oct"', 'Content-Type: application/octet-stream'], 'bin') + end],
    ['csv_small', 'file', ct, `preamble\r\n` + field('p', '1') + end + 'epilogue'],
    ['csv_small', 'file', ct, field('a', '1')],
    ['csv_small', 'file', ct, `--${B}\r\n\r\nno headers\r\n` + end],
    ['csv_small', 'file', ct, `--${B}\r\nBad Header\r\n\r\nx\r\n` + end],
    ['csv_small', 'file', ct, `--${B}\r\nContent-Disposition: form-data;\r\n name="folded"\r\n\r\nv\r\n` + end],
    ['csv_small', 'file', ct, ''],
    ['csv_small', 'file', ct, `--${B}--`],
    ['csv_small', 'file', `multipart/form-data; boundary="${B}"`, field('q', 'quoted boundary') + end],
    ['csv_small', 'file', 'multipart/form-data', field('a', '1') + end],
    ['csv_small', 'file', 'multipart/mixed; boundary=XyZ', field('a', '1') + end],
    ['csv_small', 'file', 'multipart/form-data; boundary=', field('a', '1') + end],
    ['csv_small', 'file', 'application/json', '{"a":1}'],
    ['csv_small', 'file', 'text/plain', 'plain'],
    ['image', 'image', ct, part(fileHdr('image', 'p.png', 'image/png'), '\u0089PNG') + end],
    ['image', 'image', ct, part(fileHdr('image', 'p.svg', 'image/svg+xml'), '<svg/>') + end],
    ['image', 'image', ct, part(fileHdr('file', 'p.png', 'image/png'), 'x') + end],
    ['open', 'file', ct, part(fileHdr('file', 'a.skip'), 'skipped') + part(fileHdr('file', 'b.bin'), 'kept') + end],
    ['open', 'file', ct, part(fileHdr('file', 'big.bin'), `${'x'.repeat(5000)}\r\n--${B}x`) + field('after', 'big') + end],
    ['field_small', 'file', ct, field('v', '12345678') + end],
    ['field_small', 'file', ct, field('v', '123456789') + end],
  ];
  const out = [];
  for (const [config, fieldName, contentType, body] of cases) {
    const app = multerApp(CONFIGS[config], fieldName);
    const raw = Buffer.from(body, 'latin1');
    let req = request(app).post('/u');
    if (contentType) req = req.set('Content-Type', contentType);
    const res = await req.send(raw);
    out.push({ config, field: fieldName, contentType, body: raw.toString('base64'), status: res.status, result: res.body });
  }
  return out;
}

// ---------------------------------------------------------------------------

async function mysqlFixtures() {
  const setup = [
    'DROP TABLE IF EXISTS zz_foundation_types',
    `CREATE TABLE zz_foundation_types (
      id INT PRIMARY KEY, ti TINYINT, tb TINYINT(1), tu TINYINT UNSIGNED, si SMALLINT, su SMALLINT UNSIGNED,
      mi MEDIUMINT, ii INT, iu INT UNSIGNED, bi BIGINT, bu BIGINT UNSIGNED, fl FLOAT, db DOUBLE, de DECIMAL(10,2),
      dt DATETIME, dt3 DATETIME(3), dt6 DATETIME(6), ts TIMESTAMP NULL, d DATE, t TIME, t6 TIME(6), y YEAR,
      ch CHAR(3), vc VARCHAR(20), tx TEXT, en ENUM('a','b'), st SET('x','y'), js JSON,
      bn BINARY(2), vb VARBINARY(4), bl BLOB, bt BIT(3), email VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
      code_bin VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `INSERT INTO zz_foundation_types VALUES
      (1, -128, 1, 255, -32768, 65535, -8388608, -2147483648, 4294967295, 9223372036854775807, 18446744073709551615,
       0.1, 0.1, -12345678.90, '2024-02-29 13:05:09', '2024-02-29 13:05:09.123', '2024-02-29 13:05:09.123456',
       '2024-03-01 00:00:00', '1999-12-31', '-838:59:59', '12:00:00.000500', 2024, 'ab', 'héllo €', 'long\\ntext', 'b', 'x,y',
       '{"b": [1, 2.0, 1e2, 12345678901234567890, 9007199254740993], "a": {"z": null, "é": "ü"}, "10": true}',
       X'0001', X'ff', X'deadbeef', b'101', 'Mixed@Case.com', 'Ab'),
      (2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.5, 3, 0, '1970-01-01 00:00:00', NULL, NULL, NULL, '0001-01-01', '00:00:00', NULL,
       1901, '', '', '', 'a', '', '[]', NULL, '', '', b'0', NULL, NULL),
      (3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, -1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, NULL, NULL, 'null', NULL, NULL, NULL, NULL, NULL, NULL)`,
  ];
  const queries = [
    ['SELECT * FROM zz_foundation_types ORDER BY id', []],
    ['SELECT COUNT(*) AS c, SUM(ii) AS s, AVG(si) AS a, MAX(dt) AS m, MIN(d) AS md, SUM(de) AS sd, NOW() IS NOT NULL AS n FROM zz_foundation_types', []],
    ['SELECT id, vc FROM zz_foundation_types WHERE id = ? OR vc = ?', [1, '']],
    ['SELECT ? AS num, ? AS str, ? AS flag, ? AS nil, ? AS frac', [5, 'a', true, null, 2.5]],
    ['SELECT id AS x, ii AS x FROM zz_foundation_types WHERE id = 1', []],
    ['SELECT CAST(1 AS UNSIGNED) AS u, 1 + 1 AS two, 1 / 3 AS third, CONCAT(\'a\', 1) AS s, DATE(\'2024-05-06\') AS d', []],
    ['SELECT * FROM zz_foundation_types WHERE nope = 1', []],
  ];
  const conn = await DatabaseUtil.getConnection();
  try {
    for (const s of setup) await conn.query(s);
    const out = [];
    for (const [sql, params] of queries) {
      try {
        const [rows] = await conn.execute(sql, params);
        out.push({ sql, params, rows: asJson(rows) });
      } catch (err) {
        out.push({ sql, params, rows: null, error: err.message });
      }
    }
    const teardown = 'DROP TABLE IF EXISTS zz_foundation_types';
    await conn.query(teardown);
    return { setup, queries: out, teardown };
  } finally {
    conn.release();
  }
}

(async () => {
  const fixtures = {
    note: 'Generated by backend/scripts/gen-foundation-fixtures.js — do not edit by hand.',
    csv: await csvFixtures(),
    multer: await multerFixtures(),
    mysql2: await mysqlFixtures(),
  };
  fs.writeFileSync(OUT, `${JSON.stringify(fixtures, null, 1)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  await DatabaseUtil.closePool();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
