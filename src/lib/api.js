/**
 * API utility functions for making HTTP requests to the backend
 * These functions can be reused across multiple pages and components
 */

// Backend API base URL - using Next.js proxy
export const API_BASE_URL = '/api';

/**
 * Helper function to extract data from standardized API response
 * @param {object} response - API response with status, message, keyValueTable
 * @returns {object} - Extracted data
 */
export const extractResponseData = (response) => {
  if (!response) return {};
  
  // Convert keyValueTable to object format for easier access
  const data = {};
  if (response.keyValueTable && Array.isArray(response.keyValueTable)) {
    response.keyValueTable.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        Object.assign(data, item);
      }
    });
  }
  
  return {
    status: response.status,
    message: response.message,
    data,
    ...data // Spread data for backward compatibility
  };
};

/**
 * Check if API response indicates success
 * @param {object} response - API response
 * @returns {boolean} - True if successful
 */
export const isSuccessResponse = (response) => {
  return response && response.status === 'SUCCESS';
};

/**
 * Generic API request function with error handling
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<object>} - Response data
 */
export const apiRequest = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP error! status: ${response.status}`);
    }
    
    // Check if response indicates failure in the new format
    if (data.status === 'FAIL') {
      throw new Error(data.message || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Check backend health status
 * @returns {Promise<object>} - Health status data
 */
export const checkBackendHealth = async () => {
  try {
    // Try new status endpoint first, fallback to old endpoint for compatibility
    let response;
    try {
      response = await apiRequest('/status/health');
    } catch {
      response = await apiRequest('/health');
    }
    
    // Extract data from new format or return as-is for old format
    return extractResponseData(response);
  } catch (error) {
    throw new Error('Backend not available - Make sure backend server is running on port 6666');
  }
};

/**
 * Test hello API endpoint
 * @returns {Promise<object>} - Hello message data
 */
export const testHelloAPI = async () => {
  try {
    // Try new status endpoint first, fallback to old endpoint for compatibility
    let response;
    try {
      response = await apiRequest('/status/hello');
    } catch {
      response = await apiRequest('/hello');
    }
    
    // Extract data from new format or return as-is for old format
    return extractResponseData(response);
  } catch (error) {
    throw new Error('Error testing hello API - Make sure backend is running');
  }
};

/**
 * User API functions
 */
export const userAPI = {
  /**
   * Fetch all users
   * @returns {Promise<Array>} - Array of users
   */
  getAll: async () => {
    try {
      const data = await apiRequest('/users');
      return data.users || [];
    } catch (error) {
      throw new Error('Error fetching users - Make sure backend is running');
    }
  },

  /**
   * Create a new user
   * @param {object} userData - User data (name, email)
   * @returns {Promise<object>} - Created user data
   */
  create: async (userData) => {
    if (!userData.name || !userData.email) {
      throw new Error('Please fill in all fields');
    }

    try {
      return await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
    } catch (error) {
      throw new Error('Error creating user - Make sure backend is running');
    }
  },

  /**
   * Get a specific user by ID
   * @param {string|number} userId - User ID
   * @returns {Promise<object>} - User data
   */
  getById: async (userId) => {
    try {
      return await apiRequest(`/users/${userId}`);
    } catch (error) {
      throw new Error('Error fetching user - Make sure backend is running');
    }
  },

  /**
   * Update a user
   * @param {string|number} userId - User ID
   * @param {object} userData - Updated user data
   * @returns {Promise<object>} - Updated user data
   */
  update: async (userId, userData) => {
    try {
      return await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(userData),
      });
    } catch (error) {
      throw new Error('Error updating user - Make sure backend is running');
    }
  },

  /**
   * Delete a user
   * @param {string|number} userId - User ID
   * @returns {Promise<object>} - Deletion confirmation
   */
  delete: async (userId) => {
    try {
      return await apiRequest(`/users/${userId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      throw new Error('Error deleting user - Make sure backend is running');
    }
  },
};

/**
 * Database API functions
 * Updated to use backend/routes/databaseRoutes.js endpoints
 */
export const databaseAPI = {
  /**
   * Test database connection
   * @returns {Promise<object>} - Database connection test result
   */
  testConnection: async () => {
    try {
      const response = await apiRequest('/database/test');
      return response;
    } catch (error) {
      throw new Error('Error testing database connection - Make sure backend is running');
    }
  },

  /**
   * Get database table count
   * @returns {Promise<object>} - Table count and list
   */
  getTableCount: async () => {
    try {
      const response = await apiRequest('/database/tables');
      return response;
    } catch (error) {
      throw new Error('Error fetching table count - Make sure backend is running');
    }
  },

  /**
   * Get transno table data
   * @returns {Promise<object>} - Transno table data
   */
  getTransnoData: async () => {
    try {
      const response = await apiRequest('/database/transno');
      return response;
    } catch (error) {
      throw new Error('Error fetching transno data - Make sure backend is running');
    }
  },

  /**
   * Execute custom SELECT query
   * @param {string} query - SQL SELECT query
   * @param {Array} params - Query parameters (optional)
   * @returns {Promise<object>} - Query execution result
   */
  executeQuery: async (query, params = []) => {
    try {
      const response = await apiRequest('/database/query', {
        method: 'POST',
        body: JSON.stringify({ query, params }),
      });
      return response;
    } catch (error) {
      throw new Error('Error executing query - Make sure backend is running');
    }
  },

  // Legacy methods for backward compatibility
  /**
   * @deprecated Use testConnection() instead
   * Check database connection status
   * @returns {Promise<object>} - Database connection status
   */
  getConnectionStatus: async () => {
    console.warn('databaseAPI.getConnectionStatus() is deprecated. Use testConnection() instead.');
    return databaseAPI.testConnection();
  },
};