'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

// Breadcrumb Component
function Breadcrumb() {
  return (
    <div className="aesop-container">
      <Link href="/" className="aesop-breadcrumb-link">Home</Link>
      <span className="aesop-breadcrumb-separator">&gt;</span>
      <span className="aesop-breadcrumb-current">Shop</span>
    </div>
  );
}

// Filter Sidebar Component
function FilterSidebar({ filters, onFilterChange }) {
  const categories = [
    'All', 'Sheets', 'Pillows', 'Blankets', 'Mattresses', 'Accessories'
  ];

  const priceRanges = [
    { label: 'All Prices', value: 'all' },
    { label: '$0 - $100', value: '0-100' },
    { label: '$100 - $200', value: '100-200' },
    { label: '$200 - $300', value: '200-300' },
    { label: '$300+', value: '300+' }
  ];

  const materials = ['Cotton', 'Silk', 'Bamboo', 'Linen', 'Memory Foam'];

  const seasons = ['All', 'Spring', 'Summer', 'Fall', 'Winter'];

  const handleSeasonChange = (season) => {
    const newSeasons = filters.seasons.includes(season)
      ? filters.seasons.filter(s => s !== season)
      : [...filters.seasons, season];
    onFilterChange('seasons', newSeasons);
  };

  const handleMaterialChange = (material) => {
    const newMaterials = filters.materials.includes(material)
      ? filters.materials.filter(m => m !== material)
      : [...filters.materials, material];
    onFilterChange('materials', newMaterials);
  };

  const removeMaterial = (material) => {
    const newMaterials = filters.materials.filter(m => m !== material);
    onFilterChange('materials', newMaterials);
  };

  return (
    <div className="aesop-filter-sidebar">
      <h3 className="aesop-filter-title">Filters</h3>
      
      {/* Category Filter */}
      <div className="aesop-filter-section">
        <h4 className="aesop-filter-section-title">Category</h4>
        <select 
          value={filters.category} 
          onChange={(e) => onFilterChange('category', e.target.value)}
          className="aesop-filter-dropdown"
        >
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        {filters.category !== 'All' && (
          <div className="aesop-selected-items">
            <span className="aesop-selected-label">Selected:</span>
            <span className="aesop-selected-item">
              {filters.category}
              <button 
                onClick={() => onFilterChange('category', 'All')}
                className="aesop-remove-item"
              >
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Price Filter */}
      <div className="aesop-filter-section">
        <h4 className="aesop-filter-section-title">Price Range</h4>
        <select 
          value={filters.price} 
          onChange={(e) => onFilterChange('price', e.target.value)}
          className="aesop-filter-dropdown"
        >
          {priceRanges.map(range => (
            <option key={range.value} value={range.value}>{range.label}</option>
          ))}
        </select>
        {filters.price !== 'all' && (
          <div className="aesop-selected-items">
            <span className="aesop-selected-label">Selected:</span>
            <span className="aesop-selected-item">
              {priceRanges.find(r => r.value === filters.price)?.label}
              <button 
                onClick={() => onFilterChange('price', 'all')}
                className="aesop-remove-item"
              >
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Materials Filter */}
      <div className="aesop-filter-section">
        <h4 className="aesop-filter-section-title">Materials</h4>
        <select 
          onChange={(e) => {
            if (e.target.value && !filters.materials.includes(e.target.value)) {
              handleMaterialChange(e.target.value);
            }
            e.target.value = ''; // Reset dropdown
          }}
          className="aesop-filter-dropdown"
          defaultValue=""
        >
          <option value="" disabled>Select materials...</option>
          {materials.map(material => (
            <option 
              key={material} 
              value={material}
              disabled={filters.materials.includes(material)}
            >
              {material}
            </option>
          ))}
        </select>
        {filters.materials.length > 0 && (
          <div className="aesop-selected-items">
            <span className="aesop-selected-label">Selected:</span>
            <div className="aesop-selected-list">
              {filters.materials.map(material => (
                <span key={material} className="aesop-selected-item">
                  {material}
                  <button 
                    onClick={() => removeMaterial(material)}
                    className="aesop-remove-item"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Product Card Component
export function ProductCard({ product, onAddToCart, onToggleWishlist }) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddToCart = async () => {
    setIsLoading(true);
    try {
      await onAddToCart(product);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleWishlist = () => {
    setIsWishlisted(!isWishlisted);
    if (onToggleWishlist) {
      onToggleWishlist(product, !isWishlisted);
    }
  };

  return (
    <div className="aesop-product-card">
      <div className="aesop-product-image-container">
        <img 
          src={product.image} 
          alt={product.name}
          className="aesop-product-image"
        />
        {product.isNew && (
          <span className="aesop-product-badge aesop-product-badge-new">New</span>
        )}
        {product.originalPrice && (
          <span className="aesop-product-badge aesop-product-badge-sale">Sale</span>
        )}
        <div className="aesop-product-overlay">
          <button 
            onClick={handleAddToCart}
            disabled={isLoading}
            className="aesop-button-primary aesop-product-add-to-cart"
          >
            {isLoading ? 'Adding...' : 'Add to Cart'}
          </button>
          <div className="aesop-product-actions">
            <button 
              onClick={handleToggleWishlist}
              className={`aesop-icon-button ${isWishlisted ? 'aesop-icon-button-active' : ''}`}
              title="Add to Wishlist"
            >
              <svg className="w-5 h-5" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <Link href={`/products/${product.id}`} className="aesop-icon-button" title="View Details">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
      <div className="aesop-product-info">
        <h3 className="aesop-product-name">{product.name}</h3>
        <p className="aesop-product-description">{product.description}</p>
        <div className="aesop-product-price">
          <span className="aesop-product-current-price">${product.price}</span>
          {product.originalPrice && (
            <span className="aesop-product-original-price">${product.originalPrice}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Shop Component
export default function Shop() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  const [filters, setFilters] = useState({ 
    category: 'All', 
    price: 'all', 
    materials: [], 
    search: searchQuery 
  });
  const [sortBy, setSortBy] = useState('featured');
  const [viewMode, setViewMode] = useState('grid');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, limit: 20 });

  // Sample products data (fallback)
  const sampleProducts = [
    {
      id: 1,
      name: "Luxury Cotton Sheets",
      description: "Premium 100% Egyptian cotton sheets with 400 thread count",
      price: 299,
      originalPrice: 399,
      category: "Sheets",
      image: "/api/placeholder/300/300",
      isNew: true
    },
    {
      id: 2,
      name: "Silk Pillowcase Set",
      description: "Mulberry silk pillowcases for hair and skin care",
      price: 149,
      category: "Pillows",
      image: "/api/placeholder/300/300"
    },
    {
      id: 3,
      name: "Memory Foam Mattress",
      description: "Gel-infused memory foam for optimal comfort",
      price: 899,
      category: "Mattresses",
      image: "/api/placeholder/300/300"
    },
    {
      id: 4,
      name: "Bamboo Duvet Cover",
      description: "Eco-friendly bamboo fiber duvet cover set",
      price: 199,
      category: "Blankets",
      image: "/api/placeholder/300/300",
      isNew: true
    },
    {
      id: 5,
      name: "Linen Throw Blanket",
      description: "Soft and breathable linen throw for all seasons",
      price: 89,
      category: "Blankets",
      image: "/api/placeholder/300/300"
    },
    {
      id: 6,
      name: "Down Alternative Pillow",
      description: "Hypoallergenic down alternative pillow",
      price: 79,
      category: "Pillows",
      image: "/api/placeholder/300/300"
    }
  ];

  // Fetch products from API
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters.category !== 'All') {
        params.append('category', filters.category);
      }
      
      if (filters.price !== 'all') {
        let min_price, max_price;
        switch (filters.price) {
          case '0-100': min_price = 0; max_price = 100; break;
          case '100-200': min_price = 100; max_price = 200; break;
          case '200-300': min_price = 200; max_price = 300; break;
          case '300+': min_price = 300; break;
        }
        if (min_price !== undefined) params.append('min_price', min_price);
        if (max_price !== undefined) params.append('max_price', max_price);
      }
      
      if (filters.materials.length > 0) {
        params.append('materials', filters.materials.join(','));
      }
      
      if (filters.search && filters.search.trim()) {
        params.append('search', filters.search.trim());
      }
      
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      
      if (data.status === 'SUCCESS') {
        setProducts(data.keyValueTable.products || []);
        setPagination(prev => ({ ...prev, total: data.keyValueTable.total || 0 }));
      } else {
        // Fallback to sample data if API fails
        setProducts(sampleProducts);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      // Fallback to sample data
      setProducts(sampleProducts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [filters]);

  // Update search filter when URL search param changes
  useEffect(() => {
    const searchQuery = searchParams.get('search');
    const categoryQuery = searchParams.get('category');
    
    if (searchQuery || categoryQuery) {
      setFilters(prev => ({
        ...prev,
        search: searchQuery || '',
        category: categoryQuery || 'All'
      }));
    }
  }, [searchParams]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

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
      // Show success message or update cart count
      console.log('Product added to cart successfully');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  const handleToggleWishlist = (product, isWishlisted) => {
    // Implement wishlist functionality
    console.log(`${isWishlisted ? 'Added to' : 'Removed from'} wishlist:`, product.name);
  };

  // Filter products based on current filters
  const filteredProducts = products.filter(product => {
    if (filters.category !== 'All' && product.category !== filters.category) {
      return false;
    }
    
    if (filters.search && !product.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    if (filters.price !== 'all') {
      let min_price, max_price;
      switch (filters.price) {
        case '0-100': min_price = 0; max_price = 100; break;
        case '100-200': min_price = 100; max_price = 200; break;
        case '200-300': min_price = 200; max_price = 300; break;
        case '300+': min_price = 300; max_price = Infinity; break;
      }
      if (product.price < min_price || product.price > max_price) {
        return false;
      }
    }
    
    return true;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
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

  return (
    <div className="aesop-page">
      <Header />
      <Breadcrumb />
      
      <div className="aesop-shop-hero">
        <div className="aesop-container">
          <h1 className="aesop-shop-title">Shop</h1>
          <p className="aesop-shop-subtitle">Discover our premium collection of home textiles</p>
        </div>
      </div>

      <div className="aesop-container">
        <div className="aesop-shop-content">
          <aside className="aesop-shop-sidebar">
            <FilterSidebar filters={filters} onFilterChange={handleFilterChange} />
          </aside>
          
          <main className="aesop-shop-main">
            <div className="aesop-shop-toolbar">
              <div className="aesop-shop-results">
                <span className="aesop-results-count">
                  Showing {sortedProducts.length} of {products.length} products
                  {filters.search && (
                    <span className="aesop-search-query"> for "{filters.search}"</span>
                  )}
                </span>
              </div>
              
              <div className="aesop-shop-controls">
                <div className="aesop-sort-control">
                  <label htmlFor="sort-select" className="aesop-sort-label">Sort by:</label>
                  <select 
                    id="sort-select"
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    className="aesop-sort-select"
                  >
                    <option value="featured">Featured</option>
                    <option value="newest">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                </div>
                
                <div className="aesop-view-controls">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`aesop-view-button ${viewMode === 'grid' ? 'aesop-view-button-active' : ''}`}
                    title="Grid View"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`aesop-view-button ${viewMode === 'list' ? 'aesop-view-button-active' : ''}`}
                    title="List View"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            {loading ? (
              <div className="aesop-loading">
                <div className="aesop-loading-spinner"></div>
                <p>Loading products...</p>
              </div>
            ) : (
              <div className={`aesop-products-grid ${viewMode === 'list' ? 'aesop-products-list' : ''}`}>
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
                  <div className="aesop-no-products">
                    <p>No products found matching your criteria.</p>
                    <button 
                      onClick={() => setFilters({ category: 'All', price: 'all', materials: [], search: '' })}
                      className="aesop-button-secondary"
                    >
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="aesop-pagination">
                <button 
                  onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  disabled={pagination.page === 1}
                  className="aesop-pagination-button"
                >
                  Previous
                </button>
                <span className="aesop-pagination-info">
                  Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                </span>
                <button 
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                  className="aesop-pagination-button"
                >
                  Next
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}