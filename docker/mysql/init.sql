-- Auto-generated MySQL init for Docker dev (schema + table-adding migrations)
-- Base schema
-- =====================================================
-- Bed Texture E-commerce Platform - MySQL Database Schema
-- =====================================================
-- Architecture: Microservices with Single Database
-- Database: MySQL (AWS RDS)
-- Created: Based on system_design.md requirements
-- =====================================================

-- Set MySQL specific configurations
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';
SET time_zone = '+00:00'; -- UTC timezone

-- =====================================================
-- TRANSACTION NUMBER MANAGEMENT
-- =====================================================

-- Transaction number table for managing custom ID prefixes
CREATE TABLE transno (
    prefix VARCHAR(20) PRIMARY KEY,
    count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert initial prefix configurations
INSERT INTO transno (prefix, count, details) VALUES
('USER', 0, 'User ID counter'),
('PROD', 0, 'Product ID counter'),
('CART', 0, 'Cart ID counter'),
('ORDER', 0, 'Order ID counter'),
('PAY', 0, 'Payment ID counter'),
('SHIP', 0, 'Shipping ID counter'),
('DISC', 0, 'Discount ID counter'),
('REV', 0, 'Review ID counter'),
('CAT', 0, 'Category ID counter'),
('ADDR', 0, 'Address ID counter'),
('EMAIL', 0, 'Email ID counter'),
('TAX', 0, 'Tax ID counter'),
('SYS', 0, 'System ID counter'),
('AUDIT', 0, 'Audit log ID counter'),
('API', 0, 'API rate limit ID counter'),
('STOCK', 0, 'Stock reservation ID counter');

-- Function to get next ID with prefix
DELIMITER //
CREATE FUNCTION get_next_id(prefix_name VARCHAR(20)) 
RETURNS VARCHAR(50)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE next_count BIGINT;
    DECLARE new_id VARCHAR(50);
    
    -- Get and increment the count atomically
    UPDATE transno SET count = count + 1 WHERE prefix = prefix_name;
    
    -- Get the new count
    SELECT count INTO next_count FROM transno WHERE prefix = prefix_name;
    
    -- Format the ID with leading zeros (10 digits)
    SET new_id = CONCAT(prefix_name, LPAD(next_count, 10, '0'));
    
    RETURN new_id;
END//
DELIMITER ;

-- =====================================================
-- USER SERVICE TABLES
-- =====================================================

-- Users table (supports admin, staff, customer roles)
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role ENUM('admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
    status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP NULL,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_status (status),
    INDEX idx_email_verification (email_verification_token),
    INDEX idx_password_reset (password_reset_token)
);

-- User addresses (shipping/billing)
CREATE TABLE user_addresses (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    type ENUM('shipping', 'billing') NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address_json JSON NOT NULL COMMENT 'Contains: company, address_line_1, address_line_2, city, state, postal_code, country',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_country ((CAST(address_json->>'$.country' AS CHAR(2))))
);

-- =====================================================
-- PRODUCT SERVICE TABLES
-- =====================================================

-- Product categories
CREATE TABLE categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_id VARCHAR(50) NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_slug (slug),
    INDEX idx_parent_id (parent_id),
    INDEX idx_active (is_active)
);

-- Products table
CREATE TABLE products (
    id VARCHAR(50) PRIMARY KEY,
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    short_description VARCHAR(500),
    category_id VARCHAR(50) NOT NULL,
    base_price DECIMAL(10,2) NOT NULL,
    product_details JSON NOT NULL COMMENT 'Contains: weight, dimensions_length, dimensions_width, dimensions_height, material, is_organic, care_instructions',
    status ENUM('draft', 'pending_approval', 'approved', 'rejected', 'discontinued') DEFAULT 'draft',
    approval_details JSON COMMENT 'Contains: notes, approved_by, approved_at, rejection_reason, approval_history',
    created_by VARCHAR(50) NOT NULL,
    meta_title VARCHAR(255),
    meta_description VARCHAR(500),
    meta_keywords VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_sku (sku),
    INDEX idx_slug (slug),
    INDEX idx_category (category_id),
    INDEX idx_status (status),

    INDEX idx_created_by (created_by),
    FULLTEXT idx_search (name, description, short_description)
);

