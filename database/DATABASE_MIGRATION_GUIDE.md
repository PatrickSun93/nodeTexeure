# Database Migration Guide
## Bed Texture E-commerce Platform

### Overview
This guide provides step-by-step instructions for setting up and managing the MySQL database across different environments (development, staging, production).

### Prerequisites

#### Development Environment (Local Mac)
- MySQL 8.0+ installed locally
- MySQL Workbench or command line access
- Node.js application configured

#### Staging/Production Environment (AWS)
- AWS RDS MySQL instance
- VPC and security groups configured
- Database subnet groups set up
- Parameter groups configured

### Environment Setup

#### 1. Development Environment (Local Mac)

**Install MySQL:**
```bash
# Using Homebrew
brew install mysql

# Start MySQL service
brew services start mysql

# Secure installation
mysql_secure_installation
```

**Connect to MySQL:**
```bash
mysql -u root -p
```

**Run Setup Scripts:**
```sql
-- 1. Run database setup
source /path/to/database_setup.sql

-- 2. Run schema creation
source /path/to/database_schema.sql
```

#### 2. AWS RDS Setup

**Create RDS Instance:**
```bash
# Using AWS CLI
aws rds create-db-instance \
    --db-instance-identifier bed-texture-prod \
    --db-instance-class db.t3.medium \
    --engine mysql \
    --engine-version 8.0.35 \
    --master-username admin \
    --master-user-password YourSecurePassword123! \
    --allocated-storage 100 \
    --storage-type gp2 \
    --vpc-security-group-ids sg-xxxxxxxxx \
    --db-subnet-group-name your-db-subnet-group \
    --backup-retention-period 7 \
    --storage-encrypted \
    --multi-az \
    --auto-minor-version-upgrade
```

**Connect to RDS:**
```bash
mysql -h your-rds-endpoint.amazonaws.com -u admin -p
```

### Migration Process

#### Step 1: Database Setup

**1.1 Create Database and Users**
```sql
-- Run the setup script
source database_setup.sql
```

**1.2 Verify Setup**
```sql
-- Check database creation
SHOW DATABASES LIKE 'bed_texture_ecommerce';

-- Check users
SELECT User, Host FROM mysql.user WHERE User LIKE 'bed_texture%';

-- Check events
SELECT EVENT_NAME, STATUS FROM information_schema.EVENTS 
WHERE EVENT_SCHEMA = 'bed_texture_ecommerce';
```

#### Step 2: Schema Creation

**2.1 Create Tables**
```sql
-- Run the schema script
source database_schema.sql
```

**2.2 Verify Schema**
```sql
-- Check tables
SHOW TABLES;

-- Check table structure
DESCRIBE users;
DESCRIBE products;
DESCRIBE orders;

-- Check indexes
SHOW INDEX FROM products;
SHOW INDEX FROM orders;

-- Check stored procedures
SHOW PROCEDURE STATUS WHERE Db = 'bed_texture_ecommerce';

-- Check views
SHOW FULL TABLES WHERE Table_type = 'VIEW';
```

#### Step 3: Initial Data

**3.1 Verify Initial Data**
```sql
-- Check categories
SELECT * FROM categories;

-- Check payment methods
SELECT * FROM payment_methods;

-- Check email templates
SELECT name, subject FROM email_templates;

-- Check system settings
SELECT setting_key, setting_value FROM system_settings;
```

### Environment-Specific Configurations

#### Development Environment

**MySQL Configuration (my.cnf):**
```ini
[mysqld]
# Basic settings
port = 3306
socket = /tmp/mysql.sock
basedir = /usr/local/mysql
datadir = /usr/local/mysql/data

# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# InnoDB settings
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 1
innodb_file_per_table = ON

# Logging
general_log = ON
general_log_file = /usr/local/mysql/data/general.log
slow_query_log = ON
slow_query_log_file = /usr/local/mysql/data/slow.log
long_query_time = 2

# Security
local_infile = 0

# Connection limits
max_connections = 100
max_user_connections = 50
```

**Node.js Configuration:**
```javascript
// config/database.js
module.exports = {
  development: {
    host: 'localhost',
    port: 3306,
    user: 'bed_texture_app',
    password: 'your_dev_password',
    database: 'bed_texture_ecommerce',
    connectionLimit: 5,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    charset: 'utf8mb4',
    timezone: 'Z'
  }
};
```

