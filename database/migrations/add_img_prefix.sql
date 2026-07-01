-- Add IMG prefix for image IDs
INSERT INTO transno (prefix, count, details) VALUES
('IMG', 0, 'Image ID counter')
ON DUPLICATE KEY UPDATE details = 'Image ID counter';