/**
 * Main export file for the shared utilities library
 * This allows for clean imports across the application
 */

// API utilities
export {
  API_BASE_URL,
  apiRequest,
  checkBackendHealth,
  testHelloAPI,
  userAPI,
  databaseAPI,
} from './api';

// Utility functions
export {
  confirmAction,
  formatErrorMessage,
  isValidEmail,
  validateRequiredFields,
  validateUserData,
  debounce,
  formatDate,
  generateId,
  copyToClipboard,
  storage,
} from './utils';

// Constants
export {
  API_CONFIG,
  HTTP_STATUS,
  API_ENDPOINTS,
  MESSAGES,
  CSS_CLASSES,
  VALIDATION_RULES,
  STORAGE_KEYS,
  HTTP_METHODS,
  ENV_CONFIG,
  DEBOUNCE_DELAYS,
  PAGINATION,
} from './constants';

// Custom hooks
export {
  useBackendHealth,
  useUsers,
  useForm,
  useMessage,
  useDebounce,
  useHelloAPI,
  useLocalStorage,
  useDatabaseStatus,
  useDatabaseTables,
  useTransnoData,
  useCartCount, // added
} from './hooks';