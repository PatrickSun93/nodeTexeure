-- Migration 012: email queue fixes + missing transactional templates.
--
-- 1. The email daemon claims a row by setting status = 'processing', but the
--    enum had no 'processing' value, so under strict mode the claim failed
--    (silently) and nothing stopped a row from being sent twice. claimed_at lets
--    the daemon return rows abandoned by a crashed worker to the queue.
-- 2. The API enqueues welcome_user, email_verification, password_reset and the
--    order_confirmed/processing/delivered/cancelled status emails, but only
--    order_confirmation, order_shipped and abandoned_cart_1 existed — the
--    producer skips unknown templates, so those emails were never sent.

ALTER TABLE email_queue
  MODIFY COLUMN status ENUM('pending', 'processing', 'sent', 'failed', 'cancelled') NOT NULL DEFAULT 'pending';

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'email_queue' AND column_name = 'claimed_at') = 0,
  'ALTER TABLE email_queue ADD COLUMN claimed_at TIMESTAMP NULL AFTER status', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rows truncated to '' by the failed 'processing' claim go back to the queue.
UPDATE email_queue SET status = 'pending' WHERE status = '';

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'welcome_user', 'Welcome to Noiraé, {{first_name}}', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">Welcome, {{first_name}}</h1><p>Thank you for creating an account. Your bedding, wishlist and orders are all in one place.</p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Welcome, {{first_name}}. Thank you for creating a Noiraé account."}', 'transactional', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'welcome_user');

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'email_verification', 'Confirm your email address', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">Confirm your email</h1><p>Hi {{first_name}}, please confirm your email address to finish setting up your account.</p><p><a href=\\"{{verify_link}}\\" style=\\"display:inline-block;padding:12px 24px;background:#2A2621;color:#F3EBDD;text-decoration:none;border-radius:4px\\">Confirm email</a></p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Hi {{first_name}}, confirm your email address: {{verify_link}}"}', 'transactional', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'email_verification');

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'password_reset', 'Reset your password', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">Reset your password</h1><p>We received a request to reset your password. This link expires in one hour.</p><p><a href=\\"{{reset_link}}\\" style=\\"display:inline-block;padding:12px 24px;background:#2A2621;color:#F3EBDD;text-decoration:none;border-radius:4px\\">Reset password</a></p><p>If you didn''t ask for this, you can ignore this email.</p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Reset your password (link expires in one hour): {{reset_link}}"}', 'transactional', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'password_reset');

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'order_confirmed', 'Order {{order_number}} confirmed', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">Your order is confirmed</h1><p>Hi {{customer_name}}, order <strong>{{order_number}}</strong> is confirmed and being prepared.</p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Hi {{customer_name}}, order {{order_number}} is confirmed."}', 'order_status', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'order_confirmed');

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'order_processing', 'Order {{order_number}} is being prepared', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">We''re preparing your order</h1><p>Hi {{customer_name}}, order <strong>{{order_number}}</strong> is being prepared for shipping.</p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Hi {{customer_name}}, order {{order_number}} is being prepared."}', 'order_status', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'order_processing');

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'order_delivered', 'Order {{order_number}} delivered', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">Your order has arrived</h1><p>Hi {{customer_name}}, order <strong>{{order_number}}</strong> has been delivered. We hope you sleep beautifully.</p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Hi {{customer_name}}, order {{order_number}} has been delivered."}', 'order_status', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'order_delivered');

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'order_cancelled', 'Order {{order_number}} cancelled', '{"html_content": "<div style=\\"font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621\\"><h1 style=\\"font-weight:normal;color:#2A2621\\">Your order was cancelled</h1><p>Hi {{customer_name}}, order <strong>{{order_number}}</strong> has been cancelled. Any payment will be refunded to the original method.</p><p style=\\"color:#8C6B3D;font-size:13px;margin-top:32px\\">Noiraé — silk &amp; cashmere bedding</p></div>", "text_content": "Hi {{customer_name}}, order {{order_number}} has been cancelled."}', 'order_status', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'order_cancelled');
