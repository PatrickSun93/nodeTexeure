const mysql = require('mysql2/promise');
require('dotenv').config();

async function completeStripeMigration() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log('✅ Connected to database');

    // Add missing columns one by one
    const migrations = [
      {
        table: 'payments',
        column: 'stripe_payment_intent_id',
        sql: 'ALTER TABLE payments ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL'
      },
      {
        table: 'orders',
        column: 'payment_status',
        sql: "ALTER TABLE orders ADD COLUMN payment_status ENUM('pending', 'pending_action', 'completed', 'failed', 'canceled') DEFAULT 'pending'"
      },
      {
        table: 'users',
        column: 'stripe_customer_id',
        sql: 'ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL'
      }
    ];

    for (const migration of migrations) {
      try {
        // Check if column exists
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
        `, [process.env.DB_NAME, migration.table, migration.column]);

        if (columns.length === 0) {
          await connection.execute(migration.sql);
          console.log(`✅ Added ${migration.column} to ${migration.table}`);
        } else {
          console.log(`ℹ️  Column ${migration.column} already exists in ${migration.table}`);
        }
      } catch (error) {
        console.error(`❌ Failed to add ${migration.column} to ${migration.table}:`, error.message);
      }
    }

    // Add indexes
    const indexes = [
      {
        table: 'payments',
        name: 'idx_stripe_payment_intent',
        sql: 'ALTER TABLE payments ADD INDEX idx_stripe_payment_intent (stripe_payment_intent_id)'
      },
      {
        table: 'orders',
        name: 'idx_payment_status',
        sql: 'ALTER TABLE orders ADD INDEX idx_payment_status (payment_status)'
      },
      {
        table: 'orders',
        name: 'idx_stripe_payment_intent',
        sql: 'ALTER TABLE orders ADD INDEX idx_stripe_payment_intent (stripe_payment_intent_id)'
      },
      {
        table: 'users',
        name: 'idx_stripe_customer',
        sql: 'ALTER TABLE users ADD INDEX idx_stripe_customer (stripe_customer_id)'
      }
    ];

    for (const index of indexes) {
      try {
        // Check if index exists
        const [indexes_result] = await connection.execute(`
          SELECT INDEX_NAME 
          FROM INFORMATION_SCHEMA.STATISTICS 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
        `, [process.env.DB_NAME, index.table, index.name]);

        if (indexes_result.length === 0) {
          await connection.execute(index.sql);
          console.log(`✅ Added index ${index.name} to ${index.table}`);
        } else {
          console.log(`ℹ️  Index ${index.name} already exists on ${index.table}`);
        }
      } catch (error) {
        console.error(`❌ Failed to add index ${index.name} to ${index.table}:`, error.message);
      }
    }

    console.log('✅ Stripe migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

completeStripeMigration();