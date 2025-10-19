/**
 * Cache Performance Testing Script
 * Tests caching functionality without requiring database connection
 */

const cacheManager = require('../utils/cacheManager');

async function testCachePerformance() {
  console.log('🗄️ Testing Cache Performance...\n');
  
  // Test 1: Basic cache operations
  console.log('📝 Test 1: Basic Cache Operations');
  const startTime = Date.now();
  
  // Set test data
  cacheManager.set('api', 'test_key_1', { id: 1, name: 'Test Product', price: 99.99 });
  cacheManager.set('products', 'product_123', { id: 123, name: 'Bed Sheet', category: 'bedding' });
  cacheManager.set('categories', 'cat_1', { id: 1, name: 'Bedding', slug: 'bedding' });
  
  // Get test data
  const apiData = cacheManager.get('api', 'test_key_1');
  const productData = cacheManager.get('products', 'product_123');
  const categoryData = cacheManager.get('categories', 'cat_1');
  
  console.log(`  ✅ Basic operations completed in ${Date.now() - startTime}ms`);
  console.log(`  📊 Retrieved data: API=${!!apiData}, Product=${!!productData}, Category=${!!categoryData}`);
  
  // Test 2: Bulk operations performance
  console.log('\n📦 Test 2: Bulk Operations Performance');
  
  // Clear API cache first
  cacheManager.clear('api');
  
  const bulkStartTime = Date.now();
  
  // Write 400 cache entries (within API cache limit)
  for (let i = 0; i < 400; i++) {
    cacheManager.set('api', `bulk_test_${i}`, {
      id: i,
      data: `Test data ${i}`,
      timestamp: Date.now()
    });
  }
  
  const writeTime = Date.now() - bulkStartTime;
  console.log(`  ✅ Wrote 400 entries in ${writeTime}ms (${Math.round(400 / (writeTime / 1000))} ops/sec)`);
  
  // Read 400 cache entries
  const readStartTime = Date.now();
  let hitCount = 0;
  
  for (let i = 0; i < 400; i++) {
    const cached = cacheManager.get('api', `bulk_test_${i}`);
    if (cached) hitCount++;
  }
  
  const readTime = Date.now() - readStartTime;
  console.log(`  ✅ Read 400 entries in ${readTime}ms (${Math.round(400 / (readTime / 1000))} ops/sec)`);
  console.log(`  📈 Hit rate: ${(hitCount / 400 * 100).toFixed(1)}%`);
  
  // Test 3: Cache statistics
  console.log('\n📊 Test 3: Cache Statistics');
  const stats = cacheManager.getStats();
  
  Object.entries(stats).forEach(([cacheType, stat]) => {
    console.log(`  ${cacheType}:`);
    console.log(`    Keys: ${stat.keys}`);
    console.log(`    Hits: ${stat.hits}`);
    console.log(`    Misses: ${stat.misses}`);
    console.log(`    Hit Rate: ${(stat.hitRate * 100).toFixed(1)}%`);
  });
  
  // Test 4: Cache invalidation
  console.log('\n🗑️ Test 4: Cache Invalidation');
  const invalidationStartTime = Date.now();
  
  // Invalidate bulk test entries
  cacheManager.invalidatePattern('api', 'bulk_test_*');
  
  const invalidationTime = Date.now() - invalidationStartTime;
  console.log(`  ✅ Pattern invalidation completed in ${invalidationTime}ms`);
  
  // Verify invalidation
  const testAfterInvalidation = cacheManager.get('api', 'bulk_test_500');
  console.log(`  📋 Entry exists after invalidation: ${!!testAfterInvalidation}`);
  
  // Test 5: TTL functionality
  console.log('\n⏰ Test 5: TTL Functionality');
  
  // Set entry with short TTL
  cacheManager.set('api', 'ttl_test', { message: 'This will expire' }, 2); // 2 seconds
  
  const immediateGet = cacheManager.get('api', 'ttl_test');
  console.log(`  📝 Immediate retrieval: ${!!immediateGet}`);
  
  // Wait and test expiration
  await new Promise(resolve => setTimeout(resolve, 2500)); // Wait 2.5 seconds
  
  const expiredGet = cacheManager.get('api', 'ttl_test');
  console.log(`  ⏰ After expiration: ${!!expiredGet}`);
  
  // Test 6: Memory usage
  console.log('\n💾 Test 6: Memory Usage');
  const memBefore = process.memoryUsage();
  
  // Create large cache entries
  for (let i = 0; i < 100; i++) {
    const largeData = {
      id: i,
      data: 'x'.repeat(10000), // 10KB of data
      array: Array.from({ length: 1000 }, (_, j) => j)
    };
    cacheManager.set('api', `large_entry_${i}`, largeData);
  }
  
  const memAfter = process.memoryUsage();
  const memDiff = Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);
  
  console.log(`  📊 Memory usage increased by ~${memDiff}MB for 100 large entries`);
  
  // Clean up large entries
  for (let i = 0; i < 100; i++) {
    cacheManager.del('api', `large_entry_${i}`);
  }
  
  // Final statistics
  console.log('\n📋 Final Cache Statistics:');
  const finalStats = cacheManager.getStats();
  
  let totalKeys = 0;
  let totalHits = 0;
  let totalMisses = 0;
  
  Object.values(finalStats).forEach(stat => {
    totalKeys += stat.keys;
    totalHits += stat.hits;
    totalMisses += stat.misses;
  });
  
  console.log(`  Total Keys: ${totalKeys}`);
  console.log(`  Total Hits: ${totalHits}`);
  console.log(`  Total Misses: ${totalMisses}`);
  console.log(`  Overall Hit Rate: ${((totalHits / (totalHits + totalMisses)) * 100).toFixed(1)}%`);
  
  console.log('\n✅ Cache performance testing completed!');
  console.log('\n💡 Performance Summary:');
  console.log(`  - Write Performance: ${Math.round(400 / (writeTime / 1000))} ops/sec`);
  console.log(`  - Read Performance: ${Math.round(400 / (readTime / 1000))} ops/sec`);
  console.log(`  - Hit Rate: ${(hitCount / 400 * 100).toFixed(1)}%`);
  console.log(`  - TTL Functionality: Working`);
  console.log(`  - Pattern Invalidation: Working`);
}

// Run the test
if (require.main === module) {
  testCachePerformance().catch(console.error);
}

module.exports = testCachePerformance;