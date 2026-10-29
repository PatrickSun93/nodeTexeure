#!/usr/bin/env node
/**
 * Create (or promote) a back-office admin — the way to get the first admin onto a
 * production database, which is never seeded.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='S3cure-pass' npm run create-admin
 *
 * An existing account with that email is promoted to admin, reactivated, and its
 * password replaced; its old sessions are revoked (token_version bump).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcryptjs');
const DatabaseUtil = require('../utils/database');

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Set ADMIN_EMAIL to a valid email address.');
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    fail('Set ADMIN_PASSWORD: at least 12 characters with upper-case, lower-case and a digit.');
  }

  const hash = await bcrypt.hash(password, 12);
  const existing = DatabaseUtil.first(await DatabaseUtil.executeQuery('SELECT id FROM users WHERE email = ?', [email]));

  let result;
  if (existing) {
    result = await DatabaseUtil.executeQuery(
      `UPDATE users SET role = 'admin', status = 'active', password_hash = ?, email_verified = 1,
         token_version = token_version + 1
       WHERE id = ?`,
      [hash, existing.id]
    );
  } else {
    const id = DatabaseUtil.first(await DatabaseUtil.executeQuery("SELECT get_next_id('USER') AS id"))?.id;
    result = await DatabaseUtil.executeQuery(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified)
       VALUES (?, ?, ?, 'Admin', 'User', 'admin', 'active', 1)`,
      [id, email, hash]
    );
  }
  if (!result.success) fail(`Database write failed: ${result.error}`);
  console.log(`✅ ${existing ? 'Promoted' : 'Created'} admin ${email}`);
}

main()
  .catch((err) => fail(err.message))
  .finally(() => DatabaseUtil.closePool().catch(() => {}));
