#!/usr/bin/env node

/**
 * Database Connection Test Script
 * 
 * This script tests the database connection and provides basic diagnostics.
 * 
 * Usage: node test-db-connection.js
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

// Database configuration from .env
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bed_texture_ecommerce'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function testConnection() {
  log('\n🔍 Testing Database Connection...', 'bright');
  log('='.repeat(50), 'cyan');
  
  logInfo(`Host: ${dbConfig.host}:${dbConfig.port}`);
  logInfo(`Database: ${dbConfig.database}`);
  logInfo(`User: ${dbConfig.user}`);
  
  try {
    // Test connection
    const connection = await mysql.createConnection(dbConfig);
    logSuccess('Database connection established');
    
    try {
      // Test basic query
      const [result] = await connection.execute('SELECT 1 as test');
      logSuccess('Basic query executed successfully');
      
      // Get MySQL version
      const [versionResult] = await connection.execute('SELECT VERSION() as version');
      logInfo(`MySQL Version: ${versionResult[0].version}`);
      
      // Check database exists
      const [dbResult] = await connection.execute(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [dbConfig.database]
      );
      
      if (dbResult.length > 0) {
        logSuccess(`Database '${dbConfig.database}' exists`);
        
        // Count tables
        const [tableResult] = await connection.execute(
          'SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ?',
          [dbConfig.database]
        );
        
        const tableCount = tableResult[0].table_count;
        if (tableCount > 0) {
          logSuccess(`Found ${tableCount} tables in database`);
          
          // Check for key tables
          const keyTables = ['users', 'products', 'orders', 'users_logs', 'products_logs'];
          const [existingTables] = await connection.execute(
            `SELECT table_name FROM information_schema.tables 
             WHERE table_schema = ? AND table_name IN (${keyTables.map(() => '?').join(',')})`,
            [dbConfig.database, ...keyTables]
          );
          
          const foundTables = existingTables.map(row => row.table_name || row.TABLE_NAME);
          
          keyTables.forEach(table => {
            if (foundTables.includes(table)) {
              logSuccess(`Table '${table}' exists`);
            } else {
              logWarning(`Table '${table}' not found`);
            }
          });
          
          // Check triggers
          const [triggerResult] = await connection.execute('SHOW TRIGGERS');
          if (triggerResult.length > 0) {
            logSuccess(`Found ${triggerResult.length} database triggers`);
          } else {
            logWarning('No database triggers found');
          }
          
          // Test audit functionality
          try {
            await connection.execute('SET @audit_user_id = ?', ['test_connection']);
            logSuccess('Audit user context set successfully');
          } catch (error) {
            logWarning('Could not set audit user context');
          }
          
        } else {
          logWarning('Database exists but contains no tables');
          logInfo('Run: npm run db:init to initialize the database');
        }
        
      } else {
        logWarning(`Database '${dbConfig.database}' does not exist`);
        logInfo('Run: npm run db:init to create and initialize the database');
      }
      
      // Database size
      const [sizeResult] = await connection.execute(`
        SELECT 
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
        FROM information_schema.tables 
        WHERE table_schema = ?
      `, [dbConfig.database]);
      
      if (sizeResult[0].size_mb) {
        logInfo(`Database size: ${sizeResult[0].size_mb} MB`);
      }
      
    } finally {
      await connection.end();
    }
    
    log('\n🎉 Connection test completed successfully!', 'green');
    
  } catch (error) {
    logError('Connection test failed!');
    
    if (error.code === 'ECONNREFUSED') {
      logError('MySQL server is not running or not accessible');
      logInfo('Solutions:');
      logInfo('  • Start MySQL server: brew services start mysql (macOS)');
      logInfo('  • Start MySQL server: sudo systemctl start mysql (Linux)');
      logInfo('  • Check if MySQL is running on the correct port');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      logError('Access denied - check username and password');
      logInfo('Solutions:');
      logInfo('  • Verify DB_USER and DB_PASSWORD in backend/.env');
      logInfo('  • Check MySQL user permissions');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      logError('Database does not exist');
      logInfo('Solution: Run npm run db:init to create the database');
    } else {
      logError(`Error: ${error.message}`);
    }
    
    log('\n📋 Configuration Check:', 'yellow');
    log(`  Host: ${dbConfig.host}`, 'white');
    log(`  Port: ${dbConfig.port}`, 'white');
    log(`  Database: ${dbConfig.database}`, 'white');
    log(`  User: ${dbConfig.user}`, 'white');
    log(`  Password: ${dbConfig.password ? '[SET]' : '[NOT SET]'}`, 'white');
    
    process.exit(1);
  }
}

async function main() {
  await testConnection();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the test
if (require.main === module) {
  main();
}

module.exports = { testConnection, dbConfig };