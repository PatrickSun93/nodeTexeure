'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navigation from './Navigation';
import ErrorBoundary from './ErrorBoundary';
import LoadingSpinner from './LoadingSpinner';

// Breadcrumb Component
function Breadcrumb({ pathname }) {
  const pathSegments = pathname.split('/').filter(Boolean);
  
  const breadcrumbItems = [
    { name: 'Dashboard', href: '/' }
  ];

  let currentPath = '';
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const name = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
    breadcrumbItems.push({
      name,
      href: currentPath,
      isLast: index === pathSegments.length - 1
    });
  });

  if (breadcrumbItems.length === 1) return null;

  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
      {breadcrumbItems.map((item, index) => (
        <div key={item.href} className="flex items-center">
          {index > 0 && <span className="mx-2">/</span>}
          {item.isLast ? (
            <span className="text-gray-900 font-medium">{item.name}</span>
          ) : (
            <a 
              href={item.href} 
              className="hover:text-gray-700 transition-colors"
            >
              {item.name}
            </a>
          )}
        </div>
      ))}
    </nav>
  );
}

// Page Header Component
function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center space-x-3">
          {actions}
        </div>
      )}
    </div>
  );
}

// Main Admin Layout Component
export default function AdminLayout({ 
  children, 
  title, 
  subtitle, 
  actions,
  showBreadcrumb = true,
  className = ''
}) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  // Handle authentication
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Handle route changes
  useEffect(() => {
    const handleRouteChangeStart = () => setPageLoading(true);
    const handleRouteChangeComplete = () => setPageLoading(false);

    // Note: Next.js App Router doesn't have built-in route change events
    // This is a placeholder for potential future implementation
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Show loading spinner during authentication check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Don't show layout on login page
  if (pathname === '/login') {
    return children;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar Navigation */}
        <Navigation 
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header Bar */}
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {title && (
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
                    {subtitle && (
                      <p className="text-sm text-gray-600">{subtitle}</p>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Quick Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Refresh page"
                  >
                    🔄
                  </button>
                  
                  {/* Notifications (placeholder) */}
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors relative"
                    title="Notifications"
                  >
                    🔔
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                  </button>
                </div>

                {/* User Menu */}
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{user?.role || 'Admin'}</p>
                  </div>
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {user?.firstName?.charAt(0) || 'A'}
                  </div>
                </div>

                {/* Custom Actions */}
                {actions && (
                  <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className={`admin-container py-6 ${className}`}>
              {/* Breadcrumb Navigation */}
              {showBreadcrumb && <Breadcrumb pathname={pathname} />}

              {/* Page Loading Overlay */}
              {pageLoading && (
                <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
                  <LoadingSpinner size="large" />
                </div>
              )}

              {/* Page Content */}
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// Higher-order component for pages that need admin layout
export function withAdminLayout(Component, layoutProps = {}) {
  return function WrappedComponent(props) {
    return (
      <AdminLayout {...layoutProps}>
        <Component {...props} />
      </AdminLayout>
    );
  };
}