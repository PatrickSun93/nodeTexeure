"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { apiRequest } from '../../../lib/api';

function Breadcrumb({ productName }) {
  return (
    <div className="bg-amber-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{productName}</h1>
          <nav className="flex justify-center items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-600 hover:text-amber-600">Home</Link>
            <span className="text-gray-400">&gt;</span>
            <Link href="/shop" className="text-gray-600 hover:text-amber-600">Shop</Link>
            <span className="text-gray-400">&gt;</span>
            <span className="text-gray-900 font-medium">{productName}</span>
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');

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
          // Set initial image
          if (details?.images?.length) {
            setSelectedImage(details.images[0].original_url);
            setCurrentImageIndex(0);
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

  // Image gallery functions
  const selectImage = (imageUrl, index) => {
    setSelectedImage(imageUrl);
    setCurrentImageIndex(index);
  };

  const nextImage = () => {
    if (product?.images && currentImageIndex < product.images.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      setSelectedImage(product.images[newIndex].original_url);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      const newIndex = currentImageIndex - 1;
      setCurrentImageIndex(newIndex);
      setSelectedImage(product.images[newIndex].original_url);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      await apiRequest('/cart/add', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          variant_id: selectedVariantId ?? null,
          quantity: quantity,
        }),
      });
      // Notify the rest of the app (Header/useCartCount) to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
    } catch (err) {
      console.error('Add to cart failed:', err);
      setError('Failed to add item to cart');
    } finally {
      setAdding(false);
    }
  };

  if (loading) return (
    <div className="aesop-page">
      <Header />
      <div className="product-loading">
        <div className="product-loading-spinner"></div>
        <p>Loading product details...</p>
      </div>
      <Footer />
    </div>
  );
  
  if (error) return (
    <div className="aesop-page">
      <Header />
      <div className="product-error-page">
        <svg className="product-error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2>Error Loading Product</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} className="product-retry-btn">
          Try Again
        </button>
      </div>
      <Footer />
    </div>
  );
  
  if (!product) return (
    <div className="aesop-page">
      <Header />
      <div className="product-not-found">
        <h2>Product Not Found</h2>
        <p>The product you're looking for doesn't exist or has been removed.</p>
        <a href="/shop" className="product-back-btn">Back to Shop</a>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="aesop-page">
      <Header />
      <Breadcrumb productName={product.name} />
      <div className="product-detail-container">
        <div className="product-detail-grid">
          <div className="product-gallery">
            {/* Main image */}
            <div className="product-main-image">
              <img 
                src={selectedImage || product.images?.[0]?.original_url || '/api/placeholder/600/600'} 
                alt={product.name}
                className="product-image-main"
              />
              {product.images?.length > 1 && (
                <div className="product-image-nav">
                  <button 
                    onClick={prevImage}
                    className="product-image-nav-btn"
                    disabled={currentImageIndex === 0}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button 
                    onClick={nextImage}
                    className="product-image-nav-btn"
                    disabled={currentImageIndex === (product.images?.length - 1)}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            
            {/* Thumbnails */}
            {product.images?.length > 1 && (
              <div className="product-thumbnails">
                {product.images.map((img, index) => (
                  <button
                    key={img.id || index}
                    onClick={() => selectImage(img.original_url || '/api/placeholder/600/600', index)}
                    className={`product-thumbnail ${currentImageIndex === index ? 'active' : ''}`}
                  >
                    <img 
                      src={img.thumbnail_small_url || '/api/placeholder/100/100'} 
                      alt={`${product.name} view ${index + 1}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="product-info">
            <div className="product-header">
              <h1 className="product-title">{product.name}</h1>
              <div className="product-price">
                <span className="product-current-price">${product.base_price}</span>
                {product.original_price && product.original_price > product.base_price && (
                  <span className="product-original-price">${product.original_price}</span>
                )}
              </div>
              
              {product.rating && (
                <div className="product-rating">
                  <div className="product-stars">
                    {[...Array(5)].map((_, i) => (
                      <svg 
                        key={i} 
                        className={`product-star ${i < Math.floor(product.rating) ? 'filled' : ''}`}
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="product-rating-text">({product.review_count || 0} reviews)</span>
                </div>
              )}
            </div>

            {error && (
              <div className="product-error">
                <svg className="product-error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Variants */}
            {product.variants?.length > 0 && (
              <div className="product-variants">
                <h3 className="product-variants-title">Options</h3>
                <select
                  className="product-variant-select"
                  value={selectedVariantId ?? ''}
                  onChange={(e) => setSelectedVariantId(Number(e.target.value))}
                >
                  {product.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.size} - {v.color} (+${v.price_adjustment})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity and Add to Cart */}
            <div className="product-actions">
              <div className="product-quantity">
                <label htmlFor="quantity" className="product-quantity-label">Quantity</label>
                <div className="product-quantity-controls">
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="product-quantity-btn"
                    disabled={quantity <= 1}
                  >
                    -
                  </button>
                  <input 
                    id="quantity"
                    type="number" 
                    min="1" 
                    value={quantity} 
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="product-quantity-input"
                  />
                  <button 
                    onClick={() => setQuantity(quantity + 1)}
                    className="product-quantity-btn"
                  >
                    +
                  </button>
                </div>
              </div>
              
              <button
                onClick={handleAddToCart}
                disabled={adding}
                className="product-add-to-cart"
              >
                {adding ? (
                  <>
                    <div className="product-loading-spinner"></div>
                    Adding to Cart...
                  </>
                ) : (
                  'Add to Cart'
                )}
              </button>
            </div>

            {/* Product Details Tabs */}
            <div className="product-tabs">
              <div className="product-tab-nav">
                <button 
                  onClick={() => setActiveTab('description')}
                  className={`product-tab-btn ${activeTab === 'description' ? 'active' : ''}`}
                >
                  Description
                </button>
                <button 
                  onClick={() => setActiveTab('specifications')}
                  className={`product-tab-btn ${activeTab === 'specifications' ? 'active' : ''}`}
                >
                  Specifications
                </button>
                <button 
                  onClick={() => setActiveTab('reviews')}
                  className={`product-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
                >
                  Reviews ({product.reviews?.length || 0})
                </button>
              </div>

              <div className="product-tab-content">
                {activeTab === 'description' && (
                  <div className="product-description">
                    <p>{product.description}</p>
                    {product.long_description && (
                      <div className="product-long-description">
                        {product.long_description.split('\n').map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'specifications' && (
                  <div className="product-specifications">
                    {product.specifications ? (
                      <dl className="product-spec-list">
                        {Object.entries(product.specifications).map(([key, value]) => (
                          <div key={key} className="product-spec-item">
                            <dt>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p>No specifications available.</p>
                    )}
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="product-reviews">
                    {product.reviews?.length > 0 ? (
                      product.reviews.map((review) => (
                        <div key={review.id} className="product-review">
                          <div className="product-review-header">
                            <div className="product-review-rating">
                              {[...Array(5)].map((_, i) => (
                                <svg 
                                  key={i} 
                                  className={`product-star ${i < review.rating ? 'filled' : ''}`}
                                  fill="currentColor" 
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                            </div>
                            <span className="product-review-author">{review.author || 'Anonymous'}</span>
                            {review.date && (
                              <span className="product-review-date">
                                {new Date(review.date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="product-review-comment">{review.comment}</p>
                        </div>
                      ))
                    ) : (
                      <p>No reviews yet. Be the first to review this product!</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}