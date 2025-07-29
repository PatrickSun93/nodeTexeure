-- =====================================================
-- Database Setup Script for Bed Texture E-commerce Platform
-- =====================================================
-- This script creates the database and sets up initial configuration
-- Run this BEFORE running database_schema.sql
-- =====================================================

-- Create the database
CREATE DATABASE IF NOT EXISTS bed_texture_ecommerce
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- Use the database
USE bed_texture_ecommerce;

-- Set MySQL specific configurations for the session
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';
SET time_zone = '+00:00'; -- UTC timezone
SET NAMES utf8mb4;

-- Enable event scheduler for automated tasks
SET GLOBAL event_scheduler = ON;

-- =====================================================
-- Create database user for the application
-- =====================================================
-- Note: Replace 'your_password_here' with a strong password
-- This user will be used by your Node.js application

CREATE USER IF NOT EXISTS 'bed_texture_app'@'%' IDENTIFIED BY 'your_password_here';

-- Grant necessary privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON bed_texture_ecommerce.* TO 'bed_texture_app'@'%';
GRANT EXECUTE ON bed_texture_ecommerce.* TO 'bed_texture_app'@'%';

-- Grant specific privileges for stored procedures and functions
GRANT CREATE ROUTINE ON bed_texture_ecommerce.* TO 'bed_texture_app'@'%';
GRANT ALTER ROUTINE ON bed_texture_ecommerce.* TO 'bed_texture_app'@'%';

-- Flush privileges
FLUSH PRIVILEGES;

-- =====================================================
-- Create read-only user for reporting/analytics
-- =====================================================
CREATE USER IF NOT EXISTS 'bed_texture_readonly'@'%' IDENTIFIED BY 'readonly_password_here';
GRANT SELECT ON bed_texture_ecommerce.* TO 'bed_texture_readonly'@'%';
FLUSH PRIVILEGES;

-- =====================================================
-- Database configuration settings
-- =====================================================

-- Set InnoDB settings for better performance
SET GLOBAL innodb_buffer_pool_size = 1073741824; -- 1GB, adjust based on your RDS instance
SET GLOBAL innodb_log_file_size = 268435456; -- 256MB
SET GLOBAL innodb_flush_log_at_trx_commit = 1; -- ACID compliance
SET GLOBAL innodb_file_per_table = ON;

-- Set query cache (if available in your MySQL version)
-- Note: Query cache is deprecated in MySQL 8.0+
SET GLOBAL query_cache_type = ON;
SET GLOBAL query_cache_size = 67108864; -- 64MB

-- Set connection limits
SET GLOBAL max_connections = 200;
SET GLOBAL max_user_connections = 50;

-- Set timeout values
SET GLOBAL wait_timeout = 28800; -- 8 hours
SET GLOBAL interactive_timeout = 28800; -- 8 hours

-- =====================================================
-- Create scheduled events for maintenance
-- =====================================================

-- Event to clean up expired stock reservations every 5 minutes
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_expired_reservations
ON SCHEDULE EVERY 5 MINUTE
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    -- This will be created after the main schema is loaded
    -- CALL ReleaseExpiredReservations();
    
    -- For now, just log that the event ran
    INSERT INTO system_logs (log_level, message, created_at) 
    VALUES ('INFO', 'Cleanup expired reservations event executed', NOW())
    ON DUPLICATE KEY UPDATE created_at = NOW();
END//
DELIMITER ;

-- Event to clean up old email queue entries (daily)
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_old_email_queue
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    -- Delete sent emails older than 30 days
    DELETE FROM email_queue 
    WHERE status = 'sent' 
    AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- Delete failed emails older than 7 days
    DELETE FROM email_queue 
    WHERE status = 'failed' 
    AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
END//
DELIMITER ;

-- Event to clean up old API rate limit entries (hourly)
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_old_rate_limits
ON SCHEDULE EVERY 1 HOUR
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    -- Delete rate limit entries older than 24 hours
    DELETE FROM api_rate_limits 
    WHERE window_start < DATE_SUB(NOW(), INTERVAL 24 HOUR);
END//
DELIMITER ;

-- =====================================================
-- Create system logs table for maintenance events
-- =====================================================
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    log_level ENUM('DEBUG', 'INFO', 'WARN', 'ERROR') NOT NULL DEFAULT 'INFO',
    message TEXT NOT NULL,
    context JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_log_level (log_level),
    INDEX idx_created_at (created_at)
);

-- =====================================================
-- Environment-specific configurations
-- =====================================================

-- Development environment settings
-- Uncomment these for development
/*
SET GLOBAL general_log = ON;
SET GLOBAL general_log_file = '/var/log/mysql/general.log';
SET GLOBAL slow_query_log = ON;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
SET GLOBAL long_query_time = 2;
*/

-- Production environment settings
-- Uncomment these for production
/*
SET GLOBAL general_log = OFF;
SET GLOBAL slow_query_log = ON;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
SET GLOBAL long_query_time = 1;
SET GLOBAL log_queries_not_using_indexes = ON;
*/

-- =====================================================
-- AWS RDS specific configurations
-- =====================================================
-- Note: Some of these settings may need to be configured
-- through AWS RDS Parameter Groups rather than SQL

-- For AWS RDS, you should configure these in Parameter Groups:
-- innodb_buffer_pool_size = {DBInstanceClassMemory*3/4}
-- max_connections = LEAST({DBInstanceClassMemory/9531392},5000)
-- innodb_log_file_size = 134217728 (128MB)
-- slow_query_log = 1
-- long_query_time = 1
-- log_output = FILE

