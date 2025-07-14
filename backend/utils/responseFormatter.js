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
    
    if (keyValueTable && keyValueTable.length > 0) {
      response.keyValueTable = keyValueTable;
    }
    
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
    
    if (keyValueTable && keyValueTable.length > 0) {
      response.keyValueTable = keyValueTable;
    }
    
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

  /**
   * Add timestamp to keyValueTable
   * @param {Array} keyValueTable - Existing key-value table
   * @returns {Array} Updated key-value table with timestamp
   */
  static addTimestamp(keyValueTable = []) {
    return [
      ...keyValueTable,
      { 'timestamp': new Date().toISOString() }
    ];
  }

  /**
   * Convert object to keyValueTable format
   * @param {Object} data - Object to convert
   * @returns {Array} Key-value table format
   */
  static objectToKeyValueTable(data) {
    if (!data || typeof data !== 'object') {
      return [];
    }
    
    return Object.entries(data).map(([key, value]) => ({ [key]: value }));
  }

  /**
   * Convert keyValueTable to object format
   * @param {Array} keyValueTable - Key-value table to convert
   * @returns {Object} Converted object
   */
  static keyValueTableToObject(keyValueTable) {
    if (!Array.isArray(keyValueTable)) {
      return {};
    }
    
    return keyValueTable.reduce((obj, item) => {
      if (typeof item === 'object' && item !== null) {
        Object.assign(obj, item);
      }
      return obj;
    }, {});
  }
}

module.exports = ResponseFormatter;