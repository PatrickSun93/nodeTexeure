/**
 * Performance Monitoring Routes
 * Provides endpoints for monitoring system performance and cache statistics
 */

const express = require('express');
const router = express.Router();
const PerformanceMiddleware = require('../middleware/performanceMiddleware');
const cacheManager = require('../utils/cacheManager');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

/**
 * GET /api/performance/stats
 * Get comprehensive performance statistics
 */
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const stats = PerformanceMiddleware.getPerformanceStats();
    
    res.json(ResponseFormatter.success('Performance statistics retrieved', stats));
  } catch (error) {
    logger.error('Error getting performance stats:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get performance statistics'));
  }
});

/**
 * GET /api/performance/cache
 * Get cache statistics and management
 */
router.get('/cache', protect, admin, async (req, res) => {
  try {
    const cacheStats = cacheManager.getStats();
    
    res.json(ResponseFormatter.success('Cache statistics retrieved', cacheStats));
  } catch (error) {
    logger.error('Error getting cache stats:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get cache statistics'));
  }
});

/**
 * GET /api/performance/cache/:type
 * Get specific cache type statistics
 */
router.get('/cache/:type', protect, admin, async (req, res) => {
  try {
    const { type } = req.params;
    const cacheStats = cacheManager.getStats(type);
    
    if (!cacheStats) {
      return res.status(404).json(ResponseFormatter.failure('Cache type not found'));
    }
    
    res.json(ResponseFormatter.success(`Cache statistics for ${type}`, cacheStats));
  } catch (error) {
    logger.error('Error getting cache type stats:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get cache type statistics'));
  }
});

/**
 * DELETE /api/performance/cache/:type
 * Clear specific cache type
 */
router.delete('/cache/:type', protect, admin, async (req, res) => {
  try {
    const { type } = req.params;
    
    cacheManager.clear(type);
    
    logger.info(`Cache cleared by admin: ${type}`, {
      adminId: req.user.id,
      adminEmail: req.user.email
    });
    
    res.json(ResponseFormatter.success(`Cache ${type} cleared successfully`));
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to clear cache'));
  }
});

/**
 * DELETE /api/performance/cache
 * Clear all caches
 */
router.delete('/cache', protect, admin, async (req, res) => {
  try {
    cacheManager.clearAll();
    
    logger.info('All caches cleared by admin', {
      adminId: req.user.id,
      adminEmail: req.user.email
    });
    
    res.json(ResponseFormatter.success('All caches cleared successfully'));
  } catch (error) {
    logger.error('Error clearing all caches:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to clear all caches'));
  }
});

/**
 * POST /api/performance/cache/invalidate
 * Invalidate cache entries by pattern
 */
router.post('/cache/invalidate', protect, admin, async (req, res) => {
  try {
    const { pattern, cacheType = 'api' } = req.body;
    
    if (!pattern) {
      return res.status(400).json(ResponseFormatter.failure('Pattern is required'));
    }
    
    cacheManager.invalidatePattern(cacheType, pattern);
    
    logger.info('Cache pattern invalidated by admin', {
      pattern,
      cacheType,
      adminId: req.user.id,
      adminEmail: req.user.email
    });
    
    res.json(ResponseFormatter.success(`Cache pattern ${pattern} invalidated successfully`));
  } catch (error) {
    logger.error('Error invalidating cache pattern:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to invalidate cache pattern'));
  }
});

/**
 * GET /api/performance/database
 * Get database performance statistics
 */
router.get('/database', protect, admin, async (req, res) => {
  try {
    const dbStats = DatabaseUtil.getPoolStats();
    const dbConfig = DatabaseUtil.getConfig();
    
    const stats = {
      connectionPool: dbStats,
      configuration: dbConfig,
      performance: {
        poolUtilization: ((dbStats.totalConnections - dbStats.freeConnections) / dbStats.connectionLimit * 100).toFixed(2) + '%',
        availableConnections: dbStats.freeConnections,
        activeConnections: dbStats.totalConnections - dbStats.freeConnections
      }
    };
    
    res.json(ResponseFormatter.success('Database statistics retrieved', stats));
  } catch (error) {
    logger.error('Error getting database stats:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get database statistics'));
  }
});

/**
 * GET /api/performance/database/test
 * Test database connection and performance
 */
router.get('/database/test', protect, admin, async (req, res) => {
  try {
    const startTime = Date.now();
    const connectionTest = await DatabaseUtil.testConnection();
    const responseTime = Date.now() - startTime;
    
    const result = {
      ...connectionTest,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };
    
    res.json(ResponseFormatter.success('Database connection test completed', result));
  } catch (error) {
    logger.error('Error testing database connection:', error);
    res.status(500).json(ResponseFormatter.failure('Database connection test failed'));
  }
});

