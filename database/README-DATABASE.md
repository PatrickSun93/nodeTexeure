# Database Setup Guide

## Overview

This guide provides step-by-step instructions for setting up the MySQL database for the Node Texture E-commerce application.

## Prerequisites

- **MySQL Server** (8.0 or higher recommended)
- **Node.js** (16.0 or higher)
- **npm** package manager

## Environment Configuration

Ensure your `.env` file in the `backend/` directory contains the following MySQL connection details:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=bed_texture_ecommerce
```

## Setup Process

### Step 1: Install Dependencies

```bash
npm install
```

This installs required packages:
- `mysql2` - MySQL database driver
- `dotenv` - Environment variable loader

### Step 2: Test Database Connection

```bash
npm run db:test
```

This script will:
- ✅ Test MySQL server connectivity
- ✅ Verify database credentials
- ✅ Check if database exists
- ✅ Report table count and structure
- ✅ Validate trigger functionality
- ✅ Provide diagnostic information

**Expected Output:**
```
🔍 Testing Database Connection...
==================================================
ℹ Host: localhost:3306
ℹ Database: bed_texture_ecommerce
ℹ User: your_username
✓ Database connection established
✓ Basic query executed successfully
ℹ MySQL Version: 8.0.x
⚠ Database 'bed_texture_ecommerce' does not exist
ℹ Run: npm run db:init to create and initialize the database

🎉 Connection test completed successfully!
```

### Step 3: Initialize Database

```bash
npm run db:init
```

This script will:
- 🏗️ Create the database if it doesn't exist
- 📋 Execute the complete schema from `database_schema.sql`
- 🔧 Create all 44 tables (22 main + 22 audit log tables)
- ⚡ Set up 66 database triggers for audit logging
- 📊 Insert initial system data and sample records
- ✅ Verify successful creation

### Step 4: Verify Setup

```bash
npm run db:test
```

After initialization, you should see:
```
✓ Database 'bed_texture_ecommerce' exists
✓ Found 44 tables in database
✓ Table 'users' exists
✓ Table 'products' exists
✓ Table 'orders' exists
✓ Table 'users_logs' exists
✓ Table 'products_logs' exists
✓ Found 66 database triggers
✓ Audit user context set successfully
ℹ Database size: X.XX MB
```

## Database Structure

### Core Business Tables (22)
- **User Management**: `users`, `user_addresses`
- **Product Catalog**: `categories`, `products`, `product_variants`, `product_images`, `product_bundles`, `bundle_items`, `product_reviews`
- **Inventory**: `inventory`, `stock_reservations`, `inventory_movements`
- **Shopping**: `shopping_carts`, `cart_items`, `orders`, `order_items`, `order_status_history`
- **Financial**: `payment_methods`, `payments`, `refunds`, `discount_codes`, `discount_code_usage`
- **Communication**: `email_templates`, `email_queue`, `abandoned_cart_recovery`
- **System**: `shipping_zones`, `shipping_rates`, `tax_rates`, `system_settings`, `audit_logs`, `api_rate_limits`
- **Utilities**: `transno`

### Audit Log Tables (22)
Each main business table has a corresponding `_logs` table:
- `users_logs`, `products_logs`, `orders_logs`, etc.
- Automatic tracking of all INSERT, UPDATE, DELETE operations
- Includes operation metadata (timestamp, user, operation type)

### Database Triggers (66)
- 3 triggers per main table (INSERT, UPDATE, DELETE)
- Automatic audit trail generation
- User context tracking via `@audit_user_id` session variable

## Available Commands

### NPM Scripts
| Command | Description |
|---------|-------------|
| `npm run db:test` | Test database connection and diagnostics |
| `npm run db:init` | Initialize database with full schema |
| `npm run db:reset` | Reset database (drop and recreate) |

### Database Manager Script
For convenience, use the included shell script:

```bash
# Make script executable (first time only)
chmod +x db-manager.sh

# Available commands
./db-manager.sh test     # Test database connection
./db-manager.sh init     # Initialize database
./db-manager.sh reset    # Reset database
./db-manager.sh backup   # Create backup
./db-manager.sh restore backup.sql  # Restore from backup
./db-manager.sh status   # Show database status
./db-manager.sh help     # Show help
```

## Troubleshooting

### Connection Issues

**Error: ECONNREFUSED**
```bash
# Start MySQL server
brew services start mysql  # macOS
sudo systemctl start mysql # Linux
```

**Error: ER_ACCESS_DENIED_ERROR**
- Verify `DB_USER` and `DB_PASSWORD` in `.env`
- Check MySQL user permissions:
```sql
GRANT ALL PRIVILEGES ON bed_texture_ecommerce.* TO 'your_user'@'localhost';
FLUSH PRIVILEGES;
```

**Error: ER_BAD_DB_ERROR**
- Database doesn't exist, run `npm run db:init`

### Performance Considerations

- **Indexing**: All tables include optimized indexes
- **Audit Storage**: Monitor audit log table sizes
- **Cleanup**: Implement audit log retention policies

### Security Notes

- Never commit `.env` files to version control
- Use strong MySQL passwords
- Limit database user privileges to necessary operations
- Regular backup of production databases

## Database Management

### Backup
```bash
# Using the database manager script (recommended)
./db-manager.sh backup

# Manual backup
mysqldump -u username -p bed_texture_ecommerce > backup.sql
```

### Restore
```bash
# Using the database manager script (recommended)
./db-manager.sh restore backup_20241201_143022.sql

# Manual restore
mysql -u username -p bed_texture_ecommerce < backup.sql
```

### Monitor Size
```sql
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.tables 
WHERE table_schema = 'bed_texture_ecommerce'
ORDER BY size_mb DESC;
```

## Next Steps

After successful database setup:

1. **Application Integration**: Configure your Node.js application to use the database
2. **API Development**: Build REST APIs using the established schema
3. **Testing**: Create test data and validate functionality
4. **Monitoring**: Set up database monitoring and alerting
5. **Backup Strategy**: Implement regular backup procedures

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Run `npm run db:test` for diagnostics
3. Review `AUDIT_SYSTEM.md` for audit functionality
4. Check `DATABASE_DESIGN.md` for schema details

---

**Database Schema Version**: 1.0  
**Last Updated**: 2024  
**Compatibility**: MySQL 8.0+, Node.js 16+