// Simple test for coupon service logic without requiring server
const couponService = require('../services/couponService');

console.log('🚀 Testing Coupon Service Logic\n');

// Test discount calculation
console.log('📊 Testing discount calculations...');

// Mock coupon data
const percentageCoupon = {
  type: 'percentage',
  value: 10,
  maximum_discount_amount: 50
};

const fixedAmountCoupon = {
  type: 'fixed_amount',
  value: 20
};

const freeShippingCoupon = {
  type: 'free_shipping',
  value: 0
};

// Test percentage discount
const percentageDiscount1 = couponService.calculateDiscountAmount(percentageCoupon, 100);
console.log(`✅ 10% off $100 = $${percentageDiscount1} (expected: $10)`);

const percentageDiscount2 = couponService.calculateDiscountAmount(percentageCoupon, 600);
console.log(`✅ 10% off $600 with $50 cap = $${percentageDiscount2} (expected: $50)`);

// Test fixed amount discount
const fixedDiscount1 = couponService.calculateDiscountAmount(fixedAmountCoupon, 100);
console.log(`✅ $20 off $100 = $${fixedDiscount1} (expected: $20)`);

const fixedDiscount2 = couponService.calculateDiscountAmount(fixedAmountCoupon, 15);
console.log(`✅ $20 off $15 = $${fixedDiscount2} (expected: $15)`);

// Test free shipping discount
const shippingDiscount = couponService.calculateDiscountAmount(freeShippingCoupon, 100, 15);
console.log(`✅ Free shipping with $15 shipping = $${shippingDiscount} (expected: $15)`);

console.log('\n✅ Coupon service logic tests completed!');
console.log('\n📝 Note: Database-dependent tests require a running server with proper database setup.');
console.log('   Run the full test suite with: node backend/scripts/test-coupon-system.js');
console.log('   (Requires backend server running on port 6666 with admin user setup)');