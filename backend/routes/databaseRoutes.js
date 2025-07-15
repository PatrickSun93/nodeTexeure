/**
 * Database Routes
 * Defines routes for database operations and testing
 */

const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

const router = express.Router();

/**
 * GET /api/database/test
 * Test database connection
 */
router.get('/test', async (req, res) => {
  try {
    const result = await DatabaseUtil.testConnection();
    const keyValueTable = {
      connected: result.connected,
      host: result.host,
      port: result.port,
      database: result.database,
      user: result.user,
      version: result.version,
      databaseExists: result.databaseExists
    };
    
    res.json(ResponseFormatter.success(
      'Database connection test completed',
      keyValueTable
    ));
  } catch (error) {
    console.error('Database test error:', error);
    const keyValueTable = [
      { 'error': error.message }
    ];
    
    res.status(500).json(ResponseFormatter.failure(
      'Database connection test failed',
      keyValueTable
    ));
  }
});

/**
 * GET /api/database/tables
 * Get table count information
 */
router.get('/tables', async (req, res) => {
  try {
    // Get table count
    const countResult = await DatabaseUtil.executeQuery(
      'SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ?',
      [process.env.DB_NAME || 'bed_texture_ecommerce']
    );
    
    // Get table list
    const tablesResult = await DatabaseUtil.executeQuery(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
      [process.env.DB_NAME || 'bed_texture_ecommerce']
    );
    console.log(tablesResult);
    console.log(countResult)
    if (countResult.success && tablesResult.success) {
      const tables = tablesResult.data.map(row => row.table_name || row.TABLE_NAME);
      const keyValueTable = [
        { 'success': true },
        { 'count': countResult.data[0].table_count },
        { 'tables': tables }
      ];
    
    res.json(ResponseFormatter.success(
      'Table count retrieved successfully',
      keyValueTable
    ));
    } else {
      const keyValueTable = [
        { 'success': false },
        { 'error': 'Failed to retrieve table information' }
      ];
      
      res.status(500).json(ResponseFormatter.failure(
        'Failed to get table count',
        keyValueTable
      ));
    }
  } catch (error) {
    console.error('Table count error:', error);
    const keyValueTable = [
      { 'error': error.message }
    ];
    
    res.status(500).json(ResponseFormatter.failure(
      'Failed to get table count',
      keyValueTable
    ));
  }
});

/**
 * GET /api/database/transno
 * Get transno table data
 */
router.get('/transno', async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('SELECT * FROM transno');
    
    let keyValueTable;
    if (result.success) {
      // Convert result data to key-value pairs
      if (Array.isArray(result.data) && result.data.length > 0) {
        keyValueTable = Object.entries(result.data[0]).map(([key, value]) => ({ [key]: value }));
      } else {
        keyValueTable = [{ 'message': 'No data found in transno table' }];
      }
    } else {
      keyValueTable = [{ 'error': result.error }];
    }
    
    // keyValueTable already contains the data
    
    res.json(ResponseFormatter.success(
      'Transno data retrieved successfully',
      keyValueTable
    ));
  } catch (error) {
    console.error('Transno data error:', error);
    const keyValueTable = [
      { 'error': error.message }
    ];
    
    res.status(500).json(ResponseFormatter.failure(
      'Failed to get transno data',
      keyValueTable
    ));
  }
});

/**
 * POST /api/database/query
 * Execute custom query (for testing purposes)
 */
router.post('/query', async (req, res) => {
  try {
    const { query, params = [] } = req.body;
    
    if (!query) {
      const keyValueTable = [
        { 'error': 'Query parameter is required' }
      ];
      return res.status(400).json(ResponseFormatter.failure(
        'Query is required',
        keyValueTable
      ));
    }
    
    // Basic security check - only allow SELECT queries
    if (!query.trim().toLowerCase().startsWith('select')) {
      const keyValueTable = [
        { 'error': 'Only SELECT queries are allowed for security reasons' },
        { 'provided_query': query.substring(0, 50) + '...' }
      ];
      return res.status(403).json(ResponseFormatter.failure(
        'Only SELECT queries are allowed',
        keyValueTable
      ));
    }
    
    const result = await DatabaseUtil.executeQuery(query, params);
    let keyValueTable = [];
    
    if (Array.isArray(result)) {
      keyValueTable = [
        { 'query': query },
        { 'record_count': result.length },
        { 'results': result }
      ];
    } else {
      keyValueTable = [
        { 'query': query },
        { 'success': result.success || true },
        { 'data': result.data || result }
      ];
    }
    
    // keyValueTable already contains the data
    
    res.json(ResponseFormatter.success(
      'Query executed successfully',
      keyValueTable
    ));
  } catch (error) {
    console.error('Query execution error:', error);
    const keyValueTable = [
      { 'error': error.message },
      { 'query': req.body.query || 'N/A' }
    ];
    
    res.status(500).json(ResponseFormatter.failure(
      'Query execution failed',
      keyValueTable
    ));
  }
});

module.exports = router;