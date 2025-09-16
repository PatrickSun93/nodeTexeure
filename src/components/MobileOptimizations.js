'use client';

import { useEffect, useState } from 'react';

/**
 * Mobile Optimizations Component
 * Handles mobile-specific performance and UX optimizations
 */
export default function MobileOptimizations() {
  const [isMobile, setIsMobile] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [connectionType, setConnectionType] = useState('');

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };

    // Network status detection
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    // Connection type detection (if supported)
    const updateConnectionType = () => {
      if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          setConnectionType(connection.effectiveType || connection.type || '');
        }
      }
    };

    // Initial checks
    checkMobile();
    updateOnlineStatus();
    updateConnectionType();

    // Event listeners
    window.addEventListener('resize', checkMobile);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if ('connection' in navigator) {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        connection.addEventListener('change', updateConnectionType);
      }
    }

    // Mobile-specific optimizations
    if (isMobile) {
      // Disable hover effects on mobile to improve performance
      document.body.classList.add('mobile-device');

      // Optimize scroll performance
      document.body.style.webkitOverflowScrolling = 'touch';

      // Prevent zoom on input focus (iOS)
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }

      // Reduce animation complexity on slower connections
      if (connectionType === 'slow-2g' || connectionType === '2g') {
        document.body.classList.add('reduced-motion');
      }
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      
      if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          connection.removeEventListener('change', updateConnectionType);
        }
      }
    };
  }, [isMobile, connectionType]);

  // Preload critical resources on mobile
  useEffect(() => {
    if (isMobile && isOnline) {
      // Preload critical CSS for mobile
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = '/styles/mobile-enhancements.css';
      document.head.appendChild(link);

      // Prefetch likely next pages
      const prefetchLinks = ['/shop', '/cart', '/checkout'];
      prefetchLinks.forEach(href => {
        const prefetchLink = document.createElement('link');
        prefetchLink.rel = 'prefetch';
        prefetchLink.href = href;
        document.head.appendChild(prefetchLink);
      });
    }
  }, [isMobile, isOnline]);

  // Show offline indicator
  if (!isOnline) {
    return (
      <div className="mobile-offline-indicator">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728" />
        </svg>
        You're offline. Some features may not work.
      </div>
    );
  }

  // Show slow connection indicator
  if (isMobile && (connectionType === 'slow-2g' || connectionType === '2g')) {
    return (
      <div className="mobile-slow-connection-indicator">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Slow connection detected. Images may load slowly.
      </div>
    );
  }

  return null;
}

/**
 * Mobile Performance Hook
 * Provides mobile-specific performance utilities
 */
export function useMobilePerformance() {
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
          setIsSlowConnection(slowTypes.includes(connection.effectiveType));
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

  const optimizeForMobile = (options = {}) => {
    if (!isMobile) return options;

    return {
      ...options,
      // Reduce image quality on mobile
      imageQuality: isSlowConnection ? 60 : 80,
      // Lazy load more aggressively
      lazyLoadOffset: isSlowConnection ? 50 : 100,
      // Reduce animation duration
      animationDuration: isSlowConnection ? 150 : 250,
      // Enable compression
      enableCompression: true,
    };
  };

  const shouldReduceMotion = () => {
    return isSlowConnection || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  return {
    isMobile,
    isSlowConnection,
    optimizeForMobile,
    shouldReduceMotion,
  };
}

/**
 * Touch Gesture Hook
 * Provides touch gesture utilities for mobile
 */
export function useTouchGestures(element, options = {}) {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const minSwipeDistance = options.minSwipeDistance || 50;

  useEffect(() => {
    if (!element) return;

    const handleTouchStart = (e) => {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => {
      setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
      if (!touchStart || !touchEnd) return;
      
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;

      if (isLeftSwipe && options.onSwipeLeft) {
        options.onSwipeLeft();
      }
      if (isRightSwipe && options.onSwipeRight) {
        options.onSwipeRight();
      }
    };

    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [element, touchStart, touchEnd, minSwipeDistance, options]);

  return {
    touchStart,
    touchEnd,
  };
}