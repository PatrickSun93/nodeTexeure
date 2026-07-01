'use client';

import { useEffect, useState } from 'react';

/**
 * Performance monitoring hook for Core Web Vitals
 * Tracks LCP, FID, CLS and other performance metrics
 */
export function usePerformance() {
  const [metrics, setMetrics] = useState({
    lcp: null,
    fid: null,
    cls: null,
    fcp: null,
    ttfb: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Function to send metrics to analytics (placeholder)
    const sendToAnalytics = (metric) => {
      console.log('Performance Metric:', metric);
      // In production, send to your analytics service
      // analytics.track('web-vital', metric);
    };

    // Largest Contentful Paint (LCP)
    const observeLCP = () => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          
          const lcpValue = lastEntry.startTime;
          setMetrics(prev => ({ ...prev, lcp: lcpValue }));
          
          sendToAnalytics({
            name: 'LCP',
            value: lcpValue,
            rating: lcpValue <= 2500 ? 'good' : lcpValue <= 4000 ? 'needs-improvement' : 'poor'
          });
        });
        
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
        return () => observer.disconnect();
      }
    };

    // First Input Delay (FID)
    const observeFID = () => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            const fidValue = entry.processingStart - entry.startTime;
            setMetrics(prev => ({ ...prev, fid: fidValue }));
            
            sendToAnalytics({
              name: 'FID',
              value: fidValue,
              rating: fidValue <= 100 ? 'good' : fidValue <= 300 ? 'needs-improvement' : 'poor'
            });
          });
        });
        
        observer.observe({ entryTypes: ['first-input'] });
        return () => observer.disconnect();
      }
    };

    // Cumulative Layout Shift (CLS)
    const observeCLS = () => {
      if ('PerformanceObserver' in window) {
        let clsValue = 0;
        let sessionValue = 0;
        let sessionEntries = [];
        
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          
          entries.forEach((entry) => {
            if (!entry.hadRecentInput) {
              const firstSessionEntry = sessionEntries[0];
              const lastSessionEntry = sessionEntries[sessionEntries.length - 1];
              
              if (sessionValue && 
                  entry.startTime - lastSessionEntry.startTime < 1000 &&
                  entry.startTime - firstSessionEntry.startTime < 5000) {
                sessionValue += entry.value;
                sessionEntries.push(entry);
              } else {
                sessionValue = entry.value;
                sessionEntries = [entry];
              }
              
              if (sessionValue > clsValue) {
                clsValue = sessionValue;
                setMetrics(prev => ({ ...prev, cls: clsValue }));
                
                sendToAnalytics({
                  name: 'CLS',
                  value: clsValue,
                  rating: clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor'
                });
              }
            }
          });
        });
        
        observer.observe({ entryTypes: ['layout-shift'] });
        return () => observer.disconnect();
      }
    };

    // First Contentful Paint (FCP)
    const observeFCP = () => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              const fcpValue = entry.startTime;
              setMetrics(prev => ({ ...prev, fcp: fcpValue }));
              
              sendToAnalytics({
                name: 'FCP',
                value: fcpValue,
                rating: fcpValue <= 1800 ? 'good' : fcpValue <= 3000 ? 'needs-improvement' : 'poor'
              });
            }
          });
        });
        
        observer.observe({ entryTypes: ['paint'] });
        return () => observer.disconnect();
      }
    };

    // Time to First Byte (TTFB)
    const observeTTFB = () => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.entryType === 'navigation') {
              const ttfbValue = entry.responseStart - entry.requestStart;
              setMetrics(prev => ({ ...prev, ttfb: ttfbValue }));
              
              sendToAnalytics({
                name: 'TTFB',
                value: ttfbValue,
                rating: ttfbValue <= 800 ? 'good' : ttfbValue <= 1800 ? 'needs-improvement' : 'poor'
              });
            }
          });
        });
        
        observer.observe({ entryTypes: ['navigation'] });
        return () => observer.disconnect();
      }
    };

    // Initialize observers
    const cleanupFunctions = [
      observeLCP(),
      observeFID(),
      observeCLS(),
      observeFCP(),
      observeTTFB(),
    ].filter(Boolean);

    // Cleanup function
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup && cleanup());
    };
  }, []);

  return metrics;
}

/**
 * Performance budget checker
 * Warns when performance metrics exceed thresholds
 */
export function usePerformanceBudget(thresholds = {}) {
  const metrics = usePerformance();
  const [warnings, setWarnings] = useState([]);

  const defaultThresholds = {
    lcp: 2500,
    fid: 100,
    cls: 0.1,
    fcp: 1800,
    ttfb: 800,
    ...thresholds
  };

  useEffect(() => {
    const newWarnings = [];

    Object.entries(metrics).forEach(([metric, value]) => {
      if (value !== null && value > defaultThresholds[metric]) {
        newWarnings.push({
          metric: metric.toUpperCase(),
          value,
          threshold: defaultThresholds[metric],
          severity: value > defaultThresholds[metric] * 2 ? 'high' : 'medium'
        });
      }
    });

    setWarnings(newWarnings);
  }, [metrics, defaultThresholds]);

  return { metrics, warnings };
}

/**
 * Resource loading performance tracker
 */
export function useResourcePerformance() {
  const [resources, setResources] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const resourceData = entries.map(entry => ({
        name: entry.name,
        type: entry.initiatorType,
        size: entry.transferSize,
        duration: entry.duration,
        startTime: entry.startTime,
        rating: entry.duration <= 100 ? 'good' : entry.duration <= 300 ? 'needs-improvement' : 'poor'
      }));
      
      setResources(prev => [...prev, ...resourceData]);
    });

    observer.observe({ entryTypes: ['resource'] });

    return () => observer.disconnect();
  }, []);

  return resources;
}

/**
 * Memory usage tracker
 */
export function useMemoryUsage() {
  const [memoryInfo, setMemoryInfo] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('memory' in performance)) return;

    const updateMemoryInfo = () => {
      const memory = performance.memory;
      setMemoryInfo({
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
      });
    };

    updateMemoryInfo();
    const interval = setInterval(updateMemoryInfo, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return memoryInfo;
}