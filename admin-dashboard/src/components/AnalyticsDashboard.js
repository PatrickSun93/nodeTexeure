'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { apiFetch } from '../utils/api';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend);

/**
 * AnalyticsDashboard Component
 * Main analytics dashboard with metrics and charts
 */
export default function AnalyticsDashboard() {
    const t = useTranslations('AnalyticsDashboard');
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
            const [summary, trend, products, customers, inventory, categories] = await Promise.all([
                apiFetch(`/api/admin/analytics/sales-summary?${params}`),
                apiFetch(`/api/admin/analytics/revenue-trend?${params}&group_by=day`),
                apiFetch(`/api/admin/analytics/top-products?${params}&limit=10`),
                apiFetch(`/api/admin/analytics/customer-stats?${params}`),
                apiFetch(`/api/admin/analytics/inventory-status`),
                apiFetch(`/api/admin/analytics/revenue-by-category?${params}`)
            ]);

            if (summary.status === 'SUCCESS') setSalesSummary(summary.keyValueTable);
            if (trend.status === 'SUCCESS') setRevenueTrend(trend.keyValueTable);
            if (products.status === 'SUCCESS') setTopProducts(products.keyValueTable.products || []);
            if (customers.status === 'SUCCESS') setCustomerStats(customers.keyValueTable);
            if (inventory.status === 'SUCCESS') setInventoryStatus(inventory.keyValueTable);
            if (categories.status === 'SUCCESS') setRevenueByCategory(categories.keyValueTable);

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
            alert(t('exportFailed'));
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
