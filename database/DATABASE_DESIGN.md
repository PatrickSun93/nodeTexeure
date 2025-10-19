# Database Design Documentation
## Bed Texture E-commerce Platform

### Overview
This document outlines the MySQL database schema design for the bed texture e-commerce platform. The design supports a microservices architecture while using a single database with service-specific table groupings.

### Database Technology Choice
**Selected: MySQL (AWS RDS)**

**Rationale:**
- You specifically requested MySQL
- AWS RDS provides managed hosting with automated backups
- Good performance for e-commerce read-heavy workloads
- Excellent integration with other AWS services
- Cost-effective for small to medium scale

### Custom ID System
- **Prefixed IDs**: All entities use meaningful prefixes (USER, PROD, ORDER, etc.)
- **Format**: PREFIX + 10-digit zero-padded number (e.g., USER0000000001)
- **Transaction Management**: Centralized counter management via `transno` table
- **Benefits**: Better readability, easier debugging, professional appearance

### JSON System
- **Address Storage**: Address fields merged into JSON columns for flexibility
- **Product Details**: Physical specifications and approval workflow data stored in JSON format for extensibility
- **Transaction & Operations**: Transaction metadata, inventory movements, and status tracking
- **Customer Interaction**: Review content, discount terms, and customer data
- **Communication**: Email templates and delivery management
- **System Management**: Configuration and audit information
- **Tables Affected**: `user_addresses`, `orders`, `tax_rates`, `products`, `transno`, `inventory_movements`, `order_status_history`, `refunds`, `product_reviews`, `discount_codes`, `email_templates`, `email_queue`, `system_settings`, `audit_logs`
- **Benefits**: Reduced table width, international address format support, atomic updates, flexible product specifications, rich content support, comprehensive metadata storage
- **Structure**: Consistent JSON schema across all business domains
- **Performance**: Functional indexes on frequently queried JSON fields

### Architecture Approach
**Single Database with Service Boundaries**

While you're using microservices architecture, we're implementing a single database approach with logical service boundaries:

- **Advantages:**
  - Simpler to manage and deploy initially
  - ACID transactions across related data
  - Easier data consistency
  - Lower operational complexity
  - Cost-effective

- **Service Boundaries:**
  - Each microservice owns specific tables
  - Cross-service data access through APIs only
  - Clear table naming conventions by service

### Service-to-Table Mapping

#### 1. User Service
- `users` - Main user accounts (admin, staff, customer)
- `user_addresses` - Shipping and billing addresses (JSON format)

#### 2. Product Service
- `categories` - Product categories (hierarchical)
- `products` - Main product catalog
- `product_variants` - Size, color, material combinations
- `product_images` - Product photos (20-40 per product)
- `product_bundles` - Complete bedding sets
- `bundle_items` - Items within bundles
- `product_reviews` - Customer reviews and ratings

#### 3. Inventory Service
- `inventory` - Stock levels per product/variant
- `stock_reservations` - Temporary holds during checkout
- `inventory_movements` - Stock change audit trail

#### 4. Order Service
- `shopping_carts` - Guest and user shopping carts
- `cart_items` - Items in shopping carts
- `orders` - Order records with full details
- `order_items` - Individual items per order
- `order_status_history` - Order status tracking

#### 5. Payment Service
- `payment_methods` - Available payment options
- `payments` - Payment transactions (Stripe, PayPal)
- `refunds` - Refund processing

#### 6. Notification Service
- `email_templates` - Reusable email templates
- `email_queue` - Email sending queue
- `abandoned_cart_recovery` - Cart recovery campaigns

#### 7. Shared/System Tables
- `discount_codes` & `discount_code_usage` - Coupon system
- `shipping_zones` & `shipping_rates` - Shipping configuration
- `tax_rates` - Regional tax calculations
- `system_settings` - Application configuration
- `audit_logs` - Admin action tracking
- `api_rate_limits` - API rate limiting

### Key Design Decisions

#### 1. Custom ID System with Prefixes
**Decision**: Use prefixed VARCHAR IDs instead of auto-increment integers
**Rationale**:
- Better readability and debugging
- Professional appearance in customer-facing areas
- Easier to identify entity types
- Consistent format across all tables
- Centralized counter management

**Implementation**:
- `transno` table manages counters for each prefix
- `get_next_id()` function ensures atomic ID generation
- Format: PREFIX + 10-digit zero-padded number

#### 2. User Management
```sql
users {
  user_id: VARCHAR(20) -- Custom format: USER0000000001
  role: ENUM('admin', 'staff', 'customer')
  status: ENUM('active', 'inactive', 'suspended')
}
```

**Admin Permissions:**
- Change prices and stock levels
- Manage user roles
- Set discounts and shipping fees
- Access analytics and reports
- Approve/reject products

**Staff Permissions:**
- Upload products with initial pricing
- Link tracking numbers to orders
- Basic support functions
- Cannot modify after initial creation

**Customer Permissions:**
- Browse and purchase products
- Leave reviews (verified purchases)
- Manage their own profile and addresses

