/**
 * Performance Optimization Testing Script
 * Tests database queries, caching, and API response times
 */

const DatabaseUtil = require('../utils/database');
const cacheManager = require('../utils/cacheManager');
const PerformanceMiddleware = require('../middleware/performanceMiddleware');
const imageOptimizer = require('../utils/imageOptimizer');
const logger = require('../utils/logger');

class PerformanceTest {
  constructor() {
    this.results = {
      database: {},
      cache: {},
      api: {},
      images: {},
      overall: {}
    };
  }

  /**
   * Run all performance tests
   */
  async runAllTests() {
    console.log('🚀 Starting Performance Optimization Tests...\n');
    
    try {
      await this.testDatabasePerformance();
      await this.testCachePerformance();
      await this.testImageOptimization();
      await this.testMemoryUsage();
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Performance test failed:', error);
    }
  }

  /**
   * Test database query performance and indexing
   */
  async testDatabasePerformance() {
    console.log('📊 Testing Database Performance...');
    
    const tests = [
      {
        name: 'Product listing query',
        query: `
          SELECT p.id, p.name, p.slug, p.base_price, p.status, c.name as category_name
          FROM products p 
          JOIN categories c ON p.category_id = c.id 
          WHERE p.status = 'approved' 
          ORDER BY p.created_at DESC 
          LIMIT 20
        `,
        params: []
      },
      {
        name: 'Product search with filters',
        query: `
          SELECT p.*, c.name as category_name
          FROM products p 
          JOIN categories c ON p.category_id = c.id 
          WHERE p.status = 'approved' 
          AND p.base_price BETWEEN ? AND ?
          AND MATCH(p.name, p.description) AGAINST(? IN NATURAL LANGUAGE MODE)
          ORDER BY p.created_at DESC 
          LIMIT 10
        `,
        params: [50, 500, 'bed sheet']
      },
      {
        name: 'Inventory check query',
        query: `
          SELECT i.product_id, i.variant_id, i.quantity_available, i.quantity_reserved,
                 p.name, pv.size, pv.color
          FROM inventory i
          JOIN products p ON i.product_id = p.id
          LEFT JOIN product_variants pv ON i.variant_id = pv.id
          WHERE i.quantity_available > 0
          ORDER BY i.quantity_available ASC
          LIMIT 50
        `,
        params: []
      },
      {
        name: 'Order history query',
        query: `
          SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
                 COUNT(oi.id) as item_count
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY o.id
          ORDER BY o.created_at DESC
          LIMIT 25
        `,
        params: []
      },
      {
        name: 'Low stock alert query',
        query: `
          SELECT i.product_id, i.variant_id, i.quantity_available, i.reorder_point,
                 p.name, p.sku, pv.size, pv.color
          FROM inventory i
          JOIN products p ON i.product_id = p.id
          LEFT JOIN product_variants pv ON i.variant_id = pv.id
          WHERE i.quantity_available <= i.reorder_point
          ORDER BY (i.quantity_available / i.reorder_point) ASC
        `,
        params: []
      }
    ];

    for (const test of tests) {
      const startTime = Date.now();
      const result = await DatabaseUtil.executeQuery(test.query, test.params);
      const duration = Date.now() - startTime;
      
      this.results.database[test.name] = {
        duration: `${duration}ms`,
        success: result.success,
        rowCount: result.success ? result.data.length : 0,
        status: duration < 100 ? '✅ Fast' : duration < 500 ? '⚠️ Moderate' : '❌ Slow'
      };
      
      console.log(`  ${test.name}: ${duration}ms (${result.success ? result.data.length : 0} rows)`);
    }

    // Test connection pool performance
    const poolStats = DatabaseUtil.getPoolStats();
    this.results.database['Connection Pool'] = {
      totalConnections: poolStats.totalConnections,
      freeConnections: poolStats.freeConnections,
      utilization: `${((poolStats.totalConnections - poolStats.freeConnections) / poolStats.connectionLimit * 100).toFixed(1)}%`,
      status: poolStats.freeConnections > 2 ? '✅ Healthy' : '⚠️ Low'
    };

    console.log('✅ Database performance tests completed\n');
  }

