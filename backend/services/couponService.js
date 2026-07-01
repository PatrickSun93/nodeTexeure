const db = require('../utils/database');

class CouponService {
  /**
   * Create a new coupon
   */
  async createCoupon(couponData) {
    const {
      code,
      name,
      description,
      type,
      value,
      minimumOrderAmount = 0,
      maximumDiscountAmount = null,
      usageLimit = null,
      usageLimitPerCustomer = 1,
      startsAt = null,
      expiresAt = null,
      applicableProducts = null,
      excludedProducts = null,
      createdBy
    } = couponData;

    // Generate unique ID
    const couponId = await db.executeQuery('SELECT get_next_id("DISC") as id');
    const id = couponId[0].id;

    // Prepare discount details JSON
    const discountDetails = {
      description: description || '',
      terms_conditions: '',
      applicable_products: applicableProducts || [],
      excluded_products: excludedProducts || [],
      marketing_message: ''
    };

    const query = `
      INSERT INTO discount_codes (
        id, code, name, discount_details, type, value, 
        minimum_order_amount, maximum_discount_amount, 
        usage_limit, usage_limit_per_customer, 
        starts_at, expires_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id, code, name, JSON.stringify(discountDetails), type, value,
      minimumOrderAmount, maximumDiscountAmount,
      usageLimit, usageLimitPerCustomer,
      startsAt, expiresAt, createdBy
    ];

    await db.executeQuery(query, params);
    return this.getCouponById(id);
  }

  /**
   * Get coupon by ID
   */
  async getCouponById(id) {
    const query = `
      SELECT dc.*, u.first_name, u.last_name
      FROM discount_codes dc
      LEFT JOIN users u ON dc.created_by = u.id
      WHERE dc.id = ?
    `;
    const result = await db.executeQuery(query, [id]);
    
    if (result.length === 0) {
      return null;
    }

    const coupon = result[0];
    coupon.discount_details = JSON.parse(coupon.discount_details);
    return coupon;
  }

  /**
   * Get coupon by code
   */
  async getCouponByCode(code) {
    const query = `
      SELECT dc.*, u.first_name, u.last_name
      FROM discount_codes dc
      LEFT JOIN users u ON dc.created_by = u.id
      WHERE dc.code = ?
    `;
    const result = await db.executeQuery(query, [code]);
    
    if (result.length === 0) {
      return null;
    }

    const coupon = result[0];
    coupon.discount_details = JSON.parse(coupon.discount_details);
    return coupon;
  }

  /**
   * Get all coupons with pagination
   */
  async getAllCoupons(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];

    // Apply filters
    if (filters.isActive !== undefined) {
      whereClause += ' AND dc.is_active = ?';
      params.push(filters.isActive);
    }

    if (filters.type) {
      whereClause += ' AND dc.type = ?';
      params.push(filters.type);
    }

    if (filters.search) {
      whereClause += ' AND (dc.code LIKE ? OR dc.name LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const query = `
      SELECT dc.*, u.first_name, u.last_name,
        COUNT(*) OVER() as total_count
      FROM discount_codes dc
      LEFT JOIN users u ON dc.created_by = u.id
      ${whereClause}
      ORDER BY dc.created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);
    const result = await db.executeQuery(query, params);

    const coupons = result.map(coupon => {
      coupon.discount_details = JSON.parse(coupon.discount_details);
      return coupon;
    });

