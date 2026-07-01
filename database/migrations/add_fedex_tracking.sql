-- Add FedEx tracking fields to orders table
-- Migration: Add FedEx tracking integration fields

ALTER TABLE orders 
ADD COLUMN fedex_tracking_number VARCHAR(100) NULL AFTER tracking_number,
ADD COLUMN fedex_shipment_id VARCHAR(100) NULL,
ADD COLUMN estimated_delivery_date DATE NULL,
ADD COLUMN actual_delivery_date TIMESTAMP NULL,
ADD COLUMN carrier_name VARCHAR(50) DEFAULT 'FedEx',
ADD COLUMN shipping_service_type VARCHAR(100) NULL COMMENT 'FedEx service type like FEDEX_GROUND, FEDEX_EXPRESS_SAVER, etc.',
ADD INDEX idx_fedex_tracking (fedex_tracking_number),
ADD INDEX idx_fedex_shipment (fedex_shipment_id);

-- Add FedEx shipment details table for storing detailed shipping information
CREATE TABLE fedex_shipments (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    shipment_id VARCHAR(100) NOT NULL UNIQUE,
    tracking_number VARCHAR(100) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    package_details JSON NOT NULL COMMENT 'Contains: weight, dimensions, declared_value, package_count',
    shipping_address JSON NOT NULL COMMENT 'Contains: recipient details and address',
    shipment_status ENUM('created', 'picked_up', 'in_transit', 'delivered', 'exception', 'cancelled') DEFAULT 'created',
    estimated_delivery_date DATE NULL,
    actual_delivery_date TIMESTAMP NULL,
    delivery_signature VARCHAR(255) NULL,
    fedex_response JSON COMMENT 'Store full FedEx API response for debugging',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_id (order_id),
    INDEX idx_tracking_number (tracking_number),
    INDEX idx_shipment_status (shipment_status)
);

-- Add FedEx tracking events table for detailed tracking history
CREATE TABLE fedex_tracking_events (
    id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_description TEXT NOT NULL,
    event_location JSON COMMENT 'Contains: city, state, country, postal_code',
    event_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (shipment_id) REFERENCES fedex_shipments(id) ON DELETE CASCADE,
    INDEX idx_shipment_id (shipment_id),
    INDEX idx_event_timestamp (event_timestamp)
);

-- Add FedEx-related prefixes to transno table
INSERT INTO transno (prefix, count, details) VALUES
('FEDX', 0, 'FedEx shipment ID counter'),
('FEVT', 0, 'FedEx tracking event ID counter')
ON DUPLICATE KEY UPDATE details = VALUES(details);