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
  getLogFilePath(suffix = '') {
    const dateStr = this.getCurrentDateString();
    const fileName = suffix ? `${dateStr}_${suffix}.txt` : `${dateStr}.txt`;
    return path.join(this.logsDir, fileName);
  }

  /**
   * Check if file size exceeds limit and get appropriate file path
   */
  async getAvailableLogFile() {
    let suffix = '';
    let counter = 1;
    
    while (true) {
      const filePath = this.getLogFilePath(suffix);
      
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
  async writeLog(logEntry) {
    try {
      const filePath = await this.getAvailableLogFile();
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
}

// Export singleton instance
module.exports = new Logger();