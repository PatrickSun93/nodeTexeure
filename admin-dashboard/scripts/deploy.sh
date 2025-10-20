#!/bin/bash

# Admin Dashboard Production Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

# Configuration
ENVIRONMENT=${1:-production}
PROJECT_NAME="admin-dashboard"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="/var/backups/admin-dashboard"
LOG_FILE="/var/log/admin-dashboard-deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root or with sudo"
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi
    
    # Check if .env.production exists
    if [[ ! -f ".env.production" ]]; then
        error ".env.production file not found"
    fi
    
    success "Prerequisites check passed"
}

# Create backup
create_backup() {
    log "Creating backup..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Backup timestamp
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$BACKUP_TIMESTAMP.tar.gz"
    
    # Create backup of current deployment
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Up"; then
        log "Backing up current deployment..."
        
        # Export volumes
        docker run --rm \
            -v admin-logs:/backup-logs \
            -v admin-uploads:/backup-uploads \
            -v "$BACKUP_DIR":/backup \
            alpine tar czf "/backup/volumes_$BACKUP_TIMESTAMP.tar.gz" -C / backup-logs backup-uploads
        
        # Export database if applicable
        # docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T database pg_dump -U postgres database > "$BACKUP_DIR/db_$BACKUP_TIMESTAMP.sql"
    fi
    
    success "Backup created: $BACKUP_FILE"
}

# Build and deploy
deploy() {
    log "Starting deployment for environment: $ENVIRONMENT"
    
    # Pull latest changes (if in git repository)
    if [[ -d ".git" ]]; then
        log "Pulling latest changes..."
        git pull origin main || warning "Git pull failed or not in git repository"
    fi
    
    # Build new images
    log "Building Docker images..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    
    # Stop existing containers
    log "Stopping existing containers..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    # Start new containers
    log "Starting new containers..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 30
    
    # Health check
    health_check
}

# Health check
health_check() {
    log "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s http://localhost:3001/api/health > /dev/null; then
            success "Health check passed"
            return 0
        fi
        
        log "Health check attempt $attempt/$max_attempts failed, retrying in 10 seconds..."
        sleep 10
        ((attempt++))
    done
    
    error "Health check failed after $max_attempts attempts"
}

# Cleanup old images and containers
cleanup() {
    log "Cleaning up old Docker images and containers..."
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused containers
    docker container prune -f
    
    # Remove unused volumes (be careful with this)
    # docker volume prune -f
    
    success "Cleanup completed"
}

# Setup SSL certificates (Let's Encrypt)
setup_ssl() {
    log "Setting up SSL certificates..."
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log "Installing certbot..."
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Generate certificates
    certbot --nginx -d admin.bedtexture.com --non-interactive --agree-tos --email admin@bedtexture.com
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    success "SSL certificates configured"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."
    
    # Create monitoring script
    cat > /usr/local/bin/admin-dashboard-monitor.sh << 'EOF'
#!/bin/bash
# Admin Dashboard Monitoring Script

WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
SERVICE_NAME="admin-dashboard"

check_service() {
    if ! curl -f -s http://localhost:3001/api/health > /dev/null; then
        echo "Service $SERVICE_NAME is down!"
        
        # Send alert if webhook is configured
        if [[ -n "$WEBHOOK_URL" ]]; then
            curl -X POST -H 'Content-type: application/json' \
                --data "{\"text\":\"🚨 Alert: $SERVICE_NAME is down!\"}" \
                "$WEBHOOK_URL"
        fi
        
        # Attempt restart
        cd /opt/admin-dashboard
        docker-compose -f docker-compose.prod.yml restart
        
        return 1
    fi
    return 0
}

check_service
EOF

    chmod +x /usr/local/bin/admin-dashboard-monitor.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/admin-dashboard-monitor.sh") | crontab -
    
    success "Monitoring configured"
}

# Setup log rotation
setup_log_rotation() {
    log "Setting up log rotation..."
    
    cat > /etc/logrotate.d/admin-dashboard << 'EOF'
/var/log/admin-dashboard-deploy.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF

    success "Log rotation configured"
}

# Main deployment function
main() {
    log "Starting Admin Dashboard deployment..."
    
    check_permissions
    check_prerequisites
    
    # Create backup before deployment
    create_backup
    
    # Deploy the application
    deploy
    
    # Setup SSL if not already configured
    if [[ ! -f "/etc/letsencrypt/live/admin.bedtexture.com/fullchain.pem" ]]; then
        setup_ssl
    fi
    
    # Setup monitoring and log rotation
    setup_monitoring
    setup_log_rotation
    
    # Cleanup
    cleanup
    
    success "Deployment completed successfully!"
    log "Admin Dashboard is now running at https://admin.bedtexture.com"
    
    # Display running containers
    log "Running containers:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps
}

# Rollback function
rollback() {
    log "Rolling back to previous version..."
    
    # Find latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/volumes_*.tar.gz 2>/dev/null | head -n1)
    
    if [[ -z "$LATEST_BACKUP" ]]; then
        error "No backup found for rollback"
    fi
    
    log "Rolling back to: $LATEST_BACKUP"
    
    # Stop current containers
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    # Restore volumes
    docker run --rm \
        -v admin-logs:/backup-logs \
        -v admin-uploads:/backup-uploads \
        -v "$BACKUP_DIR":/backup \
        alpine tar xzf "/backup/$(basename "$LATEST_BACKUP")" -C /
    
    # Start containers
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    success "Rollback completed"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback
        ;;
    "health")
        health_check
        ;;
    "backup")
        create_backup
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|backup}"
        exit 1
        ;;
esac