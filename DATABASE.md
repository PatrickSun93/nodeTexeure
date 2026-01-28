# Database Documentation

**Version:** 1.0  
**Last Updated:** January 24, 2025  
**Database:** MySQL

---

## 📋 Overview

The NodeTexeure database is a comprehensive e-commerce schema with 44 tables, 66 automated triggers, and a custom ID generation system. It supports full e-commerce functionality including products, orders, payments, inventory, and audit logging.

### Key Features
- **Custom ID System:** Prefixed IDs (USER0000000001, PROD0000000001)
- **Audit Logging:** Automatic tracking of all data changes
- **JSON Support:** Flexible product attributes and workflow data
- **Trigger System:** 66 automated triggers for data integrity
- **Performance Optimized:** Strategic indexes on all tables

### Database Stats
- **Tables:** 44
- **Triggers:** 66
- **Views:** Multiple for reporting
- **Functions:** `get_next_id()` for ID generation
- **Stored Procedures:** None (using application logic)

---

## 🚀 Setup & Initialization

### Prerequisites

```bash
# MySQL 8.0 or higher
mysql --version

# Required: MySQL with JSON support
```

### Initial Setup

```bash
# 1. Test database connection
npm run db:test

# 2. Initialize database (creates schema)
npm run db:init

# 3. Verify setup
npm run db:test
```

### Manual Setup

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS nodetexture
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nodetexture;

