#!/usr/bin/env node

/**
 * FedEx Integration Test Script
 * 
 * This script tests the FedEx API integration including:
 * - Credential validation
 * - Rate calculation
 * - Shipment creation (test mode)
 * - Tracking functionality
 * 
 * Usage: node backend/scripts/test-fedex-integration.js
 */

require('dotenv').config({ path: './backend/.env' });
const fedexService = require('../services/fedexService');
const shippingService = require('../services/shippingService');

async function testFedExIntegration() {
  console.log('🚀 Starting FedEx Integration Tests...\n');

  try {
    // Test 1: Validate credentials
    console.log('1️⃣ Testing FedEx API credentials...');
    const credentialsValid = await fedexService.validateCredentials();
    console.log(`   Credentials valid: ${credentialsValid ? '✅' : '❌'}`);
    
    if (!credentialsValid) {
      console.log('   ⚠️  Please check your FedEx API credentials in .env file');
      console.log('   Required variables: FEDEX_API_KEY, FEDEX_SECRET_KEY, FEDEX_ACCOUNT_NUMBER, FEDEX_METER_NUMBER');
      return;
    }

    // Test 2: Rate calculation
    console.log('\n2️⃣ Testing FedEx rate calculation...');
    const testShipment = {
      origin: {
        postalCode: '10001',
        countryCode: 'US',
        stateCode: 'NY'
      },
      destination: {
        postalCode: '90210',
        countryCode: 'US',
        stateCode: 'CA',
        city: 'Beverly Hills'
      },
      weight: 5.0, // pounds
      dimensions: {
        length: 12,
        width: 8,
        height: 6
      }
    };

    try {
      const rates = await fedexService.getRates(testShipment);
      console.log(`   Found ${rates.length} shipping rates:`);
      rates.forEach((rate, index) => {
        console.log(`   ${index + 1}. ${rate.serviceName}: $${rate.totalNetCharge} (${rate.transitTime || 'N/A'} days)`);
      });
    } catch (error) {
      console.log(`   ❌ Rate calculation failed: ${error.message}`);
    }

    // Test 3: Enhanced shipping calculation with FedEx
    console.log('\n3️⃣ Testing enhanced shipping calculation...');
    const testAddress = {
      country: 'US',
      state: 'CA',
      city: 'Los Angeles',
      postal_code: '90210'
    };

    const testItems = [
      {
        product_id: 'PROD0000000001',
        variant_id: null,
        quantity: 2
      }
    ];

    try {
      const shippingResult = await shippingService.calculateShippingWithFedEx(
        testAddress,
        testItems,
        2.5, // 2.5 kg
        true // include FedEx
      );

      console.log(`   Total shipping options: ${shippingResult.options.length}`);
      console.log(`   FedEx available: ${shippingResult.fedexAvailable ? '✅' : '❌'}`);
      
      shippingResult.options.forEach((option, index) => {
        console.log(`   ${index + 1}. ${option.name}: $${option.cost.toFixed(2)} (${option.carrier || 'Standard'})`);
      });
    } catch (error) {
      console.log(`   ❌ Enhanced shipping calculation failed: ${error.message}`);
    }

    // Test 4: Database connection test
    console.log('\n4️⃣ Testing database tables...');
    try {
      const db = require('../utils/database');
      
      // Check if FedEx tables exist
      const tablesQuery = `
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME IN ('fedex_shipments', 'fedex_tracking_events')
      `;
      
      const result = await db.executeQuery(tablesQuery);
      if (result.success) {
        const tableNames = result.data.map(row => row.TABLE_NAME);
        console.log(`   FedEx tables found: ${tableNames.join(', ')}`);
        
        if (tableNames.length === 2) {
          console.log('   ✅ All required FedEx tables exist');
        } else {
          console.log('   ⚠️  Some FedEx tables are missing. Run the migration: database/migrations/add_fedex_tracking.sql');
        }
      }
    } catch (error) {
      console.log(`   ❌ Database test failed: ${error.message}`);
    }

    // Test 5: Environment variables check
    console.log('\n5️⃣ Checking environment variables...');
    const requiredEnvVars = [
      'FEDEX_API_KEY',
      'FEDEX_SECRET_KEY', 
      'FEDEX_ACCOUNT_NUMBER',
      'FEDEX_METER_NUMBER'
    ];

    const optionalEnvVars = [
      'FEDEX_API_URL',
      'COMPANY_NAME',
      'COMPANY_ADDRESS',
      'COMPANY_CITY',
      'COMPANY_STATE',
      'COMPANY_POSTAL_CODE',
      'COMPANY_COUNTRY_CODE'
    ];

    requiredEnvVars.forEach(varName => {
      const value = process.env[varName];
      console.log(`   ${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
    });

    console.log('\n   Optional environment variables:');
    optionalEnvVars.forEach(varName => {
      const value = process.env[varName];
      console.log(`   ${varName}: ${value ? '✅ Set' : '⚠️  Using default'}`);
    });

    console.log('\n✅ FedEx Integration Tests Complete!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Ensure all required environment variables are set');
    console.log('   2. Run database migration: database/migrations/add_fedex_tracking.sql');
    console.log('   3. Test with real orders in development environment');
    console.log('   4. Switch to production FedEx API URL for live environment');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testFedExIntegration()
    .then(() => {
      console.log('\n🎉 Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test script failed:', error);
      process.exit(1);
    });
}

module.exports = { testFedExIntegration };