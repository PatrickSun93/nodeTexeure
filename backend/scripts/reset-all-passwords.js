/**
 * Reset All User Passwords Script
 * 
 * This script resets all user passwords in the database to "Password@123"
 * WARNING: This should only be used in development/local environments!
 * 
 * Usage: node scripts/reset-all-passwords.js
 */

const bcrypt = require('bcryptjs');
const DatabaseUtil = require('../utils/database');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const NEW_PASSWORD = 'Password@123';
const SALT_ROUNDS = 10;

async function resetAllPasswords() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to reset every password while NODE_ENV=production.');
    process.exit(1);
  }
  console.log('========================================');
  console.log('Password Reset Script');
  console.log('========================================');
  console.log(`Target password: ${NEW_PASSWORD}`);
  console.log('');

  try {
    // Test database connection
    console.log('Testing database connection...');
    const connectionTest = await DatabaseUtil.testConnection();
    
    if (!connectionTest.connected) {
      console.error('❌ Database connection failed:', connectionTest.error);
      process.exit(1);
    }
    
    console.log('✅ Database connected successfully');
    console.log(`   Host: ${connectionTest.host}`);
    console.log(`   Database: ${connectionTest.database}`);
    console.log('');

    // Get all users
    console.log('Fetching all users from database...');
    const usersResult = await DatabaseUtil.executeQuery(
      'SELECT id, email, first_name, last_name, role FROM users'
    );

    if (!usersResult.success) {
      console.error('❌ Failed to fetch users:', usersResult.error);
      process.exit(1);
    }

    const users = usersResult.data;
    console.log(`✅ Found ${users.length} user(s) in database`);
    console.log('');

    if (users.length === 0) {
      console.log('⚠️  No users found in database. Nothing to reset.');
      process.exit(0);
    }

    // Display users that will be updated
    console.log('Users to be updated:');
    console.log('----------------------------------------');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.first_name} ${user.last_name}) - Role: ${user.role}`);
    });
    console.log('----------------------------------------');
    console.log('');

    // Hash the new password
    console.log('Hashing new password...');
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, SALT_ROUNDS);
    console.log('✅ Password hashed successfully');
    console.log('');

    // Update all users
    console.log('Updating passwords...');
    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE users SET password_hash = ?',
      [hashedPassword]
    );

    if (!updateResult.success) {
      console.error('❌ Failed to update passwords:', updateResult.error);
      process.exit(1);
    }

    console.log(`✅ Successfully updated ${updateResult.affectedRows} user(s)`);
    console.log('');

    // Verify the update
    console.log('Verifying password updates...');
    const verifyResult = await DatabaseUtil.executeQuery(
      'SELECT id, email FROM users LIMIT 1'
    );

    if (verifyResult.success && verifyResult.data.length > 0) {
      // Test password verification
      const testUser = verifyResult.data[0];
      const testResult = await DatabaseUtil.executeQuery(
        'SELECT password_hash FROM users WHERE id = ?',
        [testUser.id]
      );

      if (testResult.success && testResult.data.length > 0) {
        const storedHash = testResult.data[0].password_hash;
        const isValid = await bcrypt.compare(NEW_PASSWORD, storedHash);
        
        if (isValid) {
          console.log('✅ Password verification successful');
          console.log(`   Tested with user: ${testUser.email}`);
        } else {
          console.error('❌ Password verification failed!');
          process.exit(1);
        }
      }
    }

    console.log('');
    console.log('========================================');
    console.log('✅ Password reset completed successfully!');
    console.log('========================================');
    console.log('');
    console.log(`All ${users.length} user(s) can now login with:`);
    console.log(`   Password: ${NEW_PASSWORD}`);
    console.log('');
    console.log('⚠️  WARNING: This is a development script.');
    console.log('   Do NOT use this in production!');
    console.log('');

    // Close database connection
    await DatabaseUtil.closePool();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during password reset:', error);
    await DatabaseUtil.closePool();
    process.exit(1);
  }
}

// Run the script
resetAllPasswords();

