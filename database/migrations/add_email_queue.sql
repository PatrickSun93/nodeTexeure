-- Email Queue System Migration
-- This migration modifies the existing email_queue table for reliable email delivery

-- Add missing columns to existing email_queue table
ALTER TABLE email_queue 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) AFTER id,
ADD COLUMN IF NOT EXISTS recipient VARCHAR(255) AFTER type,
ADD COLUMN IF NOT EXISTS data JSON AFTER recipient,
ADD COLUMN IF NOT EXISTS priority INT DEFAULT 3 AFTER data,
ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0 AFTER priority,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NULL AFTER sent_at,
ADD COLUMN IF NOT EXISTS message_id VARCHAR(255) NULL AFTER completed_at,
ADD COLUMN IF NOT EXISTS error_message TEXT NULL AFTER message_id;

-- Update status enum to include our values
ALTER TABLE email_queue 
MODIFY COLUMN status ENUM('pending', 'sent', 'failed', 'cancelled', 'completed') DEFAULT 'pending';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_type ON email_queue(type);
CREATE INDEX IF NOT EXISTS idx_recipient ON email_queue(recipient);
CREATE INDEX IF NOT EXISTS idx_priority_created ON email_queue(priority, created_at);
CREATE INDEX IF NOT EXISTS idx_completed_at ON email_queue(completed_at);

-- Create email_templates table for future template management
CREATE TABLE IF NOT EXISTS email_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_active (is_active)
);

-- Insert default email templates
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, is_active) VALUES
('order_confirmation', 'Order Confirmation', 'Order Confirmation - Order #{{orderNumber}}', 
 '<h1>Order Confirmation</h1><p>Thank you for your order #{{orderNumber}}!</p>', 
 'Order Confirmation - Order #{{orderNumber}}\n\nThank you for your order!', 
 '["orderNumber", "customerName", "totalAmount", "items"]', TRUE),

('order_status_update', 'Order Status Update', 'Order Update - Order #{{orderNumber}}', 
 '<h1>Order Status Update</h1><p>Your order #{{orderNumber}} status: {{status}}</p>', 
 'Order Status Update - Order #{{orderNumber}}\n\nStatus: {{status}}', 
 '["orderNumber", "status", "trackingNumber"]', TRUE),

('shipping_notification', 'Shipping Notification', 'Your Order Has Shipped - Order #{{orderNumber}}', 
 '<h1>Your Order Has Shipped!</h1><p>Tracking: {{trackingNumber}}</p>', 
 'Your Order Has Shipped! - Order #{{orderNumber}}\n\nTracking: {{trackingNumber}}', 
 '["orderNumber", "trackingNumber", "estimatedDelivery"]', TRUE),

('abandoned_cart', 'Abandoned Cart Recovery', 'You left something in your cart', 
 '<h1>Complete Your Purchase</h1><p>Don\'t forget about your items!</p>', 
 'Complete Your Purchase\n\nDon\'t forget about your items!', 
 '["customerName", "items", "totalAmount", "checkoutUrl"]', TRUE),

('welcome_email', 'Welcome Email', 'Welcome to {{storeName}}!', 
 '<h1>Welcome to {{storeName}}!</h1><p>Thank you for joining us, {{customerName}}!</p>', 
 'Welcome to {{storeName}}!\n\nThank you for joining us, {{customerName}}!', 
 '["customerName", "storeName", "email"]', TRUE),

('low_stock_alert', 'Low Stock Alert', 'Low Stock Alert - {{productCount}} products need attention', 
 '<h1>Low Stock Alert</h1><p>{{productCount}} products are running low on stock.</p>', 
 'Low Stock Alert\n\n{{productCount}} products are running low on stock.', 
 '["productCount", "products"]', TRUE);

-- Create email_logs table for audit trail
CREATE TABLE IF NOT EXISTS email_logs (
    id VARCHAR(50) PRIMARY KEY,
    queue_id VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    status ENUM('sent', 'failed', 'bounced', 'complained') NOT NULL,
    message_id VARCHAR(255),
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_queue_id (queue_id),
    INDEX idx_recipient (recipient),
    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_sent_at (sent_at),
    
    FOREIGN KEY (queue_id) REFERENCES email_queue(id) ON DELETE SET NULL
);

-- Create email_preferences table for user email preferences
CREATE TABLE IF NOT EXISTS email_preferences (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    order_confirmations BOOLEAN DEFAULT TRUE,
    order_updates BOOLEAN DEFAULT TRUE,
    shipping_notifications BOOLEAN DEFAULT TRUE,
    marketing_emails BOOLEAN DEFAULT TRUE,
    abandoned_cart_emails BOOLEAN DEFAULT TRUE,
    unsubscribed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_user_email (user_id, email),
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_unsubscribed (unsubscribed_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);