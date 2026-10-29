'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ensureCsrfToken } from '../../utils/api';
import MetricsCard from '../../components/MetricsCard';
import RecentOrdersTable from '../../components/RecentOrdersTable';
import ProductDetailView from '../../components/ProductDetailView';
import CustomerDetailView from '../../components/CustomerDetailView';
import AddCustomerModal from '../../components/AddCustomerModal';
import PromotionDetailView from '../../components/PromotionDetailView';
import PromotionModal from '../../components/PromotionModal';
import StaffDetailView from '../../components/StaffDetailView';
import SettingsView from '../../components/SettingsView';
import EmailTemplatesView from '../../components/EmailTemplatesView';
import AnalyticsDashboard from '../../components/AnalyticsDashboard';
import BulkUploadView from '../../components/BulkUploadView';
import ReviewModerationView from '../../components/ReviewModerationView';
import EmailQueueView from '../../components/EmailQueueView';

export default function Dashboard() {
  const t = useTranslations('Dashboard');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timePeriod, setTimePeriod] = useState('last-30-days');
  const router = useRouter();

  // Analytics state
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    activeOrders: 0,
    avgOrderValue: 0,
    conversionRate: 0
  });
  const [recentOrders, setRecentOrders] = useState([]);
  // Period-over-period change percentages for the metric badges (null until loaded / when unavailable)
  const [growth, setGrowth] = useState(null);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      const fetchAnalytics = async () => {
        try {
          const { apiFetch } = await import('../../utils/api');
          const response = await apiFetch('/api/admin/analytics/summary');
          if (response.status === 'SUCCESS' && response.keyValueTable?.[0]?.metrics) {
            setMetrics(response.keyValueTable[0].metrics);
          }
        } catch (e) {
          console.error("Failed to load analytics", e);
        }

        // Period-over-period change % for the metric badges (revenue / orders / AOV)
        try {
          const { apiFetch } = await import('../../utils/api');
          const response = await apiFetch('/api/admin/analytics/revenue-shortfall');
          if (response.status === 'SUCCESS') {
            const kvt = response.keyValueTable;
            const payload = Array.isArray(kvt) ? kvt[0] : kvt;
            if (payload && payload.change) {
              setGrowth({
                revenue_pct: payload.change.revenue_pct,
                orders_pct: payload.change.orders_pct,
                aov_pct: payload.change.aov_pct
              });
            }
          }
        } catch (e) {
          console.error("Failed to load growth metrics", e);
        }

        // Also fetch recent orders
        try {
          const { apiFetch } = await import('../../utils/api');
          const response = await apiFetch('/api/admin/orders');
          if (response.status === 'SUCCESS') {
            const allOrders = response.keyValueTable.find(item => item.orders)?.orders || [];
            if (allOrders.length > 0) {
              setRecentOrders(allOrders.slice(0, 5));
            }
          }
        } catch (e) {
          console.error("Failed to load recent orders", e);
        }
      };
      fetchAnalytics();
    }
  }, [activeTab]);

  useEffect(() => {
    // Guard: verify auth and ensure CSRF token is present
    (async () => {
      try {
        await ensureCsrfToken();
      } catch (e) {
        // Not authenticated or not admin
        router.push('/');
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    try {
      const { apiFetch } = await import('../../utils/api');
      await apiFetch('/api/admin/logout', { method: 'POST' });
      router.push('/');
    } catch (e) {
      // If unauthorized or other issue, still return to login
      router.push('/');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('brandSubtitle')}</p>
        </div>
        <nav className="flex-1 py-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📊 {t('navDashboard')}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'orders' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📦 {t('navOrders')}
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'products' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            🏷️ {t('navProducts')}
          </button>
          <button
            onClick={() => setActiveTab('email-templates')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'email-templates' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📧 {t('navEmailTemplates')}
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'customers' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            👥 {t('navCustomers')}
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'staff' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            🛡️ {t('navStaff')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            ⚙️ {t('navSettings')}
          </button>
          <button
            onClick={() => setActiveTab('promotions')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'promotions' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            🎟️ {t('navPromotions')}
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'reviews' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            ⭐ {t('navReviews')}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'analytics' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📈 {t('navAnalytics')}
          </button>
          <button
            onClick={() => setActiveTab('bulk-upload')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'bulk-upload' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📤 {t('navBulkUpload')}
          </button>
          <button
            onClick={() => setActiveTab('email-queue')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'email-queue' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            ✉️ {t('navEmailQueue')}
          </button>
        </nav>
        <div className="p-6 border-t">
          <button onClick={handleLogout} className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition">
            {t('logout')}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <DashboardView timePeriod={timePeriod} setTimePeriod={setTimePeriod} metrics={metrics} recentOrders={recentOrders} growth={growth} />}
        {activeTab === 'orders' && <OrdersView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'email-templates' && <EmailTemplatesView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'staff' && <StaffView />}
        {activeTab === 'settings' && <SettingsView />}
        {activeTab === 'promotions' && <PromotionsView />}
        {activeTab === 'reviews' && <ReviewModerationView />}

        {activeTab === 'analytics' && <AnalyticsDashboard />}
        {activeTab === 'bulk-upload' && <BulkUploadView />}
        {activeTab === 'email-queue' && <EmailQueueView />}
      </div>
    </div>
  );
}

function DashboardView({ timePeriod, setTimePeriod, metrics, recentOrders, growth }) {
  const t = useTranslations('Dashboard');

  // Turn a period-over-period percentage into a badge (real value, +/- sign, up/down color).
  // Unavailable metrics (null/undefined/NaN) render a neutral dash rather than a fake number.
  const badge = (pct) => {
    const n = Number(pct);
    if (pct === null || pct === undefined || pct === '' || Number.isNaN(n)) {
      return { change: '--%', trend: 'neutral' };
    }
    if (n > 0) return { change: `+${n}%`, trend: 'up' };
    if (n < 0) return { change: `${n}%`, trend: 'down' };
    return { change: '0%', trend: 'neutral' };
  };

  const revenueBadge = badge(growth?.revenue_pct);
  const ordersBadge = badge(growth?.orders_pct);
  const aovBadge = badge(growth?.aov_pct);
  // No conversion-rate change is exposed by the analytics endpoints -> neutral dash.
  const conversionBadge = badge(growth?.conversion_pct);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold">{t('salesDashboardTitle')}</h2>
          <p className="text-gray-500 mt-1">{t('welcomeBack')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTimePeriod('last-30-days')}
            className={`px-4 py-2 rounded transition ${timePeriod === 'last-30-days' ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-white hover:bg-gray-50'}`}
          >
            {t('last30Days')}
          </button>
          <button
            onClick={() => setTimePeriod('last-90-days')}
            className={`px-4 py-2 rounded transition ${timePeriod === 'last-90-days' ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-white hover:bg-gray-50'}`}
          >
            {t('last90Days')}
          </button>
          <button
            onClick={() => setTimePeriod('custom')}
            className={`px-4 py-2 rounded transition ${timePeriod === 'custom' ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-white hover:bg-gray-50'}`}
          >
            {t('customRange')}
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricsCard title={t('totalRevenue')} value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(metrics.totalRevenue)} change={revenueBadge.change} trend={revenueBadge.trend} />
        <MetricsCard title={t('totalOrders')} value={metrics.activeOrders} change={ordersBadge.change} trend={ordersBadge.trend} />
        <MetricsCard title={t('avgOrderValue')} value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(metrics.avgOrderValue)} change={aovBadge.change} trend={aovBadge.trend} />
        <MetricsCard title={t('conversionRate')} value={`${metrics.conversionRate}%`} change={conversionBadge.change} trend={conversionBadge.trend} />
      </div>

      {/* Recent Orders */}
      <RecentOrdersTable orders={recentOrders} />
    </div>
  );
}

// Keep existing management views
import OrderDetailView from '../../components/OrderDetailView';

function OrdersView() {
  const t = useTranslations('Dashboard');
  const [orders, setOrders] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateInput, setDateInput] = useState(''); // draft value in the date picker
  const [appliedDate, setAppliedDate] = useState(''); // committed by the "Filters" button
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // Bulk-select + bulk status update state.
  const [selectedOrderIds, setSelectedOrderIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch('/api/admin/orders');

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

  const toggleOrderSelected = (id) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOrders = (ids, checked) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const clearOrderSelection = () => { setSelectedOrderIds(new Set()); setBulkStatus(''); };

  const handleBulkOrderUpdate = async () => {
    if (selectedOrderIds.size === 0) return;
    if (!bulkStatus) { alert(t('bulkSelectStatusFirst')); return; }
    setBulkBusy(true);
    try {
      const { apiFetch } = await import('../../utils/api');
      const response = await apiFetch('/api/admin/orders/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ orderIds: Array.from(selectedOrderIds), status: bulkStatus }),
      });
      if (response.status === 'SUCCESS') {
        const updated = response.keyValueTable?.find?.((i) => i.result)?.result?.updated
          ?? response.keyValueTable?.[0]?.result?.updated ?? selectedOrderIds.size;
        alert(t('bulkOrdersUpdated', { count: updated }));
        clearOrderSelection();
        setReloadKey((k) => k + 1);
      } else {
        alert(t('bulkOrdersUpdateFailed'));
      }
    } catch (e) {
      console.error('Bulk order update failed', e);
      alert(t('bulkOrdersUpdateFailed'));
    } finally {
      setBulkBusy(false);
    }
  };

  // Local YYYY-MM-DD for a timestamp, matching the value produced by the <input type="date">.
  const toLocalYMD = (d) => {
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
    const escape = (val) => {
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

  const pageOrderIds = paginatedOrders.map((o) => o.id);
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
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-white"
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
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white text-gray-600"
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
              ? 'bg-[#F3EAD8] text-[#8C6B3D]' // Beige/Gold-ish for active
              : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
              }`}
          >
            {t(`status${status}`)}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedOrderIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-[#F3EAD8] border border-[#e5d3ad] rounded-lg">
          <span className="text-sm font-medium text-[#8C6B3D]">{t('bulkSelected', { count: selectedOrderIds.size })}</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
          >
            <option value="">{t('bulkChooseStatus')}</option>
            {bulkStatuses.map((s) => <option key={s} value={s}>{t(`status${s}`)}</option>)}
          </select>
          <button
            onClick={handleBulkOrderUpdate}
            disabled={bulkBusy}
            className="px-4 py-1.5 bg-[#C5A572] text-white rounded-lg hover:bg-[#b09060] text-sm font-medium disabled:opacity-50"
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
                    className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572] cursor-pointer"
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
                <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-500">{t('loadingOrders')}</td></tr>
              ) : error ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-500">{t('noOrdersFound')}</td></tr>
              ) : (
                paginatedOrders.map((order) => (
                  <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${selectedOrderIds.has(order.id) ? 'bg-[#faf5ea]' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={t('selectRow')}
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => toggleOrderSelected(order.id)}
                        className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572] cursor-pointer"
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
                        className="text-[#C5A572] hover:text-[#a08050] font-medium"
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



function ProductsView() {
  const t = useTranslations('Dashboard');
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
        alert(t('bulkProductsDeleted', { count: deleted }));
        clearProductSelection();
        setReloadKey((k) => k + 1);
      } else {
        alert(t('bulkProductsDeleteFailed'));
      }
    } catch (e) {
      console.error('Bulk delete products failed', e);
      alert(t('bulkProductsDeleteFailed'));
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
        alert(t('deleteProductError'));
      }
    } catch (e) {
      console.error('Delete product failed', e);
      alert(t('deleteProductError'));
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
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium flex items-center gap-2"
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
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <select
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white text-gray-600"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">{t('categoryAll')}</option>
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white text-gray-600"
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
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-[#F3EAD8] border border-[#e5d3ad] rounded-lg">
          <span className="text-sm font-medium text-[#8C6B3D]">{t('bulkSelected', { count: selectedProductIds.length })}</span>
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
                    className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572] cursor-pointer"
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
                  <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${selectedProductRows.has(product.id) ? 'bg-[#faf5ea]' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={t('selectRow')}
                        checked={selectedProductRows.has(product.id)}
                        onChange={() => toggleProductRow(product.id)}
                        className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572] cursor-pointer"
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
                    ? 'border-[#C5A572] bg-[#F3EAD8] text-[#8C6B3D] font-medium'
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


function CustomersView() {
  const t = useTranslations('Dashboard');
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bumped after creating a customer to refetch

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch('/api/admin/users');

        if (response.status === 'SUCCESS') {
          const data = response.keyValueTable.find(item => item.users)?.users || [];
          setCustomers(data);
        } else {
          setError(t('customersLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading customers:', err);
        setError(t('customersLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, [reloadKey]); // refetch after a new customer is created

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (selectedCustomer) {
    return <CustomerDetailView customer={selectedCustomer} onBack={() => setSelectedCustomer(null)} />;
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.id && String(c.id).includes(searchQuery))
  );

  // Calculate pagination
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold text-gray-900">{t('customersTitle')}</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('addNewCustomer')}
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
            placeholder={t('searchCustomersPlaceholder')}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600">
            <option>{t('customerSegments')}</option>
            <option>{t('segmentVip')}</option>
            <option>{t('segmentNew')}</option>
          </select>
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600">
            <option>{t('orderHistory')}</option>
            <option>{t('highToLow')}</option>
            <option>{t('lowToHigh')}</option>
          </select>
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600">
            <option>{t('colLastOrderDate')}</option>
            <option>{t('newestFirst')}</option>
            <option>{t('oldestFirst')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colCustomerId')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colName')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colEmail')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colOrders')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colTotalSpent')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colLastOrderDate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan="7" className="px-6 py-10 text-center text-gray-500">{t('loadingCustomers')}</td></tr>
              ) : error ? (
                <tr><td colSpan="7" className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan="7" className="px-6 py-10 text-center text-gray-500">{t('noCustomersFound')}</td></tr>
              ) : (
                paginatedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500">{customer.id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{customer.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{customer.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{customer.orders}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">${Number(customer.spent || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{customer.lastOrder ? new Date(customer.lastOrder).toLocaleDateString() : t('never')}</td>
                    <td className="px-6 py-4 text-sm">
                      <button onClick={() => setSelectedCustomer(customer)} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {filteredCustomers.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white">
            <span className="text-sm text-gray-500">
              {t('showingResults', { from: Math.min((currentPage - 1) * itemsPerPage + 1, filteredCustomers.length), to: Math.min(currentPage * itemsPerPage, filteredCustomers.length), total: filteredCustomers.length })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded border text-sm ${currentPage === page
                    ? 'border-blue-600 bg-blue-50 text-blue-600 font-medium'
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function PromotionsView() {
  const t = useTranslations('Dashboard');
  const [viewMode, setViewMode] = useState('list'); // 'list', 'edit'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchPromotions = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch('/api/admin/coupons');
        if (response.status === 'SUCCESS') {
          const data = response.keyValueTable.find(item => item.coupons)?.coupons || [];
          setPromotions(data);
        } else {
          setError(t('promotionsLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading promotions:', err);
        setError(t('promotionsLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchPromotions();
  }, [viewMode, isModalOpen]); // Re-fetch on view change or modal close

  const handleEdit = (promo) => {
    setSelectedPromotion(promo);
    setViewMode('edit');
  };

  const handleCreate = () => {
    setSelectedPromotion(null);
    setIsModalOpen(true);
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedPromotion(null);
  };

  const handleDelete = async (promo) => {
    if (!promo?.id) return;
    if (!confirm(t('confirmDeletePromotion', { name: promo.name || promo.code || '' }))) return;
    try {
      const { apiFetch } = await import('../../utils/api');
      const response = await apiFetch(`/api/admin/coupons/${promo.id}`, { method: 'DELETE' });
      if (response.status === 'SUCCESS') {
        setPromotions((prev) => prev.filter((p) => p.id !== promo.id));
      } else {
        alert(t('deletePromotionError'));
      }
    } catch (e) {
      console.error('Delete promotion failed', e);
      alert(t('deletePromotionError'));
    }
  };

  // Filter the loaded list client-side (search by name/code, plus type & status selects).
  const filteredPromotions = promotions.filter((promo) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      (promo.name && promo.name.toLowerCase().includes(q)) ||
      (promo.code && promo.code.toLowerCase().includes(q));
    const matchesType = !typeFilter || promo.type === typeFilter;
    const matchesStatus = !statusFilter || promo.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  if (viewMode === 'edit') {
    return <PromotionDetailView promotion={selectedPromotion} onBack={handleBack} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">{t('promotionsTitle')}</h2>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('createNewPromotion')}
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={t('searchPromotionsPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent text-gray-700"
            />
          </div>
          <div className="flex gap-4">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] text-gray-600 min-w-[160px]"
            >
              <option value="">{t('allTypes')}</option>
              <option value="percentage">{t('typePercentage')}</option>
              <option value="fixed_amount">{t('typeFixedAmount')}</option>
              <option value="free_shipping">{t('typeFreeShipping')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] text-gray-600 min-w-[160px]"
            >
              <option value="">{t('allStatuses')}</option>
              <option value="Active">{t('statusActive')}</option>
              <option value="Draft">{t('statusDraft')}</option>
              <option value="Expired">{t('statusExpired')}</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colName')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colCode')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colType')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colDiscountValue')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colStartDate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colEndDate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colStatus')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-500">{t('loadingPromotions')}</td></tr>
              ) : error ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : filteredPromotions.length === 0 ? (
                <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-500">{t('noPromotionsFound')}</td></tr>
              ) : (
                filteredPromotions.map((promo) => (
                  <tr key={promo.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-6 text-sm font-medium text-gray-900">{promo.name}</td>
                    <td className="px-6 py-6 text-sm text-gray-500 font-mono">{promo.code}</td>
                    <td className="px-6 py-6 text-sm text-gray-600 capitalize">{promo.type.replace('_', ' ')}</td>
                    <td className="px-6 py-6 text-sm font-bold text-gray-900">{promo.type === 'percentage' ? `${Number(promo.value)}%` : promo.type === 'fixed_amount' ? `$${Number(promo.value)}` : '-'}</td>
                    <td className="px-6 py-6 text-sm text-gray-500">{promo.startDate ? new Date(promo.startDate).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-6 text-sm text-gray-500">{promo.endDate ? new Date(promo.endDate).toLocaleDateString() : t('noExpiry')}</td>
                    <td className="px-6 py-6">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${promo.status === 'Active' ? 'bg-green-100 text-green-700' :
                        promo.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                          promo.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                        {promo.status}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-sm">
                      <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(promo)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(promo)} className="text-gray-400 hover:text-red-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
      </div>

      <PromotionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        promotion={null}
      />
    </div>
  );
}





function StaffView() {
  const t = useTranslations('Dashboard');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [staff, setStaff] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch('/api/admin/staff');
        if (response.status === 'SUCCESS') {
          const data = response.keyValueTable.find(item => item.staff)?.staff || [];
          setStaff(data);
        } else {
          setError(t('staffLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading staff:', err);
        setError(t('staffLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchStaff();
  }, [selectedStaff, isAddingStaff]); // refetch when returning to the list (create/edit may have changed it)

  // Editing passes the selected member; adding passes null so StaffDetailView runs its
  // create flow (POST /api/admin/users). Passing {} previously made isEditing truthy and
  // fired PUT /api/admin/users/undefined.
  if (selectedStaff || isAddingStaff) {
    return (
      <StaffDetailView
        staff={isAddingStaff ? null : selectedStaff}
        onBack={() => { setSelectedStaff(null); setIsAddingStaff(false); }}
      />
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">{t('staffTitle')}</h2>
        <button
          onClick={() => setIsAddingStaff(true)}
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('addNewStaff')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colName')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colEmail')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colRole')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colStatus')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colLastActive')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">{t('loadingStaff')}</td></tr>
            ) : error ? (
              <tr><td colSpan="6" className="px-6 py-10 text-center text-red-500">{error}</td></tr>
            ) : staff.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">{t('noStaffFound')}</td></tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{member.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{member.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{member.role}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${member.status?.toLowerCase() === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{member.lastActive !== 'Never' ? new Date(member.lastActive).toLocaleString() : t('never')}</td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => setSelectedStaff(member)} className="text-gray-400 hover:text-blue-600">
                      {t('edit')}
                    </button>
                  </td>
                </tr>
              )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
