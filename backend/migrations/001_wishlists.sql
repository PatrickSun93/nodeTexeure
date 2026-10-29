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
