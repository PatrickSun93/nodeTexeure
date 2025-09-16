'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { storage } from '../lib/utils';

const COMPARISON_STORAGE_KEY = 'product_comparison';
const MAX_COMPARISON_ITEMS = 4;

export default function ProductComparison({ isOpen, onClose }) {
  const [comparisonItems, setComparisonItems] = useState([]);

  useEffect(() => {
    const items = storage.get(COMPARISON_STORAGE_KEY, []);
    setComparisonItems(items);
  }, []);

  const removeFromComparison = (productId) => {
    const updatedItems = comparisonItems.filter(item => item.id !== productId);
    setComparisonItems(updatedItems);
    storage.set(COMPARISON_STORAGE_KEY, updatedItems);
    
    // Dispatch event to update comparison count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('comparison:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }
  };

  const clearComparison = () => {
    setComparisonItems([]);
    storage.set(COMPARISON_STORAGE_KEY, []);
    
    // Dispatch event to update comparison count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('comparison:updated', { 
        detail: { count: 0 } 
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="comparison-overlay" onClick={onClose}>
      <div className="comparison-modal" onClick={(e) => e.stopPropagation()}>
        <div className="comparison-header">
          <h2>Product Comparison</h2>
          <div className="comparison-actions">
            {comparisonItems.length > 0 && (
              <button 
                onClick={clearComparison}
                className="comparison-clear-btn"
              >
                Clear All
              </button>
            )}
            <button 
              onClick={onClose}
              className="comparison-close-btn"
              aria-label="Close comparison"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="comparison-content">
          {comparisonItems.length === 0 ? (
            <div className="comparison-empty">
              <svg className="comparison-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3>No products to compare</h3>
              <p>Add products to comparison to see them here</p>
              <Link href="/shop" className="aesop-button-primary">
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="comparison-table-container">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th className="comparison-feature-header">Features</th>
                    {comparisonItems.map((product) => (
                      <th key={product.id} className="comparison-product-header">
                        <div className="comparison-product-info">
                          <LazyImage 
                            src={product.image || '/api/placeholder/100/100'} 
                            alt={product.name}
                            width={80}
                            height={80}
                            className="comparison-product-image"
                          />
                          <div className="comparison-product-details">
                            <h4>{product.name}</h4>
                            <p className="comparison-product-price">${product.price}</p>
                            <button 
                              onClick={() => removeFromComparison(product.id)}
                              className="comparison-remove-btn"
                              title="Remove from comparison"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="comparison-feature-name">Price</td>
                    {comparisonItems.map((product) => (
                      <td key={`${product.id}-price`} className="comparison-feature-value">
                        <span className="comparison-price">${product.price}</span>
                        {product.originalPrice && (
                          <span className="comparison-original-price">${product.originalPrice}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="comparison-feature-name">Category</td>
                    {comparisonItems.map((product) => (
                      <td key={`${product.id}-category`} className="comparison-feature-value">
                        {product.category || 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="comparison-feature-name">Description</td>
                    {comparisonItems.map((product) => (
                      <td key={`${product.id}-description`} className="comparison-feature-value">
                        {product.description || 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="comparison-feature-name">Rating</td>
                    {comparisonItems.map((product) => (
                      <td key={`${product.id}-rating`} className="comparison-feature-value">
                        {product.rating ? (
                          <div className="comparison-rating">
                            <div className="comparison-stars">
                              {[...Array(5)].map((_, i) => (
                                <svg 
                                  key={i} 
                                  className={`comparison-star ${i < Math.floor(product.rating) ? 'filled' : ''}`}
                                  fill="currentColor" 
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                            </div>
                            <span>({product.rating})</span>
                          </div>
                        ) : (
                          'No rating'
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="comparison-feature-name">Actions</td>
                    {comparisonItems.map((product) => (
                      <td key={`${product.id}-actions`} className="comparison-feature-value">
                        <div className="comparison-actions-cell">
                          <Link 
                            href={`/products/${product.id}`}
                            className="aesop-button-secondary comparison-view-btn"
                          >
                            View Details
                          </Link>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook for managing product comparison
export const useProductComparison = () => {
  const [comparisonCount, setComparisonCount] = useState(0);

  useEffect(() => {
    const items = storage.get(COMPARISON_STORAGE_KEY, []);
    setComparisonCount(items.length);

    const handleComparisonUpdate = (event) => {
      setComparisonCount(event.detail.count);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('comparison:updated', handleComparisonUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('comparison:updated', handleComparisonUpdate);
      }
    };
  }, []);

  const addToComparison = (product) => {
    const items = storage.get(COMPARISON_STORAGE_KEY, []);
    
    // Check if product already exists
    if (items.some(item => item.id === product.id)) {
      return { success: false, message: 'Product already in comparison' };
    }

    // Check if maximum items reached
    if (items.length >= MAX_COMPARISON_ITEMS) {
      return { success: false, message: `Maximum ${MAX_COMPARISON_ITEMS} products can be compared` };
    }

    const updatedItems = [...items, product];
    storage.set(COMPARISON_STORAGE_KEY, updatedItems);
    setComparisonCount(updatedItems.length);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('comparison:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }

    return { success: true, message: 'Product added to comparison' };
  };

  const removeFromComparison = (productId) => {
    const items = storage.get(COMPARISON_STORAGE_KEY, []);
    const updatedItems = items.filter(item => item.id !== productId);
    storage.set(COMPARISON_STORAGE_KEY, updatedItems);
    setComparisonCount(updatedItems.length);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('comparison:updated', { 
        detail: { count: updatedItems.length } 
      }));
    }

    return { success: true, message: 'Product removed from comparison' };
  };

  const isInComparison = (productId) => {
    const items = storage.get(COMPARISON_STORAGE_KEY, []);
    return items.some(item => item.id === productId);
  };

  const clearComparison = () => {
    storage.set(COMPARISON_STORAGE_KEY, []);
    setComparisonCount(0);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('comparison:updated', { 
        detail: { count: 0 } 
      }));
    }

    return { success: true, message: 'Comparison cleared' };
  };

  return {
    comparisonCount,
    addToComparison,
    removeFromComparison,
    isInComparison,
    clearComparison
  };
};