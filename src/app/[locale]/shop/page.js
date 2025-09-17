'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { formatCurrency } from '../../../lib/i18nUtils';
import { useLocale } from 'next-intl';

export default function ShopPage() {
  const t = useTranslations('product');
  const tCategories = useTranslations('categories');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Mock products data for demonstration
  useEffect(() => {
    const mockProducts = [
      {
        id: 1,
        name: locale === 'zh' ? '豪华棉质床单' : 'Luxury Cotton Sheets',
        price: 89.99,
        category: 'sheets',
        image: '/api/placeholder/400/300',
        description: locale === 'zh' 
          ? '采用优质埃及棉制成的豪华床单套装'
          : 'Premium Egyptian cotton sheet set for ultimate comfort'
      },
      {
        id: 2,
        name: locale === 'zh' ? '记忆泡沫枕头' : 'Memory Foam Pillow',
        price: 45.99,
        category: 'pillows',
        image: '/api/placeholder/400/300',
        description: locale === 'zh' 
          ? '符合人体工程学的记忆泡沫枕头'
          : 'Ergonomic memory foam pillow for better sleep'
      },
      {
        id: 3,
        name: locale === 'zh' ? '羊毛毯子' : 'Wool Blanket',
        price: 129.99,
        category: 'blankets',
        image: '/api/placeholder/400/300',
        description: locale === 'zh' 
          ? '天然羊毛制成的温暖毯子'
          : 'Warm and cozy natural wool blanket'
      }
    ];

    setTimeout(() => {
      setProducts(mockProducts);
      setLoading(false);
    }, 1000);
  }, [locale]);

  const categories = [
    { key: 'all', label: tCategories('all') },
    { key: 'sheets', label: tCategories('sheets') },
    { key: 'pillows', label: tCategories('pillows') },
    { key: 'blankets', label: tCategories('blankets') },
    { key: 'mattresses', label: tCategories('mattresses') },
    { key: 'accessories', label: tCategories('accessories') }
  ];

  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(product => product.category === selectedCategory);

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
            {t('title')} {tCommon('shop') || 'Shop'}
          </h1>
          <p className="text-gray-600">
            {locale === 'zh' 
              ? '探索我们精选的优质床上用品系列'
              : 'Explore our curated collection of premium bedding products'
            }
          </p>
        </div>

        {/* Category Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.key}
                onClick={() => setSelectedCategory(category.key)}
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

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-w-4 aspect-h-3">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-48 object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {product.name}
                </h3>
                <p className="text-gray-600 text-sm mb-4">
                  {product.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-blue-600">
                    {formatCurrency(product.price, 'USD', locale)}
                  </span>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                    {t('addToCart')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {locale === 'zh' ? '没有找到产品' : 'No products found'}
            </h3>
            <p className="text-gray-600">
              {locale === 'zh' 
                ? '尝试选择不同的分类或稍后再试'
                : 'Try selecting a different category or check back later'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}