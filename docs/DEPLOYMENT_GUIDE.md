# Deployment Guide

## Overview

This guide covers the complete deployment process for the bed texture e-commerce platform, including production setup, monitoring, and maintenance procedures.

## Prerequisites

- Docker and Docker Compose installed
- SSL certificates for your domain
- AWS account with SES and S3 configured
- Stripe account with API keys
- FedEx developer account
- MySQL database (can be containerized)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ecommerce-platform
   ```

2. **Configure environment variables**
   ```bash
   cp deployment/.env.production.template deployment/.env.production
   # Edit deployment/.env.production with your actual values
   ```

3. **Run deployment script**
   ```bash
   ./deployment/deploy.sh
   ```

## Detailed Setup

### 1. Environment Configuration

Copy the production environment template and configure all required variables:

```bash
cp deployment/.env.production.template deployment/.env.production
```

**Critical Variables to Configure:**

- `DB_PASSWORD`: Strong database password
- `STRIPE_SECRET_KEY`: Your Stripe secret key
- `JWT_SECRET`: 64-character random string
- `ENCRYPTION_KEY`: 32-character encryption key
- `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`: AWS credentials
- `FEDEX_API_KEY` & `FEDEX_SECRET_KEY`: FedEx API credentials

### 2. SSL Certificate Setup

Place your SSL certificates in the `deployment/ssl/` directory:

```
deployment/ssl/
├── cert.pem
└── key.pem
```

For Let's Encrypt certificates:
```bash
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem deployment/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem deployment/ssl/key.pem
```

### 3. Database Setup

The deployment includes a MySQL container, but for production, consider using a managed database service.

**For managed database:**
1. Update `DB_HOST` in `.env.production`
2. Run migrations manually:
   ```bash
   npm run migrate
   ```

### 4. Build and Deploy

Run the deployment script:
```bash
./deployment/deploy.sh
```

This script will:
- Run pre-deployment checks
- Execute integration tests
- Build Docker images
- Start all services
- Run health checks
- Apply database migrations

### 5. Post-Deployment Verification

After deployment, verify all services are running:

```bash
# Check service status
docker-compose -f deployment/docker-compose.prod.yml ps

# Check logs
docker-compose -f deployment/docker-compose.prod.yml logs -f

# Test endpoints
curl -f http://localhost:6666/api/health
curl -f http://localhost:3000
curl -f http://localhost:3005
```

## Monitoring Setup

### 1. Start Monitoring Stack

```bash
docker-compose -f monitoring/docker-compose.monitoring.yml up -d
```

### 2. Access Monitoring Tools

- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

### 3. Configure Alerts

Update `monitoring/alertmanager.yml` with your notification channels:
- Email addresses
- Slack webhook URLs
- PagerDuty integration keys

## Scaling and Performance

### Horizontal Scaling

Scale individual services:
```bash
docker-compose -f deployment/docker-compose.prod.yml up -d --scale backend=3
docker-compose -f deployment/docker-compose.prod.yml up -d --scale frontend=2
```

### Load Balancing

For production, consider using:
- AWS Application Load Balancer
- Nginx Plus
- HAProxy

### Database Optimization

1. **Read Replicas**: Set up MySQL read replicas for read-heavy operations
2. **Connection Pooling**: Configure connection pool sizes based on load
3. **Indexing**: Monitor slow queries and add appropriate indexes

## Backup and Recovery

### Database Backups

Automated daily backups:
```bash
# Add to crontab
0 2 * * * docker exec mysql_container mysqldump -u root -p$DB_ROOT_PASSWORD ecommerce_db > /backups/db_$(date +%Y%m%d).sql
```

### File Backups

For uploaded files (if not using S3):
```bash
# Backup uploads directory
0 3 * * * tar -czf /backups/uploads_$(date +%Y%m%d).tar.gz /app/uploads/
```

### Recovery Procedures

**Database Recovery:**
```bash
docker exec -i mysql_container mysql -u root -p$DB_ROOT_PASSWORD ecommerce_db < backup.sql
```

**File Recovery:**
```bash
tar -xzf uploads_backup.tar.gz -C /app/
```

## Security Considerations

### 1. Network Security

- Use VPC with private subnets
- Configure security groups to allow only necessary traffic
- Enable DDoS protection

### 2. Application Security

- Regular security updates
- Dependency vulnerability scanning
- Web Application Firewall (WAF)

### 3. Data Protection

- Encrypt data at rest
- Use HTTPS everywhere
- Regular security audits

## Troubleshooting

### Common Issues

**Service Won't Start:**
```bash
# Check logs
docker-compose -f deployment/docker-compose.prod.yml logs service_name

# Check resource usage
docker stats

# Restart service
docker-compose -f deployment/docker-compose.prod.yml restart service_name
```

**Database Connection Issues:**
```bash
# Test database connectivity
docker-compose -f deployment/docker-compose.prod.yml exec backend npm run test:db

# Check database logs
docker-compose -f deployment/docker-compose.prod.yml logs database
```

**High Memory Usage:**
```bash
# Check memory usage by service
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Scale down if necessary
docker-compose -f deployment/docker-compose.prod.yml up -d --scale backend=1
```

### Performance Issues

1. **Slow Response Times:**
   - Check database query performance
   - Review application logs for bottlenecks
   - Monitor resource usage

2. **High CPU Usage:**
   - Scale horizontally
   - Optimize database queries
   - Implement caching

3. **Memory Leaks:**
   - Monitor memory usage trends
   - Review application code for memory leaks
   - Restart services if necessary

## Maintenance

### Regular Tasks

**Daily:**
- Monitor system health
- Check error logs
- Verify backup completion

**Weekly:**
- Review performance metrics
- Update dependencies
- Security patch review

**Monthly:**
- Full system backup test
- Security audit
- Performance optimization review

### Updates and Patches

1. **Test in staging environment first**
2. **Schedule maintenance windows**
3. **Use rolling updates for zero downtime**
4. **Have rollback plan ready**

## Support and Monitoring

### Key Metrics to Monitor

- Response times (< 2 seconds for 95th percentile)
- Error rates (< 1% for critical endpoints)
- Database connection pool usage (< 80%)
- Memory usage (< 85%)
- Disk space (> 20% free)

### Alert Thresholds

- **Critical**: Service down, payment failures, database issues
- **Warning**: High resource usage, slow response times, queue backlogs
- **Info**: Deployment events, configuration changes

### Contact Information

- **Technical Lead**: [email]
- **DevOps Team**: [email]
- **On-call Rotation**: [pager/phone]

## Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Admin User Guide](./ADMIN_USER_GUIDE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Security Guidelines](./SECURITY_GUIDELINES.md)