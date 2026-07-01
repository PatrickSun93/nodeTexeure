'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCache } from '@/hooks/useCache';
import { usePerformance } from '@/hooks/usePerformance';

// Lazy load ECharts to reduce initial bundle size
let echarts = null;
const loadECharts = async () => {
  if (!echarts) {
    echarts = await import('echarts');
  }
  return echarts;
};

/**
 * Optimized Base Chart Component
 * Provides common functionality for all ECharts components with performance optimizations
 */
export default function BaseChart({ 
  option, 
  style = { height: '400px', width: '100%' }, 
  className = '',
  loading = false,
  onChartReady,
  onEvents = {},
  theme = 'default',
  cacheKey = null,
  enableCache = true,
  debounceResize = 300,
  lazyLoad = true
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const [isLoading, setIsLoading] = useState(loading);
  const [echartsLoaded, setEchartsLoaded] = useState(!lazyLoad);
  
  const cache = useCache();
  const { trackInteraction } = usePerformance('BaseChart');

  // Memoize chart options to prevent unnecessary re-renders
  const memoizedOption = useMemo(() => {
    if (!option) return null;
    
    // Check cache if enabled and cache key provided
    if (enableCache && cacheKey) {
      const cachedOption = cache.get(`chart_option_${cacheKey}`);
      if (cachedOption && JSON.stringify(cachedOption) === JSON.stringify(option)) {
        return cachedOption;
      }
      cache.set(`chart_option_${cacheKey}`, option);
    }
    
    return option;
  }, [option, enableCache, cacheKey, cache]);

  // Load ECharts dynamically
  useEffect(() => {
    if (lazyLoad && !echartsLoaded) {
      loadECharts().then(() => {
        setEchartsLoaded(true);
      }).catch(error => {
        console.error('Failed to load ECharts:', error);
      });
    }
  }, [lazyLoad, echartsLoaded]);

  // Initialize chart
  useEffect(() => {
    if (!echartsLoaded || !chartRef.current) return;

    const initChart = async () => {
      const endTracking = trackInteraction('chart-init');
      
      try {
        // Dispose existing chart instance
        if (chartInstance.current) {
          chartInstance.current.dispose();
        }

        // Load ECharts if not already loaded
        const echartsModule = await loadECharts();

        // Create new chart instance with performance optimizations
        chartInstance.current = echartsModule.init(chartRef.current, theme, {
          renderer: 'canvas', // Use canvas for better performance with large datasets
          useDirtyRect: true, // Enable dirty rectangle optimization
          useCoarsePointer: true // Optimize for touch devices
        });

        // Set up event listeners with debouncing for performance
        Object.entries(onEvents).forEach(([eventName, handler]) => {
          const debouncedHandler = debounce(handler, 100);
          chartInstance.current.on(eventName, debouncedHandler);
        });

        // Notify parent component that chart is ready
        if (onChartReady) {
          onChartReady(chartInstance.current);
        }
      } catch (error) {
        console.error('Chart initialization failed:', error);
      } finally {
        endTracking();
      }
    };

    initChart();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [echartsLoaded, theme, onChartReady, onEvents, trackInteraction]);

  // Debounced chart update function
  const updateChart = useCallback(
    debounce((newOption) => {
      if (chartInstance.current && newOption) {
        const endTracking = trackInteraction('chart-update');
        try {
          chartInstance.current.setOption(newOption, {
            notMerge: false,
            lazyUpdate: true,
            silent: false
          });
        } catch (error) {
          console.error('Chart update failed:', error);
        } finally {
          endTracking();
        }
      }
    }, 100),
    [trackInteraction]
  );

  // Update chart options with debouncing
  useEffect(() => {
    if (memoizedOption) {
      updateChart(memoizedOption);
    }
  }, [memoizedOption, updateChart]);

  // Handle loading state
  useEffect(() => {
    if (chartInstance.current) {
      if (loading) {
        chartInstance.current.showLoading('default', {
          text: 'Loading...',
          color: '#3b82f6',
          textColor: '#374151',
          maskColor: 'rgba(255, 255, 255, 0.8)',
          zlevel: 0
        });
      } else {
        chartInstance.current.hideLoading();
      }
    }
    setIsLoading(loading);
  }, [loading]);

  // Optimized resize handler with debouncing
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(() => {
      if (chartInstance.current) {
        const endTracking = trackInteraction('chart-resize');
        try {
          chartInstance.current.resize({
            animation: {
              duration: 300,
              easing: 'cubicOut'
            }
          });
        } catch (error) {
          console.error('Chart resize failed:', error);
        } finally {
          endTracking();
        }
      }
    }, debounceResize);
  }, [debounceResize, trackInteraction]);

  // Handle window resize with ResizeObserver for better performance
  useEffect(() => {
    if (!chartRef.current) return;

    // Use ResizeObserver if available, fallback to window resize
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(chartRef.current);
      
      return () => {
        resizeObserver.disconnect();
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
      };
    } else {
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
      };
    }
  }, [handleResize]);

  // Show loading state while ECharts is loading
  if (lazyLoad && !echartsLoaded) {
    return (
      <div 
        style={style} 
        className={`${className} flex items-center justify-center bg-gray-50`}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading chart...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={chartRef} 
      style={style} 
      className={`${className} ${isLoading ? 'opacity-75' : ''} transition-opacity duration-200`}
    />
  );
}

// Utility function for debouncing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}