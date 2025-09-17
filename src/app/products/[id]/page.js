"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Head from 'next/head';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import Breadcrumb from '../../../components/Breadcrumb';
import LazyImage from '../../../components/LazyImage';
import MobileLoading, { MobileSkeleton } from '../../../components/MobileLoading';
import { useMobilePerformance } from '../../../components/MobileOptimizations';
import { useMobileGestures, useMobileImageOptimization } from '../../../components/MobilePerformanceOptimizer';
import { apiRequest } from '../../../lib/api';
import { generateMetaTags, generateStructuredData, generateBreadcrumbs } from '../../../lib/seo';
import { useRecentlyViewed } from '../../../components/RecentlyViewed';
import PriceDisplay, { DiscountedPriceDisplay } from '../../../components/PriceDisplay';

function ProductHeader({ productName, breadcrumbs }) {
  return (
    <div className="bg-amber-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{productName}</h1>
          <Breadcrumb items={breadcrumbs} className="flex justify-center" />
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
  const [availability, setAvailability] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const { isMobile, optimizeForMobile } = useMobilePerformance();
  const { getOptimizedImageUrl, isSlowConnection } = useMobileImageOptimization();
  const { addToRecentlyViewed } = useRecentlyViewed();
  const galleryRef = useRef(null);

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
          
          // Add to recently viewed
          if (details) {
            addToRecentlyViewed({
              id: details.id,
              name: details.name,
              price: details.base_price,
              image: details.images?.[0]?.original_url || '/api/placeholder/200/200',
              category: details.category,
              rating: details.rating
            });
          }
          
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

  // Fetch availability when product or variant changes
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!product) return;
      
      try {
        setCheckingAvailability(true);
        const params = new URLSearchParams({ product_id: product.id });
        if (selectedVariantId) {
          params.append('variant_id', selectedVariantId);
        }
        
        const res = await fetch(`/api/inventory/availability/${product.id}?${params}`);
        const data = await res.json();
        
        if (data?.status === "SUCCESS") {
          setAvailability(data.keyValueTable);
        } else {
          console.error('Failed to fetch availability:', data?.message);
        }
      } catch (err) {
        console.error('Error fetching availability:', err);
      } finally {
        setCheckingAvailability(false);
      }
    };
    
    fetchAvailability();
  }, [product, selectedVariantId]);

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

  // Enhanced touch gesture support using the mobile performance optimizer
  const { isDragging } = useMobileGestures(galleryRef.current, {
    onSwipeLeft: () => {
      if (product?.images && currentImageIndex < product.images.length - 1) {
        nextImage();
      }
    },
    onSwipeRight: () => {
      if (currentImageIndex > 0) {
        prevImage();
      }
    },
    preventVerticalScroll: true
  });

  // Keyboard navigation for accessibility
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevImage();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextImage();
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
        {isMobile ? (
          <MobileLoading message="Loading product details..." size="large" />
        ) : (
          <>
            <div className="product-loading-spinner"></div>
            <p>Loading product details...</p>
          </>
        )}
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

  // Generate SEO data for product page
  const breadcrumbs = generateBreadcrumbs('product', {
    name: product.name,
    id: product.id,
    category: product.category
  });

  const productMetaTags = generateMetaTags({
    title: `${product.name} - Premium Bed Textures`,
    description: product.description || `Shop ${product.name} - Premium quality bed textures and luxury linens at Noiraé. ${product.long_description ? product.long_description.substring(0, 100) + '...' : ''}`,
    keywords: `${product.name}, bed textures, luxury linens, ${product.category || 'bedding'}, premium bedding`,
    image: product.images?.[0]?.original_url,
    url: `/products/${product.id}`,
    type: 'product'
  });

  const productStructuredData = generateStructuredData('product', product);

  return (
    <>
      <Head>
        <title>{productMetaTags.title}</title>
        <meta name="description" content={productMetaTags.description} />
        <meta name="keywords" content={productMetaTags.keywords} />
        <link rel="canonical" href={productMetaTags.canonical} />
        
        {/* Open Graph */}
        <meta property="og:title" content={productMetaTags.openGraph.title} />
        <meta property="og:description" content={productMetaTags.openGraph.description} />
        <meta property="og:url" content={productMetaTags.openGraph.url} />
        <meta property="og:type" content={productMetaTags.openGraph.type} />
        {productMetaTags.openGraph.images.map((image, index) => (
          <meta key={index} property="og:image" content={image.url} />
        ))}
        
        {/* Twitter Card */}
        <meta name="twitter:card" content={productMetaTags.twitter.card} />
        <meta name="twitter:title" content={productMetaTags.twitter.title} />
        <meta name="twitter:description" content={productMetaTags.twitter.description} />
        
        {/* Product Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productStructuredData)
          }}
        />
      </Head>
      
      <div className="aesop-page">
        <Header />
        <ProductHeader productName={product.name} breadcrumbs={breadcrumbs} />
        <div className="product-detail-container">
        <div className="product-detail-grid">
          <div className="product-gallery">
            {/* Main image */}
            <div 
              ref={galleryRef}
              className={`product-main-image ${isDragging ? 'dragging' : ''}`}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              role="img"
              aria-label={`Product image ${currentImageIndex + 1} of ${product.images?.length || 1}`}
            >
              <LazyImage 
                src={getOptimizedImageUrl(selectedImage || product.images?.[0]?.original_url || '/api/placeholder/600/600', 600, 600)} 
                alt={product.name}
                width={600}
                height={600}
                className="product-image-main"
                priority={true}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
              />
              {product.images?.length > 1 && (
                <>
                  <div className="product-image-nav">
                    <button 
                      onClick={prevImage}
                      className="product-image-nav-btn"
                      disabled={currentImageIndex === 0}
                      aria-label="Previous image"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button 
                      onClick={nextImage}
                      className="product-image-nav-btn"
                      disabled={currentImageIndex === (product.images?.length - 1)}
                      aria-label="Next image"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Image indicators for mobile */}
                  <div className="product-image-indicators">
                    {product.images.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => selectImage(product.images[index].original_url, index)}
                        className={`product-image-indicator ${currentImageIndex === index ? 'active' : ''}`}
                        aria-label={`View image ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
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
                    <LazyImage 
                      src={img.thumbnail_small_url || '/api/placeholder/100/100'} 
                      alt={`${product.name} view ${index + 1}`}
                      width={100}
                      height={100}
                      sizes="100px"
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
                {product.original_price && product.original_price > product.base_price ? (
                  <DiscountedPriceDisplay 
                    originalPrice={product.original_price}
                    discountedPrice={product.base_price}
                    size="xl"
                    className="product-price-display"
                    showPercentage={true}
                  />
                ) : (
                  <PriceDisplay 
                    price={product.base_price}
                    size="xl"
                    className="product-current-price"
                  />
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
                  {product.variants.map((v) => {
                    const variantPrice = parseFloat(product.base_price) + parseFloat(v.price_adjustment || 0);
                    return (
                      <option key={v.id} value={v.id}>
                        {v.size} - {v.color} (+${v.price_adjustment}) - ${variantPrice.toFixed(2)}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Availability Status */}
            {checkingAvailability ? (
              <div className="product-availability">
                <div className="product-loading-spinner"></div>
                <span>Checking availability...</span>
              </div>
            ) : availability && (
              <div className="product-availability">
                {availability.in_stock ? (
                  <div className="product-in-stock">
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-600 font-medium">
                      In Stock ({availability.available} available)
                    </span>
                  </div>
                ) : (
                  <div className="product-out-of-stock">
                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-red-600 font-medium">Out of Stock</span>
                  </div>
                )}
                {availability.reserved > 0 && (
                  <div className="text-sm text-gray-500 mt-1">
                    {availability.reserved} reserved in other carts
                  </div>
                )}
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
                    max={availability?.available || 999}
                    value={quantity} 
                    onChange={(e) => {
                      const newQuantity = Math.max(1, parseInt(e.target.value) || 1);
                      const maxQuantity = availability?.available || 999;
                      setQuantity(Math.min(newQuantity, maxQuantity));
                    }}
                    className="product-quantity-input"
                  />
                  <button 
                    onClick={() => {
                      const maxQuantity = availability?.available || 999;
                      setQuantity(Math.min(quantity + 1, maxQuantity));
                    }}
                    className="product-quantity-btn"
                    disabled={availability && quantity >= availability.available}
                  >
                    +
                  </button>
                </div>
                {availability && quantity > availability.available && (
                  <div className="text-sm text-red-500 mt-1">
                    Only {availability.available} available
                  </div>
                )}
              </div>
              
              <button
                onClick={handleAddToCart}
                disabled={adding || !availability?.in_stock || quantity > (availability?.available || 0)}
                className={`product-add-to-cart ${
                  !availability?.in_stock ? 'product-add-to-cart-disabled' : ''
                }`}
              >
                {adding ? (
                  <>
                    <div className="product-loading-spinner"></div>
                    Adding to Cart...
                  </>
                ) : !availability?.in_stock ? (
                  'Out of Stock'
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
    </>
  );
}