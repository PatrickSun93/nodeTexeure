'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Enhanced Search Bar with Autocomplete
 * Features:
 * - Real-time autocomplete suggestions
 * - Product suggestions with images
 * - Category suggestions
 * - Popular/trending searches
 * - Recently viewed products
 * - Keyboard navigation (arrow keys, enter, escape)
 */
export default function SearchBar({ 
    placeholder = "Search for luxury bedding...",
    className = "",
    autoFocus = false 
}) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [suggestions, setSuggestions] = useState({
        suggestions: [],
        products: [],
        categories: [],
        trending: [],
        popularTerms: []
    });
    const [selectedIndex, setSelectedIndex] = useState(-1);
    
    const searchRef = useRef(null);
    const inputRef = useRef(null);
    const debounceTimer = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch autocomplete suggestions
    const fetchSuggestions = async (searchQuery) => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            // Show trending/popular if empty
            fetchPopularSuggestions();
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`http://localhost:6666/api/search/autocomplete?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();
            
            if (data.status === 'SUCCESS') {
                setSuggestions(prev => ({
                    ...prev,
                    suggestions: data.keyValueTable.suggestions || [],
                    products: data.keyValueTable.products || [],
                    categories: data.keyValueTable.categories || []
                }));
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch popular/trending suggestions
    const fetchPopularSuggestions = async () => {
        try {
            const response = await fetch('http://localhost:6666/api/search/suggestions');
            const data = await response.json();
            
            if (data.status === 'SUCCESS') {
                setSuggestions(prev => ({
                    ...prev,
                    trending: data.keyValueTable.trending || [],
                    popularTerms: data.keyValueTable.popularTerms || []
                }));
            }
        } catch (error) {
            console.error('Error fetching popular suggestions:', error);
        }
    };

    // Handle input change with debouncing
    const handleInputChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        setSelectedIndex(-1);

        // Clear previous timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Debounce API call
        debounceTimer.current = setTimeout(() => {
            fetchSuggestions(value);
        }, 300);
    };

    // Handle focus - show suggestions
    const handleFocus = () => {
        setIsOpen(true);
        if (query.trim().length < 2) {
            fetchPopularSuggestions();
        } else {
            fetchSuggestions(query);
        }
    };

    // Handle search submission
    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            performSearch(query.trim());
        }
    };

    // Perform search and navigate
    const performSearch = (searchTerm) => {
        setIsOpen(false);
        router.push(`/shop?search=${encodeURIComponent(searchTerm)}`);
    };

    // Handle suggestion click
    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion);
        performSearch(suggestion);
    };

    // Handle product click
    const handleProductClick = (product) => {
        setIsOpen(false);
        router.push(`/products/${product.id}`);
    };

    // Handle category click
    const handleCategoryClick = (category) => {
        setIsOpen(false);
        router.push(`/shop?category=${encodeURIComponent(category.name)}`);
    };

    // Keyboard navigation
    const handleKeyDown = (e) => {
        const totalItems = suggestions.suggestions.length + suggestions.products.length;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestions.suggestions.length) {
                // Selected a suggestion
                handleSuggestionClick(suggestions.suggestions[selectedIndex]);
            } else if (selectedIndex >= suggestions.suggestions.length && selectedIndex < totalItems) {
                // Selected a product
                const productIndex = selectedIndex - suggestions.suggestions.length;
                handleProductClick(suggestions.products[productIndex]);
            } else {
                // No selection, just search
                handleSubmit(e);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setSelectedIndex(-1);
        }
    };

    // Calculate if item is selected
    const isItemSelected = (index) => index === selectedIndex;

    return (
        <div ref={searchRef} className={`search-bar-container ${className}`}>
            <form onSubmit={handleSubmit} className="search-bar-form">
                <div className="search-bar-input-wrapper">
                    <svg 
                        className="search-bar-icon" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                    >
                        <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                        />
                    </svg>
                    
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={handleInputChange}
                        onFocus={handleFocus}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className="search-bar-input"
                        autoFocus={autoFocus}
                        autoComplete="off"
                    />

                    {query && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('');
                                setSuggestions({
                                    suggestions: [],
                                    products: [],
                                    categories: [],
                                    trending: [],
                                    popularTerms: []
                                });
                                inputRef.current?.focus();
                            }}
                            className="search-bar-clear"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    {isLoading && (
                        <div className="search-bar-loading">
                            <div className="search-bar-spinner"></div>
                        </div>
                    )}
                </div>

                <button type="submit" className="search-bar-submit">
                    Search
                </button>
            </form>

            {/* Autocomplete Dropdown */}
            {isOpen && (
                <div className="search-bar-dropdown">
                    {/* Search Suggestions */}
                    {suggestions.suggestions.length > 0 && (
                        <div className="search-dropdown-section">
                            <h4 className="search-dropdown-title">Suggestions</h4>
                            <ul className="search-dropdown-list">
                                {suggestions.suggestions.map((suggestion, index) => (
                                    <li
                                        key={`suggestion-${index}`}
                                        className={`search-dropdown-item ${isItemSelected(index) ? 'selected' : ''}`}
                                        onClick={() => handleSuggestionClick(suggestion)}
                                    >
                                        <svg className="search-dropdown-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <span>{suggestion}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Product Suggestions */}
                    {suggestions.products.length > 0 && (
                        <div className="search-dropdown-section">
                            <h4 className="search-dropdown-title">Products</h4>
                            <ul className="search-dropdown-list">
                                {suggestions.products.map((product, index) => {
                                    const itemIndex = suggestions.suggestions.length + index;
                                    return (
                                        <li
                                            key={`product-${product.id}`}
                                            className={`search-dropdown-product ${isItemSelected(itemIndex) ? 'selected' : ''}`}
                                            onClick={() => handleProductClick(product)}
                                        >
                                            <img 
                                                src={product.image || '/api/placeholder/50/50'} 
                                                alt={product.name}
                                                className="search-dropdown-product-image"
                                            />
                                            <div className="search-dropdown-product-info">
                                                <span className="search-dropdown-product-name">{product.name}</span>
                                                <span className="search-dropdown-product-price">${product.price}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Categories */}
                    {suggestions.categories.length > 0 && (
                        <div className="search-dropdown-section">
                            <h4 className="search-dropdown-title">Categories</h4>
                            <ul className="search-dropdown-list">
                                {suggestions.categories.map((category) => (
                                    <li
                                        key={`category-${category.id}`}
                                        className="search-dropdown-item"
                                        onClick={() => handleCategoryClick(category)}
                                    >
                                        <svg className="search-dropdown-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                        </svg>
                                        <span>{category.name}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Popular Terms */}
                    {query.trim().length < 2 && suggestions.popularTerms.length > 0 && (
                        <div className="search-dropdown-section">
                            <h4 className="search-dropdown-title">Popular Searches</h4>
                            <ul className="search-dropdown-list">
                                {suggestions.popularTerms.map((term, index) => (
                                    <li
                                        key={`popular-${index}`}
                                        className="search-dropdown-item"
                                        onClick={() => handleSuggestionClick(term)}
                                    >
                                        <svg className="search-dropdown-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                        <span>{term}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Trending Products */}
                    {query.trim().length < 2 && suggestions.trending.length > 0 && (
                        <div className="search-dropdown-section">
                            <h4 className="search-dropdown-title">Trending Now</h4>
                            <ul className="search-dropdown-list">
                                {suggestions.trending.map((product) => (
                                    <li
                                        key={`trending-${product.id}`}
                                        className="search-dropdown-product"
                                        onClick={() => handleProductClick(product)}
                                    >
                                        <img 
                                            src={product.image || '/api/placeholder/50/50'} 
                                            alt={product.name}
                                            className="search-dropdown-product-image"
                                        />
                                        <div className="search-dropdown-product-info">
                                            <span className="search-dropdown-product-name">{product.name}</span>
                                            <span className="search-dropdown-product-price">${product.price}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* No Results */}
                    {query.trim().length >= 2 && 
                     suggestions.suggestions.length === 0 && 
                     suggestions.products.length === 0 && 
                     suggestions.categories.length === 0 && 
                     !isLoading && (
                        <div className="search-dropdown-empty">
                            <p>No results found for "{query}"</p>
                            <p className="search-dropdown-empty-hint">Try a different search term</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
