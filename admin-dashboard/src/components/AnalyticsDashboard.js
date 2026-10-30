'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { apiFetch } from '../utils/api';
import { useNotifications } from './NotificationSystem';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend);

/**
 * AnalyticsDashboard Component
 * Main analytics dashboard with metrics and charts
 */
// Bar colors for revenue-vs-target status and funnel/insight tones.
const TARGET_STATUS_COLORS = { above: '#10B981', on: '#F59E0B', below: '#D6C4A8', none: '#D1D5DB' };

export default function AnalyticsDashboard() {
    const t = useTranslations('AnalyticsDashboard');
    const notify = useNotifications();
    // Fallback-safe translator: use the shared message when present, otherwise a
    // plain-English default. The Revenue Drivers strings are not yet in the
    // message catalogs (owned by another workstream), so we degrade gracefully
    // instead of throwing on a missing key.
    const tt = (key, fallback) => (t.has(key) ? t(key) : fallback);
    const [period, setPeriod] = useState('month');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // Data states
    const [salesSummary, setSalesSummary] = useState(null);
    const [revenueTrend, setRevenueTrend] = useState(null);
    const [topProducts, setTopProducts] = useState([]);
    const [customerStats, setCustomerStats] = useState(null);
    const [inventoryStatus, setInventoryStatus] = useState(null);
    const [revenueByCategory, setRevenueByCategory] = useState(null);
    // Revenue Drivers data
    const [revenueVsTarget, setRevenueVsTarget] = useState(null);
    const [revenueByWeekday, setRevenueByWeekday] = useState(null);
    const [bottomProducts, setBottomProducts] = useState([]);
    const [conversionFunnel, setConversionFunnel] = useState(null);
    const [newVsReturning, setNewVsReturning] = useState(null);
    const [revenueShortfall, setRevenueShortfall] = useState(null);

    useEffect(() => {
        fetchAllAnalytics();
    }, [period, dateRange]);

    const fetchAllAnalytics = async () => {
        setIsLoading(true);
        setError('');

        try {
            const params = period === 'custom' && dateRange.start && dateRange.end
                ? `period=custom&start_date=${dateRange.start}&end_date=${dateRange.end}`
                : `period=${period}`;

            // Fetch all analytics in parallel (apiFetch sends the admin_auth cookie
            // via credentials:'include' and returns parsed JSON)
            const [
                summary, trend, products, customers, inventory, categories,
                vsTarget, weekday, bottom, funnel, newReturning, shortfall
            ] = await Promise.all([
                apiFetch(`/api/admin/analytics/sales-summary?${params}`),
                apiFetch(`/api/admin/analytics/revenue-trend?${params}&group_by=day`),
                apiFetch(`/api/admin/analytics/top-products?${params}&limit=10`),
                apiFetch(`/api/admin/analytics/customer-stats?${params}`),
                apiFetch(`/api/admin/analytics/inventory-status`),
                apiFetch(`/api/admin/analytics/revenue-by-category?${params}`),
                apiFetch(`/api/admin/analytics/revenue-vs-target?months=12`),
                apiFetch(`/api/admin/analytics/revenue-by-weekday?${params}`),
                apiFetch(`/api/admin/analytics/bottom-products?${params}&limit=5`),
                apiFetch(`/api/admin/analytics/conversion-funnel?${params}`),
                apiFetch(`/api/admin/analytics/new-vs-returning?${params}`),
                apiFetch(`/api/admin/analytics/revenue-shortfall?${params}`)
            ]);

            if (summary.status === 'SUCCESS') setSalesSummary(summary.keyValueTable);
            if (trend.status === 'SUCCESS') setRevenueTrend(trend.keyValueTable);
            if (products.status === 'SUCCESS') setTopProducts(products.keyValueTable.products || []);
            if (customers.status === 'SUCCESS') setCustomerStats(customers.keyValueTable);
            if (inventory.status === 'SUCCESS') setInventoryStatus(inventory.keyValueTable);
            if (categories.status === 'SUCCESS') setRevenueByCategory(categories.keyValueTable);
            if (vsTarget.status === 'SUCCESS') setRevenueVsTarget(vsTarget.keyValueTable);
            if (weekday.status === 'SUCCESS') setRevenueByWeekday(weekday.keyValueTable);
            if (bottom.status === 'SUCCESS') setBottomProducts(bottom.keyValueTable.products || []);
            if (funnel.status === 'SUCCESS') setConversionFunnel(funnel.keyValueTable);
            if (newReturning.status === 'SUCCESS') setNewVsReturning(newReturning.keyValueTable);
            if (shortfall.status === 'SUCCESS') setRevenueShortfall(shortfall.keyValueTable);

        } catch (err) {
            console.error('Error fetching analytics:', err);
            setError(t('failedToLoad'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportCSV = async (type) => {
        try {
            const params = period === 'custom' && dateRange.start && dateRange.end
                ? `?period=custom&start_date=${dateRange.start}&end_date=${dateRange.end}`
                : `?period=${period}`;

            // Relative URL via the /api proxy; credentials:'include' sends the
            // admin_auth cookie. Plain fetch (not apiFetch) because the response
            // is a CSV blob, not JSON.
            const response = await fetch(`/api/admin/bulk/${type}/export${params}`, {
                credentials: 'include'
            });

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Error exporting:', err);
            notify.error(t('exportFailed'));
        }
    };

    // Chart configurations
    const revenueChartData = revenueTrend ? {
        labels: revenueTrend.data.map(d => d.period),
        datasets: [
            {
                label: t('revenue'),
                data: revenueTrend.data.map(d => parseFloat(d.revenue)),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4
            },
            {
                label: t('orders'),
                data: revenueTrend.data.map(d => d.order_count),
                borderColor: 'rgb(16, 185, 129)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                yAxisID: 'y1'
            }
        ]
    } : null;

    const revenueChartOptions = {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: t('revenueOrdersTrend') }
        },
        scales: {
            y: { type: 'linear', display: true, position: 'left', title: { display: true, text: t('revenueAxis') } },
            y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: t('orders') }, grid: { drawOnChartArea: false } }
        }
    };

    const categoryChartData = revenueByCategory ? {
        labels: revenueByCategory.categories.map(c => c.category),
        datasets: [{
            data: revenueByCategory.categories.map(c => parseFloat(c.total_revenue)),
            backgroundColor: [
                'rgba(59, 130, 246, 0.8)',
                'rgba(16, 185, 129, 0.8)',
                'rgba(249, 115, 22, 0.8)',
                'rgba(139, 92, 246, 0.8)',
                'rgba(236, 72, 153, 0.8)',
                'rgba(245, 158, 11, 0.8)'
            ],
            borderWidth: 2,
            borderColor: '#fff'
        }]
    } : null;

    // Revenue vs Target — grouped bars (colored by above/on/below) + target line.
    const revenueVsTargetChartData = revenueVsTarget ? {
        labels: revenueVsTarget.series.map(s => s.label),
        datasets: [
            {
                type: 'line',
                label: tt('target', 'Target'),
                data: revenueVsTarget.series.map(() => parseFloat(revenueVsTarget.target)),
                borderColor: '#B59A4E',
                borderDash: [6, 4],
                borderWidth: 2,
                pointRadius: 0,
                fill: false
            },
            {
                type: 'bar',
                label: t('revenue'),
                data: revenueVsTarget.series.map(s => parseFloat(s.revenue)),
                backgroundColor: revenueVsTarget.series.map(s => TARGET_STATUS_COLORS[s.status] || TARGET_STATUS_COLORS.none),
                borderWidth: 0
            }
        ]
    } : null;

    const revenueVsTargetOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: tt('revenueVsTarget', 'Revenue vs target (trailing 12 months)') }
        },
        scales: { y: { beginAtZero: true, ticks: { callback: v => `$${v.toLocaleString()}` } } }
    };

    // Day-of-week revenue share — horizontal bars, best day green / slowest red.
    const weekdayChartData = revenueByWeekday ? {
        labels: revenueByWeekday.days.map(d => d.label),
        datasets: [{
            label: tt('shareOfRevenue', 'Share of revenue'),
            data: revenueByWeekday.days.map(d => parseFloat(d.share_pct)),
            backgroundColor: revenueByWeekday.days.map(d => {
                if (revenueByWeekday.best_day && d.label === revenueByWeekday.best_day.label) return '#10B981';
                if (revenueByWeekday.worst_day && d.label === revenueByWeekday.worst_day.label) return '#F87171';
                return '#C6A968';
            }),
            borderRadius: 4
        }]
    } : null;

    const weekdayChartOptions = {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { callback: v => `${v}%` } } }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">{t('loadingAnalytics')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('title')}</h1>
                <p className="text-gray-600">{t('subtitle')}</p>
            </div>

            {/* Period Selector */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">{t('periodLabel')}</label>
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="today">{t('today')}</option>
                        <option value="yesterday">{t('yesterday')}</option>
                        <option value="week">{t('last7Days')}</option>
                        <option value="month">{t('last30Days')}</option>
                        <option value="year">{t('lastYear')}</option>
                        <option value="custom">{t('customRange')}</option>
                    </select>
                </div>

                {period === 'custom' && (
                    <>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                        <span className="text-gray-500">{t('to')}</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                    </>
                )}

                <div className="ml-auto flex gap-2">
                    <button
                        onClick={() => handleExportCSV('orders')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                    >
                        {t('exportOrders')}
                    </button>
                    <button
                        onClick={() => handleExportCSV('products')}
                        className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                    >
                        {t('exportProducts')}
                    </button>
                    <button
                        onClick={() => handleExportCSV('customers')}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                    >
                        {t('exportCustomers')}
                    </button>
                </div>
            </div>

            {/* Metrics Cards */}
            {salesSummary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <MetricCard
                        title={t('totalRevenue')}
                        value={`$${parseFloat(salesSummary.metrics.total_revenue).toLocaleString()}`}
                        change={salesSummary.growth.revenue}
                        icon="💰"
                    />
                    <MetricCard
                        title={t('totalOrders')}
                        value={salesSummary.metrics.total_orders}
                        change={salesSummary.growth.orders}
                        icon="📦"
                    />
                    <MetricCard
                        title={t('avgOrderValue')}
                        value={`$${parseFloat(salesSummary.metrics.avg_order_value).toFixed(2)}`}
                        icon="💳"
                    />
                    <MetricCard
                        title={t('deliveredOrders')}
                        value={salesSummary.metrics.delivered_orders}
                        subtitle={t('pendingCount', { count: salesSummary.metrics.pending_orders })}
                        icon="✅"
                    />
                </div>
            )}

            {/* Performance Insights — peak / trough month + best / slowest day */}
            {(revenueVsTarget || revenueByWeekday) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {revenueVsTarget?.summary?.peak && (
                        <InsightCard
                            tone="good"
                            label={tt('peakMonth', 'Peak · strongest month')}
                            value={revenueVsTarget.summary.peak.label}
                            sub={`$${parseFloat(revenueVsTarget.summary.peak.revenue).toLocaleString()} · ${revenueVsTarget.summary.peak.vs_avg_pct >= 0 ? '▲' : '▼'} ${Math.abs(revenueVsTarget.summary.peak.vs_avg_pct)}% ${tt('vsAvg', 'vs avg')}`}
                        />
                    )}
                    {revenueVsTarget?.summary?.trough && (
                        <InsightCard
                            tone="bad"
                            label={tt('troughMonth', 'Trough · weakest month')}
                            value={revenueVsTarget.summary.trough.label}
                            sub={`$${parseFloat(revenueVsTarget.summary.trough.revenue).toLocaleString()} · ${revenueVsTarget.summary.trough.vs_avg_pct >= 0 ? '▲' : '▼'} ${Math.abs(revenueVsTarget.summary.trough.vs_avg_pct)}% ${tt('vsAvg', 'vs avg')}`}
                        />
                    )}
                    {revenueByWeekday?.best_day && (
                        <InsightCard
                            tone="good"
                            label={tt('bestDay', 'Best day')}
                            value={revenueByWeekday.best_day.label}
                            sub={`${revenueByWeekday.best_day.share_pct}% ${tt('ofWeeklyRevenue', 'of weekly revenue')}`}
                        />
                    )}
                    {revenueByWeekday?.worst_day && (
                        <InsightCard
                            tone="bad"
                            label={tt('slowestDay', 'Slowest day')}
                            value={revenueByWeekday.worst_day.label}
                            sub={`${revenueByWeekday.worst_day.share_pct}% ${tt('ofWeeklyRevenue', 'of weekly revenue')}`}
                        />
                    )}
                </div>
            )}

            {/* Revenue vs Target */}
            {revenueVsTargetChartData && (
                <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                        <div>
                            <h3 className="text-lg font-semibold">{tt('revenueVsTarget', 'Revenue vs target')}</h3>
                            <p className="text-sm text-gray-500">
                                {tt('targetBaseline', 'Target')}: ${parseFloat(revenueVsTarget.target).toLocaleString()}/mo · {tt('ytd', 'YTD')} ${parseFloat(revenueVsTarget.summary.ytd_actual).toLocaleString()}{' '}
                                <span className={revenueVsTarget.summary.ytd_variance_pct >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    ({revenueVsTarget.summary.ytd_variance_pct >= 0 ? '▲' : '▼'} {Math.abs(revenueVsTarget.summary.ytd_variance_pct)}% {tt('vsTargetShort', 'vs target')})
                                </span>
                            </p>
                        </div>
                        <div className="flex gap-3 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: TARGET_STATUS_COLORS.above }}></span>{tt('aboveTarget', 'Above')}</span>
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: TARGET_STATUS_COLORS.on }}></span>{tt('onTarget', 'On target')}</span>
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: TARGET_STATUS_COLORS.below }}></span>{tt('belowTarget', 'Below')}</span>
                        </div>
                    </div>
                    <Bar data={revenueVsTargetChartData} options={revenueVsTargetOptions} />
                    <p className="text-xs text-gray-400 mt-3">{revenueVsTarget.target_basis}</p>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Revenue Trend Chart */}
                {revenueChartData && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <Line data={revenueChartData} options={revenueChartOptions} />
                    </div>
                )}

                {/* Category Distribution */}
                {categoryChartData && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-semibold mb-4">{t('revenueByCategory')}</h3>
                        <Pie data={categoryChartData} options={{ responsive: true, plugins: { legend: { position: 'right' } } }} />
                    </div>
                )}
            </div>

            {/* Customer & Inventory Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Customer Stats */}
                {customerStats && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-semibold mb-4">{t('customerMetrics')}</h3>
                        <div className="space-y-3">
                            <StatRow label={t('newCustomers')} value={customerStats.metrics.new_customers} />
                            <StatRow label={t('activeCustomers')} value={customerStats.metrics.active_customers} />
                            <StatRow label={t('repeatCustomers')} value={customerStats.metrics.repeat_customers} />
                            <StatRow label={t('retentionRate')} value={`${customerStats.metrics.retention_rate}%`} />
                        </div>
                    </div>
                )}

                {/* Inventory Status */}
                {inventoryStatus && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-semibold mb-4">{t('inventoryOverview')}</h3>
                        <div className="space-y-3">
                            <StatRow label={t('totalProducts')} value={inventoryStatus.overview.total_products} />
                            <StatRow label={t('totalStock')} value={inventoryStatus.overview.total_stock} />
                            <StatRow
                                label={t('lowStockItems')}
                                value={inventoryStatus.overview.low_stock_items}
                                highlight={inventoryStatus.overview.low_stock_items > 0}
                            />
                            <StatRow
                                label={t('outOfStock')}
                                value={inventoryStatus.overview.out_of_stock_items}
                                highlight={inventoryStatus.overview.out_of_stock_items > 0}
                            />
                            <StatRow label={t('inventoryValue')} value={`$${parseFloat(inventoryStatus.overview.total_retail_value).toLocaleString()}`} />
                        </div>
                    </div>
                )}
            </div>

            {/* Top Products Table */}
            {topProducts.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">{t('topSellingProducts')}</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 font-medium text-gray-700">{t('colProduct')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t('colSold')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t('colQuantity')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t('colRevenue')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t('colRating')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topProducts.map((product, idx) => (
                                    <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500 font-medium">#{idx + 1}</span>
                                                <span className="font-medium text-gray-900">{product.name}</span>
                                            </div>
                                        </td>
                                        <td className="text-right py-3 px-4">{product.times_sold}</td>
                                        <td className="text-right py-3 px-4">{product.total_quantity}</td>
                                        <td className="text-right py-3 px-4 font-medium">${parseFloat(product.total_revenue).toLocaleString()}</td>
                                        <td className="text-right py-3 px-4">
                                            {product.avg_rating ? (
                                                <span className="inline-flex items-center">
                                                    <span className="text-yellow-500">★</span>
                                                    <span className="ml-1">{product.avg_rating}</span>
                                                    <span className="text-gray-400 text-sm ml-1">({product.review_count})</span>
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">{t('notAvailable')}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* When customers buy + Best & worst sellers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                {weekdayChartData && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-semibold">{tt('whenCustomersBuy', 'When customers buy')}</h3>
                        <p className="text-sm text-gray-500 mb-4">{tt('shareByDay', 'Share of revenue by day of week')}</p>
                        <Bar data={weekdayChartData} options={weekdayChartOptions} />
                        {revenueByWeekday?.weekend_share_pct != null && (
                            <p className="text-sm text-gray-600 mt-4 pt-3 border-t border-gray-100">
                                {tt('weekendsDrive', 'Weekends drive')}{' '}
                                <span className="font-semibold text-emerald-600">{revenueByWeekday.weekend_share_pct}%</span>{' '}
                                {tt('ofSales', 'of sales.')}
                            </p>
                        )}
                    </div>
                )}

                {(topProducts.length > 0 || bottomProducts.length > 0) && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-semibold mb-4">{tt('bestWorstSellers', 'Best & worst sellers')}</h3>
                        {topProducts.length > 0 && (
                            <>
                                <p className="text-xs uppercase tracking-wide font-medium text-emerald-700 mb-2">{tt('topPerformers', 'Top performers')}</p>
                                <div className="space-y-2 mb-4">
                                    {topProducts.slice(0, 3).map(p => (
                                        <div key={`top-${p.id}`} className="flex items-center justify-between text-sm">
                                            <span className="text-gray-800 truncate pr-2">{p.name}</span>
                                            <span className="text-emerald-600 whitespace-nowrap">${parseFloat(p.total_revenue).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        {bottomProducts.length > 0 && (
                            <>
                                <p className="text-xs uppercase tracking-wide font-medium text-rose-700 mb-2">{tt('underperforming', 'Underperforming')}</p>
                                <div className="space-y-2">
                                    {bottomProducts.slice(0, 3).map(p => (
                                        <div key={`bot-${p.id}`} className="flex items-center justify-between text-sm">
                                            <span className="text-gray-800 truncate pr-2">{p.name}</span>
                                            <span className="text-rose-600 whitespace-nowrap">${parseFloat(p.total_revenue).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ============ Revenue Drivers ============ */}
            {(conversionFunnel || newVsReturning || revenueShortfall) && (
                <div className="mt-10">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">{tt('revenueDrivers', 'Revenue drivers')}</h2>
                        <p className="text-gray-600">{tt('revenueDriversSub', 'What moves the numbers — conversion, retention & shortfall')}</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Conversion funnel */}
                        {conversionFunnel && (
                            <div className="bg-white rounded-lg shadow-sm p-6">
                                <h3 className="text-lg font-semibold">{tt('conversionFunnel', 'Conversion funnel')}</h3>
                                <p className="text-sm text-gray-500 mb-4">{tt('whereShoppersDrop', 'Where shoppers drop off')}</p>
                                <div className="space-y-2">
                                    {conversionFunnel.stages.map((s, i) => {
                                        const isBiggest = conversionFunnel.biggest_drop && conversionFunnel.biggest_drop.to === s.label;
                                        return (
                                            <div key={s.key}>
                                                {i > 0 && s.drop_from_prev_pct != null && (
                                                    <p className={`text-xs text-center mb-1 ${isBiggest ? 'text-rose-600 font-medium' : 'text-gray-400'}`}>
                                                        ↓ {s.drop_from_prev_pct}% {tt('dropOff', 'drop-off')}{isBiggest ? ` · ${tt('biggestDrop', 'biggest drop')}` : ''}
                                                    </p>
                                                )}
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-800">{s.label}</span>
                                                    <span className="text-gray-500">{Number(s.count).toLocaleString()}</span>
                                                </div>
                                                <div className="h-6 bg-gray-100 rounded overflow-hidden">
                                                    <div
                                                        className="h-full rounded"
                                                        style={{ width: `${Math.max(parseFloat(s.pct_of_top), 3)}%`, background: i === conversionFunnel.stages.length - 1 ? '#1F2937' : '#5E7052' }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-sm text-gray-600 mt-4 pt-3 border-t border-gray-100">
                                    {tt('overallConversion', 'Overall conversion')}: <span className="font-semibold text-gray-900">{conversionFunnel.overall_conversion_pct}%</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-2">{conversionFunnel.note}</p>
                            </div>
                        )}

                        {/* New vs returning */}
                        {newVsReturning && (
                            <div className="bg-white rounded-lg shadow-sm p-6">
                                <h3 className="text-lg font-semibold">{tt('newVsReturning', 'New vs returning')}</h3>
                                <p className="text-sm text-gray-500 mb-4">{tt('revenueShare', 'Revenue share')}</p>
                                <div className="flex h-4 rounded-full overflow-hidden mb-3">
                                    <span style={{ width: `${newVsReturning.split.returning_share_pct}%`, background: '#5E7052' }}></span>
                                    <span style={{ width: `${newVsReturning.split.new_share_pct}%`, background: '#D8C7A0' }}></span>
                                </div>
                                <div className="flex justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 text-sm text-gray-700">
                                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#5E7052' }}></span>{tt('returning', 'Returning')}
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">{newVsReturning.split.returning_share_pct}%</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-2 text-sm text-gray-700 justify-end">
                                            {tt('newCustomersShort', 'New')}<span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#D8C7A0' }}></span>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">{newVsReturning.split.new_share_pct}%</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <StatRow label={tt('repeatPurchaseRate', 'Repeat purchase rate')} value={`${newVsReturning.metrics.repeat_purchase_rate_pct}%`} />
                                    <StatRow label={tt('avgOrdersPerCustomer', 'Avg orders / customer')} value={newVsReturning.metrics.avg_orders_per_customer} />
                                    <StatRow label={tt('customerLifetimeValue', 'Customer lifetime value')} value={`$${parseFloat(newVsReturning.metrics.customer_lifetime_value).toLocaleString()}`} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* What's driving the change — shortfall / driver decomposition */}
                    {revenueShortfall && (
                        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <h3 className="text-lg font-semibold">{tt('whatsDriving', "What's driving the change")}</h3>
                                    <p className="text-sm text-gray-500">{tt('contributionVsPrev', 'Contribution to the change vs the prior period')}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xl font-bold ${revenueShortfall.change.revenue_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {revenueShortfall.change.revenue_pct >= 0 ? '▲' : '▼'} {Math.abs(revenueShortfall.change.revenue_pct)}%
                                    </p>
                                    <p className="text-xs text-gray-500">{tt('revenueVsPrevPeriod', 'revenue vs prior period')}</p>
                                </div>
                            </div>

                            <div className="mt-5 space-y-3">
                                {[...revenueShortfall.drivers, ...revenueShortfall.customer_mix].map(d => {
                                    const pct = parseFloat(d.pct);
                                    const width = Math.min(Math.abs(pct), 100) / 2; // half-width diverging bar
                                    const positive = d.direction === 'up';
                                    return (
                                        <div key={d.key} className="grid grid-cols-[minmax(0,1.4fr)_2fr_minmax(0,0.7fr)] gap-3 items-center">
                                            <span className="text-sm text-gray-800 truncate">{d.label}</span>
                                            <span className="relative h-4 bg-gray-100 rounded">
                                                <span className="absolute top-0 bottom-0 w-px bg-gray-300 left-1/2"></span>
                                                <span
                                                    className="absolute top-0 h-full rounded"
                                                    style={{
                                                        width: `${width}%`,
                                                        [positive ? 'left' : 'right']: '50%',
                                                        background: positive ? '#5E7052' : '#B5654D'
                                                    }}
                                                ></span>
                                            </span>
                                            <span className={`text-sm text-right ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {positive ? '+' : '−'}{Math.abs(pct)}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center gap-6 mt-2 text-xs text-gray-400">
                                <span>◀ {tt('hurtsRevenue', 'hurts revenue')}</span>
                                <span>{tt('helpsRevenue', 'helps revenue')} ▶</span>
                            </div>

                            <div className="mt-5 bg-amber-50 border-l-4 border-amber-400 p-4 text-sm text-gray-700">
                                <span className="font-medium text-gray-900">{tt('takeaway', 'Takeaway')}:</span> {revenueShortfall.takeaway}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Insight Card — colored left border, uppercase label, big value + subtext.
function InsightCard({ tone, label, value, sub }) {
    const border = tone === 'good' ? 'border-emerald-500' : tone === 'bad' ? 'border-rose-500' : 'border-gray-300';
    const labelColor = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-gray-500';
    return (
        <div className={`bg-white rounded-lg shadow-sm border-l-4 ${border} p-5`}>
            <p className={`text-xs uppercase tracking-wide font-medium ${labelColor}`}>{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
        </div>
    );
}

// Metric Card Component
function MetricCard({ title, value, change, subtitle, icon }) {
    const t = useTranslations('AnalyticsDashboard');
    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">{title}</p>
                <span className="text-2xl">{icon}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
            {change !== undefined && (
                <p className={`text-sm ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {change >= 0 ? '↑' : '↓'} {t('vsPreviousPeriod', { change: Math.abs(change) })}
                </p>
            )}
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
    );
}

// Stat Row Component
function StatRow({ label, value, highlight }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-700">{label}</span>
            <span className={`font-semibold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
                {value}
            </span>
        </div>
    );
}
