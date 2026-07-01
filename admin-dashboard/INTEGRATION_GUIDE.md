# Admin Dashboard Integration Guide

## Overview

This document describes the comprehensive integration implemented for the admin dashboard, including global state management, consistent navigation, error handling, and loading states.

## Integration Components

### 1. Global State Management

#### AdminContext Integration
- **Location**: `src/contexts/AdminContext.js`
- **Purpose**: Centralized state management for all admin operations
- **Features**:
  - UI state (sidebar, theme, notifications)
  - Data caching (dashboard data, inventory alerts)
  - Loading states for all sections
  - Error states with section-specific tracking
  - User settings and preferences
  - Selected items for bulk operations

#### Key State Properties
```javascript
{
  // UI State
  sidebarCollapsed: boolean,
  theme: 'light' | 'dark',
  notifications: Array,
  
  // Data Cache
  dashboardData: Object,
  inventoryAlerts: Array,
  recentActivity: Array,
  
  // Loading States
  isLoading: {
    dashboard: boolean,
    products: boolean,
    orders: boolean,
    // ... other sections
  },
  
  // Error States
  errors: {
    [section]: string | null
  },
  
  // Settings
  settings: Object,
  
  // Filters and Selections
  filters: Object,
  selectedItems: Object
}
```

### 2. Navigation Integration

#### Consistent Navigation Hook
- **Location**: `src/hooks/useNavigation.js`
- **Purpose**: Centralized navigation with loading states and error handling
- **Features**:
  - Navigation with loading indicators
  - Error handling for navigation failures
  - Breadcrumb generation
  - Section detection
  - Quick navigation helpers

#### Navigation Features
```javascript
const {
  navigateTo,           // Navigate with loading/error handling
  goBack,              // Safe back navigation
  goToDashboard,       // Quick dashboard navigation
  goToProducts,        // Section-specific navigation
  isCurrentPath,       // Path checking
  getCurrentSection,   // Current section detection
  getBreadcrumbs      // Breadcrumb generation
} = useNavigation();
```

#### Enhanced Navigation Component
- **Location**: `src/components/Navigation.js`
- **Features**:
  - Alert badges for inventory and notifications
  - Integrated logout with success/error feedback
  - Responsive design with collapse state
  - Active state management
  - Hierarchical menu structure

### 3. Error Handling Integration

#### Global Error Handler
- **Location**: `src/components/GlobalErrorHandler.js`
- **Purpose**: Catch and handle unhandled errors globally
- **Features**:
  - Unhandled promise rejection handling
  - JavaScript error catching
  - Network status monitoring
  - Authentication error detection
  - Automatic session management

#### Error Handler Hook
- **Location**: `src/hooks/useErrorHandler.js`
- **Purpose**: Consistent error handling across components
- **Features**:
  - API error handling
  - Validation error handling
  - Async operation error handling
  - Section-specific error management

#### Error Handling Patterns
```javascript
const { handleError, handleApiError, validateAndHandle } = useErrorHandler();

// API Error Handling
try {
  const result = await handleApiError(
    () => adminDashboard.getOverview(),
    'dashboard'
  );
} catch (error) {
  // Error automatically handled and displayed
}

// Validation Error Handling
const isValid = validateAndHandle(
  validator(formData),
  'form-validation'
);
```

### 4. Loading State Management

#### Global Loading System
- **Location**: `src/components/LoadingStateManager.js`
- **Purpose**: Consistent loading states across the application
- **Components**:
  - `GlobalLoadingOverlay`: Critical operation loading
  - `SectionLoadingIndicator`: Section-specific loading
  - `AsyncLoadingWrapper`: Async operation wrapper
  - `InlineLoadingState`: Small component loading

#### Loading State Integration
```javascript
// Section Loading
<SectionLoadingIndicator section="dashboard">
  <DashboardContent />
</SectionLoadingIndicator>

// Async Wrapper
<AsyncLoadingWrapper
  loading={isLoading}
  error={error}
  onRetry={retryFunction}
>
  <DataComponent />
</AsyncLoadingWrapper>
```

### 5. Session Management

#### Session Manager
- **Location**: `src/components/SessionManager.js`
- **Purpose**: Comprehensive session management
- **Features**:
  - Activity tracking
  - Session timeout warnings
  - Automatic session validation
  - Inactivity detection
  - Page visibility handling
  - Session state persistence

#### Session Configuration
```javascript
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_TIME = 5 * 60 * 1000;     // 5 minutes before timeout
const CHECK_INTERVAL = 60 * 1000;       // Check every minute
```

### 6. Enhanced Layout Integration

#### AdminLayout Component
- **Location**: `src/components/AdminLayout.js`
- **Features**:
  - Integrated with AdminContext for state management
  - Global loading indicators
  - Error display integration
  - Notification count display
  - Responsive sidebar management
  - Breadcrumb integration

#### Layout Props
```javascript
<AdminLayout
  title="Page Title"
  subtitle="Page Subtitle"
  actions={<CustomActions />}
  showBreadcrumb={true}
  loading={isLoading}
  error={errorMessage}
>
  <PageContent />
</AdminLayout>
```

## Integration Testing

### Development Integration Test
- **Location**: `src/components/IntegrationTest.js`
- **Purpose**: Verify all integration components work together
- **Tests**:
  - Authentication context
  - Admin context functions
  - Navigation hook
  - Error handler
  - State management
  - Loading states
  - Notification system
  - Sidebar functionality

