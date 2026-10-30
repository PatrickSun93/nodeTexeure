'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function OfflinePage() {
  const t = useTranslations('Offline');
  const [isOnline, setIsOnline] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Redirect to dashboard when back online
      setTimeout(() => {
        router.push('/');
      }, 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [router]);

  const retryConnection = () => {
    // Force a network request to check connectivity
    fetch('/api/health', { cache: 'no-cache' })
      .then(() => {
        setIsOnline(true);
        router.push('/');
      })
      .catch(() => {
        setIsOnline(false);
      });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Offline Icon */}
        <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
          <span className="text-2xl">📡</span>
        </div>

        {/* Status Message */}
        {isOnline ? (
          <div>
            <h1 className="text-2xl font-bold text-green-600 mb-4">
              {t('connectionRestored')}
            </h1>
            <p className="text-gray-600 mb-6">
              {t('backOnline')}
            </p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {t('youreOffline')}
            </h1>
            <p className="text-gray-600 mb-6">
              {t('offlineDescription')}
            </p>

            {/* Retry Button */}
            <button
              onClick={retryConnection}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors mb-4"
            >
              {t('tryAgain')}
            </button>

            {/* Available Offline Features */}
            <div className="text-left bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">{t('availableOffline')}</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• {t('cachedDashboardData')}</li>
                <li>• {t('browsePreviousPages')}</li>
                <li>• {t('cachedReports')}</li>
                <li>• {t('offlineDocumentation')}</li>
              </ul>
            </div>

            {/* Tips */}
            <div className="text-left bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">{t('tips')}</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• {t('checkConnection')}</li>
                <li>• {t('refreshPage')}</li>
                <li>• {t('contactSupport')}</li>
              </ul>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-center space-x-4 text-sm">
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              {t('dashboard')}
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => window.location.reload()}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              {t('refresh')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}