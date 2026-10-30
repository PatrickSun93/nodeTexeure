// Parity of the Rust background worker (rust/crates/api/src/bin/worker.rs,
// src/jobs/*) with the Node jobs it replaces: the expired stock-reservation
// release, abandoned-cart detection and the migration runner. Each job runs
// once on Node and once on Rust over the same kind of data, and the DB effects
// are compared. Also covers the MySQL named locks both sides share
// (utils/jobLock.js), so the two never run a job at the same time.
//
// Needs the worker binary: cd rust && cargo build -p api --bins (or set
// RUST_WORKER_BIN). Skipped without it.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { app, request, DatabaseUtil, registerCustomer, inStockVariant, bearer } = require('./helpers');
const { dbEnv } = require('./parityHelpers');
const InventoryService = require('../services/inventoryService');
const AbandonedCartService = require('../services/abandonedCartService');
const { LOCKS, withJobLock } = require('../utils/jobLock');

const BACKEND_DIR = path.join(__dirname, '..');
const WORKER = process.env.RUST_WORKER_BIN || path.join(BACKEND_DIR, '..', 'rust', 'target', 'debug', 'worker');
const describeWorker = fs.existsSync(WORKER) ? describe : describe.skip;

const childEnv = (extra = {}) => ({
  PATH: process.env.PATH, ...dbEnv(), NODE_ENV: 'test', RUST_LOG: 'warn',
  MIGRATIONS_DIR: path.join(BACKEND_DIR, 'migrations'), ...extra,
});

