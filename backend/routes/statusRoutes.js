/**
 * Status Routes
 * Defines routes for health checks, hello endpoints, and database status
 * Direct implementation without services layer
 */

const express = require('express');
const ResponseFormatter = require('../utils/responseFormatter');

const router = express.Router();

/**
 * GET /api/status/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  try {
    const keyValueTable = {
      'port': process.env.PORT || 6666,
      'environment': process.env.NODE_ENV || 'development',
      'uptime': process.uptime() + ' seconds'
    }
    
    const healthStatus = ResponseFormatter.success(
      'Backend server is running',
      keyValueTable
    );
    res.json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    const keyValueTable = {
      'error': error.message
    }
    res.status(500).json(ResponseFormatter.failure(
      'Health check failed',
      keyValueTable
    ));
  }
});

/**
 * GET /api/status/hello
 * Simple hello endpoint
 */
router.get('/hello', (req, res) => {
  try {
    const keyValueTable = [];
    
    const helloMessage = ResponseFormatter.success(
      'Hello from Express backend!',
      keyValueTable
    );
    
    res.json(helloMessage);
  } catch (error) {
    console.error('Hello endpoint error:', error);
    const keyValueTable = [
      { 'error': error.message }
    ];
    res.status(500).json(ResponseFormatter.failure(
      'Failed to get hello message',
      keyValueTable
    ));
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
      const errorTable = [
        { 'error': 'Name is required and must be a non-empty string' },
        { 'provided_name': name || 'N/A' }
      ];
      return res.status(400).json(ResponseFormatter.failure(
        'Invalid name provided',
        errorTable
      ));
    }
    
    const sanitizedName = name.trim();
    const keyValueTable = [
      { 'name': sanitizedName }
    ];
    
    const personalizedHello = ResponseFormatter.success(
      `Hello, ${sanitizedName}! Welcome to the Express backend.`,
      keyValueTable
    );
    
    res.json(personalizedHello);
  } catch (error) {
    console.error('Personalized hello error:', error);
    const keyValueTable = [
      { 'error': error.message },
      { 'provided_name': req.body.name || 'N/A' }
    ];
    res.status(500).json(ResponseFormatter.failure(
      'Failed to get personalized hello message',
      keyValueTable
    ));
  }
});

module.exports = router;