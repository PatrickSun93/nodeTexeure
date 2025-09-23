const bcrypt = require('bcryptjs');
const DatabaseUtil = require('../backend/utils/database');

async function createAdminUser() {
  try {
    // Check if admin user already exists
    const existingUser = await DatabaseUtil.executeQuery(
      'SELECT id FROM users WHERE email = ?',
      ['admin@bedtexture.com']
    );

    if (existingUser.success && existingUser.data.length > 0) {
      console.log('Admin user already exists');
      return;
    }

    // Hash the password
    const password = 'admin123'; // Change this to a secure password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get next user ID
    const userIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id(?) as id', ['USER']);
    const userId = userIdResult.data[0].id;

    // Create admin user
    await DatabaseUtil.executeQuery(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'admin@bedtexture.com', hashedPassword, 'Admin', 'User', 'admin', 'active', true]
    );

    console.log('Admin user created successfully!');
    console.log('Email: admin@bedtexture.com');
    console.log('Password: admin123');
    console.log('Please change the password after first login.');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    process.exit(0);
  }
}

createAdminUser();