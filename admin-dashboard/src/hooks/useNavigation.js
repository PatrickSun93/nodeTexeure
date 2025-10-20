'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAdmin } from '@/contexts/AdminContext';

export function useNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { showSuccess, showError, setLoading } = useAdmin();

  // Navigate with loading state and error handling
  const navigateTo = async (path, options = {}) => {
    const { 
      showLoading = true, 
      successMessage = null,
      errorMessage = 'Navigation failed'
    } = options;

    try {
      if (showLoading) {
        setLoading('navigation', true);
      }

      // Use router.push for navigation
      router.push(path);

      if (successMessage) {
        showSuccess(successMessage);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      showError(errorMessage);
    } finally {
      if (showLoading) {
        setLoading('navigation', false);
      }
    }
  };

  // Navigate back with error handling
  const goBack = () => {
    try {
      router.back();
    } catch (error) {
      console.error('Navigation back error:', error);
      // Fallback to dashboard
      navigateTo('/');
    }
  };

  // Navigate to dashboard
  const goToDashboard = () => {
    navigateTo('/', { successMessage: 'Returned to dashboard' });
  };

  // Navigate to specific admin sections
  const goToProducts = () => {
    navigateTo('/products');
  };

  const goToOrders = () => {
    navigateTo('/orders');
  };

  const goToCustomers = () => {
    navigateTo('/customers');
  };

  const goToInventory = () => {
    navigateTo('/inventory');
  };

  const goToReports = () => {
    navigateTo('/reports');
  };

  const goToSettings = () => {
    navigateTo('/settings');
  };

  // Check if current path matches
  const isCurrentPath = (path) => {
    return pathname === path;
  };

  // Check if current path starts with
  const isInSection = (sectionPath) => {
    return pathname.startsWith(sectionPath);
  };

  // Get current section name
  const getCurrentSection = () => {
    const segments = pathname.split('/').filter(Boolean);
    return segments[0] || 'dashboard';
  };

  // Get breadcrumb items
  const getBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Dashboard', path: '/' }];

    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const name = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({
        name,
        path: currentPath,
        isLast: index === segments.length - 1
      });
    });

    return breadcrumbs;
  };

  // Navigation helpers for common patterns
  const openInNewTab = (path) => {
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  const refreshCurrentPage = () => {
    window.location.reload();
  };

  return {
    // Navigation functions
    navigateTo,
    goBack,
    goToDashboard,
    goToProducts,
    goToOrders,
    goToCustomers,
    goToInventory,
    goToReports,
    goToSettings,
    
    // Path checking
    isCurrentPath,
    isInSection,
    getCurrentSection,
    getBreadcrumbs,
    
    // Utilities
    openInNewTab,
    refreshCurrentPage,
    
    // Current state
    pathname,
    currentSection: getCurrentSection()
  };
}

export default useNavigation;