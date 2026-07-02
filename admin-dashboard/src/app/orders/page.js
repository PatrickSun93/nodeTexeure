'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminOrders, getErrorMessage, isAuthError } from '../../lib/api';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function OrdersPage() {
  const t = useTranslations('Orders');
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Filters and pagination
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    status: '',
    search: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
    customerType: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalOrders: 0,
    limit: 20
  });

  const [statusStats, setStatusStats] = useState([]);

  // Order status, customer type, and sort options with localized labels
  const ORDER_STATUSES = [
    { value: '', label: t('statusAll') },
    { value: 'pending', label: t('statusPending'), color: 'bg-yellow-100 text-yellow-800' },
    { value: 'confirmed', label: t('statusConfirmed'), color: 'bg-blue-100 text-blue-800' },
    { value: 'processing', label: t('statusProcessing'), color: 'bg-purple-100 text-purple-800' },
    { value: 'shipped', label: t('statusShipped'), color: 'bg-indigo-100 text-indigo-800' },
    { value: 'delivered', label: t('statusDelivered'), color: 'bg-green-100 text-green-800' },
    { value: 'cancelled', label: t('statusCancelled'), color: 'bg-red-100 text-red-800' },
    { value: 'refunded', label: t('statusRefunded'), color: 'bg-gray-100 text-gray-800' }
  ];

  const CUSTOMER_TYPES = [
    { value: '', label: t('customerAll') },
    { value: 'registered', label: t('registered') },
    { value: 'guest', label: t('guest') }
  ];

  const SORT_OPTIONS = [
    { value: 'created_at', label: t('sortDateCreated') },
    { value: 'total_amount', label: t('sortOrderValue') },
    { value: 'status', label: t('status') },
    { value: 'order_number', label: t('sortOrderNumber') }
  ];

  // Fetch orders with current filters
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await adminOrders.getOrders(filters);

      if (response.success) {
        setOrders(response.keyValueTable.orders || []);
        setPagination(response.keyValueTable.pagination || {});
        setStatusStats(response.keyValueTable.statusStats || []);
      } else {
        setError(response.message || t('fetchFailed'));
      }
    } catch (err) {
      if (isAuthError(err)) {
        router.push('/login');
        return;
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, router, t]);

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1 // Reset to first page when filters change
    }));
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  // Handle order selection
  const handleOrderSelect = (orderId, checked) => {
    if (checked) {
      setSelectedOrders(prev => [...prev, orderId]);
    } else {
      setSelectedOrders(prev => prev.filter(id => id !== orderId));
    }
  };

  // Handle select all
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedOrders(orders.map(order => order.id));
    } else {
      setSelectedOrders([]);
    }
  };

  // Handle bulk status update
  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedOrders.length === 0) {
      alert(t('selectOrdersToUpdate'));
      return;
    }

    const notes = prompt(t('enterNotes', { status: newStatus }));
    if (notes === null) return; // User cancelled

    try {
      setBulkActionLoading(true);

      const response = await adminOrders.bulkUpdateOrders(selectedOrders, newStatus, notes);

      if (response.success) {
        alert(t('updateSuccess', { count: response.keyValueTable.successful }));
        setSelectedOrders([]);
        fetchOrders(); // Refresh the list
      } else {
        alert(t('updateFailed', { message: response.message }));
      }
    } catch (err) {
      alert(t('updateError', { message: getErrorMessage(err) }));
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Get status color class
  const getStatusColor = (status) => {
    const statusObj = ORDER_STATUSES.find(s => s.value === status);
    return statusObj?.color || 'bg-gray-100 text-gray-800';
  };

  // Format currency
  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600">{t('subtitle')}</p>
      </div>

      {/* Status Stats */}
      {statusStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          {ORDER_STATUSES.slice(1).map(status => {
            const stat = statusStats.find(s => s.status === status.value);
            const count = stat?.count || 0;
            const value = stat?.total_value || 0;

            return (
              <div key={status.value} className="bg-white p-4 rounded-lg shadow border">
                <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${status.color} mb-2`}>
                  {status.label}
                </div>
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <div className="text-sm text-gray-500">{formatCurrency(value)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('searchOrders')}
            </label>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('status')}
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ORDER_STATUSES.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('customerType')}
            </label>
            <select
              value={filters.customerType}
              onChange={(e) => handleFilterChange('customerType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CUSTOMER_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sortBy')}
            </label>
            <div className="flex gap-2">
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title={filters.sortOrder === 'asc' ? t('sortDescending') : t('sortAscending')}
              >
                {filters.sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {/* Date and Amount Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dateFrom')}
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dateTo')}
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('minAmount')}
            </label>
            <input
              type="number"
              placeholder={t('minAmountPlaceholder')}
              value={filters.minAmount}
              onChange={(e) => handleFilterChange('minAmount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('maxAmount')}
            </label>
            <input
              type="number"
              placeholder={t('maxAmountPlaceholder')}
              value={filters.maxAmount}
              onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedOrders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">
              {t('ordersSelected', { count: selectedOrders.length })}
            </span>
            <div className="flex gap-2">
              {ORDER_STATUSES.slice(1).map(status => (
                <button
                  key={status.value}
                  onClick={() => handleBulkStatusUpdate(status.value)}
                  disabled={bulkActionLoading}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {t('markAs', { status: status.label })}
                </button>
              ))}
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

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedOrders.length === orders.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnOrder')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnCustomer')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnAmount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnItems')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnDate')}
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
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                    {t('noOrders')}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={(e) => handleOrderSelect(order.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {order.order_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          {t('idLabel', { id: order.id })}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {order.customer_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {order.customer_email || order.guest_email}
                        </div>
                        <div className="text-xs text-gray-400">
                          {order.user_id ? t('registered') : t('guest')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                      {order.payment_status && (
                        <div className="text-xs text-gray-500 mt-1">
                          {t('paymentLabel', { status: order.payment_status })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(order.total_amount, order.currency)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {t('itemsCount', { count: order.total_items })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('productsCount', { count: order.item_count })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatDate(order.created_at)}
                      </div>
                      {order.tracking_number && (
                        <div className="text-xs text-gray-500">
                          {t('trackingLabel', { number: order.tracking_number })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        {t('viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={pagination.currentPage <= 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={pagination.currentPage >= pagination.totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('next')}
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    {t.rich('showingResults', {
                      from: ((pagination.currentPage - 1) * pagination.limit) + 1,
                      to: Math.min(pagination.currentPage * pagination.limit, pagination.totalOrders),
                      total: pagination.totalOrders,
                      medium: (chunks) => <span className="font-medium">{chunks}</span>
                    })}
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={pagination.currentPage <= 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t('previous')}
                    </button>

                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            pageNum === pagination.currentPage
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={pagination.currentPage >= pagination.totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t('next')}
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
