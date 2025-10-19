/**
 * API utility for admin dashboard
 * Handles API calls to the backend with proper error handling and authentication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6666';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make an API request with proper error handling
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - API response data
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `/api/${endpoint.replace(/^\//, '')}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Include cookies for authentication
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    // Try to parse JSON response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      // If JSON parsing fails, create a generic error response
      data = {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        data: null,
        keyValueTable: {
          error: 'Invalid response format',
          status: response.status
        }
      };
    }

    // Check if request was successful
    if (!response.ok) {
      throw new ApiError(
        data.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        data
      );
    }

    // Return the data following the ResponseFormatter pattern
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    throw new ApiError(
      error.message || 'Network error occurred',
      0,
      { error: error.message }
    );
  }
}

/**
 * Admin authentication API calls
 */
export const adminAuth = {
  /**
   * Login admin user
   * @param {string} email - Admin email
   * @param {string} password - Admin password
   * @returns {Promise<object>} - Login response
   */
  async login(email, password) {
    return apiRequest('admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * Logout admin user
   * @returns {Promise<object>} - Logout response
   */
  async logout() {
    return apiRequest('admin/auth/logout', {
      method: 'POST',
    });
  },

  /**
   * Verify admin session
   * @returns {Promise<object>} - Verification response
   */
  async verify() {
    return apiRequest('admin/auth/verify');
  },

  /**
   * Get admin profile
   * @returns {Promise<object>} - Profile data
   */
  async getProfile() {
    return apiRequest('admin/auth/profile');
  },

  /**
   * Update admin profile
   * @param {object} profileData - Profile update data
   * @returns {Promise<object>} - Update response
   */
  async updateProfile(profileData) {
    return apiRequest('admin/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },
};

/**
 * Admin user management API calls
 */
export const adminUsers = {
  /**
   * Get all users with pagination and filters
   * @param {object} params - Query parameters
   * @returns {Promise<object>} - Users data
   */
  async getUsers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/users?${queryString}` : 'admin/users';
    return apiRequest(endpoint);
  },

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} - User data
   */
  async getUser(userId) {
    return apiRequest(`admin/users/${userId}`);
  },

  /**
   * Update user
   * @param {string} userId - User ID
   * @param {object} userData - User update data
   * @returns {Promise<object>} - Update response
   */
  async updateUser(userId, userData) {
    return apiRequest(`admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Delete user (soft delete)
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Delete response
   */
  async deleteUser(userId) {
    return apiRequest(`admin/users/${userId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Dashboard analytics API calls
 */
export const adminDashboard = {
  /**
   * Get dashboard metrics
   * @param {object} params - Query parameters (dateRange, etc.)
   * @returns {Promise<object>} - Dashboard data
   */
  async getMetrics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/dashboard/metrics?${queryString}` : 'admin/dashboard/metrics';
    return apiRequest(endpoint);
  },

  /**
   * Get analytics data for charts
   * @param {string} type - Chart type (sales, orders, customers, etc.)
   * @param {object} params - Query parameters
   * @returns {Promise<object>} - Chart data
   */
  async getAnalytics(type, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/dashboard/analytics/${type}?${queryString}` : `admin/dashboard/analytics/${type}`;
    return apiRequest(endpoint);
  },
};

/**
 * Utility function to handle API errors in components
 * @param {Error} error - Error object
 * @returns {string} - User-friendly error message
 */
export function getErrorMessage(error) {
  if (error instanceof ApiError) {
    // Use the message from the API response
    return error.message;
  }
  
  // Fallback for other types of errors
  return error.message || 'An unexpected error occurred';
}

/**
 * Utility function to check if error is authentication related
 * @param {Error} error - Error object
 * @returns {boolean} - True if auth error
 */
export function isAuthError(error) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export default {
  apiRequest,
  adminAuth,
  adminUsers,
  adminDashboard,
  getErrorMessage,
  isAuthError,
};