/**
 * Response Formatter Utility
 * Provides standardized API response formatting
 */

class ResponseFormatter {
  /**
   * Create a success response
   * @param {string} message - Success message (optional)
   * @param {Array} keyValueTable - Data in key-value format (optional)
   * @returns {Object} Formatted success response
   */
  static success(message = null, keyValueTable = []) {
    const response = {
      status: 'SUCCESS'
    };
    
    if (message) {
      response.message = message;
    }
    
    response.keyValueTable = keyValueTable;
    return response;
  }

  /**
   * Create a failure response
   * @param {string} message - Error message (optional)
   * @param {Array} keyValueTable - Error details in key-value format (optional)
   * @returns {Object} Formatted failure response
   */
  static failure(message = null, keyValueTable = []) {
    const response = {
      status: 'FAIL'
    };
    
    if (message) {
      response.message = message;
    }
    response.keyValueTable = [];
    return response;
  }

  /**
   * Create a response with custom status
   * @param {string} status - Custom status
   * @param {string} message - Message (optional)
   * @param {Array} keyValueTable - Data in key-value format (optional)
   * @returns {Object} Formatted response
   */
  static custom(status, message = null, keyValueTable = []) {
    const response = {
      status: status
    };
    
    if (message) {
      response.message = message;
    }
    
    if (keyValueTable && keyValueTable.length > 0) {
      response.keyValueTable = keyValueTable;
    }
    
    return response;
  }


}

module.exports = ResponseFormatter;