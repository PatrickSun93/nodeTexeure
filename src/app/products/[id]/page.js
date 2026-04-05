"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import ImageZoom from '../../../components/common/ImageZoom';
import ReviewList from '../../../components/reviews/ReviewList';
import ReviewForm from '../../../components/reviews/ReviewForm';
import { apiRequest } from '../../../lib/api';
import WishlistButton from '../../../components/common/WishlistButton';


export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewKey, setReviewKey] = useState(0);

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

  const stockQty = product.stock_quantity ?? product.quantity ?? null;
  const isOutOfStock = stockQty !== null && stockQty <= 0;
  const isLowStock = stockQty !== null && stockQty > 0 && stockQty <= 5;

  return (
    <div className="aesop-page">
      <Header />
      
      <main className="aesop-container">
        {/* Breadcrumb */}
        <nav className="nt-breadcrumb" style={{ marginBottom: '1rem' }}>
          <Link href="/">Home</Link>
          <span className="nt-breadcrumb-sep">/</span>
          <Link href="/shop">Shop</Link>
          <span className="nt-breadcrumb-sep">/</span>
          <span>{product.name}</span>
        </nav>

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
              {/* Stock Badge */}
              {isOutOfStock ? (
                <span className="nt-stock-badge nt-stock-badge-out">Out of Stock</span>
              ) : isLowStock ? (
                <span className="nt-stock-badge nt-stock-badge-low">Only {stockQty} left</span>
              ) : stockQty !== null ? (
                <span className="nt-stock-badge nt-stock-badge-in">In Stock</span>
              ) : null}
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
                disabled={adding || isOutOfStock}
                className="noirae-btn-primary noirae-btn-large"
              >
                {isOutOfStock ? 'Out of Stock' : adding ? 'Adding to Cart...' : 'Add to Cart'}
              </button>
              <WishlistButton productId={id} variantId={selectedVariant?.id} />
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
        <div className="noirae-reviews-section" style={{ marginTop: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="noirae-heading-2">Customer Reviews</h2>
            <button
              onClick={() => setShowReviewForm(!showReviewForm)}
              className="noirae-btn-secondary"
              style={{ padding: '0.5rem 1.5rem' }}
            >
              {showReviewForm ? 'Cancel' : 'Write a Review'}
            </button>
          </div>

          {showReviewForm && (
            <div style={{ marginBottom: '2rem' }}>
              <ReviewForm
                productId={product.id}
                onSuccess={() => {
                  setShowReviewForm(false);
                  setReviewKey(prev => prev + 1);
                }}
                onCancel={() => setShowReviewForm(false)}
              />
            </div>
          )}

          <ReviewList key={reviewKey} productId={product.id} />
        </div>
      </main>

      <Footer />
    </div>
  );
}