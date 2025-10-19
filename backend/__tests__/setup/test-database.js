const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

class TestDatabase {
  constructor() {
    this.connection = null
    this.testDbName = `test_ecommerce_${Date.now()}`
  }

  async setup() {
    try {
      // Create connection to MySQL server (without database)
      this.connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true
      })

      // Create test database
      await this.connection.execute(`CREATE DATABASE IF NOT EXISTS ${this.testDbName}`)
      await this.connection.execute(`USE ${this.testDbName}`)

      // Load and execute schema
      const schemaPath = path.join(__dirname, '../../database/database_schema.sql')
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8')
        await this.connection.execute(schema)
      }

      // Load test fixtures
      await this.loadTestFixtures()

      console.log(`Test database ${this.testDbName} created successfully`)
      return this.testDbName
    } catch (error) {
      console.error('Error setting up test database:', error)
      throw error
    }
  }

  async loadTestFixtures() {
    const fixturesPath = path.join(__dirname, '../../test-fixtures')
    
    try {
      // Load test products
      const productsFile = path.join(fixturesPath, 'test-products.json')
      if (fs.existsSync(productsFile)) {
        const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'))
        
        for (const product of products) {
          await this.connection.execute(
            `INSERT INTO products (id, name, description, base_price, category, stock_quantity, is_active, status) 
             VALUES (?, ?, ?, ?, ?, ?, 1, 'approved')`,
            [product.id, product.name, product.description, product.price, product.category, product.stock_quantity]
          )

          // Insert variants if they exist
          if (product.variants) {
            for (const variant of product.variants) {
              await this.connection.execute(
                `INSERT INTO product_variants (id, product_id, variant_type, variant_value, stock_quantity) 
                 VALUES (?, ?, ?, ?, ?)`,
                [`${product.id}_${variant.value}`, product.id, variant.type, variant.value, variant.stock]
              )
            }
          }
        }
      }

      // Load test users
      const usersFile = path.join(fixturesPath, 'test-users.json')
      if (fs.existsSync(usersFile)) {
        const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))
        
        for (const user of users) {
          await this.connection.execute(
            `INSERT INTO users (id, email, password_hash, first_name, last_name, role, email_verified) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [user.id, user.email, user.password, user.first_name, user.last_name, user.role]
          )
        }
      }

      // Load test coupons
      const couponsFile = path.join(fixturesPath, 'test-coupons.json')
      if (fs.existsSync(couponsFile)) {
        const coupons = JSON.parse(fs.readFileSync(couponsFile, 'utf8'))
        
        for (const coupon of coupons) {
          await this.connection.execute(
            `INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [coupon.code, coupon.discount_type, coupon.discount_value, coupon.min_order_amount, coupon.max_uses, coupon.expires_at]
          )
        }
      }

      // Load test orders
      const ordersFile = path.join(fixturesPath, 'test-orders.json')
      if (fs.existsSync(ordersFile)) {
        const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'))
        
        for (const order of orders) {
          await this.connection.execute(
            `INSERT INTO orders (id, customer_id, total_amount, status, created_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [order.id, order.customer_id, order.total_amount, order.status]
          )

          // Insert order items
          if (order.items) {
            for (const item of order.items) {
              await this.connection.execute(
                `INSERT INTO order_items (order_id, product_id, quantity, price) 
                 VALUES (?, ?, ?, ?)`,
                [order.id, item.product_id, item.quantity, item.price]
              )
            }
          }
        }
      }

      console.log('Test fixtures loaded successfully')
    } catch (error) {
      console.error('Error loading test fixtures:', error)
      throw error
    }
  }

  async cleanup() {
    try {
      if (this.connection) {
        await this.connection.execute(`DROP DATABASE IF EXISTS ${this.testDbName}`)
        await this.connection.end()
        console.log(`Test database ${this.testDbName} cleaned up`)
      }
    } catch (error) {
      console.error('Error cleaning up test database:', error)
    }
  }

  async query(sql, params = []) {
    if (!this.connection) {
      throw new Error('Database connection not established')
    }
    
    const [rows] = await this.connection.execute(sql, params)
    return rows
  }

  async beginTransaction() {
    await this.connection.beginTransaction()
  }

  async commit() {
    await this.connection.commit()
  }

  async rollback() {
    await this.connection.rollback()
  }
}

module.exports = TestDatabase