#### Production Environment (AWS RDS)

**RDS Parameter Group Settings:**
```
# Performance
innodb_buffer_pool_size = {DBInstanceClassMemory*3/4}
max_connections = 200
innodb_log_file_size = 134217728

# Logging
slow_query_log = 1
long_query_time = 1
log_output = FILE
log_queries_not_using_indexes = 1

# Character set
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci

# Security
local_infile = 0

# Timeouts
wait_timeout = 28800
interactive_timeout = 28800
```

**Node.js Configuration:**
```javascript
// config/database.js
module.exports = {
  production: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    ssl: {
      rejectUnauthorized: false
    }
  }
};
```

### Migration Management with Flyway

#### Installation
```bash
# Download Flyway
wget https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/9.22.3/flyway-commandline-9.22.3.tar.gz
tar -xzf flyway-commandline-9.22.3.tar.gz
```

#### Configuration
**flyway.conf:**
```properties
# Database connection
flyway.url=jdbc:mysql://localhost:3306/bed_texture_ecommerce
flyway.user=bed_texture_app
flyway.password=your_password

# Migration settings
flyway.locations=filesystem:./migrations
flyway.baselineOnMigrate=true
flyway.validateOnMigrate=true
flyway.cleanDisabled=true

# Schema
flyway.schemas=bed_texture_ecommerce
```

#### Migration Files Structure
```
migrations/
├── V1__Initial_setup.sql          # database_setup.sql content
├── V2__Create_schema.sql          # database_schema.sql content
├── V3__Add_loyalty_points.sql     # Future feature
├── V4__Add_product_bundles.sql    # Future enhancement
└── V5__Performance_indexes.sql    # Performance improvements
```

#### Migration Commands
```bash
# Check migration status
./flyway info

# Run migrations
./flyway migrate

# Validate migrations
./flyway validate

# Get migration history
./flyway history
```

### Data Seeding

#### Development Data
```sql
-- Create admin user
INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified)
VALUES ('admin@bedtexture.com', '$2b$10$hash_here', 'Admin', 'User', 'admin', 'active', true);

-- Create test products
INSERT INTO products (sku, name, slug, description, category_id, base_price, weight, material, is_organic, status, created_by)
VALUES 
('BTS-001', 'Organic Cotton Bed Sheet Set', 'organic-cotton-bed-sheet-set', 'Luxurious organic cotton bed sheets', 1, 89.99, 1.2, 'Organic Cotton', true, 'approved', 1),
('BTC-001', 'Down Alternative Comforter', 'down-alternative-comforter', 'Hypoallergenic down alternative comforter', 2, 129.99, 2.5, 'Polyester Fill', false, 'approved', 1);

-- Create product variants
INSERT INTO product_variants (product_id, sku, size, color, price_adjustment)
VALUES 
(1, 'BTS-001-Q-W', 'Queen', 'White', 0.00),
(1, 'BTS-001-K-W', 'King', 'White', 20.00),
(2, 'BTC-001-Q-W', 'Queen', 'White', 0.00);

-- Create inventory
INSERT INTO inventory (product_id, variant_id, quantity_available, reorder_point, reorder_quantity)
VALUES 
(1, 1, 50, 10, 25),
(1, 2, 30, 10, 25),
(2, 3, 40, 15, 30);
```

#### Production Data
```sql
-- Create production admin user
INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified)
VALUES ('admin@yourdomain.com', '$2b$10$production_hash_here', 'Admin', 'User', 'admin', 'active', true);

-- Set production system settings
UPDATE system_settings SET setting_value = 'Bed Texture Store' WHERE setting_key = 'site_name';
UPDATE system_settings SET setting_value = 'false' WHERE setting_key = 'abandoned_cart_recovery_enabled';
UPDATE system_settings SET setting_value = 'taxjar' WHERE setting_key = 'tax_calculation_service';
```

### Backup and Recovery

#### Automated Backups (AWS RDS)
```bash
# Create manual snapshot
aws rds create-db-snapshot \
    --db-instance-identifier bed-texture-prod \
    --db-snapshot-identifier bed-texture-manual-$(date +%Y%m%d-%H%M%S)

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier bed-texture-restored \
    --db-snapshot-identifier bed-texture-manual-20241201-120000
```