-- Run schema file
SOURCE database/database_schema.sql;
```

### Environment Configuration

```bash
# .env file
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=nodetexture
DB_PORT=3306
```

---

## 🗄️ Custom ID System

### Overview

Instead of auto-increment integers, all entities use prefixed string IDs for better readability and debugging.

**Format:** `PREFIX + 10-digit zero-padded number`

**Example:** `USER0000000001`, `PROD0000000123`

### Supported Prefixes

| Prefix | Entity | Example |
|--------|--------|---------|
| USER | Users | USER0000000001 |
| PROD | Products, Variants, Images | PROD0000000001 |
| CART | Shopping Carts | CART0000000001 |
| ORDER | Orders | ORDER0000000001 |
| PAY | Payments | PAY0000000001 |
| SHIP | Shipping | SHIP0000000001 |
| DISC | Discounts/Coupons | DISC0000000001 |
| REV | Reviews | REV0000000001 |
| CAT | Categories | CAT0000000001 |
| ADDR | Addresses | ADDR0000000001 |
| EMAIL | Email Templates | EMAIL0000000001 |
| TAX | Tax Rates | TAX0000000001 |
| SYS | System Settings | SYS0000000001 |
| AUDIT | Audit Logs | AUDIT0000000001 |
| API | API Rate Limits | API0000000001 |
| STOCK | Stock Reservations | STOCK0000000001 |

### transno Table

Manages counters for ID generation:

```sql
CREATE TABLE transno (
    prefix VARCHAR(20) PRIMARY KEY,
    count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### ID Generation Function

```sql
CREATE FUNCTION get_next_id(prefix_name VARCHAR(20)) 
RETURNS VARCHAR(50)
DETERMINISTIC
BEGIN
    DECLARE next_count BIGINT;
    DECLARE new_id VARCHAR(50);
    
    -- Atomically increment counter
    UPDATE transno SET count = count + 1 WHERE prefix = prefix_name;
    
    -- Get new count
    SELECT count INTO next_count FROM transno WHERE prefix = prefix_name;
    
    -- Format ID with leading zeros
    SET new_id = CONCAT(prefix_name, LPAD(next_count, 10, '0'));
    
    RETURN new_id;
END;
```

### Usage

```sql
-- Automatic (preferred)
INSERT INTO users (email, password_hash) VALUES ('user@example.com', 'hash');
-- ID is auto-generated: USER0000000001

-- Manual (if needed)
SELECT get_next_id('USER') as new_id;
-- Returns: USER0000000002
```

**Application Code:**

```javascript
// Let MySQL handle it
const result = await db.execute(
  'INSERT INTO users (email, password_hash) VALUES (?, ?)',
  [email, hash]
);

// Or generate manually
const idResult = await db.query("SELECT get_next_id('USER') as id");
const userId = idResult[0].id; // USER0000000001
```

---

## 📊 Core Tables

### 1. Users & Authentication

#### users
Primary user account table.

```sql
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('USER')),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    role ENUM('admin', 'staff', 'customer') DEFAULT 'customer',
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP NULL,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_users_email` (email)
- `idx_users_role` (role)
- `idx_users_status` (status)

#### user_addresses
Shipping and billing addresses.

```sql
CREATE TABLE user_addresses (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('ADDR')),
    user_id VARCHAR(50) NOT NULL,
    address_type ENUM('shipping', 'billing', 'both') DEFAULT 'shipping',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(2) NOT NULL,
    phone VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

### 2. Product Catalog

#### products
Main product table.

```sql
CREATE TABLE products (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('PROD')),
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    short_description TEXT,
    description TEXT,
    category_id VARCHAR(50),
    category_name VARCHAR(255),
    base_price DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    
    -- JSON for flexible attributes
    product_details JSON,
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    meta_keywords TEXT,
    
    -- Status
    status ENUM('draft', 'active', 'discontinued') DEFAULT 'draft',
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    -- Inventory
    stock_quantity INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 10,
    
    -- Timestamps
    published_at TIMESTAMP NULL,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FULLTEXT(name, description, short_description),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

**product_details JSON Structure:**

```json
{
  "material": "Silk",
  "thread_count": 600,
  "weight": 2.5,
  "organic": true,
  "care_instructions": "Dry clean only",
  "country_of_origin": "Italy",
  "certifications": ["GOTS", "OEKO-TEX"]
}
```

#### product_variants
Size/color variations.

```sql
CREATE TABLE product_variants (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('PROD')),
    product_id VARCHAR(50) NOT NULL,
    variant_name VARCHAR(255),
    sku VARCHAR(100) UNIQUE,
    
    -- Variant attributes
    size VARCHAR(50),
    color VARCHAR(50),
    
    -- Pricing
    price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    
    -- Inventory
    stock_quantity INT DEFAULT 0,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

#### product_images
Product photos.

```sql
CREATE TABLE product_images (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('PROD')),
    product_id VARCHAR(50) NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_small_url TEXT,
    thumbnail_medium_url TEXT,
    thumbnail_large_url TEXT,
    alt_text VARCHAR(255),
    sort_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

---

### 3. Shopping Cart

#### shopping_carts
User carts (guest & logged-in).

```sql
CREATE TABLE shopping_carts (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('CART')),
    user_id VARCHAR(50),
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### cart_items
Items in cart.

```sql
CREATE TABLE cart_items (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('CART')),
    cart_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50),
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);
```

---

### 4. Orders

#### orders
Main order table.

```sql
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('ORDER')),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id VARCHAR(50),
    
    -- Status
    status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
    
    -- Pricing
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    
    -- Addresses (JSON)
    shipping_address JSON,
    billing_address JSON,
    
    -- Payment
    payment_method VARCHAR(50),
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    
    -- Tracking
    tracking_number VARCHAR(255),
    carrier VARCHAR(100),
    
    -- Timestamps
    paid_at TIMESTAMP NULL,
    shipped_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### order_items
Products in order.

```sql
CREATE TABLE order_items (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('ORDER')),
    order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50),
    product_name VARCHAR(255) NOT NULL,
    variant_name VARCHAR(255),
    sku VARCHAR(100),
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);
```

---

### 5. Discounts & Coupons

#### discount_codes
Coupon codes.

```sql
CREATE TABLE discount_codes (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('DISC')),
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type ENUM('percentage', 'fixed_amount') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_value DECIMAL(10,2),
    max_discount_amount DECIMAL(10,2),
    max_uses INT,
    times_used INT DEFAULT 0,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

### 6. Email System

#### email_templates
Email template storage.

```sql
CREATE TABLE email_templates (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('EMAIL')),
    name VARCHAR(255) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    type VARCHAR(50),
    status ENUM('Draft', 'Active') DEFAULT 'Draft',
    preheader VARCHAR(255),
    template_content JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Template Types:**
- new_user
- new_order
- order_shipped
- order_delivered
- order_cancelled
- password_reset
- marketing

---

### 7. System Tables

#### system_settings
Global configuration.

```sql
CREATE TABLE system_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('SYS')),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type ENUM('string', 'integer', 'decimal', 'boolean', 'json') DEFAULT 'string',
    setting_details JSON,
    is_public BOOLEAN DEFAULT FALSE,
    updated_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (updated_by) REFERENCES users(id)
);
```