-- Product variants (size, color combinations)
CREATE TABLE product_variants (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    size VARCHAR(50), -- Twin, Full, Queen, King, California King
    color VARCHAR(50),
    pattern VARCHAR(100),
    price_adjustment DECIMAL(10,2) DEFAULT 0.00, -- price difference from base
    weight_adjustment DECIMAL(8,3) DEFAULT 0.000, -- weight difference from base
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_sku (sku),
    INDEX idx_size (size),
    INDEX idx_color (color),
    INDEX idx_active (is_active)
);

-- Product images (20-40 per product)
CREATE TABLE product_images (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL, -- NULL for general product images
    original_url VARCHAR(500) NOT NULL,
    thumbnail_small_url VARCHAR(500),
    thumbnail_medium_url VARCHAR(500),
    thumbnail_large_url VARCHAR(500),
    alt_text VARCHAR(255),
    sort_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    file_size INT UNSIGNED,
    width INT UNSIGNED,
    height INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_variant_id (variant_id),
    INDEX idx_primary (is_primary)
);

-- Product bundles
CREATE TABLE product_bundles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    bundle_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_slug (slug),
    INDEX idx_active (is_active)
);

-- Bundle items
CREATE TABLE bundle_items (
    id VARCHAR(50) PRIMARY KEY,
    bundle_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    
    FOREIGN KEY (bundle_id) REFERENCES product_bundles(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    INDEX idx_bundle_id (bundle_id),
    INDEX idx_product_id (product_id)
);

-- Product reviews
CREATE TABLE product_reviews (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    order_item_id VARCHAR(50) NULL, -- Link to verified purchase
    rating TINYINT UNSIGNED NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_details JSON NOT NULL COMMENT 'Contains: title, review_text, pros, cons, recommendation, images',
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by VARCHAR(50) NULL,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_product_id (product_id),
    INDEX idx_user_id (user_id),
    INDEX idx_rating (rating),
    INDEX idx_approved (is_approved),
    INDEX idx_verified (is_verified_purchase)
);

-- =====================================================
-- INVENTORY SERVICE TABLES
-- =====================================================

-- Inventory tracking
CREATE TABLE inventory (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    quantity_available INT UNSIGNED NOT NULL DEFAULT 0,
    quantity_reserved INT UNSIGNED NOT NULL DEFAULT 0, -- Reserved during checkout
    quantity_sold INT UNSIGNED NOT NULL DEFAULT 0,
    reorder_point INT UNSIGNED DEFAULT 10,
    reorder_quantity INT UNSIGNED DEFAULT 50,
    last_restocked_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    UNIQUE KEY unique_inventory (product_id, variant_id),
    INDEX idx_product_id (product_id),
    INDEX idx_variant_id (variant_id),
    INDEX idx_low_stock (quantity_available, reorder_point)
);

-- Inventory movements (audit trail)
CREATE TABLE inventory_movements (
    id VARCHAR(50) PRIMARY KEY,
    inventory_id VARCHAR(50) NOT NULL,
    movement_type ENUM('restock', 'sale', 'adjustment', 'return', 'damage') NOT NULL,
    quantity_change INT NOT NULL, -- Positive for increase, negative for decrease
    reference_type ENUM('order', 'manual', 'return', 'damage') NOT NULL,
    reference_id VARCHAR(50) NULL,
    movement_details JSON COMMENT 'Contains: notes, reason, batch_number, supplier_info, cost_per_unit, location',
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_inventory_id (inventory_id),
    INDEX idx_movement_type (movement_type),
    INDEX idx_reference (reference_type, reference_id),
    INDEX idx_created_at (created_at)
);

-- =====================================================
-- ORDER SERVICE TABLES
-- =====================================================

-- Shopping carts (for both guest and registered users)
CREATE TABLE shopping_carts (
    id VARCHAR(50) PRIMARY KEY,
    session_id VARCHAR(255), -- For guest users
    user_id VARCHAR(50) NULL, -- For logged-in users
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id)
);

