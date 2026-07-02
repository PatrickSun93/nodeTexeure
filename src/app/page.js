"use client";

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useBackendHealth } from '../lib';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { fetchSettings } from '../lib/fetchSettings';
import { useState, useEffect } from 'react';

const NewsletterSection = dynamic(
  () => import('../components/NewsletterSection'),
  { ssr: false }
);

// Hero Section Component - Full screen with serif typography
function HeroSection() {
  const t = useTranslations('Home');
  return (
    <section className="noirae-homepage-hero">
      <div className="noirae-hero-content">
        <h1 className="noirae-heading-hero">
          {t('heroTitle')}
        </h1>
        <p className="noirae-hero-description">
          {t('heroDescription')}
        </p>
        <div className="noirae-hero-actions">
          <Link href="/collections/silk" className="noirae-btn-primary noirae-btn-large">
            {t('exploreSilk')}
          </Link>
          <Link href="/collections/cashmere" className="noirae-btn-secondary noirae-btn-large">
            {t('viewCashmere')}
          </Link>
        </div>
      </div>
      <div className="noirae-hero-scroll-indicator">
        <span>{t('scrollToDiscover')}</span>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
}

// Featured Collections Component
function FeaturedCollections() {
  const t = useTranslations('Home');
  const collections = [
    {
      titleKey: 'silkCollection',
      descKey: 'silkCollectionDesc',
      accentKey: 'silkAccent',
      image: '/api/placeholder/800/600?seed=silk',
      href: '/collections/silk',
    },
    {
      titleKey: 'cashmereCollection',
      descKey: 'cashmereCollectionDesc',
      accentKey: 'cashmereAccent',
      image: '/api/placeholder/800/600?seed=cashmere',
      href: '/collections/cashmere',
    }
  ];

  return (
    <section className="noirae-collections-section">
      <div className="aesop-container">
        <div className="noirae-section-header">
          <h2 className="noirae-heading-1">{t('ourCollections')}</h2>
          <p className="noirae-section-subtitle">
            {t('collectionsSubtitle')}
          </p>
        </div>

        <div className="noirae-collections-grid">
          {collections.map((collection, index) => (
            <Link key={index} href={collection.href} className="noirae-collection-card">
              <div className="noirae-collection-image-wrapper">
                <img src={collection.image} alt={t(collection.titleKey)} className="noirae-collection-image" />
                <div className="noirae-collection-overlay">
                  <span className="noirae-collection-accent">{t(collection.accentKey)}</span>
                </div>
              </div>
              <div className="noirae-collection-info">
                <h3 className="noirae-heading-3">{t(collection.titleKey)}</h3>
                <p className="noirae-collection-description">{t(collection.descKey)}</p>
                <span className="noirae-collection-link">
                  {t('discoverCollection')}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// About Preview Component
function AboutPreview() {
  const t = useTranslations('Home');
  return (
    <section className="noirae-about-preview">
      <div className="aesop-container">
        <div className="noirae-about-content">
          <div className="noirae-about-text">
            <h2 className="noirae-heading-2">{t('aboutTitle')}</h2>
            <p className="noirae-body-text">
              {t('aboutP1')}
            </p>
            <p className="noirae-body-text">
              {t('aboutP2')}
            </p>
            <Link href="/about" className="noirae-text-link">
              {t('readOurStory')}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="noirae-about-image">
            <img src="/api/placeholder/600/800" alt="Noiraé craftsmanship" />
          </div>
        </div>
      </div>
    </section>
  );
}

// Featured Products Component
function FeaturedProducts() {
  const t = useTranslations('Home');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/products?limit=4');
        const data = await res.json();
        if (data.status === 'SUCCESS') {
          setProducts(data.keyValueTable.products || []);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  if (loading) {
    return (
      <section className="noirae-featured-products">
        <div className="aesop-container">
          <div className="noirae-loading">{t('loadingFeatured')}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="noirae-featured-products">
      <div className="aesop-container">
        <div className="noirae-section-header">
          <h2 className="noirae-heading-1">{t('featuredProducts')}</h2>
          <Link href="/shop" className="noirae-text-link">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="noirae-product-grid">
          {products.slice(0, 4).map((product) => (
            <Link key={product.id} href={`/products/${product.id}`} className="noirae-product-card">
              <div className="noirae-product-image-container">
                <img
                  src={product.image || `/api/placeholder/400/400?seed=${product.id || product.name || 'p'}`}
                  alt={product.name}
                  className="noirae-product-image"
                />
              </div>
              <div className="noirae-product-info">
                <h3 className="noirae-product-name">{product.name}</h3>
                <p className="noirae-product-description">{product.description}</p>
                <div className="noirae-product-price">
                  <span className="noirae-product-current-price">${product.price || product.base_price}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Values Section Component
function ValuesSection() {
  const t = useTranslations('Home');
  const values = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
      titleKey: 'valueQualityTitle',
      descKey: 'valueQualityDesc'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      titleKey: 'valueSustainableTitle',
      descKey: 'valueSustainableDesc'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      titleKey: 'valueDelightTitle',
      descKey: 'valueDelightDesc'
    }
  ];

  return (
    <section className="noirae-values-section">
      <div className="aesop-container">
        <div className="noirae-values-grid">
          {values.map((value, index) => (
            <div key={index} className="noirae-value-card">
              <div className="noirae-value-icon">{value.icon}</div>
              <h3 className="noirae-value-title">{t(value.titleKey)}</h3>
              <p className="noirae-value-description">{t(value.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


export default function Home() {
  const { isConnected, loading } = useBackendHealth();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await fetchSettings();
        if (!mounted) return;
        setSettings(s);
        const title = s.siteTitle || s.site_name || 'Noiraé - Luxury Bedding';
        if (typeof document !== 'undefined') {
          document.title = title;
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const siteName = settings?.site_name || 'Noiraé';

  return (
    <div className="noirae-page">
      <Header siteName={siteName} />
      <main className="noirae-main">
        <HeroSection />
        <FeaturedCollections />
        <FeaturedProducts />
        <AboutPreview />
        <ValuesSection />
        <NewsletterSection />
      </main>
      <Footer />
      
      {/* Backend Health Status - Hidden in production */}
      {process.env.NODE_ENV === 'development' && (
        <>
          {loading && (
            <div className="noirae-dev-status">
              Checking backend...
            </div>
          )}
          {!loading && !isConnected && (
            <div className="noirae-dev-status noirae-dev-error">
              Backend disconnected
            </div>
          )}
        </>
      )}
    </div>
  );
}
