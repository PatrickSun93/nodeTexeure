# Logging Middleware Documentation

## Overview

This directory contains the comprehensive logging middleware system for the Express.js backend. The logging system automatically captures all API requests and responses, storing them in daily log files with detailed information for monitoring, debugging, and analysis.

## Features

### 🔍 **Request Tracking**
- **IP Address**: Client IP address identification
- **Session ID**: Session tracking (from sessionID or x-session-id header)
- **User ID**: Optional user identification (from user object or x-user-id header)
- **Request Details**: Method, path, parameters, query strings, and body
- **Headers**: Content-type and authorization (redacted for security)

### 📊 **Response Logging**
- **Status Codes**: HTTP response status codes
- **Response Time**: Automatic calculation and tracking
- **Response Data**: Captures standardized API response format
- **KeyValueTable**: Logs the structured data from API responses

### 📁 **File Management**
- **Daily Files**: Automatic daily log file creation (YYYY-MM-DD.txt format)
- **File Rotation**: Automatic rotation when files exceed 100MB
- **Asynchronous Writing**: Non-blocking file operations for performance
- **Error Handling**: Fallback logging to console if file writing fails

## File Structure

```
backend/middleware/
├── README.md                 # This documentation
└── loggingMiddleware.js      # Main logging middleware

backend/utils/
└── logger.js                 # Core logging utility

logs/
└── YYYY-MM-DD.txt           # Daily log files
└── YYYY-MM-DD_part1.txt     # Rotated files when exceeding 100MB
```

## Log Format

### Request Log Entry
```
[2025-07-14T04:20:41.567Z] REQUEST | IP: 127.0.0.1 | Session: no-session | Path: /api/status/health | Data: {"method":"GET","params":{},"query":{},"body":{},"headers":{}}
```

### Response Log Entry
```
[2025-07-14T04:20:41.570Z] RESPONSE | IP: 127.0.0.1 | Session: no-session | Path: /api/status/health | Data: {"statusCode":200,"status":"SUCCESS","message":"Backend server is running","keyValueTable":[{"port":6666},{"timestamp":"2025-07-14T04:20:41.569Z"}],"responseTime":"2ms"}
```

### Error Log Entry
```
[2025-07-14T04:20:41.570Z] ERROR | IP: 127.0.0.1 | Session: no-session | Path: /api/endpoint | Data: {"error":"Error message","stack":"Error stack trace","code":"ERROR_CODE"}
```

## Configuration

### Logger Settings
- **Log Directory**: `/logs` (relative to project root)
- **Max File Size**: 100MB per file
- **File Format**: Plain text (.txt)
- **Timestamp Format**: ISO 8601 (UTC)

### Captured Information

#### Request Data
- HTTP method (GET, POST, PUT, DELETE, etc.)
- Request parameters and query strings
- Request body (JSON data)
- Content-Type header
- Authorization header (redacted as [REDACTED])

#### Response Data
- HTTP status code
- Response time in milliseconds
- API response status (SUCCESS/FAIL)
- Response message
- KeyValueTable data structure

#### User Identification
- **IP Address**: Always captured
- **Session ID**: From sessionID or x-session-id header
- **User ID**: Optional, from user object or x-user-id header

## Integration

### Server Integration
The middleware is automatically integrated into the Express server:

```javascript
const LoggingMiddleware = require('./middleware/loggingMiddleware');

// Apply logging middleware
app.use(LoggingMiddleware.middleware());

// Apply error logging middleware (before error handlers)
app.use(LoggingMiddleware.errorMiddleware());
```

### Automatic Features
- **All Endpoints**: Logs every API request and response
- **Error Tracking**: Automatically captures and logs errors
- **Performance Monitoring**: Response time tracking
- **Security**: Sensitive data redaction

## Performance Considerations

### Asynchronous Operations
- File writing operations are non-blocking
- Uses `setImmediate()` for optimal performance
- Minimal impact on API response times

### File Management
- Automatic daily file rotation
- Size-based file splitting (100MB limit)
- Efficient file I/O operations

### Error Handling
- Graceful fallback to console logging
- Continues operation even if file writing fails
- Error logging for debugging middleware issues

## Usage Examples

### Standard API Request
```bash
curl -X GET http://localhost:6666/api/users
```

**Generates:**
- REQUEST log with IP, session, path, and request details
- RESPONSE log with status code, response time, and data

### POST Request with Data
```bash
curl -X POST http://localhost:6666/api/users \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -H "x-user-id: user456" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

**Generates:**
- REQUEST log with user ID, session ID, and request body
- RESPONSE log with creation response and keyValueTable

## Monitoring and Analysis

### Log Analysis
- **Request Volume**: Count requests per day/hour
- **Response Times**: Performance monitoring
- **Error Rates**: Track API failures
- **User Activity**: Session and user tracking
- **Endpoint Usage**: Popular API endpoints

### Log File Locations
```
logs/
├── 2025-07-14.txt           # Today's logs
├── 2025-07-13.txt           # Yesterday's logs
├── 2025-07-12_part1.txt     # Rotated file (exceeded 100MB)
└── 2025-07-12_part2.txt     # Additional rotated file
```

### Expected Volume
- **Initial Launch**: 10,000+ requests per day
- **File Size**: Approximately 1-2MB per 1000 requests
- **Rotation**: Daily files typically under 100MB

## Security Features

### Data Protection
- **Authorization Headers**: Automatically redacted as [REDACTED]
- **Sensitive Data**: No password or token logging
- **IP Tracking**: For security monitoring
- **Session Tracking**: For user activity analysis

### Privacy Considerations
- User IDs are optional and only logged if provided
- Request bodies are logged for debugging (ensure no sensitive data in API calls)
- Response data follows standardized format

## Troubleshooting

### Common Issues

1. **Missing Log Files**
   - Check logs directory permissions
   - Verify middleware is properly integrated
   - Check console for fallback logs

2. **Large Log Files**
   - Files automatically rotate at 100MB
   - Manual cleanup can be performed as needed
   - Consider log analysis tools for large volumes

3. **Performance Impact**
   - Logging is asynchronous and should have minimal impact
   - Monitor response times if concerned
   - File I/O errors fall back to console logging

### Debug Mode
To enable additional debugging, check console output for:
- "Failed to write log" messages
- "LOG FALLBACK" entries
- Middleware integration errors

## Future Enhancements

### Potential Improvements
- **Log Compression**: Gzip compression for older files
- **Database Logging**: Optional database storage for analysis
- **Real-time Monitoring**: WebSocket-based live log viewing
- **Log Aggregation**: Integration with ELK stack or similar tools
- **Filtering Options**: Configurable endpoint exclusions
- **Structured Logging**: JSON format option for machine parsing

### Integration Ready
The logging system is designed to be compatible with:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana + Loki**
- **Fluentd**
- **Custom log analysis tools**

The current text format can be easily parsed and imported into any log analysis system when needed.