-- Migration 009: per-user token version for session revocation.
--
-- Access tokens carry the user's token_version (claim `tv`). The auth middleware
-- rejects a token whose version no longer matches the row, so bumping this column
-- (role change, deactivation, password change) invalidates every outstanding
-- access token for that user immediately instead of when it expires.

ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;
