'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Pagination from '../../components/common/Pagination';
import { apiRequest } from '../../lib/api';

// Product Card Component
export function ProductCard({ product, onAddToCart }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAddToCart = async () => {
    setIsLoading(true);
    try {
      await onAddToCart(product);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Link href={`/products/${product.id}`} className="noirae-shop-product-card">
      <div className="noirae-shop-product-image">
        <img 
          src={product.image || '/api/placeholder/400/400'} 
          alt={product.name}
        />
      </div>
      <div className="noirae-shop-product-info">
        <h3 className="noirae-shop-product-name">{product.name}</h3>
        <p className="noirae-shop-product-price">${product.price || product.base_price}</p>
      </div>
    </Link>
  );
}

// Main Shop Component
function Shop() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  
  const [filters, setFilters] = useState({ 
    material: '',
    colors: [],
    priceRange: 750,
    sizes: [],
    brands: [],
    threadCount: 200,
    search: searchQuery 
  });
  const [sortBy, setSortBy] = useState('newest');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 9; // 3x3 grid

  // Sample products as fallback
  const sampleProducts = [
    {
      id: 1,
      name: "100% Mulberry Silk Sheet Set",
      price: 450,
      material: "Silk",
      color: "Ivory",
      size: "Queen",
      brand: "Siken Dream",
      threadCount: 600,
      image: "/api/placeholder/400/400"
    },
    {
      id: 2,
      name: "Cashmere Silk Blend Duvet Cover",
      price: 520,
      material: "Cashmere",
      color: "Champagne",
      size: "King",
      brand: "Sishmere Comfort",
      threadCount: 800,
      image: "/api/placeholder/400/400"
    },
    {
      id: 3,
      name: "Pure Cashmere Throw Blanket",
      price: 380,
      material: "Cashmere",
      color: "Silver",
      size: "Twin",
      brand: "Cloud Weave",
      threadCount: 400,
      image: "/api/placeholder/400/400"
    },
    {
      id: 4,
      name: "Silk Pillowcase Duo",
      price: 120,
      material: "Silk",
      color: "Ivory",
      size: "Queen",
      brand: "Siken Dream",
      threadCount: 600,
      image: "/api/placeholder/400/400"
    },
    {
      id: 5,
      name: "Luxe Cashmere Bed Runner",
      price: 250,
      material: "Cashmere",
      color: "Charcoal",
      size: "King",
      brand: "Cloud Weave",
      threadCount: 500,
      image: "/api/placeholder/400/400"
    },
    {
      id: 6,
      name: "Premium Mulberry Silk Comforter",
      price: 600,
      material: "Silk",
      color: "Silver",
      size: "King",
      brand: "Siken Dream",
      threadCount: 1000,
      image: "/api/placeholder/400/400"
    }
  ];

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        
        if (filters.material) {
          params.append('material', filters.material);
        }
        if (filters.search && filters.search.trim()) {
          params.append('search', filters.search.trim());
        }
        
        const res = await fetch(`/api/products?${params}`);
        const data = await res.json();
        
        if (data.status === 'SUCCESS') {
          setProducts(data.keyValueTable.products || []);
        } else {
          setProducts(sampleProducts);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        setProducts(sampleProducts);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [filters.material, filters.search]);

  // Update search filter when URL search param changes
  useEffect(() => {
    const searchQuery = searchParams.get('search');
    const materialQuery = searchParams.get('material');
    
    if (searchQuery || materialQuery) {
      setFilters(prev => ({
        ...prev,
        search: searchQuery || '',
        material: materialQuery || ''
      }));
    }
  }, [searchParams]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handleRemoveFilter = (key, value) => {
    if (key === 'sizes' || key === 'colors' || key === 'brands') {
      setFilters(prev => ({
        ...prev,
        [key]: prev[key].filter(item => item !== value)
      }));
    } else if (key === 'material') {
      setFilters(prev => ({ ...prev, material: '' }));
    }
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  // Filter products
  const filteredProducts = products.filter(product => {
    if (filters.material && !product.material?.toLowerCase().includes(filters.material.toLowerCase())) {
      return false;
    }
    if (filters.colors.length > 0 && !filters.colors.some(c => product.color?.toLowerCase().includes(c.toLowerCase()))) {
      return false;
    }
    if (filters.priceRange && product.price > filters.priceRange) {
      return false;
    }
    if (filters.sizes.length > 0 && !filters.sizes.includes(product.size)) {
      return false;
    }
    if (filters.brands.length > 0 && !filters.brands.includes(product.brand)) {
      return false;
    }
    if (filters.threadCount && product.threadCount && product.threadCount < filters.threadCount) {
      return false;
    }
    if (filters.search && !product.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
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

  // Calculate pagination
  const totalPages = Math.ceil(sortedProducts.length / productsPerPage);
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

  // Get active filters for display
  const activeFilters = [];
  if (filters.material) activeFilters.push({ key: 'material', value: filters.material, label: filters.material });
  filters.sizes.forEach(size => activeFilters.push({ key: 'sizes', value: size, label: size }));
  filters.colors.forEach(color => activeFilters.push({ key: 'colors', value: color, label: color }));
  filters.brands.forEach(brand => activeFilters.push({ key: 'brands', value: brand, label: brand }));

  return (
    <div className="aesop-page">
      <Header />
      
      <main className="noirae-shop-layout">
        <div className="aesop-container">
          <div className="noirae-shop-container">
            {/* Filter Sidebar */}
            <aside className="noirae-shop-sidebar">
              <h3 className="noirae-shop-sidebar-title">Filter by</h3>
              
              {/* Material Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">Material</h4>
                <div className="noirae-filter-options">
                  {['Silk', 'Cashmere', 'Blends'].map((material) => (
                    <label key={material} className="noirae-filter-option">
                      <input
                        type="radio"
                        name="material"
                        value={material}
                        checked={filters.material === material}
                        onChange={(e) => handleFilterChange('material', e.target.value)}
                      />
                      <span>{material}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Color Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">Color</h4>
                <div className="noirae-color-swatches">
                  {[
                    { name: 'Ivory', color: '#FFFFF0' },
                    { name: 'Champagne', color: '#F7E7CE' },
                    { name: 'Silver', color: '#C0C0C0' },
                    { name: 'Charcoal', color: '#36454F' },
                    { name: 'Navy', color: '#000080' },
                    { name: 'Black', color: '#000000' }
                  ].map(({ name, color }) => (
                    <button
                      key={name}
                      className={`noirae-color-swatch ${filters.colors.includes(name) ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        const newColors = filters.colors.includes(name)
                          ? filters.colors.filter(c => c !== name)
                          : [...filters.colors, name];
                        handleFilterChange('colors', newColors);
                      }}
                      title={name}
                    >
                      {filters.colors.includes(name) && (
                        <svg className="noirae-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">Price Range</h4>
                <div className="noirae-price-value">${filters.priceRange}</div>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="50"
                  value={filters.priceRange}
                  onChange={(e) => handleFilterChange('priceRange', parseInt(e.target.value))}
                  className="noirae-price-slider"
                />
              </div>

              {/* Size Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">Size</h4>
                <div className="noirae-filter-options">
                  {['Twin', 'Queen', 'King', 'California King'].map((size) => (
                    <label key={size} className="noirae-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.sizes.includes(size)}
                        onChange={(e) => {
                          const newSizes = e.target.checked
                            ? [...filters.sizes, size]
                            : filters.sizes.filter(s => s !== size);
                          handleFilterChange('sizes', newSizes);
                        }}
                      />
                      <span>{size}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Brand Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">Brand</h4>
                <div className="noirae-filter-options">
                  {['Siken Dream', 'Sishmere Comfort', 'Cloud Weave'].map((brand) => (
                    <label key={brand} className="noirae-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.brands.includes(brand)}
                        onChange={(e) => {
                          const newBrands = e.target.checked
                            ? [...filters.brands, brand]
                            : filters.brands.filter(b => b !== brand);
                          handleFilterChange('brands', newBrands);
                        }}
                      />
                      <span>{brand}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Thread Count Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">Thread Count</h4>
                <div className="noirae-price-value">{filters.threadCount} - 1230+</div>
                <input
                  type="range"
                  min="200"
                  max="1230"
                  step="50"
                  value={filters.threadCount}
                  onChange={(e) => handleFilterChange('threadCount', parseInt(e.target.value))}
                  className="noirae-price-slider"
                />
              </div>
            </aside>

            {/* Main Content */}
            <div className="noirae-shop-main">
              {/* Header with Title and Sort */}
              <div className="noirae-shop-header">
                <h1 className="noirae-shop-title">The Collection</h1>
                <div className="noirae-shop-sort">
                  <label htmlFor="sort">Sort by:</label>
                  <select 
                    id="sort"
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    className="noirae-sort-select"
                  >
                    <option value="newest">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                </div>
              </div>

              {/* Active Filters */}
              <div className="noirae-active-filters">
                {activeFilters.length > 0 && activeFilters.map((filter, index) => (
                  <button
                    key={`${filter.key}-${filter.value}-${index}`}
                    className="noirae-filter-tag"
                    onClick={() => handleRemoveFilter(filter.key, filter.value)}
                  >
                    {filter.label}
                    <span className="noirae-filter-tag-remove">×</span>
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              {loading ? (
                <div className="noirae-loading">
                  <div className="aesop-loading-spinner"></div>
                  <p>Loading products...</p>
                </div>
              ) : (
                <>
                  <div className="noirae-shop-grid">
                    {paginatedProducts.length > 0 ? (
                      paginatedProducts.map(product => (
                        <ProductCard 
                          key={product.id} 
                          product={product} 
                          onAddToCart={handleAddToCart}
                        />
                      ))
                    ) : (
                      <>
                        {/* Empty grid cells to maintain 3-column layout */}
                        <div className="noirae-empty-grid-cell"></div>
                        <div className="noirae-empty-grid-cell noirae-no-products-cell">
                          <p>No products found matching your criteria.</p>
                        </div>
                        <div className="noirae-empty-grid-cell"></div>
                      </>
                    )}
                  </div>
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

// Wrap with Suspense boundary for useSearchParams
export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="aesop-page">
        <Header />
        <div className="aesop-loading">
          <div className="aesop-loading-spinner"></div>
          <p>Loading shop...</p>
        </div>
        <Footer />
      </div>
    }>
      <Shop />
    </Suspense>
  );
}
