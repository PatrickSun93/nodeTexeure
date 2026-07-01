const axios = require('axios');

const BASE_URL = 'http://localhost:6666/api';

// Test data
const testCoupons = [
  {
    code: 'SAVE10',
    name: '10% Off Everything',
    description: 'Get 10% off your entire order',
    type: 'percentage',
    value: 10,
    minimumOrderAmount: 50,
    maximumDiscountAmount: 100,
    usageLimit: 100,
    usageLimitPerCustomer: 1
  },
  {
    code: 'FIXED20',
    name: '$20 Off',
    description: 'Get $20 off your order',
    type: 'fixed_amount',
    value: 20,
    minimumOrderAmount: 100,
    usageLimit: 50,
    usageLimitPerCustomer: 2
  },
  {
    code: 'FREESHIP',
    name: 'Free Shipping',
    description: 'Free shipping on any order',
    type: 'free_shipping',
    value: 0,
    minimumOrderAmount: 0,
    usageLimit: null,
    usageLimitPerCustomer: 5
  }
];

let adminToken = null;
let createdCoupons = [];

async function loginAsAdmin() {
  try {
    console.log('🔐 Logging in as admin...');
    const response = await axios.post(`${BASE_URL}/users/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    if (response.data.success) {
      adminToken = response.data.data.token;
      console.log('✅ Admin login successful');
      return true;
    } else {
      console.log('❌ Admin login failed:', response.data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Admin login error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function createTestCoupons() {
  console.log('\n📝 Creating test coupons...');
  
  for (const couponData of testCoupons) {
    try {
      const response = await axios.post(`${BASE_URL}/coupons`, couponData, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      if (response.data.success) {
        createdCoupons.push(response.data.data.coupon);
        console.log(`✅ Created coupon: ${couponData.code}`);
      } else {
        console.log(`❌ Failed to create coupon ${couponData.code}:`, response.data.message);
      }
    } catch (error) {
      console.log(`❌ Error creating coupon ${couponData.code}:`, error.response?.data?.message || error.message);
    }
  }
}

async function testCouponValidation() {
  console.log('\n🔍 Testing coupon validation...');
  
  const testCases = [
    {
      name: 'Valid percentage coupon',
      code: 'SAVE10',
      subtotal: 100,
      expectedValid: true,
      expectedDiscount: 10
    },
    {
      name: 'Percentage coupon below minimum',
      code: 'SAVE10',
      subtotal: 30,
      expectedValid: false
    },
    {
      name: 'Valid fixed amount coupon',
      code: 'FIXED20',
      subtotal: 150,
      expectedValid: true,
      expectedDiscount: 20
    },
    {
      name: 'Fixed amount coupon below minimum',
      code: 'FIXED20',
      subtotal: 50,
      expectedValid: false
    },
    {
      name: 'Free shipping coupon',
      code: 'FREESHIP',
      subtotal: 25,
      expectedValid: true,
      expectedDiscount: 0 // Will be calculated based on shipping
    },
    {
      name: 'Invalid coupon code',
      code: 'INVALID',
      subtotal: 100,
      expectedValid: false
    }
  ];

  for (const testCase of testCases) {
    try {
      const response = await axios.post(`${BASE_URL}/coupons/validate`, {
        code: testCase.code,
        subtotal: testCase.subtotal,
        cartItems: []
      });
      
      if (testCase.expectedValid) {
        if (response.data.success) {
          console.log(`✅ ${testCase.name}: Valid (discount: $${response.data.data.discountAmount})`);
          if (testCase.expectedDiscount !== undefined && response.data.data.discountAmount !== testCase.expectedDiscount) {
            console.log(`⚠️  Expected discount $${testCase.expectedDiscount}, got $${response.data.data.discountAmount}`);
          }
        } else {
          console.log(`❌ ${testCase.name}: Expected valid but got invalid`);
        }
      } else {
        console.log(`❌ ${testCase.name}: Expected invalid but got valid`);
      }
    } catch (error) {
      if (!testCase.expectedValid && error.response?.status === 400) {
        console.log(`✅ ${testCase.name}: Correctly invalid (${error.response.data.message})`);
      } else {
        console.log(`❌ ${testCase.name}: Unexpected error:`, error.response?.data?.message || error.message);
      }
    }
  }
}

async function testCouponManagement() {
  console.log('\n📋 Testing coupon management...');
  
  try {
    // Get all coupons
    const listResponse = await axios.get(`${BASE_URL}/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    if (listResponse.data.success) {
      console.log(`✅ Retrieved ${listResponse.data.data.coupons.length} coupons`);
    } else {
      console.log('❌ Failed to retrieve coupons');
    }

    // Get specific coupon
    if (createdCoupons.length > 0) {
      const couponResponse = await axios.get(`${BASE_URL}/coupons/${createdCoupons[0].id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      if (couponResponse.data.success) {
        console.log(`✅ Retrieved specific coupon: ${couponResponse.data.data.coupon.code}`);
      } else {
        console.log('❌ Failed to retrieve specific coupon');
      }
    }

    // Update coupon
    if (createdCoupons.length > 0) {
      const updateResponse = await axios.put(`${BASE_URL}/coupons/${createdCoupons[0].id}`, {
        name: 'Updated 10% Off Everything'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      if (updateResponse.data.success) {
        console.log(`✅ Updated coupon: ${updateResponse.data.data.coupon.name}`);
      } else {
        console.log('❌ Failed to update coupon');
      }
    }

  } catch (error) {
    console.log('❌ Coupon management error:', error.response?.data?.message || error.message);
  }
}

async function testCouponAnalytics() {
  console.log('\n📊 Testing coupon analytics...');
  
  try {
    // Get top performing coupons
    const topResponse = await axios.get(`${BASE_URL}/coupons/analytics/top-performing`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    if (topResponse.data.success) {
      console.log(`✅ Retrieved top performing coupons: ${topResponse.data.data.coupons.length} results`);
    } else {
      console.log('❌ Failed to retrieve top performing coupons');
    }

    // Get specific coupon analytics
    if (createdCoupons.length > 0) {
      const analyticsResponse = await axios.get(`${BASE_URL}/coupons/${createdCoupons[0].id}/analytics`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      if (analyticsResponse.data.success) {
        console.log(`✅ Retrieved coupon analytics for: ${createdCoupons[0].code}`);
        console.log(`   Total uses: ${analyticsResponse.data.data.analytics.overall.total_uses}`);
        console.log(`   Total discount given: $${analyticsResponse.data.data.analytics.overall.total_discount_given || 0}`);
      } else {
        console.log('❌ Failed to retrieve coupon analytics');
      }
    }

  } catch (error) {
    console.log('❌ Analytics error:', error.response?.data?.message || error.message);
  }
}

async function testOrderCouponIntegration() {
  console.log('\n🛒 Testing order-coupon integration...');
  
  try {
    // Test apply coupon endpoint
    const applyResponse = await axios.post(`${BASE_URL}/orders/apply-coupon`, {
      cartId: 'test-cart-id',
      couponCode: 'SAVE10'
    });
    
    // This might fail if cart doesn't exist, but we're testing the endpoint
    console.log('📝 Apply coupon endpoint tested (may fail due to missing cart)');
    
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.message === 'Cart is empty') {
      console.log('✅ Apply coupon endpoint working (cart empty as expected)');
    } else {
      console.log('❌ Apply coupon error:', error.response?.data?.message || error.message);
    }
  }
}

async function cleanupTestCoupons() {
  console.log('\n🧹 Cleaning up test coupons...');
  
  for (const coupon of createdCoupons) {
    try {
      await axios.delete(`${BASE_URL}/coupons/${coupon.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`✅ Deleted coupon: ${coupon.code}`);
    } catch (error) {
      console.log(`❌ Failed to delete coupon ${coupon.code}:`, error.response?.data?.message || error.message);
    }
  }
}

async function runTests() {
  console.log('🚀 Starting Coupon System Tests\n');
  
  // Login as admin
  const loginSuccess = await loginAsAdmin();
  if (!loginSuccess) {
    console.log('❌ Cannot proceed without admin access');
    return;
  }

  // Run tests
  await createTestCoupons();
  await testCouponValidation();
  await testCouponManagement();
  await testCouponAnalytics();
  await testOrderCouponIntegration();
  
  // Cleanup
  await cleanupTestCoupons();
  
  console.log('\n✅ Coupon system tests completed!');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Test interrupted. Cleaning up...');
  if (adminToken && createdCoupons.length > 0) {
    await cleanupTestCoupons();
  }
  process.exit(0);
});

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});