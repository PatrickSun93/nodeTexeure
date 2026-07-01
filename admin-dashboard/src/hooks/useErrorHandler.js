'use client';

import { useCallback } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { getErrorMessage } from '@/lib/api';

export function useErrorHandler() {
  const { setError, clearError, showError, showWarning } = useAdmin();

  const handleError = useCallback((error, section = 'general', options = {}) => {
    const {
      showNotification = true,
      logToConsole = true,
      customMessage = null
    } = options;

    const errorMessage = customMessage || getErrorMessage(error);

    // Log to console in development
    if (logToConsole && process.env.NODE_ENV === 'development') {
      console.error(`Error in ${section}:`, error);
    }

    // Set error in state
    setError(section, errorMessage);

    // Show notification if requested
    if (showNotification) {
      showError(errorMessage);
    }

    return errorMessage;
  }, [setError, showError]);

  const handleApiError = useCallback(async (apiCall, section = 'api', options = {}) => {
    try {
      clearError(section);
      const result = await apiCall();
      return result;
    } catch (error) {
      handleError(error, section, options);
      throw error;
    }
  }, [clearError, handleError]);

  const handleAsyncOperation = useCallback(async (
    operation, 
    section = 'operation',
    options = {}
  ) => {
    const {
      loadingMessage = 'Processing...',
      successMessage = 'Operation completed successfully',
      showSuccess = true,
      showLoading = true
    } = options;

    try {
      clearError(section);
      
      if (showLoading) {
        // Could integrate with loading state here
      }

      const result = await operation();

      if (showSuccess && successMessage) {
        // Could show success notification here
      }

      return result;
    } catch (error) {
      handleError(error, section, options);
      throw error;
    }
  }, [clearError, handleError]);

  const validateAndHandle = useCallback((validation, section = 'validation') => {
    if (validation.isValid) {
      clearError(section);
      return true;
    }

    const errorMessage = validation.errors?.join(', ') || 'Validation failed';
    setError(section, errorMessage);
    showWarning(errorMessage);
    return false;
  }, [clearError, setError, showWarning]);

  const clearSectionError = useCallback((section) => {
    clearError(section);
  }, [clearError]);

  return {
    handleError,
    handleApiError,
    handleAsyncOperation,
    validateAndHandle,
    clearError: clearSectionError
  };
}

// Validation utilities
export function createValidator(rules) {
  return (data) => {
    const errors = [];

    for (const [field, fieldRules] of Object.entries(rules)) {
      const value = data[field];

      for (const rule of fieldRules) {
        if (rule.required && (!value || value.toString().trim() === '')) {
          errors.push(`${rule.label || field} is required`);
          continue;
        }

        if (value && rule.minLength && value.toString().length < rule.minLength) {
          errors.push(`${rule.label || field} must be at least ${rule.minLength} characters`);
        }

        if (value && rule.maxLength && value.toString().length > rule.maxLength) {
          errors.push(`${rule.label || field} must be no more than ${rule.maxLength} characters`);
        }

        if (value && rule.pattern && !rule.pattern.test(value.toString())) {
          errors.push(rule.message || `${rule.label || field} format is invalid`);
        }

        if (value && rule.custom && !rule.custom(value)) {
          errors.push(rule.message || `${rule.label || field} is invalid`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };
}

// Common validation rules
export const validationRules = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Please enter a valid email address'
  },
  
  phone: {
    pattern: /^\+?[\d\s\-\(\)]+$/,
    message: 'Please enter a valid phone number'
  },
  
  url: {
    pattern: /^https?:\/\/.+/,
    message: 'Please enter a valid URL starting with http:// or https://'
  },
  
  price: {
    pattern: /^\d+(\.\d{1,2})?$/,
    message: 'Please enter a valid price (e.g., 10.99)'
  },
  
  positiveInteger: {
    pattern: /^\d+$/,
    custom: (value) => parseInt(value) > 0,
    message: 'Please enter a positive number'
  }
};

export default useErrorHandler;