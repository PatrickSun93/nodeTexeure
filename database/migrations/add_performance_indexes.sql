-- =====================================================
-- Performance Optimization - Database Indexes
-- =====================================================
-- This migration adds optimized indexes for frequently accessed queries
-- Based on common query patterns in the e-commerce platform

-- =====================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- =====================================================

-- Products: Search and filtering optimization
ALTER TABLE products ADD INDEX idx_status_category_created (status, category_id, created_at);
ALTER TABLE products ADD INDEX idx_category_status_price (category_id, status, base_price);

-- Product variants: Inventory and cart operations
ALTER TABLE product_variants ADD INDEX idx_product_active_size (product_id, is_active, size);
ALTER TABLE product_variants ADD INDEX idx_product_active_color (product_id, is_active, color);

-- Inventory: Stock checking and low stock alerts
ALTER TABLE inventory ADD INDEX idx_product_variant_available (product_id, variant_id, quantity_available);
ALTER TABLE inventory ADD INDEX idx_low_stock_check (quantity_available, reorder_point, product_id);

-- Orders: Admin dashboard and customer history
ALTER TABLE orders ADD INDEX idx_user_status_created (user_id, status, created_at);
ALTER TABLE orders ADD INDEX idx_status_created_total (status, created_at, total_amount);
ALTER TABLE orders ADD INDEX idx_guest_email_created (guest_email, created_at);

-- Order items: Order details and product analytics
ALTER TABLE order_items ADD INDEX idx_product_created_quantity (product_id, created_at, quantity);
ALTER TABLE order_items ADD INDEX idx_order_product_variant (order_id, product_id, variant_id);

-- Cart operations: Session and user cart management
ALTER TABLE shopping_carts ADD INDEX idx_session_updated (session_id, updated_at);
ALTER TABLE shopping_carts ADD INDEX idx_user_updated (user_id, updated_at);

-- Cart items: Cart display and checkout
ALTER TABLE cart_items ADD INDEX idx_cart_product_variant (cart_id, product_id, variant_id);
ALTER TABLE cart_items ADD INDEX idx_product_updated (product_id, updated_at);

-- Stock reservations: Checkout process optimization
ALTER TABLE stock_reservations ADD INDEX idx_expires_product_variant (expires_at, product_id, variant_id);
ALTER TABLE stock_reservations ADD INDEX idx_cart_expires (cart_id, expires_at);

-- Payment processing: Transaction tracking
ALTER TABLE payments ADD INDEX idx_order_status_created (order_id, status, created_at);
ALTER TABLE payments ADD INDEX idx_gateway_transaction_status (gateway_transaction_id, status);

-- Email queue: Processing optimization
ALTER TABLE email_queue ADD INDEX idx_status_scheduled_attempts (status, scheduled_at, attempts);
ALTER TABLE email_queue ADD INDEX idx_template_status_created (template_id, status, created_at);

-- Audit logs: Admin reporting and security
ALTER TABLE audit_logs ADD INDEX idx_user_action_created (user_id, action, created_at);
ALTER TABLE audit_logs ADD INDEX idx_resource_created (resource_type, resource_id, created_at);

-- Rate limiting: API performance
ALTER TABLE api_rate_limits ADD INDEX idx_identifier_endpoint_window (identifier, endpoint, window_start);
ALTER TABLE api_rate_limits ADD INDEX idx_window_start_cleanup (window_start);

-- =====================================================
-- COVERING INDEXES FOR FREQUENT READ OPERATIONS
-- =====================================================

-- Product listing with basic info (covers common product queries)
ALTER TABLE products ADD INDEX idx_product_listing_cover (status, category_id, created_at, id, name, slug, base_price);

-- Inventory status check (covers stock availability queries)
ALTER TABLE inventory ADD INDEX idx_inventory_status_cover (product_id, variant_id, quantity_available, quantity_reserved);

-- Order summary (covers order list queries)
ALTER TABLE orders ADD INDEX idx_order_summary_cover (user_id, status, created_at, id, order_number, total_amount);

-- =====================================================
-- JSON COLUMN INDEXES (MySQL 8.0+)
-- =====================================================

-- Product details search optimization
ALTER TABLE products ADD INDEX idx_product_weight ((CAST(product_details->>'$.weight' AS DECIMAL(8,3))));
ALTER TABLE products ADD INDEX idx_product_material ((CAST(product_details->>'$.material' AS CHAR(100))));

-- Address-based queries for shipping and tax
ALTER TABLE user_addresses ADD INDEX idx_address_country_state ((CAST(address_json->>'$.country' AS CHAR(2))), (CAST(address_json->>'$.state' AS CHAR(100))));

-- Order address optimization for reporting
ALTER TABLE orders ADD INDEX idx_shipping_country ((CAST(shipping_address_json->>'$.country' AS CHAR(2))));
ALTER TABLE orders ADD INDEX idx_billing_country ((CAST(billing_address_json->>'$.country' AS CHAR(2))));

-- =====================================================
-- CLEANUP OLD/UNUSED INDEXES
-- =====================================================

-- Remove any duplicate or redundant indexes
-- (These would be identified through EXPLAIN PLAN analysis)

-- Note: Before dropping indexes, verify they're not used by checking:
-- SELECT * FROM sys.schema_unused_indexes WHERE object_schema = 'bed_texture_ecommerce';

-- =====================================================
-- INDEX STATISTICS UPDATE
-- =====================================================

-- Force MySQL to update index statistics for better query planning
ANALYZE TABLE products, product_variants, inventory, orders, order_items, 
             shopping_carts, cart_items, payments, email_queue, audit_logs;