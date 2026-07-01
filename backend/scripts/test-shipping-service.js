const shippingService = require('../services/shippingService');

async function testShippingService() {
  console.log('🚀 Testing Shipping Service...\n');

  try {
    // Test 1: Calculate shipping for US address
    console.log('1. Testing US shipping calculation...');
    const usAddress = {
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

    const usShipping = await shippingService.calculateShipping(usAddress, testItems, 2.5);
    console.log('✅ US Shipping Options:');
    usShipping.options.forEach(option => {
      console.log(`   - ${option.name}: $${option.cost.toFixed(2)} (${option.estimatedDays.min}-${option.estimatedDays.max} days)`);
    });

    // Test 2: Calculate shipping for Canada
    console.log('\n2. Testing Canada shipping calculation...');
    const caAddress = {
      country: 'CA',
      state: 'ON',
      city: 'Toronto',
      postal_code: 'M5V 3A8'
    };

    const caShipping = await shippingService.calculateShipping(caAddress, testItems, 2.5);
    console.log('✅ Canada Shipping Options:');
    caShipping.options.forEach(option => {
      console.log(`   - ${option.name}: $${option.cost.toFixed(2)} (${option.estimatedDays.min}-${option.estimatedDays.max} days)`);
    });

    // Test 3: Test weight calculation
    console.log('\n3. Testing weight calculation...');
    const totalWeight = await shippingService.calculateTotalWeight(testItems);
    console.log(`✅ Total weight calculated: ${totalWeight}kg`);

    // Test 4: Test zone finding
    console.log('\n4. Testing zone finding...');
    const usZone = await shippingService.findShippingZone('US');
    console.log(`✅ US Zone found: ${usZone ? usZone.name : 'Not found'}`);

    const ukZone = await shippingService.findShippingZone('GB');
    console.log(`✅ UK Zone found: ${ukZone ? ukZone.name : 'Not found'}`);

    // Test 5: Test free shipping check
    console.log('\n5. Testing free shipping eligibility...');
    if (usZone) {
      const freeShipping75 = await shippingService.checkFreeShipping(75.00, usZone.id);
      const freeShipping50 = await shippingService.checkFreeShipping(50.00, usZone.id);
      console.log(`✅ $75 order qualifies for free shipping: ${freeShipping75}`);
      console.log(`✅ $50 order qualifies for free shipping: ${freeShipping50}`);
    }

    // Test 6: Get all zones (admin function)
    console.log('\n6. Testing admin functions...');
    const allZones = await shippingService.getAllShippingZones();
    console.log(`✅ Total shipping zones: ${allZones.length}`);
    allZones.forEach(zone => {
      console.log(`   - ${zone.name}: ${zone.countries.join(', ')}`);
    });

    // Test 7: Get rates for US zone
    if (usZone) {
      const usRates = await shippingService.getZoneRates(usZone.id);
      console.log(`\n✅ US Zone rates: ${usRates.length}`);
      usRates.forEach(rate => {
        console.log(`   - ${rate.name}: $${rate.base_rate} + $${rate.per_kg_rate}/kg`);
      });
    }

    console.log('\n🎉 All shipping service tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testShippingService()
    .then(() => {
      console.log('\n✅ Shipping service test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Shipping service test failed:', error);
      process.exit(1);
    });
}

module.exports = testShippingService;