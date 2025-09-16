'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { storage } from '../lib/utils';

const RECENTLY_VIEWED_STORAGE_KEY = 'recently_viewed_products';
const MAX_RECENTLY_VIEWED = 10;

export default function RecentlyViewed({ isOpen, onClose }) {
  const [recentlyViewedItems, setRecentlyViewedItems] = useState([]);

  useEffect(() => {
    const items = storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
    setRecentlyViewedItems(items);
  }, []);

  const clearRecentlyViewed = () => {
    setRecentlyViewedItems([]);
    storage.set(RECENTLY_VIEWED_STORAGE_KEY, []);
    
    // Dispatch event to update recently viewed count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('recently-viewed:updated', { 
        detail: { count: 0 } 
      }));
    }
  };

  const removeFromRecentlyViewed = (productId) => {
    const updatedItems = recentlyViewedItems.filter(item => item.id !== productId);
    setRecentlyViewedItems(updatedItems);
    storage.set(RECENTLY_VIEWED_STORAGE_KEY, updatedItems);
    
    // Dispatch event to update recently viewed count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('recently-viewed:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="recently-viewed-overlay" onClick={onClose}>
      <div className="recently-viewed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recently-viewed-header">
          <h2>Recently Viewed</h2>
          <div className="recently-viewed-actions">
            {recentlyViewedItems.length > 0 && (
              <button 
                onClick={clearRecentlyViewed}
                className="recently-viewed-clear-btn"
              >
                Clear All
              </button>
            )}
            <button 
              onClick={onClose}
              className="recently-viewed-close-btn"
              aria-label="Close recently viewed"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="recently-viewed-content">
          {recentlyViewedItems.length === 0 ? (
            <div className="recently-viewed-empty">
              <svg className="recently-viewed-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <h3>No recently viewed products</h3>
              <p>Products you view will appear here</p>
              <Link href="/shop" className="aesop-button-primary">
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="recently-viewed-grid">
              {recentlyViewedItems.map((product) => (
                <div key={product.id} className="recently-viewed-item">
                  <div className="recently-viewed-item-image">
                    <LazyImage 
                      src={product.image || '/api/placeholder/200/200'} 
                      alt={product.name}
                      width={200}
                      height={200}
                      className="recently-viewed-product-image"
                    />
                    <button 
                      onClick={() => removeFromRecentlyViewed(product.id)}
                      className="recently-viewed-remove-btn"
                      title="Remove from recently viewed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="recently-viewed-item-details">
                    <h3 className="recently-viewed-item-name">{product.name}</h3>
                    <div className="recently-viewed-item-price">
                      <span className="recently-viewed-current-price">${product.price}</span>
                      {product.originalPrice && (
                        <span className="recently-viewed-original-price">${product.originalPrice}</span>
                      )}
                    </div>
                    
                    {product.rating && (
                      <div className="recently-viewed-item-rating">
                        <div className="recently-viewed-stars">
                          {[...Array(5)].map((_, i) => (
                            <svg 
                              key={i} 
                              className={`recently-viewed-star ${i < Math.floor(product.rating) ? 'filled' : ''}`}
                              fill="currentColor" 
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        <span className="recently-viewed-rating-text">({product.rating})</span>
                      </div>
                    )}
                    
                    <div className="recently-viewed-item-actions">
                      <Link 
                        href={`/products/${product.id}`}
                        className="recently-viewed-view-btn"
                      >
                        View Again
                      </Link>
                    </div>
                    
                    {product.viewedAt && (
                      <div className="recently-viewed-timestamp">
                        Viewed {new Date(product.viewedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact recently viewed component for sidebars
export function RecentlyViewedSidebar({ maxItems = 5 }) {
  const [recentlyViewedItems, setRecentlyViewedItems] = useState([]);

  useEffect(() => {
    const items = storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
    setRecentlyViewedItems(items.slice(0, maxItems));

    const handleRecentlyViewedUpdate = () => {
      const updatedItems = storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
      setRecentlyViewedItems(updatedItems.slice(0, maxItems));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('recently-viewed:updated', handleRecentlyViewedUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('recently-viewed:updated', handleRecentlyViewedUpdate);
      }
    };
  }, [maxItems]);

  if (recentlyViewedItems.length === 0) {
    return null;
  }

  return (
    <div className="recently-viewed-sidebar">
      <h3 className="recently-viewed-sidebar-title">Recently Viewed</h3>
      <div className="recently-viewed-sidebar-items">
        {recentlyViewedItems.map((product) => (
          <Link 
            key={product.id} 
            href={`/products/${product.id}`}
            className="recently-viewed-sidebar-item"
          >
            <LazyImage 
              src={product.image || '/api/placeholder/60/60'} 
              alt={product.name}
              width={60}
              height={60}
              className="recently-viewed-sidebar-image"
            />
            <div className="recently-viewed-sidebar-details">
              <h4 className="recently-viewed-sidebar-name">{product.name}</h4>
              <p className="recently-viewed-sidebar-price">${product.price}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Hook for managing recently viewed products
export const useRecentlyViewed = () => {
  const [recentlyViewedCount, setRecentlyViewedCount] = useState(0);

  useEffect(() => {
    const items = storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
    setRecentlyViewedCount(items.length);

    const handleRecentlyViewedUpdate = (event) => {
      setRecentlyViewedCount(event.detail.count);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('recently-viewed:updated', handleRecentlyViewedUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('recently-viewed:updated', handleRecentlyViewedUpdate);
      }
    };
  }, []);

  const addToRecentlyViewed = (product) => {
    const items = storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
    
    // Remove if already exists to avoid duplicates
    const filteredItems = items.filter(item => item.id !== product.id);
    
    // Add to beginning with timestamp
    const productWithTimestamp = {
      ...product,
      viewedAt: new Date().toISOString()
    };
    
    const updatedItems = [productWithTimestamp, ...filteredItems].slice(0, MAX_RECENTLY_VIEWED);
    storage.set(RECENTLY_VIEWED_STORAGE_KEY, updatedItems);
    setRecentlyViewedCount(updatedItems.length);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('recently-viewed:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }

    return { success: true, message: 'Product added to recently viewed' };
  };

  const removeFromRecentlyViewed = (productId) => {
    const items = storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
    const updatedItems = items.filter(item => item.id !== productId);
    storage.set(RECENTLY_VIEWED_STORAGE_KEY, updatedItems);
    setRecentlyViewedCount(updatedItems.length);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('recently-viewed:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }

    return { success: true, message: 'Product removed from recently viewed' };
  };

  const clearRecentlyViewed = () => {
    storage.set(RECENTLY_VIEWED_STORAGE_KEY, []);
    setRecentlyViewedCount(0);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('recently-viewed:updated', { 
        detail: { count: 0 } 
      }));
    }

    return { success: true, message: 'Recently viewed cleared' };
  };

  const getRecentlyViewed = () => {
    return storage.get(RECENTLY_VIEWED_STORAGE_KEY, []);
  };

  return {
    recentlyViewedCount,
    addToRecentlyViewed,
    removeFromRecentlyViewed,
    clearRecentlyViewed,
    getRecentlyViewed
  };
};