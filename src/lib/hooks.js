/**
 * Custom React hooks for reusable functionality
 * These hooks can be used across multiple components and pages
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { userAPI, checkBackendHealth, testHelloAPI, databaseAPI, apiRequest, extractResponseData } from './api';
import { formatErrorMessage, debounce } from './utils';
import { MESSAGES } from './constants';

/**
 * Hook for managing backend health status
 * @returns {object} - Health status, loading state, and check function
 */
export const useBackendHealth = () => {
  const [status, setStatus] = useState('checking...');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await checkBackendHealth();
      setStatus(`✅ Connected - ${data.message}`);
      setIsConnected(true);
    } catch (error) {
      setStatus(`❌ ${formatErrorMessage(error)}`);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return {
    status,
    isConnected,
    loading,
    checkHealth,
  };
};

/**
 * Hook for managing users data and operations
 * @returns {object} - Users data, loading states, and CRUD functions
 */
export const useUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userData = await userAPI.getAll();
      setUsers(userData);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (userData) => {
    setLoading(true);
    setError(null);
    try {
      await userAPI.create(userData);
      await fetchUsers(); // Refresh the list
      return { success: true, message: MESSAGES.SUCCESS.USER_CREATED };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [fetchUsers]);

  const updateUser = useCallback(async (userId, userData) => {
    setLoading(true);
    setError(null);
    try {
      await userAPI.update(userId, userData);
      await fetchUsers(); // Refresh the list
      return { success: true, message: MESSAGES.SUCCESS.USER_UPDATED };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [fetchUsers]);

  const deleteUser = useCallback(async (userId) => {
    setLoading(true);
    setError(null);
    try {
      await userAPI.delete(userId);
      await fetchUsers(); // Refresh the list
      return { success: true, message: MESSAGES.SUCCESS.USER_DELETED };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [fetchUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
  };
};

/**
 * Hook for managing form state with validation
 * @param {object} initialValues - Initial form values
 * @param {Function} validationFn - Validation function
 * @returns {object} - Form state and handlers
 */
export const useForm = (initialValues = {}, validationFn = null) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  }, [errors]);

  const setFieldTouched = useCallback((name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
  }, []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setValue(name, value);
  }, [setValue]);

  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setFieldTouched(name);
  }, [setFieldTouched]);

  const validate = useCallback(() => {
    if (!validationFn) return { isValid: true, errors: {} };
    
    const validation = validationFn(values);
    setErrors(validation.errors || {});
    return validation;
  }, [values, validationFn]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const handleSubmit = useCallback(async (onSubmit) => {
    setIsSubmitting(true);
    
    const validation = validate();
    if (!validation.isValid) {
      setIsSubmitting(false);
      return { success: false, errors: validation.errors };
    }

    try {
      const result = await onSubmit(values);
      return result;
    } catch (error) {
      return { success: false, message: formatErrorMessage(error) };
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setValue,
    setFieldTouched,
    handleChange,
    handleBlur,
    validate,
    reset,
    handleSubmit,
  };
};

/**
 * Hook for managing API messages and notifications
 * @returns {object} - Message state and functions
 */
export const useMessage = () => {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'success', 'error', 'info', 'warning'
  const timeoutRef = useRef(null);

  const showMessage = useCallback((text, type = 'info', duration = 5000) => {
    setMessage(text);
    setMessageType(type);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Auto-hide message after duration
    if (duration > 0) {
      timeoutRef.current = setTimeout(() => {
        setMessage('');
      }, duration);
    }
  }, []);

  const hideMessage = useCallback(() => {
    setMessage('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const showSuccess = useCallback((text, duration) => {
    showMessage(text, 'success', duration);
  }, [showMessage]);

  const showError = useCallback((text, duration) => {
    showMessage(text, 'error', duration);
  }, [showMessage]);

  const showInfo = useCallback((text, duration) => {
    showMessage(text, 'info', duration);
  }, [showMessage]);

  const showWarning = useCallback((text, duration) => {
    showMessage(text, 'warning', duration);
  }, [showMessage]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    message,
    messageType,
    showMessage,
    hideMessage,
    showSuccess,
    showError,
    showInfo,
    showWarning,
  };
};

/**
 * Hook for debounced values
 * @param {*} value - Value to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {*} - Debounced value
 */
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Hook for testing Hello API
 * @returns {object} - Test function and loading state
 */
export const useHelloAPI = () => {
  const [loading, setLoading] = useState(false);

  const testHello = useCallback(async () => {
    setLoading(true);
    try {
      const data = await testHelloAPI();
      return { success: true, message: `Hello API Response: ${data.message}` };
    } catch (error) {
      return { success: false, message: formatErrorMessage(error) };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    testHello,
    loading,
  };
};

/**
 * Hook for local storage with JSON serialization
 * @param {string} key - Storage key
 * @param {*} initialValue - Initial value
 * @returns {Array} - [value, setValue] tuple
 */
export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
};

/**
 * Hook for managing database status
 * Updated to use backend/routes/databaseRoutes.js endpoints
 * @returns {object} - Database status, loading state, and check function
 */
export const useDatabaseStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkDatabaseStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await databaseAPI.testConnection();
      setStatus(data);
      return { success: true, data };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkDatabaseStatus();
  }, [checkDatabaseStatus]);

  return {
    status,
    loading,
    error,
    checkDatabaseStatus,
    // Alias for backward compatibility
    testConnection: checkDatabaseStatus,
  };
};

/**
 * Hook for managing database table information
 * Updated to use backend/routes/databaseRoutes.js endpoints
 * @returns {object} - Table data, loading state, and fetch function
 */
export const useDatabaseTables = () => {
  const [tableInfo, setTableInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTableInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await databaseAPI.getTableCount();
      setTableInfo(data);
      return { success: true, data };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    tableInfo,
    loading,
    error,
    fetchTableInfo,
  };
};

/**
 * Hook for managing transno table data
 * Updated to use backend/routes/databaseRoutes.js endpoints
 * @returns {object} - Transno data, loading state, and fetch function
 */
export const useTransnoData = () => {
  const [transnoData, setTransnoData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTransnoData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await databaseAPI.getTransnoData();
      setTransnoData(data);
      return { success: true, data };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    transnoData,
    loading,
    error,
    fetchTransnoData,
  };
};

/**
 * Hook for executing custom database queries
 * Uses backend/routes/databaseRoutes.js POST /api/database/query endpoint
 * @returns {object} - Query execution function, loading state, and result
 */
export const useDatabaseQuery = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const executeQuery = useCallback(async (query, params = []) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await databaseAPI.executeQuery(query, params);
      setResult(data);
      return { success: true, data };
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    executeQuery,
    clearResult,
  };
};

/**
 * Hook to provide the cart item count (sum of quantities)
 * - Fetches /api/cart
 * - Sums item.quantity
 * - Listens for 'cart:updated' to refresh automatically
 */
export const useCartCount = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCartCount = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiRequest('/cart', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const { data } = extractResponseData(resp);
      const items = Array.isArray(data?.items) ? data.items : [];
      const total = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
      setCount(total);
    } catch (err) {
      console.error('Failed to fetch cart:', err);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCartCount();
    const handler = () => fetchCartCount();
    if (typeof window !== 'undefined') {
      window.addEventListener('cart:updated', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('cart:updated', handler);
      }
    };
  }, [fetchCartCount]);

  return { count, loading, refresh: fetchCartCount };
};