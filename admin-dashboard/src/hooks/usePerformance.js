'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Performance monitoring hook
export function usePerformance(name, options = {}) {
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    renderTime: 0,
    interactionTime: 0,
    memoryUsage: 0
  });

  const startTimeRef = useRef(null);
  const renderStartRef = useRef(null);
  const {
    trackMemory = true,
    trackInteractions = true,
    onMetricsUpdate
  } = options;

  // Start performance measurement
  const startMeasurement = useCallback(() => {
    startTimeRef.current = performance.now();
    renderStartRef.current = performance.now();
  }, []);

  // End performance measurement
  const endMeasurement = useCallback(() => {
    if (!startTimeRef.current) return;

    const endTime = performance.now();
    const loadTime = endTime - startTimeRef.current;
    const renderTime = endTime - (renderStartRef.current || startTimeRef.current);

    const newMetrics = {
      loadTime,
      renderTime,
      interactionTime: metrics.interactionTime,
      memoryUsage: trackMemory ? getMemoryUsage() : 0
    };

    setMetrics(newMetrics);

    if (onMetricsUpdate) {
      onMetricsUpdate(newMetrics);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Performance [${name}]:`, newMetrics);
    }
  }, [name, metrics.interactionTime, trackMemory, onMetricsUpdate]);

  // Track interaction time
  const trackInteraction = useCallback((interactionName) => {
    if (!trackInteractions) return () => {};

    const startTime = performance.now();
    
    return () => {
      const interactionTime = performance.now() - startTime;
      setMetrics(prev => ({
        ...prev,
        interactionTime: prev.interactionTime + interactionTime
      }));

      if (process.env.NODE_ENV === 'development') {
        console.log(`Interaction [${interactionName}]: ${interactionTime.toFixed(2)}ms`);
      }
    };
  }, [trackInteractions]);

  // Get memory usage
  const getMemoryUsage = useCallback(() => {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      return performance.memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }, []);

  // Auto-start measurement on mount
  useEffect(() => {
    startMeasurement();
    
    return () => {
      endMeasurement();
    };
  }, []);

  return {
    metrics,
    startMeasurement,
    endMeasurement,
    trackInteraction,
    getMemoryUsage
  };
}

// Web Vitals hook
export function useWebVitals(onVitalsUpdate) {
  const [vitals, setVitals] = useState({
    CLS: 0,
    FID: 0,
    FCP: 0,
    LCP: 0,
    TTFB: 0
  });

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS((metric) => {
        setVitals(prev => ({ ...prev, CLS: metric.value }));
        if (onVitalsUpdate) onVitalsUpdate('CLS', metric);
      });

      getFID((metric) => {
        setVitals(prev => ({ ...prev, FID: metric.value }));
        if (onVitalsUpdate) onVitalsUpdate('FID', metric);
      });

      getFCP((metric) => {
        setVitals(prev => ({ ...prev, FCP: metric.value }));
        if (onVitalsUpdate) onVitalsUpdate('FCP', metric);
      });

      getLCP((metric) => {
        setVitals(prev => ({ ...prev, LCP: metric.value }));
        if (onVitalsUpdate) onVitalsUpdate('LCP', metric);
      });

      getTTFB((metric) => {
        setVitals(prev => ({ ...prev, TTFB: metric.value }));
        if (onVitalsUpdate) onVitalsUpdate('TTFB', metric);
      });
    }).catch(error => {
      console.warn('Web Vitals not available:', error);
    });
  }, [onVitalsUpdate]);

  return vitals;
}

// Resource loading performance hook
export function useResourcePerformance() {
  const [resources, setResources] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const resourceEntries = entries.map(entry => ({
        name: entry.name,
        type: entry.initiatorType,
        size: entry.transferSize || 0,
        duration: entry.duration,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd
      }));

      setResources(prev => [...prev, ...resourceEntries]);
    });

    observer.observe({ entryTypes: ['resource'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  const getResourcesByType = useCallback((type) => {
    return resources.filter(resource => resource.type === type);
  }, [resources]);

  const getTotalSize = useCallback(() => {
    return resources.reduce((total, resource) => total + resource.size, 0);
  }, [resources]);

  const getSlowResources = useCallback((threshold = 1000) => {
    return resources.filter(resource => resource.duration > threshold);
  }, [resources]);

  return {
    resources,
    getResourcesByType,
    getTotalSize,
    getSlowResources
  };
}

// Component render performance hook
export function useRenderPerformance(componentName) {
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(0);
  const [renderStats, setRenderStats] = useState({
    renderCount: 0,
    averageRenderTime: 0,
    lastRenderTime: 0
  });

  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      renderCountRef.current += 1;
      lastRenderTimeRef.current = renderTime;

      setRenderStats(prev => ({
        renderCount: renderCountRef.current,
        averageRenderTime: (prev.averageRenderTime * (renderCountRef.current - 1) + renderTime) / renderCountRef.current,
        lastRenderTime: renderTime
      }));

      if (process.env.NODE_ENV === 'development' && renderTime > 16) {
        console.warn(`Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`);
      }
    };
  });

  return renderStats;
}

// Bundle size analyzer hook
export function useBundleAnalysis() {
  const [bundleInfo, setBundleInfo] = useState({
    totalSize: 0,
    gzippedSize: 0,
    chunks: []
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Analyze loaded scripts
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const chunks = scripts.map(script => ({
      url: script.src,
      size: 0, // Would need server-side info for actual size
      type: script.src.includes('chunk') ? 'chunk' : 'main'
    }));

    setBundleInfo({
      totalSize: 0, // Would need actual implementation
      gzippedSize: 0,
      chunks
    });
  }, []);

  return bundleInfo;
}

// Performance budget hook
export function usePerformanceBudget(budget = {}) {
  const defaultBudget = {
    loadTime: 3000, // 3 seconds
    renderTime: 100, // 100ms
    bundleSize: 1024 * 1024, // 1MB
    memoryUsage: 50 * 1024 * 1024 // 50MB
  };

  const performanceBudget = { ...defaultBudget, ...budget };
  const [violations, setViolations] = useState([]);

  const checkBudget = useCallback((metrics) => {
    const newViolations = [];

    Object.entries(performanceBudget).forEach(([metric, limit]) => {
      if (metrics[metric] && metrics[metric] > limit) {
        newViolations.push({
          metric,
          value: metrics[metric],
          limit,
          severity: metrics[metric] > limit * 1.5 ? 'high' : 'medium'
        });
      }
    });

    setViolations(newViolations);
    return newViolations;
  }, [performanceBudget]);

  return {
    budget: performanceBudget,
    violations,
    checkBudget
  };
}

export default usePerformance;