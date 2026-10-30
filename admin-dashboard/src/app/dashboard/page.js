'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ensureCsrfToken } from '../../utils/api';
import { useAuth } from '@/contexts/AuthContext';
import SettingsView from '../../components/SettingsView';
import EmailTemplatesView from '../../components/EmailTemplatesView';
import AnalyticsDashboard from '../../components/AnalyticsDashboard';
import BulkUploadView from '../../components/BulkUploadView';
import ReviewModerationView from '../../components/ReviewModerationView';
import EmailQueueView from '../../components/EmailQueueView';
import DashboardView from '../../components/dashboard/DashboardView';
import OrdersView from '../../components/dashboard/OrdersView';
import ProductsView from '../../components/dashboard/ProductsView';
import CustomersView from '../../components/dashboard/CustomersView';
import PromotionsView from '../../components/dashboard/PromotionsView';
import StaffView from '../../components/dashboard/StaffView';

export default function Dashboard() {
  const t = useTranslations('Dashboard');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timePeriod, setTimePeriod] = useState('last-30-days');
  const router = useRouter();
  const { logout } = useAuth();

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
        // Not authenticated or not admin. Go straight to /login (not '/', which
        // would bounce a stale admin_auth cookie back here).
        router.push('/login');
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    // AuthContext.logout() calls POST /api/admin/logout (clears the cookies) and
    // resets the client auth state even if the request fails — otherwise /login
    // would still see isAuthenticated and bounce straight back to /dashboard.
    await logout();
    router.push('/login?logout=true');
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
