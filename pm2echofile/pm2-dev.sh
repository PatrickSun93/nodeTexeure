#!/bin/bash

# PM2 Development Environment Manager
# Usage: ./pm2-dev.sh [start|stop|restart|status|logs|delete]

PM2_CONFIG="/Volumes/externalssd/devitems/nodeTexeure/pm2echofile/ecosystem.dev.config.js"
PROJECT_ROOT="/Volumes/externalssd/devitems/nodeTexeure"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[PM2-DEV]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if PM2 is installed
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Please install it with: npm install -g pm2"
        exit 1
    fi
}

# Start applications
start_apps() {
    print_status "Starting nodeTexture development environment..."
    
    # Check if apps are already running
    if pm2 list | grep -q "nodeTexture-.*-dev"; then
        print_warning "Some nodeTexture apps are already running. Use 'restart' to reload them."
        pm2 status
        return
    fi
    
    cd "$PROJECT_ROOT"
    pm2 start "$PM2_CONFIG"
    
    if [ $? -eq 0 ]; then
        print_success "Development environment started successfully!"
        print_status "Frontend: http://localhost:3000"
        print_status "Backend: http://localhost:5000"
        print_status "Use 'pm2 logs' to view logs or './pm2-dev.sh logs'"
    else
        print_error "Failed to start development environment"
    fi
}

# Stop applications
stop_apps() {
    print_status "Stopping nodeTexture development environment..."
    pm2 stop nodeTexture-frontend-dev nodeTexture-backend-dev
    print_success "Development environment stopped"
}

# Restart applications
restart_apps() {
    print_status "Restarting nodeTexture development environment..."
    pm2 restart nodeTexture-frontend-dev nodeTexture-backend-dev
    print_success "Development environment restarted"
}

# Show status
show_status() {
    print_status "NodeTexture Development Environment Status:"
    pm2 status | grep -E "(App name|nodeTexture-.*-dev|─)"
}

# Show logs
show_logs() {
    if [ -n "$2" ]; then
        case $2 in
            "frontend"|"fe")
                pm2 logs nodeTexture-frontend-dev
                ;;
            "backend"|"be")
                pm2 logs nodeTexture-backend-dev
                ;;
            *)
                print_error "Invalid log target. Use 'frontend' or 'backend'"
                ;;
        esac
    else
        pm2 logs
    fi
}

# Delete applications
delete_apps() {
    print_status "Deleting nodeTexture development processes..."
    pm2 delete nodeTexture-frontend-dev nodeTexture-backend-dev 2>/dev/null
    print_success "Development processes deleted"
}

# Monitor applications
monitor_apps() {
    print_status "Opening PM2 monitor..."
    pm2 monit
}

# Main script logic
check_pm2

case $1 in
    "start")
        start_apps
        ;;
    "stop")
        stop_apps
        ;;
    "restart")
        restart_apps
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs $@
        ;;
    "delete")
        delete_apps
        ;;
    "monitor")
        monitor_apps
        ;;
    "")
        echo "Usage: $0 [start|stop|restart|status|logs|delete|monitor]"
        echo ""
        echo "Commands:"
        echo "  start    - Start the development environment"
        echo "  stop     - Stop the development environment"
        echo "  restart  - Restart the development environment"
        echo "  status   - Show application status"
        echo "  logs     - Show logs (optional: logs frontend/backend)"
        echo "  delete   - Delete PM2 processes"
        echo "  monitor  - Open PM2 monitor interface"
        ;;
    *)
        print_error "Invalid command: $1"
        echo "Use '$0' without arguments to see usage"
        exit 1
        ;;
esac