'use client';

import { useEffect, useState } from 'react';
import { usePerformance, useWebVitals, useResourcePerformance } from '@/hooks/usePerformance';
import { useAdmin } from '@/contexts/AdminContext';

// Performance Monitor Component
export default function PerformanceMonitor({ 
  enabled = process.env.NODE_ENV === 'development',
  showWidget = false,
  reportInterval = 30000 // 30 seconds
}) {
  const [performanceData, setPerformanceData] = useState({});
  const [isVisible, setIsVisible] = useState(showWidget);
  const { showWarning } = useAdmin();

  // Web Vitals monitoring
  const vitals = useWebVitals((name, metric) => {
    // Report poor Core Web Vitals
    if (name === 'CLS' && metric.value > 0.1) {
      showWarning(`Poor Cumulative Layout Shift: ${metric.value.toFixed(3)}`);
    }
    if (name === 'FID' && metric.value > 100) {
      showWarning(`Poor First Input Delay: ${metric.value.toFixed(0)}ms`);
    }
    if (name === 'LCP' && metric.value > 2500) {
      showWarning(`Poor Largest Contentful Paint: ${metric.value.toFixed(0)}ms`);
    }
  });

  // Resource performance monitoring
  const { resources, getTotalSize, getSlowResources } = useResourcePerformance();

  // Component performance monitoring
  const { metrics } = usePerformance('PerformanceMonitor', {
    onMetricsUpdate: (newMetrics) => {
      setPerformanceData(prev => ({
        ...prev,
        component: newMetrics
      }));
    }
  });

  // Collect and report performance data
  useEffect(() => {
    if (!enabled) return;

    const collectPerformanceData = () => {
      const data = {
        timestamp: Date.now(),
        vitals,
        resources: {
          total: resources.length,
          totalSize: getTotalSize(),
          slowResources: getSlowResources().length
        },
        memory: getMemoryInfo(),
        navigation: getNavigationTiming(),
        component: metrics
      };

      setPerformanceData(data);

      // Report to analytics service (placeholder)
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'performance_report', {
          custom_map: {
            lcp: vitals.LCP,
            fid: vitals.FID,
            cls: vitals.CLS
          }
        });
      }
    };

    // Initial collection
    collectPerformanceData();

    // Set up interval reporting
    const interval = setInterval(collectPerformanceData, reportInterval);

    return () => clearInterval(interval);
  }, [enabled, vitals, resources, metrics, reportInterval, getTotalSize, getSlowResources]);

  // Get memory information
  const getMemoryInfo = () => {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = performance.memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  };

  // Get navigation timing
  const getNavigationTiming = () => {
    if (typeof window !== 'undefined' && 'navigation' in performance) {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        return {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadComplete: nav.loadEventEnd - nav.loadEventStart,
          domInteractive: nav.domInteractive - nav.navigationStart,
          firstPaint: getFirstPaint()
        };
      }
    }
    return null;
  };

  // Get First Paint timing
  const getFirstPaint = () => {
    if (typeof window !== 'undefined') {
      const paintEntries = performance.getEntriesByType('paint');
      const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
      return firstPaint ? firstPaint.startTime : null;
    }
    return null;
  };

  // Performance widget component
  const PerformanceWidget = () => (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-sm z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Performance</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-2 text-xs">
        {/* Core Web Vitals */}
        <div>
          <div className="font-medium text-gray-700 mb-1">Core Web Vitals</div>
          <div className="grid grid-cols-3 gap-2">
            <div className={`p-1 rounded text-center ${getVitalColor('LCP', vitals.LCP)}`}>
              <div className="font-medium">LCP</div>
              <div>{vitals.LCP ? `${vitals.LCP.toFixed(0)}ms` : '-'}</div>
            </div>
            <div className={`p-1 rounded text-center ${getVitalColor('FID', vitals.FID)}`}>
              <div className="font-medium">FID</div>
              <div>{vitals.FID ? `${vitals.FID.toFixed(0)}ms` : '-'}</div>
            </div>
            <div className={`p-1 rounded text-center ${getVitalColor('CLS', vitals.CLS)}`}>
              <div className="font-medium">CLS</div>
              <div>{vitals.CLS ? vitals.CLS.toFixed(3) : '-'}</div>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        {performanceData.memory && (
          <div>
            <div className="font-medium text-gray-700 mb-1">Memory</div>
            <div className="text-gray-600">
              {performanceData.memory.used}MB / {performanceData.memory.total}MB
            </div>
          </div>
        )}

        {/* Resources */}
        <div>
          <div className="font-medium text-gray-700 mb-1">Resources</div>
          <div className="text-gray-600">
            {performanceData.resources?.total || 0} loaded
            {performanceData.resources?.slowResources > 0 && (
              <span className="text-red-600 ml-1">
                ({performanceData.resources.slowResources} slow)
              </span>
            )}
          </div>
        </div>

        {/* Component Performance */}
        {performanceData.component && (
          <div>
            <div className="font-medium text-gray-700 mb-1">Render Time</div>
            <div className="text-gray-600">
              {performanceData.component.renderTime?.toFixed(1)}ms
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Get color class for vital scores
  const getVitalColor = (vital, value) => {
    if (!value) return 'bg-gray-100 text-gray-600';
    
    const thresholds = {
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      CLS: { good: 0.1, poor: 0.25 }
    };

    const threshold = thresholds[vital];
    if (value <= threshold.good) return 'bg-green-100 text-green-800';
    if (value <= threshold.poor) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (!enabled) return null;

  return (
    <>
      {/* Performance Widget */}
      {isVisible && <PerformanceWidget />}
      
      {/* Toggle Button */}
      {!isVisible && (
        <button
          onClick={() => setIsVisible(true)}
          className="fixed bottom-4 right-4 bg-blue-600 text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors z-50"
          title="Show Performance Monitor"
        >
          📊
        </button>
      )}
    </>
  );
}

// Performance Report Component
export function PerformanceReport({ data }) {
  if (!data) return null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Performance Report</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Core Web Vitals */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Core Web Vitals</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>LCP:</span>
              <span className={data.vitals?.LCP > 2500 ? 'text-red-600' : 'text-green-600'}>
                {data.vitals?.LCP ? `${data.vitals.LCP.toFixed(0)}ms` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>FID:</span>
              <span className={data.vitals?.FID > 100 ? 'text-red-600' : 'text-green-600'}>
                {data.vitals?.FID ? `${data.vitals.FID.toFixed(0)}ms` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CLS:</span>
              <span className={data.vitals?.CLS > 0.1 ? 'text-red-600' : 'text-green-600'}>
                {data.vitals?.CLS ? data.vitals.CLS.toFixed(3) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        {data.memory && (
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Memory Usage</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Used:</span>
                <span>{data.memory.used}MB</span>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <span>{data.memory.total}MB</span>
              </div>
              <div className="flex justify-between">
                <span>Limit:</span>
                <span>{data.memory.limit}MB</span>
              </div>
            </div>
          </div>
        )}

        {/* Resources */}
        {data.resources && (
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Resources</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total:</span>
                <span>{data.resources.total}</span>
              </div>
              <div className="flex justify-between">
                <span>Size:</span>
                <span>{Math.round(data.resources.totalSize / 1024)}KB</span>
              </div>
              <div className="flex justify-between">
                <span>Slow:</span>
                <span className={data.resources.slowResources > 0 ? 'text-red-600' : 'text-green-600'}>
                  {data.resources.slowResources}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}