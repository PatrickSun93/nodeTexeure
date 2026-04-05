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
