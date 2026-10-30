'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import ProductDetailView from '../ProductDetailView';
import { useNotifications } from '../NotificationSystem';

export default function ProductsView() {
  const t = useTranslations('Dashboard');
  const notify = useNotifications();
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bulk-select + bulk-delete state (selection keyed by row id; payload dedupes to product_id).
  const [selectedProductRows, setSelectedProductRows] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch('/api/admin/products');

        if (response.status === 'SUCCESS') {
          // Parse array of objects [{products: [...] }]
          // Find the object that has 'products' key
          const data = response.keyValueTable.find(item => item.products)?.products || [];
          setProducts(data);
        } else {
          setError(t('productsLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading products:', err);
        setError(t('productsLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, [viewMode, reloadKey]); // Re-fetch when switching back to list or after a bulk delete

  // Map image for display if API returns thumbnail_small_url
  const displayProducts = products.map(p => ({
    ...p,
    image: p.thumbnail_small_url || p.image || 'https://placehold.co/40x40/e5e7eb/374151?text=IMG'
  }));

  // Build the category dropdown from the real category values the API returns (admin
  // GET /products exposes `category` = category name). Deriving the options from the data
  // guarantees the filter below actually matches instead of comparing to hardcoded labels.
  const categoryOptions = Array.from(
    new Set(displayProducts.map(p => p.category).filter(Boolean))
  ).sort();

  // Filtering Logic
  const filteredProducts = displayProducts.filter(product => {
    // Compare against the real category field returned by the API (product.category),
    // which is exactly what the dropdown options are populated from.
    const matchesCategory = categoryFilter === 'All' || product.category === categoryFilter;

    const matchesStatus = statusFilter === 'All' ||
      (statusFilter === 'Active' && product.status === 'Active') ||
      (statusFilter === 'Draft' && product.status === 'Draft') ||
      (statusFilter === 'Out of Stock' && product.stock === 0);

    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesStatus && matchesSearch;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter, searchQuery]);

  // Bulk selection: rows are keyed by row id; the delete payload dedupes down to product ids.
  const pageProductIds = paginatedProducts.map((p) => p.id);
  const allPageProductsSelected = pageProductIds.length > 0 && pageProductIds.every((id) => selectedProductRows.has(id));
  const selectedProductIds = Array.from(new Set(
    displayProducts.filter((p) => selectedProductRows.has(p.id)).map((p) => p.product_id || p.id)
  ));

  const toggleProductRow = (id) => {
    setSelectedProductRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllProducts = (ids, checked) => {
    setSelectedProductRows((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const clearProductSelection = () => setSelectedProductRows(new Set());

  const handleBulkDeleteProducts = async () => {
    if (selectedProductIds.length === 0) return;
    if (!confirm(t('bulkConfirmDeleteProducts', { count: selectedProductIds.length }))) return;
    setBulkBusy(true);
    try {
      const { apiFetch } = await import('../../utils/api');
      const response = await apiFetch('/api/admin/products/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ productIds: selectedProductIds }),
      });
      if (response.status === 'SUCCESS') {
        const deleted = response.keyValueTable?.find?.((i) => i.result)?.result?.deleted
          ?? response.keyValueTable?.[0]?.result?.deleted ?? selectedProductIds.length;
        notify.success(t('bulkProductsDeleted', { count: deleted }));
        clearProductSelection();
        setReloadKey((k) => k + 1);
      } else {
        notify.error(t('bulkProductsDeleteFailed'));
      }
    } catch (e) {
      console.error('Bulk delete products failed', e);
      notify.error(t('bulkProductsDeleteFailed'));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleAddProduct = () => {
    setSelectedProduct(null);
    setViewMode('add');
  };

  const handleEditProduct = (product) => {
    setSelectedProduct(product);
    setViewMode('edit');
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedProduct(null);
  };

  // Wire the row trash button to DELETE /api/admin/products/:id (real endpoint).
  // The list flattens variants into rows, so delete the parent product id (product_id).
  const handleDeleteProduct = async (product) => {
    const pid = product.product_id || product.id;
    if (!pid) return;
    if (!confirm(t('confirmDeleteProduct'))) return;
    try {
      const { apiFetch } = await import('../../utils/api');
      const response = await apiFetch(`/api/admin/products/${pid}`, { method: 'DELETE' });
      if (response.status === 'SUCCESS') {
        setProducts((prev) => prev.filter((p) => (p.product_id || p.id) !== pid));
      } else {
        notify.error(t('deleteProductError'));
      }
    } catch (e) {
      console.error('Delete product failed', e);
      notify.error(t('deleteProductError'));
    }
  };

  if (viewMode === 'add' || viewMode === 'edit') {
    return <ProductDetailView product={selectedProduct} onBack={handleBack} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('productsTitle')}</h2>
          <p className="text-gray-500 mt-1">{t('productsSubtitle')}</p>
        </div>
        <button
          onClick={handleAddProduct}
          className="px-4 py-2 bg-brand text-white rounded-md hover:bg-brand-hover transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('addNewProduct')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 space-y-4">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder={t('searchProductsPlaceholder')}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <select
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand bg-white text-gray-600"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">{t('categoryAll')}</option>
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand bg-white text-gray-600"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">{t('statusFilterAll')}</option>
            <option value="Active">{t('statusActive')}</option>
            <option value="Draft">{t('statusDraft')}</option>
            <option value="Out of Stock">{t('statusOutOfStock')}</option>
          </select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedProductIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-brand-soft border border-brand-border rounded-lg">
          <span className="text-sm font-medium text-brand-deep">{t('bulkSelected', { count: selectedProductIds.length })}</span>
          <button
            onClick={handleBulkDeleteProducts}
            disabled={bulkBusy}
            className="px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
          >
            {bulkBusy ? t('bulkDeleting') : t('bulkDelete')}
          </button>
          <button onClick={clearProductSelection} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
            {t('bulkClear')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-left w-10">
                  <input
                    type="checkbox"
                    aria-label={t('selectAll')}
                    checked={allPageProductsSelected}
                    onChange={(e) => toggleSelectAllProducts(pageProductIds, e.target.checked)}
                    className="rounded border-gray-300 text-brand focus:ring-brand cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colProductName')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colSku')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colCategory')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colPrice')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colStock')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colStatus')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-500">{t('loadingProducts')}</td></tr>
              ) : error ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-500">{t('noProductsFound')}</td></tr>
              ) : (
                paginatedProducts.map((product) => (
                  <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${selectedProductRows.has(product.id) ? 'bg-brand-softer' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={t('selectRow')}
                        checked={selectedProductRows.has(product.id)}
                        onChange={() => toggleProductRow(product.id)}
                        className="rounded border-gray-300 text-brand focus:ring-brand cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={product.image} alt={product.name} className="w-10 h-10 rounded object-cover bg-gray-100" />
                        <span className="text-sm font-medium text-gray-900">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{product.sku}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">${product.price}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{product.stock}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${product.status === 'Active' ? 'bg-green-100 text-green-800' :
                        product.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {product.status === 'Active' ? `● ${t('statusActive')}` : product.status === 'Draft' ? `● ${t('statusDraft')}` : t('statusOutOfStock')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-3">
                        <button onClick={() => handleEditProduct(product)} className="text-gray-400 hover:text-blue-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onClick={() => handleDeleteProduct(product)} title="Delete product" className="text-gray-400 hover:text-red-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {filteredProducts.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white">
            <span className="text-sm text-gray-500">
              {t('showingResults', { from: Math.min((currentPage - 1) * itemsPerPage + 1, filteredProducts.length), to: Math.min(currentPage * itemsPerPage, filteredProducts.length), total: filteredProducts.length })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {t('previous')}
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded border text-sm ${currentPage === page
                    ? 'border-brand bg-brand-soft text-brand-deep font-medium'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {t('next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
