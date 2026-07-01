-- Migration: Add security monitoring columns to audit_logs table
-- Date: 2025-01-15
-- Purpose: Enhance audit_logs table for security monitoring and threat detection

-- Add new columns for security monitoring
ALTER TABLE audit_logs 
ADD COLUMN operation_type VARCHAR(100) NULL COMMENT 'Security operation type (USER_LOGIN, SECURITY_VIOLATION, etc.)',
ADD COLUMN audit_details JSON NULL COMMENT 'Complete audit event details including request/response data',
ADD COLUMN severity VARCHAR(20) NULL COMMENT 'Security event severity (LOW, MEDIUM, HIGH, CRITICAL)',
ADD COLUMN ip_address VARCHAR(45) NULL COMMENT 'IP address for quick filtering',
ADD COLUMN user_agent TEXT NULL COMMENT 'User agent string for device tracking';

-- Update existing audit_logs to have operation_type based on action
UPDATE audit_logs 
SET operation_type = CASE 
    WHEN action LIKE '%login%' THEN 'USER_LOGIN'
    WHEN action LIKE '%create%' THEN 'RESOURCE_CREATE'
    WHEN action LIKE '%update%' THEN 'RESOURCE_UPDATE'
    WHEN action LIKE '%delete%' THEN 'RESOURCE_DELETE'
    ELSE 'ADMIN_ACTION'
END
WHERE operation_type IS NULL;

-- Extract IP address from session_details if available
UPDATE audit_logs 
SET ip_address = JSON_UNQUOTE(JSON_EXTRACT(session_details, '$.ip_address'))
WHERE session_details IS NOT NULL 
AND JSON_EXTRACT(session_details, '$.ip_address') IS NOT NULL
AND ip_address IS NULL;

-- Extract user agent from session_details if available
UPDATE audit_logs 
SET user_agent = JSON_UNQUOTE(JSON_EXTRACT(session_details, '$.user_agent'))
WHERE session_details IS NOT NULL 
AND JSON_EXTRACT(session_details, '$.user_agent') IS NOT NULL
AND user_agent IS NULL;

-- Add indexes for security queries (after columns are added)
CREATE INDEX idx_operation_type ON audit_logs(operation_type);
CREATE INDEX idx_severity ON audit_logs(severity);
CREATE INDEX idx_ip_address ON audit_logs(ip_address);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);