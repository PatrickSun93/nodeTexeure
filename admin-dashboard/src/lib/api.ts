/**
 * API utility for admin dashboard
 * Handles API calls to the backend with proper error handling and authentication
 */

import type { ApiResponse } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6666';

/** Query parameters, serialized with URLSearchParams. */
type Params = Record<string, string>;

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make an API request with proper error handling
 * @param endpoint - API endpoint (without /api prefix)
 * @param options - Fetch options
 * @returns - API response data
 */
export async function apiRequest<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith('http') ? endpoint : `/api/${endpoint.replace(/^\//, '')}`;
  
  const config: RequestInit = {
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
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(
      message || 'Network error occurred',
      0,
      { error: message }
    );
  }
}

/**
 * Admin authentication API calls
 */
export const adminAuth = {
  /**
   * Login admin user
   * @param email - Admin email
   * @param password - Admin password
   * @returns - Login response
   */
  async login(email: string, password: string) {
    // Login goes through the public users/login endpoint (there is no
    // /api/admin/auth/login — /api/admin/* is auth-protected). The backend sets an
    // HttpOnly admin_auth cookie which the admin routes accept, and apiRequest sends
    // cookies (credentials: 'include'), so subsequent admin calls are authenticated.
    return apiRequest('users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * Logout admin user
   * @returns - Logout response
   */
  async logout() {
    // Backend route is POST /api/admin/logout (mounted under /api/admin); there is no
    // /api/admin/auth/logout. NOTE: apiRequest does not attach a CSRF token, so admin
    // writes should prefer utils/api `apiFetch` (AuthContext.logout() already does).
    return apiRequest('admin/logout', {
      method: 'POST',
    });
  },

  /**
   * Verify admin session
   * @returns - Verification response
   */
  async verify() {
    // Lightweight session probe: returns 200 with { authenticated } whether or not
    // a session cookie exists, so the on-load auth check never logs a 401.
    return apiRequest('users/session');
  },

  /**
   * Get admin profile
   * @returns - Profile data
   */
  async getProfile() {
    return apiRequest('admin/auth/profile');
  },

  /**
   * Update admin profile
   * @param profileData - Profile update data
   * @returns - Update response
   */
  async updateProfile(profileData: Record<string, unknown>) {
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
   * @param params - Query parameters
   * @returns - Users data
   */
  async getUsers(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/users?${queryString}` : 'admin/users';
    return apiRequest(endpoint);
  },

  /**
   * Change user role
   * @param userId - User ID
   * @param role - New role
   * @returns - Update response
   */
  async changeUserRole(userId: string, role: string) {
    return apiRequest(`admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Change user status (delete/restore)
   * @param userId - User ID
   * @param isDeleted - Whether user should be deleted
   * @returns - Update response
   */
  async changeUserStatus(userId: string, isDeleted: boolean) {
    return apiRequest(`admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isDeleted }),
    });
  },

  /**
   * Create new user
   * @param userData - User data
   * @returns - Creation response
   */
  async createUser(userData: Record<string, unknown>) {
    return apiRequest('admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Get user by ID
   * @param userId - User ID
   * @returns - User data
   */
  async getUser(userId: string) {
    return apiRequest(`admin/users/${userId}`);
  },

  /**
   * Update user
   * @param userId - User ID
   * @param userData - User update data
   * @returns - Update response
   */
  async updateUser(userId: string, userData: Record<string, unknown>) {
    return apiRequest(`admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Delete user (soft delete)
   * @param userId - User ID
   * @returns - Delete response
   */
  async deleteUser(userId: string) {
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
   * @param params - Query parameters (period, startDate, endDate)
   * @returns - Dashboard overview data
   */
  async getOverview(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/overview?${queryString}` : 'dashboard/overview';
    return apiRequest(endpoint);
  },

  /**
   * Get sales trend data for charts
   * @param params - Query parameters (period, granularity)
   * @returns - Sales trend data
   */
  async getSalesTrend(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/sales-trend?${queryString}` : 'dashboard/sales-trend';
    return apiRequest(endpoint);
  },

  /**
   * Get top performing products
   * @param params - Query parameters (period, limit, metric)
   * @returns - Top products data
   */
  async getTopProducts(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/top-products?${queryString}` : 'dashboard/top-products';
    return apiRequest(endpoint);
  },

  /**
   * Get order status distribution
   * @param params - Query parameters (period)
   * @returns - Order status distribution data
   */
  async getOrderStatusDistribution(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/order-status-distribution?${queryString}` : 'dashboard/order-status-distribution';
    return apiRequest(endpoint);
  },

  /**
   * Get customer analytics
   * @param params - Query parameters (period)
   * @returns - Customer analytics data
   */
  async getCustomerAnalytics(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `dashboard/customer-analytics?${queryString}` : 'dashboard/customer-analytics';
    return apiRequest(endpoint);
  },

  /**
   * Get inventory alerts
   * @returns - Inventory alerts data
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
   * @param params - Query parameters
   * @returns - Products data
   */
  async getProducts(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/products?${queryString}` : 'admin/products';
    return apiRequest(endpoint);
  },

  /**
   * Get product by ID
   * @param productId - Product ID
   * @returns - Product data
   */
  async getProduct(productId: string) {
    return apiRequest(`admin/products/${productId}`);
  },

  /**
   * Update product status
   * @param productId - Product ID
   * @param status - New status
   * @param notes - Optional notes
   * @returns - Update response
   */
  async updateProductStatus(productId: string, status: string, notes = '') {
    return apiRequest(`admin/products/${productId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  },

  /**
   * Bulk update products
   * @param productIds - Array of product IDs
   * @param updates - Update data
   * @returns - Update response
   */
  async bulkUpdateProducts(productIds: string[], updates: Record<string, unknown>) {
    return apiRequest('admin/products/bulk-update', {
      method: 'PUT',
      body: JSON.stringify({ product_ids: productIds, updates }),
    });
  },

  /**
   * Bulk delete products
   * @param productIds - Array of product IDs
   * @returns - Delete response
   */
  async bulkDeleteProducts(productIds: string[]) {
    return apiRequest('admin/products/bulk-delete', {
      method: 'DELETE',
      body: JSON.stringify({ product_ids: productIds }),
    });
  },

  /**
   * Get product statistics
   * @returns - Product statistics
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
   * @param params - Query parameters
   * @returns - Customers data
   */
  async getCustomers(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/customers?${queryString}` : 'admin/customers';
    return apiRequest(endpoint);
  },

  /**
   * Get customer by ID with detailed profile
   * @param customerId - Customer ID
   * @returns - Customer profile data
   */
  async getCustomer(customerId: string) {
    return apiRequest(`admin/customers/${customerId}`);
  },

  /**
   * Get customer analytics and segmentation
   * @returns - Customer analytics data
   */
  async getCustomerAnalytics() {
    return apiRequest('admin/customers/analytics');
  },

  /**
   * Update customer status
   * @param customerId - Customer ID
   * @param status - New status (active, inactive, suspended)
   * @param reason - Reason for status change
   * @returns - Update response
   */
  async updateCustomerStatus(customerId: string, status: string, reason = '') {
    return apiRequest(`admin/customers/${customerId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason }),
    });
  },

  /**
   * Add customer service note
   * @param customerId - Customer ID
   * @param note - Note content
   * @param type - Note type (support, billing, general)
   * @returns - Add note response
   */
  async addCustomerNote(customerId: string, note: string, type = 'general') {
    return apiRequest(`admin/customers/${customerId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note, type }),
    });
  },

  /**
   * Get customer notes and activity history
   * @param customerId - Customer ID
   * @returns - Customer notes data
   */
  async getCustomerNotes(customerId: string) {
    return apiRequest(`admin/customers/${customerId}/notes`);
  },
};

/**
 * Admin order management API calls
 */
export const adminOrders = {
  /**
   * Get all orders with pagination and filters
   * @param params - Query parameters
   * @returns - Orders data
   */
  async getOrders(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/orders?${queryString}` : 'admin/orders';
    return apiRequest(endpoint);
  },

  /**
   * Get order by ID
   * @param orderId - Order ID
   * @returns - Order data
   */
  async getOrder(orderId: string) {
    return apiRequest(`admin/orders/${orderId}`);
  },

  /**
   * Update order status
   * @param orderId - Order ID
   * @param status - New status
   * @param notes - Optional notes
   * @returns - Update response
   */
  async updateOrderStatus(orderId: string, status: string, notes = '') {
    return apiRequest(`admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  },

  /**
   * Process refund for an order
   * @param orderId - Order ID
   * @param amount - Refund amount (optional, full refund if not specified)
   * @param reason - Refund reason
   * @param reasonNotes - Additional notes
   * @returns - Refund response
   */
  async processRefund(orderId: string, amount: number | undefined, reason: string, reasonNotes = '') {
    return apiRequest(`admin/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason, reasonNotes }),
    });
  },

  /**
   * Generate shipping label and update tracking
   * @param orderId - Order ID
   * @param shippingData - Shipping configuration
   * @returns - Shipping response
   */
  async generateShippingLabel(orderId: string, shippingData: Record<string, unknown> = {}) {
    return apiRequest(`admin/orders/${orderId}/shipping`, {
      method: 'POST',
      body: JSON.stringify(shippingData),
    });
  },

  /**
   * Bulk update order statuses
   * @param orderIds - Array of order IDs
   * @param status - New status
   * @param notes - Optional notes
   * @returns - Update response
   */
  async bulkUpdateOrders(orderIds: string[], status: string, notes = '') {
    return apiRequest('admin/orders/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ orderIds, status, notes }),
    });
  },

  /**
   * Get order analytics for dashboard
   * @param params - Query parameters (period)
   * @returns - Order analytics data
   */
  async getOrderAnalytics(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/orders/analytics/dashboard?${queryString}` : 'admin/orders/analytics/dashboard';
    return apiRequest(endpoint);
  },
};

/**
 * Utility function to handle API errors in components
 * @param error - Error object
 * @returns - User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Use the message from the API response
    return error.message;
  }
  
  // Fallback for other types of errors
  return (error instanceof Error && error.message) || 'An unexpected error occurred';
}

/**
 * Utility function to check if error is authentication related
 * @param error - Error object
 * @returns - True if auth error
 */
export function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * Admin settings API calls
 */
export const adminSettings = {
  /**
   * Get all system settings
   * @param params - Query parameters
   * @returns - Settings data
   */
  async getSettings(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/settings?${queryString}` : 'admin/settings';
    return apiRequest(endpoint);
  },

  /**
   * Get specific setting by key
   * @param key - Setting key
   * @returns - Setting data
   */
  async getSetting(key: string) {
    return apiRequest(`admin/settings/${key}`);
  },

  /**
   * Update or create setting
   * @param key - Setting key
   * @param data - Setting data
   * @returns - Update response
   */
  async updateSetting(key: string, data: Record<string, unknown>) {
    return apiRequest(`admin/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Bulk update settings
   * @param settings - Array of setting objects
   * @returns - Update response
   */
  async bulkUpdateSettings(settings: Array<Record<string, unknown>>) {
    return apiRequest('admin/settings/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    });
  },

  /**
   * Delete setting
   * @param key - Setting key
   * @returns - Delete response
   */
  async deleteSetting(key: string) {
    return apiRequest(`admin/settings/${key}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get setting categories
   * @returns - Categories data
   */
  async getCategories() {
    return apiRequest('admin/settings/categories/list');
  },
};

/**
 * Admin email templates API calls
 */
export const adminEmailTemplates = {
  /**
   * Get all email templates
   * @param params - Query parameters
   * @returns - Templates data
   */
  async getTemplates(params: Params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/email-templates?${queryString}` : 'admin/email-templates';
    return apiRequest(endpoint);
  },

  /**
   * Get specific template by ID
   * @param id - Template ID
   * @returns - Template data
   */
  async getTemplate(id: string) {
    return apiRequest(`admin/email-templates/${id}`);
  },

  /**
   * Create new template
   * @param templateData - Template data
   * @returns - Creation response
   */
  async createTemplate(templateData: Record<string, unknown>) {
    return apiRequest('admin/email-templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });
  },

  /**
   * Update template
   * @param id - Template ID
   * @param templateData - Template data
   * @returns - Update response
   */
  async updateTemplate(id: string, templateData: Record<string, unknown>) {
    return apiRequest(`admin/email-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(templateData),
    });
  },

  /**
   * Delete template
   * @param id - Template ID
   * @returns - Delete response
   */
  async deleteTemplate(id: string) {
    return apiRequest(`admin/email-templates/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Send test email
   * @param id - Template ID
   * @param testEmail - Test email address
   * @param testData - Test data
   * @returns - Test response
   */
  async sendTestEmail(id: string, testEmail: string, testData: Record<string, unknown> = {}) {
    return apiRequest(`admin/email-templates/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ testEmail, testData }),
    });
  },
};

const api = {
  apiRequest,
  adminAuth,
  adminUsers,
  adminDashboard,
  adminProducts,
  adminCustomers,
  adminOrders,
  adminSettings,
  adminEmailTemplates,
  getErrorMessage,
  isAuthError,
};

export default api;