#### audit_logs
Comprehensive audit trail.

```sql
CREATE TABLE audit_logs (
    id VARCHAR(50) PRIMARY KEY DEFAULT (get_next_id('AUDIT')),
    user_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(50),
    old_values JSON,
    new_values JSON,
    session_details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 🔄 Triggers

### Audit Triggers

Automatically log changes to critical tables:

```sql
-- Example: Product update trigger
CREATE TRIGGER products_update_audit
AFTER UPDATE ON products
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values
    ) VALUES (
        NEW.updated_by,
        'product_update',
        'product',
        NEW.id,
        JSON_OBJECT(
            'name', OLD.name,
            'price', OLD.base_price,
            'status', OLD.status
        ),
        JSON_OBJECT(
            'name', NEW.name,
            'price', NEW.base_price,
            'status', NEW.status
        )
    );
END;
```

**Total: 66 triggers** covering:
- All CRUD operations on products
- Order status changes
- User profile updates
- Inventory changes
- Payment events

---

## 🔍 Indexes & Performance

### Strategic Indexes

```sql
-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Products
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(is_featured);
CREATE FULLTEXT INDEX idx_products_search ON products(name, description);

-- Orders
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(created_at);

-- Cart
CREATE INDEX idx_cart_user ON shopping_carts(user_id);
CREATE INDEX idx_cart_session ON shopping_carts(session_id);
```

### Query Optimization Tips

```sql
-- Use exact ID matches (fast)
SELECT * FROM users WHERE id = 'USER0000000001';

-- Avoid LIKE with leading wildcard (slow)
-- BAD: SELECT * FROM products WHERE id LIKE '%001';

-- Use full-text search for product names
SELECT * FROM products 
WHERE MATCH(name, description) AGAINST ('silk sheets' IN NATURAL LANGUAGE MODE);

-- Leverage composite indexes
SELECT * FROM orders 
WHERE user_id = 'USER0000000001' 
AND status = 'pending';  -- Uses idx_orders_user_status
```

---

## 🛠️ Maintenance

### Backup

```bash
# Full database backup
mysqldump -u root -p nodetexture > backup_$(date +%Y%m%d).sql

# Backup specific tables
mysqldump -u root -p nodetexture users products orders > backup.sql

# Restore
mysql -u root -p nodetexture < backup.sql
```

### Reset Database (Development Only)

```bash
npm run db:reset
```

**Warning:** This deletes ALL data!

### Check ID Counters

```sql
SELECT 
    prefix,
    count,
    details,
    updated_at
FROM transno
ORDER BY prefix;
```

### Sync ID Counter

If counters get out of sync:

```sql
-- Sync USER counter
UPDATE transno 
SET count = (
    SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0)
    FROM users
)
WHERE prefix = 'USER';
```

---

## 📝 Best Practices

### Database Operations

1. **Always use transactions** for multi-table operations
2. **Use prepared statements** to prevent SQL injection
3. **Monitor audit_logs** for security events
4. **Regular backups** (automated daily)
5. **Test migrations** on staging first

### Application Development

```javascript
// Good: Use transactions
await db.beginTransaction();
try {
    await db.execute('INSERT INTO orders ...');
    await db.execute('INSERT INTO order_items ...');
    await db.commit();
} catch (error) {
    await db.rollback();
    throw error;
}

// Good: Prepared statements
const sql = 'SELECT * FROM users WHERE email = ?';
await db.execute(sql, [email]);

// Bad: String concatenation (SQL injection risk)
const sql = `SELECT * FROM users WHERE email = '${email}'`;
```

---

## 🐛 Troubleshooting

### Common Issues

**Connection errors:**
```bash
# Test connection
npm run db:test

# Check MySQL is running
sudo systemctl status mysql
```

**Duplicate key errors:**
```sql
-- Check for duplicates
SELECT id, COUNT(*) 
FROM users 
GROUP BY id 
HAVING COUNT(*) > 1;
```

**Slow queries:**
```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- Check slow queries
SELECT * FROM mysql.slow_log;
```

---

**Last Updated:** January 24, 2025  
**Version:** 1.0  
**Schema Version:** 1.0