-- Cart items
CREATE TABLE cart_items (
    id VARCHAR(50) PRIMARY KEY,
    cart_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    bundle_id VARCHAR(50) NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    price DECIMAL(10,2) NOT NULL, -- Price at time of adding to cart
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (bundle_id) REFERENCES product_bundles(id) ON DELETE CASCADE,
    INDEX idx_cart_id (cart_id),
    INDEX idx_product_id (product_id)
);

-- Stock reservations (during checkout process)
CREATE TABLE stock_reservations (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    cart_id VARCHAR(50) NULL,
    user_id VARCHAR(50) NULL, -- For logged-in users
    quantity INT UNSIGNED NOT NULL,
    expires_at TIMESTAMP NOT NULL, -- 1 hour from creation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_variant_id (variant_id),
    INDEX idx_cart_id (cart_id),
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at)
);

-- Orders
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    user_id VARCHAR(50) NULL, -- NULL for guest orders
    guest_email VARCHAR(255) NULL, -- For guest orders
    status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    exchange_rate DECIMAL(10,6) DEFAULT 1.000000,
    
    -- Pricing
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    shipping_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Shipping address
    shipping_address_json JSON NOT NULL COMMENT 'Contains: first_name, last_name, company, address_line_1, address_line_2, city, state, postal_code, country, phone',
    
    -- Billing address
    billing_address_json JSON NOT NULL COMMENT 'Contains: first_name, last_name, company, address_line_1, address_line_2, city, state, postal_code, country, phone',
    
    -- Shipping details
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(100),
    shipped_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_order_number (order_number),
    INDEX idx_user_id (user_id),
    INDEX idx_guest_email (guest_email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_tracking_number (tracking_number)
);

-- Order items
CREATE TABLE order_items (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    bundle_id VARCHAR(50) NULL,
    product_name VARCHAR(255) NOT NULL, -- Snapshot at time of order
    product_sku VARCHAR(100) NOT NULL,
    variant_details JSON NULL, -- Store size, color, etc.
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    FOREIGN KEY (bundle_id) REFERENCES product_bundles(id),
    INDEX idx_order_id (order_id),
    INDEX idx_product_id (product_id)
);

