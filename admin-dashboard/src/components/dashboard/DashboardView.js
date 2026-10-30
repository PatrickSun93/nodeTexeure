'use client';

import { useTranslations } from 'next-intl';
import MetricsCard from '../MetricsCard';
import RecentOrdersTable from '../RecentOrdersTable';

export default function DashboardView({ timePeriod, setTimePeriod, metrics, recentOrders, growth }) {
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