#### 3. Product Management
```sql
products {
  product_id: VARCHAR(20) -- Custom format: PROD0000000001
  status: ENUM('draft', 'pending_approval', 'approved', 'rejected', 'discontinued')
  weight: DECIMAL(8,3) -- For shipping calculations
  is_organic: BOOLEAN
  material: VARCHAR(100)
}
```

**Product Approval Workflow:**
1. Staff uploads product (status: 'draft')
2. Staff submits for approval (status: 'pending_approval')
3. Admin reviews and approves/rejects
4. Approved products go live (status: 'approved')

**Product Variants:**
- Size: Twin, Full, Queen, King, California King
- Color: Various color options
- Pattern: Different patterns available
- Each variant has its own SKU and inventory

#### 4. Inventory Management
```sql
inventory {
  inventory_id: VARCHAR(20) -- Custom format: INV0000000001
  quantity_available: INT -- Available for sale
  quantity_reserved: INT -- Reserved during checkout
  reorder_point: INT -- Low stock alert threshold
  reorder_quantity: INT -- Automatic reorder amount
}
```

**Stock Reservation System:**
- Stock reserved for 1 hour during checkout
- Automatic release of expired reservations
- Prevents overselling during concurrent checkouts

**Low Stock Alerts:**
- Configurable reorder points per product/variant
- Authorized staff-only notifications
- Automatic reorder suggestions

#### 5. Order Processing
```sql
orders {
  order_id: VARCHAR(20) -- Custom format: ORDER0000000001
  status: ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
  currency: VARCHAR(3) -- Multi-currency support
  exchange_rate: DECIMAL(10,6) -- Real-time rates
}
```

**Order Status Flow:**
1. **Pending** - Order created, payment processing
2. **Confirmed** - Payment successful
3. **Processing** - Order being prepared
4. **Shipped** - Order dispatched with tracking
5. **Delivered** - Order received by customer
6. **Cancelled** - Order cancelled (before shipping)
7. **Refunded** - Order refunded

**Guest Checkout Support:**
- Orders can have `user_id = NULL`
- Guest email stored in `guest_email` field
- Full address information stored in JSON format in order record

**Address Storage:**
- Shipping and billing addresses stored as JSON columns
- Consistent schema: `{first_name, last_name, company, address_line_1, address_line_2, city, state, postal_code, country, phone}`
- Functional indexes on country fields for efficient querying

#### 6. Payment Integration
```sql
payments {
  payment_id: VARCHAR(20) -- Custom format: PAY0000000001
  payment_gateway: VARCHAR(50) -- 'stripe', 'paypal'
  gateway_transaction_id: VARCHAR(255)
  gateway_response: JSON -- Full gateway response
  status: ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')
}
```

**Supported Payment Methods:**
- Stripe Credit Cards (2.9% + $0.30)
- PayPal (2.9% + $0.30)
- Extensible for additional gateways

#### 7. International Support

**Multi-Currency:**
- Real-time exchange rates stored per order
- Base currency: USD
- Support for major international currencies

**Shipping Zones:**
```sql
shipping_zones {
  countries: JSON -- Array of ISO country codes
}

shipping_rates {
  min_weight: DECIMAL(8,3)
  max_weight: DECIMAL(8,3)
  base_rate: DECIMAL(10,2)
  per_kg_rate: DECIMAL(10,2)
}
```

**Tax Calculation:**
- Regional tax rates by country/state/city
- Integration ready for TaxJar API
- Manual tax rate management

#### 8. Product Images
```sql
product_images {
  original_url: VARCHAR(500)
  thumbnail_small_url: VARCHAR(500)
  thumbnail_medium_url: VARCHAR(500)
  thumbnail_large_url: VARCHAR(500)
}
```

**Image Management:**
- 20-40 images per product
- Automatic thumbnail generation
- AWS S3 storage for production
- Local storage for development
- SEO-friendly alt text

#### 9. Bundle Products
```sql
product_bundles {
  bundle_price: DECIMAL(10,2)
  discount_amount: DECIMAL(10,2)
}

bundle_items {
  bundle_id: BIGINT
  product_id: BIGINT
  variant_id: BIGINT
  quantity: INT
}
```

**Bundle Rules:**
- Customers can only buy complete bundles
- Bundle pricing is fixed (not sum of individual items)
- Inventory tracked per bundle component

#### 10. Discount System
```sql
discount_codes {
  type: ENUM('percentage', 'fixed_amount', 'free_shipping')
  usage_limit: INT -- Global usage limit
  usage_limit_per_customer: INT -- Per-customer limit
  minimum_order_amount: DECIMAL(10,2)
}
```

**Discount Features:**
- Percentage discounts with optional caps
- Fixed amount discounts
- Free shipping codes
- Usage limits (global and per-customer)
- Minimum order requirements

#### 11. Email Notifications
```sql
email_templates {
  variables: JSON -- Available template variables
}

email_queue {
  status: ENUM('pending', 'sent', 'failed', 'cancelled')
  attempts: INT
  max_attempts: INT
}
```

