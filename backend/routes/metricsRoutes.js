const express = require('express');
const router = express.Router();
const { register } = require('../middleware/metricsMiddleware');

// Metrics endpoint for Prometheus
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Readiness check endpoint
router.get('/ready', async (req, res) => {
  try {
    // Check database connection
    const db = require('../utils/database');
    await db.query('SELECT 1');
    
    // Check Redis connection
    const redis = require('../utils/cacheManager');
    await redis.ping();
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'healthy',
        redis: 'healthy'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;