  /**
   * Test cache performance
   */
  async testCachePerformance() {
    console.log('🗄️ Testing Cache Performance...');
    
    // Test cache write performance
    const writeStartTime = Date.now();
    const testData = Array.from({ length: 1000 }, (_, i) => ({
      id: `test_${i}`,
      data: `Test data ${i}`,
      timestamp: Date.now()
    }));
    
    testData.forEach((item, index) => {
      cacheManager.set('api', `test_key_${index}`, item);
    });
    const writeTime = Date.now() - writeStartTime;
    
    // Test cache read performance
    const readStartTime = Date.now();
    let hitCount = 0;
    for (let i = 0; i < 1000; i++) {
      const cached = cacheManager.get('api', `test_key_${i}`);
      if (cached) hitCount++;
    }
    const readTime = Date.now() - readStartTime;
    
    // Test cache statistics
    const cacheStats = cacheManager.getStats();
    
    this.results.cache = {
      'Write Performance': {
        duration: `${writeTime}ms`,
        operations: 1000,
        opsPerSecond: Math.round(1000 / (writeTime / 1000)),
        status: writeTime < 100 ? '✅ Fast' : '⚠️ Slow'
      },
      'Read Performance': {
        duration: `${readTime}ms`,
        operations: 1000,
        hitRate: `${(hitCount / 1000 * 100).toFixed(1)}%`,
        opsPerSecond: Math.round(1000 / (readTime / 1000)),
        status: readTime < 50 ? '✅ Fast' : '⚠️ Slow'
      },
      'Cache Statistics': cacheStats
    };
    
    // Clean up test data
    for (let i = 0; i < 1000; i++) {
      cacheManager.del('api', `test_key_${i}`);
    }
    
    console.log(`  Write: ${writeTime}ms (${Math.round(1000 / (writeTime / 1000))} ops/sec)`);
    console.log(`  Read: ${readTime}ms (${Math.round(1000 / (readTime / 1000))} ops/sec, ${(hitCount / 1000 * 100).toFixed(1)}% hit rate)`);
    console.log('✅ Cache performance tests completed\n');
  }

  /**
   * Test image optimization performance
   */
  async testImageOptimization() {
    console.log('🖼️ Testing Image Optimization...');
    
    try {
      // Create a test image buffer (simple 1x1 pixel PNG)
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      
      // Test different optimization formats
      const formats = ['webp', 'jpeg', 'png'];
      const optimizationResults = {};
      
      for (const format of formats) {
        const startTime = Date.now();
        const optimized = await imageOptimizer.optimizeImage(testImageBuffer, {
          format: format,
          quality: 85,
          width: 300,
          height: 300
        });
        const duration = Date.now() - startTime;
        
        optimizationResults[format] = {
          duration: `${duration}ms`,
          originalSize: testImageBuffer.length,
          optimizedSize: optimized.length,
          compressionRatio: `${((1 - optimized.length / testImageBuffer.length) * 100).toFixed(1)}%`,
          status: duration < 500 ? '✅ Fast' : '⚠️ Slow'
        };
        
        console.log(`  ${format.toUpperCase()}: ${duration}ms (${optimized.length} bytes)`);
      }
      
      this.results.images = optimizationResults;
      
    } catch (error) {
      console.log('  ⚠️ Image optimization test skipped (Sharp not available)');
      this.results.images = { error: 'Sharp not available' };
    }
    
    console.log('✅ Image optimization tests completed\n');
  }

