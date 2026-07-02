/**
 * Performance Optimization Middleware
 * Implements caching, compression, and response time optimization
 */

const compression = require('compression');
const cacheManager = require('../utils/cacheManager');
const logger = require('../utils/logger');

class PerformanceMiddleware {
  /**
   * Response compression middleware
   * @returns {Function} Express middleware
   */
  static compression() {
    return compression({
      level: 6, // Balance between compression ratio and speed
      threshold: 1024, // Only compress responses larger than 1KB
      filter: (req, res) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
          return false;
        }
        
        // Use compression filter
        return compression.filter(req, res);
      }
    });
  }

  /**
   * Response caching middleware
   * @param {Object} options - Caching options
   * @returns {Function} Express middleware
   */
  static responseCache(options = {}) {
    const {
      ttl = 300, // 5 minutes default
      cacheType = 'api',
      keyGenerator = null,
      skipCache = null
    } = options;

    return (req, res, next) => {
      // Skip caching for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Skip caching if condition is met
      if (skipCache && skipCache(req, res)) {
        return next();
      }

      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator(req) 
        : `${req.originalUrl}_${JSON.stringify(req.query)}`;

      // Try to get cached response
      const cachedResponse = cacheManager.get(cacheType, cacheKey);
      
      if (cachedResponse) {
        logger.debug(`Cache hit for ${cacheKey}`);
        
        // Set cache headers. Cached responses can vary by the NEXT_LOCALE cookie
        // (localized content), so cache privately in the browser and vary on Cookie
        // to avoid serving one locale's response for another.
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', `private, max-age=${ttl}`);
        res.vary('Cookie');

        return res.json(cachedResponse);
      }

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache response
      res.json = function(data) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheManager.set(cacheType, cacheKey, data, ttl);
          logger.debug(`Cached response for ${cacheKey}`);
        }

        // Set cache headers (private + Vary: Cookie — see the HIT path above).
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', `private, max-age=${ttl}`);
        res.vary('Cookie');

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    };
  }

  /**
   * Request timing middleware
   * @returns {Function} Express middleware
   */
  static requestTiming() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Store start time
      req.startTime = startTime;
      
      // Override end method to log timing
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        // Add timing header
        res.set('X-Response-Time', `${duration}ms`);
        
        // Log slow requests
        if (duration > 1000) { // Log requests taking more than 1 second
          logger.warn(`Slow request detected`, {
            method: req.method,
            url: req.originalUrl,
            duration: `${duration}ms`,
            statusCode: res.statusCode
          });
        }
        
        // Log request timing
        logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        
        return originalEnd.apply(this, args);
      };
      
      next();
    };
  }

  /**
   * Memory usage monitoring middleware
   * @returns {Function} Express middleware
   */
  static memoryMonitoring() {
    let requestCount = 0;
    
    return (req, res, next) => {
      requestCount++;
      
      // Log memory usage every 100 requests
      if (requestCount % 100 === 0) {
        const memUsage = process.memoryUsage();
        
        logger.info('Memory usage', {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
          requestCount: requestCount
        });
        
        // Trigger garbage collection if heap usage is high
        if (memUsage.heapUsed / memUsage.heapTotal > 0.8) {
          if (global.gc) {
            global.gc();
            logger.info('Garbage collection triggered');
          }
        }
      }
      
      next();
    };
  }

  /**
   * Database query optimization middleware
   * @returns {Function} Express middleware
   */
  static queryOptimization() {
    return (req, res, next) => {
      // Add query optimization hints to request
      req.queryHints = {
        useIndex: true,
        limit: req.query.limit ? Math.min(parseInt(req.query.limit), 100) : 20,
        offset: req.query.offset ? parseInt(req.query.offset) : 0,
        cacheResults: req.method === 'GET'
      };
      
      next();
    };
  }

  /**
   * ETag generation middleware for caching
   * @returns {Function} Express middleware
   */
  static etag() {
    return (req, res, next) => {
      const originalJson = res.json;
      
      res.json = function(data) {
        // Generate ETag based on response data
        const crypto = require('crypto');
        const etag = crypto
          .createHash('md5')
          .update(JSON.stringify(data))
          .digest('hex');
        
        res.set('ETag', `"${etag}"`);
        
        // Check if client has cached version
        const clientETag = req.headers['if-none-match'];
        if (clientETag === `"${etag}"`) {
          return res.status(304).end();
        }
        
        return originalJson.call(this, data);
      };
      
      next();
    };
  }

  /**
   * Request size limiting middleware
   * @param {Object} options - Size limit options
   * @returns {Function} Express middleware
   */
  static requestSizeLimit(options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      skipPaths = []
    } = options;

    return (req, res, next) => {
      // Skip size check for specified paths
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxSize) {
        logger.warn(`Request size limit exceeded`, {
          path: req.path,
          contentLength: contentLength,
          maxSize: maxSize
        });
        
        return res.status(413).json({
          success: false,
          message: 'Request entity too large',
          maxSize: maxSize
        });
      }
      
      next();
    };
  }

  /**
   * Connection pooling optimization middleware
   * @returns {Function} Express middleware
   */
  static connectionPooling() {
    return (req, res, next) => {
      // Add connection pool information to request
      const DatabaseUtil = require('../utils/database');
      req.dbPoolStats = DatabaseUtil.getPoolStats();
      
      // Log pool statistics if connections are running low
      if (req.dbPoolStats.freeConnections < 2) {
        logger.warn('Database connection pool running low', req.dbPoolStats);
      }
      
      next();
    };
  }

  /**
   * Response optimization middleware
   * @returns {Function} Express middleware
   */
  static responseOptimization() {
    return (req, res, next) => {
      // Set performance-related headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });

      // Enable keep-alive for better connection reuse
      res.set('Connection', 'keep-alive');
      res.set('Keep-Alive', 'timeout=5, max=1000');

      next();
    };
  }

  /**
   * Cache invalidation helper
   * @param {string} pattern - Cache pattern to invalidate
   * @param {string} cacheType - Type of cache to invalidate
   */
  static invalidateCache(pattern, cacheType = 'api') {
    cacheManager.invalidatePattern(cacheType, pattern);
    logger.info(`Cache invalidated: ${cacheType}:${pattern}`);
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  static getPerformanceStats() {
    const memUsage = process.memoryUsage();
    const DatabaseUtil = require('../utils/database');
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cache: cacheManager.getStats(),
      database: DatabaseUtil.getPoolStats(),
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version
    };
  }
}

module.exports = PerformanceMiddleware;