/**
 * Status Routes
 * Defines routes for health checks and hello endpoints
 */

const express = require('express');
const statusService = require('../services/statusService');

const router = express.Router();

/**
 * GET /api/status/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  try {
    const healthStatus = statusService.getHealthStatus();
    res.json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/hello
 * Simple hello endpoint
 */
router.get('/hello', (req, res) => {
  try {
    const helloMessage = statusService.getHelloMessage();
    res.json(helloMessage);
  } catch (error) {
    console.error('Hello endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get hello message',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/status/hello
 * Personalized hello endpoint
 */
router.post('/hello', (req, res) => {
  try {
    const { name } = req.body;
    const personalizedHello = statusService.getPersonalizedHello(name);
    res.json(personalizedHello);
  } catch (error) {
    console.error('Personalized hello error:', error);
    res.status(500).json({
      error: 'Failed to get personalized hello message',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;