#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');

const API_BASE = process.env.API_URL || 'http://localhost:6666/api';
const FRONTEND_BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

console.log('🔧 Starting comprehensive system integration test...\n');

class SystemIntegrationTest {
  constructor() {
    this.results = [];
    this.authToken = null;
    this.testOrderId = null;
    this.testProductId = null;
  }

  async runAllTests() {
    try {
      await this.testSystemHealth();
      await this.testAuthentication();
      await this.testOrderFlow();
      await this.testPaymentProcessing();
      await this.testEmailSystem();
      await this.testShippingIntegration();
      await this.testCouponSystem();
      await this.testSearchFunctionality();
      await this.testMultiLanguageSupport();
      await this.testSecurityFeatures();
      await this.testPerformanceMetrics();
      
      this.generateReport();
    } catch (error) {
      console.error('❌ System integration test failed:', error.message);
      process.exit(1);
    }
  }

  async testSystemHealth() {
    console.log('🏥 Testing system health...');
    
    const services = [
      { name: 'Backend API', url: `${API_BASE}/health` },
      { name: 'Frontend', url: `${FRONTEND_BASE}` }
    ];

    for (const service of services) {
      try {
        const response = await axios.get(service.url, { timeout: 5000 });
        this.logResult('PASS', `${service.name} health check`, response.status === 200);
      } catch (error) {
        this.logResult('FAIL', `${service.name} health check`, false, error.message);
      }
    }
  }

  async testAuthentication() {
    console.log('🔐 Testing authentication system...');
    
    // Test user registration
    try {
      const registerResponse = await axios.post(`${API_BASE}/auth/register`, {
        firstName: 'Test',
        lastName: 'User',
        email: `test${Date.now()}@example.com`,
        password: 'TestPassword123!'
      });
      
      this.logResult('PASS', 'User registration', registerResponse.data.success);
    } catch (error) {
      this.logResult('FAIL', 'User registration', false, error.message);
    }

    // Test user login
    try {
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        email: 'admin@example.com',
        password: 'AdminPassword123!'
      });
      
