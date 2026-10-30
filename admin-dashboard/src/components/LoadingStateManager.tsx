'use client';

import type { ReactNode } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import LoadingSpinner from './LoadingSpinner';

// Global loading overlay for critical operations
export function GlobalLoadingOverlay() {
  const { isLoading } = useAdmin();
  
  // Show overlay if any critical section is loading
  const criticalSections = ['dashboard', 'auth', 'navigation'];
  const isCriticalLoading = criticalSections.some(section => isLoading[section]);
  
  if (!isCriticalLoading) return null;
  
  return (
    <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center space-y-4">
        <LoadingSpinner size="xlarge" color="blue" />
        <p className="text-gray-700 font-medium">Loading admin dashboard...</p>
        <p className="text-sm text-gray-500">Please wait while we prepare your workspace</p>
      </div>
    </div>
  );
}

// Section-specific loading indicator
export function SectionLoadingIndicator({ section, children, fallback = null }: { section: string; children: ReactNode; fallback?: ReactNode }) {
  const { isLoading } = useAdmin();
  
  if (isLoading[section]) {
    return fallback || (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="large" color="blue" text={`Loading ${section}...`} />
      </div>
    );
  }
  
  return children;
}

// Inline loading state for buttons and small components
export function InlineLoadingState({ loading, children, loadingText = 'Loading...' }: { loading: boolean; children: ReactNode; loadingText?: string }) {
  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <LoadingSpinner size="small" color="gray" />
        <span className="text-sm text-gray-600">{loadingText}</span>
      </div>
    );
  }
  
  return children;
}

// Loading wrapper for async operations
export function AsyncLoadingWrapper({ 
  loading, 
  error, 
  children, 
  loadingComponent = null,
  errorComponent = null,
  onRetry = null 
}: {
  loading: boolean;
  error?: string | null;
  children: ReactNode;
  loadingComponent?: ReactNode;
  errorComponent?: ReactNode;
  onRetry?: (() => void) | null;
}) {
  if (loading) {
    return loadingComponent || (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" color="blue" text="Loading..." />
      </div>
    );
  }
  
  if (error) {
    return errorComponent || (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Something went wrong</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="admin-button admin-button-primary"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }
  
  return children;
}

// Page-level loading state
export function PageLoadingState({ title = 'Loading', subtitle = 'Please wait...' }: { title?: string; subtitle?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="xlarge" color="blue" className="mb-6" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-600">{subtitle}</p>
      </div>
    </div>
  );
}

const LoadingStateManager = {
  GlobalLoadingOverlay,
  SectionLoadingIndicator,
  InlineLoadingState,
  AsyncLoadingWrapper,
  PageLoadingState
};

export default LoadingStateManager;
