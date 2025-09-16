# Security Implementation Documentation

This document describes the comprehensive security implementation for the e-commerce platform, covering rate limiting, audit logging, input validation, CSRF protection, and other security measures.

## Overview

The security implementation consists of multiple middleware layers that work together to protect the application from various security threats:

1. **Rate Limiting** - Prevents abuse and DoS attacks
2. **Audit Logging** - Tracks security-sensitive operations
3. **Input Validation & Sanitization** - Prevents injection attacks
4. **CSRF Protection** - Protects against cross-site request forgery
5. **Security Headers** - Adds essential security headers
6. **Suspicious Activity Detection** - Identifies and blocks malicious requests

## Components

### 1. Rate Limiting Middleware (`rateLimitMiddleware.js`)

Implements multiple rate limiting strategies:

#### Global Rate Limits
- **15-minute window**: 1000 requests per IP
- **1-hour window**: 10000 requests per IP

#### Endpoint-Specific Rate Limits
- **Authentication**: 10 attempts per 15 minutes
- **Admin operations**: 100 requests per 15 minutes
- **Payment operations**: 20 attempts per hour
- **Email operations**: 50 emails per hour
- **Image uploads**: 20 uploads per 15 minutes
- **Search requests**: 200 searches per 15 minutes

#### Features
- IP-based and user-based rate limiting
- Configurable limits per endpoint type
- Standard rate limit headers in responses
- Custom error responses using ResponseFormatter

### 2. Audit Logging Middleware (`auditMiddleware.js`)

Provides comprehensive audit logging for security-sensitive operations:

#### Monitored Operations
- Authentication (login, logout, registration)
- Admin operations (user management, product approval)
- Payment processing (intents, confirmations, refunds)
- Order management (creation, updates, cancellations)
- Inventory operations (stock updates, reservations)
- Email operations (sending, bulk operations)

#### Audit Data Captured
- User context (ID, email, role, IP address)
- Request details (method, URL, parameters, sanitized body)
- Response information (status code, success/failure, response time)
- Metadata (request ID, timestamp, operation type)

#### Data Sanitization
- Passwords and tokens are redacted as `[REDACTED]`
- Payment details are sanitized
- Sensitive fields are automatically removed from logs

### 3. Input Validation & Sanitization (`validationMiddleware.js`)

Comprehensive input validation and sanitization system:

#### Validation Features
- Email format validation
- Password strength requirements (8+ chars, uppercase, lowercase, numbers, special chars)
- Phone number format validation
- URL format validation
- String length limits
- Number range validation
- Enum value validation

#### Sanitization Features
- HTML entity escaping to prevent XSS
- SQL injection pattern removal
- Control character removal
- Recursive object sanitization
- Configurable sanitization options

#### Validation Schemas
Pre-defined schemas for common operations:
- User registration
- User login
- Product creation
- Order creation
- Coupon creation

### 4. CSRF Protection (`csrfMiddleware.js`)

Implements double-submit cookie pattern for CSRF protection:

#### Features
- Session-bound CSRF tokens
- Token expiration (24 hours)
- Signature verification using HMAC
- Automatic token generation for authenticated users
- Protection for state-changing operations (POST, PUT, DELETE, PATCH)

#### Usage
- Tokens are set in non-HttpOnly cookies for JavaScript access
- Same token must be sent in `X-CSRF-Token` header
- Tokens are validated against user session

### 5. Security Middleware Suite (`securityMiddleware.js`)

Combines all security features into configurable middleware stacks:

#### Security Headers
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - Enables XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer info
- `Content-Security-Policy` - Basic CSP for script/style sources
- `Strict-Transport-Security` - HTTPS enforcement (when applicable)

#### Request Size Limiting
- Maximum request size: 10MB
- Prevents DoS attacks via large payloads
- Logs security violations for oversized requests

#### Suspicious Activity Detection
Detects and blocks requests containing:
- SQL injection patterns
- XSS attack vectors
- Path traversal attempts
- Command injection patterns

#### IP Filtering
- Configurable IP blacklist
- Logs blocked access attempts
- Environment variable configuration

