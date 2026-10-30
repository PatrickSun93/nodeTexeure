-- Migration 011: refresh tokens.
--
-- POST /api/users/login has always written refresh tokens here (with a 'REFRESH'
-- custom-ID prefix), but neither the table nor the prefix existed, so every
-- refresh token was dropped and POST /api/users/refresh could never succeed.
-- Only the SHA-256 hash of each token is stored.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expiry TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO transno (prefix, count, details) VALUES ('REFRESH', 0, 'Refresh token ID counter');
