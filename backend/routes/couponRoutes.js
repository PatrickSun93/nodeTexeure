const express = require('express');
const router = express.Router();
const couponService = require('../services/couponService');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');

// GET /api/coupons - Get all coupons (admin only)
router.get('/', protect, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      type: req.query.type,
      search: req.query.search
    };

    const result = await couponService.getAllCoupons(page, limit, filters);
    
    res.json(ResponseFormatter.success('Coupons retrieved successfully', {
      coupons: result.coupons,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        limit
      }
    }));
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch coupons'));
  }
});

// GET /api/coupons/:id - Get coupon by ID (admin only)
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const coupon = await couponService.getCouponById(req.params.id);
    
    if (!coupon) {
      return res.status(404).json(ResponseFormatter.failure('Coupon not found'));
    }

    res.json(ResponseFormatter.success('Coupon retrieved successfully', { coupon }));
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch coupon'));
  }
});

// POST /api/coupons - Create new coupon (admin only)
router.post('/', protect, admin, async (req, res) => {
  try {
    const {
      code,
      name,
      description,
      type,
      value,
      minimumOrderAmount,
      maximumDiscountAmount,
      usageLimit,
      usageLimitPerCustomer,
      startsAt,
      expiresAt,
      applicableProducts,
      excludedProducts
    } = req.body;

    // Validation
    if (!code || !name || !type || value === undefined) {
      return res.status(400).json(ResponseFormatter.failure(
        'Missing required fields: code, name, type, and value are required'
      ));
    }

    if (!['percentage', 'fixed_amount', 'free_shipping'].includes(type)) {
      return res.status(400).json(ResponseFormatter.failure(
        'Invalid coupon type. Must be: percentage, fixed_amount, or free_shipping'
      ));
    }

    if (type === 'percentage' && (value < 0 || value > 100)) {
      return res.status(400).json(ResponseFormatter.failure(
        'Percentage value must be between 0 and 100'
      ));
    }

    if (type === 'fixed_amount' && value < 0) {
      return res.status(400).json(ResponseFormatter.failure(
        'Fixed amount value must be greater than 0'
      ));
    }

    // Check if code already exists
    const existingCoupon = await couponService.getCouponByCode(code);
    if (existingCoupon) {
      return res.status(400).json(ResponseFormatter.failure(
        'Coupon code already exists'
      ));
    }

    const couponData = {
      code: code.toUpperCase(),
      name,
      description,
      type,
      value: parseFloat(value),
      minimumOrderAmount: minimumOrderAmount ? parseFloat(minimumOrderAmount) : 0,
      maximumDiscountAmount: maximumDiscountAmount ? parseFloat(maximumDiscountAmount) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      usageLimitPerCustomer: usageLimitPerCustomer ? parseInt(usageLimitPerCustomer) : 1,
      startsAt: startsAt || null,
      expiresAt: expiresAt || null,
      applicableProducts: applicableProducts || [],
      excludedProducts: excludedProducts || [],
      createdBy: req.user.id
    };

    const coupon = await couponService.createCoupon(couponData);
    
    res.status(201).json(ResponseFormatter.success('Coupon created successfully', { coupon }));
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to create coupon'));
  }
});

// PUT /api/coupons/:id - Update coupon (admin only)
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const coupon = await couponService.updateCoupon(req.params.id, req.body);
    res.json(ResponseFormatter.success('Coupon updated successfully', { coupon }));
  } catch (error) {
    console.error('Error updating coupon:', error);
    if (error.message === 'Coupon not found') {
      return res.status(404).json(ResponseFormatter.failure('Coupon not found'));
    }
    res.status(500).json(ResponseFormatter.failure('Failed to update coupon'));
  }
});

// DELETE /api/coupons/:id - Delete coupon (admin only)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    await couponService.deleteCoupon(req.params.id);
    res.json(ResponseFormatter.success('Coupon deleted successfully'));
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to delete coupon'));
  }
});

// POST /api/coupons/validate - Validate coupon code (public endpoint)
router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal, userId, cartItems } = req.body;

    if (!code || subtotal === undefined) {
      return res.status(400).json(ResponseFormatter.failure(
        'Coupon code and subtotal are required'
      ));
    }

    const validation = await couponService.validateCoupon(
      code.toUpperCase(), 
      parseFloat(subtotal), 
      userId, 
      cartItems || []
    );

    if (!validation.valid) {
      return res.status(400).json(ResponseFormatter.failure(validation.message));
    }

    const discountAmount = couponService.calculateDiscountAmount(
      validation.coupon, 
      parseFloat(subtotal)
    );

    res.json(ResponseFormatter.success('Coupon is valid', {
      coupon: {
        id: validation.coupon.id,
        code: validation.coupon.code,
        name: validation.coupon.name,
        type: validation.coupon.type,
        value: validation.coupon.value
      },
      discountAmount
    }));
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to validate coupon'));
  }
});

// GET /api/coupons/:id/analytics - Get coupon analytics (admin only)
router.get('/:id/analytics', protect, admin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const analytics = await couponService.getCouponAnalytics(
      req.params.id, 
      startDate, 
      endDate
    );
    
    res.json(ResponseFormatter.success('Coupon analytics retrieved successfully', { analytics }));
  } catch (error) {
    console.error('Error fetching coupon analytics:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch coupon analytics'));
  }
});

// GET /api/coupons/analytics/top-performing - Get top performing coupons (admin only)
router.get('/analytics/top-performing', protect, admin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { startDate, endDate } = req.query;
    
    const topCoupons = await couponService.getTopPerformingCoupons(limit, startDate, endDate);
    
    res.json(ResponseFormatter.success('Top performing coupons retrieved successfully', { 
      coupons: topCoupons 
    }));
  } catch (error) {
    console.error('Error fetching top performing coupons:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch top performing coupons'));
  }
});

module.exports = router;