'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Head from 'next/head';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import Breadcrumb from '../../../components/Breadcrumb';
import { ProductCard } from '../../shop/page';
import { apiRequest } from '../../../lib/api';
import { generateMetaTags, generateStructuredData, generateBreadcrumbs } from '../../../lib/seo';

// Category mapping for SEO-friendly URLs
const categoryMapping = {
  'sheets': 'Sheets',
  'pillows': 'Pillows',
  'blankets': 'Blankets',
  'mattresses': 'Mattresses',
  'accessories': 'Accessories'
};

export default function CategoryPage() {
  const t = useTranslations('CategoryPage');
  const { slug } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('featured');

  const categoryName = categoryMapping[slug] || slug;
  const categoryDescriptions = {
    'sheets': t('descSheets'),
    'pillows': t('descPillows'),
    'blankets': t('descBlankets'),
    'mattresses': t('descMattresses'),
    'accessories': t('descAccessories'),
  };
  const categoryDescription = categoryDescriptions[slug] || t('descFallback', { category: categoryName });

  useEffect(() => {
    const fetchCategoryProducts = async () => {
      try {
        setLoading(true);
        setError('');
        
        const params = new URLSearchParams();
        if (categoryName !== slug) {
          params.append('category', categoryName);
        }
        
        const res = await fetch(`/api/products?${params}`);
        const data = await res.json();
        
        if (data.status === 'SUCCESS') {
          setProducts(data.keyValueTable.products || []);
        } else {
          setError(t('loadError'));
        }
      } catch (err) {
        console.error('Error fetching category products:', err);
        setError(t('loadError'));
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchCategoryProducts();
    }
  }, [slug, categoryName, t]);

  const handleAddToCart = async (product) => {
    try {
      await apiRequest('/cart/add', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          variant_id: product.variant_id ?? null,
          quantity: 1,
        }),
      });
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
      return true;
    } catch (error) {
      console.error('Error adding to cart:', error);
      return false;
    }
  };

  const handleToggleWishlist = (product, isWishlisted) => {
    console.log(`${isWishlisted ? 'Added to' : 'Removed from'} wishlist:`, product.name);
  };

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return a.price - b.price;
      case 'price-high':
        return b.price - a.price;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'newest':
        return b.isNew ? 1 : -1;
      default:
        return 0;
    }
  });

  // Generate SEO data
  const breadcrumbs = generateBreadcrumbs('category', { 
    name: categoryName, 
    slug: slug 
  });

  const categoryMetaTags = generateMetaTags({
    title: `${categoryName} - Premium Bed Textures & Luxury Linens`,
    description: categoryDescription,
    keywords: `${categoryName.toLowerCase()}, bed textures, luxury linens, premium bedding, ${slug}`,
    url: `/categories/${slug}`,
    type: 'website'
  });

  const categoryStructuredData = generateStructuredData('collection', {
    name: `${categoryName} Collection`,
    description: categoryDescription,
    url: `/categories/${slug}`,
    products: sortedProducts
  });

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-loading">
          <div className="aesop-loading-spinner"></div>
          <p>{t('loading', { category: categoryName })}</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{categoryMetaTags.title}</title>
        <meta name="description" content={categoryMetaTags.description} />
        <meta name="keywords" content={categoryMetaTags.keywords} />
        <link rel="canonical" href={categoryMetaTags.canonical} />
        
        {/* Open Graph */}
        <meta property="og:title" content={categoryMetaTags.openGraph.title} />
        <meta property="og:description" content={categoryMetaTags.openGraph.description} />
        <meta property="og:url" content={categoryMetaTags.openGraph.url} />
        <meta property="og:type" content={categoryMetaTags.openGraph.type} />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content={categoryMetaTags.twitter.card} />
        <meta name="twitter:title" content={categoryMetaTags.twitter.title} />
        <meta name="twitter:description" content={categoryMetaTags.twitter.description} />
        
        {/* Category Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(categoryStructuredData)
          }}
        />
      </Head>
      
      <div className="aesop-page">
        <Header />
        
        <div className="aesop-container">
          <Breadcrumb items={breadcrumbs} />
          
          <div className="category-header">
            <h1 className="category-title">{categoryName}</h1>
            <p className="category-description">{categoryDescription}</p>
          </div>

          {error && (
            <div className="aesop-error-banner">
              <svg className="aesop-error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="category-toolbar">
            <div className="category-results">
              <span className="results-count">
                {t('resultsCount', { count: sortedProducts.length, category: categoryName })}
              </span>
            </div>
            
            <div className="category-sort">
              <label htmlFor="category-sort-select">{t('sortBy')}</label>
              <select 
                id="category-sort-select"
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="sort-select"
              >
                <option value="featured">{t('sortFeatured')}</option>
                <option value="newest">{t('sortNewest')}</option>
                <option value="price-low">{t('sortPriceLow')}</option>
                <option value="price-high">{t('sortPriceHigh')}</option>
                <option value="name">{t('sortName')}</option>
              </select>
            </div>
          </div>

          <div className="product-grid-seo">
            {sortedProducts.length > 0 ? (
              sortedProducts.map(product => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  onAddToCart={handleAddToCart}
                  onToggleWishlist={handleToggleWishlist}
                />
              ))
            ) : (
              <div className="no-products">
                <h2>{t('noProductsTitle', { category: categoryName })}</h2>
                <p>{t('noProductsText', { category: categoryName.toLowerCase() })}</p>
                <a href="/shop" className="back-to-shop-btn">{t('browseAll')}</a>
              </div>
            )}
          </div>
        </div>
        
        <Footer />
      </div>
    </>
  );
}