#!/usr/bin/env node

/**
 * Test script for tax calculation functionality
 * Tests the tax service and API endpoints
 */

const axios = require('axios');
const taxService = require('../services/taxService');

const BASE_URL = 'http://localhost:6666';

// Test data
const testAddresses = [
  {
    name: 'California, US',
    address: {
      country: 'US',
      state: 'CA',
      city: 'Los Angeles',
      postal_code: '90210'
    }
  },
  {
    name: 'New York, US',
    address: {
      country: 'US',
      state: 'NY',
      city: 'New York',
      postal_code: '10001'
    }
  },
  {
    name: 'Texas, US',
    address: {
      country: 'US',
      state: 'TX',
      city: 'Houston',
      postal_code: '77001'
    }
  },
  {
    name: 'Oregon, US (no sales tax)',
    address: {
      country: 'US',
      state: 'OR',
      city: 'Portland',
      postal_code: '97201'
    }
  },
  {
    name: 'Ontario, Canada',
    address: {
      country: 'CA',
      state: 'ON',
      city: 'Toronto',
      postal_code: 'M5V 3A8'
    }
  },
  {
    name: 'United Kingdom',
    address: {
      country: 'GB',
      city: 'London',
      postal_code: 'SW1A 1AA'
    }
  }
];

const testItems = [
  {
    product_id: 'PROD001',
    name: 'Luxury Bed Sheet Set',
    quantity: 2,
    price: 89.99
  },
  {
    product_id: 'PROD002',
    name: 'Premium Comforter',
    quantity: 1,
    price: 149.99
  }
];

const subtotal = testItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

async function testTaxService() {
  console.log('🧪 Testing Tax Service...\n');
  
  for (const testCase of testAddresses) {
    try {
      console.log(`Testing: ${testCase.name}`);
      console.log(`Address:`, testCase.address);
      
      const result = await taxService.calculateTax(testCase.address, testItems, subtotal);
      
      console.log(`Subtotal: $${subtotal.toFixed(2)}`);
      console.log(`Tax Amount: $${result.taxAmount.toFixed(2)}`);
      console.log(`Tax Rate: ${(result.taxRate * 100).toFixed(2)}%`);
      
      if (result.breakdown && result.breakdown.length > 0) {
        console.log('Tax Breakdown:');
        result.breakdown.forEach(tax => {
          console.log(`  - ${tax.name}: ${tax.rate} = $${tax.amount}`);
        });
      }
      
      console.log('✅ Success\n');
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }
}

async function testTaxAPI() {
  console.log('🌐 Testing Tax API Endpoints...\n');
  
  // Test tax calculation endpoint
  console.log('Testing POST /api/tax/calculate');
  
  for (const testCase of testAddresses) {
    try {
      const response = await axios.post(`${BASE_URL}/api/tax/calculate`, {
        address: testCase.address,
        items: testItems,
        subtotal: subtotal
      });
      
      console.log(`✅ ${testCase.name}: Tax = $${response.data.data.taxAmount.toFixed(2)}`);
      
    } catch (error) {
      console.log(`❌ ${testCase.name}: ${error.response?.data?.message || error.message}`);
    }
  }
  
  console.log('\nTesting GET /api/tax/rates/location/US');
  try {
    const response = await axios.get(`${BASE_URL}/api/tax/rates/location/US`);
    console.log(`✅ Found ${response.data.data.taxRates.length} US tax rates`);
  } catch (error) {
    console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
  }
  
  console.log('\nTesting GET /api/tax/rates/location/CA (Canada)');
  try {
    const response = await axios.get(`${BASE_URL}/api/tax/rates/location/CA`);
    console.log(`✅ Found ${response.data.data.taxRates.length} Canadian tax rates`);
  } catch (error) {
    console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
  }
}

async function testTaxRatesManagement() {
  console.log('\n🔧 Testing Tax Rates Management...\n');
  
  // Note: These tests require admin authentication
  // For now, just test the service methods directly
  
  try {
    console.log('Testing getAllTaxRates...');
    const allRates = await taxService.getAllTaxRates({ country: 'US' });
    console.log(`✅ Found ${allRates.length} US tax rates`);
    
    console.log('\nTesting getTaxRates for specific address...');
    const rates = await taxService.getTaxRates({
      country: 'US',
      state: 'CA',
      city: 'Los Angeles'
    });
    console.log(`✅ Found ${rates.length} tax rates for Los Angeles, CA`);
    
    if (rates.length > 0) {
      console.log('Sample tax rate:');
      console.log(`  - ${rates[0].tax_name}: ${(rates[0].tax_rate * 100).toFixed(2)}%`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 Starting Tax Calculation Tests\n');
  console.log(`Test Subtotal: $${subtotal.toFixed(2)}`);
  console.log(`Test Items: ${testItems.length} items\n`);
  
  try {
    await testTaxService();
    await testTaxAPI();
    await testTaxRatesManagement();
    
    console.log('🎉 All tests completed!');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testTaxService,
  testTaxAPI,
  testTaxRatesManagement,
  runTests
};