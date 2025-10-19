'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';
import { GaugeChart, BarChart, LineChart } from '@/components/charts';

// Inventory API functions
const inventoryAPI = {
  async getInventory(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory?${queryString}` : 'admin/inventory';
    return apiRequest(endpoint);
  },

  async getAnalytics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory/analytics?${queryString}` : 'admin/inventory/analytics';
    return apiRequest(endpoint);
  },

  async getLowStock() {
    return apiRequest('admin/inventory/low-stock');
  },

  async getMovements(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory/movements?${queryString}` : 'admin/inventory/movements';
    return apiRequest(endpoint);
  },

  async adjustStock(adjustmentData) {
    return apiRequest('admin/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(adjustmentData),
    });
  },

  async bulkAdjust(adjustments, reason, notes) {
    return apiRequest('admin/inventory/bulk-adjust', {
      method: 'POST',
      body: JSON.stringify({ adjustments, reason, notes }),
    });
  },

  async updateReorderPoints(inventoryId, reorderPoint, reorderQuantity) {
    return apiRequest(`admin/inventory/${inventoryId}/reorder-points`, {
      method: 'PUT',
      body: JSON.stringify({ reorder_point: reorderPoint, reorder_quantity: reorderQuantity }),
    });
  },

  async getValuation(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory/valuation?${queryString}` : 'admin/inventory/valuation';
    return apiRequest(endpoint);
  },

  async triggerAlerts() {
    return apiRequest('admin/inventory/alerts/trigger', {
      method: 'POST',
    });
  }
};

// Stock Level Gauge Component
function StockLevelGauge({ title, current, total, threshold, isLoading }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const thresholdPercentage = total > 0 ? (threshold / total) * 100 : 0;

  const gaugeData = [{
    value: percentage,
    name: title,
    title: {
      offsetCenter: [0, '30%']
    },
    detail: {
      valueAnimation: true,
      formatter: `${current}/${total}`
    }
  }];

  return (
    <div className="admin-card">
      <h3 className="text-sm font-medium text-gray-500 mb-4">{title}</h3>
      {isLoading ? (
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      ) : (
        <GaugeChart
          data={gaugeData}
          height={200}
          min={0}
          max={100}
          splitNumber={5}
          axisLine={{
            lineStyle: {
              width: 20,
              color: [
                [thresholdPercentage / 100, '#ef4444'],
                [0.8, '#f59e0b'],
                [1, '#10b981']
              ]
            }
          }}
        />
      )}
      <div className="mt-2 text-center">
        <p className="text-xs text-gray-500">
          Threshold: {threshold} units
        </p>
      </div>
    </div>
  );
}

// Low Stock Alert Component
function LowStockAlert({ item, onReorder }) {
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'border-red-500 bg-red-50';
      case 'high': return 'border-orange-500 bg-orange-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const variant = item.size || item.color || item.pattern ? 
    `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
    'Base Product';

  return (
    <div className={`p-4 border rounded-lg ${getPriorityColor(item.reorder_suggestion?.priority)}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">{item.product_name}</h4>
          <p className="text-sm text-gray-600">SKU: {item.product_sku}</p>
          {variant !== 'Base Product' && (
            <p className="text-sm text-gray-600">Variant: {variant}</p>
          )}
          <div className="mt-2 flex items-center space-x-4 text-sm">
            <span className="text-red-600 font-medium">
              Stock: {item.quantity_available}
            </span>
            <span className="text-gray-500">
              Reorder at: {item.reorder_point}
            </span>
            <span className="text-blue-600">
              Suggested: {item.reorder_suggestion?.suggested_quantity}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            item.reorder_suggestion?.priority === 'critical' ? 'bg-red-100 text-red-800' :
            item.reorder_suggestion?.priority === 'high' ? 'bg-orange-100 text-orange-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {item.reorder_suggestion?.priority?.toUpperCase()}
          </span>
          <button
            onClick={() => onReorder(item)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Reorder
          </button>
        </div>
      </div>
    </div>
  );
}

