const request = require('supertest')
const app = require('../../server')
const cluster = require('cluster')
const os = require('os')

describe('Stress Tests', () => {
  describe('High Volume Order Processing', () => {
    test('process large number of orders simultaneously', async () => {
      const ORDER_COUNT = 500
      const BATCH_SIZE = 50
      
      const startTime = Date.now()
      let processedOrders = 0
      let failedOrders = 0
      
      // Process orders in batches to avoid overwhelming the system
      for (let i = 0; i < ORDER_COUNT; i += BATCH_SIZE) {
        const batch = Array(Math.min(BATCH_SIZE, ORDER_COUNT - i)).fill().map((_, index) => {
          const orderIndex = i + index
          return request(app)
            .post('/api/orders/create')
            .send({
              customerId: `STRESS_CUSTOMER_${orderIndex % 100}`,
              items: [
                {
                  productId: `PROD${(orderIndex % 10) + 1}`.padStart(7, '0'),
                  quantity: Math.floor(Math.random() * 3) + 1,
                  price: Math.random() * 100 + 10
                }
              ],
              shippingAddress: {
                name: `Customer ${orderIndex}`,
                address: `${orderIndex} Test Street`,
                city: 'Test City',
                state: 'CA',
                zipCode: '90210',
                country: 'US'
              }
            })
        })
        
        const batchResults = await Promise.allSettled(batch)
        
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value.status === 200) {
            processedOrders++
          } else {
            failedOrders++
          }
        })
        
        // Small delay between batches to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      const endTime = Date.now()
      const totalTime = endTime - startTime
      const ordersPerSecond = (processedOrders / totalTime) * 1000
      
      console.log(`Stress Test Results:`)
      console.log(`Total orders attempted: ${ORDER_COUNT}`)
      console.log(`Processed successfully: ${processedOrders}`)
      console.log(`Failed: ${failedOrders}`)
      console.log(`Total time: ${totalTime}ms`)
      console.log(`Orders per second: ${ordersPerSecond.toFixed(2)}`)
      
      // At least 80% should succeed
      expect(processedOrders / ORDER_COUNT).toBeGreaterThan(0.8)
      
      // Should process at least 1 order per second on average
      expect(ordersPerSecond).toBeGreaterThan(1)
    }, 300000) // 5 minute timeout

    test('handle inventory depletion gracefully', async () => {
      const PRODUCT_ID = 'STRESS_TEST_PRODUCT'
      const INITIAL_STOCK = 10
      const ORDER_ATTEMPTS = 50
      
      // Set initial stock
      await request(app)
        .post('/api/inventory/update')
        .send({
          productId: PRODUCT_ID,
          quantity: INITIAL_STOCK,
          operation: 'set'
        })
      
      const startTime = Date.now()
      
      // Attempt to order more than available stock
      const orderAttempts = Array(ORDER_ATTEMPTS).fill().map((_, index) => 
        request(app)
          .post('/api/inventory/reserve')
          .send({
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            orderId: `STRESS_DEPLETION_${index}`,
            expirationTime: 3600
          })
      )
      
      const results = await Promise.allSettled(orderAttempts)
      const endTime = Date.now()
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.body.success
      ).length
      
      const failed = results.filter(r => 
        r.status === 'fulfilled' && !r.value.body.success
      ).length
      
      console.log(`Inventory depletion test:`)
      console.log(`Initial stock: ${INITIAL_STOCK}`)
      console.log(`Order attempts: ${ORDER_ATTEMPTS}`)
      console.log(`Successful reservations: ${successful}`)
      console.log(`Failed reservations: ${failed}`)
      console.log(`Time: ${endTime - startTime}ms`)
      
      // Should not oversell
      expect(successful).toBeLessThanOrEqual(INITIAL_STOCK)
      
      // Should handle failures gracefully
      expect(failed).toBe(ORDER_ATTEMPTS - successful)
    }, 60000)
  })

  describe('Database Connection Pool Stress', () => {
    test('exhaust and recover database connections', async () => {
      const CONNECTION_ATTEMPTS = 200
      
      const startTime = Date.now()
      
      // Attempt many concurrent database operations
      const dbOperations = Array(CONNECTION_ATTEMPTS).fill().map((_, index) => 
        request(app)
          .get('/api/products')
          .query({ 
            page: Math.floor(index / 20) + 1,
            limit: 10,
            category: index % 2 === 0 ? 'sheets' : 'pillows'
          })
      )
      
      const results = await Promise.allSettled(dbOperations)
      const endTime = Date.now()
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length
      
      const failed = results.filter(r => 
        r.status === 'rejected' || 
        (r.status === 'fulfilled' && r.value.status !== 200)
      ).length
      
      console.log(`Database connection stress test:`)
      console.log(`Connection attempts: ${CONNECTION_ATTEMPTS}`)
      console.log(`Successful: ${successful}`)
      console.log(`Failed: ${failed}`)
      console.log(`Time: ${endTime - startTime}ms`)
      
      // Most should succeed (allow some failures under extreme load)
      expect(successful / CONNECTION_ATTEMPTS).toBeGreaterThan(0.7)
      
      // Verify system recovers - make a simple request
      const recoveryTest = await request(app)
        .get('/api/health')
        .expect(200)
      
      expect(recoveryTest.body.status).toBe('healthy')
    }, 120000)
  })

  describe('Memory Pressure Tests', () => {
    test('handle large payload processing', async () => {
      const LARGE_PAYLOAD_SIZE = 1024 * 1024 // 1MB
      const REQUEST_COUNT = 20
      
      // Create large payload
      const largeData = {
        products: Array(1000).fill().map((_, index) => ({
          id: `LARGE_PRODUCT_${index}`,
          name: `Product ${index}`,
          description: 'A'.repeat(1000), // 1KB description
          price: Math.random() * 1000,
          category: `Category ${index % 10}`,
          tags: Array(20).fill().map((_, i) => `tag${i}`)
        }))
      }
      
      const initialMemory = process.memoryUsage()
      const startTime = Date.now()
      
      // Send multiple large payloads
      const requests = Array(REQUEST_COUNT).fill().map((_, index) => 
        request(app)
          .post('/api/products/bulk-import')
          .send({
            ...largeData,
            batchId: `STRESS_BATCH_${index}`
          })
      )
      
      const results = await Promise.allSettled(requests)
      const endTime = Date.now()
      
      // Force garbage collection
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = process.memoryUsage()
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length
      
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
      
      console.log(`Large payload stress test:`)
      console.log(`Payload size: ${LARGE_PAYLOAD_SIZE} bytes`)
      console.log(`Request count: ${REQUEST_COUNT}`)
      console.log(`Successful: ${successful}`)
      console.log(`Time: ${endTime - startTime}ms`)
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`)
      
      // Should handle large payloads
      expect(successful).toBeGreaterThan(REQUEST_COUNT * 0.5)
      
      // Memory increase should be reasonable (less than 200MB)
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024)
    }, 180000)
  })

  describe('File System Stress', () => {
    test('handle concurrent file operations', async () => {
      const FILE_COUNT = 100
      const FILE_SIZE = 1024 * 100 // 100KB each
      
      const testBuffer = Buffer.alloc(FILE_SIZE, 'A')
      
      const startTime = Date.now()
      
      // Concurrent file uploads
      const uploads = Array(FILE_COUNT).fill().map((_, index) => 
        request(app)
          .post('/api/images/upload')
          .attach('image', testBuffer, `stress-test-${index}.jpg`)
          .field('productId', `STRESS_PRODUCT_${index % 10}`)
      )
      
      const results = await Promise.allSettled(uploads)
      const endTime = Date.now()
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length
      
      const failed = results.filter(r => 
        r.status === 'rejected' || 
        (r.status === 'fulfilled' && r.value.status !== 200)
      ).length
      
      console.log(`File system stress test:`)
      console.log(`File count: ${FILE_COUNT}`)
      console.log(`File size: ${FILE_SIZE} bytes each`)
      console.log(`Successful uploads: ${successful}`)
      console.log(`Failed uploads: ${failed}`)
      console.log(`Time: ${endTime - startTime}ms`)
      
      // Should handle most file operations
      expect(successful / FILE_COUNT).toBeGreaterThan(0.6)
      
      // Cleanup - delete uploaded files
      const cleanupPromises = Array(successful).fill().map((_, index) => 
        request(app)
          .delete(`/api/images/stress-test-${index}.jpg`)
      )
      
      await Promise.allSettled(cleanupPromises)
    }, 300000)
  })

  describe('Network Timeout Stress', () => {
    test('handle slow external API responses', async () => {
      const SLOW_REQUEST_COUNT = 10
      
      const startTime = Date.now()
      
      // Simulate slow external API calls (shipping, payment, etc.)
      const slowRequests = Array(SLOW_REQUEST_COUNT).fill().map((_, index) => 
        request(app)
          .post('/api/shipping/calculate')
          .send({
            origin: { zipCode: '10001', country: 'US' },
            destination: { zipCode: '90210', country: 'US' },
            packages: [{
              weight: { value: 5, units: 'LB' },
              dimensions: { length: 10, width: 8, height: 6, units: 'IN' }
            }],
            simulateDelay: 5000 // 5 second delay
          })
          .timeout(10000) // 10 second timeout
      )
      
      const results = await Promise.allSettled(slowRequests)
      const endTime = Date.now()
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length
      
      const timedOut = results.filter(r => 
        r.status === 'rejected' && r.reason.code === 'ECONNABORTED'
      ).length
      
      console.log(`Network timeout stress test:`)
      console.log(`Slow requests: ${SLOW_REQUEST_COUNT}`)
      console.log(`Successful: ${successful}`)
      console.log(`Timed out: ${timedOut}`)
      console.log(`Total time: ${endTime - startTime}ms`)
      
      // Should handle timeouts gracefully
      expect(successful + timedOut).toBe(SLOW_REQUEST_COUNT)
    }, 120000)
  })

  describe('Recovery Tests', () => {
    test('recover from simulated failures', async () => {
      // Simulate system under stress
      const stressRequests = Array(100).fill().map(() => 
        request(app)
          .get('/api/products')
      )
      
      await Promise.allSettled(stressRequests)
      
      // Wait for system to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Test normal operations after stress
      const recoveryTests = [
        request(app).get('/api/health').expect(200),
        request(app).get('/api/products').expect(200),
        request(app).post('/api/orders/create').send({
          customerId: 'RECOVERY_TEST',
          items: [{ productId: 'PROD001', quantity: 1, price: 99.99 }],
          shippingAddress: {
            name: 'Recovery Test',
            address: '123 Recovery St',
            city: 'Test City',
            state: 'CA',
            zipCode: '90210',
            country: 'US'
          }
        }).expect(200)
      ]
      
      const recoveryResults = await Promise.all(recoveryTests)
      
      // All recovery tests should pass
      recoveryResults.forEach(result => {
        expect(result.status).toBe(200)
      })
      
      console.log('System recovered successfully after stress test')
    }, 60000)
  })
})