function run(cmd, args, env = childEnv()) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: BACKEND_DIR, env, timeout: 60000 }, (err, stdout, stderr) => {
      if (err && err.killed) return reject(err);
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

/** `worker once <job>`: its JSON line. */
async function rustOnce(job) {
  const out = await run(WORKER, ['once', job]);
  if (out.code !== 0) throw new Error(`worker once ${job} failed (${out.code}): ${out.stderr}`);
  return JSON.parse(out.stdout.trim());
}

const q = async (sql, params = []) => {
  const r = await DatabaseUtil.executeQuery(sql, params);
  if (!r.success) throw new Error(`${sql}: ${r.error}`);
  return r;
};
const rows = async (sql, params) => DatabaseUtil.rows(await q(sql, params));

// --------------------------------------------------------------------------
// Expired stock reservations
// --------------------------------------------------------------------------

describeWorker('worker: expired stock reservations', () => {
  let item;
  let originalReserved;
  let n = 0;

  beforeAll(async () => {
    item = await inStockVariant(1);
    originalReserved = DatabaseUtil.first(await q(
      'SELECT quantity_reserved FROM inventory WHERE product_id = ? AND variant_id = ?',
      [item.product_id, item.variant_id])).quantity_reserved;
    // Start from no expired reservations at all, so both runs see only ours.
    await InventoryService.releaseExpiredReservations();
  });

  // Our own reservations on the variant: `minutes` < 0 is already expired.
  async function scenario(tag, reservedExtra) {
    await q('UPDATE inventory SET quantity_reserved = ? WHERE product_id = ? AND variant_id = ?',
      [reservedExtra, item.product_id, item.variant_id]);
    const make = [[-90, 2], [-5, 1], [30, 4], [-1, 50]]; // the last one exceeds what is reserved
    const ids = [];
    for (const [minutes, qty] of make) {
      n += 1;
      const id = `ZZRES_${tag}_${n}`;
      ids.push(id);
      await q(`INSERT INTO stock_reservations (id, product_id, variant_id, quantity, expires_at)
               VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [id, item.product_id, item.variant_id, qty, minutes]);
    }
    return ids;
  }

  async function state(ids) {
    const inv = DatabaseUtil.first(await q(
      'SELECT quantity_reserved FROM inventory WHERE product_id = ? AND variant_id = ?',
      [item.product_id, item.variant_id]));
    const left = await rows(`SELECT quantity FROM stock_reservations WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY quantity`, ids);
    return { reserved: Number(inv.quantity_reserved), left: left.map((r) => r.quantity) };
  }

  afterAll(async () => {
    await q("DELETE FROM stock_reservations WHERE id LIKE 'ZZRES\\_%'");
    await q('UPDATE inventory SET quantity_reserved = ? WHERE product_id = ? AND variant_id = ?',
      [originalReserved, item.product_id, item.variant_id]);
  });

  test('same counts, same stock returned, same rows left (clamped at 0)', async () => {
    const nodeIds = await scenario('node', 10);
    const node = await InventoryService.releaseExpiredReservations();
    const nodeState = await state(nodeIds);

    const rustIds = await scenario('rust', 10);
    const rust = await rustOnce('release-reservations');
    const rustState = await state(rustIds);

    expect(node).toEqual({ success: true, data: { released_count: 3, total_expired: 3 } });
    expect(rust).toEqual({ job: 'release-reservations', success: true, data: node.data });
    // 10 - 2 - 1 = 7, then -50 clamps at 0; the unexpired one stays.
    expect(nodeState).toEqual({ reserved: 0, left: [4] });
    expect(rustState).toEqual(nodeState);

    // Nothing left to do: a second run is a no-op on both.
    expect((await InventoryService.releaseExpiredReservations()).data).toEqual({ released_count: 0, total_expired: 0 });
    expect((await rustOnce('release-reservations')).data).toEqual({ released_count: 0, total_expired: 0 });
  });

  test('a run is skipped while the other side holds the lock', async () => {
    const ids = await scenario('lock', 5);
    let rust;
    const held = await withJobLock(LOCKS.releaseReservations, async () => {
      rust = await rustOnce('release-reservations');
    });
    expect(held.ran).toBe(true);
    expect(rust).toEqual({ job: 'release-reservations', success: true, skipped: true });
    expect((await state(ids)).left).toHaveLength(4); // untouched

    const after = await rustOnce('release-reservations');
    expect(after.data.released_count).toBe(3);
  });
});

// --------------------------------------------------------------------------
// Abandoned-cart detection
// --------------------------------------------------------------------------

describeWorker('worker: abandoned-cart detection', () => {
  const service = new AbandonedCartService({ autoStart: false });

  // Idle carts of other test files would be picked up by whichever side runs
  // first; clear them out once.
  beforeAll(async () => { await service.detectAbandonedCarts(); });

  async function abandonedCart({ unsubscribed = false } = {}) {
    const customer = await registerCustomer();
    const item = await inStockVariant(1);
    const add = await request(app).post('/api/cart/add').set(bearer(customer.accessToken))
      .send({ product_id: item.product_id, variant_id: item.variant_id, quantity: 2 });
    expect(add.status).toBeLessThan(300);
    const cart = DatabaseUtil.first(await q(
      'SELECT sc.id FROM shopping_carts sc JOIN users u ON u.id = sc.user_id WHERE u.email = ?', [customer.email]));
    await q('UPDATE shopping_carts SET updated_at = DATE_SUB(NOW(), INTERVAL 45 MINUTE) WHERE id = ?', [cart.id]);
    if (unsubscribed) {
      await q("INSERT INTO email_unsubscribes (id, email, token) VALUES (get_next_id('UNSB'), ?, 'test')", [customer.email]);
    }
    return { email: customer.email, cartId: cart.id };
  }

  // Everything the run wrote for one cart, with the random parts normalized.
  async function effects({ email, cartId }) {
    const recovery = await rows(
      `SELECT id, email, recovery_token, email_sent_count, last_email_sent_at IS NOT NULL AS sent_at_set,
              recovered_at, recovery_order_id, TIMESTAMPDIFF(SECOND, created_at, NOW()) < 120 AS fresh
       FROM abandoned_cart_recovery WHERE cart_id = ?`, [cartId]);
    const emails = await rows(
      `SELECT q.to_email, q.to_name, q.subject, q.status, q.attempts, q.max_attempts, q.template_data,
              q.email_content, TIMESTAMPDIFF(MINUTE, NOW(), q.scheduled_at) AS in_minutes
       FROM email_queue q JOIN email_templates t ON t.id = q.template_id
       WHERE q.to_email = ? AND t.name = 'abandoned_cart' ORDER BY q.scheduled_at`, [email]);
    const token = recovery[0]?.recovery_token;
    const scrub = (s) => String(s)
      .split(email).join('<email>')
      .split(encodeURIComponent(email)).join('<email>')
      .replace(token || '\u0000', '<token>')
      .replace(/token=[\w-]+/g, 'token=<unsub>');
    return {
      recovery: recovery.map((r) => ({
        ...r,
        id: /^RECOVERY_\d{13}_[0-9a-z]{1,9}$/.test(r.id),
        email: scrub(r.email),
        recovery_token: /^[0-9a-f]{64}$/.test(r.recovery_token),
      })),
      emails: emails.map((e) => {
        const data = typeof e.template_data === 'string' ? JSON.parse(e.template_data) : e.template_data;
        return {
          ...e,
          to_email: scrub(e.to_email),
          email_content: scrub(e.email_content),
          // Rounded: the two runs are seconds apart.
          in_minutes: Math.round(Number(e.in_minutes) / 10) * 10,
          template_data: JSON.parse(scrub(JSON.stringify(data))),
        };
      }),
    };
  }

  test('a customer cart: same recovery row and the same 3-email sequence', async () => {
    const a = await abandonedCart();
    const node = await service.detectAbandonedCarts();
    const b = await abandonedCart();
    const rust = await rustOnce('abandoned-carts');

    expect(node).toEqual({ success: true, processedCarts: 1 });
    expect(rust).toEqual({ job: 'abandoned-carts', success: true, data: { processedCarts: 1 } });
    const [en, er] = [await effects(a), await effects(b)];
    expect(en.recovery).toHaveLength(1);
    expect(en.recovery[0]).toMatchObject({ id: true, recovery_token: true, email_sent_count: 3 });
    expect(en.emails).toHaveLength(3);
    expect(en.emails.map((e) => e.in_minutes)).toEqual([60, 1440, 4320]);
    expect(en.emails[0].template_data.recovery_link).toContain('/cart-recovery?recovery=<token>');
    expect(er).toEqual(en);
  });

  test('an unsubscribed customer: a recovery row, no emails, on both', async () => {
    const a = await abandonedCart({ unsubscribed: true });
    await service.detectAbandonedCarts();
    const b = await abandonedCart({ unsubscribed: true });
    await rustOnce('abandoned-carts');
    const [en, er] = [await effects(a), await effects(b)];
    expect(en.recovery[0].email_sent_count).toBe(0);
    expect(en.emails).toEqual([]);
    expect(er).toEqual(en);
  });

  test('a cart already in recovery is not picked again', async () => {
    const a = await abandonedCart();
    expect((await rustOnce('abandoned-carts')).data).toEqual({ processedCarts: 1 });
    expect((await rustOnce('abandoned-carts')).data).toEqual({ processedCarts: 0 });
    expect(await service.detectAbandonedCarts()).toEqual({ success: true, processedCarts: 0 });
    expect((await effects(a)).recovery).toHaveLength(1);
  });

  test('skipped while Node holds the detection lock, and Node skips while Rust would', async () => {
    const a = await abandonedCart();
    let rust;
    const held = await withJobLock(LOCKS.abandonedCarts, async () => {
      rust = await rustOnce('abandoned-carts');
      // Node's own timer path takes the same lock and skips too.
      expect(await withJobLock(LOCKS.abandonedCarts, () => 'ran')).toEqual({ ran: false });
    });
    expect(held.ran).toBe(true);
    expect(rust).toEqual({ job: 'abandoned-carts', success: true, skipped: true });
    expect((await effects(a)).recovery).toEqual([]);
    expect((await rustOnce('abandoned-carts')).data).toEqual({ processedCarts: 1 });
  });
});

// --------------------------------------------------------------------------
// Migrations
// --------------------------------------------------------------------------

describeWorker('worker: migrations', () => {
  // Only the migration lines (dotenv prints a banner on Node's stdout).
  const listing = (out) => out.stdout.split('\n').filter((l) => /^[✔·] /.test(l)).join('\n');
  const nodeStatus = async () => listing(await run(process.execPath, ['scripts/migrate.js', '--status'], childEnv()));
  const rustStatus = async () => listing(await run(WORKER, ['migrate', '--status']));

  test('--status prints the same list as npm run migrate -- --status', async () => {
    const node = await nodeStatus();
    expect(node).toMatch(/✔ 015_email_unsubscribes_exact_email\.sql/);
    expect(await rustStatus()).toBe(node);
  });

  test('applies a pending migration and records it once; then up to date', async () => {
    // 015 is safe to run again (a lowercase UPDATE and the same MODIFY).
    await q('DELETE FROM schema_migrations WHERE version = 15');
    expect(await rustStatus()).toMatch(/· 015_email_unsubscribes_exact_email\.sql/);
    const out = await run(WORKER, ['migrate'], childEnv({ RUST_LOG: 'info' }));
    expect(out.code).toBe(0);
    expect(out.stderr).toMatch(/Applying 015_email_unsubscribes_exact_email\.sql/);
    expect(await rows('SELECT name FROM schema_migrations WHERE version = 15'))
      .toEqual([{ name: '015_email_unsubscribes_exact_email.sql' }]);
    expect(await rustStatus()).toBe(await nodeStatus());

    const again = await run(WORKER, ['migrate'], childEnv({ RUST_LOG: 'info' }));
    expect(again.stderr).toMatch(/Schema is up to date/);
  });

  test('waits for the migration lock held by another runner', async () => {
    const conn = await DatabaseUtil.getConnection();
    try {
      await conn.query('SELECT GET_LOCK(?, 0)', [LOCKS.migrations]);
      const started = Date.now();
      const child = spawn(WORKER, ['migrate'], { cwd: BACKEND_DIR, env: childEnv() });
      const exited = new Promise((resolve) => child.once('exit', resolve));
      await new Promise((r) => setTimeout(r, 1500));
      expect(child.exitCode).toBeNull(); // still waiting
      await conn.query('SELECT RELEASE_LOCK(?)', [LOCKS.migrations]);
      expect(await exited).toBe(0);
      expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
    } finally {
      conn.release();
    }
  });
});
