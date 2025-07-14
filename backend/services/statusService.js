/**
 * Status Service
 * Handles health checks and hello endpoints
 */

const ResponseFormatter = require('../utils/responseFormatter');

class StatusService {
  /**
   * Get server health status
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    const keyValueTable = ResponseFormatter.addTimestamp([
      { 'port': process.env.PORT || 6666 }
    ]);
    
    return ResponseFormatter.success('Backend server is running', keyValueTable);
  }

  /**
   * Get hello message
   * @returns {Object} Hello message
   */
  getHelloMessage() {
    const keyValueTable = ResponseFormatter.addTimestamp();
    
    return ResponseFormatter.success('Hello from Express backend!', keyValueTable);
  }

  /**
   * Get personalized hello message
   * @param {string} name - Name to greet
   * @returns {Object} Personalized hello message
   */
  getPersonalizedHello(name) {
    const keyValueTable = ResponseFormatter.addTimestamp([
      { 'name': name || 'World' }
    ]);
    
    return ResponseFormatter.success(`Hello ${name || 'World'} from Express backend!`, keyValueTable);
  }
}

module.exports = new StatusService();