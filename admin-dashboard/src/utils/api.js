// API base URL - using the same backend as the main app
const API_BASE_URL = 'http://localhost:6666';

// CSRF token management
let csrfToken = null;

// Function to get CSRF token
async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  
  try {
    const response = await fetch(`${API_BASE_URL}/csrf-token`, {
      credentials: 'include'
    });
    const data = await response.json();
    csrfToken = data.csrf_token;
    return csrfToken;
  } catch (error) {
    console.error('Failed to get CSRF token:', error);
    return null;
  }
}

// Helper functions inspired by main frontend
function extractResponseData(response) {
  if (response && typeof response === 'object') {
    // If response has a data property, extract it
    if ('data' in response) {
      return response.data;
    }
    // If response has success and data properties
    if ('success' in response && 'data' in response) {
      return response.data;
    }
  }
  return response;
}

function isSuccessResponse(response) {
  if (response && typeof response === 'object') {
    // Check for explicit success property
    if ('success' in response) {
      return response.success === true;
    }
    // If no success property, assume success if we have data
    return true;
  }
  return false;
}

// Enhanced fetch function with authentication and CSRF protection
export async function apiFetch(endpoint, options = {}) {
  // Ensure we have a CSRF token for state-changing operations
  if (!csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase())) {
    await getCsrfToken();
  }

  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase()) && {
        'X-CSRF-Token': csrfToken
      }),
      ...options.headers
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, mergedOptions);
    
    if (!response.ok) {
      // Try to get error message from response
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // If we can't parse error response, use default message
      }
      throw new Error(errorMessage);
    }

    // Handle different content types
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const jsonResponse = await response.json();
      return extractResponseData(jsonResponse);
    }
    
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Generic API request function similar to main frontend
export async function apiRequest(endpoint, options = {}) {
  return apiFetch(endpoint, options);
}

// Specific API modules similar to main frontend structure
export const adminAPI = {
  // Authentication
  login: (credentials) => apiFetch('/api/users/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  }),
  
  logout: () => apiFetch('/api/admin/logout', {
    method: 'POST'
  }),
  
  // Dashboard data
  getDashboardStats: () => apiFetch('/api/admin/dashboard/stats'),
  
  // Users management
  getUsers: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiFetch(`/api/admin/users${queryString ? `?${queryString}` : ''}`);
  },
  
  // Products management
  getProducts: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiFetch(`/api/admin/products${queryString ? `?${queryString}` : ''}`);
  },
  
  getProduct: (id) => apiFetch(`/api/products/${id}`),
  
  createProduct: (data) => apiFetch('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  updateProduct: (id, data) => apiFetch(`/api/admin/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  
  deleteProduct: (id) => apiFetch(`/api/admin/products/${id}`, {
    method: 'DELETE'
  }),
  
  getProduct: (id) => apiFetch(`/api/products/${id}`),
  
  createProduct: (data) => apiFetch('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  updateProduct: (id, data) => apiFetch(`/api/admin/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  
  deleteProduct: (id) => apiFetch(`/api/admin/products/${id}`, {
    method: 'DELETE'
  }),
  
  // Images
  getProductImages: (productId) => apiFetch(`/api/images/products/${productId}`),
  
  setPrimaryImage: (productId, imageId) => apiFetch(`/api/images/products/${productId}/primary/${imageId}`, {
    method: 'PUT'
  }),
  
  deleteImages: (imageIds) => apiFetch('/api/images/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ imageIds })
  }),
  
  updateImageAltText: (imageId, altText) => apiFetch(`/api/images/${imageId}/alt-text`, {
    method: 'PUT',
    body: JSON.stringify({ alt_text: altText })
  }),
  
  updateImageOrder: (productId, imageOrders) => apiFetch(`/api/images/products/${productId}/order`, {
    method: 'PUT',
    body: JSON.stringify({ imageOrders })
  }),
  
  uploadProductImage: (productId, formData) => apiFetch(`/api/images/products/${productId}/upload`, {
    method: 'POST',
    body: formData // FormData doesn't need JSON.stringify
  }),

  // Analytics
  getAbandonedCartAnalytics: (days = 30) => apiFetch(`/api/abandoned-cart/analytics?days=${days}`),
  triggerAbandonedCartDetection: () => apiFetch('/api/abandoned-cart/detect', { method: 'POST' }),
  cleanupAbandonedCarts: () => apiFetch('/api/abandoned-cart/cleanup', { method: 'POST' }),

  // Order management
  getOrders: (params = {}) => {
    const queryParams = new URLSearchParams(params);
    return apiFetch(`/api/admin/orders?${queryParams}`);
  },
  getOrder: (orderId) => apiFetch(`/api/admin/orders/${orderId}`),
  updateOrderStatus: (orderId, status, notes = '') => apiFetch(`/api/admin/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, notes })
  }),
  refundOrder: (orderId, amount, reason = '') => apiFetch(`/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amount, reason })
  }),
  cancelOrder: (orderId, reason = '') => apiFetch(`/api/admin/orders/${orderId}/cancel`, {
    method: 'PUT',
    body: JSON.stringify({ reason })
  }),

  // FedEx shipping
  createFedExShipment: (orderId, serviceType) => apiFetch('/api/shipping/fedex/create-shipment', {
    method: 'POST',
    body: JSON.stringify({ orderId, serviceType })
  }),
  validateFedExCredentials: () => apiFetch('/api/fedex/validate-credentials', { method: 'POST' }),

  // Coupon management
  getCoupons: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiFetch(`/api/coupons${queryString ? `?${queryString}` : ''}`);
  },
  createCoupon: (data) => apiFetch('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateCoupon: (id, data) => apiFetch(`/api/coupons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteCoupon: (id) => apiFetch(`/api/coupons/${id}`, { method: 'DELETE' }),

  // Bulk product operations
  bulkUpdateProducts: (productIds, updates) => apiFetch('/api/admin/products/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ productIds, updates })
  }),

  bulkDeleteProducts: (productIds) => apiFetch('/api/admin/products/bulk-delete', {
    method: 'DELETE',
    body: JSON.stringify({ productIds })
  }),

  // Product approval operations
  getPendingApprovalProducts: () => apiFetch('/api/admin/products/pending-approval'),
  getProductApprovalHistory: (productId) => apiFetch(`/api/admin/products/${productId}/approval-history`),
  approveProduct: (productId, notes = '') => apiFetch(`/api/admin/products/${productId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ notes })
  }),
  rejectProduct: (productId, rejectionReason, notes = '') => apiFetch(`/api/admin/products/${productId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ rejection_reason: rejectionReason, notes })
  }),

  // Inventory management
  getInventory: () => apiFetch('/api/admin/inventory'),
  getLowStockItems: () => apiFetch('/api/inventory/low-stock'),
  updateInventory: (inventoryId, updates) => apiFetch(`/api/inventory/${inventoryId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  }),
  releaseExpiredReservations: () => apiFetch('/api/inventory/release-expired', { method: 'POST' }),

  // User management
  createUser: (userData) => apiFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  updateUser: (userId, updates) => apiFetch(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  }),
  deleteUser: (userId) => apiFetch(`/api/admin/users/${userId}`, {
    method: 'DELETE'
  }),

  // Analytics
  getAnalyticsDashboard: (period = 30) => apiFetch(`/api/admin/analytics/dashboard?period=${period}`)
};

// Export helper functions
export { extractResponseData, isSuccessResponse };