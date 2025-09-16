'use client';

import { useEffect, useState } from 'react';

/**
 * Service Worker Registration Component
 * Handles PWA functionality and offline capabilities
 */
export default function ServiceWorkerRegistration() {
  const [registration, setRegistration] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Check if service workers are supported
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      registerServiceWorker();
    }

    // Set up online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      setRegistration(reg);
      console.log('Service Worker registered successfully:', reg);

      // Check for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        }
      });

      // Handle controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  const handleUpdate = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  const handleDismissUpdate = () => {
    setUpdateAvailable(false);
  };

  // Show update notification
  if (updateAvailable) {
    return (
      <div className="sw-update-notification">
        <div className="sw-update-content">
          <div className="sw-update-text">
            <h4>New version available!</h4>
            <p>A new version of the app is ready. Refresh to get the latest features.</p>
          </div>
          <div className="sw-update-actions">
            <button onClick={handleUpdate} className="sw-update-button primary">
              Update
            </button>
            <button onClick={handleDismissUpdate} className="sw-update-button secondary">
              Later
            </button>
          </div>
        </div>

        <style jsx>{`
          .sw-update-notification {
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            max-width: 400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            animation: slideUp 0.3s ease-out;
          }

          .sw-update-content {
            padding: 1.5rem;
          }

          .sw-update-text h4 {
            margin: 0 0 0.5rem 0;
            font-size: 1.125rem;
            font-weight: 600;
            color: #1f2937;
          }

          .sw-update-text p {
            margin: 0 0 1rem 0;
            color: #6b7280;
            font-size: 0.875rem;
            line-height: 1.4;
          }

          .sw-update-actions {
            display: flex;
            gap: 0.75rem;
          }

          .sw-update-button {
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 500;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
          }

          .sw-update-button.primary {
            background-color: #000;
            color: white;
          }

          .sw-update-button.primary:hover {
            background-color: #374151;
          }

          .sw-update-button.secondary {
            background-color: #f9fafb;
            color: #374151;
            border: 1px solid #d1d5db;
          }

          .sw-update-button.secondary:hover {
            background-color: #f3f4f6;
          }

          @keyframes slideUp {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          @media (max-width: 640px) {
            .sw-update-notification {
              left: 10px;
              right: 10px;
              bottom: 10px;
            }

            .sw-update-actions {
              flex-direction: column;
            }

            .sw-update-button {
              width: 100%;
            }
          }
        `}</style>
      </div>
    );
  }

  // Show offline indicator
  if (!isOnline) {
    return (
      <div className="sw-offline-indicator">
        <div className="sw-offline-content">
          <svg className="sw-offline-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728" />
          </svg>
          <span>You&apos;re offline</span>
        </div>

        <style jsx>{`
          .sw-offline-indicator {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #fef2f2;
            color: #991b1b;
            padding: 0.75rem 1.5rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 500;
            z-index: 1000;
            animation: slideDown 0.3s ease-out;
            border: 1px solid #fecaca;
          }

          .sw-offline-content {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .sw-offline-icon {
            width: 16px;
            height: 16px;
          }

          @keyframes slideDown {
            from {
              transform: translateX(-50%) translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateX(-50%) translateY(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  return null;
}