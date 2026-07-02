'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, BarChart, PieChart, GaugeChart } from '../../../components/charts';
import ExportButton from '../../../components/ExportButton';
import api from '../../../lib/api';

export default function PaymentAnalyticsPage() {
  const t = useTranslations('PaymentAnalytics');
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  // Payment data states
  const [paymentAnalytics, setPaymentAnalytics] = useState(null);
  const [successRates, setSuccessRates] = useState([]);
  const [processingCosts, setProcessingCosts] = useState([]);

  useEffect(() => {
    fetchPaymentData();
  }, [period]);

  const fetchPaymentData = async () => {
    setLoading(true);
    try {
      const params = { period };

      const [analyticsResponse, successRatesResponse, costsResponse] = await Promise.all([
        api.get('/admin/reports/payment-analytics', { params }),
        api.get('/admin/reports/payment-success-rates', { params: { ...params, granularity: 'day' } }),
        api.get('/admin/reports/payment-processing-costs', { params })
      ]);

      setPaymentAnalytics(analyticsResponse.data.keyValueTable.analytics);
      setSuccessRates(successRatesResponse.data.keyValueTable.data);
      setProcessingCosts(costsResponse.data.keyValueTable.data);
    } catch (error) {
      console.error('Error fetching payment data:', error);
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

  // Calculate totals
  const totalTransactions = paymentAnalytics?.paymentMethods.reduce((sum, method) => sum + method.transactionCount, 0) || 0;
  const totalVolume = paymentAnalytics?.paymentMethods.reduce((sum, method) => sum + method.totalAmount, 0) || 0;
  const totalFees = processingCosts.reduce((sum, cost) => sum + cost.totalFees, 0);
  const overallSuccessRate = paymentAnalytics?.paymentMethods.reduce((sum, method) => sum + method.successRate, 0) / (paymentAnalytics?.paymentMethods.length || 1) || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">{t('subtitle')}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="week">{t('periodWeek')}</option>
            <option value="month">{t('periodMonth')}</option>
            <option value="quarter">{t('periodQuarter')}</option>
            <option value="year">{t('periodYear')}</option>
          </select>

          <ExportButton
            endpoint="/admin/reports/export/payment-analytics"
            filename={`payment-analytics-${period}-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period }}
            variant="secondary"
          >
            {t('exportPaymentData')}
          </ExportButton>
        </div>
      </div>

      {/* Payment Overview KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalTransactions')}</p>
              <p className="text-2xl font-bold text-gray-900">{totalTransactions.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('paymentVolume')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalVolume)}</p>
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
              <p className="text-sm font-medium text-gray-600">{t('processingFees')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalFees)}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('successRate')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatPercentage(overallSuccessRate)}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Success Rate Trends */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <LineChart
          data={successRates.reduce((acc, item) => {
            const existingPeriod = acc.find(p => p.period === item.period);
            if (existingPeriod) {
              existingPeriod[`${item.paymentMethod}_success_rate`] = item.successRate;
            } else {
              acc.push({
                period: item.period,
                [`${item.paymentMethod}_success_rate`]: item.successRate
              });
            }
            return acc;
          }, [])}
          title={t('successRateTrends')}
          loading={loading}
          height={400}
          colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444']}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method Distribution */}
        {paymentAnalytics && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <PieChart
              data={paymentAnalytics.paymentMethods.map(method => ({
                name: method.method,
                value: method.totalAmount
              }))}
              title={t('volumeByMethod')}
              loading={loading}
              height={350}
            />
          </div>
        )}

        {/* Processing Costs Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <BarChart
            data={processingCosts.map(cost => ({
              name: cost.paymentMethod,
              totalFees: cost.totalFees,
              effectiveFeeRate: cost.effectiveFeeRate
            }))}
            title={t('costsByMethod')}
            loading={loading}
            height={350}
            colors={['#ef4444', '#f59e0b']}
          />
        </div>
      </div>

      {/* Payment Method Performance Table */}
      {paymentAnalytics && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">{t('methodPerformance')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('colPaymentMethod')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('colTransactions')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('colTotalVolume')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('colSuccessRate')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('colFailedCount')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('colAvgAmount')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentAnalytics.paymentMethods.map((method, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center">
                        <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                          method.type === 'credit_card' ? 'bg-blue-500' :
                          method.type === 'paypal' ? 'bg-yellow-500' :
                          'bg-gray-500'
                        }`}></span>
                        {method.method}
                      </div>
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
                        {formatPercentage(method.successRate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="text-red-600 font-medium">{method.failedCount}</span>
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

      {/* Processing Costs Analysis */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('costsAnalysis')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('colPaymentMethod')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('colTotalVolume')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('colTotalFees')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('colEffectiveRate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('colPercentageFees')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('colFixedFees')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {processingCosts.map((cost, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {cost.paymentMethod}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(cost.totalVolume)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="font-medium text-red-600">{formatCurrency(cost.totalFees)}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      cost.effectiveFeeRate >= 3 ? 'bg-red-100 text-red-800' :
                      cost.effectiveFeeRate >= 2.5 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {formatPercentage(cost.effectiveFeeRate)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(cost.percentageFees)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(cost.fixedFees)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
