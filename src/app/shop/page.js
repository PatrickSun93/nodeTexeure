'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCartCount } from '../../lib'; // added

// Header Component (reused from homepage)
function Header() {
  const { count } = useCartCount(); // added
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-amber-600 rounded"></div>
            <span className="text-xl font-bold text-gray-900">Furniro</span>
          </Link>
          
          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-900 hover:text-amber-600 font-medium">Home</Link>
            <Link href="/shop" className="text-amber-600 font-medium">Shop</Link>
            <a href="#" className="text-gray-900 hover:text-amber-600 font-medium">About</a>
            <a href="#" className="text-gray-900 hover:text-amber-600 font-medium">Contact</a>
          </nav>
          
          {/* Icons */}
          <div className="flex items-center space-x-4">
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600 relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
              </svg>
              <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{count}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// Breadcrumb Component
function Breadcrumb() {
  return (
    <div className="bg-amber-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Shop</h1>
          <nav className="flex justify-center items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-600 hover:text-amber-600">Home</Link>
            <span className="text-gray-400">&gt;</span>
            <span className="text-gray-900 font-medium">Shop</span>
          </nav>
        </div>
      </div>
    </div>
  );
}

// Filter Sidebar Component
function FilterSidebar({ filters, onFilterChange }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Filters</h3>
      
      {/* Category Filter */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Category</h4>
        <div className="space-y-2">
          {['All', 'Bed Sheets', 'Pillowcases', 'Mattress Toppers', 'Blankets', 'Comforters'].map((category) => (
            <label key={category} className="flex items-center">
              <input
                type="radio"
                name="category"
                value={category}
                checked={filters.category === category}
                onChange={(e) => onFilterChange('category', e.target.value)}
                className="mr-2 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-gray-700">{category}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Range Filter */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Price Range</h4>
        <div className="space-y-2">
          {[
            { label: 'All Prices', value: 'all' },
            { label: 'Under $100', value: '0-100' },
            { label: '$100 - $200', value: '100-200' },
            { label: '$200 - $300', value: '200-300' },
            { label: 'Over $300', value: '300+' }
          ].map((price) => (
            <label key={price.value} className="flex items-center">
              <input
                type="radio"
                name="price"
                value={price.value}
                checked={filters.price === price.value}
                onChange={(e) => onFilterChange('price', e.target.value)}
                className="mr-2 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-gray-700">{price.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Material Filter */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Material</h4>
        <div className="space-y-2">
          {['Cotton', 'Silk', 'Bamboo', 'Linen', 'Microfiber'].map((material) => (
            <label key={material} className="flex items-center">
              <input
                type="checkbox"
                value={material}
                checked={filters.materials.includes(material)}
                onChange={(e) => {
                  const materials = e.target.checked 
                    ? [...filters.materials, material]
                    : filters.materials.filter(m => m !== material);
                  onFilterChange('materials', materials);
                }}
                className="mr-2 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-gray-700">{material}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Product Card Component
export function ProductCard({ product, onAddToCart, onToggleWishlist }) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow group flex flex-col h-full">
      <Link href={`/products/${product.id}`}>
        <div className="relative">
          <div className="w-full h-64 bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500">{product.image || 'Product Image'}</span>
          </div>
          {product.isNew && (
            <span className="absolute top-4 right-4 bg-green-500 text-white px-2 py-1 rounded text-sm font-medium">
              New
            </span>
          )}
          {product.discount && (
            <span className="absolute top-4 left-4 bg-red-500 text-white px-2 py-1 rounded text-sm font-medium">
              -{product.discount}%
            </span>
          )}
          <button 
            onClick={(e) => { e.preventDefault(); onToggleWishlist(product.id); }}
            className="absolute top-4 left-4 p-2 bg-white rounded-full shadow-md hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className={`w-4 h-4 ${product.isWishlisted ? 'text-red-500 fill-current' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>
      </Link>
      
      {/* Content area that grows to fill available space */}
      <div className="p-4 flex flex-col flex-grow">
        <Link href={`/products/${product.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
        </Link>
        <p className="text-sm text-gray-600 mb-2">{product.category}</p>
        
        {/* Spacer to push price and rating to consistent position */}
        <div className="flex-grow"></div>
        
        {/* Price and rating section - always at same height */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            {product.originalPrice && (
              <span className="text-gray-400 line-through text-sm">${product.originalPrice}</span>
            )}
            <span className="text-amber-600 font-bold text-xl">${product.base_price}</span>
          </div>
          <div className="flex items-center">
            <div className="flex text-yellow-400">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className={`w-4 h-4 ${i < product.rating ? 'fill-current' : 'text-gray-300'}`} viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
            </div>
            <span className="text-sm text-gray-600 ml-1">({product.reviews})</span>
          </div>
        </div>
      </div>
      
      {/* Button always at the bottom */}
      <div className="p-4 pt-0">
        <button 
          onClick={() => onAddToCart(product)}
          className="w-full bg-amber-600 text-white py-3 rounded-lg hover:bg-amber-700 transition-colors font-medium"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}

// Main Shop Component
export default function Shop() {
  const [filters, setFilters] = useState({ category: 'All', price: 'all', materials: [] });
  const [sortBy, setSortBy] = useState('featured');
  const [viewMode, setViewMode] = useState('grid');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, limit: 20 });

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pagination.page,
          limit: pagination.limit,
        });
        if (filters.category !== 'All') {
          params.append('category', filters.category);
        }
        // Implement price filter
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
        // Implement materials filter
        if (filters.materials.length > 0) {
          params.append('materials', filters.materials.join(','));
        }
        const res = await fetch(`/api/products?${params}`);
        const data = await res.json();
        if (data.status == 'SUCCESS') {
          setProducts(data.keyValueTable.products);
          setPagination(prev => ({ ...prev, total: data.keyValueTable.total }));
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [filters, pagination.page, sortBy]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleAddToCart = async (product) => {
    try {
      const res = await fetch('/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('cart:updated'));
        }
        alert('Added to cart!');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleWishlist = (productId) => {
    setProducts(prev => prev.map(product => 
      product.id === productId 
        ? { ...product, isWishlisted: !product.isWishlisted }
        : product
    ));
  };
  
  // Filter products based on current filters
  const filteredProducts = products.filter(product => {
    // Category filter
    if (filters.category !== 'All' && product.category !== filters.category) {
      return false;
    }
    
    // Price filter
    if (filters.price !== 'all') {
      const price = parseFloat(product.price);
      switch (filters.price) {
        case '0-100':
          if (price >= 100) return false;
          break;
        case '100-200':
          if (price < 100 || price >= 200) return false;
          break;
        case '200-300':
          if (price < 200 || price >= 300) return false;
          break;
        case '300+':
          if (price < 300) return false;
          break;
      }
    }
    
    // Material filter
    if (filters.materials.length > 0 && !filters.materials.includes(product.material)) {
      return false;
    }
    
    return true;
  });
  
  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return parseFloat(a.price) - parseFloat(b.price);
      case 'price-high':
        return parseFloat(b.price) - parseFloat(a.price);
      case 'rating':
        return b.rating - a.rating;
      case 'newest':
        return b.isNew - a.isNew;
      default:
        return 0;
    }
  });
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Breadcrumb />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-1/4">
            <FilterSidebar filters={filters} onFilterChange={handleFilterChange} />
          </div>
          
          {/* Main Content */}
          <div className="lg:w-3/4">
            {/* Toolbar */}
            <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center space-x-4">
                  <span className="text-gray-600">Showing {sortedProducts.length} of {products.length} products</span>
                </div>
                
                <div className="flex items-center space-x-4">
                  {/* View Mode Toggle */}
                  <div className="flex border rounded-lg">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 ${viewMode === 'grid' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 ${viewMode === 'list' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 8a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="featured">Featured</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Products Grid */}
            <div className={`grid gap-6 ${
              viewMode === 'grid' 
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-1'
            }`}>
              {sortedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  onToggleWishlist={handleToggleWishlist}
                />
              ))}
            </div>
            
            {/* Pagination */}
            <div className="mt-12 flex justify-center">
              <nav className="flex items-center space-x-2">
                <button className="px-3 py-2 text-gray-500 hover:text-amber-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {[1, 2, 3, 4, 5].map((page) => (
                  <button
                    key={page}
                    className={`px-4 py-2 rounded-lg ${
                      page === 1 
                        ? 'bg-amber-600 text-white' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button className="px-3 py-2 text-gray-500 hover:text-amber-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}