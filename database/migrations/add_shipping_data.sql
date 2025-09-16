-- =====================================================
-- Shipping Zones and Rates Initial Data
-- =====================================================

-- Insert default shipping zones
INSERT INTO shipping_zones (id, name, countries, is_active) VALUES
('SHIP0000000001', 'United States', '["US"]', TRUE),
('SHIP0000000002', 'Canada', '["CA"]', TRUE),
('SHIP0000000003', 'Europe', '["GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "CH", "SE", "NO", "DK", "FI"]', TRUE),
('SHIP0000000004', 'Asia Pacific', '["AU", "NZ", "JP", "SG", "HK", "KR"]', TRUE),
('SHIP0000000005', 'Rest of World', '["MX", "BR", "AR", "CL", "IN", "CN", "TH", "MY", "PH", "ID", "VN"]', TRUE);

-- Insert shipping rates for United States
INSERT INTO shipping_rates (id, zone_id, name, min_weight, max_weight, base_rate, per_kg_rate, min_order_amount, estimated_days_min, estimated_days_max, is_active) VALUES
('SHIP0000000006', 'SHIP0000000001', 'Standard Shipping', 0.000, 10.000, 5.99, 0.50, 0.00, 5, 7, TRUE),
('SHIP0000000007', 'SHIP0000000001', 'Express Shipping', 0.000, 10.000, 12.99, 1.00, 0.00, 2, 3, TRUE),
('SHIP0000000008', 'SHIP0000000001', 'Free Standard Shipping', 0.000, 10.000, 0.00, 0.00, 75.00, 5, 7, TRUE),
('SHIP0000000009', 'SHIP0000000001', 'Heavy Item Shipping', 10.001, NULL, 15.99, 2.00, 0.00, 7, 10, TRUE);

-- Insert shipping rates for Canada
INSERT INTO shipping_rates (id, zone_id, name, min_weight, max_weight, base_rate, per_kg_rate, min_order_amount, estimated_days_min, estimated_days_max, is_active) VALUES
('SHIP0000000010', 'SHIP0000000002', 'Standard Shipping', 0.000, 10.000, 8.99, 0.75, 0.00, 7, 10, TRUE),
('SHIP0000000011', 'SHIP0000000002', 'Express Shipping', 0.000, 10.000, 18.99, 1.50, 0.00, 3, 5, TRUE),
('SHIP0000000012', 'SHIP0000000002', 'Free Standard Shipping', 0.000, 10.000, 0.00, 0.00, 100.00, 7, 10, TRUE),
('SHIP0000000013', 'SHIP0000000002', 'Heavy Item Shipping', 10.001, NULL, 22.99, 3.00, 0.00, 10, 14, TRUE);

-- Insert shipping rates for Europe
INSERT INTO shipping_rates (id, zone_id, name, min_weight, max_weight, base_rate, per_kg_rate, min_order_amount, estimated_days_min, estimated_days_max, is_active) VALUES
('SHIP0000000014', 'SHIP0000000003', 'Standard Shipping', 0.000, 10.000, 12.99, 1.00, 0.00, 10, 14, TRUE),
('SHIP0000000015', 'SHIP0000000003', 'Express Shipping', 0.000, 10.000, 24.99, 2.00, 0.00, 5, 7, TRUE),
('SHIP0000000016', 'SHIP0000000003', 'Free Standard Shipping', 0.000, 10.000, 0.00, 0.00, 150.00, 10, 14, TRUE),
('SHIP0000000017', 'SHIP0000000003', 'Heavy Item Shipping', 10.001, NULL, 35.99, 4.00, 0.00, 14, 21, TRUE);

-- Insert shipping rates for Asia Pacific
INSERT INTO shipping_rates (id, zone_id, name, min_weight, max_weight, base_rate, per_kg_rate, min_order_amount, estimated_days_min, estimated_days_max, is_active) VALUES
('SHIP0000000018', 'SHIP0000000004', 'Standard Shipping', 0.000, 10.000, 15.99, 1.25, 0.00, 14, 21, TRUE),
('SHIP0000000019', 'SHIP0000000004', 'Express Shipping', 0.000, 10.000, 29.99, 2.50, 0.00, 7, 10, TRUE),
('SHIP0000000020', 'SHIP0000000004', 'Free Standard Shipping', 0.000, 10.000, 0.00, 0.00, 200.00, 14, 21, TRUE),
('SHIP0000000021', 'SHIP0000000004', 'Heavy Item Shipping', 10.001, NULL, 45.99, 5.00, 0.00, 21, 28, TRUE);

-- Insert shipping rates for Rest of World
INSERT INTO shipping_rates (id, zone_id, name, min_weight, max_weight, base_rate, per_kg_rate, min_order_amount, estimated_days_min, estimated_days_max, is_active) VALUES
('SHIP0000000022', 'SHIP0000000005', 'Standard Shipping', 0.000, 10.000, 19.99, 1.50, 0.00, 21, 28, TRUE),
('SHIP0000000023', 'SHIP0000000005', 'Express Shipping', 0.000, 10.000, 39.99, 3.00, 0.00, 10, 14, TRUE),
('SHIP0000000024', 'SHIP0000000005', 'Free Standard Shipping', 0.000, 10.000, 0.00, 0.00, 250.00, 21, 28, TRUE),
('SHIP0000000025', 'SHIP0000000005', 'Heavy Item Shipping', 10.001, NULL, 59.99, 6.00, 0.00, 28, 35, TRUE);

-- Update transno counter for shipping
UPDATE transno SET count = 25 WHERE prefix = 'SHIP';