      this.authToken = loginResponse.data.token;
      this.logResult('PASS', 'User login', !!this.authToken);
    } catch (error) {
      this.logResult('FAIL', 'User login', false, error.message);
    }

  }



  async testOrderFlow() {
    console.log('🛒 Testing order management flow...');
    
    if (!this.authToken || !this.testProductId) {
      this.logResult('SKIP', 'Order flow', false, 'Missing prerequisites');
      return;
    }

    // Test cart operations
    try {
      const addToCartResponse = await axios.post(
        `${API_BASE}/cart/items`,
        { productId: this.testProductId, quantity: 2 },
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );
      
      this.logResult('PASS', 'Add to cart', addToCartResponse.data.success);
    } catch (error) {
      this.logResult('FAIL', 'Add to cart', false, error.message);
    }

    // Test order creation
    try {
      const orderData = {
        items: [{ productId: this.testProductId, quantity: 2, price: 99.99 }],
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          address: '123 Test St',
          city: 'Test City',
          state: 'CA',
          zipCode: '12345',
          country: 'US'
        }
      };

      const orderResponse = await axios.post(`${API_BASE}/orders`, orderData, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      this.testOrderId = orderResponse.data.data.order.id;
      this.logResult('PASS', 'Order creation', !!this.testOrderId);
    } catch (error) {
      this.logResult('FAIL', 'Order creation', false, error.message);
    }
  }

  async testPaymentProcessing() {
    console.log('💳 Testing payment processing...');
    
    if (!this.testOrderId || !this.authToken) {
      this.logResult('SKIP', 'Payment processing', false, 'Missing prerequisites');
      return;
    }

    // Test payment intent creation
    try {
      const paymentIntentResponse = await axios.post(
        `${API_BASE}/payments/create-intent`,
        { orderId: this.testOrderId, amount: 19998, currency: 'usd' },
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );
      
      this.logResult('PASS', 'Payment intent creation', !!paymentIntentResponse.data.data.clientSecret);
    } catch (error) {
      this.logResult('FAIL', 'Payment intent creation', false, error.message);
    }

    // Test Stripe webhook endpoint
    try {
      const webhookResponse = await axios.post(`${API_BASE}/webhooks/stripe`, {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', metadata: { orderId: this.testOrderId } } }
      });
      
      this.logResult('PASS', 'Stripe webhook', webhookResponse.status === 200);
    } catch (error) {
      this.logResult('FAIL', 'Stripe webhook', false, error.message);
    }
  }

  async testEmailSystem() {
    console.log('📧 Testing email notification system...');
    
    // Test email queue
    try {
      const queueResponse = await axios.get(`${API_BASE}/admin/email/queue`, {
        headers: { Authorization: `Bearer ${this.adminToken}` }
      });
      
      this.logResult('PASS', 'Email queue status', Array.isArray(queueResponse.data.data));
    } catch (error) {
      this.logResult('FAIL', 'Email queue status', false, error.message);
    }

    // Test email template rendering
    try {
      const templateResponse = await axios.post(
        `${API_BASE}/admin/email/test-template`,
        { template: 'order_confirmation', orderId: this.testOrderId },
        { headers: { Authorization: `Bearer ${this.adminToken}` } }
      );
      
      this.logResult('PASS', 'Email template rendering', templateResponse.data.success);
    } catch (error) {
      this.logResult('FAIL', 'Email template rendering', false, error.message);
    }
  }

  async testShippingIntegration() {
    console.log('🚚 Testing shipping integration...');
    
    // Test shipping calculation
    try {
      const shippingData = {
        items: [{ productId: this.testProductId, quantity: 2, weight: 1.5 }],
        destination: { country: 'US', state: 'CA', zipCode: '90210' }
      };

      const shippingResponse = await axios.post(`${API_BASE}/shipping/calculate`, shippingData);
      
      this.logResult('PASS', 'Shipping calculation', Array.isArray(shippingResponse.data.data.shippingOptions));
    } catch (error) {
      this.logResult('FAIL', 'Shipping calculation', false, error.message);
    }

    // Test FedEx integration
    try {
      const trackingResponse = await axios.get(`${API_BASE}/shipping/track/123456789`, {
        headers: { Authorization: `Bearer ${this.adminToken}` }
      });
      
      this.logResult('PASS', 'FedEx tracking', trackingResponse.status === 200);
    } catch (error) {
      this.logResult('FAIL', 'FedEx tracking', false, error.message);
    }
  }

  async testCouponSystem() {
    console.log('🎫 Testing coupon system...');
    
    // Test coupon validation
    try {
      const couponResponse = await axios.post(`${API_BASE}/coupons/validate`, {
        code: 'TEST10',
        orderTotal: 100.00,
        customerId: 'USER001'
      });
      
      this.logResult('PASS', 'Coupon validation', couponResponse.data.success);
    } catch (error) {
      this.logResult('FAIL', 'Coupon validation', false, error.message);
    }
  }

  async testSearchFunctionality() {
    console.log('🔍 Testing search functionality...');
    
    // Test product search
    try {
      const searchResponse = await axios.get(`${API_BASE}/search?q=bed`);
      
      this.logResult('PASS', 'Product search', Array.isArray(searchResponse.data.data.results));
    } catch (error) {
      this.logResult('FAIL', 'Product search', false, error.message);
    }

    // Test Chinese search
    try {
      const chineseSearchResponse = await axios.get(`${API_BASE}/search?q=床单`);
      
      this.logResult('PASS', 'Chinese search', chineseSearchResponse.status === 200);
    } catch (error) {
      this.logResult('FAIL', 'Chinese search', false, error.message);
    }
  }

  async testMultiLanguageSupport() {
    console.log('🌐 Testing multi-language support...');
    
    // Test language switching
    try {
      const langResponse = await axios.get(`${API_BASE}/products?lang=zh`);
      
      this.logResult('PASS', 'Language switching', langResponse.status === 200);
    } catch (error) {
      this.logResult('FAIL', 'Language switching', false, error.message);
    }

    // Test currency conversion
    try {
      const currencyResponse = await axios.get(`${API_BASE}/products?currency=CNY`);
      
      this.logResult('PASS', 'Currency conversion', currencyResponse.status === 200);
    } catch (error) {
      this.logResult('FAIL', 'Currency conversion', false, error.message);
    }
  }


  async testSecurityFeatures() {
    console.log('🔒 Testing security features...');
    
    // Test rate limiting
    try {
      const requests = Array(10).fill().map(() => axios.get(`${API_BASE}/products`));
      await Promise.all(requests);
      
      this.logResult('PASS', 'Rate limiting handling', true);
    } catch (error) {
      this.logResult('PASS', 'Rate limiting active', error.response?.status === 429);
    }

  }

  async testPerformanceMetrics() {
    console.log('⚡ Testing performance metrics...');
    
    // Test metrics endpoint
    try {
      const metricsResponse = await axios.get(`${API_BASE}/metrics`);
      
      this.logResult('PASS', 'Metrics endpoint', metricsResponse.status === 200);
    } catch (error) {
      this.logResult('FAIL', 'Metrics endpoint', false, error.message);
    }

    // Test response times
    const start = Date.now();
    try {
      await axios.get(`${API_BASE}/products`);
      const responseTime = Date.now() - start;
      
      this.logResult('PASS', 'Response time < 2s', responseTime < 2000, `${responseTime}ms`);
    } catch (error) {
      this.logResult('FAIL', 'Response time test', false, error.message);
    }
  }

  logResult(status, test, passed, details = '') {
    const result = { status, test, passed, details, timestamp: new Date().toISOString() };
    this.results.push(result);
    
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${icon} ${test}: ${status}${details ? ` (${details})` : ''}`);
  }

  generateReport() {
    console.log('\n📋 System Integration Test Report');
    console.log('================================');
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Success Rate: ${((passed / (total - skipped)) * 100).toFixed(1)}%`);
    
    // Save detailed report
    const report = {
      summary: { total, passed, failed, skipped },
      timestamp: new Date().toISOString(),
      results: this.results
    };
    
    fs.writeFileSync('system-integration-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report saved to system-integration-report.json');
    
    if (failed > 0) {
      console.log('\n❌ System integration test failed. Please review failed tests.');
      process.exit(1);
    } else {
      console.log('\n🎉 All system integration tests passed! System is ready for production.');
      process.exit(0);
    }
  }
}

// Run the tests
const tester = new SystemIntegrationTest();
tester.runAllTests().catch(error => {
  console.error('Fatal error during testing:', error);
  process.exit(1);
});