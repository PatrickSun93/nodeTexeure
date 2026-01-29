-- =====================================================
-- Performance Optimization Indexes
-- Run this file to add performance indexes
-- Date: January 24, 2025
-- =====================================================

-- Analytics Performance Indexes
-- Optimize date-based queries for analytics
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_product_created ON order_items(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);

-- Review System Indexes
-- Optimize review queries and filtering
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON product_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON product_reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_helpful ON product_reviews(helpful_count);

-- Product Search Optimization
-- Improve product listing and search performance
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category_status ON products(category_id, status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured, status);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, status);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(base_price);

-- Cart Optimization
-- Speed up cart operations
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_shopping_carts_user ON shopping_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_carts_session ON shopping_carts(session_id);

-- User & Address Indexes
-- Optimize user lookups and address queries
CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(is_default);

-- Product Variants & Images
-- Improve product detail page performance
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(is_primary);

-- Discount & Coupon Optimization
CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes(is_active, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_discount_usage_user ON discount_code_usage(user_id);

-- Email & Notifications
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active, status);

-- Audit & Rate Limiting
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_identifier ON api_rate_limits(identifier, endpoint, window_start);

-- Inventory & Stock
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON stock_reservations(product_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at);

-- Composite Indexes for Common Queries
-- These speed up frequently used multi-column filters
CREATE INDEX IF NOT EXISTS idx_products_category_active_featured ON products(category_id, is_active, is_featured);
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created ON orders(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status_rating ON product_reviews(product_id, status, rating);

-- =====================================================
-- Optional: Database Views for Analytics
-- These pre-compute common analytics queries
-- =====================================================

-- Daily sales summary view
CREATE OR REPLACE VIEW vw_daily_sales AS
SELECT 
    DATE(created_at) as sale_date,
    COUNT(*) as order_count,
    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
    SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE 0 END) as total_revenue,
    AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE NULL END) as avg_order_value,
    SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN discount_amount ELSE 0 END) as total_discounts
FROM orders
GROUP BY DATE(created_at);

-- Product performance view
CREATE OR REPLACE VIEW vw_product_performance AS
SELECT 
    p.id,
    p.name,
    p.sku,
    p.base_price,
    p.stock_quantity,
    COUNT(DISTINCT oi.id) as times_sold,
    SUM(oi.quantity) as total_quantity_sold,
    SUM(oi.total_price) as total_revenue,
    AVG(pr.rating) as avg_rating,
    COUNT(DISTINCT pr.id) as review_count
FROM products p
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN product_reviews pr ON p.id = pr.product_id AND pr.status = 'approved'
GROUP BY p.id, p.name, p.sku, p.base_price, p.stock_quantity;

-- Customer lifetime value view
CREATE OR REPLACE VIEW vw_customer_lifetime_value AS
SELECT 
    u.id,
    u.email,
    CONCAT(u.first_name, ' ', u.last_name) as name,
    COUNT(o.id) as total_orders,
    SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total ELSE 0 END) as lifetime_value,
    AVG(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total ELSE NULL END) as avg_order_value,
    MIN(o.created_at) as first_order_date,
    MAX(o.created_at) as last_order_date
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.role = 'customer'
GROUP BY u.id, u.email, u.first_name, u.last_name;

-- Inventory status view
CREATE OR REPLACE VIEW vw_inventory_status AS
SELECT 
    p.id,
    p.name,
    p.sku,
    p.stock_quantity,
    p.low_stock_threshold,
    CASE 
        WHEN p.stock_quantity = 0 THEN 'out_of_stock'
        WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low_stock'
        ELSE 'in_stock'
    END as stock_status,
    p.base_price,
    p.cost_price,
    (p.stock_quantity * p.cost_price) as inventory_cost_value,
    (p.stock_quantity * p.base_price) as inventory_retail_value
FROM products p
WHERE p.is_active = TRUE;

-- =====================================================
-- Verification Queries
-- Run these to check index creation
-- =====================================================

-- Show all indexes on orders table
-- SHOW INDEXES FROM orders;

-- Show all indexes on products table
-- SHOW INDEXES FROM products;

-- Show all indexes on product_reviews table
-- SHOW INDEXES FROM product_reviews;

-- Analyze table statistics after index creation
-- ANALYZE TABLE orders;
-- ANALYZE TABLE products;
-- ANALYZE TABLE product_reviews;
-- ANALYZE TABLE order_items;

-- =====================================================
-- Performance Notes
-- =====================================================
-- After running these indexes:
-- 1. Analytics queries should be 5-10x faster
-- 2. Product listing should load in < 200ms
-- 3. Review queries should be instant
-- 4. Cart operations should be < 50ms
--
-- Monitor query performance with:
-- EXPLAIN SELECT ... (your query)
-- =====================================================
