# Database Directory

This directory contains all database-related files for the Node Texture E-commerce application.

## Directory Structure

```
database/
├── README.md                    # This file
├── database_schema.sql          # Complete database schema
├── database_setup.sql           # Initial setup script
├── init-database.js            # Database initialization script
├── test-db-connection.js       # Connection testing script
├── db-manager.sh               # Database management shell script
├── DATABASE_DESIGN.md          # Schema design documentation
├── DATABASE_SETUP.md           # Setup instructions
├── DATABASE_SUMMARY.md         # System overview
├── DATABASE_MIGRATION_GUIDE.md # Migration procedures
├── JSON_SYSTEM.md              # JSON column documentation
└── README-DATABASE.md          # Comprehensive user guide
```

## Quick Start

From the **project root directory**:

```bash
# Test database connection
npm run db:test

# Initialize database
npm run db:init

# Reset database
npm run db:reset
```

From the **database directory**:

```bash
# Make script executable (first time only)
chmod +x db-manager.sh

# Use database manager
./db-manager.sh test     # Test connection
./db-manager.sh init     # Initialize database
./db-manager.sh backup   # Create backup
./db-manager.sh restore backup.sql  # Restore backup
./db-manager.sh help     # Show all commands
```

## Key Files

### Scripts
- **`init-database.js`** - Main initialization script that creates the database and all tables
- **`test-db-connection.js`** - Diagnostic script for testing connectivity and database state
- **`db-manager.sh`** - Convenient shell script for all database operations

### Schema
- **`database_schema.sql`** - Complete schema with 44 tables and 66 triggers
- **`database_setup.sql`** - Initial database creation script

### Documentation
- **`README-DATABASE.md`** - Complete setup and usage guide
- **`DATABASE_DESIGN.md`** - Schema design and relationships
- **`DATABASE_SUMMARY.md`** - System architecture overview
- **`JSON_SYSTEM.md`** - JSON column usage patterns
- **`DATABASE_MIGRATION_GUIDE.md`** - Migration procedures

## Prerequisites

- MySQL 8.0 or higher
- Node.js 16.0 or higher
- Environment file: `../backend/.env` with database credentials

## Environment Configuration

Ensure your `../backend/.env` file contains:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=bed_texture_ecommerce
```

## Database Features

- **44 Tables**: 22 main business tables + 22 audit log tables
- **66 Triggers**: Automatic audit trail for all data changes
- **JSON Support**: Advanced data structures for complex workflows
- **Optimized Indexing**: Performance-tuned for e-commerce operations
- **Comprehensive Audit**: Complete change tracking with user attribution

## Support

For detailed information, see:
- `README-DATABASE.md` - Complete setup guide
- `DATABASE_SUMMARY.md` - System overview
- `DATABASE_DESIGN.md` - Schema documentation

For issues:
1. Run `npm run db:test` for diagnostics
2. Check the troubleshooting section in `README-DATABASE.md`
3. Review MySQL server logs

---

**Note**: All npm scripts should be run from the project root directory, not from this database directory.