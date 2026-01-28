'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCartCount } from '../lib';
import CartDrawer from './CartDrawer';
import SearchBar from './SearchBar';

  export default function Header({ siteName = 'Noiraé' }) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShopMenuOpen, setIsShopMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { data: session, status } = useSession();
  const { count } = useCartCount();
  const router = useRouter();

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
    }
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
          
          <nav className="aesop-nav aesop-header-center">
            {/* Shop dropdown */}
            <div 
              className="aesop-nav-dropdown"
              onMouseEnter={() => setIsShopMenuOpen(true)}
              onMouseLeave={() => setIsShopMenuOpen(false)}
            >
              <Link href="/shop" className="aesop-nav-link">
                Shop
              </Link>
              {isShopMenuOpen && (
                <div className="aesop-dropdown-menu">
                  <Link 
                    href="/collections/silk" 
                    className="aesop-dropdown-link"
                    onClick={() => setIsShopMenuOpen(false)}
                  >
                    Silk
                  </Link>
                  <Link 
                    href="/collections/cashmere" 
                    className="aesop-dropdown-link"
                    onClick={() => setIsShopMenuOpen(false)}
                  >
                    Cashmere
                  </Link>
                  <Link 
                    href="/shop" 
                    className="aesop-dropdown-link"
                    onClick={() => setIsShopMenuOpen(false)}
                  >
                    All Products
                  </Link>
                </div>
              )}
            </div>
            
            <Link href="/about" className="aesop-nav-link">
              Our Story
            </Link>
            
            <Link href="/journal" className="aesop-nav-link">
              Journal
            </Link>
          </nav>
          
          <div className="aesop-header-actions aesop-header-right">
            {/* Enhanced Search with Autocomplete */}
            <div className="aesop-search-container">
              {isSearchOpen ? (
                <div className="aesop-search-expanded">
                  <SearchBar autoFocus={true} />
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(false)}
                    className="aesop-search-close-btn"
                    title="Close search"
                  >
                    ✕
                  </button>
                </div>
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
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="aesop-user-button-icon"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </button>
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
                <Link
                  href="/login"
                  className="aesop-sign-in-link"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </header>
  );
}