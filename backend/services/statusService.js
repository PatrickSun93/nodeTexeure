/**
 * Status Service
 * Handles health checks, hello endpoints, and database status
 */

const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');

class StatusService {
  /**
   * Get server health status
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    const keyValueTable = { 'port': process.env.PORT || 6666 }

    
    return ResponseFormatter.success('Backend server is running', keyValueTable);
  }

  /**
   * Get hello message
   * @returns {Object} Hello message
   */
  getHelloMessage() {
    return ResponseFormatter.success('Hello from Express backend!', []);
  }

  /**
   * Get personalized hello message
   * @param {string} name - Name to greet
   * @returns {Object} Personalized hello message
   */
  getPersonalizedHello(name) {
    const keyValueTable = 
    {
      'name': name || 'World'
    }
    
    return ResponseFormatter.success(`Hello ${name || 'World'} from Express backend!`, keyValueTable);
  }

  /**
   * Get database connection status
   * @returns {Promise<Object>} Database connection status
   */
  async getDatabaseStatus() {
    try {
      const connectionStatus = await DatabaseUtil.testConnection();
      
      if (connectionStatus.connected) {
        const keyValueTable = 
        {
          'host': connectionStatus.host,
          'port': connectionStatus.port,
          'database': connectionStatus.database,
          'user': connectionStatus.user,
          'version': connectionStatus.version,
          'database_exists': connectionStatus.databaseExists
        }
        
        return ResponseFormatter.success('Database connection successful', keyValueTable);
      } else {
        
        return ResponseFormatter.failure('Database connection failed', []);
      }
    } catch (error) {
      return ResponseFormatter.failure('Database status check failed', []);
    }
  }

  /**
   * Get database table count
   * @returns {Promise<Object>} Table count and list
   */
  async getTableCount() {
    try {
      const tableInfo = await DatabaseUtil.getTableCount();
      
      if (tableInfo.success) {
        const keyValueTable = 
        {
          'table_count': tableInfo.count,
          'tables': tableInfo.tables.join(', ')
        }
        
        return ResponseFormatter.success('Table count retrieved successfully', keyValueTable);
      } else {
        return ResponseFormatter.failure('Failed to get table count', []);
      }
    } catch (error) {
      
      return ResponseFormatter.failure('Table count check failed', []);
    }
  }

  /**
   * Get all rows from transno table
   * @returns {Promise<Object>} Transno table data
   */
  async getTransnoData() {
    try {
      const transnoInfo = await DatabaseUtil.getTransnoData();
      
      if (transnoInfo.success) {
        const keyValueTable = 
        {
          'row_count': transnoInfo.count,
          'data': transnoInfo.data
        }
        
        return ResponseFormatter.success('Transno data retrieved successfully', keyValueTable);
      } else {
        
        
        return ResponseFormatter.failure('Failed to get transno data', []);
      }
    } catch (error) {
      return ResponseFormatter.failure('Transno data check failed', []);
    }
  }
}

module.exports = new StatusService();