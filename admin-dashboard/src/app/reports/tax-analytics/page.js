'use client';

import { useState, useEffect } from 'react';
import { BarChart, PieChart, LineChart } from '../../../components/charts';
import ExportButton from '../../../components/ExportButton';
import api from '../../../lib/api';

export default function TaxAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [selectedJurisdiction, setSelectedJurisdiction] = useState('');
  
  // Tax data states
  const [taxCollection, setTaxCollection] = useState([]);
  const [jurisdictionDetails, setJurisdictionDetails] = useState(null);
  const [taxTrends, setTaxTrends] = useState([]);

  useEffect(() => {
    fetchTaxData();
  }, [period, selectedJurisdiction]);

  const fetchTaxData = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (selectedJurisdiction) {
        params.jurisdiction = selectedJurisdiction;
      }

      const [collectionResponse, detailsResponse] = await Promise.all([
        api.get('/admin/reports/tax-collection', { params }),
        api.get('/admin/reports/tax-jurisdiction-details', { params })
      ]);

      setTaxCollection(collectionResponse.data.keyValueTable.data);
      setJurisdictionDetails(detailsResponse.data.keyValueTable.data);
    } catch (error) {
      console.error('Error fetching tax data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(2)}%`;
  };

  const totalTaxCollected = taxCollection.reduce((sum, item) => sum + item.totalTaxCollected, 0);
  const totalOrders = taxCollection.reduce((sum, item) => sum + item.orderCount, 0);
  const avgTaxRate = taxCollection.length > 0 
    ? taxCollection.reduce((sum, item) => sum + item.effectiveTaxRate, 0) / taxCollection.length 
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tax Analytics</h1>
          <p className="text-gray-600 mt-1">Detailed tax collection and jurisdiction analysis</p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center space-x-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          
          <select
            value={selectedJurisdiction}
            onChange={(e) => setSelectedJurisdiction(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Jurisdictions</option>
            {taxCollection.map((item, index) => (
              <option key={index} value={item.country}>
                {item.state ? `${item.state}, ${item.country}` : item.country}
              </option>
            ))}
          </select>
          
          <ExportButton
            endpoint="/admin/reports/export/tax-collection"
            filename={`tax-collection-${period}-${new Date().toISOString().split('T')[0]}.csv`}
            params={{
              period,
              ...(selectedJurisdiction && { jurisdiction: selectedJurisdiction })
            }}
            variant="secondary"
          >
            Export Tax Data
          </ExportButton>
        </div>
      </div>

      {/* Tax Overview KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tax Collected</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalTaxCollected)}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Taxable Orders</p>
              <p className="text-2xl font-bold text-gray-900">{totalOrders.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Average Tax Rate</p>
              <p className="text-2xl font-bold text-gray-900">{formatPercentage(avgTaxRate)}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Jurisdictions</p>
              <p className="text-2xl font-bold text-gray-900">{taxCollection.length}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tax Collection by Jurisdiction */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <BarChart
            data={taxCollection.slice(0, 10).map(item => ({
              name: item.state ? `${item.state}, ${item.country}` : item.country,
              totalTaxCollected: item.totalTaxCollected,
              orderCount: item.orderCount
            }))}
            title="Tax Collection by Jurisdiction"
            loading={loading}
            height={400}
            colors={['#3b82f6', '#10b981']}
          />
        </div>

        {/* Tax Rate Distribution */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <PieChart
            data={taxCollection.slice(0, 8).map(item => ({
              name: item.state ? `${item.state}, ${item.country}` : item.country,
              value: item.totalTaxCollected
            }))}
            title="Tax Collection Distribution"
            loading={loading}
            height={400}
          />
        </div>
      </div>

      {/* Detailed Tax Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Tax Collection Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jurisdiction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tax Collected
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Taxable Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Effective Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Tax/Order
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {taxCollection.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.state ? `${item.state}, ${item.country}` : item.country}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.orderCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(item.totalTaxCollected)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(item.taxableAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.effectiveTaxRate >= 10 ? 'bg-red-100 text-red-800' :
                      item.effectiveTaxRate >= 5 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {formatPercentage(item.effectiveTaxRate)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(item.avgTaxPerOrder)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tax Exemptions and Zero-Tax Orders */}
      {jurisdictionDetails && jurisdictionDetails.exemptions && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Exemptions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-600">Zero-Tax Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {jurisdictionDetails.exemptions.zeroTaxOrders.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Total Value: {formatCurrency(jurisdictionDetails.exemptions.zeroTaxSubtotal)}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-600">Exemption Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalOrders > 0 
                  ? formatPercentage((jurisdictionDetails.exemptions.zeroTaxOrders / (totalOrders + jurisdictionDetails.exemptions.zeroTaxOrders)) * 100)
                  : '0.00%'
                }
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Of all orders processed
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}