### Running Integration Tests
The integration test runs automatically in development mode and displays results in the bottom-left corner of the screen.

## Styling Integration

### Admin CSS Framework
- **Location**: `src/styles/admin.css`
- **Purpose**: Consistent styling across all admin components
- **Features**:
  - Component-specific classes
  - Responsive design utilities
  - Loading state styles
  - Form element styling
  - Button variants
  - Alert and notification styles

### CSS Class Patterns
```css
/* Component Classes */
.admin-card          /* Card containers */
.admin-button        /* Button base */
.admin-input         /* Form inputs */
.admin-table         /* Data tables */
.admin-badge         /* Status badges */
.admin-alert         /* Alert messages */

/* State Classes */
.admin-loading       /* Loading states */
.admin-error         /* Error states */
.admin-success       /* Success states */

/* Layout Classes */
.admin-container     /* Page containers */
.admin-nav-item      /* Navigation items */
.admin-breadcrumb    /* Breadcrumb navigation */
```

## Usage Examples

### 1. Creating a New Admin Page

```javascript
'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import AdminLayout from '@/components/AdminLayout';
import { AsyncLoadingWrapper } from '@/components/LoadingStateManager';

export default function MyAdminPage() {
  const { setLoading, showSuccess } = useAdmin();
  const { handleApiError } = useErrorHandler();
  const [data, setData] = useState(null);
  const [loading, setLocalLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLocalLoading(true);
      setLoading('mySection', true);
      
      const result = await handleApiError(
        () => myApi.getData(),
        'mySection'
      );
      
      setData(result.data);
      showSuccess('Data loaded successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setLocalLoading(false);
      setLoading('mySection', false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <AdminLayout
      title="My Admin Page"
      subtitle="Manage your data"
      loading={loading}
      error={error}
    >
      <AsyncLoadingWrapper
        loading={loading}
        error={error}
        onRetry={fetchData}
      >
        <div className="admin-card">
          {/* Your page content */}
        </div>
      </AsyncLoadingWrapper>
    </AdminLayout>
  );
}
```

### 2. Using Navigation Integration

```javascript
import useNavigation from '@/hooks/useNavigation';

function MyComponent() {
  const { navigateTo, goToProducts, isCurrentPath } = useNavigation();

  const handleNavigation = () => {
    navigateTo('/custom-path', {
      showLoading: true,
      successMessage: 'Navigation successful'
    });
  };

  return (
    <div>
      <button onClick={goToProducts}>Go to Products</button>
      <button onClick={handleNavigation}>Custom Navigation</button>
      {isCurrentPath('/products') && <span>Currently on products</span>}
    </div>
  );
}
```

### 3. Error Handling Integration

```javascript
import { useErrorHandler } from '@/hooks/useErrorHandler';

function MyFormComponent() {
  const { handleError, validateAndHandle } = useErrorHandler();

  const handleSubmit = async (formData) => {
    // Validate form
    const validation = validateForm(formData);
    if (!validateAndHandle(validation, 'form')) {
      return;
    }

    try {
      await submitData(formData);
    } catch (error) {
      handleError(error, 'form-submission', {
        customMessage: 'Failed to submit form'
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form content */}
    </form>
  );
}
```

## Best Practices

### 1. State Management
- Use AdminContext for global state
- Use local state for component-specific data
- Clear errors when appropriate
- Update loading states consistently

### 2. Navigation
- Use useNavigation hook for all navigation
- Provide loading feedback for navigation
- Handle navigation errors gracefully
- Use breadcrumbs for deep navigation

### 3. Error Handling
- Use section-specific error handling
- Provide retry mechanisms
- Show user-friendly error messages
- Log errors appropriately

### 4. Loading States
- Show loading indicators for async operations
- Use appropriate loading component for context
- Provide loading text when helpful
- Handle loading state cleanup

### 5. Styling
- Use admin CSS classes consistently
- Follow responsive design patterns
- Maintain accessibility standards
- Use semantic HTML structure

## Troubleshooting

### Common Issues

1. **Context Not Available**
   - Ensure component is wrapped in AdminProvider
   - Check import paths for context hooks

2. **Navigation Not Working**
   - Verify useNavigation hook is imported correctly
   - Check if component is within Next.js app structure

3. **Loading States Not Updating**
   - Ensure setLoading is called with correct section name
   - Check if loading state is being cleared properly

4. **Errors Not Displaying**
   - Verify error handler is set up correctly
   - Check if error section matches display logic

5. **Styles Not Applied**
   - Ensure admin.css is imported in globals.css
   - Check Tailwind CSS configuration
   - Verify class names are correct

### Debug Tools

1. **Integration Test Component**
   - Runs automatically in development
   - Shows status of all integration components
   - Provides quick verification of setup

2. **Browser DevTools**
   - Check React DevTools for context values
   - Monitor network requests for API calls
   - Check console for error messages

3. **Performance Monitor**
   - Enabled in development mode
   - Monitors component performance
   - Tracks render times and updates

## Conclusion

This integration provides a comprehensive foundation for the admin dashboard with:
- Centralized state management
- Consistent navigation patterns
- Robust error handling
- Comprehensive loading states
- Session management
- Responsive design
- Development tools

All components work together seamlessly to provide a professional, maintainable admin interface.