-- Order status history
CREATE TABLE order_status_history (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL,
    status_details JSON COMMENT 'Contains: notes, reason, tracking_info, carrier_info, estimated_delivery, internal_notes',
    changed_by VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id),
    INDEX idx_order_id (order_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- =====================================================
-- PAYMENT SERVICE TABLES
-- =====================================================

-- Payment methods
CREATE TABLE payment_methods (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('credit_card', 'paypal', 'bank_transfer', 'other') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    processing_fee_percentage DECIMAL(5,4) DEFAULT 0.0000,
    processing_fee_fixed DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_type (type),
    INDEX idx_active (is_active)
);

-- Payments
CREATE TABLE payments (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    payment_method_id VARCHAR(50) NOT NULL,
    payment_gateway VARCHAR(50) NOT NULL, -- stripe, paypal, etc.
    gateway_transaction_id VARCHAR(255),
    gateway_payment_intent_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded') NOT NULL DEFAULT 'pending',
    gateway_response JSON,
    failure_reason TEXT,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    INDEX idx_order_id (order_id),
    INDEX idx_gateway_transaction_id (gateway_transaction_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Refunds
CREATE TABLE refunds (
    id VARCHAR(50) PRIMARY KEY,
    payment_id VARCHAR(50) NOT NULL,
    order_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason ENUM('customer_request', 'defective_product', 'wrong_item', 'damaged_shipping', 'other') NOT NULL,
    refund_details JSON COMMENT 'Contains: reason_notes, customer_explanation, internal_notes, evidence_urls, resolution_notes',
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    gateway_refund_id VARCHAR(255),
    processed_by VARCHAR(50) NOT NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (processed_by) REFERENCES users(id),
    INDEX idx_payment_id (payment_id),
    INDEX idx_order_id (order_id),
    INDEX idx_status (status)
);

-- =====================================================
-- DISCOUNT & COUPON SYSTEM
-- =====================================================

-- Discount codes/coupons
CREATE TABLE discount_codes (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    discount_details JSON NOT NULL COMMENT 'Contains: description, terms_conditions, applicable_products, excluded_products, marketing_message',
    type ENUM('percentage', 'fixed_amount', 'free_shipping') NOT NULL,
    value DECIMAL(10,2) NOT NULL, -- Percentage (0-100) or fixed amount
    minimum_order_amount DECIMAL(10,2) DEFAULT 0.00,
    maximum_discount_amount DECIMAL(10,2) NULL, -- Cap for percentage discounts
    usage_limit INT UNSIGNED NULL, -- NULL for unlimited
    usage_count INT UNSIGNED DEFAULT 0,
    usage_limit_per_customer INT UNSIGNED DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    starts_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_code (code),
    INDEX idx_active (is_active),
    INDEX idx_expires_at (expires_at)
);

-- Discount code usage tracking
CREATE TABLE discount_code_usage (
    id VARCHAR(50) PRIMARY KEY,
    discount_code_id VARCHAR(50) NOT NULL,
    order_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_discount_code_id (discount_code_id),
    INDEX idx_order_id (order_id),
    INDEX idx_user_id (user_id)
);

-- =====================================================
-- NOTIFICATION SERVICE TABLES
-- =====================================================

-- Email templates
CREATE TABLE email_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    template_content JSON NOT NULL COMMENT 'Contains: html_content, text_content, variables, styling, attachments, metadata',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_active (is_active)
);

-- Email queue
CREATE TABLE email_queue (
    id VARCHAR(50) PRIMARY KEY,
    to_email VARCHAR(255) NOT NULL,
    to_name VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    email_content JSON NOT NULL COMMENT 'Contains: html_content, text_content, attachments, headers, priority, tracking_pixels',
    template_id VARCHAR(50) NULL,
    template_data JSON,
    status ENUM('pending', 'sent', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED DEFAULT 0,
    max_attempts INT UNSIGNED DEFAULT 3,
    processing_details JSON COMMENT 'Contains: error_message, delivery_info, bounce_info, open_tracking, click_tracking',
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES email_templates(id),
    INDEX idx_status (status),
    INDEX idx_scheduled_at (scheduled_at),
    INDEX idx_to_email (to_email)
);

-- Abandoned cart recovery
CREATE TABLE abandoned_cart_recovery (
    id VARCHAR(50) PRIMARY KEY,
    cart_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    recovery_token VARCHAR(255) NOT NULL UNIQUE,
    email_sent_count INT UNSIGNED DEFAULT 0,
    last_email_sent_at TIMESTAMP NULL,
    recovered_at TIMESTAMP NULL, -- When user completed purchase
    recovery_order_id VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE,
    FOREIGN KEY (recovery_order_id) REFERENCES orders(id),
    INDEX idx_cart_id (cart_id),
    INDEX idx_recovery_token (recovery_token),
    INDEX idx_email (email)
);

-- =====================================================
-- SHIPPING & TAX TABLES
-- =====================================================

-- Shipping zones
CREATE TABLE shipping_zones (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    countries JSON NOT NULL, -- Array of country codes
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_active (is_active)
);

-- Shipping rates
CREATE TABLE shipping_rates (
    id VARCHAR(50) PRIMARY KEY,
    zone_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_weight DECIMAL(8,3) DEFAULT 0.000, -- kg
    max_weight DECIMAL(8,3) NULL, -- kg, NULL for unlimited
    base_rate DECIMAL(10,2) NOT NULL,
    per_kg_rate DECIMAL(10,2) DEFAULT 0.00,
    min_order_amount DECIMAL(10,2) DEFAULT 0.00, -- Free shipping threshold
    estimated_days_min INT UNSIGNED,
    estimated_days_max INT UNSIGNED,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (zone_id) REFERENCES shipping_zones(id),
    INDEX idx_zone_id (zone_id),
    INDEX idx_weight_range (min_weight, max_weight),
    INDEX idx_active (is_active)
);

-- Tax rates
CREATE TABLE tax_rates (
    id VARCHAR(50) PRIMARY KEY,
    location_json JSON NOT NULL COMMENT 'Contains: country, state, city, postal_code',
    tax_name VARCHAR(100) NOT NULL,
    tax_rate DECIMAL(8,6) NOT NULL, -- Percentage as decimal (e.g., 0.08 for 8%)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_location ((CAST(location_json->>'$.country' AS CHAR(2))), (CAST(location_json->>'$.state' AS CHAR(100))), (CAST(location_json->>'$.city' AS CHAR(100))), (CAST(location_json->>'$.postal_code' AS CHAR(20)))),
    INDEX idx_active (is_active)
);

-- =====================================================
-- SYSTEM TABLES
-- =====================================================

-- System settings
CREATE TABLE system_settings (
    id VARCHAR(50) PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type ENUM('string', 'integer', 'decimal', 'boolean', 'json') NOT NULL DEFAULT 'string',
    setting_details JSON COMMENT 'Contains: description, validation_rules, default_value, category, help_text, dependencies',
    is_public BOOLEAN DEFAULT FALSE, -- Can be accessed by frontend
    updated_by VARCHAR(50) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (updated_by) REFERENCES users(id),
    INDEX idx_setting_key (setting_key),
    INDEX idx_public (is_public)
);

-- Audit logs (for admin actions)
CREATE TABLE audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'product', 'order', 'user', etc.
    resource_id VARCHAR(50) NULL,
    old_values JSON,
    new_values JSON,
    session_details JSON COMMENT 'Contains: ip_address, user_agent, session_id, browser_info, device_info, location',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_created_at (created_at)
);

-- API rate limiting
CREATE TABLE api_rate_limits (
    id VARCHAR(50) PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- IP address or user ID
    identifier_type ENUM('ip', 'user') NOT NULL,
    endpoint VARCHAR(255),
    request_count INT UNSIGNED DEFAULT 1,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_rate_limit (identifier, identifier_type, endpoint, window_start),
    INDEX idx_identifier (identifier, identifier_type),
    INDEX idx_window_start (window_start)
);

-- =====================================================
-- INITIAL DATA INSERTS
-- =====================================================

-- Insert default payment methods
INSERT INTO payment_methods (id, name, type, processing_fee_percentage, processing_fee_fixed) VALUES
('PAY001', 'Stripe Credit Card', 'credit_card', 0.0290, 0.30),
('PAY002', 'PayPal', 'paypal', 0.0290, 0.30);

-- Insert default categories
INSERT INTO categories (id, name, slug, description) VALUES
('CAT001', 'Bed Sheets', 'bed-sheets', 'High-quality bed sheets in various materials and sizes'),
('CAT002', 'Comforters', 'comforters', 'Comfortable and warm comforters for all seasons'),
('CAT003', 'Pillowcases', 'pillowcases', 'Soft and durable pillowcases to match your bedding'),
('CAT004', 'Bed Sets', 'bed-sets', 'Complete bedding sets with matching pieces');

-- Insert default email templates
INSERT INTO email_templates (id, name, subject, template_content) VALUES
 ('EMAIL001', 'order_confirmation', 'Order Confirmation - {{order_number}}', 
  JSON_OBJECT(
      'html_content', '<h1>Thank you for your order!</h1><p>Your order {{order_number}} has been confirmed.</p>',
      'text_content', 'Thank you for your order! Your order {{order_number}} has been confirmed.',
      'variables', JSON_OBJECT('order_number', 'string', 'customer_name', 'string', 'total_amount', 'decimal')
  )),
 ('EMAIL002', 'order_shipped', 'Your Order Has Shipped - {{order_number}}', 
  JSON_OBJECT(
      'html_content', '<h1>Your order is on its way!</h1><p>Order {{order_number}} has been shipped. Tracking: {{tracking_number}}</p>',
      'text_content', 'Your order is on its way! Order {{order_number}} has been shipped. Tracking: {{tracking_number}}',
      'variables', JSON_OBJECT('order_number', 'string', 'tracking_number', 'string', 'customer_name', 'string')
  )),
 ('EMAIL003', 'abandoned_cart_1', 'You left something in your cart', 
  JSON_OBJECT(
      'html_content', '<h1>Don\'t forget your items!</h1><p>You have items waiting in your cart. Complete your purchase now!</p>',
      'text_content', 'Don\'t forget your items! You have items waiting in your cart. Complete your purchase now!',
      'variables', JSON_OBJECT('customer_name', 'string', 'cart_total', 'decimal', 'recovery_link', 'string')
  ));

-- Insert default system settings
INSERT INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, is_public) VALUES
 ('SYS001', 'site_name', 'Bed Texture Store', 'string', JSON_OBJECT('description', 'Website name'), true),
 ('SYS002', 'default_currency', 'USD', 'string', JSON_OBJECT('description', 'Default currency code'), true),
 ('SYS003', 'tax_calculation_service', 'manual', 'string', JSON_OBJECT('description', 'Tax calculation method (manual, taxjar)'), false),
 ('SYS004', 'abandoned_cart_recovery_enabled', 'true', 'boolean', JSON_OBJECT('description', 'Enable abandoned cart recovery emails'), false),
 ('SYS005', 'stock_reservation_duration', '3600', 'integer', JSON_OBJECT('description', 'Stock reservation duration in seconds (1 hour)'), false),
 ('SYS006', 'low_stock_threshold', '10', 'integer', JSON_OBJECT('description', 'Default low stock alert threshold'), false),
 ('SYS007', 'max_product_images', '40', 'integer', JSON_OBJECT('description', 'Maximum images per product'), false),
 ('SYS008', 'guest_checkout_enabled', 'true', 'boolean', JSON_OBJECT('description', 'Allow guest checkout'), true);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Product inventory view
CREATE VIEW product_inventory_view AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    pv.id as variant_id,
    pv.sku as variant_sku,
    pv.size,
    pv.color,
    i.quantity_available,
    i.quantity_reserved,
    i.reorder_point,
    CASE 
        WHEN i.quantity_available <= i.reorder_point THEN 'low_stock'
        WHEN i.quantity_available = 0 THEN 'out_of_stock'
        ELSE 'in_stock'
    END as stock_status
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
LEFT JOIN inventory i ON p.id = i.product_id AND (pv.id IS NULL OR pv.id = i.variant_id)
WHERE p.status = 'approved';

-- Order summary view
CREATE VIEW order_summary_view AS
SELECT 
    o.id,
    o.order_number,
    o.status,
    o.total_amount,
    o.currency,
    o.created_at,
    COALESCE(u.email, o.guest_email) as customer_email,
    CONCAT(o.shipping_address_json->>'$.first_name', ' ', o.shipping_address_json->>'$.last_name') as customer_name,
    COUNT(oi.id) as item_count,
    SUM(oi.quantity) as total_quantity
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id;

-- =====================================================
-- STORED PROCEDURES
-- =====================================================

DELIMITER //

-- Procedure to reserve stock during checkout
CREATE PROCEDURE ReserveStock(
    IN p_product_id VARCHAR(50),
    IN p_variant_id VARCHAR(50),
    IN p_quantity INT UNSIGNED,
    IN p_cart_id VARCHAR(50),
    IN p_user_id VARCHAR(50)
)
BEGIN
    DECLARE v_available INT UNSIGNED;
    DECLARE v_expires_at TIMESTAMP;
    
    -- Calculate expiration time (1 hour from now)
    SET v_expires_at = DATE_ADD(NOW(), INTERVAL 1 HOUR);
    
    -- Start transaction
    START TRANSACTION;
    
    -- Get current available quantity
    SELECT quantity_available INTO v_available
    FROM inventory
    WHERE product_id = p_product_id AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
    FOR UPDATE;
    
    -- Check if enough stock is available
    IF v_available >= p_quantity THEN
        -- Update inventory
        UPDATE inventory 
        SET quantity_available = quantity_available - p_quantity,
            quantity_reserved = quantity_reserved + p_quantity
        WHERE product_id = p_product_id AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL));
        
        -- Create reservation record
        INSERT INTO stock_reservations (product_id, variant_id, cart_id, user_id, quantity, expires_at)
        VALUES (p_product_id, p_variant_id, p_cart_id, p_user_id, p_quantity, v_expires_at);
        
        COMMIT;
        SELECT 'SUCCESS' as result, LAST_INSERT_ID() as reservation_id;
    ELSE
        ROLLBACK;
        SELECT 'INSUFFICIENT_STOCK' as result, v_available as available_quantity;
    END IF;
