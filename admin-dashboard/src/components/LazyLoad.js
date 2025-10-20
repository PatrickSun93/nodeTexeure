'use client';

import { lazy, Suspense } from 'react';
import LoadingSpinner from './LoadingSpinner';

// Higher-order component for lazy loading
export function withLazyLoading(importFunc, fallback = null) {
  const LazyComponent = lazy(importFunc);
  
  return function LazyLoadedComponent(props) {
    return (
      <Suspense fallback={fallback || <LoadingSpinner size="large" text="Loading..." />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Lazy load wrapper component
export default function LazyLoad({ 
  children, 
  fallback = <LoadingSpinner size="medium" />,
  delay = 0 
}) {
  return (
    <Suspense fallback={fallback}>
      {delay > 0 ? (
        <DelayedComponent delay={delay}>
          {children}
        </DelayedComponent>
      ) : (
        children
      )}
    </Suspense>
  );
}

// Component with artificial delay (for testing)
function DelayedComponent({ children, delay }) {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  if (!show) {
    return <LoadingSpinner size="medium" />;
  }
  
  return children;
}

// Lazy loaded admin components
export const LazyDashboard = withLazyLoading(
  () => import('../app/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Dashboard..." />
  </div>
);

export const LazyProductList = withLazyLoading(
  () => import('../app/products/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Products..." />
  </div>
);

export const LazyOrderList = withLazyLoading(
  () => import('../app/orders/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Orders..." />
  </div>
);

export const LazyCustomerList = withLazyLoading(
  () => import('../app/customers/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Customers..." />
  </div>
);

export const LazyInventoryDashboard = withLazyLoading(
  () => import('../app/inventory/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Inventory..." />
  </div>
);

export const LazyReports = withLazyLoading(
  () => import('../app/reports/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Reports..." />
  </div>
);

export const LazySettings = withLazyLoading(
  () => import('../app/settings/page'),
  <div className="admin-card">
    <LoadingSpinner size="large" text="Loading Settings..." />
  </div>
);

export const LazyCharts = {
  LineChart: withLazyLoading(
    () => import('../components/charts/LineChart'),
    <div className="h-64 flex items-center justify-center">
      <LoadingSpinner size="medium" text="Loading Chart..." />
    </div>
  ),
  
  PieChart: withLazyLoading(
    () => import('../components/charts/PieChart'),
    <div className="h-64 flex items-center justify-center">
      <LoadingSpinner size="medium" text="Loading Chart..." />
    </div>
  ),
  
  BarChart: withLazyLoading(
    () => import('../components/charts/BarChart'),
    <div className="h-64 flex items-center justify-center">
      <LoadingSpinner size="medium" text="Loading Chart..." />
    </div>
  )
};