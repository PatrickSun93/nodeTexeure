#!/usr/bin/env node
/**
 * Deprecated: Legacy Admin Password Reset Script
 * - This script targeted the deprecated admin dashboard user (admin@example.com).
 * - Internal operations tools now provide RBAC-protected password reset flows.
 * - If you must reset a specific user's password, use generic user reset tooling or run a targeted DB update with proper audit controls.
 */

const path = require('path');
const bcrypt = require('bcryptjs');
const DatabaseUtil = require('../utils/database');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const NEW_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function resetAdminPassword() {
  console.log('--- Reset Admin Password ---');
  console.log(`Target email: ${ADMIN_EMAIL}`);

  try {
    // Find admin user by email
    const findRes = await DatabaseUtil.executePrepared(
      'SELECT id, email, role, status, password_hash FROM users WHERE email = ? LIMIT 1',
      [ADMIN_EMAIL]
    );

    if (!findRes.success) {
      throw new Error(`DB query failed: ${findRes.error || 'unknown error'}`);
    }

    if (!findRes.data || findRes.data.length === 0) {
      console.error('Admin user not found. Aborting without changes.');
      return process.exit(2);
    }

    const user = findRes.data[0];
    console.log(`User found: id=${user.id}, role=${user.role}, status=${user.status}`);

    // Compare current hash to desired password
    const isAlreadyCorrect = await bcrypt.compare(NEW_PASSWORD, user.password_hash);
    if (isAlreadyCorrect) {
      console.log('Password already set to the desired value. No update needed.');
      return process.exit(0);
    }

    // Hash new password and update
    const saltRounds = 10;
    const newHash = await bcrypt.hash(NEW_PASSWORD, saltRounds);

    const updateRes = await DatabaseUtil.executePrepared(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [newHash, user.id]
    );

    if (!updateRes.success) {
      throw new Error(`Update failed: ${updateRes.error || 'unknown error'}`);
    }

    console.log('Password updated successfully.');
    return process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    return process.exit(1);
  } finally {
    try {
      await DatabaseUtil.closePool();
    } catch (_) {}
  }
}

resetAdminPassword();