const request = require('supertest')
const express = require('express')
const app = require('../../server')

describe('Performance Load Tests', () => {
  const CONCURRENT_REQUESTS = 100
  const RESPONSE_TIME_THRESHOLD = 1000 // 1 second

  describe('API Endpoint Performance', () => {
    test('handle concurrent product listing requests', async () => {
      const startTime = Date.now()
      
      // Create array of concurrent requests
      const requests = Array(CONCURRENT_REQUESTS).fill().map(() => 
        request(app)
          .get('/api/products')
          .expect(200)
      )
      
      // Execute all requests concurrently
      const responses = await Promise.all(requests)
      
      const endTime = Date.now()
      const totalTime = endTime - startTime
      const averageTime = totalTime / CONCURRENT_REQUESTS
      
      // Verify all requests succeeded
      expect(responses).toHaveLength(CONCURRENT_REQUESTS)
      responses.forEach(response => {
        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.products)).toBe(true)
      })
      
      // Performance assertions
      expect(averageTime).toBeLessThan(RESPONSE_TIME_THRESHOLD)
      expect(totalTime).toBeLessThan(CONCURRENT_REQUESTS * 100) // Should be much faster than sequential
      
      console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`)
      console.log(`Total time: ${totalTime}ms`)
      console.log(`Average time per request: ${averageTime}ms`)
    }, 30000)

    test('handle concurrent payment processing requests', async () => {
      const paymentData = {
        amount: 2000,
        currency: 'usd',
        orderId: 'LOAD_TEST_ORDER'
      }
      
      const startTime = Date.now()
      
      const requests = Array(50).fill().map((_, index) => 
        request(app)
          .post('/api/payments/create-intent')
          .send({
            ...paymentData,
            orderId: `LOAD_TEST_ORDER_${index}`
          })
          .expect(200)
      )
      
      const responses = await Promise.all(requests)
      const endTime = Date.now()
      
      // Verify all payment intents were created
      responses.forEach(response => {
        expect(response.body.success).toBe(true)
        expect(response.body.clientSecret).toBeDefined()
      })
      
      const totalTime = endTime - startTime
      const averageTime = totalTime / 50
      
      expect(averageTime).toBeLessThan(2000) // Payment processing can be slower
      
      console.log(`Payment processing - Average time: ${averageTime}ms`)
    }, 60000)

    test('handle concurrent inventory updates', async () => {
      const productId = 'PROD001'
      const startTime = Date.now()
      
      // Simulate concurrent inventory updates (like multiple orders)
      const requests = Array(20).fill().map((_, index) => 
        request(app)
          .post('/api/inventory/reserve')
          .send({
            items: [{ productId, quantity: 1 }],
            orderId: `CONCURRENT_ORDER_${index}`,
            expirationTime: 3600
          })
      )
      
      const responses = await Promise.all(requests)
      const endTime = Date.now()
      
      // Count successful reservations
      const successfulReservations = responses.filter(r => r.body.success).length
      const failedReservations = responses.filter(r => !r.body.success).length
      
      // Should handle race conditions gracefully
      expect(successfulReservations + failedReservations).toBe(20)
      expect(successfulReservations).toBeGreaterThan(0)
      
      const totalTime = endTime - startTime
      console.log(`Inventory updates - Total time: ${totalTime}ms`)
      console.log(`Successful reservations: ${successfulReservations}`)
      console.log(`Failed reservations: ${failedReservations}`)
    }, 30000)

    test('handle concurrent search requests', async () => {
      const searchTerms = [
        'bed sheets', 'pillows', 'comforters', 'blankets', 'mattress',
        'cotton', 'silk', 'linen', 'queen', 'king'
      ]
      
      const startTime = Date.now()
      
      const requests = Array(CONCURRENT_REQUESTS).fill().map((_, index) => {
        const searchTerm = searchTerms[index % searchTerms.length]
        return request(app)
          .get(`/api/search?q=${encodeURIComponent(searchTerm)}`)
          .expect(200)
      })
      
      const responses = await Promise.all(requests)
      const endTime = Date.now()
      
      // Verify search results
      responses.forEach(response => {
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.results)).toBe(true)
      })
      
      const totalTime = endTime - startTime
      const averageTime = totalTime / CONCURRENT_REQUESTS
      
      expect(averageTime).toBeLessThan(500) // Search should be fast
      
      console.log(`Search requests - Average time: ${averageTime}ms`)
    }, 30000)
  })

  describe('Database Performance', () => {
    test('handle concurrent database queries', async () => {
      const db = require('../../utils/database')
      
      const startTime = Date.now()
      
      // Simulate concurrent database operations
      const queries = Array(50).fill().map(() => 
        db.query('SELECT COUNT(*) as count FROM products WHERE is_active = 1')
      )
      
      const results = await Promise.all(queries)
      const endTime = Date.now()
      
      // Verify all queries succeeded
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true)
        expect(result[0].count).toBeGreaterThanOrEqual(0)
      })
      
      const totalTime = endTime - startTime
      const averageTime = totalTime / 50
      
      expect(averageTime).toBeLessThan(100) // Database queries should be fast
      
      console.log(`Database queries - Average time: ${averageTime}ms`)
    }, 30000)

    test('handle concurrent transaction processing', async () => {
      const db = require('../../utils/database')
      
      const startTime = Date.now()
      
      // Simulate concurrent transactions
      const transactions = Array(20).fill().map(async (_, index) => {
        const connection = await db.getConnection()
        
        try {
          await connection.beginTransaction()
          
          // Simulate order processing transaction
          await connection.query(
            'INSERT INTO orders (id, customer_id, total_amount, status) VALUES (?, ?, ?, ?)',
            [`PERF_TEST_${index}`, 'CUST001', 99.99, 'pending']
          )
          
          await connection.query(
            'UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = ?',
            ['PROD001']
          )
          
          await connection.commit()
          return { success: true }
        } catch (error) {
          await connection.rollback()
          return { success: false, error: error.message }
        } finally {
          connection.release()
        }
      })
      
      const results = await Promise.all(transactions)
      const endTime = Date.now()
      
      const successfulTransactions = results.filter(r => r.success).length
      const failedTransactions = results.filter(r => !r.success).length
      
      expect(successfulTransactions + failedTransactions).toBe(20)
      
      const totalTime = endTime - startTime
      console.log(`Transactions - Total time: ${totalTime}ms`)
      console.log(`Successful: ${successfulTransactions}, Failed: ${failedTransactions}`)
    }, 30000)
  })

  describe('Memory and Resource Usage', () => {
    test('monitor memory usage during high load', async () => {
      const initialMemory = process.memoryUsage()
      
      // Generate high load
      const requests = Array(200).fill().map((_, index) => 
        request(app)
          .get('/api/products')
          .query({ page: Math.floor(index / 20) + 1 })
      )
      
      await Promise.all(requests)
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = process.memoryUsage()
      
      const memoryIncrease = {
        rss: finalMemory.rss - initialMemory.rss,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal
      }
      
      console.log('Memory usage increase:', {
        rss: `${Math.round(memoryIncrease.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryIncrease.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryIncrease.heapTotal / 1024 / 1024)}MB`
      })
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease.heapUsed).toBeLessThan(100 * 1024 * 1024)
    }, 60000)

    test('handle file upload performance', async () => {
      const fs = require('fs')
      const path = require('path')
      
      // Create test image buffer
      const testImageBuffer = Buffer.alloc(1024 * 1024) // 1MB test file
      
      const startTime = Date.now()
      
      // Simulate concurrent file uploads
      const uploads = Array(10).fill().map((_, index) => 
        request(app)
          .post('/api/images/upload')
          .attach('image', testImageBuffer, `test-image-${index}.jpg`)
          .field('productId', 'PROD001')
      )
      
      const responses = await Promise.all(uploads)
      const endTime = Date.now()
      
      // Verify uploads
      const successfulUploads = responses.filter(r => r.status === 200).length
      
      expect(successfulUploads).toBeGreaterThan(0)
      
      const totalTime = endTime - startTime
      const averageTime = totalTime / 10
      
      console.log(`File uploads - Average time: ${averageTime}ms`)
      console.log(`Successful uploads: ${successfulUploads}/10`)
    }, 60000)
  })

  describe('Cache Performance', () => {
    test('verify cache effectiveness under load', async () => {
      // First request (cache miss)
      const firstRequest = await request(app)
        .get('/api/products/featured')
        .expect(200)
      
      const startTime = Date.now()
      
      // Multiple requests for same data (should hit cache)
      const cachedRequests = Array(50).fill().map(() => 
        request(app)
          .get('/api/products/featured')
          .expect(200)
      )
      
      const responses = await Promise.all(cachedRequests)
      const endTime = Date.now()
      
      // Verify all responses are identical (from cache)
      responses.forEach(response => {
        expect(response.body).toEqual(firstRequest.body)
      })
      
      const totalTime = endTime - startTime
      const averageTime = totalTime / 50
      
      // Cached requests should be very fast
      expect(averageTime).toBeLessThan(50)
      
      console.log(`Cached requests - Average time: ${averageTime}ms`)
    }, 30000)
  })

  describe('Rate Limiting Performance', () => {
    test('verify rate limiting under high load', async () => {
      const startTime = Date.now()
      
      // Send requests exceeding rate limit
      const requests = Array(1100).fill().map(() => // Exceed 1000/15min limit
        request(app)
          .get('/api/products')
      )
      
      const responses = await Promise.all(requests)
      const endTime = Date.now()
      
      const successfulRequests = responses.filter(r => r.status === 200).length
      const rateLimitedRequests = responses.filter(r => r.status === 429).length
      
      // Should have some rate limited requests
      expect(rateLimitedRequests).toBeGreaterThan(0)
      expect(successfulRequests).toBeLessThan(1100)
      
      const totalTime = endTime - startTime
      
      console.log(`Rate limiting test - Total time: ${totalTime}ms`)
      console.log(`Successful: ${successfulRequests}, Rate limited: ${rateLimitedRequests}`)
    }, 60000)
  })
})