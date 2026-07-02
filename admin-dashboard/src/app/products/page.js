'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { adminProducts, getErrorMessage } from '../../lib/api';

export default function ProductsPage() {
  const t = useTranslations('Products');
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    category: '',
    page: 1,
    limit: 20,
    sort_by: 'created_at',
    sort_order: 'DESC'
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [bulkAction, setBulkAction] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminProducts.getProducts(filters);

      if (response.status === 'SUCCESS') {
        setProducts(response.keyValueTable.products || []);
        setPagination(response.keyValueTable.pagination || {});
      } else {
        throw new Error(response.message || t('failedToFetch'));
      }
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load products on component mount and filter changes
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value // Reset to page 1 when changing filters
    }));
  };

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    fetchProducts();
  };

  // Handle product selection
  const handleProductSelect = (productId) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  // Handle bulk actions
  const handleBulkAction = async () => {
    if (!bulkAction || selectedProducts.size === 0) return;

    try {
      setBulkLoading(true);
      const productIds = Array.from(selectedProducts);

      if (bulkAction === 'delete') {
        await adminProducts.bulkDeleteProducts(productIds);
      } else if (bulkAction.startsWith('status_')) {
        const status = bulkAction.replace('status_', '');
        await adminProducts.bulkUpdateProducts(productIds, { status });
      }

      // Refresh products list
      await fetchProducts();
      setSelectedProducts(new Set());
      setBulkAction('');
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error performing bulk action:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  // Handle individual status update
  const handleStatusUpdate = async (productId, newStatus) => {
    try {
      await adminProducts.updateProductStatus(productId, newStatus);
      await fetchProducts(); // Refresh the list
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error updating product status:', err);
    }
  };

  // Format price
  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    const colors = {
      'draft': 'bg-gray-100 text-gray-800',
      'pending_approval': 'bg-yellow-100 text-yellow-800',
      'approved': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'discontinued': 'bg-gray-100 text-gray-500'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              {t('title')}
            </h1>
            <nav className="flex items-center space-x-4">
              <a
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                {t('navDashboard')}
              </a>
              <a
                href="/products"
                className="text-sm text-blue-600 px-3 py-2 rounded-md bg-blue-50"
              >
                {t('navProducts')}
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('searchLabel')}
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('statusLabel')}
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('allStatuses')}</option>
              <option value="draft">{t('statuses.draft')}</option>
              <option value="pending_approval">{t('statuses.pending_approval')}</option>
              <option value="approved">{t('statuses.approved')}</option>
              <option value="rejected">{t('statuses.rejected')}</option>
              <option value="discontinued">{t('statuses.discontinued')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sortByLabel')}
            </label>
            <select
              value={`${filters.sort_by}_${filters.sort_order}`}
              onChange={(e) => {
                const [sort_by, sort_order] = e.target.value.split('_');
                handleFilterChange('sort_by', sort_by);
                handleFilterChange('sort_order', sort_order);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at_DESC">{t('sortNewest')}</option>
              <option value="created_at_ASC">{t('sortOldest')}</option>
              <option value="name_ASC">{t('sortNameAsc')}</option>
              <option value="name_DESC">{t('sortNameDesc')}</option>
              <option value="base_price_ASC">{t('sortPriceAsc')}</option>
              <option value="base_price_DESC">{t('sortPriceDesc')}</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('searchButton')}
            </button>
          </div>
        </form>
      </div>

      {/* Bulk Actions */}
      {selectedProducts.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              {t('selectedCount', { count: selectedProducts.size })}
            </span>
            <div className="flex items-center space-x-2">
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
                className="px-3 py-1 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('selectAction')}</option>
                <option value="status_approved">{t('bulkApprove')}</option>
                <option value="status_rejected">{t('bulkReject')}</option>
                <option value="status_discontinued">{t('bulkDiscontinue')}</option>
                <option value="delete">{t('bulkDelete')}</option>
              </select>
              <button
                onClick={handleBulkAction}
                disabled={!bulkAction || bulkLoading}
                className="px-4 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {bulkLoading ? t('processing') : t('apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selectedProducts.size === products.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnProduct')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnSku')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnCategory')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnPrice')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnStatus')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnCreated')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnActions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                    {t('loading')}
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                    {t('noProducts')}
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => handleProductSelect(product.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-xs text-gray-500">{t('imagePlaceholder')}</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {product.name}
                          </div>
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {product.short_description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.category_name || t('notAvailable')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatPrice(product.base_price)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(product.status)}`}>
                        {t(`statuses.${product.status}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(product.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => window.open(`/products/${product.id}`, '_blank')}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {t('actionView')}
                        </button>
                        <button
                          onClick={() => router.push(`/products/${product.id}/edit`)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          {t('actionEdit')}
                        </button>
                        <button
                          onClick={() => router.push(`/products/${product.id}/approval`)}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          {t('actionApproval')}
                        </button>
                        {product.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(product.id, 'approved')}
                              className="text-green-600 hover:text-green-900"
                            >
                              {t('actionQuickApprove')}
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(product.id, 'rejected')}
                              className="text-red-600 hover:text-red-900"
                            >
                              {t('actionQuickReject')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handleFilterChange('page', Math.max(1, pagination.page - 1))}
                disabled={pagination.page <= 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('previous')}
              </button>
              <button
                onClick={() => handleFilterChange('page', Math.min(pagination.totalPages, pagination.page + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('next')}
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  {t.rich('showingResults', {
                    from: ((pagination.page - 1) * pagination.limit) + 1,
                    to: Math.min(pagination.page * pagination.limit, pagination.total),
                    total: pagination.total,
                    b: (chunks) => <span className="font-medium">{chunks}</span>
                  })}
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label={t('paginationAriaLabel')}>
                  <button
                    onClick={() => handleFilterChange('page', Math.max(1, pagination.page - 1))}
                    disabled={pagination.page <= 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('previous')}
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handleFilterChange('page', pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          pageNum === pagination.page
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => handleFilterChange('page', Math.min(pagination.totalPages, pagination.page + 1))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('next')}
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
      </main>
    </div>
  );
}
