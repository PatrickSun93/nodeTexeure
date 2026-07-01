'use client';

import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Check initial status
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    if (navigator.onLine) {
      window.location.reload();
    }
  };

  return (
    <div className="aesop-page">
      <Header />
      <main className="offline-page">
        <div className="offline-container">
          <div className="offline-content">
            {/* Offline Icon */}
            <div className="offline-icon">
              <svg
                className="w-24 h-24 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M18.364 5.636l-12.728 12.728m0 0L12 12m-6.364 6.364L12 12m6.364-6.364L12 12"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            </div>

            {/* Status Message */}
            <h1 className="offline-title">
              {isOnline ? 'Connection Restored!' : 'You&apos;re Offline'}
            </h1>
            
            <p className="offline-description">
              {isOnline 
                ? 'Your internet connection has been restored. You can now browse normally.'
                : 'It looks like you&apos;re not connected to the internet. Some features may not be available.'
              }
            </p>

            {/* Connection Status */}
            <div className={`offline-status ${isOnline ? 'online' : 'offline'}`}>
              <div className="status-indicator">
                <div className={`status-dot ${isOnline ? 'online' : 'offline'}`}></div>
                <span className="status-text">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="offline-actions">
              <button
                onClick={handleRetry}
                className={`offline-button ${isOnline ? 'primary' : 'secondary'}`}
                disabled={!isOnline}
              >
                {isOnline ? 'Reload Page' : 'Retry Connection'}
              </button>
              
              <button
                onClick={() => window.history.back()}
                className="offline-button secondary"
              >
                Go Back
              </button>
            </div>

            {/* Offline Features */}
            {!isOnline && (
              <div className="offline-features">
                <h3 className="features-title">What you can still do:</h3>
                <ul className="features-list">
                  <li>
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Browse previously visited pages
                  </li>
                  <li>
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    View cached product information
                  </li>
                  <li>
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Access your cart (items will sync when online)
                  </li>
                </ul>
              </div>
            )}

            {/* Tips */}
            <div className="offline-tips">
              <h4 className="tips-title">Tips:</h4>
              <ul className="tips-list">
                <li>Check your internet connection</li>
                <li>Try refreshing the page</li>
                <li>Make sure you're connected to Wi-Fi or mobile data</li>
                <li>Contact support if the problem persists</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .offline-page {
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
        }

        .offline-container {
          max-width: 600px;
          width: 100%;
          text-align: center;
        }

        .offline-content {
          background: white;
          border-radius: 12px;
          padding: 3rem 2rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .offline-icon {
          margin-bottom: 2rem;
          display: flex;
          justify-content: center;
        }

        .offline-title {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 1rem;
        }

        .offline-description {
          font-size: 1.125rem;
          color: #6b7280;
          margin-bottom: 2rem;
          line-height: 1.6;
        }

        .offline-status {
          margin-bottom: 2rem;
        }

        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 9999px;
          font-weight: 500;
        }

        .offline-status.online .status-indicator {
          background-color: #dcfce7;
          color: #166534;
        }

        .offline-status.offline .status-indicator {
          background-color: #fef2f2;
          color: #991b1b;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.online {
          background-color: #22c55e;
        }

        .status-dot.offline {
          background-color: #ef4444;
        }

        .offline-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .offline-button {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
        }

        .offline-button.primary {
          background-color: #000;
          color: white;
        }

        .offline-button.primary:hover:not(:disabled) {
          background-color: #374151;
        }

        .offline-button.secondary {
          background-color: #f9fafb;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .offline-button.secondary:hover {
          background-color: #f3f4f6;
        }

        .offline-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .offline-features {
          text-align: left;
          margin-bottom: 2rem;
          padding: 1.5rem;
          background-color: #f9fafb;
          border-radius: 8px;
        }

        .features-title {
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 1rem;
        }

        .features-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .features-list li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
          color: #4b5563;
        }

        .offline-tips {
          text-align: left;
          padding: 1.5rem;
          background-color: #fffbeb;
          border-radius: 8px;
          border-left: 4px solid #f59e0b;
        }

        .tips-title {
          font-weight: 600;
          color: #92400e;
          margin-bottom: 0.75rem;
        }

        .tips-list {
          list-style: disc;
          padding-left: 1.5rem;
          margin: 0;
          color: #78350f;
        }

        .tips-list li {
          margin-bottom: 0.25rem;
        }

        @media (max-width: 640px) {
          .offline-content {
            padding: 2rem 1rem;
          }

          .offline-title {
            font-size: 1.5rem;
          }

          .offline-actions {
            flex-direction: column;
            align-items: center;
          }

          .offline-button {
            width: 100%;
            max-width: 200px;
          }
        }
      `}</style>
    </div>
  );
}