'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * Enhanced Error Handling Hook
 * Provides comprehensive error handling with retry logic and user-friendly messages
 */
export const useErrorHandler = () => {
  const [errors, setErrors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const retryCountRef = useRef(new Map());

  /**
   * Handle API errors with enhanced error processing
   */
  const handleError = useCallback(async (error, context = {}) => {
    console.error('Error occurred:', error, context);

    // Get enhanced error information from backend
    let enhancedError;
    try {
      const response = await fetch('/api/errors/recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errorType: error.type || 'unknown',
          errorMessage: error.message,
          context
        })
      });

      if (response.ok) {
        const result = await response.json();
        enhancedError = {
          ...error,
          userMessage: result.keyValueTable?.userMessage || error.message,
          recoverySuggestions: result.keyValueTable?.recoveryActions || [],
          retryAllowed: result.keyValueTable?.retryRecommended !== false
        };
      } else {
        enhancedError = error;
      }
    } catch (recoveryError) {
      console.error('Failed to get error recovery info:', recoveryError);
      enhancedError = error;
    }

    // Add error to state
    const errorId = Date.now() + Math.random();
    const errorWithId = {
      ...enhancedError,
      id: errorId,
      timestamp: new Date().toISOString(),
      context
    };

    setErrors(prev => [...prev, errorWithId]);

    return errorId;
  }, []);

  /**
   * Execute operation with error handling and retry logic
   */
  const executeWithErrorHandling = useCallback(async (
    operation,
    options = {}
  ) => {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      context = {},
      onSuccess,
      onError,
      showErrorNotification = true
    } = options;

    const operationId = context.operationId || 'unknown';
    const currentRetryCount = retryCountRef.current.get(operationId) || 0;

    setIsLoading(true);

    try {
      const result = await operation();
      
      // Reset retry count on success
      retryCountRef.current.delete(operationId);
      
      if (onSuccess) {
        onSuccess(result);
      }

      return { success: true, data: result };
    } catch (error) {
      const newRetryCount = currentRetryCount + 1;
      retryCountRef.current.set(operationId, newRetryCount);

      // Determine if error is retryable
      const isRetryable = isErrorRetryable(error) && newRetryCount <= maxRetries;

      if (isRetryable) {
        // Schedule retry
        setTimeout(() => {
          executeWithErrorHandling(operation, {
            ...options,
            context: { ...context, retryAttempt: newRetryCount }
          });
        }, retryDelay * Math.pow(2, newRetryCount - 1)); // Exponential backoff

        return { 
          success: false, 
          error, 
          retrying: true, 
          retryAttempt: newRetryCount 
        };
      } else {
        // Max retries reached or non-retryable error
        if (showErrorNotification) {
          await handleError(error, { ...context, retryAttempt: newRetryCount });
        }

        if (onError) {
          onError(error);
        }

        return { success: false, error, retrying: false };
      }
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  /**
   * Retry a specific operation
   */
  const retryOperation = useCallback(async (errorId, operation) => {
    const error = errors.find(e => e.id === errorId);
    if (!error) return;

    // Remove the error from display
    dismissError(errorId);

    // Execute the operation again
    return await executeWithErrorHandling(operation, {
      context: { ...error.context, isRetry: true }
    });
  }, [errors, executeWithErrorHandling]);

  /**
   * Dismiss a specific error
   */
  const dismissError = useCallback((errorId) => {
    setErrors(prev => prev.filter(error => error.id !== errorId));
  }, []);

  /**
   * Clear all errors
   */
  const clearAllErrors = useCallback(() => {
    setErrors([]);
    retryCountRef.current.clear();
  }, []);

  /**
   * Handle form submission with error handling
   */
  const handleFormSubmit = useCallback(async (
    submitFunction,
    formData,
    options = {}
  ) => {
    const {
      validationSchema,
      onSuccess,
      onError,
      context = {}
    } = options;

    try {
      // Client-side validation
      if (validationSchema) {
        const validationResult = await validationSchema.validate(formData, {
          abortEarly: false
        });
        if (!validationResult.success) {
          const validationError = new Error('Validation failed');
          validationError.type = 'validation_error';
          validationError.errors = validationResult.errors;
          throw validationError;
        }
      }

      return await executeWithErrorHandling(
        () => submitFunction(formData),
        {
          context: { ...context, operation: 'form_submit' },
          onSuccess,
          onError
        }
      );
    } catch (error) {
      return await executeWithErrorHandling(
        () => Promise.reject(error),
        {
          context: { ...context, operation: 'form_validation' },
          onError
        }
      );
    }
  }, [executeWithErrorHandling]);

  /**
   * Handle API calls with automatic error handling
   */
  const apiCall = useCallback(async (
    url,
    options = {},
    errorHandlingOptions = {}
  ) => {
    const operation = async () => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.type = errorData.type || 'api_error';
        error.details = errorData.keyValueTable;
        throw error;
      }

      return await response.json();
    };

    return await executeWithErrorHandling(operation, {
      context: { operation: 'api_call', url, method: options.method || 'GET' },
      ...errorHandlingOptions
    });
  }, [executeWithErrorHandling]);

  return {
    errors,
    isLoading,
    handleError,
    executeWithErrorHandling,
    retryOperation,
    dismissError,
    clearAllErrors,
    handleFormSubmit,
    apiCall
  };
};

/**
 * Determine if an error is retryable
 */
const isErrorRetryable = (error) => {
  // Network errors are generally retryable
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }

  // HTTP status codes that are retryable
  if (error.status) {
    return error.status >= 500 || error.status === 429;
  }

  // Specific error types that are retryable
  const retryableTypes = [
    'network_error',
    'timeout_error',
    'server_error',
    'rate_limit_error',
    'circuit_breaker_open'
  ];

  return retryableTypes.includes(error.type);
};

/**
 * Hook for handling async operations with loading states
 */
export const useAsyncOperation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const { handleError } = useErrorHandler();

  const execute = useCallback(async (operation, options = {}) => {
    const { onSuccess, onError, showErrorNotification = true } = options;

    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      setData(result);
      
      if (onSuccess) {
        onSuccess(result);
      }

      return { success: true, data: result };
    } catch (err) {
      setError(err);
      
      if (showErrorNotification) {
        await handleError(err, options.context);
      }

      if (onError) {
        onError(err);
      }

      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    isLoading,
    error,
    data,
    execute,
    reset
  };
};

export default useErrorHandler;