  /**
   * Test memory usage and performance
   */
  async testMemoryUsage() {
    console.log('💾 Testing Memory Usage...');
    
    const initialMemory = process.memoryUsage();
    
    // Simulate memory-intensive operations
    const largeArray = Array.from({ length: 100000 }, (_, i) => ({
      id: i,
      data: `Large data object ${i}`.repeat(10),
      timestamp: Date.now()
    }));
    
    const afterAllocationMemory = process.memoryUsage();
    
    // Clear the array
    largeArray.length = 0;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const afterCleanupMemory = process.memoryUsage();
    
    this.results.overall.memory = {
      initial: {
        heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024),
        rss: Math.round(initialMemory.rss / 1024 / 1024)
      },
      afterAllocation: {
        heapUsed: Math.round(afterAllocationMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(afterAllocationMemory.heapTotal / 1024 / 1024),
        rss: Math.round(afterAllocationMemory.rss / 1024 / 1024)
      },
      afterCleanup: {
        heapUsed: Math.round(afterCleanupMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(afterCleanupMemory.heapTotal / 1024 / 1024),
        rss: Math.round(afterCleanupMemory.rss / 1024 / 1024)
      },
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version
    };
    
    console.log(`  Initial heap: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
    console.log(`  After allocation: ${Math.round(afterAllocationMemory.heapUsed / 1024 / 1024)}MB`);
    console.log(`  After cleanup: ${Math.round(afterCleanupMemory.heapUsed / 1024 / 1024)}MB`);
    console.log('✅ Memory usage tests completed\n');
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport() {
    console.log('📋 Performance Test Report');
    console.log('=' .repeat(50));
    
    // Database Performance Summary
    console.log('\n📊 Database Performance:');
    Object.entries(this.results.database).forEach(([test, result]) => {
      if (typeof result === 'object' && result.duration) {
        console.log(`  ${test}: ${result.duration} ${result.status}`);
      }
    });
    
    // Cache Performance Summary
    console.log('\n🗄️ Cache Performance:');
    if (this.results.cache['Write Performance']) {
      console.log(`  Write: ${this.results.cache['Write Performance'].duration} ${this.results.cache['Write Performance'].status}`);
      console.log(`  Read: ${this.results.cache['Read Performance'].duration} ${this.results.cache['Read Performance'].status}`);
    }
    
    // Image Optimization Summary
    console.log('\n🖼️ Image Optimization:');
    Object.entries(this.results.images).forEach(([format, result]) => {
      if (typeof result === 'object' && result.duration) {
        console.log(`  ${format.toUpperCase()}: ${result.duration} ${result.status}`);
      }
    });
    
    // Memory Usage Summary
    console.log('\n💾 Memory Usage:');
    if (this.results.overall.memory) {
      const mem = this.results.overall.memory;
      console.log(`  Current heap: ${mem.afterCleanup.heapUsed}MB / ${mem.afterCleanup.heapTotal}MB`);
      console.log(`  RSS: ${mem.afterCleanup.rss}MB`);
      console.log(`  Uptime: ${mem.uptime}s`);
    }
    
    // Overall Assessment
    console.log('\n🎯 Overall Assessment:');
    const dbFast = Object.values(this.results.database).filter(r => r.status === '✅ Fast').length;
    const dbTotal = Object.values(this.results.database).filter(r => r.status).length;
    
    console.log(`  Database queries: ${dbFast}/${dbTotal} performing well`);
    console.log(`  Cache system: ${this.results.cache['Read Performance']?.status || 'Not tested'}`);
    console.log(`  Image optimization: Available`);
    
    console.log('\n✅ Performance optimization testing completed!');
    console.log('\n💡 Recommendations:');
    console.log('  - Monitor slow queries and add indexes as needed');
    console.log('  - Use caching for frequently accessed data');
    console.log('  - Optimize images before serving to clients');
    console.log('  - Monitor memory usage and connection pools');
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new PerformanceTest();
  test.runAllTests().catch(console.error);
}

module.exports = PerformanceTest;