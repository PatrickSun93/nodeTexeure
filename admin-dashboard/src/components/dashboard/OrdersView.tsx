'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import OrderDetailView from '../OrderDetailView';
import { useNotifications } from '../NotificationSystem';
import type { OrderListItem, Table } from '@/types/api';

// Bulk actions must send the real orders.id (`_id`); `id` is the display order
// number, which the bulk endpoint can't match (it silently updated 0 orders).
const orderKey = (order: OrderListItem) => order._id || order.id;

export default function OrdersView() {
  const t = useTranslations('Dashboard');
  const notify = useNotifications();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateInput, setDateInput] = useState(''); // draft value in the date picker
  const [appliedDate, setAppliedDate] = useState(''); // committed by the "Filters" button
  const [selectedOrder, setSelectedOrder] = useState<OrderListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // Bulk-select + bulk status update state.
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch<Table<'orders', OrderListItem[]>>('/api/admin/orders');

        if (response.status === 'SUCCESS') {
          const data = response.keyValueTable.find(item => item.orders)?.orders || [];
          setOrders(data);
        } else {
          setError(t('ordersLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading orders:', err);
        setError(t('ordersLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, [selectedOrder, reloadKey]); // Re-fetch when returning from detail view or after a bulk update

  const bulkStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  const toggleOrderSelected = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOrders = (ids: string[], checked: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const clearOrderSelection = () => { setSelectedOrderIds(new Set()); setBulkStatus(''); };

  const handleBulkOrderUpdate = async () => {
    if (selectedOrderIds.size === 0) return;
    if (!bulkStatus) { notify.warning(t('bulkSelectStatusFirst')); return; }
    setBulkBusy(true);
    try {
      const { apiFetch } = await import('../../utils/api');
      const response = await apiFetch<Table<'result', { updated: number }>>('/api/admin/orders/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ orderIds: Array.from(selectedOrderIds), status: bulkStatus }),
      });
      if (response.status === 'SUCCESS') {
        const updated = response.keyValueTable?.find?.((i) => i.result)?.result?.updated
          ?? response.keyValueTable?.[0]?.result?.updated ?? selectedOrderIds.size;
        notify.success(t('bulkOrdersUpdated', { count: updated }));
        clearOrderSelection();
        setReloadKey((k) => k + 1);
      } else {
        notify.error(t('bulkOrdersUpdateFailed'));
      }
    } catch (e) {
      console.error('Bulk order update failed', e);
      notify.error(t('bulkOrdersUpdateFailed'));
    } finally {
      setBulkBusy(false);
    }
  };

  // Local YYYY-MM-DD for a timestamp, matching the value produced by the <input type="date">.
  const toLocalYMD = (d: string | null | undefined) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-CA'); } catch { return ''; }
  };

  const filteredOrders = orders.filter(order =>
    (selectedStatus === 'All' || order.status === selectedStatus) &&
    (!appliedDate || toLocalYMD(order.date) === appliedDate) &&
    ((order.id && String(order.id).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.customer && order.customer.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  // Client-side pagination over the filtered set.
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 whenever the filters change.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, searchQuery, appliedDate]);

  // Client-side CSV export of the currently displayed (filtered) orders.
  const handleExport = () => {
    const escape = (val: unknown) => {
      const s = (val === null || val === undefined) ? '' : String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [t('colOrderId'), t('colDate'), t('colCustomerName'), t('colStatus'), t('colTotalAmount')];
    const rows = filteredOrders.map(o => [
      o.id,
      o.date ? new Date(o.date).toLocaleDateString() : '',
      o.customer,
      o.status,
      Number(o.amount || 0).toFixed(2)
    ].map(escape).join(','));
    const csv = [header.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const statuses = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  const pageOrderIds = paginatedOrders.map(orderKey);
  const allPageOrdersSelected = pageOrderIds.length > 0 && pageOrderIds.every((id) => selectedOrderIds.has(id));

  if (selectedOrder) {
    return <OrderDetailView order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">{t('orderQueueTitle')}</h2>
        <button
          onClick={handleExport}
          disabled={filteredOrders.length === 0}
          className="px-4 py-2 bg-brand text-white rounded-md hover:bg-brand-hover transition shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('exportOrders')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder={t('searchOrdersPlaceholder')}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand bg-white text-gray-600"
            />
          </div>
          <button
            onClick={() => setAppliedDate(dateInput)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-2 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            {t('filters')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {statuses.map(status => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${selectedStatus === status
              ? 'bg-brand-soft text-brand-deep' // Beige/Gold-ish for active
              : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
              }`}
          >
            {t(`status${status}`)}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedOrderIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-brand-soft border border-brand-border rounded-lg">
          <span className="text-sm font-medium text-brand-deep">{t('bulkSelected', { count: selectedOrderIds.size })}</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">{t('bulkChooseStatus')}</option>
            {bulkStatuses.map((s) => <option key={s} value={s}>{t(`status${s}`)}</option>)}
          </select>
          <button
            onClick={handleBulkOrderUpdate}
            disabled={bulkBusy}
            className="px-4 py-1.5 bg-brand text-white rounded-lg hover:bg-brand-hover text-sm font-medium disabled:opacity-50"
          >
            {bulkBusy ? t('bulkUpdating') : t('bulkApply')}
          </button>
          <button onClick={clearOrderSelection} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
            {t('bulkClear')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left w-10">
                  <input
                    type="checkbox"
                    aria-label={t('selectAll')}
                    checked={allPageOrdersSelected}
                    onChange={(e) => toggleSelectAllOrders(pageOrderIds, e.target.checked)}
                    className="rounded border-gray-300 text-brand focus:ring-brand cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colOrderId')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colDate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colCustomerName')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colTotalAmount')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colDestination')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colStatus')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-500">{t('loadingOrders')}</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-500">{t('noOrdersFound')}</td></tr>
              ) : (
                paginatedOrders.map((order) => (
                  <tr key={orderKey(order)} className={`hover:bg-gray-50 transition-colors ${selectedOrderIds.has(orderKey(order)) ? 'bg-brand-softer' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={t('selectRow')}
                        checked={selectedOrderIds.has(orderKey(order))}
                        onChange={() => toggleOrderSelected(orderKey(order))}
                        className="rounded border-gray-300 text-brand focus:ring-brand cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-600">{order.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">{order.customer}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">${Number(order.amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{order.destination}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-md ${order.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'Shipped' ? 'bg-purple-100 text-purple-800' :
                            order.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                        }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-brand hover:text-brand-muted font-medium"
                      >
                        {t('editDetails')}
                      </button>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white">
          <span className="text-sm text-gray-500">
            {t('showingResults', {
              from: Math.min((currentPage - 1) * itemsPerPage + 1, filteredOrders.length),
              to: Math.min(currentPage * itemsPerPage, filteredOrders.length),
              total: filteredOrders.length,
            })}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded hover:bg-gray-100 text-gray-500 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-2 rounded hover:bg-gray-100 text-gray-500 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