**Email Types:**
- Order confirmation
- Shipping notifications
- Abandoned cart recovery
- Low stock alerts (admin)
- Product approval notifications

#### 12. JSON Address System
```sql
user_addresses {
  address_json: JSON -- {company, address_line_1, address_line_2, city, state, postal_code, country}
}

orders {
  shipping_address_json: JSON -- Full shipping address with contact info
  billing_address_json: JSON -- Full billing address with contact info
}

tax_rates {
  location_json: JSON -- {country, state, city, postal_code}
}
```

**JSON Address Benefits:**
- **Flexibility**: Easy to add new address fields without schema changes
- **Internationalization**: Support for different country address formats
- **Reduced Complexity**: Fewer columns, cleaner table structure
- **Atomic Updates**: Address information updated as single unit
- **Performance**: Functional indexes on frequently queried fields

**Implementation Details:**
- Consistent JSON schema across all address-related tables
- Functional indexes: `(CAST(address_json->>'$.country' AS CHAR(2)))`
- Application-level validation for JSON structure
- Migration support from column-based to JSON format

### Performance Optimizations

#### 1. Indexing Strategy
```sql
-- Primary indexes on foreign keys
INDEX idx_user_id (user_id)
INDEX idx_product_id (product_id)
INDEX idx_order_id (order_id)

-- Composite indexes for common queries
INDEX idx_products_category_status (category_id, status)
INDEX idx_orders_user_status (user_id, status)
INDEX idx_inventory_low_stock (quantity_available, reorder_point)

-- Full-text search
FULLTEXT idx_search (name, description, short_description)
```

#### 2. Database Views
```sql
-- Product inventory summary
CREATE VIEW product_inventory_view AS...

-- Order summary with customer info
CREATE VIEW order_summary_view AS...
```

#### 3. Stored Procedures
```sql
-- Stock reservation during checkout
CREATE PROCEDURE ReserveStock(...)

-- Release expired reservations
CREATE PROCEDURE ReleaseExpiredReservations()
```

### Security Considerations

#### 1. Data Protection
- Password hashes only (no plain text)
- Sensitive payment data stored in gateway
- PCI DSS compliance through Stripe/PayPal
- Audit logging for admin actions

#### 2. Access Control
- Role-based permissions
- API rate limiting structure
- JWT token authentication (implemented in application layer)

#### 3. Data Integrity
- Foreign key constraints
- CHECK constraints for valid ranges
- ENUM types for controlled values
- NOT NULL constraints where appropriate

### Scalability Considerations

#### 1. Current Design
- Single database for simplicity
- Optimized for read-heavy e-commerce workloads
- Efficient indexing for common queries

#### 2. Future Migration Path
When scaling becomes necessary:
1. **Read Replicas** - Add read replicas for reporting
2. **Service Databases** - Split into service-specific databases
3. **Caching Layer** - Add Redis for frequently accessed data
4. **Search Engine** - Move to Elasticsearch for product search

### Migration Strategy

#### 1. Database Migration Tools
**Recommended: Flyway**
- Simple version-based migrations
- Good MySQL support
- Easy rollback capabilities
- CI/CD integration

#### 2. Environment Strategy
- **Development:** Local MySQL on Mac
- **Staging:** Separate AWS RDS instance
- **Production:** Separate AWS RDS instance
- **Separate AWS accounts** for staging/production

### Monitoring and Maintenance

#### 1. Performance Monitoring
- AWS CloudWatch for basic metrics
- Slow query log analysis
- Index usage monitoring

#### 2. Backup Strategy
- AWS RDS automated backups
- Point-in-time recovery
- Cross-region backup replication

#### 3. Maintenance Tasks
- Regular ANALYZE TABLE for statistics
- Cleanup of expired reservations
- Archive old order data (future)
- Email queue cleanup

### Data Archiving Strategy (Future)

#### 1. Order Data
- Archive orders older than 2 years
- Maintain summary data for reporting
- Compress archived data

#### 2. Log Data
- Archive audit logs older than 1 year
- Maintain recent logs for compliance
- Automated cleanup procedures

### Integration Points

#### 1. External Services
- **Stripe/PayPal:** Payment processing
- **FedEx API:** Shipping rates and tracking
- **TaxJar:** Tax calculations
- **AWS SES:** Email delivery
- **AWS S3:** Image storage

#### 2. API Design
- RESTful APIs per microservice
- JSON data exchange
- Proper error handling
- Rate limiting implementation

### Conclusion

This database design provides:

✅ **Complete E-commerce Functionality**
- Product catalog with variants
- Order processing and tracking
- Payment integration
- Inventory management
- User management with roles

✅ **International Support**
- Multi-currency handling
- Regional shipping and tax
- Multi-language ready structure

✅ **Business Requirements**
- Product approval workflow
- Bundle products
- Discount codes
- Guest checkout
- Email notifications

✅ **Performance and Scalability**
- Proper indexing
- Optimized queries
- Migration path for growth

✅ **Security and Compliance**
- PCI DSS ready
- Audit logging
- Role-based access
- Data protection

The design balances simplicity for initial development with the flexibility to scale as your business grows.