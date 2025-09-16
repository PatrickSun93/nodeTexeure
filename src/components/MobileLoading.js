'use client';

import { useMobilePerformance } from './MobileOptimizations';

/**
 * Mobile-optimized loading component
 * Adapts loading states based on device and connection speed
 */
export default function MobileLoading({ 
  message = 'Loading...', 
  size = 'medium',
  showProgress = false,
  progress = 0 
}) {
  const { isMobile, isSlowConnection, shouldReduceMotion } = useMobilePerformance();

  const sizeClasses = {
    small: 'w-6 h-6',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  };

  const containerClasses = {
    small: 'p-4',
    medium: 'p-8',
    large: 'p-12'
  };

  return (
    <div className={`mobile-loading-container ${containerClasses[size]}`}>
      <div className="mobile-loading-content">
        {!shouldReduceMotion() ? (
          <div className={`mobile-loading-spinner ${sizeClasses[size]}`}>
            <div className="mobile-spinner-ring"></div>
            <div className="mobile-spinner-ring"></div>
            <div className="mobile-spinner-ring"></div>
            <div className="mobile-spinner-ring"></div>
          </div>
        ) : (
          <div className={`mobile-loading-static ${sizeClasses[size]}`}>
            <div className="mobile-static-indicator"></div>
          </div>
        )}
        
        <p className="mobile-loading-message">{message}</p>
        
        {showProgress && (
          <div className="mobile-progress-container">
            <div className="mobile-progress-bar">
              <div 
                className="mobile-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <span className="mobile-progress-text">{Math.round(progress)}%</span>
          </div>
        )}
        
        {isSlowConnection && (
          <p className="mobile-loading-slow-connection">
            Slow connection detected. This may take a moment.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton loading component for mobile
 */
export function MobileSkeleton({ 
  type = 'text', 
  lines = 3, 
  width = '100%', 
  height = '1rem' 
}) {
  const { shouldReduceMotion } = useMobilePerformance();

  if (type === 'product-card') {
    return (
      <div className="mobile-skeleton-product-card">
        <div className="mobile-skeleton-image" />
        <div className="mobile-skeleton-content">
          <div className="mobile-skeleton-line mobile-skeleton-title" />
          <div className="mobile-skeleton-line mobile-skeleton-description" />
          <div className="mobile-skeleton-line mobile-skeleton-price" />
        </div>
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div className="mobile-skeleton-text">
        {Array.from({ length: lines }, (_, index) => (
          <div 
            key={index}
            className={`mobile-skeleton-line ${shouldReduceMotion() ? 'no-animation' : ''}`}
            style={{ 
              width: index === lines - 1 ? '60%' : width,
              height 
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div 
      className={`mobile-skeleton-custom ${shouldReduceMotion() ? 'no-animation' : ''}`}
      style={{ width, height }}
    />
  );
}

/**
 * Mobile-optimized image loading placeholder
 */
export function MobileImagePlaceholder({ 
  width, 
  height, 
  alt = 'Loading image...',
  showProgress = false,
  progress = 0 
}) {
  return (
    <div 
      className="mobile-image-placeholder"
      style={{ width, height }}
      role="img"
      aria-label={alt}
    >
      <div className="mobile-image-placeholder-content">
        <svg 
          className="mobile-image-placeholder-icon" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
        
        {showProgress && (
          <div className="mobile-image-progress">
            <div className="mobile-image-progress-bar">
              <div 
                className="mobile-image-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}