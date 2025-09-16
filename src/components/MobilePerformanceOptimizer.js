'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * Mobile Performance Optimizer Component
 * Provides advanced mobile performance optimizations
 */
export default function MobilePerformanceOptimizer({ children }) {
  const [isMobile, setIsMobile] = useState(false);
  const [connectionType, setConnectionType] = useState('');
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const observerRef = useRef(null);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };

    // Connection type detection
    const updateConnectionType = () => {
      if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          setConnectionType(connection.effectiveType || connection.type || '');
          
          // Detect low power mode (iOS Safari)
          if (connection.saveData || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
            setIsLowPowerMode(true);
          }
        }
      }
    };

    checkMobile();
    updateConnectionType();

    window.addEventListener('resize', checkMobile);
    
    if ('connection' in navigator) {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        connection.addEventListener('change', updateConnectionType);
      }
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          connection.removeEventListener('change', updateConnectionType);
        }
      }
    };
  }, []);

  // Mobile-specific optimizations
  useEffect(() => {
    if (isMobile) {
      // Optimize scroll performance
      document.body.style.webkitOverflowScrolling = 'touch';
      document.body.classList.add('mobile-device');

      // Reduce animations on slow connections
      if (isLowPowerMode || connectionType === 'slow-2g' || connectionType === '2g') {
        document.body.classList.add('reduced-motion');
      }

      // Optimize touch events
      document.body.style.touchAction = 'manipulation';

      // Prevent zoom on input focus (iOS)
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
    }

    return () => {
      if (isMobile) {
        document.body.classList.remove('mobile-device', 'reduced-motion');
      }
    };
  }, [isMobile, isLowPowerMode, connectionType]);

  return children;
}

/**
 * Intersection Observer Hook for Lazy Loading
 */
export function useIntersectionObserver(options = {}) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        if (entry.isIntersecting && !hasIntersected) {
          setHasIntersected(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [hasIntersected, options]);

  return { elementRef, isIntersecting, hasIntersected };
}

/**
 * Mobile Image Optimization Hook
 */
export function useMobileImageOptimization() {
  const [isMobile, setIsMobile] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    const checkConnection = () => {
      if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          const slowTypes = ['slow-2g', '2g'];
          setIsSlowConnection(slowTypes.includes(connection.effectiveType) || connection.saveData);
        }
      }
    };

    checkMobile();
    checkConnection();

    window.addEventListener('resize', checkMobile);
    
    if ('connection' in navigator) {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        connection.addEventListener('change', checkConnection);
      }
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          connection.removeEventListener('change', checkConnection);
        }
      }
    };
  }, []);

  const getOptimizedImageUrl = (originalUrl, width = 300, height = 300) => {
    if (!originalUrl) return '/api/placeholder/300/300';
    
    // If it's already a placeholder, return as is
    if (originalUrl.includes('/api/placeholder/')) return originalUrl;
    
    // For mobile and slow connections, use smaller images
    if (isMobile) {
      const mobileWidth = isSlowConnection ? Math.min(width, 200) : width;
      const mobileHeight = isSlowConnection ? Math.min(height, 200) : height;
      
      // In a real app, you'd use a service like Cloudinary or ImageKit
      // For now, we'll use the original URL
      return originalUrl;
    }
    
    return originalUrl;
  };

  const getImageQuality = () => {
    if (isSlowConnection) return 60;
    if (isMobile) return 80;
    return 90;
  };

  return {
    isMobile,
    isSlowConnection,
    getOptimizedImageUrl,
    getImageQuality
  };
}

/**
 * Mobile Gesture Handler Hook
 */
export function useMobileGestures(element, callbacks = {}) {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!element) return;

    const handleTouchStart = (e) => {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
      setTouchStartY(e.targetTouches[0].clientY);
      setIsDragging(false);
      
      if (callbacks.onTouchStart) {
        callbacks.onTouchStart(e);
      }
    };

    const handleTouchMove = (e) => {
      setTouchEnd(e.targetTouches[0].clientX);
      
      // Detect horizontal vs vertical movement
      if (touchStart && touchStartY) {
        const deltaX = Math.abs(e.targetTouches[0].clientX - touchStart);
        const deltaY = Math.abs(e.targetTouches[0].clientY - touchStartY);
        
        if (deltaX > deltaY && deltaX > 10) {
          setIsDragging(true);
          if (callbacks.preventVerticalScroll) {
            e.preventDefault();
          }
        }
      }
      
      if (callbacks.onTouchMove) {
        callbacks.onTouchMove(e);
      }
    };

    const handleTouchEnd = (e) => {
      if (!touchStart || !touchEnd) return;
      
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > 50;
      const isRightSwipe = distance < -50;

      if (isDragging) {
        if (isLeftSwipe && callbacks.onSwipeLeft) {
          callbacks.onSwipeLeft();
        }
        if (isRightSwipe && callbacks.onSwipeRight) {
          callbacks.onSwipeRight();
        }
      }
      
      setIsDragging(false);
      
      if (callbacks.onTouchEnd) {
        callbacks.onTouchEnd(e);
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [element, touchStart, touchEnd, touchStartY, isDragging, callbacks]);

  return {
    isDragging,
    touchStart,
    touchEnd
  };
}

/**
 * Mobile Performance Metrics Hook
 */
export function useMobilePerformanceMetrics() {
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    cumulativeLayoutShift: 0
  });

  useEffect(() => {
    // Measure performance metrics
    const measurePerformance = () => {
      if ('performance' in window) {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation) {
          setMetrics(prev => ({
            ...prev,
            loadTime: navigation.loadEventEnd - navigation.loadEventStart
          }));
        }

        // Web Vitals
        if ('PerformanceObserver' in window) {
          // First Contentful Paint
          const fcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const fcp = entries.find(entry => entry.name === 'first-contentful-paint');
            if (fcp) {
              setMetrics(prev => ({ ...prev, firstContentfulPaint: fcp.startTime }));
            }
          });
          fcpObserver.observe({ entryTypes: ['paint'] });

          // Largest Contentful Paint
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lcp = entries[entries.length - 1];
            if (lcp) {
              setMetrics(prev => ({ ...prev, largestContentfulPaint: lcp.startTime }));
            }
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

          // Cumulative Layout Shift
          const clsObserver = new PerformanceObserver((list) => {
            let clsValue = 0;
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            setMetrics(prev => ({ ...prev, cumulativeLayoutShift: clsValue }));
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });

          return () => {
            fcpObserver.disconnect();
            lcpObserver.disconnect();
            clsObserver.disconnect();
          };
        }
      }
    };

    measurePerformance();
  }, []);

  return metrics;
}