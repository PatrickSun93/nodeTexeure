-- Email suppression list backing the storefront Unsubscribe feature.
-- One row = one address that has opted out of MARKETING email (abandoned-cart,
-- newsletter, promo, …). Transactional email (order confirmation, password reset,
-- email verification) is never suppressed and never consults this table.
--
-- The `token` is a stateless HMAC of the address (see backend/utils/emailSuppression.js)
-- so one-click links in emails are self-verifying — the column stores the last token
-- used to opt out, for audit/reference; verification itself does not read it.
--
-- Custom-ID prefix: 'UNSB' (registered below so get_next_id('UNSB') works).
-- Seed rows live in backend/scripts/seed-example-data.js (seedUnsubscribes), idempotent.
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id               VARCHAR(50)  PRIMARY KEY,
  email            VARCHAR(255) NOT NULL,
  token            VARCHAR(255) NOT NULL,
  scope            VARCHAR(32)  NOT NULL DEFAULT 'all',
  reason           VARCHAR(255) NULL,
  unsubscribed_at  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_unsub_email (email),
  INDEX idx_email_unsub_email (email)
);

-- Register the custom-ID prefix so get_next_id('UNSB') works.
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('UNSB', 0, 'Email unsubscribe / suppression ID counter');
