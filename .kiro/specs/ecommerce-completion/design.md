# Design Document

## Overview

This design document outlines the architecture and implementation approach for completing the bed texture e-commerce platform. The system will integrate payment processing, shipping, inventory management, email notifications, and enhanced admin features while maintaining the existing monolithic backend architecture on port 6666.

## Architecture

### System Architecture
- **Backend**: Node.js/Express monolithic API on port 6666
- **Frontend**: Next.js application with server-side rendering for SEO
- **Admin Dashboard**: Separate Next.js application on port 3005
- **Database**: MySQL with existing schema extensions
- **External Services**: Stripe (payments), AWS SES (email), FedEx API (shipping)
- **File Storage**: AWS S3 for production, local storage for development

### API Structure
```
/api/v1/
├── payments/          # Stripe integration
├── shipping/          # FedEx and shipping calculations
├── inventory/         # Enhanced inventory management
├── notifications/     # Email and notification system
├── coupons/          # Discount code management
├── admin/            # Enhanced admin operations
└── orders/           # Extended order management
```

## Components and Interfaces

### 1. Payment Processing Component

#### Stripe Integration Service
```javascript
class StripeService {
  async createPaymentIntent(amount, currency, metadata)
  async confirmPayment(paymentIntentId, paymentMethodId)
  async createRefund(paymentIntentId, amount, reason)
  async handleWebhook(signature, payload)
}
```

#### Payment Flow
1. Customer initiates checkout
2. System creates Stripe PaymentIntent
3. Frontend collects payment method using Stripe Elements
4. Backend confirms payment and updates order status
5. Webhook handles payment completion/failure

### 2. Shipping and Tax Component

#### Shipping Calculator Service
```javascript
class ShippingService {
  async calculateShipping(address, items, weight)
  async getShippingZones()
  async createShipment(orderId, shippingDetails)
  async trackShipment(trackingNumber)
}
```

#### Tax Calculator Service
```javascript
class TaxService {
  async calculateTax(address, items, subtotal)
  async getTaxRates(country, state, city)
  async updateTaxRates(rates)
}
```

### 3. Enhanced Inventory Management

#### Inventory Service
```javascript
class InventoryService {
  async updateStock(productId, variantId, quantity, reason)
  async reserveStock(items, expirationTime)
  async releaseReservation(reservationId)
  async checkLowStock()
  async generateLowStockAlerts()
}
```

#### Stock Reservation Flow
1. Customer adds items to cart
2. During checkout, system reserves stock for 1 hour
3. Payment completion confirms reservation
4. Failed/expired reservations release stock automatically

### 4. Email Notification System

#### Email Service
```javascript
class EmailService {
  async sendOrderConfirmation(orderId, customerEmail)
  async sendStatusUpdate(orderId, newStatus)
  async sendShippingNotification(orderId, trackingInfo)
  async sendAbandonedCartEmail(cartId, customerEmail, sequence)
  async sendLowStockAlert(adminEmails, products)
}
```

#### Email Templates
- Order confirmation with order details and payment info
- Status updates for each order stage
- Shipping notifications with tracking links
- Abandoned cart recovery (3 email sequence)
- Low stock alerts for admin users

### 5. Product Management Enhancement

#### Product Upload Flow
1. Staff uploads product with images and details
2. System generates thumbnails (small: 150x150, medium: 300x300, large: 600x600)
3. Product status set to "pending_approval"
4. Admin reviews and approves/rejects with notes
5. Approved products become visible to customers

#### Image Processing
```javascript
class ImageService {
  async uploadImages(files, productId)
  async generateThumbnails(originalUrl, sizes)
  async optimizeImages(imageUrl)
  async deleteImages(imageIds)
}
```

### 6. Coupon and Discount System

#### Coupon Types
- **Percentage**: 10% off, 25% off (with optional maximum discount cap)
- **Fixed Amount**: $10 off, $50 off
- **Free Shipping**: Waives shipping costs
- **Bundle Discount**: Specific discount for product bundles

#### Coupon Validation Rules
- Expiration dates (start/end)
- Usage limits (total and per customer)
- Minimum order amount
- Product/category restrictions
- First-time customer only

### 7. Order Management Enhancement

#### Order Status Flow
```
pending → confirmed → processing → shipped → delivered
                   ↘ cancelled ↗
                   ↘ refunded ↗
```

#### Order Service Extensions
```javascript
class OrderService {
  async updateOrderStatus(orderId, newStatus, notes)
  async processRefund(orderId, amount, reason)
  async generateInvoice(orderId)
  async getOrderHistory(userId, filters)
  async cancelOrder(orderId, reason)
}
```

