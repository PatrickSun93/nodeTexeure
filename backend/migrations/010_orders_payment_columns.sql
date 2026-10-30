-- Migration 010: payment-tracking columns on orders.
--
-- routes/paymentRoutes.js and services/stripeService.js read and write these, but
-- they only existed in the never-applied legacy database/migrations/add_stripe_columns.sql,
-- so on any database built from init.sql every Stripe write to `orders` failed
-- (silently — executeQuery doesn't throw). Columns are added only if missing so
-- databases that did run the legacy script converge too.

SET @db = DATABASE();

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'orders' AND column_name = 'payment_status') = 0,
  "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(32) NOT NULL DEFAULT 'pending'", 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Normalise (the legacy script used an ENUM without paid/refunded).
ALTER TABLE orders MODIFY COLUMN payment_status
  ENUM('pending', 'pending_action', 'paid', 'failed', 'canceled', 'refunded', 'partially_refunded')
  NOT NULL DEFAULT 'pending';

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'orders' AND column_name = 'stripe_payment_intent_id') = 0,
  'ALTER TABLE orders ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL, ADD INDEX idx_orders_stripe_payment_intent (stripe_payment_intent_id)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'orders' AND column_name = 'stripe_session_id') = 0,
  'ALTER TABLE orders ADD COLUMN stripe_session_id VARCHAR(255) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'orders' AND column_name = 'paid_at') = 0,
  'ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Orders already marked delivered/shipped/etc. were paid through some flow.
UPDATE orders SET payment_status = 'paid'
WHERE payment_status = 'pending' AND status IN ('confirmed', 'processing', 'shipped', 'delivered');
UPDATE orders SET payment_status = 'refunded' WHERE status = 'refunded';
