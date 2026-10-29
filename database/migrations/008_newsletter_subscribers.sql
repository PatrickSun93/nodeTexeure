-- Newsletter subscribers backing the storefront newsletter signup
-- (src/components/NewsletterSection.js -> POST /api/newsletter/subscribe).
-- One row = one address on the marketing newsletter list. Idempotent signup relies
-- on the UNIQUE(email) key (the route upserts with ON DUPLICATE KEY UPDATE).
--
-- Uses an AUTO_INCREMENT surrogate key (not a get_next_id custom prefix) so the
-- signup path has no dependency on the transno registry.
--
-- NOTE: Docker only auto-runs docker/mysql/init.sql, so this migration must be
-- applied explicitly (or folded into init.sql) for the table to exist in a fresh
-- stack. Apply with:  mysql ... < database/migrations/007_newsletter_subscribers.sql
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  status      VARCHAR(32)  NOT NULL DEFAULT 'subscribed',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_newsletter_email (email),
  INDEX idx_newsletter_email (email)
);
