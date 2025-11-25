"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import ImageZoom from '../../../components/common/ImageZoom';
import { apiRequest } from '../../../lib/api';


export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  // Fetch product details
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/products/${id}`);
        const data = await res.json();
        // Backend uses ResponseFormatter with { status, keyValueTable }
        if (data?.status === "SUCCESS") {
          const details = data.keyValueTable || null;
          setProduct(details);
          // Preselect first variant if available
          if (details?.variants?.length) {
            setSelectedVariantId(details.variants[0].id);
          } else {
            setSelectedVariantId(null);
          }
        } else {
          setError(data?.message || "Failed to fetch product");
        }
      } catch (err) {
        console.error(err);
        setError("Error fetching product");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchProduct();
  }, [id]);

  const handleAddToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      await apiRequest('/cart/add', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          variant_id: selectedVariantId ?? null,
          quantity: 1,
        }),
      });
      // Notify the rest of the app (Header/useCartCount) to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
    } catch (err) {
      console.error('Add to cart failed:', err);
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-8">{error}</div>
      <Footer />
    </div>
  );
  if (!product) return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-8">Product not found</div>
      <Footer />
    </div>
  );

  // Prepare images for ImageZoom component
  const productImages = product.images?.map(img => img.original_url || img.thumbnail_small_url) || ['/api/placeholder/600/600'];

  return (
    <div className="aesop-page">
      <Header />
      
      <main className="aesop-container">
        <div className="noirae-product-detail">
          {/* Product Images Section */}
          <div className="noirae-product-detail-images">
            <ImageZoom images={productImages} alt={product.name} />
          </div>

          {/* Product Info Section */}
          <div className="noirae-product-detail-info">
            <div className="noirae-product-detail-header">
              <h1 className="noirae-heading-1">{product.name}</h1>
              <div className="noirae-product-detail-price">
                <span className="noirae-price-main">${product.base_price}</span>
                {product.originalPrice && (
                  <span className="noirae-price-original">${product.originalPrice}</span>
                )}
              </div>
            </div>

            <div className="noirae-product-detail-description">
              <p>{product.description}</p>
            </div>

            {/* Product Details Grid */}
            <div className="noirae-product-details-grid">
              {product.material && (
                <div className="noirae-detail-item">
                  <span className="noirae-detail-label">Material</span>
                  <span className="noirae-detail-value">{product.material}</span>
                </div>
              )}
              {product.threadCount && (
                <div className="noirae-detail-item">
                  <span className="noirae-detail-label">Thread Count</span>
                  <span className="noirae-detail-value">{product.threadCount}</span>
                </div>
              )}
              {product.brand && (
                <div className="noirae-detail-item">
                  <span className="noirae-detail-label">Brand</span>
                  <span className="noirae-detail-value">{product.brand}</span>
                </div>
              )}
            </div>

            {/* Variants Selector */}
            {product.variants?.length > 0 && (
              <div className="noirae-variant-selector">
                <h3 className="noirae-variant-label">Select Options</h3>
                <div className="noirae-variant-options">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`noirae-variant-option ${selectedVariantId === v.id ? 'active' : ''}`}
                    >
                      <div className="noirae-variant-name">{v.size} - {v.color}</div>
                      <div className="noirae-variant-price">+${v.price_adjustment}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to Cart Button */}
            <div className="noirae-product-actions">
              <button
                onClick={handleAddToCart}
                disabled={adding}
                className="noirae-btn-primary noirae-btn-large"
              >
                {adding ? 'Adding to Cart...' : 'Add to Cart'}
              </button>
              <button className="noirae-btn-secondary noirae-btn-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

            {/* Product Features */}
            <div className="noirae-product-features">
              <div className="noirae-feature-item">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Free shipping on orders over $100</span>
              </div>
              <div className="noirae-feature-item">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>30-day return policy</span>
              </div>
              <div className="noirae-feature-item">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>1-year warranty</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        {product.reviews?.length > 0 && (
          <div className="noirae-reviews-section">
            <h2 className="noirae-heading-2">Customer Reviews</h2>
            <div className="noirae-reviews-grid">
              {product.reviews.map((r) => (
                <div key={r.id} className="noirae-review-card">
                  <div className="noirae-review-rating">
                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  </div>
                  <p className="noirae-review-comment">{r.comment}</p>
                  {r.reviewer_name && (
                    <p className="noirae-review-author">— {r.reviewer_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}