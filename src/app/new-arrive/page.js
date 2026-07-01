"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
export default function NewArrivePage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch products from backend and map to UI-friendly structure
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products?page=1&limit=24`);
      const data = await res.json();

      if (data?.status === "SUCCESS") {
        const rows = data.keyValueTable?.products || [];
        // Map DB rows to UI model
        const mapped = rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.short_description || row.description || "",
          price: Number(row.base_price || 0),
          // No listing image in API yet – use placeholder (could be enhanced with an images join)
          image: "/api/placeholder/300/300",
          created_at: row.created_at,
        }));
        setProducts(mapped);
      } else {
        setProducts([]);
      }
    } catch (e) {
      console.error("Failed to fetch products for New Arrive:", e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Determine new arrivals: within last 60 days or explicitly flagged in sample
  const newArrivals = useMemo(() => {
    const days = 60;
    const now = Date.now();
    const base = products;
    const selected = base.filter((p) => {
      if (p.isNew) return true;
      if (!p.created_at) return false;
      const created = new Date(p.created_at).getTime();
      return Number.isFinite(created) && now - created <= days * 24 * 60 * 60 * 1000;
    });
    // Ensure ProductCard shows the New badge even for backend items by setting isNew: true
    return selected.map((p) => ({ ...p, isNew: true }));
  }, [products]);

  // Remove old newArrivals and notableFormulations if not used
  // Notable formulations: the rest/top picks
  const notableFormulations = useMemo(() => {
    const base = products;
    return base.filter((p) => !newArrivals.some((n) => n.id === p.id)).slice(0, 8);
  }, [products, newArrivals]);

  // Settings + products fetch: use 'newarrival' array of ids if available
  const fetchSettingsAndProducts = async () => {
    setLoading(true);
    try {
      // 1) Get public settings
      const settingsRes = await fetch('/api/settings/public');
      const settingsJson = await settingsRes.json();
      const publicSettings = settingsJson?.keyValueTable || {};
      setSettings(publicSettings);

      const ids = Array.isArray(publicSettings?.newarrival) ? publicSettings.newarrival : [];

      if (ids.length > 0) {
        // 2) Fetch products by ids preserving order
        const query = new URLSearchParams();
        query.set('ids', ids.join(','));
        const prodRes = await fetch(`/api/products/by-ids?${query.toString()}`);
        const prodJson = await prodRes.json();
        if (prodJson?.status === 'SUCCESS') {
          const rows = prodJson.keyValueTable?.products || [];
          const mapped = rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.short_description || row.description || '',
            price: Number(row.base_price || 0),
            image: '/api/placeholder/300/300',
            created_at: row.created_at,
          }));
          setProducts(mapped);
        } else {
          setProducts([]);
        }
      } else {
        // No ids in settings -> empty, let UI fallback handle
        setProducts([]);
      }
    } catch (err) {
      console.error('Failed fetching settings/products:', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alternating layout source: use products from settings; no sample fallback here per requirement
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
    console.log(`${isWishlisted ? "Added to" : "Removed from"} wishlist:`, product.name);
  };

  return (
    <div className="aesop-page">
      <Header />

      {/* Hero Section */}
      <section className="noirae-hero">
        <div className="aesop-container">
          <h1 className="noirae-hero-title">New Arrive</h1>
          <p className="noirae-hero-subtitle">
            Recent additions to the range and formulations everyone should know about—be they much-adored or gravely unsung.
          </p>
          <div>
            <Link href="#banner" className="aesop-button-primary">Discover</Link>
          </div>
        </div>
      </section>

      {/* Full-width banner between Discover and New Additions */}
      <section id="banner" className="aesop-section" style={{padding: 0}}>
        <div className="aesop-fullwidth-image" style={{width: '100%', overflow: 'hidden'}}>
          <img src="/file.svg" alt="New Arrivals banner" style={{display: 'block', width: '100%', height: 'auto'}} />
        </div>
      </section>

      {/* New Additions (alternating layout: single list per row) */}
      <section id="new-additions" className="aesop-section">
        <div className="aesop-container">
          <h2 className="aesop-section-title">New additions</h2>
          {loading ? (
            <div className="aesop-loading">
              <div className="aesop-loading-spinner"></div>
              <p>Loading products...</p>
            </div>
          ) : items.length === 0 ? (
            <p>No products configured in settings.newarrival.</p>
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
                        <img src="/globe.svg" alt={`${product.name} showcase`} style={{width:'100%', height:'auto', display:'block'}} />
                      </div>
                    )}

                    {/* Right column */}
                    {!isEven ? (
                      <div>
                        <img src="/window.svg" alt={`${product.name} detail visual`} style={{width:'100%', height:'auto', display:'block'}} />
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
          <h2 className="aesop-section-title">Featured highlights</h2>
          <div className="aesop-features-grid">
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Above Us, Steorra</h3>
              <p className="aesop-feature-description">Premium fragrance with celestial nuance.</p>
              <Link href="#new-additions" className="aesop-button-secondary">Explore</Link>
            </div>
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Eleos Nourishing Body Cleanser</h3>
              <p className="aesop-feature-description">Aromatic, gentle cleanse for daily ritual.</p>
              <Link href="#new-additions" className="aesop-button-secondary">Shop now</Link>
            </div>
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Lucent Duo</h3>
              <p className="aesop-feature-description">A refined skincare combination set.</p>
              <Link href="#new-additions" className="aesop-button-secondary">Discover</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Consultation Section */}
      <section className="aesop-section">
        <div className="aesop-container aesop-features">
          <div className="aesop-features-grid">
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Consultation</h3>
              <p className="aesop-feature-description">Speak to a real consultant to personalize your regimen.</p>
              <Link href="/contact" className="aesop-button-primary">Speak with us</Link>
            </div>
            <div className="aesop-feature-card">
              <h3 className="aesop-feature-title">Recommended reading</h3>
              <p className="aesop-feature-description">Editorial content, ingredient stories and regimen guidance.</p>
              <Link href="/blog" className="aesop-button-secondary">Read articles</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}