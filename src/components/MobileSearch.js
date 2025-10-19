'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../lib/api';

/**
 * Enhanced Mobile Search Component
 * Provides mobile-optimized search with suggestions and voice search
 */
export default function MobileSearch({ isOpen, onClose, placeholder }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isVoiceSearchSupported, setIsVoiceSearchSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [popularTerms, setPopularTerms] = useState([]);
  const searchInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const router = useRouter();

  // Initialize voice search
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setIsVoiceSearchSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  // Load recent searches and popular terms
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('recentSearches');
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    }
    
    // Load popular terms
    loadPopularTerms();
  }, []);

  const loadPopularTerms = async () => {
    try {
      const response = await apiRequest(`/search/popular?limit=5`);
      if (response.status === 'SUCCESS' && response.keyValueTable?.popularTerms) {
        setPopularTerms(response.keyValueTable.popularTerms);
      }
    } catch (error) {
      console.log('Failed to load popular terms:', error);
    }
  };

  // Focus input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const generateSearchSuggestions = async (query) => {
    try {
      // Get suggestions from enhanced API with locale support
      const response = await apiRequest(`/search/suggestions?q=${encodeURIComponent(query)}`);
      if (response.status === 'SUCCESS' && response.keyValueTable?.suggestions) {
        const apiSuggestions = response.keyValueTable.suggestions.map(item => ({
          text: typeof item === 'string' ? item : item.suggestion,
          category: typeof item === 'object' ? item.type : 'Product'
        }));
        return apiSuggestions.slice(0, 6);
      }
    } catch (error) {
      console.log('API suggestions not available, using fallback');
    }

    // Fallback to English suggestions
    const allSuggestions = [
      { text: 'Cotton Sheets', category: 'Bedding' },
      { text: 'Silk Pillowcase', category: 'Pillows' },
      { text: 'Memory Foam Mattress', category: 'Mattresses' },
      { text: 'Bamboo Duvet', category: 'Bedding' },
      { text: 'Linen Bedding', category: 'Bedding' },
      { text: 'Down Pillow', category: 'Pillows' },
      { text: 'Weighted Blanket', category: 'Blankets' },
      { text: 'Mattress Protector', category: 'Accessories' },
      { text: 'Egyptian Cotton', category: 'Materials' },
      { text: 'Organic Bedding', category: 'Eco-Friendly' },
      { text: 'Luxury Sheets', category: 'Premium' },
      { text: 'Thread Count', category: 'Features' },
      { text: 'King Size', category: 'Sizes' },
      { text: 'Queen Size', category: 'Sizes' },
      { text: 'Twin Size', category: 'Sizes' },
      { text: 'California King', category: 'Sizes' }
    ];
    
    return allSuggestions
      .filter(suggestion => 
        suggestion.text.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 6);
  };

  const handleSearchInputChange = async (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (value.trim().length > 1) {
      const suggestions = await generateSearchSuggestions(value.trim());
      setSearchSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSearch = (query = searchQuery) => {
    if (query.trim()) {
      // Save to recent searches
      const newRecentSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(newRecentSearches);
      if (typeof window !== 'undefined') {
        localStorage.setItem('recentSearches', JSON.stringify(newRecentSearches));
      }

      router.push(`/shop?search=${encodeURIComponent(query.trim())}`);
      onClose();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion.text);
    handleSearch(suggestion.text);
  };

  const handleRecentSearchClick = (search) => {
    setSearchQuery(search);
    handleSearch(search);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('recentSearches');
    }
  };

  const startVoiceSearch = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopVoiceSearch = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-search-overlay">
      <div className="mobile-search-container">
        <div className="mobile-search-header">
          <div className="mobile-search-input-container">
            <svg className="mobile-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={handleSearchInputChange}
              placeholder={placeholder || t('placeholder')}
              className="mobile-search-input"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />

            {isVoiceSearchSupported && (
              <button
                onClick={isListening ? stopVoiceSearch : startVoiceSearch}
                className={`mobile-voice-search-btn ${isListening ? 'listening' : ''}`}
                aria-label={isListening ? 'Stop voice search' : 'Start voice search'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}

            <button
              onClick={onClose}
              className="mobile-search-close"
              aria-label="Close search"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {isListening && (
            <div className="mobile-voice-indicator">
              <div className="voice-wave"></div>
              <span>Listening...</span>
            </div>
          )}
        </div>

        <div className="mobile-search-content">
          {/* Search Suggestions */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="mobile-search-section">
              <h3 className="mobile-search-section-title">Suggestions</h3>
              <div className="mobile-search-suggestions">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="mobile-search-suggestion"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <svg className="mobile-suggestion-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <div className="mobile-suggestion-content">
                      <span className="mobile-suggestion-text">{suggestion.text}</span>
                      <span className="mobile-suggestion-category">{suggestion.category}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Searches */}
          {!showSuggestions && recentSearches.length > 0 && (
            <div className="mobile-search-section">
              <div className="mobile-search-section-header">
                <h3 className="mobile-search-section-title">Recent Searches</h3>
                <button
                  onClick={clearRecentSearches}
                  className="mobile-clear-recent-btn"
                >
                  Clear
                </button>
              </div>
              <div className="mobile-recent-searches">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    className="mobile-recent-search"
                    onClick={() => handleRecentSearchClick(search)}
                  >
                    <svg className="mobile-recent-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{search}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular Searches */}
          {!showSuggestions && recentSearches.length === 0 && (
            <div className="mobile-search-section">
              <h3 className="mobile-search-section-title">Popular Searches</h3>
              <div className="mobile-popular-searches">
                {(popularTerms.length > 0 ? popularTerms : 
                  ['Cotton Sheets', 'Silk Pillowcase', 'Memory Foam', 'Bamboo Bedding', 'Down Pillow']
                ).map((search, index) => (
                  <button
                    key={index}
                    className="mobile-popular-search"
                    onClick={() => handleRecentSearchClick(search)}
                  >
                    {search}
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