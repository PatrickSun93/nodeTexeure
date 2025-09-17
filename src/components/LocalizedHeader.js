'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCartCount } from '../lib';
import CartDrawer from './CartDrawer';
import MobileSearch from './MobileSearch';
import AdvancedSearch from './AdvancedSearch';
import ProductComparison, { useProductComparison } from './ProductComparison';
import Wishlist, { useWishlist } from './Wishlist';
import RecentlyViewed, { useRecentlyViewed } from './RecentlyViewed';
import LanguageSwitcher from './LanguageSwitcher';
import { useLocaleRouter } from '../hooks/useLocaleRouter';

export default function LocalizedHeader({ siteName = 'Noiraé' }) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isRecentlyViewedOpen, setIsRecentlyViewedOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const { data: session, status } = useSession();
  const { count } = useCartCount();
  const { comparisonCount } = useProductComparison();
  const { wishlistCount } = useWishlist();
  const { recentlyViewedCount } = useRecentlyViewed();
  const router = useLocaleRouter();
  
  // Translations
  const t = useTranslations('navigation');
  const tCommon = useTranslations('common');
  const tSearch = useTranslations('search');
  const tAuth = useTranslations('auth');

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

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setShowSuggestions(false);
      setIsSearchOpen(false);
    }
  };

  const handleSearchInputChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.length > 2) {
      try {
        const response = await fetch(`/api/products/search/suggestions?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const suggestions = await response.json();
          setSearchSuggestions(suggestions.slice(0, 5));
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Error fetching search suggestions:', error);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const navigationItems = [
    { key: 'home', href: '/' },
    { key: 'shop', href: '/shop' },
    { key: 'categories', href: '/categories' },
    { key: 'about', href: '/about' },
    { key: 'contact', href: '/contact' }
  ];

  return (
    <>
      <header className="aesop-header">
        <div className="aesop-container">
          <div className="aesop-header-content">
            {/* Logo */}
            <div className="aesop-logo">
              <Link href="/" className="aesop-logo-link">
                {siteName}
              </Link>
            </div>

            {/* Desktop Navigation */}
            {!isMobile && (
              <nav className="aesop-nav">
                <ul className="aesop-nav-list">
                  {navigationItems.map((item) => (
                    <li key={item.key} className="aesop-nav-item">
                      <Link href={item.href} className="aesop-nav-link">
                        {t(item.key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {/* Search Bar (Desktop) */}
            {!isMobile && (
              <div className="aesop-search-container">
                <form onSubmit={handleSearch} className="aesop-search-form">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    placeholder={tSearch('placeholder')}
                    className="aesop-search-input"
                    onFocus={() => searchQuery.length > 2 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  />
                  <button type="submit" className="aesop-search-button">
                    <svg className="aesop-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </form>

                {/* Search Suggestions */}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="aesop-search-suggestions">
                    {searchSuggestions.map((suggestion, index) => (
                      <Link
                        key={index}
                        href={`/products/${suggestion.id}`}
                        className="aesop-search-suggestion"
                        onClick={() => {
                          setShowSuggestions(false);
                          setSearchQuery('');
                        }}
                      >
                        <span className="aesop-suggestion-name">{suggestion.name}</span>
                        <span className="aesop-suggestion-price">${suggestion.price}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Header Actions */}
            <div className="aesop-header-actions">
              {/* Advanced Search Toggle */}
              <button
                onClick={() => setIsAdvancedSearchOpen(true)}
                className="aesop-action-button"
                title={tSearch('filters')}
              >
                <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
              </button>

              {/* Product Comparison */}
              <button
                onClick={() => setIsComparisonOpen(true)}
                className="aesop-action-button"
                title="Product Comparison"
              >
                <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {comparisonCount > 0 && (
                  <span className="aesop-action-badge">{comparisonCount}</span>
                )}
              </button>

              {/* Wishlist */}
              <button
                onClick={() => setIsWishlistOpen(true)}
                className="aesop-action-button"
                title="Wishlist"
              >
                <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {wishlistCount > 0 && (
                  <span className="aesop-action-badge">{wishlistCount}</span>
                )}
              </button>

              {/* Recently Viewed */}
              <button
                onClick={() => setIsRecentlyViewedOpen(true)}
                className="aesop-action-button"
                title="Recently Viewed"
              >
                <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {recentlyViewedCount > 0 && (
                  <span className="aesop-action-badge">{recentlyViewedCount}</span>
                )}
              </button>

              {/* Cart */}
              <button
                onClick={() => setIsCartOpen(true)}
                className="aesop-action-button"
                title={t('cart')}
              >
                <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9m-9 0h9" />
                </svg>
                {count > 0 && (
                  <span className="aesop-action-badge">{count}</span>
                )}
              </button>

              {/* Language Switcher */}
              <LanguageSwitcher />

              {/* User Menu */}
              <div className="aesop-user-menu">
                {status === 'loading' ? (
                  <div className="aesop-loading-spinner"></div>
                ) : session ? (
                  <div className="aesop-user-dropdown">
                    <button
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="aesop-user-button"
                    >
                      <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </button>
                    {isUserMenuOpen && (
                      <div className="aesop-dropdown-menu">
                        <Link href="/profile" className="aesop-dropdown-item">
                          {t('profile')}
                        </Link>
                        <Link href="/orders" className="aesop-dropdown-item">
                          {t('orders')}
                        </Link>
                        <button onClick={handleSignOut} className="aesop-dropdown-item">
                          {tAuth('logout')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aesop-auth-buttons">
                    <Link href="/login" className="aesop-auth-link">
                      {tAuth('login')}
                    </Link>
                    <Link href="/register" className="aesop-auth-link aesop-auth-primary">
                      {tAuth('register')}
                    </Link>
                  </div>
                )}
              </div>

              {/* Mobile Menu Toggle */}
              {isMobile && (
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="aesop-mobile-menu-toggle"
                >
                  <svg className="aesop-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Menu */}
          {isMobile && isMobileMenuOpen && (
            <div className="aesop-mobile-menu">
              <nav className="aesop-mobile-nav">
                {navigationItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="aesop-mobile-nav-link"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t(item.key)}
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Search */}
      {isMobile && (
        <MobileSearch
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          searchQuery={searchQuery}
          onSearchChange={handleSearchInputChange}
          onSearch={handleSearch}
          suggestions={searchSuggestions}
          showSuggestions={showSuggestions}
        />
      )}

      {/* Drawers and Modals */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <AdvancedSearch isOpen={isAdvancedSearchOpen} onClose={() => setIsAdvancedSearchOpen(false)} />
      <ProductComparison isOpen={isComparisonOpen} onClose={() => setIsComparisonOpen(false)} />
      <Wishlist isOpen={isWishlistOpen} onClose={() => setIsWishlistOpen(false)} />
      <RecentlyViewed isOpen={isRecentlyViewedOpen} onClose={() => setIsRecentlyViewedOpen(false)} />
    </>
  );
}