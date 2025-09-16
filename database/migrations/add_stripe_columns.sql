-- =====================================================
-- Add Stripe Integration Columns
-- Migration for Stripe payment processing support
-- =====================================================

-- Add Stripe-specific columns to payments table
ALTER TABLE payments 
ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL;

ALTER TABLE payments 
ADD COLUMN stripe_payment_method_id VARCHAR(255) NULL;

ALTER TABLE payments 
ADD COLUMN stripe_customer_id VARCHAR(255) NULL;

-- Add Stripe-specific columns to orders table
ALTER TABLE orders 
ADD COLUMN payment_status ENUM('pending', 'pending_action', 'completed', 'failed', 'canceled') DEFAULT 'pending';

ALTER TABLE orders 
ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL;

-- Add indexes for better performance
ALTER TABLE payments 
ADD INDEX idx_stripe_payment_intent (stripe_payment_intent_id);

ALTER TABLE payments 
ADD INDEX idx_stripe_customer (stripe_customer_id);

ALTER TABLE orders 
ADD INDEX idx_payment_status (payment_status);

ALTER TABLE orders 
ADD INDEX idx_stripe_payment_intent (stripe_payment_intent_id);

-- Add Stripe customer information to users table
ALTER TABLE users 
ADD COLUMN stripe_customer_id VARCHAR(255) NULL;

ALTER TABLE users 
ADD INDEX idx_stripe_customer (stripe_customer_id);