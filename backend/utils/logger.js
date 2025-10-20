const fs = require('fs').promises;
const path = require('path');

/**
 * Logger utility for API request/response logging
 * Logs to daily files in YYYY-MM-DD format with automatic rotation at 100MB
 */
class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '../../logs');
    this.maxFileSize = 100 * 1024 * 1024; // 100MB in bytes
    this.ensureLogsDirectory();
  }

  /**
   * Ensure logs directory exists
   */
  async ensureLogsDirectory() {
    try {
      await fs.access(this.logsDir);
    } catch (error) {
      await fs.mkdir(this.logsDir, { recursive: true });
    }
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  getCurrentDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Get log file path for current date
   */
  getLogFilePath(suffix = '', logType = 'general') {
    const dateStr = this.getCurrentDateString();
    let fileName;
    
    if (logType === 'audit') {
      fileName = suffix ? `${dateStr}_audit_${suffix}.txt` : `${dateStr}_audit.txt`;
    } else {
      fileName = suffix ? `${dateStr}_${suffix}.txt` : `${dateStr}.txt`;
    }
    
    return path.join(this.logsDir, fileName);
  }

  /**
   * Check if file size exceeds limit and get appropriate file path
   */
  async getAvailableLogFile(logType = 'general') {
    let suffix = '';
    let counter = 1;
    
    while (true) {
      const filePath = this.getLogFilePath(suffix, logType);
      
      try {
        const stats = await fs.stat(filePath);
        if (stats.size < this.maxFileSize) {
          return filePath;
        }
        // File exists and is too large, try next suffix
        suffix = `part${counter}`;
        counter++;
      } catch (error) {
        // File doesn't exist, use this path
        return filePath;
      }
    }
  }

  /**
   * Extract request identifier information
   */
  extractRequestInfo(req) {
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    const sessionId = req.sessionID || req.headers['x-session-id'] || 'no-session';
    const userId = req.user?.id || req.headers['x-user-id'] || null;
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    return {
      ip,
      sessionId,
      userId,
      userAgent
    };
  }

  /**
   * Format log entry
   */
  formatLogEntry(type, requestInfo, apiPath, data, timestamp = new Date()) {
    const timeStr = timestamp.toISOString();
    const userIdStr = requestInfo.userId ? ` | UserID: ${requestInfo.userId}` : '';
    
    const logEntry = {
      timestamp: timeStr,
      type: type, // 'REQUEST' or 'RESPONSE'
      ip: requestInfo.ip,
      sessionId: requestInfo.sessionId,
      userId: requestInfo.userId,
      apiPath: apiPath,
      data: data
    };

    // Format as readable text
    const logLine = `[${timeStr}] ${type} | IP: ${requestInfo.ip} | Session: ${requestInfo.sessionId}${userIdStr} | Path: ${apiPath} | Data: ${JSON.stringify(data)}`;
    
    return logLine;
  }

  /**
   * Write log entry to file
   */
  async writeLog(logEntry, logType = 'general') {
    try {
      const filePath = await this.getAvailableLogFile(logType);
      await fs.appendFile(filePath, logEntry + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write log:', error);
      // Fallback: try to write to console
      console.log('LOG FALLBACK:', logEntry);
    }
  }

  /**
   * Log API request
   */
  async logRequest(req) {
    const requestInfo = this.extractRequestInfo(req);
    const apiPath = req.originalUrl || req.url;
    const requestData = {
      method: req.method,
      params: req.params,
      query: req.query,
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined
      }
    };

    const logEntry = this.formatLogEntry('REQUEST', requestInfo, apiPath, requestData);
    await this.writeLog(logEntry);
  }

  /**
   * Log API response
   */
  async logResponse(req, res, responseData) {
    const requestInfo = this.extractRequestInfo(req);
    const apiPath = req.originalUrl || req.url;
    
    // Extract keyValueTable from response if it exists
    const logData = {
      statusCode: res.statusCode,
      status: responseData?.status,
      message: responseData?.message,
      keyValueTable: responseData?.keyValueTable,
      responseTime: res.get('X-Response-Time')
    };

    const logEntry = this.formatLogEntry('RESPONSE', requestInfo, apiPath, logData);
    await this.writeLog(logEntry);
  }

  /**
   * Log error
   */
  async logError(req, error) {
    const requestInfo = this.extractRequestInfo(req);
    const apiPath = req.originalUrl || req.url;
    const errorData = {
      error: error.message,
      stack: error.stack,
      code: error.code
    };

    const logEntry = this.formatLogEntry('ERROR', requestInfo, apiPath, errorData);
    await this.writeLog(logEntry);
  }

  /**
   * General info logging (for service use)
   */
  info(message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] INFO | ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}`;
    console.log(logLine);
    
    // Also write to file asynchronously
    this.writeLog(logLine).catch(err => console.error('Failed to write info log:', err));
  }

  /**
   * General error logging (for service use)
   */
  error(message, error = null) {
    const timestamp = new Date().toISOString();
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      code: error.code
    } : null;
    
    const logLine = `[${timestamp}] ERROR | ${message}${errorData ? ' | Error: ' + JSON.stringify(errorData) : ''}`;
    console.error(logLine);
    
    // Also write to file asynchronously
    this.writeLog(logLine).catch(err => console.error('Failed to write error log:', err));
  }

  /**
   * Log audit events for security-sensitive operations
   */
  async logAudit(auditEvent) {
    try {
      const timestamp = auditEvent.timestamp || new Date().toISOString();
      const operation = auditEvent.operation || 'UNKNOWN_OPERATION';
      const userId = auditEvent.user?.userId || 'anonymous';
      const ip = auditEvent.user?.ip || 'unknown';
      const success = auditEvent.response?.success !== undefined ? auditEvent.response.success : 'pending';
      
      // Format audit log entry
      const auditLogEntry = {
        timestamp,
        operation,
        userId,
        ip,
        success,
        details: {
          user: auditEvent.user,
          request: auditEvent.request,
          response: auditEvent.response,
          metadata: auditEvent.metadata
        }
      };
      
      // Create readable audit log line
      const auditLine = `[${timestamp}] AUDIT | Operation: ${operation} | User: ${userId} | IP: ${ip} | Success: ${success} | Details: ${JSON.stringify(auditLogEntry.details)}`;
      
      // Write to audit log file
      await this.writeLog(auditLine, 'audit');
      
      // Also store in database for enhanced audit trail
      await this.storeAuditInDatabase(auditEvent);
      
      // Also log critical security events to console
      if (this.isCriticalSecurityEvent(operation, success)) {
        console.warn(`SECURITY AUDIT: ${operation} - User: ${userId} - IP: ${ip} - Success: ${success}`);
      }
      
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Fallback: write to general log
      const fallbackLine = `[${new Date().toISOString()}] AUDIT_ERROR | Failed to log audit event: ${JSON.stringify(auditEvent)}`;
      await this.writeLog(fallbackLine).catch(() => {
        console.error('Complete logging failure for audit event');
      });
    }
  }

  /**
   * Store audit event in database for enhanced querying and compliance
   */
  async storeAuditInDatabase(auditEvent) {
    try {
      const DatabaseUtil = require('./database');
      
      const auditId = `AUDIT${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
      const timestamp = auditEvent.timestamp || new Date().toISOString();
      const operation = auditEvent.operation || 'UNKNOWN_OPERATION';
      const userId = auditEvent.user?.userId || null;
      const ip = auditEvent.user?.ip || null;
      const userAgent = auditEvent.user?.userAgent || null;
      
      // Determine severity based on operation and success
      let severity = 'LOW';
      if (auditEvent.response?.success === false) {
        severity = 'MEDIUM';
      }
      if (this.isCriticalSecurityEvent(operation, auditEvent.response?.success)) {
        severity = 'HIGH';
      }
      if (operation === 'SECURITY_VIOLATION') {
        severity = auditEvent.severity || 'HIGH';
      }
      
      const insertQuery = `
        INSERT INTO audit_logs (
          id, user_id, action, resource_type, resource_id, 
          old_values, new_values, session_details, 
          operation_type, audit_details, severity, ip_address, user_agent,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        auditId,
        userId || 'system',
        auditEvent.request?.method || operation,
        auditEvent.metadata?.resourceType || 'system',
        auditEvent.metadata?.resourceId || null,
        auditEvent.request ? JSON.stringify(auditEvent.request) : null,
        auditEvent.response ? JSON.stringify(auditEvent.response) : null,
        auditEvent.user ? JSON.stringify(auditEvent.user) : null,
        operation,
        JSON.stringify(auditEvent),
        severity,
        ip,
        userAgent,
        timestamp
      ];
      
      const result = await DatabaseUtil.executeQuery(insertQuery, params);
      
      if (!result.success) {
        console.error('Failed to store audit in database:', result.error);
      }
      
    } catch (error) {
      console.error('Database audit storage error:', error);
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Determine if an audit event is critical for security monitoring
   */
  isCriticalSecurityEvent(operation, success) {
    const criticalOperations = [
      'USER_LOGIN', 'AUTH_FAILURE', 'ADMIN_USER_CREATE', 'ADMIN_USER_DELETE',
      'PAYMENT_CONFIRM', 'PAYMENT_REFUND', 'ADMIN_PRODUCT_DELETE'
    ];
    
    // Log all critical operations, and any failed operations
    return criticalOperations.includes(operation) || success === false;
  }

  /**
   * Log security violations and suspicious activities
   */
  async logSecurityViolation(violationType, details) {
    const timestamp = new Date().toISOString();
    const securityEvent = {
      timestamp,
      type: 'SECURITY_VIOLATION',
      violationType,
      details,
      severity: this.getViolationSeverity(violationType)
    };
    
    const securityLine = `[${timestamp}] SECURITY | Type: ${violationType} | Severity: ${securityEvent.severity} | Details: ${JSON.stringify(details)}`;
    
    // Write to audit log
    await this.writeLog(securityLine, 'audit');
    
    // Always log security violations to console
    console.error(`SECURITY VIOLATION: ${violationType} - ${JSON.stringify(details)}`);
  }

  /**
   * Get severity level for security violations
   */
  getViolationSeverity(violationType) {
    const severityMap = {
      'RATE_LIMIT_EXCEEDED': 'MEDIUM',
      'CSRF_TOKEN_INVALID': 'HIGH',
      'SQL_INJECTION_ATTEMPT': 'CRITICAL',
      'XSS_ATTEMPT': 'HIGH',
      'UNAUTHORIZED_ACCESS': 'HIGH',
      'BRUTE_FORCE_ATTEMPT': 'HIGH',
      'SUSPICIOUS_ACTIVITY': 'MEDIUM'
    };
    
    return severityMap[violationType] || 'MEDIUM';
  }
}

// Export singleton instance
module.exports = new Logger();