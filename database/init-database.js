#!/usr/bin/env node

/**
 * Database Initialization Script
 * 
 * This script initializes the MySQL database with:
 * - All tables from database_schema.sql
 * - Audit log tables and triggers
 * - Initial data and views
 * 
 * Usage: node init-database.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

// Database configuration from .env
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'change_me_local_mysql_password',
  database: process.env.DB_NAME || 'bed_texture_ecommerce',
  multipleStatements: true
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function createDatabaseIfNotExists() {
  const connectionConfig = { ...dbConfig };
  delete connectionConfig.database; // Connect without specifying database
  
  const connection = await mysql.createConnection(connectionConfig);
  
  try {
    logStep('1', 'Checking if database exists...');
    
    const [rows] = await connection.execute(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [dbConfig.database]
    );
    
    if (rows.length === 0) {
      logStep('1', `Creating database '${dbConfig.database}'...`);
      await connection.execute(`CREATE DATABASE \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      logSuccess(`Database '${dbConfig.database}' created successfully`);
    } else {
      logSuccess(`Database '${dbConfig.database}' already exists`);
    }
  } finally {
    await connection.end();
  }
}

function parseSQL(sqlContent) {
  const statements = [];
  let currentStatement = '';
  let inDelimiterBlock = false;
  let customDelimiter = ';';
  
  const lines = sqlContent.split('\n');
  
  for (let line of lines) {
    line = line.trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('--')) {
      continue;
    }
    
    // Handle DELIMITER changes
    if (line.startsWith('DELIMITER')) {
      const parts = line.split(/\s+/);
      if (parts.length > 1) {
        customDelimiter = parts[1];
        inDelimiterBlock = customDelimiter !== ';';
      }
      continue;
    }
    
    // Add line to current statement
    currentStatement += (currentStatement ? '\n' : '') + line;
    
    // Check if statement is complete
    if (line.endsWith(customDelimiter)) {
      // Remove the delimiter from the end
      currentStatement = currentStatement.slice(0, -customDelimiter.length).trim();
      
      if (currentStatement) {
        statements.push(currentStatement);
      }
      
      currentStatement = '';
      
      // Reset delimiter if we just finished a delimiter block
      if (inDelimiterBlock && customDelimiter !== ';') {
        customDelimiter = ';';
        inDelimiterBlock = false;
      }
    }
  }
  
  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }
  
  return statements;
}

async function executeSQLFile(connection, filePath, description) {
  try {
    logStep('2', `Reading ${description}...`);
    const sqlContent = await fs.readFile(filePath, 'utf8');

    logStep('2', `Executing ${description}...`);

    // Parse SQL content properly handling DELIMITER blocks
    const statements = parseSQL(sqlContent);

    let executedCount = 0;
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          // Execute each statement individually
          await connection.query(statement);
          executedCount++;
        } catch (error) {
          // Handle specific errors that are expected during re-runs
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
              error.code === 'ER_DUP_KEYNAME' ||
              error.code === 'ER_SP_ALREADY_EXISTS' ||
              error.code === 'ER_DUP_ENTRY' ||
              error.message.includes('already exists') ||
              error.message.includes('Duplicate key name') ||
              error.message.includes('Duplicate entry')) {
            logWarning(`Skipping statement (already exists): ${statement.substring(0, 50)}...`);
            continue;
          } else {
            logError(`Error in statement: ${statement.substring(0, 100)}...`);
            throw error;
          }
        }
      }
    }

    logSuccess(`${description} executed successfully (${executedCount} statements)`);
  } catch (error) {
    logError(`Error executing ${description}: ${error.message}`);
    throw error;
  }
}

async function verifyTables(connection) {
  logStep('3', 'Verifying table creation...');
  
  const [tables] = await connection.execute('SHOW TABLES');
  const tableNames = tables.map(row => Object.values(row)[0]);
  
  const expectedTables = [
    'users', 'user_addresses', 'categories', 'products', 'product_variants',
    'product_images', 'product_reviews', 'product_bundles', 'bundle_items',
    'inventory', 'stock_reservations', 'inventory_movements',
    'shopping_carts', 'cart_items', 'orders', 'order_items', 'order_status_history',
    'payments', 'payment_methods', 'refunds', 'discount_codes', 'discount_code_usage',
    'email_templates', 'email_queue', 'system_settings', 'audit_logs'
  ];
  
  const auditTables = expectedTables.map(table => `${table}_logs`);
  const allExpectedTables = [...expectedTables, ...auditTables];
  
  const missingTables = allExpectedTables.filter(table => !tableNames.includes(table));
  
  if (missingTables.length > 0) {
    logWarning(`Missing tables: ${missingTables.join(', ')}`);
  } else {
    logSuccess(`All ${allExpectedTables.length} tables created successfully`);
  }
  
  log(`\nCreated tables (${tableNames.length}):`, 'blue');
  tableNames.sort().forEach(table => {
    const isAuditTable = table.endsWith('_logs');
    log(`  ${isAuditTable ? '📋' : '📊'} ${table}`, isAuditTable ? 'yellow' : 'cyan');
  });
}

async function verifyTriggers(connection) {
  logStep('4', 'Verifying triggers...');
  
  const [triggers] = await connection.execute('SHOW TRIGGERS');
  
  if (triggers.length > 0) {
    logSuccess(`${triggers.length} triggers created successfully`);
    log('\nCreated triggers:', 'blue');
    triggers.forEach(trigger => {
      log(`  🔄 ${trigger.Trigger} (${trigger.Event} on ${trigger.Table})`, 'magenta');
    });
  } else {
    logWarning('No triggers found');
  }
}

async function insertInitialData(connection) {
  logStep('5', 'Inserting initial system data...');
  
  try {
    // Insert initial system settings
    await connection.execute(`
      INSERT IGNORE INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, is_public) VALUES
      ('SYS001', 'site_name', 'Bed Texture E-commerce', 'string', JSON_OBJECT('description', 'Website name'), true),
      ('SYS002', 'currency', 'USD', 'string', JSON_OBJECT('symbol', '$', 'code', 'USD'), true),
      ('SYS003', 'tax_rate', '0.08', 'decimal', JSON_OBJECT('description', 'Default tax rate'), true),
      ('SYS004', 'free_shipping_threshold', '100.00', 'decimal', JSON_OBJECT('currency', 'USD'), true),
      ('SYS005', 'max_cart_items', '50', 'integer', JSON_OBJECT('description', 'Maximum items per cart'), false)
    `);
    
    // Insert default categories
    await connection.execute(`
      INSERT IGNORE INTO categories (id, name, slug, description, sort_order, is_active) VALUES
      ('cat_001', 'Bed Sheets', 'bed-sheets', 'Premium quality bed sheets in various materials and sizes', 1, true),
      ('cat_002', 'Pillowcases', 'pillowcases', 'Comfortable pillowcases to match your bedding', 2, true),
      ('cat_003', 'Duvet Covers', 'duvet-covers', 'Stylish duvet covers for a complete bedroom look', 3, true),
      ('cat_004', 'Blankets', 'blankets', 'Cozy blankets for warmth and comfort', 4, true)
    `);
    
    // Insert default email templates
    await connection.execute(`
      INSERT IGNORE INTO email_templates (id, name, subject, template_content, is_active) VALUES
      ('EMAIL001', 'Welcome Email', 'Welcome to {{site_name}}!', 
       JSON_OBJECT('html', '<h1>Welcome {{first_name}}!</h1><p>Thank you for joining us.</p>', 'text', 'Welcome {{first_name}}! Thank you for joining us.'),
       true),
      ('EMAIL002', 'Order Confirmation', 'Order Confirmation - {{order_number}}',
       JSON_OBJECT('html', '<h1>Order Confirmed</h1><p>Your order {{order_number}} has been confirmed.</p>', 'text', 'Your order {{order_number}} has been confirmed.'),
       true)
    `);
    
    logSuccess('Initial system data inserted');
  } catch (error) {
    logError(`Error inserting initial data: ${error.message}`);
    throw error;
  }
}

async function showDatabaseInfo(connection) {
  log('\n' + '='.repeat(60), 'bright');
  log('DATABASE INITIALIZATION COMPLETE', 'bright');
  log('='.repeat(60), 'bright');
  
  log(`\n📊 Database: ${dbConfig.database}`, 'cyan');
  log(`🏠 Host: ${dbConfig.host}:${dbConfig.port}`, 'cyan');
  log(`👤 User: ${dbConfig.user}`, 'cyan');
  
  // Get database size
  const [sizeResult] = await connection.execute(`
    SELECT 
      ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
    FROM information_schema.tables 
    WHERE table_schema = ?
  `, [dbConfig.database]);
  
  log(`💾 Size: ${sizeResult[0].size_mb} MB`, 'cyan');
  
  log('\n🚀 Next Steps:', 'green');
  log('  1. Start your backend server: npm run dev (in backend folder)', 'white');
  log('  2. Test database connection in your application', 'white');
  log('  3. Begin adding your business data', 'white');
  
  log('\n📚 Documentation:', 'blue');
  log('  • Database Schema: database_schema.sql', 'white');
  log('  • Audit System: AUDIT_SYSTEM.md', 'white');
  log('  • JSON System: JSON_SYSTEM.md', 'white');
  log('  • Database Design: DATABASE_DESIGN.md', 'white');
}

async function main() {
  log('\n🚀 Starting Database Initialization...', 'bright');
  log(`Database: ${dbConfig.database}`, 'cyan');
  log(`Host: ${dbConfig.host}:${dbConfig.port}`, 'cyan');
  
  try {
    // Step 1: Create database if it doesn't exist
    await createDatabaseIfNotExists();
    
    // Step 2: Connect to the database
    logStep('2', 'Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);
    logSuccess('Connected to database');
    
    try {
      // Step 3: Execute schema file
      const schemaPath = path.join(__dirname, 'database_schema.sql');
      await executeSQLFile(connection, schemaPath, 'database schema');
      
      // Step 4: Verify tables
      await verifyTables(connection);
      
      // Step 5: Verify triggers
      await verifyTriggers(connection);
      
      // Step 6: Insert initial data
      await insertInitialData(connection);
      
      // Step 7: Show completion info
      await showDatabaseInfo(connection);
      
    } finally {
      await connection.end();
    }
    
  } catch (error) {
    logError(`Database initialization failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the initialization
if (require.main === module) {
  main();
}

module.exports = { main, dbConfig };