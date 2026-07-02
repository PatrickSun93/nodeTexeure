'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/contexts/AdminContext';

export default function SessionManager() {
  const t = useTranslations('SessionManager');
  const { isAuthenticated, checkAuthStatus, logout } = useAuth();
  const { showWarning, showError, updateSettings, settings } = useAdmin();
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const sessionCheckIntervalRef = useRef(null);
  const inactivityWarningRef = useRef(null);

  // Session timeout settings (in milliseconds)
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  const WARNING_TIME = 5 * 60 * 1000; // 5 minutes before timeout
  const CHECK_INTERVAL = 60 * 1000; // Check every minute

  // Update last activity time
  const updateActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // Check session validity
  const checkSession = async () => {
    try {
      await checkAuthStatus();
    } catch (error) {
      console.error('Session check failed:', error);
      showError(t('validationFailed'));
      await logout();
      router.push('/login?session=expired');
    }
  };

  // Handle session timeout warning
  const showTimeoutWarning = () => {
    if (inactivityWarningRef.current) return; // Already showing warning
    
    inactivityWarningRef.current = showWarning(
      t('expiryWarning'),
      0 // Don't auto-dismiss
    );
  };

  // Handle session timeout
  const handleTimeout = async () => {
    showError(t('expired'));
    await logout();
    router.push('/login?session=timeout');
  };

  // Clear inactivity warning
  const clearInactivityWarning = () => {
    if (inactivityWarningRef.current) {
      // Remove the warning notification
      inactivityWarningRef.current = null;
    }
  };

  // Check for inactivity
  const checkInactivity = () => {
    if (!isAuthenticated) return;

    const now = Date.now();
    const timeSinceActivity = now - lastActivityRef.current;

    if (timeSinceActivity >= SESSION_TIMEOUT) {
      handleTimeout();
    } else if (timeSinceActivity >= SESSION_TIMEOUT - WARNING_TIME) {
      showTimeoutWarning();
    } else {
      clearInactivityWarning();
    }
  };

  // Activity event listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    const handleActivity = () => {
      updateActivity();
      clearInactivityWarning();
    };

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
    };
  }, [isAuthenticated]);

  // Session monitoring
  useEffect(() => {
    if (!isAuthenticated) {
      // Clear any existing intervals
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      return;
    }

    // Check session validity periodically
    sessionCheckIntervalRef.current = setInterval(() => {
      checkSession();
      checkInactivity();
    }, CHECK_INTERVAL);

    // Initial activity timestamp
    updateActivity();

    // Cleanup
    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
    };
  }, [isAuthenticated]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        // Page became visible, check session
        checkSession();
        updateActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  // Handle browser tab/window close
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      // Save any pending data or state before the user leaves
      if (settings.autoSave) {
        // Trigger any auto-save functionality
        localStorage.setItem('adminLastActivity', lastActivityRef.current.toString());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [settings.autoSave]);

  // Restore session state on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && isAuthenticated) {
      const lastActivity = localStorage.getItem('adminLastActivity');
      if (lastActivity) {
        const lastActivityTime = parseInt(lastActivity);
        const now = Date.now();
        
        // If last activity was more than session timeout ago, force logout
        if (now - lastActivityTime > SESSION_TIMEOUT) {
          handleTimeout();
        } else {
          lastActivityRef.current = lastActivityTime;
        }
      }
    }
  }, [isAuthenticated]);

  // This component doesn't render anything
  return null;
}