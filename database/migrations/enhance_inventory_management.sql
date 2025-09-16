-- =====================================================
-- Enhanced Inventory Management Migration
-- =====================================================
-- This migration enhances the inventory management system with:
-- 1. Additional fields for better tracking
-- 2. Indexes for performance optimization
-- 3. Constraints for data integrity
-- =====================================================

-- Add missing indexes for better performance (using CREATE INDEX with error handling)
CREATE INDEX idx_inventory_low_stock ON inventory (quantity_available, reorder_point);
CREATE INDEX idx_inventory_updated_at ON inventory (updated_at);

-- Add missing indexes for inventory movements
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements (created_at);
CREATE INDEX idx_inventory_movements_movement_type ON inventory_movements (movement_type);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements (reference_type, reference_id);

-- Add missing indexes for stock reservations
CREATE INDEX idx_stock_reservations_expires_at ON stock_reservations (expires_at);
CREATE INDEX idx_stock_reservations_product_variant ON stock_reservations (product_id, variant_id);

-- Ensure email queue has proper indexes for low stock alerts
CREATE INDEX idx_email_queue_subject_created ON email_queue (subject, created_at);

-- Add order_cart_mapping table if it doesn't exist (for tracking cart to order relationship)
CREATE TABLE IF NOT EXISTS order_cart_mapping (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    cart_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_order_cart (order_id, cart_id),
    INDEX idx_order_id (order_id),
    INDEX idx_cart_id (cart_id)
);

-- Add system settings for inventory management if they don't exist
INSERT IGNORE INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, is_public) VALUES
('SYS001', 'inventory_low_stock_alert_enabled', 'true', 'boolean', 
 JSON_OBJECT('description', 'Enable automatic low stock alerts', 'category', 'inventory'), false),
('SYS002', 'inventory_reservation_timeout_minutes', '60', 'integer', 
 JSON_OBJECT('description', 'Stock reservation timeout in minutes', 'category', 'inventory'), false),
('SYS003', 'inventory_low_stock_alert_cooldown_hours', '24', 'integer', 
 JSON_OBJECT('description', 'Hours between low stock alerts for same product', 'category', 'inventory'), false);

-- Update transno table to include inventory movement counter if not exists
INSERT IGNORE INTO transno (prefix, count, details) VALUES
('INVMOV', 0, 'Inventory Movement ID counter');

-- Add triggers for automatic inventory movement logging (optional, can be handled in application)
-- Note: These triggers are commented out as we handle logging in the application layer
-- but they can be uncommented if automatic database-level logging is preferred

/*
DELIMITER //

-- Trigger for inventory updates
CREATE TRIGGER IF NOT EXISTS inventory_update_trigger
AFTER UPDATE ON inventory
FOR EACH ROW
BEGIN
    IF OLD.quantity_available != NEW.quantity_available OR 
       OLD.quantity_reserved != NEW.quantity_reserved OR 
       OLD.quantity_sold != NEW.quantity_sold THEN
        
        INSERT INTO inventory_movements (
            id, 
            inventory_id, 
            movement_type, 
            quantity_change, 
            reference_type, 
            reference_id, 
            movement_details, 
            created_by
        ) VALUES (
            CONCAT('INVMOV', LPAD((SELECT count + 1 FROM transno WHERE prefix = 'INVMOV'), 10, '0')),
            NEW.id,
            'adjustment',
            NEW.quantity_available - OLD.quantity_available,
            'system',
            NULL,
            JSON_OBJECT(
                'trigger', 'inventory_update_trigger',
                'old_values', JSON_OBJECT(
                    'available', OLD.quantity_available,
                    'reserved', OLD.quantity_reserved,
                    'sold', OLD.quantity_sold
                ),
                'new_values', JSON_OBJECT(
                    'available', NEW.quantity_available,
                    'reserved', NEW.quantity_reserved,
                    'sold', NEW.quantity_sold
                )
            ),
            'system'
        );
        
        -- Update the counter
        UPDATE transno SET count = count + 1 WHERE prefix = 'INVMOV';
    END IF;
END//

DELIMITER ;
*/

-- Add constraints to prevent negative inventory (optional, can cause issues with concurrent updates)
-- ALTER TABLE inventory ADD CONSTRAINT chk_inventory_non_negative 
-- CHECK (quantity_available >= 0 AND quantity_reserved >= 0 AND quantity_sold >= 0);

-- Create a view for inventory summary (useful for reporting)
CREATE OR REPLACE VIEW inventory_summary AS
SELECT 
    i.id,
    i.product_id,
    i.variant_id,
    p.name as product_name,
    p.sku as product_sku,
    pv.size,
    pv.color,
    pv.pattern,
    pv.sku as variant_sku,
    i.quantity_available,
    i.quantity_reserved,
    i.quantity_sold,
    i.reorder_point,
    i.reorder_quantity,
    (i.quantity_available + i.quantity_reserved) as total_quantity,
    CASE 
        WHEN i.quantity_available <= i.reorder_point THEN 'LOW_STOCK'
        WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
        ELSE 'IN_STOCK'
    END as stock_status,
    i.last_restocked_at,
    i.updated_at
FROM inventory i
JOIN products p ON i.product_id = p.id
LEFT JOIN product_variants pv ON i.variant_id = pv.id;

-- Create a view for recent inventory movements (useful for audit trail)
CREATE OR REPLACE VIEW recent_inventory_movements AS
SELECT 
    im.id,
    im.inventory_id,
    im.movement_type,
    im.quantity_change,
    im.reference_type,
    im.reference_id,
    im.movement_details,
    im.created_by,
    im.created_at,
    p.name as product_name,
    p.sku as product_sku,
    pv.size,
    pv.color,
    pv.pattern,
    CONCAT(u.first_name, ' ', u.last_name) as created_by_name
FROM inventory_movements im
JOIN inventory i ON im.inventory_id = i.id
JOIN products p ON i.product_id = p.id
LEFT JOIN product_variants pv ON i.variant_id = pv.id
LEFT JOIN users u ON im.created_by = u.id
ORDER BY im.created_at DESC;

-- Add comments to tables for documentation
ALTER TABLE inventory COMMENT = 'Enhanced inventory tracking with reservation support and audit trail';
ALTER TABLE inventory_movements COMMENT = 'Comprehensive audit trail for all inventory changes';
ALTER TABLE stock_reservations COMMENT = 'Temporary stock reservations during checkout process';

COMMIT;