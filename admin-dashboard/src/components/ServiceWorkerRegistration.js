'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';

// Service Worker Registration Component
export default function ServiceWorkerRegistration({ 
  enabled = process.env.NODE_ENV === 'production',
  swPath = '/sw.js',
  onUpdate,
  onOffline,
  onOnline
}) {
  const [registration, setRegistration] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const { showNotification, showSuccess, showWarning } = useAdmin();

  // Register service worker
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register(swPath, {
          scope: '/',
          updateViaCache: 'none'
        });

        setRegistration(reg);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
                showNotification('A new version is available!', 'info');
                
                if (onUpdate) {
                  onUpdate(newWorker);
                }
              }
            });
          }
        });

        // Listen for controlling service worker changes
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });

        console.log('Service Worker registered successfully');
        showSuccess('App is ready for offline use');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        showWarning('Offline functionality not available');
      }
    };

    registerSW();
  }, [enabled, swPath, onUpdate, showNotification, showSuccess, showWarning]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('Connection restored');
      if (onOnline) onOnline();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showWarning('You are offline. Some features may not be available.');
      if (onOffline) onOffline();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial state
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onOnline, onOffline, showSuccess, showWarning]);

  // Update service worker
  const updateServiceWorker = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
    }
  };

  // Unregister service worker
  const unregisterServiceWorker = async () => {
    if (registration) {
      const success = await registration.unregister();
      if (success) {
        showSuccess('Service Worker unregistered');
        setRegistration(null);
      }
    }
  };

  // Cache specific URLs
  const cacheUrls = (urls) => {
    if (registration && registration.active) {
      registration.active.postMessage({
        type: 'CACHE_URLS',
        urls
      });
    }
  };

  // Clear cache
  const clearCache = (cacheName = null) => {
    if (registration && registration.active) {
      registration.active.postMessage({
        type: 'CLEAR_CACHE',
        cacheName
      });
    }
  };

  return (
    <>
      {/* Update Available Banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white p-3 z-50">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center">
              <span className="mr-2">🔄</span>
              <span>A new version of the admin dashboard is available!</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={updateServiceWorker}
                className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                Update Now
              </button>
              <button
                onClick={() => setUpdateAvailable(false)}
                className="text-white hover:text-gray-200 transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Indicator */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div className="flex items-center">
            <span className="mr-2">📡</span>
            <span className="text-sm font-medium">You are offline</span>
          </div>
        </div>
      )}
    </>
  );
}

// Hook for service worker functionality
export function useServiceWorker() {
  const [registration, setRegistration] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(setRegistration);
      setIsOnline(navigator.onLine);
    }
  }, []);

  const cacheUrls = (urls) => {
    if (registration && registration.active) {
      registration.active.postMessage({
        type: 'CACHE_URLS',
        urls
      });
    }
  };

  const clearCache = (cacheName = null) => {
    if (registration && registration.active) {
      registration.active.postMessage({
        type: 'CLEAR_CACHE',
        cacheName
      });
    }
  };

  const updateApp = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  return {
    registration,
    isOnline,
    updateAvailable,
    cacheUrls,
    clearCache,
    updateApp
  };
}