#### Manual Backups
```bash
# Full database backup
mysqldump -h your-rds-endpoint.amazonaws.com -u admin -p \
    --single-transaction --routines --triggers \
    bed_texture_ecommerce > backup_$(date +%Y%m%d_%H%M%S).sql

# Schema only backup
mysqldump -h your-rds-endpoint.amazonaws.com -u admin -p \
    --no-data --routines --triggers \
    bed_texture_ecommerce > schema_backup_$(date +%Y%m%d_%H%M%S).sql

# Data only backup
mysqldump -h your-rds-endpoint.amazonaws.com -u admin -p \
    --no-create-info --skip-triggers \
    bed_texture_ecommerce > data_backup_$(date +%Y%m%d_%H%M%S).sql
```

#### Restore Process
```bash
# Restore full backup
mysql -h your-rds-endpoint.amazonaws.com -u admin -p \
    bed_texture_ecommerce < backup_20241201_120000.sql

# Restore specific table
mysql -h your-rds-endpoint.amazonaws.com -u admin -p \
    bed_texture_ecommerce < table_backup.sql
```

### Monitoring and Maintenance

#### Performance Monitoring
```sql
-- Check slow queries
SELECT 
    query_time,
    lock_time,
    rows_sent,
    rows_examined,
    LEFT(sql_text, 100) as query_preview
FROM slow_query_log 
ORDER BY query_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
    table_name,
    ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb,
    table_rows
FROM information_schema.tables 
WHERE table_schema = 'bed_texture_ecommerce'
ORDER BY (data_length + index_length) DESC;

-- Check index usage
SELECT 
    object_schema,
    object_name,
    index_name,
    count_read,
    count_write,
    count_fetch,
    count_insert,
    count_update,
    count_delete
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema = 'bed_texture_ecommerce'
ORDER BY count_read DESC;
```

#### Maintenance Tasks
```sql
-- Update table statistics
ANALYZE TABLE products, orders, inventory, users;

-- Optimize tables
OPTIMIZE TABLE products, orders, inventory;

-- Check table integrity
CHECK TABLE products, orders, inventory;

-- Repair tables if needed
REPAIR TABLE table_name;
```

### Troubleshooting

#### Common Issues

**1. Connection Issues**
```sql
-- Check connection limits
SHOW VARIABLES LIKE 'max_connections';
SHOW STATUS LIKE 'Threads_connected';

-- Check user permissions
SHOW GRANTS FOR 'bed_texture_app'@'%';
```

**2. Performance Issues**
```sql
-- Check slow queries
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';

-- Check buffer pool usage
SHOW STATUS LIKE 'Innodb_buffer_pool%';
```

**3. Storage Issues**
```sql
-- Check disk usage
SELECT 
    table_schema,
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) as db_size_mb
FROM information_schema.tables 
GROUP BY table_schema;
```

#### Error Resolution

**Migration Failures:**
```bash
# Check migration status
./flyway info

# Repair failed migration
./flyway repair

# Baseline existing database
./flyway baseline
```

**Data Corruption:**
```sql
-- Check and repair tables
CHECK TABLE products;
REPAIR TABLE products;

-- Restore from backup if needed
-- Follow backup restoration process
```

### Security Checklist

#### Database Security
- [ ] Strong passwords for all database users
- [ ] SSL/TLS encryption enabled
- [ ] VPC security groups properly configured
- [ ] Database subnet groups in private subnets
- [ ] Regular security updates applied
- [ ] Audit logging enabled
- [ ] Backup encryption enabled
- [ ] Access logging monitored

#### Application Security
- [ ] Connection pooling configured
- [ ] SQL injection prevention (parameterized queries)
- [ ] Database credentials in environment variables
- [ ] Regular credential rotation
- [ ] Principle of least privilege applied
- [ ] Database firewall rules configured

### Next Steps

1. **Complete Initial Setup**
   - Run database_setup.sql
   - Run database_schema.sql
   - Verify all tables and data

2. **Configure Application**
   - Update Node.js database configuration
   - Test database connections
   - Implement connection pooling

3. **Set Up Monitoring**
   - Configure CloudWatch alarms
   - Set up slow query monitoring
   - Implement health checks

4. **Plan for Scale**
   - Monitor performance metrics
   - Plan for read replicas
   - Consider caching strategies
   - Prepare for data archiving

This migration guide provides a comprehensive approach to setting up and managing your database across all environments. Follow the steps sequentially and refer back to this guide for ongoing maintenance and troubleshooting.