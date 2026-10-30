"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { apiRequest } from "../../lib/api";
import { ProductCard } from "../shop/page";

/**
 * New Arrive Page
 * - Showcases products from system settings 'newarrival' key
 * - Features full-width banner between hero and products
 * - Alternating product-image layout with responsive design
 * - Reuses existing ProductCard styles for consistency
 */
// Editorial column beside each product card: name, description, link through.
function ProductStory({ product }) {
  const t = useTranslations('NewArrive');
  return (
    <div style={{ padding: '1rem 0' }}>
      <h3 style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: '1.75rem', marginBottom: '0.75rem' }}>
        {product.name}
      </h3>
      {product.description && (
        <p style={{ color: 'var(--noirae-text-secondary)', lineHeight: 1.7, marginBottom: '1.25rem' }}>{product.description}</p>
      )}
      <Link href={`/products/${product.id}`} className="aesop-button-secondary">{t('explore')}</Link>
    </div>
  );
}

export default function NewArrivePage() {
  const t = useTranslations('NewArrive');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // One loader: the admin-curated list (public setting `newarrival`, an array of
  // product ids) when set, otherwise the newest products. (Two independent
  // fetches used to race, and the settings one blanked the list when unset.)
  useEffect(() => {
    let cancelled = false;
    const toCard = (row) => ({
      id: row.id,
      name: row.name,
      description: row.short_description || row.description || '',
      price: Number(row.base_price || 0),
      image: row.image,
      created_at: row.created_at,
    });
    (async () => {
      try {
        const settingsJson = await (await fetch('/api/settings/public')).json();
        const ids = Array.isArray(settingsJson?.keyValueTable?.newarrival) ? settingsJson.keyValueTable.newarrival : [];
        const url = ids.length
          ? `/api/products/by-ids?${new URLSearchParams({ ids: ids.join(',') })}`
          : '/api/products?page=1&limit=12';
        const json = await (await fetch(url)).json();
        const rows = json?.status === 'SUCCESS' ? json.keyValueTable?.products || [] : [];
        const ordered = ids.length ? rows : [...rows].sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
        if (!cancelled) setProducts(ordered.map(toCard));
      } catch (err) {
        console.error('Failed to load new arrivals:', err);
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const items = products;

  const handleAddToCart = async (product) => {
    try {
      await apiRequest("/cart/add", {
        method: "POST",
        body: JSON.stringify({
          product_id: product.id,
          variant_id: product.variant_id ?? null,
          quantity: 1,
        }),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("cart:updated"));
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
    }
  };

  const handleToggleWishlist = (product, isWishlisted) => {
  };

  return (
    <div className="aesop-page">
      <Header />

      {/* Hero Section */}
      <section className="noirae-hero">
        <div className="aesop-container">
          <h1 className="noirae-hero-title">{t('heroTitle')}</h1>
          <p className="noirae-hero-subtitle">
            {t('heroSubtitle')}
          </p>
          <div>
            <Link href="#banner" className="aesop-button-primary">{t('discover')}</Link>
          </div>
        </div>
      </section>

      {/* Full-width banner between Discover and New Additions */}
      <section id="banner" className="aesop-section" style={{padding: 0}}>
        <div className="aesop-fullwidth-image" style={{width: '100%', overflow: 'hidden'}}>
          <Image src="/images/bedding/bed-10.jpg" alt={t('bannerAlt')} width={900} height={600} sizes="100vw" priority
            style={{display: 'block', width: '100%', height: 'auto', maxHeight: '480px', objectFit: 'cover'}} />
        </div>
      </section>

      {/* New Additions (alternating layout: single list per row) */}
      <section id="new-additions" className="aesop-section">
        <div className="aesop-container">
          <h2 className="aesop-section-title">{t('newAdditionsTitle')}</h2>
          {loading ? (
            <div className="aesop-loading">
              <div className="aesop-loading-spinner"></div>
              <p>{t('loading')}</p>
            </div>
          ) : items.length === 0 ? (
            <p>{t('emptyState')}</p>
          ) : (
            <div className="aesop-alternating-list">
              {items.map((product, index) => {
                const isEven = index % 2 === 1;
                return (
                  <div key={product.id} className="aesop-row" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center', marginBottom: '3rem'}}>
                    {/* Left column */}
                    {!isEven ? (
                      <div>
                        <ProductCard
                          product={{...product, isNew: true}}
                          onAddToCart={handleAddToCart}
                          onToggleWishlist={handleToggleWishlist}
                        />
                      </div>
                    ) : (
                      <div>
                        <ProductStory product={product} />
                      </div>
                    )}

                    {/* Right column */}
                    {!isEven ? (
                      <div>
                        <ProductStory product={product} />
                      </div>
                    ) : (
                      <div>
                        <ProductCard
                          product={{...product, isNew: true}}
                          onAddToCart={handleAddToCart}
                          onToggleWishlist={handleToggleWishlist}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Featured Highlights remains */}
      <section className="aesop-section">
        <div className="aesop-container">
          <h2 className="aesop-section-title">{t('featuredHighlightsTitle')}</h2>
          <div className="aesop-features-grid">
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Above Us, Steorra</h3>
              <p className="aesop-feature-description">{t('featuredDesc1')}</p>
              <Link href="#new-additions" className="aesop-button-secondary">{t('explore')}</Link>
            </div>
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Eleos Nourishing Body Cleanser</h3>
              <p className="aesop-feature-description">{t('featuredDesc2')}</p>
              <Link href="#new-additions" className="aesop-button-secondary">{t('shopNow')}</Link>
            </div>
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Lucent Duo</h3>
              <p className="aesop-feature-description">{t('featuredDesc3')}</p>
              <Link href="#new-additions" className="aesop-button-secondary">{t('discover')}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Consultation Section */}
      <section className="aesop-section">
        <div className="aesop-container aesop-features">
          <div className="aesop-features-grid">
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">{t('consultationTitle')}</h3>
              <p className="aesop-feature-description">{t('consultationDesc')}</p>
              <Link href="/contact" className="aesop-button-primary">{t('speakWithUs')}</Link>
            </div>
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">{t('recommendedReadingTitle')}</h3>
              <p className="aesop-feature-description">{t('recommendedReadingDesc')}</p>
              <Link href="/journal" className="aesop-button-secondary">{t('readArticles')}</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}