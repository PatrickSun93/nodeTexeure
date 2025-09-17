'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatCurrency } from '../../../lib/i18nUtils';
import { useLocale } from 'next-intl';
import { apiRequest } from '../../../lib/api';

export default function ShopPage() {
  const t = useTranslations('product');
  const tSearch = useTranslations('search');
  const tCategories = useTranslations('categories');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  });
  const [searchResults, setSearchResults] = useState(null);

  // Load products based on search query or category
  useEffect(() => {
    const query = searchParams.get('search');
    const category = searchParams.get('category');
    const page = parseInt(searchParams.get('page')) || 1;
    
    if (query) {
      setSearchQuery(query);
      performSearch(query, page);
    } else {
      loadProducts(category, page);
    }
  }, [searchParams, locale, sortBy, sortOrder]);

  const performSearch = async (query, page = 1) => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        q: query,
        locale,
        page: page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder
      });

      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }

      const response = await apiRequest(`/search?${params.toString()}`);
      
      if (response.status === 'SUCCESS') {
        const data = response.keyValueTable;
        setProducts(data.products || []);
        setPagination(data.pagination || pagination);
        setSearchResults(data);
      } else {
        setProducts([]);
        setSearchResults({ products: [], pagination: { ...pagination, total: 0 } });
      }
    } catch (error) {
      console.error('Search failed:', error);
      setProducts([]);
      setSearchResults({ products: [], pagination: { ...pagination, total: 0 } });
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (category, page = 1) => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString()
      });

      if (category && category !== 'all') {
        params.append('category', category);
        setSelectedCategory(category);
      }

      const response = await apiRequest(`/products?${params.toString()}`);
      
      if (response.status === 'SUCCESS') {
        setProducts(response.keyValueTable?.products || []);
        setPagination({
          page: response.keyValueTable?.page || 1,
          limit: response.keyValueTable?.limit || 12,
          total: response.keyValueTable?.total || 0,
          totalPages: Math.ceil((response.keyValueTable?.total || 0) / (response.keyValueTable?.limit || 12))
        });
        setSearchResults(null);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { key: 'all', label: tCategories('all') },
    { key: 'sheets', label: tCategories('sheets') },
    { key: 'pillows', label: tCategories('pillows') },
    { key: 'blankets', label: tCategories('blankets') },
    { key: 'mattresses', label: tCategories('mattresses') },
    { key: 'accessories', label: tCategories('accessories') }
  ];

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    if (searchQuery) {
      performSearch(searchQuery, 1);
    } else {
      loadProducts(category, 1);
    }
  };

  const handleSortChange = (newSortBy, newSortOrder = 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  };

  const displayProducts = products;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{tCommon('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {searchQuery ? (
              <>
                {tSearch('results')} "{searchQuery}"
                {searchResults && (
                  <span className="text-lg font-normal text-gray-600 ml-2">
                    ({searchResults.pagination?.total || 0} {tSearch('resultsFound', { defaultMessage: 'results found' })})
                  </span>
                )}
              </>
            ) : (
              <>
                {t('title')} {tCommon('shop') || 'Shop'}
              </>
            )}
          </h1>
          <p className="text-gray-600">
            {searchQuery ? (
              locale === 'zh' 
                ? `搜索结果："${searchQuery}"`
                : `Search results for "${searchQuery}"`
            ) : (
              locale === 'zh' 
                ? '探索我们精选的优质床上用品系列'
                : 'Explore our curated collection of premium bedding products'
            )}
          </p>
        </div>

        {/* Filters and Sorting */}
        <div className="mb-8 space-y-4">
          {/* Category Filter */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">{tSearch('filters')}</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.key}
                  onClick={() => handleCategoryChange(category.key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === category.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-900">{tSearch('sortBy')}</span>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [newSortBy, newSortOrder] = e.target.value.split('-');
                  handleSortChange(newSortBy, newSortOrder);
                }}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="relevance-desc">
                  {locale === 'zh' ? '相关性' : 'Relevance'}
                </option>
                <option value="price-asc">
                  {locale === 'zh' ? '价格：低到高' : 'Price: Low to High'}
                </option>
                <option value="price-desc">
                  {locale === 'zh' ? '价格：高到低' : 'Price: High to Low'}
                </option>
                <option value="name-asc">
                  {locale === 'zh' ? '名称：A-Z' : 'Name: A-Z'}
                </option>
                <option value="created-desc">
                  {locale === 'zh' ? '最新' : 'Newest'}
                </option>
                <option value="rating-desc">
                  {locale === 'zh' ? '评分最高' : 'Highest Rated'}
                </option>
              </select>
            </div>
            
            {pagination.total > 0 && (
              <div className="text-sm text-gray-600">
                {locale === 'zh' 
                  ? `显示 ${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} 共 ${pagination.total} 个结果`
                  : `Showing ${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} results`
                }
              </div>
            )}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <Link href={`/${locale}/products/${product.id}`}>
                <div className="aspect-w-4 aspect-h-3">
                  <img
                    src={product.image || '/api/placeholder/400/300'}
                    alt={product.name}
                    className="w-full h-48 object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
              </Link>
              <div className="p-6">
                <Link href={`/${locale}/products/${product.id}`}>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-blue-600 transition-colors">
                    {product.name}
                  </h3>
                </Link>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {product.description || product.short_description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-blue-600">
                    {formatCurrency(product.base_price || product.price, 'USD', locale)}
                  </span>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                    {t('addToCart')}
                  </button>
                </div>
                {searchResults && product.relevance_score && (
                  <div className="mt-2 text-xs text-gray-500">
                    {locale === 'zh' ? '相关性' : 'Relevance'}: {(product.relevance_score * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <nav className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const newPage = pagination.page - 1;
                  if (searchQuery) {
                    performSearch(searchQuery, newPage);
                  } else {
                    loadProducts(selectedCategory, newPage);
                  }
                }}
                disabled={pagination.page <= 1}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tCommon('previous')}
              </button>
              
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => {
                      if (searchQuery) {
                        performSearch(searchQuery, pageNum);
                      } else {
                        loadProducts(selectedCategory, pageNum);
                      }
                    }}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${
                      pagination.page === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                onClick={() => {
                  const newPage = pagination.page + 1;
                  if (searchQuery) {
                    performSearch(searchQuery, newPage);
                  } else {
                    loadProducts(selectedCategory, newPage);
                  }
                }}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tCommon('next')}
              </button>
            </nav>
          </div>
        )}

        {/* Empty State */}
        {displayProducts.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? tSearch('noResults') : (locale === 'zh' ? '没有找到产品' : 'No products found')}
            </h3>
            <p className="text-gray-600">
              {searchQuery ? (
                locale === 'zh' 
                  ? '尝试使用不同的关键词或调整筛选条件'
                  : 'Try different keywords or adjust your filters'
              ) : (
                locale === 'zh' 
                  ? '尝试选择不同的分类或稍后再试'
                  : 'Try selecting a different category or check back later'
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}