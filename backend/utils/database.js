/**
 * Database Utility Module
 * Handles MySQL database connections and query execution
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Database configuration from .env
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bed_texture_ecommerce',
  // MySQL2 connection options
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  charset: 'utf8mb4',
  timezone: '+00:00',
  // Pool-specific options
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Global connection pool
let connectionPool = null;

/**
 * Initialize and get the connection pool
 * @returns {Pool} MySQL connection pool
 */
function getConnectionPool() {
  if (!connectionPool) {
    connectionPool = mysql.createPool(dbConfig);
    console.log('Database connection pool created');
  }
  return connectionPool;
}

class DatabaseUtil {
  /**
   * Get a connection from the pool
   * @returns {Promise<Connection>} MySQL connection from pool
   */
  static async getConnection() {
    try {
      const pool = getConnectionPool();
      const connection = await pool.getConnection();
      return connection;
    } catch (error) {
      console.error('Database connection error:', error);
      throw error;
    }
  }

  /**
   * Execute a SQL query with optional parameters and transaction control
   * @param {string} sql - SQL query to execute
   * @param {Array} bindParams - Parameters to bind to the query (default: [])
   * @param {boolean} commit - Whether to commit the transaction (default: true)
   * @returns {Promise<Object>} Query execution result
   */
  static async executeQuery(sql, bindParams = [], commit = true) {
    let connection;
    try {
      connection = await this.getConnection();
      
      // Start transaction if commit is false
      if (!commit) {
        await connection.beginTransaction();
      }
      
      // Execute the query
      const [rows, fields] = await connection.execute(sql, bindParams);
      
      // Commit transaction if required
      if (!commit) {
        await connection.commit();
      }
      
      return {
        success: true,
        data: rows,
        fields: fields,
        affectedRows: rows.affectedRows || 0,
        insertId: rows.insertId || null
      };
    } catch (error) {
      // Rollback transaction on error if transaction was started
      if (!commit && connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('Rollback error:', rollbackError);
        }
      }
      
      return {
        success: false,
        error: error.message,
        code: error.code,
        sqlState: error.sqlState
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Array} queries - Array of query objects with sql and bindParams
   * @returns {Promise<Object>} Transaction execution result
   */
  static async executeTransaction(queries) {
    let connection;
    try {
      connection = await this.getConnection();
      await connection.beginTransaction();
      
      const results = [];
      
      for (const query of queries) {
        const [rows, fields] = await connection.execute(query.sql, query.bindParams || []);
        results.push({
          data: rows,
          fields: fields,
          affectedRows: rows.affectedRows || 0,
          insertId: rows.insertId || null
        });
      }
      
      await connection.commit();
      
      return {
        success: true,
        results: results
      };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('Rollback error:', rollbackError);
        }
      }
      
      return {
        success: false,
        error: error.message,
        code: error.code,
        sqlState: error.sqlState
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Test database connection
   * @returns {Promise<Object>} Connection status and details
   */
  static async testConnection() {
    const testResult = await this.executeQuery('SELECT 1 as test, VERSION() as version');
    
    if (testResult.success) {
      return {
        connected: true,
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        version: testResult.data[0].version,
        databaseExists: true
      };
    } else {
      return {
        connected: false,
        error: testResult.error,
        code: testResult.code
      };
    }
  }

  /**
   * Close the connection pool (for graceful shutdown)
   * @returns {Promise<void>}
   */
  static async closePool() {
    if (connectionPool) {
      await connectionPool.end();
      connectionPool = null;
      console.log('Database connection pool closed');
    }
  }

  /**
   * Get database configuration (without sensitive data)
   * @returns {Object} Database configuration
   */
  static getConfig() {
    return {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      connectionLimit: dbConfig.connectionLimit
    };
  }
}

module.exports = DatabaseUtil;