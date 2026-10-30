'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Pagination from '../../components/common/Pagination';
import { apiRequest } from '../../lib/api';

// Material options. GET /api/products matches a material containing the term,
// ignoring case, so each value is the word the real materials share:
// "Silk" → "Mulberry Silk", "Blend" → "Polyester Blend".
const MATERIAL_OPTIONS = [
  { value: 'Silk', key: 'silk' },
  { value: 'Cashmere', key: 'cashmere' },
  { value: 'Blend', key: 'blends' },
];

const findMaterialOption = (value) =>
  MATERIAL_OPTIONS.find((option) => option.value.toLowerCase() === String(value || '').toLowerCase());

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

  const imageSrc = product.image || `/api/placeholder/400/400?seed=${product.id || product.slug || product.name || 'p'}`;

  return (
    <Link href={`/products/${product.id}`} className="noirae-shop-product-card">
      <div className="noirae-shop-product-image">
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          // Catalogue images in /public are optimized (AVIF/WebP, responsive sizes);
          // remote (S3/backend) and placeholder URLs are served as-is.
          unoptimized={!imageSrc.startsWith('/images/')}
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
  const t = useTranslations('Shop');
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  const materialParam = searchParams.get('material') || '';

  const [filters, setFilters] = useState({
    // Start from the URL so the first fetch is already filtered.
    material: findMaterialOption(materialParam)?.value ?? materialParam,
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
          setProducts([]);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [filters.material, filters.search]);

  // Keep the search term in step with the URL (header search, or the chip's
  // remove button); a material in the URL (footer links) selects that material.
  useEffect(() => {
    const searchQuery = searchParams.get('search') || '';
    const materialQuery = searchParams.get('material');

    setFilters(prev => ({
      ...prev,
      search: searchQuery,
      material: materialQuery ? (findMaterialOption(materialQuery)?.value ?? materialQuery) : prev.material,
    }));
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
      if (searchParams.has('material')) dropUrlParams(['material']);
    } else if (key === 'search') {
      // The term lives in the URL (?search=), so drop it there; the effect above
      // then clears the filter. A ?material= goes too: the current material is
      // already in state and would otherwise override a newer radio choice.
      dropUrlParams(['search', 'material']);
    }
    setCurrentPage(1);
  };

  const dropUrlParams = (keys) => {
    const params = new URLSearchParams(searchParams.toString());
    keys.forEach((k) => params.delete(k));
    const query = params.toString();
    router.replace(query ? `/shop?${query}` : '/shop', { scroll: false });
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

  // Filter products. Material and search are applied by the API (see the fetch
  // above); repeating them here on fields the listing lacks hid every result.
  const filteredProducts = products.filter(product => {
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
        return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
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
  const searchTerm = filters.search.trim();
  if (searchTerm) activeFilters.push({ key: 'search', value: searchTerm, label: t('searchChip', { term: searchTerm }) });
  if (filters.material) {
    const option = findMaterialOption(filters.material);
    activeFilters.push({ key: 'material', value: filters.material, label: option ? t(option.key) : filters.material });
  }
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
              <h3 className="noirae-shop-sidebar-title">{t('filterBy')}</h3>

              {/* Material Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">{t('material')}</h4>
                <div className="noirae-filter-options">
                  {MATERIAL_OPTIONS.map(({ value, key }) => (
                    <label key={value} className="noirae-filter-option">
                      <input
                        type="radio"
                        name="material"
                        value={value}
                        checked={filters.material === value}
                        onChange={(e) => handleFilterChange('material', e.target.value)}
                      />
                      <span>{t(key)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Color Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">{t('color')}</h4>
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
                <h4 className="noirae-filter-group-title">{t('priceRange')}</h4>
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
                <h4 className="noirae-filter-group-title">{t('size')}</h4>
                <div className="noirae-filter-options">
                  {[{ value: 'Twin', key: 'twin' }, { value: 'Queen', key: 'queen' }, { value: 'King', key: 'king' }, { value: 'California King', key: 'californiaKing' }].map(({ value, key }) => (
                    <label key={value} className="noirae-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.sizes.includes(value)}
                        onChange={(e) => {
                          const newSizes = e.target.checked
                            ? [...filters.sizes, value]
                            : filters.sizes.filter(s => s !== value);
                          handleFilterChange('sizes', newSizes);
                        }}
                      />
                      <span>{t(key)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Brand Filter */}
              <div className="noirae-filter-group">
                <h4 className="noirae-filter-group-title">{t('brand')}</h4>
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
                <h4 className="noirae-filter-group-title">{t('threadCount')}</h4>
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
                <h1 className="noirae-shop-title">{t('theCollection')}</h1>
                <div className="noirae-shop-sort">
                  <label htmlFor="sort">{t('sortBy')}</label>
                  <select
                    id="sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="noirae-sort-select"
                  >
                    <option value="newest">{t('sortNewest')}</option>
                    <option value="price-low">{t('sortPriceLow')}</option>
                    <option value="price-high">{t('sortPriceHigh')}</option>
                    <option value="name">{t('sortName')}</option>
                  </select>
                </div>
              </div>

              {/* Active Filters */}
              <div className="noirae-active-filters">
                {activeFilters.length > 0 && activeFilters.map((filter, index) => (
                  <button
                    key={`${filter.key}-${filter.value}-${index}`}
                    type="button"
                    className="noirae-filter-tag"
                    onClick={() => handleRemoveFilter(filter.key, filter.value)}
                    aria-label={t('removeFilter', { label: filter.label })}
                  >
                    {filter.label}
                    <span className="noirae-filter-tag-remove" aria-hidden="true">×</span>
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              {loading ? (
                <div className="noirae-loading">
                  <div className="aesop-loading-spinner"></div>
                  <p>{t('loading')}</p>
                </div>
              ) : paginatedProducts.length > 0 ? (
                <>
                  <div className="noirae-shop-grid">
                    {paginatedProducts.map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAddToCart={handleAddToCart}
                      />
                    ))}
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
              ) : (
                <div className="noirae-no-products">
                  <p>{t('noProducts')}</p>
                </div>
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
