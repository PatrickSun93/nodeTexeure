# Coupon System Documentation

## Overview

The comprehensive coupon system provides full discount code management, validation, application, and analytics for the e-commerce platform. It supports multiple coupon types, usage limits, product restrictions, and detailed tracking.

## Features

### Coupon Types
- **Percentage Discount**: Percentage off the order total (e.g., 10% off)
- **Fixed Amount**: Fixed dollar amount off (e.g., $20 off)
- **Free Shipping**: Waives shipping costs

### Validation Rules
- Expiration dates (start/end dates)
- Usage limits (total and per customer)
- Minimum order amount requirements
- Maximum discount caps for percentage coupons
- Product inclusion/exclusion rules

### Management Features
- Create, read, update, delete coupons
- Bulk coupon operations
- Usage tracking and analytics
- Performance metrics

## API Endpoints

### Admin Endpoints (Require Authentication)

#### GET /api/coupons
Get all coupons with pagination and filtering.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `isActive` (boolean): Filter by active status
- `type` (string): Filter by coupon type
- `search` (string): Search by code or name

**Response:**
```json
{
  "success": true,
  "message": "Coupons retrieved successfully",
  "data": {
    "coupons": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalCount": 100,
      "limit": 20
    }
  }
}
```

#### GET /api/coupons/:id
Get specific coupon by ID.

#### POST /api/coupons
Create new coupon.

**Request Body:**
```json
{
  "code": "SAVE10",
  "name": "10% Off Everything",
  "description": "Get 10% off your entire order",
  "type": "percentage",
  "value": 10,
  "minimumOrderAmount": 50,
  "maximumDiscountAmount": 100,
  "usageLimit": 100,
  "usageLimitPerCustomer": 1,
  "startsAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2024-12-31T23:59:59Z",
  "applicableProducts": [],
  "excludedProducts": []
}
```

#### PUT /api/coupons/:id
Update existing coupon.

#### DELETE /api/coupons/:id
Delete coupon (soft delete - sets inactive).

#### GET /api/coupons/:id/analytics
Get detailed analytics for specific coupon.

**Response:**
```json
{
  "success": true,
  "data": {
    "analytics": {
      "overall": {
        "total_uses": 45,
        "total_discount_given": 450.00,
        "average_discount": 10.00,
        "unique_users": 42
      },
      "daily": [
        {
          "usage_date": "2024-01-15",
          "daily_uses": 5
        }
      ]
    }
  }
}
```

#### GET /api/coupons/analytics/top-performing
Get top performing coupons.

**Query Parameters:**
- `limit` (number): Number of results (default: 10)
- `startDate` (string): Start date for analytics
- `endDate` (string): End date for analytics

### Public Endpoints

#### POST /api/coupons/validate
Validate coupon code for use.

**Request Body:**
```json
{
  "code": "SAVE10",
  "subtotal": 100.00,
  "userId": "USER0000000001",
  "cartItems": [
    {
      "product_id": "PROD0000000001",
      "quantity": 2,
      "price": 50.00
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coupon is valid",
  "data": {
    "coupon": {
      "id": "DISC0000000001",
      "code": "SAVE10",
      "name": "10% Off Everything",
      "type": "percentage",
      "value": 10
    },
    "discountAmount": 10.00
  }
}
```

## Integration with Orders

### Apply Coupon in Checkout
The coupon system integrates with the order creation process:

1. Customer enters coupon code during checkout
2. System validates coupon against cart contents and user
3. Discount is calculated and applied to order total
4. Coupon usage is recorded upon successful order creation

### Order Endpoints Integration

#### POST /api/orders/apply-coupon
Apply coupon to cart and calculate discount.

#### POST /api/orders/create
Create order with coupon applied (if provided).

## Database Schema

### discount_codes Table
```sql
CREATE TABLE discount_codes (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    discount_details JSON NOT NULL,
    type ENUM('percentage', 'fixed_amount', 'free_shipping') NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    minimum_order_amount DECIMAL(10,2) DEFAULT 0.00,
    maximum_discount_amount DECIMAL(10,2) NULL,
    usage_limit INT UNSIGNED NULL,
    usage_count INT UNSIGNED DEFAULT 0,
    usage_limit_per_customer INT UNSIGNED DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    starts_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### discount_code_usage Table
```sql
CREATE TABLE discount_code_usage (
    id VARCHAR(50) PRIMARY KEY,
    discount_code_id VARCHAR(50) NOT NULL,
    order_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Service Methods

### CouponService Class

#### Core Methods
- `createCoupon(couponData)` - Create new coupon
- `getCouponById(id)` - Get coupon by ID
- `getCouponByCode(code)` - Get coupon by code
- `getAllCoupons(page, limit, filters)` - Get paginated coupons
- `updateCoupon(id, updateData)` - Update coupon
- `deleteCoupon(id)` - Soft delete coupon

#### Validation Methods
- `validateCoupon(code, subtotal, userId, cartItems)` - Comprehensive validation
- `calculateDiscountAmount(coupon, subtotal, shippingAmount)` - Calculate discount

#### Usage Tracking
- `recordCouponUsage(couponId, orderId, userId, discountAmount)` - Record usage
- `getCouponAnalytics(couponId, startDate, endDate)` - Get analytics
- `getTopPerformingCoupons(limit, startDate, endDate)` - Get top performers

## Validation Logic

### Comprehensive Validation Checks
1. **Coupon Existence**: Verify coupon exists and is active
2. **Date Validation**: Check start and expiration dates
3. **Order Minimum**: Verify order meets minimum amount
4. **Usage Limits**: Check total and per-customer usage limits
5. **Product Rules**: Validate applicable/excluded products
6. **User Restrictions**: Check per-customer usage history

### Error Messages
- "Invalid coupon code"
- "This coupon has expired"
- "Minimum order amount of $X required"
- "This coupon has reached its usage limit"
- "You have already used this coupon the maximum number of times"
- "This coupon is not applicable to items in your cart"

## Testing

### Test Script
Run the comprehensive test suite:
```bash
node backend/scripts/test-coupon-system.js
```

### Test Coverage
- Coupon creation and management
- Validation logic for all coupon types
- Usage limit enforcement
- Analytics and reporting
- Integration with order system

## Security Considerations

### Access Control
- Admin-only endpoints for coupon management
- Public validation endpoint with rate limiting
- User-specific usage tracking

### Data Validation
- Input sanitization for all coupon data
- SQL injection prevention
- XSS protection for coupon names/descriptions

### Usage Tracking
- Atomic operations for usage counting
- Audit trail for all coupon operations
- Prevention of double-usage through database constraints

## Performance Optimization

### Database Indexes
- Index on coupon codes for fast lookup
- Index on expiration dates for cleanup
- Index on usage tracking for analytics

### Caching Strategy
- Cache frequently used coupons
- Cache validation results for short periods
- Invalidate cache on coupon updates

## Error Handling

### Graceful Degradation
- Continue order processing if coupon recording fails
- Log errors without breaking user experience
- Provide clear error messages for validation failures

### Monitoring
- Track coupon validation failures
- Monitor usage patterns for fraud detection
- Alert on unusual coupon activity

## Future Enhancements

### Planned Features
- Bulk coupon generation
- Advanced targeting rules
- A/B testing for coupon effectiveness
- Integration with marketing campaigns
- Customer segmentation for personalized coupons

### API Extensions
- Webhook notifications for coupon events
- Export functionality for analytics
- Integration with external marketing tools
- Advanced reporting dashboard