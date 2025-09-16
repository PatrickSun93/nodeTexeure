'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { apiRequest } from '../lib/api';
import { useDebounce } from '../lib/hooks';
import { storage } from '../lib/utils';

const SEARCH_HISTORY_KEY = 'search_history';
const MAX_SEARCH_HISTORY = 10;
const MAX_SUGGESTIONS = 8;

export default function AdvancedSearch({ isOpen, onClose, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searchMode, setSearchMode] = useState('suggestions'); // 'suggestions', 'results', 'history'
  
  const router = useRouter();
  const searchInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debouncedQuery = useDebounce(query, 300);

  // Load search history on mount
  useEffect(() => {
    const history = storage.get(SEARCH_HISTORY_KEY, []);
    setSearchHistory(history);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Generate suggestions based on debounced query
  useEffect(() => {
    if (debouncedQuery.trim().length > 1) {
      generateSuggestions(debouncedQuery.trim());
      setSearchMode('suggestions');
    } else {
      setSuggestions([]);
      setSearchResults([]);
      setSearchMode('history');
    }
  }, [debouncedQuery]);

  const generateSuggestions = useCallback(async (searchQuery) => {
    try {
      setLoading(true);
      
      // Try to get suggestions from API first
      try {
        const response = await apiRequest(`/search/suggestions?q=${encodeURIComponent(searchQuery)}`);
        if (response.status === 'SUCCESS' && response.keyValueTable?.suggestions) {
          setSuggestions(response.keyValueTable.suggestions.slice(0, MAX_SUGGESTIONS));
          return;
        }
      } catch (error) {
        console.log('API suggestions not available, using fallback');
      }

      // Fallback to predefined suggestions
      const predefinedSuggestions = [
        'Cotton Sheets', 'Silk Pillowcase', 'Memory Foam Mattress', 'Bamboo Duvet',
        'Linen Bedding', 'Down Pillow', 'Weighted Blanket', 'Mattress Protector',
        'Egyptian Cotton', 'Organic Bedding', 'Luxury Sheets', 'Thread Count',
        'King Size', 'Queen Size', 'Twin Size', 'California King',
        'Hypoallergenic', 'Cooling Sheets', 'Flannel Sheets', 'Percale Sheets',
        'Sateen Sheets', 'Jersey Sheets', 'Microfiber', 'Tencel Sheets'
      ];

      const matchingSuggestions = predefinedSuggestions
        .filter(suggestion => 
          suggestion.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, MAX_SUGGESTIONS);

      setSuggestions(matchingSuggestions);
    } finally {
      setLoading(false);
    }
  }, []);

  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setSearchMode('results');
      
      const response = await apiRequest(`/products?search=${encodeURIComponent(searchQuery.trim())}&limit=6`);
      
      if (response.status === 'SUCCESS') {
        const products = response.keyValueTable?.products || [];
        setSearchResults(products);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addToSearchHistory = (searchQuery) => {
    const history = storage.get(SEARCH_HISTORY_KEY, []);
    const updatedHistory = [
      searchQuery,
      ...history.filter(item => item !== searchQuery)
    ].slice(0, MAX_SEARCH_HISTORY);
    
    storage.set(SEARCH_HISTORY_KEY, updatedHistory);
    setSearchHistory(updatedHistory);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedSuggestionIndex(-1);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
    if (query.trim().length <= 1) {
      setSearchMode('history');
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow clicking
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    addToSearchHistory(suggestion);
    performSearch(suggestion);
    setShowSuggestions(false);
  };

  const handleHistoryClick = (historyItem) => {
    setQuery(historyItem);
    performSearch(historyItem);
    setShowSuggestions(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      addToSearchHistory(query.trim());
      
      // If we have a selected suggestion, use it
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        const selectedSuggestion = suggestions[selectedSuggestionIndex];
        setQuery(selectedSuggestion);
        router.push(`/shop?search=${encodeURIComponent(selectedSuggestion)}`);
      } else {
        router.push(`/shop?search=${encodeURIComponent(query.trim())}`);
      }
      
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    const currentSuggestions = searchMode === 'history' ? searchHistory : suggestions;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < currentSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > -1 ? prev - 1 : -1);
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0 && currentSuggestions[selectedSuggestionIndex]) {
          e.preventDefault();
          const selectedItem = currentSuggestions[selectedSuggestionIndex];
          if (searchMode === 'history') {
            handleHistoryClick(selectedItem);
          } else {
            handleSuggestionClick(selectedItem);
          }
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const clearSearchHistory = () => {
    storage.set(SEARCH_HISTORY_KEY, []);
    setSearchHistory([]);
  };

  const removeFromHistory = (itemToRemove) => {
    const updatedHistory = searchHistory.filter(item => item !== itemToRemove);
    storage.set(SEARCH_HISTORY_KEY, updatedHistory);
    setSearchHistory(updatedHistory);
  };

  if (!isOpen) return null;

  return (
    <div className="advanced-search-overlay" onClick={onClose}>
      <div className="advanced-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="advanced-search-header">
          <form onSubmit={handleSubmit} className="advanced-search-form">
            <div className="advanced-search-input-container">
              <svg className="advanced-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                placeholder="Search for products, categories, or brands..."
                className="advanced-search-input"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSearchResults([]);
                    setSuggestions([]);
                    setSearchMode('history');
                  }}
                  className="advanced-search-clear"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button 
              onClick={onClose}
              type="button"
              className="advanced-search-close"
              aria-label="Close search"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </form>
        </div>

        <div className="advanced-search-content">
          {loading && (
            <div className="advanced-search-loading">
              <div className="advanced-search-spinner"></div>
              <span>Searching...</span>
            </div>
          )}

          {/* Search Suggestions */}
          {showSuggestions && searchMode === 'suggestions' && suggestions.length > 0 && (
            <div className="advanced-search-suggestions">
              <h3 className="advanced-search-section-title">Suggestions</h3>
              <div className="advanced-search-suggestion-list">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`advanced-search-suggestion-item ${
                      selectedSuggestionIndex === index ? 'selected' : ''
                    }`}
                  >
                    <svg className="advanced-search-suggestion-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search History */}
          {showSuggestions && searchMode === 'history' && searchHistory.length > 0 && (
            <div className="advanced-search-history">
              <div className="advanced-search-history-header">
                <h3 className="advanced-search-section-title">Recent Searches</h3>
                <button 
                  onClick={clearSearchHistory}
                  className="advanced-search-clear-history"
                >
                  Clear All
                </button>
              </div>
              <div className="advanced-search-history-list">
                {searchHistory.map((historyItem, index) => (
                  <div
                    key={historyItem}
                    className={`advanced-search-history-item ${
                      selectedSuggestionIndex === index ? 'selected' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleHistoryClick(historyItem)}
                      className="advanced-search-history-button"
                    >
                      <svg className="advanced-search-history-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {historyItem}
                    </button>
                    <button
                      onClick={() => removeFromHistory(historyItem)}
                      className="advanced-search-history-remove"
                      title="Remove from history"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchMode === 'results' && (
            <div className="advanced-search-results">
              {searchResults.length > 0 ? (
                <>
                  <div className="advanced-search-results-header">
                    <h3 className="advanced-search-section-title">
                      Search Results ({searchResults.length})
                    </h3>
                    <Link 
                      href={`/shop?search=${encodeURIComponent(query)}`}
                      className="advanced-search-view-all"
                      onClick={onClose}
                    >
                      View All Results
                    </Link>
                  </div>
                  <div className="advanced-search-results-grid">
                    {searchResults.map((product) => (
                      <Link
                        key={product.id}
                        href={`/products/${product.id}`}
                        className="advanced-search-result-item"
                        onClick={onClose}
                      >
                        <LazyImage 
                          src={product.image || '/api/placeholder/80/80'} 
                          alt={product.name}
                          width={80}
                          height={80}
                          className="advanced-search-result-image"
                        />
                        <div className="advanced-search-result-details">
                          <h4 className="advanced-search-result-name">{product.name}</h4>
                          <p className="advanced-search-result-price">${product.price}</p>
                          {product.category && (
                            <p className="advanced-search-result-category">{product.category}</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <div className="advanced-search-no-results">
                  <svg className="advanced-search-no-results-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3>No results found</h3>
                  <p>Try different keywords or browse our categories</p>
                  <Link 
                    href="/shop" 
                    className="aesop-button-primary"
                    onClick={onClose}
                  >
                    Browse All Products
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Popular Categories */}
          {searchMode === 'history' && searchHistory.length === 0 && (
            <div className="advanced-search-categories">
              <h3 className="advanced-search-section-title">Popular Categories</h3>
              <div className="advanced-search-category-grid">
                {[
                  { name: 'Sheets', icon: '🛏️' },
                  { name: 'Pillows', icon: '🛌' },
                  { name: 'Blankets', icon: '🧸' },
                  { name: 'Mattresses', icon: '🛏️' },
                  { name: 'Cotton', icon: '🌿' },
                  { name: 'Silk', icon: '✨' }
                ].map((category) => (
                  <button
                    key={category.name}
                    onClick={() => handleSuggestionClick(category.name)}
                    className="advanced-search-category-item"
                  >
                    <span className="advanced-search-category-icon">{category.icon}</span>
                    <span className="advanced-search-category-name">{category.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook for managing advanced search
export const useAdvancedSearch = () => {
  const [searchHistory, setSearchHistory] = useState([]);

  useEffect(() => {
    const history = storage.get(SEARCH_HISTORY_KEY, []);
    setSearchHistory(history);
  }, []);

  const addToSearchHistory = (query) => {
    const history = storage.get(SEARCH_HISTORY_KEY, []);
    const updatedHistory = [
      query,
      ...history.filter(item => item !== query)
    ].slice(0, MAX_SEARCH_HISTORY);
    
    storage.set(SEARCH_HISTORY_KEY, updatedHistory);
    setSearchHistory(updatedHistory);
  };

  const clearSearchHistory = () => {
    storage.set(SEARCH_HISTORY_KEY, []);
    setSearchHistory([]);
  };

  const removeFromSearchHistory = (query) => {
    const history = storage.get(SEARCH_HISTORY_KEY, []);
    const updatedHistory = history.filter(item => item !== query);
    storage.set(SEARCH_HISTORY_KEY, updatedHistory);
    setSearchHistory(updatedHistory);
  };

  return {
    searchHistory,
    addToSearchHistory,
    clearSearchHistory,
    removeFromSearchHistory
  };
};