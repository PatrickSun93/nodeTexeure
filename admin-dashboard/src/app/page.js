'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/contexts/AdminContext';
import { adminDashboard, getErrorMessage } from '@/lib/api';
import { LineChart, PieChart, BarChart } from '@/components/charts';
import AdminLayout from '@/components/AdminLayout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AsyncLoadingWrapper } from '@/components/LoadingStateManager';
import useNavigation from '@/hooks/useNavigation';

// KPI Widget Component
function KPIWidget({ title, value, change, isLoading, prefix = '', suffix = '', changeLabel = 'from last period' }) {
  const formatValue = (val) => {
    if (typeof val === 'number') {
      if (prefix === '$') {
        return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return val.toLocaleString();
    }
    return val || '0';
  };

  const formatChange = (changeVal) => {
    if (typeof changeVal === 'number') {
      const sign = changeVal >= 0 ? '+' : '';
      return `${sign}${changeVal.toFixed(1)}%`;
    }
    return '0%';
  };

  const getChangeColor = (changeVal) => {
    if (typeof changeVal === 'number') {
      return changeVal >= 0 ? 'text-green-600' : 'text-red-600';
    }
    return 'text-gray-500';
  };

  return (
    <div className="admin-card">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      {isLoading ? (
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-24"></div>
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900">
            {prefix}{formatValue(value)}{suffix}
          </p>
          <p className={`text-xs mt-1 ${getChangeColor(change)}`}>
            {formatChange(change)} {changeLabel}
          </p>
        </>
      )}
    </div>
  );
}

// Period Selector Component
function PeriodSelector({ selectedPeriod, onPeriodChange }) {
  const periods = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' }
  ];

  return (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium text-gray-700">Period:</label>
      <select
        value={selectedPeriod}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {periods.map(period => (
          <option key={period.value} value={period.value}>
            {period.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Inventory Alerts Component
function InventoryAlerts({ alerts, isLoading }) {
  if (isLoading) {
    return (
      <div className="admin-card">
        <h2 className="text-lg font-semibold mb-4">Inventory Alerts</h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <h2 className="text-lg font-semibold mb-4">Inventory Alerts</h2>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {alerts && alerts.length > 0 ? (
          alerts.slice(0, 10).map((alert, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {alert.productName}
                  {alert.size && ` - ${alert.size}`}
                  {alert.color && ` - ${alert.color}`}
                </p>
                <p className="text-xs text-gray-600">SKU: {alert.sku}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${alert.alertType === 'out_of_stock' ? 'text-red-600' : 'text-yellow-600'}`}>
                  {alert.quantityAvailable} left
                </p>
                <p className="text-xs text-gray-500">
                  Reorder at {alert.reorderPoint}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-500 text-center py-8">
            No inventory alerts
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardContent() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { 
    dashboardData, 
    inventoryAlerts, 
    setDashboardData, 
    setInventoryAlerts,
    setLoading,
    setError,
    clearError,
    showError,
    showSuccess,
    isLoading: adminLoading,
    errors
  } = useAdmin();
  const { navigateTo, goToOrders, goToProducts, goToCustomers, goToReports } = useNavigation();
  
  // Dashboard state
  const [salesTrendData, setSalesTrendData] = useState([]);
  const [topProductsData, setTopProductsData] = useState([]);
  const [orderStatusData, setOrderStatusData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigateTo('/login');
    }
  }, [isAuthenticated, authLoading, navigateTo]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoading('dashboard', true);
      clearError('dashboard');

      // Fetch overview data and inventory alerts in parallel
      const [overviewResponse, alertsResponse] = await Promise.all([
        adminDashboard.getOverview({ period: selectedPeriod }),
        adminDashboard.getInventoryAlerts()
      ]);

      if (overviewResponse.status === 'SUCCESS') {
        setDashboardData(overviewResponse.keyValueTable);
      } else {
        throw new Error(overviewResponse.message || 'Failed to fetch dashboard data');
      }

      if (alertsResponse.status === 'SUCCESS') {
        setInventoryAlerts(alertsResponse.keyValueTable.alerts || []);
      }

      setLastUpdated(new Date());
      showSuccess('Dashboard data updated successfully');
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
      const errorMessage = getErrorMessage(err);
      setError('dashboard', errorMessage);
      showError(`Failed to load dashboard: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setLoading('dashboard', false);
    }
  }, [selectedPeriod, setDashboardData, setInventoryAlerts, setLoading, setError, clearError, showError, showSuccess]);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    try {
      setChartsLoading(true);

      // Determine chart period based on selected period
      const chartPeriod = selectedPeriod === 'today' ? '7days' : 
                         selectedPeriod === 'week' ? '30days' : 
                         selectedPeriod === 'month' ? '90days' : 'year';

      // Fetch chart data in parallel
      const [salesTrendResponse, topProductsResponse, orderStatusResponse] = await Promise.all([
        adminDashboard.getSalesTrend({ period: chartPeriod, granularity: 'day' }),
        adminDashboard.getTopProducts({ period: selectedPeriod, limit: 10, metric: 'revenue' }),
        adminDashboard.getOrderStatusDistribution({ period: selectedPeriod })
      ]);

      if (salesTrendResponse.status === 'SUCCESS') {
        setSalesTrendData(salesTrendResponse.keyValueTable.data || []);
      }

      if (topProductsResponse.status === 'SUCCESS') {
        setTopProductsData(topProductsResponse.keyValueTable.products || []);
      }

      if (orderStatusResponse.status === 'SUCCESS') {
        setOrderStatusData(orderStatusResponse.keyValueTable.distribution || []);
      }
    } catch (err) {
      console.error('Chart data fetch error:', err);
      // Don't set main error for chart failures, just log them
    } finally {
      setChartsLoading(false);
    }
  }, [selectedPeriod]);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
      fetchChartData();
    }
  }, [isAuthenticated, fetchDashboardData, fetchChartData]);

  // Real-time data polling (every 5 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData();
    fetchChartData();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div>
      {/* Dashboard Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <PeriodSelector 
            selectedPeriod={selectedPeriod} 
            onPeriodChange={setSelectedPeriod}
          />
          {lastUpdated && (
            <span className="text-sm text-gray-500">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="admin-button admin-button-primary text-sm"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPIWidget
            title="Total Revenue"
            value={dashboardData?.metrics?.revenue?.total}
            change={dashboardData?.metrics?.revenue?.change}
            isLoading={isLoading}
            prefix="$"
          />
          
          <KPIWidget
            title="Total Orders"
            value={dashboardData?.metrics?.orders?.total}
            change={dashboardData?.metrics?.orders?.change}
            isLoading={isLoading}
          />
          
          <KPIWidget
            title="Total Customers"
            value={dashboardData?.metrics?.customers?.total}
            change={dashboardData?.metrics?.customers?.change}
            isLoading={isLoading}
          />
          
          <KPIWidget
            title="Avg Order Value"
            value={dashboardData?.metrics?.revenue?.avgOrderValue}
            change={0} // No comparison for AOV in this implementation
            isLoading={isLoading}
            prefix="$"
            changeLabel="average"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={goToProducts}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Add Product</div>
                <div className="text-xs opacity-75">Create new product</div>
              </button>
              <button 
                onClick={goToOrders}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">View Orders</div>
                <div className="text-xs opacity-75">Manage orders</div>
              </button>
              <button 
                onClick={goToCustomers}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Customers</div>
                <div className="text-xs opacity-75">Manage customers</div>
              </button>
              <button 
                onClick={goToReports}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Reports</div>
                <div className="text-xs opacity-75">View analytics</div>
              </button>
            </div>
          </div>

          {/* Inventory Alerts */}
          <InventoryAlerts alerts={inventoryAlerts} isLoading={isLoading} />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Sales Trend Chart */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Sales Trend</h2>
            <AsyncLoadingWrapper
              loading={chartsLoading}
              error={errors.charts}
              onRetry={fetchChartData}
            >
              <LineChart
                data={salesTrendData}
                title=""
                loading={false}
                height={350}
                smooth={true}
                areaStyle={true}
              />
            </AsyncLoadingWrapper>
          </div>

          {/* Order Status Distribution */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Order Status Distribution</h2>
            <AsyncLoadingWrapper
              loading={chartsLoading}
              error={errors.charts}
              onRetry={fetchChartData}
            >
              <PieChart
                data={orderStatusData}
                title=""
                loading={false}
                height={350}
                showLegend={true}
              />
            </AsyncLoadingWrapper>
          </div>
        </div>

        {/* Top Products Chart */}
        <div className="mt-8">
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Top Products by Revenue</h2>
            <AsyncLoadingWrapper
              loading={chartsLoading}
              error={errors.charts}
              onRetry={fetchChartData}
            >
              <BarChart
                data={topProductsData}
                title=""
                loading={false}
                height={400}
                horizontal={false}
              />
            </AsyncLoadingWrapper>
          </div>
        </div>

        {/* Additional Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <KPIWidget
            title="New Customers"
            value={dashboardData?.metrics?.customers?.new}
            change={0}
            isLoading={isLoading}
            changeLabel="this period"
          />
          
          <KPIWidget
            title="Products Sold"
            value={dashboardData?.metrics?.products?.sold}
            change={dashboardData?.metrics?.products?.change}
            isLoading={isLoading}
            changeLabel="unique products"
          />
          
          <KPIWidget
            title="Items Sold"
            value={dashboardData?.metrics?.products?.totalItems}
            change={0}
            isLoading={isLoading}
            changeLabel="total quantity"
          />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminLayout 
      title="Dashboard Overview" 
      subtitle="Monitor your business performance and key metrics"
    >
      <DashboardContent />
    </AdminLayout>
  );
}