'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCartCount } from '../lib';
import CartDrawer from './CartDrawer';
import MobileSearch from './MobileSearch';

  export default function Header({ siteName = 'Noiraé' }) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { data: session, status } = useSession();
  const { count } = useCartCount();
  const router = useRouter();

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
    setIsUserMenuOpen(false);
  };

  const handleSignIn = () => {
    signIn();
    setIsUserMenuOpen(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsSearchOpen(false);
      setShowSuggestions(false);
    }
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Generate search suggestions
    if (value.trim().length > 1) {
      const suggestions = generateSearchSuggestions(value.trim());
      setSearchSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const generateSearchSuggestions = (query) => {
    // Sample suggestions - in a real app, this would come from an API
    const allSuggestions = [
      'Cotton Sheets', 'Silk Pillowcase', 'Memory Foam Mattress', 'Bamboo Duvet',
      'Linen Bedding', 'Down Pillow', 'Weighted Blanket', 'Mattress Protector',
      'Egyptian Cotton', 'Organic Bedding', 'Luxury Sheets', 'Thread Count',
      'King Size', 'Queen Size', 'Twin Size', 'California King'
    ];
    
    return allSuggestions
      .filter(suggestion => 
        suggestion.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 5);
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    router.push(`/shop?search=${encodeURIComponent(suggestion)}`);
    setIsSearchOpen(false);
    setShowSuggestions(false);
  };

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen);
    if (!isSearchOpen) {
      // Focus on search input when opening
      setTimeout(() => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
      }, 100);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close mobile menu when screen size changes
  useEffect(() => {
    if (!isMobile && isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile, isMobileMenuOpen]);

  return (
    <header className="aesop-header">
      <div className="aesop-container">
        <div className="aesop-header-content">
          <div className="aesop-header-left">
            <div className="aesop-logo">
              <Link href="/" className="aesop-logo-link">
                {siteName}
              </Link>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          {!isMobile && (
            <nav className="aesop-nav aesop-header-center">
              <Link href="/new-arrive" className="aesop-nav-link">
                NEW ARRIVE
              </Link>
              <Link href="/shop" className="aesop-nav-link">
                BEDDING
              </Link>
              <Link href="/shop" className="aesop-nav-link">
                BATH
              </Link>
               <Link href="/shop" className="aesop-nav-link">
                LIVING
              </Link>
              <Link href="/shop" className="aesop-nav-link">
                SHOP
              </Link>
              <Link href="/about" className="aesop-nav-link">
                ABOUT
              </Link>
              <Link href="/contact" className="aesop-nav-link">
                CONTACT
              </Link>
            </nav>
          )}
          
          <div className="aesop-header-actions aesop-header-right">
            {/* Mobile Menu Button */}
            {isMobile && (
              <button
                onClick={toggleMobileMenu}
                className="aesop-icon-button mobile-menu-toggle"
                aria-label="Toggle mobile menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            {/* Search */}
            <div className="aesop-search-container">
              {isMobile ? (
                <button
                  onClick={toggleSearch}
                  className="aesop-icon-button"
                  title="Search products"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              ) : isSearchOpen ? (
                <form onSubmit={handleSearch} className="aesop-search-form">
                  <input
                    id="search-input"
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    placeholder="Search products..."
                    className="aesop-search-input"
                    onBlur={() => {
                      // Close search if clicking outside and no query
                      setTimeout(() => {
                        if (!searchQuery.trim()) {
                          setIsSearchOpen(false);
                          setShowSuggestions(false);
                        }
                      }, 200);
                    }}
                    onFocus={() => {
                      if (searchQuery.trim().length > 1) {
                        setShowSuggestions(true);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="aesop-search-submit"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                      setShowSuggestions(false);
                    }}
                    className="aesop-search-close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  
                  {/* Search Suggestions */}
                  {showSuggestions && searchSuggestions.length > 0 && (
                    <div className="aesop-search-suggestions">
                      {searchSuggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="aesop-search-suggestion"
                          onClick={() => handleSuggestionClick(suggestion)}
                          onMouseDown={(e) => e.preventDefault()} // Prevent blur
                        >
                          <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              ) : (
                <button
                  onClick={toggleSearch}
                  className="aesop-icon-button"
                  title="Search products"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              )}
            </div>

            <button
              type="button"
              className="aesop-cart-link"
              onClick={() => setIsCartOpen(true)}
              aria-label="Open cart"
              title="Open cart"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9" />
              </svg>
              {count > 0 && (
                <span className="aesop-cart-count">
                  {count}
                </span>
              )}
            </button>

            <div className="aesop-user-menu">
              {status === 'loading' ? (
                <div className="aesop-loading-avatar"></div>
              ) : session ? (
                <div>
                  <div className="aesop-user-split-container">
                    <button
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="aesop-user-button"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </button>
                    <span className="aesop-vip-label-separate">VIP</span>
                  </div>
                  {isUserMenuOpen && (
                    <div className="aesop-dropdown">
                      <Link
                        href="/profile"
                        className="aesop-dropdown-item"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="aesop-dropdown-item aesop-dropdown-button"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleSignIn}
                  className="aesop-button-primary"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobile && isMobileMenuOpen && (
          <div className="mobile-nav-overlay" onClick={toggleMobileMenu}>
            <nav className="mobile-nav-menu" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-nav-header">
                <h3>Menu</h3>
                <button
                  onClick={toggleMobileMenu}
                  className="aesop-icon-button"
                  aria-label="Close menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mobile-nav-links">
                <Link href="/new-arrive" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  NEW ARRIVE
                </Link>
                <Link href="/shop" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  BEDDING
                </Link>
                <Link href="/shop" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  BATH
                </Link>
                <Link href="/shop" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  LIVING
                </Link>
                <Link href="/shop" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  SHOP
                </Link>
                <Link href="/about" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  ABOUT
                </Link>
                <Link href="/contact" className="mobile-nav-link" onClick={toggleMobileMenu}>
                  CONTACT
                </Link>
              </div>
              {!session && (
                <div className="mobile-nav-auth">
                  <button
                    onClick={() => {
                      handleSignIn();
                      toggleMobileMenu();
                    }}
                    className="aesop-button-primary mobile-auth-btn"
                  >
                    Sign In
                  </button>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      
      {/* Mobile Search Overlay */}
      <MobileSearch 
        isOpen={isMobile && isSearchOpen} 
        onClose={() => {
          setIsSearchOpen(false);
          setShowSuggestions(false);
        }} 
      />
    </header>
  );
}