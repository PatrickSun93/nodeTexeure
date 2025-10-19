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
   * Get dashboard overview with KPIs
   * @param {object} params - Query parameters (period, startDate, endDate)
   * @returns {Promise<object>} - Dashboard overview data
   */
  async getOverview(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/overview?${queryString}` : 'dashboard/overview';
    return apiRequest(endpoint);
  },

  /**
   * Get sales trend data for charts
   * @param {object} params - Query parameters (period, granularity)
   * @returns {Promise<object>} - Sales trend data
   */
  async getSalesTrend(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/sales-trend?${queryString}` : 'dashboard/sales-trend';
    return apiRequest(endpoint);
  },

  /**
   * Get top performing products
   * @param {object} params - Query parameters (period, limit, metric)
   * @returns {Promise<object>} - Top products data
   */
  async getTopProducts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/top-products?${queryString}` : 'dashboard/top-products';
    return apiRequest(endpoint);
  },

  /**
   * Get order status distribution
   * @param {object} params - Query parameters (period)
   * @returns {Promise<object>} - Order status distribution data
   */
  async getOrderStatusDistribution(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/order-status-distribution?${queryString}` : 'dashboard/order-status-distribution';
    return apiRequest(endpoint);
  },

  /**
   * Get customer analytics
   * @param {object} params - Query parameters (period)
   * @returns {Promise<object>} - Customer analytics data
   */
  async getCustomerAnalytics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/customer-analytics?${queryString}` : 'dashboard/customer-analytics';
    return apiRequest(endpoint);
  },

  /**
   * Get inventory alerts
   * @returns {Promise<object>} - Inventory alerts data
   */
  async getInventoryAlerts() {
    return apiRequest('dashboard/inventory-alerts');
  },
};

/**
 * Admin product management API calls
 */
export const adminProducts = {
  /**
   * Get all products with pagination and filters
   * @param {object} params - Query parameters
   * @returns {Promise<object>} - Products data
   */
  async getProducts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/products?${queryString}` : 'admin/products';
    return apiRequest(endpoint);
  },

  /**
   * Get product by ID
   * @param {string} productId - Product ID
   * @returns {Promise<object>} - Product data
   */
  async getProduct(productId) {
    return apiRequest(`admin/products/${productId}`);
  },

  /**
   * Update product status
   * @param {string} productId - Product ID
   * @param {string} status - New status
   * @param {string} notes - Optional notes
   * @returns {Promise<object>} - Update response
   */
  async updateProductStatus(productId, status, notes = '') {
    return apiRequest(`admin/products/${productId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  },

  /**
   * Bulk update products
   * @param {Array} productIds - Array of product IDs
   * @param {object} updates - Update data
   * @returns {Promise<object>} - Update response
   */
  async bulkUpdateProducts(productIds, updates) {
    return apiRequest('admin/products/bulk-update', {
      method: 'PUT',
      body: JSON.stringify({ product_ids: productIds, updates }),
    });
  },

  /**
   * Bulk delete products
   * @param {Array} productIds - Array of product IDs
   * @returns {Promise<object>} - Delete response
   */
  async bulkDeleteProducts(productIds) {
    return apiRequest('admin/products/bulk-delete', {
      method: 'DELETE',
      body: JSON.stringify({ product_ids: productIds }),
    });
  },

  /**
   * Get product statistics
   * @returns {Promise<object>} - Product statistics
   */
  async getProductStats() {
    return apiRequest('admin/products/stats/overview');
  },
};

/**
 * Admin customer management API calls
 */
export const adminCustomers = {
  /**
   * Get all customers with pagination and filters
   * @param {object} params - Query parameters
   * @returns {Promise<object>} - Customers data
   */
  async getCustomers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/customers?${queryString}` : 'admin/customers';
    return apiRequest(endpoint);
  },

  /**
   * Get customer by ID with detailed profile
   * @param {string} customerId - Customer ID
   * @returns {Promise<object>} - Customer profile data
   */
  async getCustomer(customerId) {
    return apiRequest(`admin/customers/${customerId}`);
  },

  /**
   * Get customer analytics and segmentation
   * @returns {Promise<object>} - Customer analytics data
   */
  async getCustomerAnalytics() {
    return apiRequest('admin/customers/analytics');
  },

  /**
   * Update customer status
   * @param {string} customerId - Customer ID
   * @param {string} status - New status (active, inactive, suspended)
   * @param {string} reason - Reason for status change
   * @returns {Promise<object>} - Update response
   */
  async updateCustomerStatus(customerId, status, reason = '') {
    return apiRequest(`admin/customers/${customerId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason }),
    });
  },

  /**
   * Add customer service note
   * @param {string} customerId - Customer ID
   * @param {string} note - Note content
   * @param {string} type - Note type (support, billing, general)
   * @returns {Promise<object>} - Add note response
   */
  async addCustomerNote(customerId, note, type = 'general') {
    return apiRequest(`admin/customers/${customerId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note, type }),
    });
  },

  /**
   * Get customer notes and activity history
   * @param {string} customerId - Customer ID
   * @returns {Promise<object>} - Customer notes data
   */
  async getCustomerNotes(customerId) {
    return apiRequest(`admin/customers/${customerId}/notes`);
  },
};

/**
 * Admin order management API calls
 */
export const adminOrders = {
  /**
   * Get all orders with pagination and filters
   * @param {object} params - Query parameters
   * @returns {Promise<object>} - Orders data
   */
  async getOrders(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/orders?${queryString}` : 'admin/orders';
    return apiRequest(endpoint);
  },

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} - Order data
   */
  async getOrder(orderId) {
    return apiRequest(`admin/orders/${orderId}`);
  },

  /**
   * Update order status
   * @param {string} orderId - Order ID
   * @param {string} status - New status
   * @param {string} notes - Optional notes
   * @returns {Promise<object>} - Update response
   */
  async updateOrderStatus(orderId, status, notes = '') {
    return apiRequest(`admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  },

  /**
   * Process refund for an order
   * @param {string} orderId - Order ID
   * @param {number} amount - Refund amount (optional, full refund if not specified)
   * @param {string} reason - Refund reason
   * @param {string} reasonNotes - Additional notes
   * @returns {Promise<object>} - Refund response
   */
  async processRefund(orderId, amount, reason, reasonNotes = '') {
    return apiRequest(`admin/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason, reasonNotes }),
    });
  },

  /**
   * Generate shipping label and update tracking
   * @param {string} orderId - Order ID
   * @param {object} shippingData - Shipping configuration
   * @returns {Promise<object>} - Shipping response
   */
  async generateShippingLabel(orderId, shippingData = {}) {
    return apiRequest(`admin/orders/${orderId}/shipping`, {
      method: 'POST',
      body: JSON.stringify(shippingData),
    });
  },

  /**
   * Bulk update order statuses
   * @param {Array} orderIds - Array of order IDs
   * @param {string} status - New status
   * @param {string} notes - Optional notes
   * @returns {Promise<object>} - Update response
   */
  async bulkUpdateOrders(orderIds, status, notes = '') {
    return apiRequest('admin/orders/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ orderIds, status, notes }),
    });
  },

  /**
   * Get order analytics for dashboard
   * @param {object} params - Query parameters (period)
   * @returns {Promise<object>} - Order analytics data
   */
  async getOrderAnalytics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/orders/analytics/dashboard?${queryString}` : 'admin/orders/analytics/dashboard';
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
  adminProducts,
  adminCustomers,
  adminOrders,
  getErrorMessage,
  isAuthError,
};