-- =====================================================
-- Backup and monitoring setup
-- =====================================================

-- Create a table to track backup status
CREATE TABLE IF NOT EXISTS backup_status (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    backup_type ENUM('full', 'incremental', 'log') NOT NULL,
    status ENUM('started', 'completed', 'failed') NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT UNSIGNED,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    INDEX idx_backup_type (backup_type),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at)
);

-- =====================================================
-- Performance monitoring tables
-- =====================================================

-- Table to track slow queries
CREATE TABLE IF NOT EXISTS slow_query_log (
    start_time TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    user_host MEDIUMTEXT NOT NULL,
    query_time TIME(6) NOT NULL,
    lock_time TIME(6) NOT NULL,
    rows_sent INT NOT NULL,
    rows_examined INT NOT NULL,
    db VARCHAR(512) NOT NULL,
    last_insert_id INT NOT NULL,
    insert_id INT NOT NULL,
    server_id INT UNSIGNED NOT NULL,
    sql_text MEDIUMBLOB NOT NULL,
    thread_id BIGINT UNSIGNED NOT NULL,
    
    INDEX idx_start_time (start_time),
    INDEX idx_query_time (query_time),
    INDEX idx_db (db)
);

-- Table to track database statistics
CREATE TABLE IF NOT EXISTS db_statistics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(64) NOT NULL,
    table_rows BIGINT UNSIGNED,
    data_length BIGINT UNSIGNED,
    index_length BIGINT UNSIGNED,
    data_free BIGINT UNSIGNED,
    auto_increment BIGINT UNSIGNED,
    check_time TIMESTAMP NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_table_name (table_name),
    INDEX idx_recorded_at (recorded_at)
);

-- Event to collect database statistics daily
DELIMITER //
CREATE EVENT IF NOT EXISTS collect_db_statistics
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    INSERT INTO db_statistics (table_name, table_rows, data_length, index_length, data_free, auto_increment, check_time)
    SELECT 
        table_name,
        table_rows,
        data_length,
        index_length,
        data_free,
        auto_increment,
        check_time
    FROM information_schema.tables 
    WHERE table_schema = 'bed_texture_ecommerce'
    AND table_type = 'BASE TABLE';
END//
DELIMITER ;

-- =====================================================
-- Connection pool configuration
-- =====================================================

-- Recommended connection pool settings for Node.js
-- These should be configured in your application, not in MySQL
/*
Node.js MySQL2 Pool Configuration:
{
  host: 'your-rds-endpoint.amazonaws.com',
  port: 3306,
  user: 'bed_texture_app',
  password: 'your_password_here',
  database: 'bed_texture_ecommerce',
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  charset: 'utf8mb4',
  timezone: 'Z', // UTC
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: false
}
*/

-- =====================================================
-- Security configurations
-- =====================================================

-- Disable LOAD DATA LOCAL INFILE for security
SET GLOBAL local_infile = 0;

-- Set secure file privileges
-- Note: This should be configured in my.cnf or RDS Parameter Group
-- secure_file_priv = '/var/lib/mysql-files/'

-- =====================================================
-- Final setup verification
-- =====================================================

-- Show current configuration
SELECT 
    'Database Setup Complete' as status,
    DATABASE() as current_database,
    @@version as mysql_version,
    @@time_zone as timezone,
    @@sql_mode as sql_mode,
    @@character_set_database as charset,
    @@collation_database as collation;

-- Show created users
SELECT 
    User,
    Host,
    account_locked,
    password_expired
FROM mysql.user 
WHERE User LIKE 'bed_texture%';

-- Show scheduled events
SELECT 
    EVENT_NAME,
    EVENT_DEFINITION,
    INTERVAL_VALUE,
    INTERVAL_FIELD,
    STATUS
FROM information_schema.EVENTS 
WHERE EVENT_SCHEMA = 'bed_texture_ecommerce';

-- =====================================================
-- Next Steps
-- =====================================================
/*
After running this setup script:

1. Run database_schema.sql to create all tables and relationships
2. Update your Node.js application configuration with:
   - Database connection details
   - Username: bed_texture_app
   - Password: (the one you set above)
   - Database: bed_texture_ecommerce

3. For AWS RDS, configure these Parameter Group settings:
   - innodb_buffer_pool_size = {DBInstanceClassMemory*3/4}
   - max_connections = 200
   - slow_query_log = 1
   - long_query_time = 1
   - log_output = FILE

4. Set up monitoring:
   - Enable Enhanced Monitoring in RDS
   - Set up CloudWatch alarms for:
     * CPU utilization > 80%
     * Database connections > 160 (80% of max)
     * Free storage space < 2GB
     * Read/Write latency > 200ms

5. Configure backups:
   - Enable automated backups (7-35 days retention)
   - Set backup window during low-traffic hours
   - Enable backup encryption
   - Consider cross-region backup replication

6. Security checklist:
   - Change default passwords
   - Enable SSL/TLS connections
   - Configure VPC security groups
   - Enable audit logging if required
   - Regular security updates

7. Performance optimization:
   - Monitor slow query log
   - Analyze query performance regularly
   - Update table statistics: ANALYZE TABLE
   - Consider read replicas for reporting
*/

-- Log the completion
INSERT INTO system_logs (log_level, message, context) 
VALUES ('INFO', 'Database setup script completed successfully', 
        JSON_OBJECT('timestamp', NOW(), 'version', @@version));

SELECT 'Database setup completed successfully! You can now run database_schema.sql' as next_step;