/**
 * GET /api/performance/memory
 * Get memory usage statistics
 */
router.get('/memory', protect, admin, async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const stats = {
      rss: {
        bytes: memUsage.rss,
        mb: Math.round(memUsage.rss / 1024 / 1024)
      },
      heapTotal: {
        bytes: memUsage.heapTotal,
        mb: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      heapUsed: {
        bytes: memUsage.heapUsed,
        mb: Math.round(memUsage.heapUsed / 1024 / 1024)
      },
      external: {
        bytes: memUsage.external,
        mb: Math.round(memUsage.external / 1024 / 1024)
      },
      heapUtilization: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2) + '%',
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version
    };
    
    res.json(ResponseFormatter.success('Memory statistics retrieved', stats));
  } catch (error) {
    logger.error('Error getting memory stats:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get memory statistics'));
  }
});

/**
 * POST /api/performance/gc
 * Trigger garbage collection (if enabled)
 */
router.post('/gc', protect, admin, async (req, res) => {
  try {
    if (global.gc) {
      const beforeMemory = process.memoryUsage();
      global.gc();
      const afterMemory = process.memoryUsage();
      
      const result = {
        triggered: true,
        before: {
          heapUsed: Math.round(beforeMemory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(beforeMemory.heapTotal / 1024 / 1024)
        },
        after: {
          heapUsed: Math.round(afterMemory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(afterMemory.heapTotal / 1024 / 1024)
        },
        freed: Math.round((beforeMemory.heapUsed - afterMemory.heapUsed) / 1024 / 1024)
      };
      
      logger.info('Garbage collection triggered by admin', {
        adminId: req.user.id,
        adminEmail: req.user.email,
        memoryFreed: result.freed
      });
      
      res.json(ResponseFormatter.success('Garbage collection completed', result));
    } else {
      res.status(400).json(ResponseFormatter.failure('Garbage collection not available. Start Node.js with --expose-gc flag.'));
    }
  } catch (error) {
    logger.error('Error triggering garbage collection:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to trigger garbage collection'));
  }
});

/**
 * GET /api/performance/health
 * Get overall system health status
 */
router.get('/health', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const dbStats = DatabaseUtil.getPoolStats();
    
    // Determine health status based on various metrics
    const healthChecks = {
      memory: {
        status: memUsage.heapUsed / memUsage.heapTotal < 0.9 ? 'healthy' : 'warning',
        utilization: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2) + '%'
      },
      database: {
        status: dbStats.freeConnections > 2 ? 'healthy' : 'warning',
        availableConnections: dbStats.freeConnections,
        totalConnections: dbStats.totalConnections
      },
      uptime: {
        status: process.uptime() > 60 ? 'healthy' : 'starting',
        seconds: Math.round(process.uptime())
      }
    };
    
    const overallStatus = Object.values(healthChecks).every(check => check.status === 'healthy') 
      ? 'healthy' 
      : 'warning';
    
    const result = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: healthChecks
    };
    
    res.json(ResponseFormatter.success('Health check completed', result));
  } catch (error) {
    logger.error('Error performing health check:', error);
    res.status(500).json(ResponseFormatter.failure('Health check failed'));
  }
});

/**
 * POST /api/performance/warmup
 * Warm up caches with frequently accessed data
 */
router.post('/warmup', protect, admin, async (req, res) => {
  try {
    // Warm up product cache
    const productWarmupQuery = `
      SELECT id, name, slug, base_price, status 
      FROM products 
      WHERE status = 'approved' 
      ORDER BY created_at DESC 
      LIMIT 50
    `;
    
    const productResult = await DatabaseUtil.executeQuery(productWarmupQuery);
    
    if (productResult.success) {
      const productData = {};
      productResult.data.forEach(product => {
        productData[`product_${product.id}`] = product;
      });
      
      await cacheManager.warmup({
        products: productData
      });
    }
    
    // Warm up category cache
    const categoryWarmupQuery = `
      SELECT id, name, slug, parent_id 
      FROM categories 
      WHERE is_active = true
    `;
    
    const categoryResult = await DatabaseUtil.executeQuery(categoryWarmupQuery);
    
    if (categoryResult.success) {
      const categoryData = {};
      categoryResult.data.forEach(category => {
        categoryData[`category_${category.id}`] = category;
      });
      
      await cacheManager.warmup({
        categories: categoryData
      });
    }
    
    logger.info('Cache warmup completed by admin', {
      adminId: req.user.id,
      adminEmail: req.user.email
    });
    
    res.json(ResponseFormatter.success('Cache warmup completed successfully'));
  } catch (error) {
    logger.error('Error during cache warmup:', error);
    res.status(500).json(ResponseFormatter.failure('Cache warmup failed'));
  }
});

module.exports = router;