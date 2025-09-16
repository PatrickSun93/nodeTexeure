const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function runStripeMigration() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../database/migrations/add_stripe_columns.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('📄 Running Stripe migration...');

    // Split migration into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await connection.execute(statement);
          console.log('✅ Executed:', statement.substring(0, 50) + '...');
        } catch (error) {
          if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
            console.log('ℹ️  Skipped (already exists):', statement.substring(0, 50) + '...');
          } else {
            throw error;
          }
        }
      }
    }

    console.log('✅ Stripe migration completed successfully');

    // Verify the columns were added
    const [paymentColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payments' 
      AND COLUMN_NAME LIKE 'stripe_%'
    `, [process.env.DB_NAME]);

    const [orderColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' 
      AND (COLUMN_NAME = 'payment_status' OR COLUMN_NAME LIKE 'stripe_%')
    `, [process.env.DB_NAME]);

    const [userColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' 
      AND COLUMN_NAME LIKE 'stripe_%'
    `, [process.env.DB_NAME]);

    console.log('📊 Verification Results:');
    console.log('  Payments table Stripe columns:', paymentColumns.map(row => row.COLUMN_NAME));
    console.log('  Orders table new columns:', orderColumns.map(row => row.COLUMN_NAME));
    console.log('  Users table Stripe columns:', userColumns.map(row => row.COLUMN_NAME));

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Columns may already exist. This is normal if migration was run before.');
    } else {
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  runStripeMigration();
}

module.exports = runStripeMigration;