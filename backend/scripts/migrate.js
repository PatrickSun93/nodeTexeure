/**
 * Schema migration runner.
 *
 * Applies backend/migrations/NNN_*.sql in order and records each one in
 * `schema_migrations`, so every environment converges on the same schema:
 *
 *   npm run migrate            # apply pending migrations
 *   npm run migrate -- --status
 *
 * Baseline: docker/mysql/init.sql already contains migrations up to BASELINE_VERSION.
 * When a database has no schema_migrations table yet, those are recorded as applied
 * (not re-run) and only newer migrations execute.
 *
 * Each file runs as one multi-statement batch. MySQL DDL auto-commits, so write
 * migrations that are safe to fix forward; never edit one that has shipped.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const BASELINE_VERSION = 8;

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((file) => ({ version: Number.parseInt(file.slice(0, 3), 10), file }));
}

async function connect() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bed_texture_ecommerce',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
}

async function runMigrations({ log = console.log } = {}) {
  const conn = await connect();
  try {
    const [[{ present }]] = await conn.query(
      `SELECT COUNT(*) AS present FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'`
    );
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const migrations = listMigrations();
    if (!Number(present)) {
      const baseline = migrations.filter((m) => m.version <= BASELINE_VERSION);
      for (const m of baseline) {
        await conn.query('INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.file]);
      }
      log(`📌 Baselined ${baseline.length} migration(s) already present in init.sql`);
    }

    const [rows] = await conn.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => Number(r.version)));
    const pending = migrations.filter((m) => !applied.has(m.version));

    for (const m of pending) {
      log(`⬆️  Applying ${m.file}`);
      await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.file]);
    }
    log(pending.length ? `✅ Applied ${pending.length} migration(s)` : '✅ Schema is up to date');
    return pending.map((m) => m.file);
  } finally {
    await conn.end();
  }
}

async function status() {
  const conn = await connect();
  try {
    const [rows] = await conn.query('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
      .catch(() => [[]]);
    const applied = new Set(rows.map((r) => Number(r.version)));
    for (const m of listMigrations()) {
      console.log(`${applied.has(m.version) ? '✔' : '·'} ${m.file}`);
    }
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  (process.argv.includes('--status') ? status() : runMigrations())
    .catch((err) => {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations, listMigrations, BASELINE_VERSION };
