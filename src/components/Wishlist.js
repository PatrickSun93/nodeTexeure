'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { storage } from '../lib/utils';
import { apiRequest } from '../lib/api';

const WISHLIST_STORAGE_KEY = 'product_wishlist';

export default function Wishlist({ isOpen, onClose }) {
  const [wishlistItems, setWishlistItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const items = storage.get(WISHLIST_STORAGE_KEY, []);
    setWishlistItems(items);
  }, []);

  const removeFromWishlist = (productId) => {
    const updatedItems = wishlistItems.filter(item => item.id !== productId);
    setWishlistItems(updatedItems);
    storage.set(WISHLIST_STORAGE_KEY, updatedItems);
    
    // Dispatch event to update wishlist count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }
  };

  const clearWishlist = () => {
    setWishlistItems([]);
    storage.set(WISHLIST_STORAGE_KEY, []);
    
    // Dispatch event to update wishlist count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { 
        detail: { count: 0 } 
      }));
    }
  };

  const handleAddToCart = async (product) => {
    setLoading(true);
    try {
      await apiRequest('/cart/add', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          variant_id: product.variant_id ?? null,
          quantity: 1,
        }),
      });
      
      // Notify cart update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
      
      return true;
    } catch (error) {
      console.error('Error adding to cart:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="wishlist-overlay" onClick={onClose}>
      <div className="wishlist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wishlist-header">
          <h2>My Wishlist</h2>
          <div className="wishlist-actions">
            {wishlistItems.length > 0 && (
              <button 
                onClick={clearWishlist}
                className="wishlist-clear-btn"
              >
                Clear All
              </button>
            )}
            <button 
              onClick={onClose}
              className="wishlist-close-btn"
              aria-label="Close wishlist"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="wishlist-content">
          {wishlistItems.length === 0 ? (
            <div className="wishlist-empty">
              <svg className="wishlist-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <h3>Your wishlist is empty</h3>
              <p>Save your favorite products to see them here</p>
              <Link href="/shop" className="aesop-button-primary">
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="wishlist-items">
              {wishlistItems.map((product) => (
                <div key={product.id} className="wishlist-item">
                  <div className="wishlist-item-image">
                    <LazyImage 
                      src={product.image || '/api/placeholder/150/150'} 
                      alt={product.name}
                      width={150}
                      height={150}
                      className="wishlist-product-image"
                    />
                  </div>
                  
                  <div className="wishlist-item-details">
                    <h3 className="wishlist-item-name">{product.name}</h3>
                    <p className="wishlist-item-description">{product.description}</p>
                    <div className="wishlist-item-price">
                      <span className="wishlist-current-price">${product.price}</span>
                      {product.originalPrice && (
                        <span className="wishlist-original-price">${product.originalPrice}</span>
                      )}
                    </div>
                    
                    {product.rating && (
                      <div className="wishlist-item-rating">
                        <div className="wishlist-stars">
                          {[...Array(5)].map((_, i) => (
                            <svg 
                              key={i} 
                              className={`wishlist-star ${i < Math.floor(product.rating) ? 'filled' : ''}`}
                              fill="currentColor" 
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        <span className="wishlist-rating-text">({product.rating})</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="wishlist-item-actions">
                    <button 
                      onClick={() => handleAddToCart(product)}
                      disabled={loading}
                      className="wishlist-add-to-cart-btn"
                    >
                      {loading ? 'Adding...' : 'Add to Cart'}
                    </button>
                    
                    <Link 
                      href={`/products/${product.id}`}
                      className="wishlist-view-btn"
                    >
                      View Details
                    </Link>
                    
                    <button 
                      onClick={() => removeFromWishlist(product.id)}
                      className="wishlist-remove-btn"
                      title="Remove from wishlist"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
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

// Hook for managing wishlist
export const useWishlist = () => {
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    const items = storage.get(WISHLIST_STORAGE_KEY, []);
    setWishlistCount(items.length);

    const handleWishlistUpdate = (event) => {
      setWishlistCount(event.detail.count);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('wishlist:updated', handleWishlistUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('wishlist:updated', handleWishlistUpdate);
      }
    };
  }, []);

  const addToWishlist = (product) => {
    const items = storage.get(WISHLIST_STORAGE_KEY, []);
    
    // Check if product already exists
    if (items.some(item => item.id === product.id)) {
      return { success: false, message: 'Product already in wishlist' };
    }

    const updatedItems = [...items, product];
    storage.set(WISHLIST_STORAGE_KEY, updatedItems);
    setWishlistCount(updatedItems.length);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }

    return { success: true, message: 'Product added to wishlist' };
  };

  const removeFromWishlist = (productId) => {
    const items = storage.get(WISHLIST_STORAGE_KEY, []);
    const updatedItems = items.filter(item => item.id !== productId);
    storage.set(WISHLIST_STORAGE_KEY, updatedItems);
    setWishlistCount(updatedItems.length);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }

    return { success: true, message: 'Product removed from wishlist' };
  };

  const isInWishlist = (productId) => {
    const items = storage.get(WISHLIST_STORAGE_KEY, []);
    return items.some(item => item.id === productId);
  };

  const toggleWishlist = (product) => {
    if (isInWishlist(product.id)) {
      return removeFromWishlist(product.id);
    } else {
      return addToWishlist(product);
    }
  };

  const clearWishlist = () => {
    storage.set(WISHLIST_STORAGE_KEY, []);
    setWishlistCount(0);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { 
        detail: { count: 0 } 
      }));
    }

    return { success: true, message: 'Wishlist cleared' };
  };

  return {
    wishlistCount,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    toggleWishlist,
    clearWishlist
  };
};