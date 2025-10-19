const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// Create test fixtures directory
const fixturesDir = path.join(__dirname)
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true })
}

// Create test images
async function createTestImages() {
  try {
    // Create a simple test image (100x100 red square)
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg()
    .toFile(path.join(fixturesDir, 'product-image-1.jpg'))

    // Create another test image (200x200 blue square)
    await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 0, g: 0, b: 255 }
      }
    })
    .jpeg()
    .toFile(path.join(fixturesDir, 'product-image-2.jpg'))

    // Create high resolution test image (1920x1080)
    await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    })
    .jpeg()
    .toFile(path.join(fixturesDir, 'high-res-image.jpg'))

    // Create product detail image (800x600)
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    })
    .jpeg()
    .toFile(path.join(fixturesDir, 'product-detail.jpg'))

    console.log('Test fixtures created successfully')
  } catch (error) {
    console.error('Error creating test fixtures:', error)
  }
}

// Create test data files
function createTestData() {
  const testProducts = [
    {
      id: 'TEST_PROD_001',
      name: 'Test Bed Sheet Set',
      description: 'High quality cotton bed sheet set for testing',
      price: 99.99,
      category: 'sheets',
      stock_quantity: 50,
      variants: [
        { type: 'size', value: 'Queen', stock: 25 },
        { type: 'size', value: 'King', stock: 25 }
      ]
    },
    {
      id: 'TEST_PROD_002',
      name: 'Test Pillow',
      description: 'Comfortable pillow for testing',
      price: 29.99,
      category: 'pillows',
      stock_quantity: 100
    }
  ]

  const testUsers = [
    {
      id: 'TEST_USER_001',
      email: 'test@example.com',
      password: 'password123',
      first_name: 'Test',
      last_name: 'User',
      role: 'customer'
    },
    {
      id: 'TEST_ADMIN_001',
      email: 'admin@example.com',
      password: 'admin123',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin'
    }
  ]

  const testOrders = [
    {
      id: 'TEST_ORDER_001',
      customer_id: 'TEST_USER_001',
      total_amount: 129.98,
      status: 'pending',
      items: [
        { product_id: 'TEST_PROD_001', quantity: 1, price: 99.99 },
        { product_id: 'TEST_PROD_002', quantity: 1, price: 29.99 }
      ]
    }
  ]

  const testCoupons = [
    {
      code: 'TEST10',
      discount_type: 'percentage',
      discount_value: 10,
      min_order_amount: 0,
      max_uses: 100,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    {
      code: 'FIXED20',
      discount_type: 'fixed_amount',
      discount_value: 20,
      min_order_amount: 50,
      max_uses: 50,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    {
      code: 'EXPIRED',
      discount_type: 'percentage',
      discount_value: 15,
      min_order_amount: 0,
      max_uses: 100,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // Expired yesterday
    }
  ]

  // Write test data files
  fs.writeFileSync(
    path.join(fixturesDir, 'test-products.json'),
    JSON.stringify(testProducts, null, 2)
  )

  fs.writeFileSync(
    path.join(fixturesDir, 'test-users.json'),
    JSON.stringify(testUsers, null, 2)
  )

  fs.writeFileSync(
    path.join(fixturesDir, 'test-orders.json'),
    JSON.stringify(testOrders, null, 2)
  )

  fs.writeFileSync(
    path.join(fixturesDir, 'test-coupons.json'),
    JSON.stringify(testCoupons, null, 2)
  )

  console.log('Test data files created successfully')
}

// Run fixture creation
if (require.main === module) {
  createTestImages()
  createTestData()
}

module.exports = {
  createTestImages,
  createTestData
}