END//

-- Procedure to release expired stock reservations
DELIMITER //
CREATE PROCEDURE ReleaseExpiredReservations()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_product_id VARCHAR(50);
    DECLARE v_variant_id VARCHAR(50);
    DECLARE v_quantity INT UNSIGNED;
    
    DECLARE reservation_cursor CURSOR FOR
        SELECT product_id, variant_id, quantity
        FROM stock_reservations
        WHERE expires_at <= NOW();
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    START TRANSACTION;
    
    OPEN reservation_cursor;
    
    reservation_loop: LOOP
        FETCH reservation_cursor INTO v_product_id, v_variant_id, v_quantity;
        
        IF done THEN
            LEAVE reservation_loop;
        END IF;
        
        -- Release the reserved stock back to available
        UPDATE inventory
        SET quantity_available = quantity_available + v_quantity,
            quantity_reserved = quantity_reserved - v_quantity
        WHERE product_id = v_product_id AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL));
    END LOOP;
    
    CLOSE reservation_cursor;
    
    -- Delete expired reservations
    DELETE FROM stock_reservations WHERE expires_at <= NOW();
    
    COMMIT;
    
    SELECT ROW_COUNT() as released_reservations;
END//

DELIMITER ;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger to update product search index when product is updated
DELIMITER //
CREATE TRIGGER update_product_search_after_update
AFTER UPDATE ON products
FOR EACH ROW
BEGIN
    -- This would typically update a search index
    -- For now, we'll just ensure the updated_at timestamp is current
    IF NEW.name != OLD.name OR NEW.description != OLD.description THEN
        -- Log the search index update need
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, created_at)
        VALUES (1, 'search_index_update_needed', 'product', NEW.id, 
                JSON_OBJECT('name', OLD.name, 'description', OLD.description),
                JSON_OBJECT('name', NEW.name, 'description', NEW.description),
                NOW());
    END IF;
