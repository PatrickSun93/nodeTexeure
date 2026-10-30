-- Migration 015: compare unsubscribe addresses exactly.
--
-- Unsubscribe/resubscribe tokens are an HMAC of the exact normalized address
-- (trim + lowercase, backend/utils/emailSuppression.js and the Rust
-- email_queue.rs), but email_unsubscribes.email used the table default
-- utf8mb4_unicode_ci, which ignores accents. A valid token for a look-alike
-- address (alice@exämple.com, easy to obtain: a guest abandoned-cart email
-- carries one) therefore matched alice@example.com's row: it could delete her
-- opt-out (re-subscribing her) or, through the unique key's ON DUPLICATE KEY,
-- rewrite it — and a look-alike row also suppressed her mail. A binary
-- collation makes the unique key, the upsert and every lookup exact.
--
-- Every writer and reader already normalizes the address, so existing rows are
-- lowercased/trimmed first (rows that were distinct under the case- and
-- accent-insensitive key stay distinct).
UPDATE email_unsubscribes SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email)) COLLATE utf8mb4_bin;

ALTER TABLE email_unsubscribes
  MODIFY email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
