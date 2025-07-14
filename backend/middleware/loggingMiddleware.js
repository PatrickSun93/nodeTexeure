const logger = require('../utils/logger');

/**
 * Logging middleware for Express.js
 * Captures all API requests and responses automatically
 */
class LoggingMiddleware {
  /**
   * Main middleware function
   */
  static middleware() {
    return async (req, res, next) => {
      const startTime = Date.now();
      
      // Log the incoming request
      try {
        await logger.logRequest(req);
      } catch (error) {
        console.error('Failed to log request:', error);
      }

      // Store original res.json and res.send methods
      const originalJson = res.json;
      const originalSend = res.send;
      
      // Flag to prevent duplicate logging
      let responseLogged = false;
      
      // Override res.json to capture response data
      res.json = function(data) {
        // Calculate response time
        const responseTime = Date.now() - startTime;
        res.set('X-Response-Time', `${responseTime}ms`);
        
        // Log the response asynchronously (only once)
        if (!responseLogged) {
          responseLogged = true;
          setImmediate(async () => {
            try {
              await logger.logResponse(req, res, data);
            } catch (error) {
              console.error('Failed to log response:', error);
            }
          });
        }
        
        // Call original json method
        return originalJson.call(this, data);
      };
      
      // Override res.send to capture non-JSON responses
      res.send = function(data) {
        // Calculate response time
        const responseTime = Date.now() - startTime;
        res.set('X-Response-Time', `${responseTime}ms`);
        
        // Log the response asynchronously (only once)
        if (!responseLogged) {
          responseLogged = true;
          setImmediate(async () => {
            try {
              let responseData;
              try {
                responseData = typeof data === 'string' ? JSON.parse(data) : data;
              } catch {
                responseData = { rawData: data };
              }
              await logger.logResponse(req, res, responseData);
            } catch (error) {
              console.error('Failed to log response:', error);
            }
          });
        }
        
        // Call original send method
        return originalSend.call(this, data);
      };
      
      // Handle errors
      const originalNext = next;
      const errorHandler = (error) => {
        // Log the error asynchronously
        setImmediate(async () => {
          try {
            await logger.logError(req, error);
          } catch (logError) {
            console.error('Failed to log error:', logError);
          }
        });
        
        // Call original next with error
        originalNext(error);
      };
      
      try {
        next();
      } catch (error) {
        errorHandler(error);
      }
    };
  }
  
  /**
   * Error handling middleware (should be used after routes)
   */
  static errorMiddleware() {
    return async (error, req, res, next) => {
      // Log the error
      try {
        await logger.logError(req, error);
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
      
      // Pass error to next error handler
      next(error);
    };
  }
}

module.exports = LoggingMiddleware;