END//
DELIMITER ;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_products_category_status ON products(category_id, status);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_orders_date_status ON orders(created_at, status);
CREATE INDEX idx_inventory_low_stock ON inventory(quantity_available, reorder_point);
CREATE INDEX idx_cart_items_product_variant ON cart_items(product_id, variant_id);
CREATE INDEX idx_order_items_product_order ON order_items(product_id, order_id);

-- =====================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================

/*
Database Schema Summary:

1. USER SERVICE:
   - users: Main user table with roles (admin, staff, customer)
   - user_addresses: Shipping and billing addresses

2. PRODUCT SERVICE:
   - categories: Product categories (hierarchical)
   - products: Main product table with approval workflow
   - product_variants: Size, color, pattern combinations
   - product_images: 20-40 images per product with thumbnails
   - product_bundles: Bundle products (complete sets only)
   - bundle_items: Items in each bundle
   - product_reviews: Customer reviews with verification

3. INVENTORY SERVICE:
   - inventory: Stock levels per product/variant
   - stock_reservations: Temporary reservations during checkout
   - inventory_movements: Audit trail for stock changes

4. ORDER SERVICE:
   - shopping_carts: Guest and user carts
   - cart_items: Items in carts
   - orders: Main order table with full address storage
   - order_items: Individual items in orders
   - order_status_history: Status change tracking

5. PAYMENT SERVICE:
   - payment_methods: Available payment options
   - payments: Payment transactions
   - refunds: Refund processing

6. DISCOUNT SYSTEM:
   - discount_codes: Coupon codes and promotions
   - discount_code_usage: Usage tracking

7. NOTIFICATION SERVICE:
   - email_templates: Reusable email templates
   - email_queue: Email sending queue
   - abandoned_cart_recovery: Cart recovery campaigns

8. SHIPPING & TAX:
   - shipping_zones: Geographic shipping zones
   - shipping_rates: Weight and zone-based rates
   - tax_rates: Regional tax calculations

9. SYSTEM:
   - system_settings: Configuration settings
   - audit_logs: Admin action tracking
   - api_rate_limits: API rate limiting

Key Features Implemented:
- Multi-role user system (admin, staff, customer)
- Product approval workflow
- Inventory management with reservations
- Guest checkout support
- International shipping and tax
- Discount codes and coupons
- Email notifications
- Abandoned cart recovery
- Audit logging
- Rate limiting
- Product bundles
- Review system
- Multi-currency support
- Real-time stock management

Performance Considerations:
- Proper indexing for common queries
- Views for complex joins
- Stored procedures for critical operations
- Triggers for data consistency
- JSON fields for flexible data storage

Security Features:
- Foreign key constraints
- Proper data types and constraints
- Audit logging
- Rate limiting table structure
- Secure password storage (hash only)
*/
-- Migration 001: wishlists
-- Wishlist table for save-for-later functionality
CREATE TABLE IF NOT EXISTS wishlists (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wishlist_item (user_id, product_id, variant_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- Register WISH prefix for ID generation
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('WISH', 0, 'Wishlist ID counter');

-- Migration 002: returns
-- Return/RMA management tables
CREATE TABLE IF NOT EXISTS returns (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    return_number VARCHAR(50) NOT NULL UNIQUE,
    status ENUM('requested','approved','rejected','shipped_back','received','processed','closed') NOT NULL DEFAULT 'requested',
    reason ENUM('defective','wrong_item','not_as_described','changed_mind','damaged_shipping','other') NOT NULL,
    return_details JSON COMMENT 'Contains: description, evidence_urls, customer_notes, admin_notes, resolution_type',
    refund_amount DECIMAL(10,2) NULL,
    return_tracking_number VARCHAR(100) NULL,
    approved_by VARCHAR(50) NULL,
    approved_at TIMESTAMP NULL,
    received_at TIMESTAMP NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_order_id (order_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_return_number (return_number)
);

CREATE TABLE IF NOT EXISTS return_items (
    id VARCHAR(50) PRIMARY KEY,
    return_id VARCHAR(50) NOT NULL,
    order_item_id VARCHAR(50) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    reason TEXT,
    condition_on_receipt ENUM('new','good','fair','damaged') NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id),
    INDEX idx_return_id (return_id)
);

-- Register RMA prefixes for ID generation
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('RMA', 0, 'Return/RMA ID counter');
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('RMAITEM', 0, 'Return item ID counter');

-- Cart item + inventory movement ID prefixes (missing from the base schema; without
-- them get_next_id() returns NULL and cart-add / inventory inserts silently fail).
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('CARTITEM', 0, 'Cart item ID counter');
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('INVMOV', 0, 'Inventory movement ID counter');

-- Localized product content (see database/migrations/003_product_translations.sql).
CREATE TABLE IF NOT EXISTS product_translations (
  product_id VARCHAR(50) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  name VARCHAR(255),
  short_description TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, locale),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
