/**
 * Cache Manager Utility
 * Implements multi-level caching strategy for performance optimization
 */

const NodeCache = require('node-cache');
const logger = require('./logger');

class CacheManager {
  constructor() {
    // Different cache instances for different data types with appropriate TTL
    this.caches = {
      // Product data cache - 15 minutes TTL
      products: new NodeCache({ 
        stdTTL: 900, 
        checkperiod: 120,
        useClones: false,
        maxKeys: 1000
      }),
      
      // Category data cache - 30 minutes TTL
      categories: new NodeCache({ 
        stdTTL: 1800, 
        checkperiod: 300,
        useClones: false,
        maxKeys: 100
      }),
      
      // Inventory cache - 5 minutes TTL (more frequent updates)
      inventory: new NodeCache({ 
        stdTTL: 300, 
        checkperiod: 60,
        useClones: false,
        maxKeys: 2000
      }),
      
      // User session cache - 1 hour TTL
      sessions: new NodeCache({ 
        stdTTL: 3600, 
        checkperiod: 600,
        useClones: false,
        maxKeys: 5000
      }),
      
      // API response cache - 10 minutes TTL
      api: new NodeCache({ 
        stdTTL: 600, 
        checkperiod: 120,
        useClones: false,
        maxKeys: 500
      }),
      
      // System settings cache - 1 hour TTL
      settings: new NodeCache({ 
        stdTTL: 3600, 
        checkperiod: 600,
        useClones: false,
        maxKeys: 100
      }),
      
      // Search results cache - 5 minutes TTL
      search: new NodeCache({ 
        stdTTL: 300, 
        checkperiod: 60,
        useClones: false,
        maxKeys: 1000
      }),
      
      // Shipping rates cache - 1 hour TTL
      shipping: new NodeCache({ 
        stdTTL: 3600, 
        checkperiod: 600,
        useClones: false,
        maxKeys: 200
      }),
      
      // Tax rates cache - 2 hours TTL
      tax: new NodeCache({ 
        stdTTL: 7200, 
        checkperiod: 1200,
        useClones: false,
        maxKeys: 500
      })
    };

    // Set up event listeners for cache statistics
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for cache monitoring
   */
  setupEventListeners() {
    Object.keys(this.caches).forEach(cacheType => {
      const cache = this.caches[cacheType];
      
      cache.on('set', (key, value) => {
        if (logger && logger.debug) {
          logger.debug(`Cache SET: ${cacheType}:${key}`);
        }
      });
      
      cache.on('del', (key, value) => {
        if (logger && logger.debug) {
          logger.debug(`Cache DEL: ${cacheType}:${key}`);
        }
      });
      
      cache.on('expired', (key, value) => {
        if (logger && logger.debug) {
          logger.debug(`Cache EXPIRED: ${cacheType}:${key}`);
        }
      });
    });
  }

  /**
   * Get value from cache
   * @param {string} cacheType - Type of cache (products, categories, etc.)
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(cacheType, key) {
    if (!this.caches[cacheType]) {
      logger.warn(`Invalid cache type: ${cacheType}`);
      return undefined;
    }
    
    const value = this.caches[cacheType].get(key);
    if (value !== undefined) {
      if (logger && logger.debug) {
        logger.debug(`Cache HIT: ${cacheType}:${key}`);
      }
    } else {
      if (logger && logger.debug) {
        logger.debug(`Cache MISS: ${cacheType}:${key}`);
      }
    }
    
    return value;
  }

  /**
   * Set value in cache
   * @param {string} cacheType - Type of cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {boolean} Success status
   */
  set(cacheType, key, value, ttl = null) {
    if (!this.caches[cacheType]) {
      logger.warn(`Invalid cache type: ${cacheType}`);
      return false;
    }
    
    const success = ttl 
      ? this.caches[cacheType].set(key, value, ttl)
      : this.caches[cacheType].set(key, value);
    
    if (success) {
      if (logger && logger.debug) {
        logger.debug(`Cache SET: ${cacheType}:${key} (TTL: ${ttl || 'default'})`);
      }
    }
    
    return success;
  }

  /**
   * Delete value from cache
   * @param {string} cacheType - Type of cache
   * @param {string} key - Cache key
   * @returns {number} Number of deleted entries
   */
  del(cacheType, key) {
    if (!this.caches[cacheType]) {
      logger.warn(`Invalid cache type: ${cacheType}`);
      return 0;
    }
    
    const deleted = this.caches[cacheType].del(key);
    if (logger && logger.debug) {
      logger.debug(`Cache DEL: ${cacheType}:${key} (deleted: ${deleted})`);
    }
    
    return deleted;
  }

  /**
   * Clear entire cache type
   * @param {string} cacheType - Type of cache to clear
   */
  clear(cacheType) {
    if (!this.caches[cacheType]) {
      logger.warn(`Invalid cache type: ${cacheType}`);
      return;
    }
    
    this.caches[cacheType].flushAll();
    if (logger && logger.info) {
      logger.info(`Cache CLEARED: ${cacheType}`);
    }
  }

  /**
   * Clear all caches
   */
  clearAll() {
    Object.keys(this.caches).forEach(cacheType => {
      this.caches[cacheType].flushAll();
    });
    if (logger && logger.info) {
      logger.info('All caches cleared');
    }
  }

  /**
   * Get cache statistics
   * @param {string} cacheType - Type of cache (optional)
   * @returns {Object} Cache statistics
   */
  getStats(cacheType = null) {
    if (cacheType) {
      if (!this.caches[cacheType]) {
        return null;
      }
      
      const stats = this.caches[cacheType].getStats();
      return {
        type: cacheType,
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0,
        ksize: stats.ksize,
        vsize: stats.vsize
      };
    }
    
    // Return stats for all caches
    const allStats = {};
    Object.keys(this.caches).forEach(type => {
      const stats = this.caches[type].getStats();
      allStats[type] = {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0,
        ksize: stats.ksize,
        vsize: stats.vsize
      };
    });
    
    return allStats;
  }

  /**
   * Cache wrapper function for database queries
   * @param {string} cacheType - Type of cache
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<*>} Cached or fetched data
   */
  async getOrSet(cacheType, key, fetchFunction, ttl = null) {
    // Try to get from cache first
    let cachedValue = this.get(cacheType, key);
    
    if (cachedValue !== undefined) {
      return cachedValue;
    }
    
    try {
      // Fetch data using provided function
      const freshValue = await fetchFunction();
      
      // Cache the result
      this.set(cacheType, key, freshValue, ttl);
      
      return freshValue;
    } catch (error) {
      if (logger && logger.error) {
        logger.error(`Error in cache getOrSet for ${cacheType}:${key}`, error);
      }
      throw error;
    }
  }

  /**
   * Invalidate cache entries by pattern
   * @param {string} cacheType - Type of cache
   * @param {string} pattern - Pattern to match keys (supports wildcards)
   */
  invalidatePattern(cacheType, pattern) {
    if (!this.caches[cacheType]) {
      logger.warn(`Invalid cache type: ${cacheType}`);
      return;
    }
    
    const cache = this.caches[cacheType];
    const keys = cache.keys();
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    
    let deletedCount = 0;
    keys.forEach(key => {
      if (regex.test(key)) {
        cache.del(key);
        deletedCount++;
      }
    });
    
    if (logger && logger.info) {
      logger.info(`Cache pattern invalidation: ${cacheType}:${pattern} (deleted: ${deletedCount})`);
    }
  }

  /**
   * Warm up cache with frequently accessed data
   * @param {Object} warmupData - Data to preload into cache
   */
  async warmup(warmupData) {
    if (logger && logger.info) {
      logger.info('Starting cache warmup...');
    }
    
    for (const [cacheType, data] of Object.entries(warmupData)) {
      if (this.caches[cacheType]) {
        for (const [key, value] of Object.entries(data)) {
          this.set(cacheType, key, value);
        }
        if (logger && logger.info) {
          logger.info(`Warmed up ${cacheType} cache with ${Object.keys(data).length} entries`);
        }
      }
    }
    
    if (logger && logger.info) {
      logger.info('Cache warmup completed');
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;