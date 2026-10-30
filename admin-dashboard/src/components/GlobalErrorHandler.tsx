'use client';

import { useEffect } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/contexts/AuthContext';
import { isAuthError } from '@/lib/api';

export default function GlobalErrorHandler() {
  const { showError, showWarning } = useAdmin();
  const { logout } = useAuth();

  useEffect(() => {
    // Global error handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      // Check if it's an authentication error
      if (isAuthError(event.reason)) {
        showWarning('Your session has expired. Please log in again.');
        logout();
        return;
      }
      
      // Show generic error for other unhandled rejections
      showError('An unexpected error occurred. Please try again.');
    };

    // Global error handler for JavaScript errors
    const handleError = (event: ErrorEvent) => {
      console.error('Global JavaScript error:', event.error);
      
      // Don't show notifications for every JS error in production
      if (process.env.NODE_ENV === 'development') {
        showError(`JavaScript Error: ${event.error?.message || 'Unknown error'}`);
      }
    };

    // Network error handler
    const handleOnline = () => {
      showWarning('Connection restored');
    };

    const handleOffline = () => {
      showError('You are currently offline. Some features may not work properly.');
    };

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showError, showWarning, logout]);

  // This component doesn't render anything
  return null;
}