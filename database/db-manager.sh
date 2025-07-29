#!/bin/bash

# Database Manager Script
# Provides convenient database management commands

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

show_header() {
    echo -e "${BLUE}" 
    echo "================================================="
    echo "         Database Manager for Node Texture"
    echo "================================================="
    echo -e "${NC}"
}

show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  test     - Test database connection"
    echo "  init     - Initialize database with schema"
    echo "  reset    - Reset database (drop and recreate)"
    echo "  backup   - Create database backup"
    echo "  restore  - Restore from backup file"
    echo "  status   - Show database status"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 test"
    echo "  $0 init"
    echo "  $0 backup"
    echo "  $0 restore backup_2024.sql"
}

check_dependencies() {
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi

    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi

    # Check if MySQL is installed
    if ! command -v mysql &> /dev/null; then
        log_warning "MySQL client is not installed. Some features may not work."
    fi

    # Check if package.json exists
    if [ ! -f "../package.json" ]; then
        log_error "../package.json not found. Please run this script from the database directory or project root."
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f "../backend/.env" ]; then
        log_error "../backend/.env file not found. Please create it with database configuration."
        exit 1
    fi
}

install_dependencies() {
    log_info "Checking npm dependencies..."
    if [ ! -d "../node_modules" ] || [ ! -f "../node_modules/.package-lock.json" ]; then
        log_info "Installing npm dependencies..."
        cd .. && npm install && cd database
        log_success "Dependencies installed"
    else
        log_success "Dependencies already installed"
    fi
}

test_connection() {
    log_info "Testing database connection..."
    cd .. && npm run db:test && cd database
}

init_database() {
    log_info "Initializing database..."
    cd .. && npm run db:init && cd database
    log_success "Database initialization completed"
}

reset_database() {
    log_warning "This will completely reset the database and all data will be lost!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Resetting database..."
        cd .. && npm run db:reset && cd database
        log_success "Database reset completed"
    else
        log_info "Database reset cancelled"
    fi
}

backup_database() {
    if ! command -v mysqldump &> /dev/null; then
        log_error "mysqldump is not installed. Please install MySQL client tools."
        exit 1
    fi

    # Load environment variables
    if [ -f "../backend/.env" ]; then
        export $(grep -v '^#' ../backend/.env | xargs)
    fi

    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    
    log_info "Creating database backup..."
    log_info "Backup file: $BACKUP_FILE"
    
    mysqldump -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        log_success "Backup created successfully: $BACKUP_FILE"
        log_info "Backup size: $(du -h $BACKUP_FILE | cut -f1)"
    else
        log_error "Backup failed"
        exit 1
    fi
}

restore_database() {
    BACKUP_FILE="$1"
    
    if [ -z "$BACKUP_FILE" ]; then
        log_error "Please specify a backup file to restore from"
        echo "Usage: $0 restore <backup_file.sql>"
        exit 1
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file '$BACKUP_FILE' not found"
        exit 1
    fi
    
    if ! command -v mysql &> /dev/null; then
        log_error "mysql client is not installed. Please install MySQL client tools."
        exit 1
    fi

    # Load environment variables
    if [ -f "../backend/.env" ]; then
        export $(grep -v '^#' ../backend/.env | xargs)
    fi
    
    log_warning "This will restore the database from '$BACKUP_FILE' and overwrite existing data!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restoring database from $BACKUP_FILE..."
        mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$BACKUP_FILE"
        
        if [ $? -eq 0 ]; then
            log_success "Database restored successfully from $BACKUP_FILE"
        else
            log_error "Database restore failed"
            exit 1
        fi
    else
        log_info "Database restore cancelled"
    fi
}

show_status() {
    log_info "Database Status:"
    echo ""
    
    # Load environment variables
    if [ -f "../backend/.env" ]; then
        export $(grep -v '^#' ../backend/.env | xargs)
        echo "Configuration:"
        echo "  Host: ${DB_HOST:-localhost}:${DB_PORT:-3306}"
        echo "  Database: ${DB_NAME:-bed_texture_ecommerce}"
        echo "  User: ${DB_USER:-root}"
        echo ""
    fi
    
    # Test connection and show detailed status
    cd .. && npm run db:test && cd database
}

# Main script logic
show_header

if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

COMMAND="$1"

case $COMMAND in
    "test")
        check_dependencies
        install_dependencies
        test_connection
        ;;
    "init")
        check_dependencies
        install_dependencies
        init_database
        ;;
    "reset")
        check_dependencies
        install_dependencies
        reset_database
        ;;
    "backup")
        check_dependencies
        backup_database
        ;;
    "restore")
        check_dependencies
        restore_database "$2"
        ;;
    "status")
        check_dependencies
        install_dependencies
        show_status
        ;;
    "help")
        show_usage
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        echo ""
        show_usage
        exit 1
        ;;
esac

log_success "Operation completed successfully!"