## Data Models

### Enhanced Database Schema Extensions

#### Payment Records
```sql
-- Extend payments table with Stripe-specific fields
ALTER TABLE payments ADD COLUMN stripe_payment_intent_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN stripe_payment_method_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN stripe_customer_id VARCHAR(255);
```

#### Shipping Enhancements
```sql
-- Add FedEx tracking integration
ALTER TABLE orders ADD COLUMN fedex_tracking_number VARCHAR(100);
ALTER TABLE orders ADD COLUMN estimated_delivery_date DATE;
ALTER TABLE orders ADD COLUMN actual_delivery_date TIMESTAMP NULL;
```

#### Inventory Tracking
```sql
-- Enhanced inventory movements
ALTER TABLE inventory_movements ADD COLUMN batch_number VARCHAR(100);
ALTER TABLE inventory_movements ADD COLUMN supplier_info JSON;
ALTER TABLE inventory_movements ADD COLUMN cost_per_unit DECIMAL(10,2);
```

### New Tables

#### Email Queue Enhancement
```sql
CREATE TABLE email_sequences (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    trigger_event VARCHAR(50) NOT NULL,
    sequence_config JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE email_sequence_instances (
    id VARCHAR(50) PRIMARY KEY,
    sequence_id VARCHAR(50) NOT NULL,
    target_email VARCHAR(255) NOT NULL,
    current_step INT DEFAULT 0,
    context_data JSON,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (sequence_id) REFERENCES email_sequences(id)
);
```

## Error Handling

### Payment Error Handling
- **Card Declined**: Display user-friendly message, allow retry
- **Insufficient Funds**: Suggest alternative payment methods
- **Network Errors**: Implement retry logic with exponential backoff
- **Webhook Failures**: Queue for retry, alert admin after multiple failures

### Inventory Error Handling
- **Stock Shortage**: Prevent checkout, suggest alternatives
- **Reservation Conflicts**: Handle race conditions with database locks
- **Negative Inventory**: Prevent with database constraints and validation

### Email Error Handling
- **Delivery Failures**: Retry with exponential backoff (3 attempts)
- **Invalid Addresses**: Log and alert admin
- **Rate Limiting**: Queue emails and respect SES limits

## Testing Strategy

### Unit Testing
- Payment processing logic
- Tax and shipping calculations
- Inventory management operations
- Email template rendering
- Coupon validation rules

### Integration Testing
- Stripe payment flow end-to-end
- FedEx API integration
- AWS SES email delivery
- Database transaction handling
- Admin workflow testing

### Performance Testing
- Payment processing under load
- Inventory reservation concurrency
- Email queue processing
- Image upload and processing
- Database query optimization

### Security Testing
- Payment data handling (PCI compliance)
- Admin authentication and authorization
- Rate limiting effectiveness
- SQL injection prevention
- XSS protection in admin panel

## Implementation Phases

### Phase 1: Core Payment Integration
1. Stripe payment intent creation
2. Frontend payment form with Stripe Elements
3. Payment confirmation and order status updates
4. Basic webhook handling

### Phase 2: Shipping and Tax
1. Shipping zone and rate management
2. Tax calculation based on address
3. FedEx API integration for tracking
4. Shipping cost calculation in checkout

### Phase 3: Enhanced Inventory
1. Stock reservation system
2. Low stock alerts
3. Inventory movement tracking
4. Automated stock updates

### Phase 4: Email System
1. AWS SES integration
2. Email templates and rendering
3. Order notification emails
4. Abandoned cart recovery

### Phase 5: Admin Enhancements
1. Product approval workflow
2. Enhanced dashboard with analytics
3. Bulk operations for products
4. Coupon management interface

### Phase 6: Multi-language Support
1. Internationalization framework
2. Chinese language support
3. Currency conversion
4. Localized email templates

## Security Considerations

### PCI Compliance
- Never store card data on servers
- Use Stripe's secure tokenization
- Implement proper SSL/TLS encryption
- Regular security audits

### Data Protection
- Encrypt sensitive customer data
- Implement proper access controls
- Regular database backups
- GDPR compliance for EU customers

### API Security
- Rate limiting implementation
- CSRF protection for admin operations
- JWT token validation
- Input sanitization and validation

## Performance Optimization

### Database Optimization
- Index optimization for frequent queries
- Connection pooling
- Query result caching
- Database query monitoring

### Image Optimization
- Automatic image compression
- CDN integration for faster delivery
- Lazy loading for product images
- WebP format support

### Caching Strategy
- Redis for session storage
- API response caching
- Static asset caching
- Database query result caching