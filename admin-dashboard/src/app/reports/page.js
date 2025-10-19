'use client';

import { useState, useEffect } from 'react';
import { LineChart, BarChart, PieChart, GaugeChart } from '../../components/charts';
import ExportButton from '../../components/ExportButton';
import api from '../../lib/api';

export default function FinancialReportsPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  
  // Financial data states
  const [financialOverview, setFinancialOverview] = useState(null);
  const [revenueAnalytics, setRevenueAnalytics] = useState([]);
  const [profitabilityData, setProfitabilityData] = useState([]);
  const [paymentAnalytics, setPaymentAnalytics] = useState(null);
  const [refundAnalytics, setRefundAnalytics] = useState([]);
  const [taxData, setTaxData] = useState([]);

  useEffect(() => {
    fetchFinancialData();
  }, [period, customDateRange]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      const params = {
        period,
        ...(period === 'custom' && customDateRange.startDate && customDateRange.endDate && {
          startDate: customDateRange.startDate,
          endDate: customDateRange.endDate
        })
      };

      // Fetch all financial data in parallel
      const [
        overviewResponse,
        revenueResponse,
        profitabilityResponse,
        paymentResponse,
        refundResponse,
        taxResponse
      ] = await Promise.all([
        api.get('/admin/reports/financial-overview', { params }),
        api.get('/admin/reports/revenue-analytics', { params: { ...params, granularity: 'day' } }),
        api.get('/admin/reports/profitability-analysis', { params: { ...params, breakdown: 'category' } }),
        api.get('/admin/reports/payment-analytics', { params }),
        api.get('/admin/reports/refund-analytics', { params }),
        api.get('/admin/reports/tax-collection', { params })
      ]);

      setFinancialOverview(overviewResponse.data.keyValueTable.metrics);
      setRevenueAnalytics(revenueResponse.data.keyValueTable.data);
      setProfitabilityData(profitabilityResponse.data.keyValueTable.data);
      setPaymentAnalytics(paymentResponse.data.keyValueTable.analytics);
      setRefundAnalytics(refundResponse.data.keyValueTable.analytics);
      setTaxData(taxResponse.data.keyValueTable.data);
    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setCustomDateRange({ startDate: '', endDate: '' });
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-600 mt-1">Comprehensive financial analytics and reporting</p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center space-x-4">
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          
          <ExportButton
            endpoint="/admin/reports/export/financial-overview"
            filename={`financial-overview-${period}-${new Date().toISOString().split('T')[0]}.csv`}
            params={{
              period,
              ...(period === 'custom' && customDateRange.startDate && customDateRange.endDate && {
                startDate: customDateRange.startDate,
                endDate: customDateRange.endDate
              })
            }}
            variant="secondary"
          >
            Export Report
          </ExportButton>
          
          {period === 'custom' && (
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={customDateRange.startDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customDateRange.endDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>
      </div>

      {/* Financial Overview KPIs */}
      {financialOverview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gross Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(financialOverview.revenue.gross)}</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-medium ${
                  financialOverview.revenue.grossChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatPercentage(financialOverview.revenue.grossChange)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Net Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(financialOverview.revenue.net)}</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-medium ${
                  financialOverview.revenue.netChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatPercentage(financialOverview.revenue.netChange)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">{financialOverview.orders.total.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-medium ${
                  financialOverview.orders.totalChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatPercentage(financialOverview.orders.totalChange)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(financialOverview.revenue.avgOrderValue)}</p>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">
                  {financialOverview.orders.uniqueCustomers} customers
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Trend Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <LineChart
          data={revenueAnalytics}
          title="Revenue Trend"
          loading={loading}
          height={400}
          areaStyle={true}
          colors={['#3b82f6', '#10b981']}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Profitability */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <BarChart
            data={profitabilityData.map(item => ({
              name: item.categoryName,
              revenue: item.revenue,
              orders: item.orderCount
            }))}
            title="Category Performance"
            loading={loading}
            height={350}
            colors={['#3b82f6', '#10b981']}
          />
        </div>

        {/* Payment Methods Distribution */}
        {paymentAnalytics && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <PieChart
              data={paymentAnalytics.paymentMethods.map(method => ({
                name: method.method,
                value: method.totalAmount
              }))}
              title="Payment Methods Distribution"
              loading={loading}
              height={350}
            />
          </div>
        )}
      </div>

      {/* Additional Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Refund Analysis */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Refund Analysis</h3>
          <div className="space-y-4">
            {refundAnalytics.map((refund, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 capitalize">{refund.reason.replace('_', ' ')}</p>
                  <p className="text-sm text-gray-600">{refund.refundCount} refunds</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(refund.totalRefunded)}</p>
                  <p className="text-sm text-gray-600">Avg: {formatCurrency(refund.avgRefundAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax Collection */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Collection by Jurisdiction</h3>
          <div className="space-y-4">
            {taxData.slice(0, 5).map((tax, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{tax.state ? `${tax.state}, ${tax.country}` : tax.country}</p>
                  <p className="text-sm text-gray-600">{tax.orderCount} orders</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(tax.totalTaxCollected)}</p>
                  <p className="text-sm text-gray-600">{tax.effectiveTaxRate.toFixed(2)}% rate</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Analytics Details */}
      {paymentAnalytics && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Method Performance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentAnalytics.paymentMethods.map((method, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {method.method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {method.transactionCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(method.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        method.successRate >= 95 ? 'bg-green-100 text-green-800' :
                        method.successRate >= 90 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {method.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(method.avgAmount)}
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