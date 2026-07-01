-- =====================================================
-- Supplier and Purchase Order Management Tables
-- =====================================================

-- Add supplier prefix to transno table
INSERT INTO transno (prefix, count, details) VALUES
('SUP', 0, 'Supplier ID counter'),
('PO', 0, 'Purchase Order ID counter'),
('POI', 0, 'Purchase Order Item ID counter')
ON DUPLICATE KEY UPDATE details = VALUES(details);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20),
    address_json JSON COMMENT 'Contains: company, address_line_1, address_line_2, city, state, postal_code, country',
    payment_terms VARCHAR(100) DEFAULT 'Net 30',
    lead_time_days INT UNSIGNED DEFAULT 7,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    notes TEXT,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_name (name),
    INDEX idx_status (status),
    INDEX idx_contact_email (contact_email)
);

-- Purchase orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id VARCHAR(50) PRIMARY KEY,
    po_number VARCHAR(100) NOT NULL UNIQUE,
    supplier_id VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'sent', 'confirmed', 'received', 'cancelled') DEFAULT 'pending',
    notes TEXT,
    status_notes TEXT,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_po_number (po_number),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Purchase order items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id VARCHAR(50) PRIMARY KEY,
    purchase_order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL,
    received_quantity INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    INDEX idx_purchase_order_id (purchase_order_id),
    INDEX idx_product_id (product_id)
);

-- Supplier product catalog (optional - for tracking supplier-specific product info)
CREATE TABLE IF NOT EXISTS supplier_products (
    id VARCHAR(50) PRIMARY KEY,
    supplier_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    supplier_sku VARCHAR(100),
    supplier_product_name VARCHAR(255),
    unit_cost DECIMAL(10,2),
    minimum_order_quantity INT UNSIGNED DEFAULT 1,
    lead_time_days INT UNSIGNED,
    is_preferred BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    UNIQUE KEY unique_supplier_product (supplier_id, product_id, variant_id),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_product_id (product_id),
    INDEX idx_preferred (is_preferred),
    INDEX idx_active (is_active)
);

-- Insert some sample suppliers for testing
INSERT INTO suppliers (id, name, contact_email, contact_phone, address_json, payment_terms, lead_time_days, created_by) VALUES
('SUP0000000001', 'Premium Textiles Inc.', 'orders@premiumtextiles.com', '+1-555-0101', 
 JSON_OBJECT('company', 'Premium Textiles Inc.', 'address_line_1', '123 Textile Way', 'city', 'New York', 'state', 'NY', 'postal_code', '10001', 'country', 'US'), 
 'Net 30', 14, 'USER0000000001'),
('SUP0000000002', 'Comfort Bedding Supply', 'sales@comfortbedding.com', '+1-555-0102', 
 JSON_OBJECT('company', 'Comfort Bedding Supply', 'address_line_1', '456 Comfort Blvd', 'city', 'Los Angeles', 'state', 'CA', 'postal_code', '90210', 'country', 'US'), 
 'Net 15', 7, 'USER0000000001'),
('SUP0000000003', 'Organic Cotton Co.', 'info@organiccotton.com', '+1-555-0103', 
 JSON_OBJECT('company', 'Organic Cotton Co.', 'address_line_1', '789 Green Street', 'city', 'Portland', 'state', 'OR', 'postal_code', '97201', 'country', 'US'), 
 'Net 30', 21, 'USER0000000001')
ON DUPLICATE KEY UPDATE name = VALUES(name);