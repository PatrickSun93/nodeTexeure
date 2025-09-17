'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, RefreshCw, CheckCircle, Info } from 'lucide-react';

/**
 * Error Notification Component
 * Displays user-friendly error messages with recovery options
 */
const ErrorNotification = ({ 
  error, 
  onDismiss, 
  onRetry, 
  autoHide = false, 
  duration = 5000,
  position = 'top-right' 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (autoHide && duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [autoHide, duration]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      onDismiss?.();
    }, 300); // Wait for animation to complete
  };

  const handleRetry = async () => {
    if (onRetry) {
      setIsRetrying(true);
      try {
        await onRetry();
        handleDismiss();
      } catch (retryError) {
        console.error('Retry failed:', retryError);
      } finally {
        setIsRetrying(false);
      }
    }
  };

  const getErrorIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getErrorStyles = (type) => {
    const baseStyles = "border-l-4 p-4 rounded-r-md shadow-lg";
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-50 border-green-400`;
      case 'info':
        return `${baseStyles} bg-blue-50 border-blue-400`;
      case 'warning':
        return `${baseStyles} bg-yellow-50 border-yellow-400`;
      default:
        return `${baseStyles} bg-red-50 border-red-400`;
    }
  };

  const getPositionStyles = () => {
    const baseStyles = "fixed z-50 max-w-md w-full mx-4";
    
    switch (position) {
      case 'top-left':
        return `${baseStyles} top-4 left-4`;
      case 'top-center':
        return `${baseStyles} top-4 left-1/2 transform -translate-x-1/2`;
      case 'top-right':
        return `${baseStyles} top-4 right-4`;
      case 'bottom-left':
        return `${baseStyles} bottom-4 left-4`;
      case 'bottom-center':
        return `${baseStyles} bottom-4 left-1/2 transform -translate-x-1/2`;
      case 'bottom-right':
        return `${baseStyles} bottom-4 right-4`;
      default:
        return `${baseStyles} top-4 right-4`;
    }
  };

  if (!error || !isVisible) return null;

  const errorType = error.type || 'error';
  const userMessage = error.userMessage || error.message || 'An error occurred';
  const recoverySuggestions = error.recoverySuggestions || [];
  const canRetry = error.retryAllowed !== false && onRetry;

  return (
    <div 
      className={`${getPositionStyles()} transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className={getErrorStyles(errorType)}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getErrorIcon(errorType)}
          </div>
          
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-gray-900">
              {error.title || getDefaultTitle(errorType)}
            </h3>
            
            <p className="mt-1 text-sm text-gray-700">
              {userMessage}
            </p>

            {/* Recovery suggestions */}
            {recoverySuggestions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-800 mb-1">
                  What you can do:
                </p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {recoverySuggestions.slice(0, 3).map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="w-1 h-1 bg-gray-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex space-x-2">
              {canRetry && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRetrying ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Try Again
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={handleDismiss}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="ml-4 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="inline-flex text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const getDefaultTitle = (type) => {
  switch (type) {
    case 'success':
      return 'Success';
    case 'info':
      return 'Information';
    case 'warning':
      return 'Warning';
    default:
      return 'Error';
  }
};

/**
 * Hook for managing error notifications
 */
export const useErrorNotification = () => {
  const [errors, setErrors] = useState([]);

  const showError = (error) => {
    const errorId = Date.now() + Math.random();
    const errorWithId = { ...error, id: errorId };
    
    setErrors(prev => [...prev, errorWithId]);
    
    return errorId;
  };

  const dismissError = (errorId) => {
    setErrors(prev => prev.filter(error => error.id !== errorId));
  };

  const clearAllErrors = () => {
    setErrors([]);
  };

  return {
    errors,
    showError,
    dismissError,
    clearAllErrors
  };
};

/**
 * Error Notification Container
 * Renders all active error notifications
 */
export const ErrorNotificationContainer = ({ errors, onDismiss, onRetry }) => {
  return (
    <>
      {errors.map((error, index) => (
        <ErrorNotification
          key={error.id}
          error={error}
          onDismiss={() => onDismiss(error.id)}
          onRetry={error.retryFunction}
          position="top-right"
          style={{ top: `${4 + index * 80}px` }} // Stack notifications
        />
      ))}
    </>
  );
};

export default ErrorNotification;