// Inventory Summary Cards
function InventorySummaryCards({ analytics, isLoading }) {
  const cards = [
    {
      title: 'Total Products',
      value: analytics?.summary?.total_products || 0,
      icon: '📦',
      color: 'blue'
    },
    {
      title: 'Out of Stock',
      value: analytics?.summary?.out_of_stock_count || 0,
      icon: '🚫',
      color: 'red'
    },
    {
      title: 'Low Stock',
      value: analytics?.summary?.low_stock_count || 0,
      icon: '⚠️',
      color: 'yellow'
    },
    {
      title: 'Total Stock Value',
      value: analytics?.summary?.total_available_stock || 0,
      icon: '💰',
      color: 'green',
      prefix: '',
      suffix: ' units'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div key={index} className="admin-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-sm font-medium text-gray-500">{card.title}</h3>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-6 bg-gray-200 rounded mt-1"></div>
                </div>
              ) : (
                <p className="text-xl font-bold text-gray-900">
                  {card.prefix || ''}{card.value.toLocaleString()}{card.suffix || ''}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InventoryDashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // State management
  const [analytics, setAnalytics] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [topSelling, setTopSelling] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('30');

  // Authentication check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch inventory analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [analyticsResponse, lowStockResponse] = await Promise.all([
        inventoryAPI.getAnalytics({ period: selectedPeriod }),
        inventoryAPI.getLowStock()
      ]);

      if (analyticsResponse.success) {
        setAnalytics(analyticsResponse.data);
        setTopSelling(analyticsResponse.data.topSelling || []);
        setMovements(analyticsResponse.data.movements || []);
      } else {
        throw new Error(analyticsResponse.message || 'Failed to fetch analytics');
      }

      if (lowStockResponse.success) {
        setLowStockItems(lowStockResponse.data.items || []);
      }
    } catch (err) {
      console.error('Error fetching inventory analytics:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchAnalytics();
    }
  }, [isAuthenticated, fetchAnalytics]);

  // Handle reorder action
  const handleReorder = (item) => {
    // Navigate to stock management with pre-filled reorder data
    router.push(`/inventory/stock-management?reorder=${item.product_id}&variant=${item.variant_id || ''}`);
  };

  // Handle alert trigger
  const handleTriggerAlerts = async () => {
    try {
      const response = await inventoryAPI.triggerAlerts();
      if (response.success) {
        alert(`Alerts sent successfully! ${response.data.alerts_sent} alerts were sent.`);
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      console.error('Error triggering alerts:', err);
      alert(`Error triggering alerts: ${getErrorMessage(err)}`);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="admin-spinner"></div>
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Prepare chart data
  const movementChartData = movements.map(movement => ({
    date: movement.movement_date,
    restock: movement.movement_type === 'restock' ? movement.total_quantity : 0,
    sale: movement.movement_type === 'sale' ? movement.total_quantity : 0,
    adjustment: movement.movement_type === 'adjustment' ? movement.total_quantity : 0
  }));

  const topSellingChartData = topSelling.map(item => ({
    name: item.product_name,
    value: item.quantity_sold,
    available: item.quantity_available
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="admin-container">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">
                Inventory Management
              </h1>
              <nav className="flex items-center space-x-2">
                <a 
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  Dashboard
                </a>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-900">Inventory</span>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
              <button
                onClick={handleTriggerAlerts}
                className="admin-button admin-button-secondary text-sm"
              >
                Send Alerts
              </button>
              <button
                onClick={fetchAnalytics}
                disabled={isLoading}
                className="admin-button admin-button-primary text-sm"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="admin-container py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        <InventorySummaryCards analytics={analytics} isLoading={isLoading} />

        {/* Stock Level Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <StockLevelGauge
            title="Available Stock"
            current={analytics?.summary?.total_available_stock || 0}
            total={(analytics?.summary?.total_available_stock || 0) + (analytics?.summary?.total_reserved_stock || 0)}
            threshold={analytics?.summary?.low_stock_count || 0}
            isLoading={isLoading}
          />
          <StockLevelGauge
            title="Reserved Stock"
            current={analytics?.summary?.total_reserved_stock || 0}
            total={(analytics?.summary?.total_available_stock || 0) + (analytics?.summary?.total_reserved_stock || 0)}
            threshold={0}
            isLoading={isLoading}
          />
          <StockLevelGauge
            title="Sold Stock"
            current={analytics?.summary?.total_sold_stock || 0}
            total={(analytics?.summary?.total_sold_stock || 0) + (analytics?.summary?.total_available_stock || 0)}
            threshold={0}
            isLoading={isLoading}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Inventory Movements Chart */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Inventory Movements</h2>
            <LineChart
              data={movementChartData}
              title=""
              loading={isLoading}
              height={350}
              smooth={true}
              colors={['#10b981', '#ef4444', '#f59e0b']}
            />
          </div>

          {/* Top Selling Products */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Top Selling Products</h2>
            <BarChart
              data={topSellingChartData}
              title=""
              loading={isLoading}
              height={350}
              horizontal={true}
            />
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="mt-8">
          <div className="admin-card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Low Stock Alerts</h2>
              <span className="text-sm text-gray-500">
                {lowStockItems.length} items need attention
              </span>
            </div>
            
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-gray-200 rounded"></div>
                ))}
              </div>
            ) : lowStockItems.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {lowStockItems.map((item, index) => (
                  <LowStockAlert
                    key={index}
                    item={item}
                    onReorder={handleReorder}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <span className="text-4xl mb-4 block">✅</span>
                <p>No low stock alerts at this time</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button 
                onClick={() => router.push('/inventory/stock-management')}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Stock Management</div>
                <div className="text-xs opacity-75">Adjust inventory levels</div>
              </button>
              <button 
                onClick={() => router.push('/inventory/suppliers')}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Suppliers</div>
                <div className="text-xs opacity-75">Manage suppliers</div>
              </button>
              <button 
                onClick={() => router.push('/inventory/purchase-orders')}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Purchase Orders</div>
                <div className="text-xs opacity-75">Create POs</div>
              </button>
              <button 
                onClick={() => router.push('/inventory/reports')}
                className="admin-button admin-button-primary p-4 text-left hover:bg-blue-600 transition-colors"
              >
                <div className="text-sm font-medium">Reports</div>
                <div className="text-xs opacity-75">Inventory reports</div>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}