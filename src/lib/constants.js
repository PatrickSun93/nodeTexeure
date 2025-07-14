/**
 * Application constants and configuration values
 * These can be reused across multiple components and pages
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: '/api',
  BACKEND_PORT: 6666,
  TIMEOUT: 10000, // 10 seconds
  RETRY_ATTEMPTS: 3,
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// API Endpoints
export const API_ENDPOINTS = {
  // Status endpoints
  HEALTH: '/status/health',
  HEALTH_LEGACY: '/health',
  HELLO: '/status/hello',
  HELLO_LEGACY: '/hello',
  
  // User endpoints
  USERS: '/users',
  USER_BY_ID: (id) => `/users/${id}`,
};

// UI Messages
export const MESSAGES = {
  SUCCESS: {
    USER_CREATED: 'User created successfully!',
    USER_UPDATED: 'User updated successfully!',
    USER_DELETED: 'User deleted successfully!',
    COPIED_TO_CLIPBOARD: 'Copied to clipboard!',
  },
  ERROR: {
    BACKEND_UNAVAILABLE: 'Backend not available - Make sure backend server is running on port 6666',
    FILL_ALL_FIELDS: 'Please fill in all fields',
    INVALID_EMAIL: 'Please enter a valid email address',
    USER_CREATE_FAILED: 'Error creating user - Make sure backend is running',
    USER_UPDATE_FAILED: 'Error updating user - Make sure backend is running',
    USER_DELETE_FAILED: 'Error deleting user - Make sure backend is running',
    USER_FETCH_FAILED: 'Error fetching users - Make sure backend is running',
    HELLO_API_FAILED: 'Error testing hello API - Make sure backend is running',
    UNEXPECTED_ERROR: 'An unexpected error occurred',
  },
  CONFIRMATION: {
    DELETE_USER: 'Are you sure you want to delete this user?',
    CLEAR_FORM: 'Are you sure you want to clear the form?',
  },
  LOADING: {
    CHECKING: 'checking...',
    CREATING: 'Creating...',
    UPDATING: 'Updating...',
    DELETING: 'Deleting...',
    LOADING: 'Loading...',
  },
};

// CSS Classes for consistent styling
export const CSS_CLASSES = {
  BUTTON: {
    PRIMARY: 'bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors',
    SECONDARY: 'bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors',
    SUCCESS: 'bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors',
    DANGER: 'bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors',
    DISABLED: 'bg-blue-300 text-white font-medium py-2 px-4 rounded-lg cursor-not-allowed',
  },
  INPUT: {
    DEFAULT: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    ERROR: 'w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent',
  },
  CARD: {
    DEFAULT: 'bg-white rounded-lg shadow-md p-6',
    HOVER: 'bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow',
  },
  MESSAGE: {
    SUCCESS: 'p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg',
    ERROR: 'p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg',
    INFO: 'p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg',
    WARNING: 'p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-lg',
  },
  STATUS: {
    CONNECTED: 'text-green-600',
    DISCONNECTED: 'text-red-600',
    CHECKING: 'text-yellow-600',
  },
};

// Form validation rules
export const VALIDATION_RULES = {
  USER: {
    NAME: {
      MIN_LENGTH: 2,
      MAX_LENGTH: 50,
      REQUIRED: true,
    },
    EMAIL: {
      MAX_LENGTH: 100,
      REQUIRED: true,
      PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
  },
};

// Local storage keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_preferences',
  THEME: 'theme',
  LANGUAGE: 'language',
  LAST_VISITED: 'last_visited',
};

// HTTP Methods
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
};

// Environment configuration
export const ENV_CONFIG = {
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',
};

// Debounce delays (in milliseconds)
export const DEBOUNCE_DELAYS = {
  SEARCH: 300,
  INPUT: 500,
  RESIZE: 250,
  SCROLL: 100,
};

// Default pagination settings
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE: 1,
};