    return {
      coupons,
      totalCount: result.length > 0 ? result[0].total_count : 0,
      currentPage: page,
      totalPages: Math.ceil((result.length > 0 ? result[0].total_count : 0) / limit)
    };
  }

  /**
   * Update coupon
   */
  async updateCoupon(id, updateData) {
    const existingCoupon = await this.getCouponById(id);
    if (!existingCoupon) {
      throw new Error('Coupon not found');
    }

    const allowedFields = [
      'name', 'type', 'value', 'minimum_order_amount', 
      'maximum_discount_amount', 'usage_limit', 'usage_limit_per_customer',
      'is_active', 'starts_at', 'expires_at'
    ];

    const updateFields = [];
    const params = [];

    // Handle discount_details separately
    if (updateData.description || updateData.applicableProducts || updateData.excludedProducts) {
      const discountDetails = {
        ...existingCoupon.discount_details,
        description: updateData.description || existingCoupon.discount_details.description,
        applicable_products: updateData.applicableProducts || existingCoupon.discount_details.applicable_products,
        excluded_products: updateData.excludedProducts || existingCoupon.discount_details.excluded_products
      };
      updateFields.push('discount_details = ?');
      params.push(JSON.stringify(discountDetails));
    }

    // Handle other fields
    allowedFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        updateFields.push(`${field} = ?`);
        params.push(updateData[field]);
      }
    });

    if (updateFields.length === 0) {
      return existingCoupon;
    }

    updateFields.push('updated_at = NOW()');
    params.push(id);

    const query = `
      UPDATE discount_codes 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;

    await db.executeQuery(query, params);
    return this.getCouponById(id);
  }

  /**
   * Delete coupon (soft delete by setting inactive)
   */
  async deleteCoupon(id) {
    const query = `
      UPDATE discount_codes 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = ?
    `;
    await db.executeQuery(query, [id]);
    return true;
  }

  /**
   * Validate coupon for use
   */
  async validateCoupon(code, subtotal, userId = null, cartItems = []) {
    const coupon = await this.getCouponByCode(code);
    
    if (!coupon) {
      return { valid: false, message: 'Invalid coupon code' };
    }

    // Check if coupon is active
    if (!coupon.is_active) {
      return { valid: false, message: 'This coupon is no longer active' };
    }

    // Check start date
    if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
      return { valid: false, message: 'This coupon is not yet valid' };
    }

    // Check expiration date
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return { valid: false, message: 'This coupon has expired' };
    }

    // Check minimum order amount
    if (subtotal < coupon.minimum_order_amount) {
      return { 
        valid: false, 
        message: `Minimum order amount of $${coupon.minimum_order_amount} required` 
      };
    }

    // Check total usage limit
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return { valid: false, message: 'This coupon has reached its usage limit' };
    }

    // Check per-customer usage limit
    if (userId && coupon.usage_limit_per_customer) {
      const usageQuery = `
        SELECT COUNT(*) as usage_count
        FROM discount_code_usage
        WHERE discount_code_id = ? AND user_id = ?
      `;
      const usageResult = await db.executeQuery(usageQuery, [coupon.id, userId]);
      
      if (usageResult[0].usage_count >= coupon.usage_limit_per_customer) {
        return { 
          valid: false, 
          message: 'You have already used this coupon the maximum number of times' 
        };
      }
    }

    // Check product restrictions
    if (coupon.discount_details.applicable_products && coupon.discount_details.applicable_products.length > 0) {
      const applicableProductIds = cartItems.map(item => item.product_id);
      const hasApplicableProduct = coupon.discount_details.applicable_products.some(
        productId => applicableProductIds.includes(productId)
      );
      
      if (!hasApplicableProduct) {
        return { 
          valid: false, 
          message: 'This coupon is not applicable to items in your cart' 
        };
      }
    }

    // Check excluded products
    if (coupon.discount_details.excluded_products && coupon.discount_details.excluded_products.length > 0) {
      const cartProductIds = cartItems.map(item => item.product_id);
      const hasExcludedProduct = coupon.discount_details.excluded_products.some(
        productId => cartProductIds.includes(productId)
      );
      
      if (hasExcludedProduct) {
        return { 
          valid: false, 
          message: 'This coupon cannot be used with some items in your cart' 
        };
      }
    }

    return { valid: true, coupon };
  }

  /**
   * Calculate discount amount
   */
  calculateDiscountAmount(coupon, subtotal, shippingAmount = 0) {
    let discountAmount = 0;

    switch (coupon.type) {
      case 'percentage':
        discountAmount = subtotal * (coupon.value / 100);
        if (coupon.maximum_discount_amount && discountAmount > coupon.maximum_discount_amount) {
          discountAmount = coupon.maximum_discount_amount;
        }
        break;
      
      case 'fixed_amount':
        discountAmount = Math.min(coupon.value, subtotal);
        break;
      
      case 'free_shipping':
        discountAmount = shippingAmount;
        break;
      
      default:
        discountAmount = 0;
    }

    return Math.round(discountAmount * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Record coupon usage
   */
  async recordCouponUsage(couponId, orderId, userId, discountAmount) {
    // Generate unique ID
    const usageId = await db.executeQuery('SELECT get_next_id("DISC") as id');
    const id = usageId[0].id + '_USAGE';

    const query = `
      INSERT INTO discount_code_usage (id, discount_code_id, order_id, user_id, discount_amount)
      VALUES (?, ?, ?, ?, ?)
    `;

    await db.executeQuery(query, [id, couponId, orderId, userId, discountAmount]);

    // Update usage count
    const updateQuery = `
      UPDATE discount_codes 
      SET usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = ?
    `;
    await db.executeQuery(updateQuery, [couponId]);

    return true;
  }

  /**
   * Get coupon usage analytics
   */
  async getCouponAnalytics(couponId, startDate = null, endDate = null) {
    let dateFilter = '';
    const params = [couponId];

    if (startDate && endDate) {
      dateFilter = 'AND dcu.created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const query = `
      SELECT 
        COUNT(*) as total_uses,
        SUM(dcu.discount_amount) as total_discount_given,
        AVG(dcu.discount_amount) as average_discount,
        COUNT(DISTINCT dcu.user_id) as unique_users,
        DATE(dcu.created_at) as usage_date,
        COUNT(*) as daily_uses
      FROM discount_code_usage dcu
      WHERE dcu.discount_code_id = ? ${dateFilter}
      GROUP BY DATE(dcu.created_at)
      ORDER BY usage_date DESC
    `;

    const dailyStats = await db.executeQuery(query, params);

    // Get overall stats
    const overallQuery = `
      SELECT 
        COUNT(*) as total_uses,
        SUM(dcu.discount_amount) as total_discount_given,
        AVG(dcu.discount_amount) as average_discount,
        COUNT(DISTINCT dcu.user_id) as unique_users
      FROM discount_code_usage dcu
      WHERE dcu.discount_code_id = ? ${dateFilter}
    `;

    const overallStats = await db.executeQuery(overallQuery, params);

    return {
      overall: overallStats[0] || {
        total_uses: 0,
        total_discount_given: 0,
        average_discount: 0,
        unique_users: 0
      },
      daily: dailyStats
    };
  }

  /**
   * Get top performing coupons
   */
  async getTopPerformingCoupons(limit = 10, startDate = null, endDate = null) {
    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'AND dcu.created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    params.push(limit);

    const query = `
      SELECT 
        dc.id,
        dc.code,
        dc.name,
        dc.type,
        dc.value,
        COUNT(dcu.id) as total_uses,
        SUM(dcu.discount_amount) as total_discount_given,
        AVG(dcu.discount_amount) as average_discount,
        COUNT(DISTINCT dcu.user_id) as unique_users
      FROM discount_codes dc
      LEFT JOIN discount_code_usage dcu ON dc.id = dcu.discount_code_id ${dateFilter}
      WHERE dc.is_active = TRUE
      GROUP BY dc.id, dc.code, dc.name, dc.type, dc.value
      ORDER BY total_uses DESC, total_discount_given DESC
      LIMIT ?
    `;

    const result = await db.executeQuery(query, params);
    return result;
  }
}

module.exports = new CouponService();