#### Security Levels
Three pre-configured security levels:
- **Basic**: Headers, size limits, IP filtering, sanitization
- **Enhanced**: Basic + rate limiting + audit logging
- **Admin**: Enhanced + CSRF protection

## Enhanced Logging (`logger.js`)

Extended the existing logger with audit capabilities:

#### Audit Logging Features
- Separate audit log files (`YYYY-MM-DD_audit.txt`)
- Structured audit event logging
- Critical security event highlighting
- Security violation logging with severity levels

#### Log File Management
- Automatic log rotation at 100MB
- Daily log files with part numbering
- Separate audit and general log streams

## Implementation

### Server Integration

The security middleware is integrated into the main server (`server.js`):

```javascript
// Apply basic security to all routes
app.use(basicSecurity);

// Enhanced security for sensitive routes
app.use('/api/payments', enhancedSecurity, paymentRoutes);

// Admin security with CSRF protection
app.use('/api/admin', adminSecurity, protect, admin, adminRoutes);
```

### Route-Level Security

Individual routes can apply additional security measures:

```javascript
// User registration with validation
router.post('/register', validateInput('userRegistration'), async (req, res) => {
  // Route handler
});

// Login with rate limiting and validation
router.post('/login', authRateLimit, validateInput('userLogin'), async (req, res) => {
  // Route handler
});
```

## Configuration

### Environment Variables

Security configuration through environment variables:

```bash
# CSRF Protection
CSRF_SECRET=your-csrf-secret-key

# IP Filtering
BLACKLISTED_IPS=192.168.1.100,10.0.0.50

# JWT Secret (also used for CSRF if CSRF_SECRET not set)
JWT_SECRET=your-jwt-secret
```

### Rate Limit Customization

Rate limits can be customized by modifying the middleware configuration:

```javascript
const customRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Custom limit
  message: 'Custom rate limit message'
});
```

## Testing

### Security Test Script

A comprehensive test script is provided (`test-security-implementation.js`):

```bash
node backend/scripts/test-security-implementation.js
```

#### Test Coverage
- Rate limiting functionality
- Input validation and sanitization
- Security headers presence
- Request size limiting
- CSRF protection
- Suspicious activity detection

## Monitoring and Alerts

### Log Analysis

Security events are logged with structured data for analysis:

```
[2025-01-16T10:30:00.000Z] AUDIT | Operation: USER_LOGIN | User: user123 | IP: 192.168.1.1 | Success: true
[2025-01-16T10:30:05.000Z] SECURITY | Type: RATE_LIMIT_EXCEEDED | Severity: MEDIUM | IP: 192.168.1.2
```

### Critical Events

Critical security events are logged to console for immediate attention:
- Failed authentication attempts
- Admin operations
- Payment processing
- Security violations

## Security Best Practices

### Implementation Guidelines

1. **Defense in Depth**: Multiple security layers work together
2. **Fail Secure**: Security failures result in access denial
3. **Least Privilege**: Minimal permissions by default
4. **Input Validation**: All input is validated and sanitized
5. **Audit Trail**: All sensitive operations are logged
6. **Rate Limiting**: Prevents abuse and DoS attacks

### Maintenance

1. **Regular Updates**: Keep security middleware updated
2. **Log Monitoring**: Regularly review audit logs
3. **Rate Limit Tuning**: Adjust limits based on usage patterns
4. **Security Testing**: Run security tests regularly
5. **Incident Response**: Have procedures for security violations

## Compliance

This implementation helps meet various security standards:

- **OWASP Top 10**: Addresses injection, broken authentication, XSS, etc.
- **PCI DSS**: Secure payment processing requirements
- **GDPR**: Data protection and audit trail requirements
- **SOC 2**: Security monitoring and logging requirements

## Troubleshooting

### Common Issues

1. **Rate Limit False Positives**: Adjust limits or implement user-based limiting
2. **CSRF Token Issues**: Ensure tokens are properly set and transmitted
3. **Validation Errors**: Check validation schemas match expected input
4. **Log File Growth**: Monitor log file sizes and implement rotation

### Debug Mode

Enable detailed security logging by setting environment variable:

```bash
DEBUG_SECURITY=true
```

This provides additional console output for security middleware operations.