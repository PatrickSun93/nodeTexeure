# Database Setup Guide

This guide will help you initialize and set up the MySQL database for the Bed Texture E-commerce platform.

## Prerequisites

### 1. MySQL Server
Ensure MySQL Server is installed and running on your system:

**macOS (using Homebrew):**
```bash
brew install mysql
brew services start mysql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

**Windows:**
- Download MySQL Installer from [MySQL Official Website](https://dev.mysql.com/downloads/installer/)
- Follow the installation wizard

### 2. Node.js Dependencies
Install the required Node.js packages:
```bash
npm install
```

## Configuration

### 1. Environment Variables
The database connection settings are configured in `/backend/.env`. Update these values according to your MySQL setup:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=bed_texture_ecommerce
DB_USER=root
DB_PASSWORD=your_mysql_password
```

### 2. MySQL User Setup (Optional)
For better security, create a dedicated database user:

```sql
-- Connect to MySQL as root
mysql -u root -p

-- Create database user
CREATE USER 'ecommerce_user'@'localhost' IDENTIFIED BY 'secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON bed_texture_ecommerce.* TO 'ecommerce_user'@'localhost';
FLUSH PRIVILEGES;

-- Update .env file with new credentials
# DB_USER=ecommerce_user
# DB_PASSWORD=secure_password
```

## Database Initialization

### Quick Start

1. **Test database connection** (optional but recommended):
   ```bash
   npm run db:test
   ```

2. **Run the database initialization script**:
   ```bash
   npm run db:init
   ```

This script will:
1. ✅ Create the database if it doesn't exist
2. ✅ Create all tables (25+ business tables)
3. ✅ Create audit log tables (22 audit tables)
4. ✅ Set up database triggers for automatic auditing
5. ✅ Insert initial system data
6. ✅ Verify the setup

### Manual Initialization
If you prefer to run the script manually:

```bash
node init-database.js
```

### Available Scripts

- `npm run db:test` - Test database connection and check current state
- `npm run db:init` - Initialize the database with schema and sample data
- `npm run db:reset` - Reset the database (drops and recreates everything)

### Reset Database
To completely reset and reinitialize the database:

```bash
npm run db:reset
```

## What Gets Created

### Core Business Tables (9)
- `users` - User accounts and authentication
- `user_addresses` - User shipping/billing addresses
- `categories` - Product categories
- `products` - Product catalog
- `product_variants` - Product variations (size, color, etc.)
- `product_images` - Product image gallery
- `product_reviews` - Customer reviews and ratings
- `product_bundles` - Product bundle definitions
- `bundle_items` - Items within bundles

### Inventory & Stock Management (3)
- `inventory` - Stock levels and management
- `stock_reservations` - Temporary stock holds
- `inventory_movements` - Stock movement history

### Orders & Shopping (5)
- `orders` - Customer orders
- `order_items` - Individual items in orders
- `order_status_history` - Order status tracking
- `shopping_carts` - Active shopping carts
- `cart_items` - Items in shopping carts

### Financial Operations (5)
- `payments` - Payment transactions
- `payment_methods` - Stored payment methods
- `refunds` - Refund transactions
- `discount_codes` - Promotional codes
- `discount_code_usage` - Usage tracking

### Communication & System (3)
- `email_templates` - Email template management
- `email_queue` - Outbound email queue
- `system_settings` - Application configuration

### Audit System (22 tables)
Every business table has a corresponding `_logs` table for complete audit trails:
- `users_logs`, `products_logs`, `orders_logs`, etc.
- Automatic triggers capture all INSERT/UPDATE/DELETE operations
- Full historical data preservation for compliance

## Verification

After initialization, verify the setup:

### 1. Quick Verification
```bash
npm run db:test
```
This script will check:
- Database connection
- Database and table existence
- Trigger functionality
- Basic diagnostics

### 2. Manual Verification
```bash
mysql -u your_username -p -h localhost -P 3306 bed_texture_ecommerce
```

```sql
-- Show all tables
SHOW TABLES;

-- Count should be 47+ tables (25 business + 22 audit)
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'bed_texture_ecommerce';
```

### 3. Check Triggers
```sql
-- Show all triggers
SHOW TRIGGERS;

-- Should show multiple audit triggers
```

### 4. Test Initial Data
```sql
-- Check system settings
SELECT * FROM system_settings;

-- Check categories
SELECT * FROM categories;

-- Check email templates
SELECT * FROM email_templates;
```

## Troubleshooting

### Common Issues

#### 1. Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```
**Solution:** Ensure MySQL server is running
```bash
# macOS
brew services start mysql

# Linux
sudo systemctl start mysql
```

#### 2. Access Denied
```
Error: Access denied for user 'root'@'localhost'
```
**Solution:** Check username/password in `.env` file

#### 3. Database Already Exists
The script safely handles existing databases and will not overwrite data.

#### 4. Permission Issues
```
Error: CREATE command denied to user
```
**Solution:** Grant proper privileges to your MySQL user
```sql
GRANT ALL PRIVILEGES ON bed_texture_ecommerce.* TO 'your_user'@'localhost';
```

### Debug Mode
For detailed logging, set environment variable:
```bash
DEBUG=true node init-database.js
```

## Database Management

### Backup
Create a backup of your database:
```bash
mysqldump -u your_username -p bed_texture_ecommerce > backup.sql
```

### Restore
Restore from backup:
```bash
mysql -u your_username -p bed_texture_ecommerce < backup.sql
```

### Monitor Size
Check database size:
```sql
SELECT 
    table_schema as 'Database',
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as 'Size (MB)'
FROM information_schema.tables 
WHERE table_schema = 'bed_texture_ecommerce'
GROUP BY table_schema;
```

## Next Steps

1. **Start Backend Server:**
   ```bash
   npm run dev:backend
   ```

2. **Test API Endpoints:**
   - Health check: `GET http://localhost:6666/api/status`
   - Database status: `GET http://localhost:6666/api/status/db`

3. **Review Documentation:**
   - [Database Design](DATABASE_DESIGN.md)
   - [JSON System](JSON_SYSTEM.md)
   - [Audit System](AUDIT_SYSTEM.md)

4. **Begin Development:**
   - Add your business logic
   - Create API endpoints
   - Implement frontend components

## Support

For additional help:
- Check the [Database Design Documentation](DATABASE_DESIGN.md)
- Review [Audit System Documentation](AUDIT_SYSTEM.md)
- Examine the database schema in `database_schema.sql`

The database is now ready for your e-commerce application! 🚀