/**
 * Status Routes
 * Defines routes for health checks, hello endpoints, and database status
 * Direct implementation without services layer
 */

const express = require('express');
const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');

const router = express.Router();

/**
 * GET /api/status/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  // Liveness + readiness: 503 when the database is unreachable so container
  // healthchecks and uptime monitors catch a dead DB, not just a dead process.
  const db = await DatabaseUtil.executeQuery('SELECT 1 AS ok');
  const keyValueTable = {
    'port': process.env.PORT || 6666,
    'environment': process.env.NODE_ENV || 'development',
    'uptime': process.uptime() + ' seconds',
    'database': db.success ? 'up' : 'down',
  };
  if (!db.success) {
    console.error('Health check: database unreachable:', db.error);
    return res.status(503).json(ResponseFormatter.failure('Database unreachable', keyValueTable));
  }
  res.json(ResponseFormatter.success('Backend server is running', keyValueTable));
});

/**
 * GET /api/status/hello
 * Simple hello endpoint
 */
router.get('/hello', (req, res) => {
  try {
    res.json(ResponseFormatter.success('Hello from Express backend!'));
  } catch (error) {
    console.error('Hello endpoint error:', error);
    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get hello message', keyValueTable));
  }
});

/**
 * POST /api/status/hello
 * Personalized hello endpoint
 */
router.post('/hello', (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim() === '') {
      const keyValueTable = { 
        error: 'Name is required and must be a non-empty string',
        provided_name: name || 'N/A' 
      };
      return res.status(400).json(ResponseFormatter.failure('Invalid name provided', keyValueTable));
    }
    
    const sanitizedName = name.trim();
    const keyValueTable = { name: sanitizedName };
    
    res.json(ResponseFormatter.success(`Hello, ${sanitizedName}! Welcome to the Express backend.`, keyValueTable));
  } catch (error) {
    console.error('Personalized hello error:', error);
    const keyValueTable = { 
      error: error.message,
      provided_name: req.body.name || 'N/A' 
    };
    res.status(500).json(ResponseFormatter.failure('Failed to get personalized hello message', keyValueTable));
  }
});

module.exports = router;