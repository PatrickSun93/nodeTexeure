'use client';

import { useState, useEffect } from 'react';

/**
 * Abandoned Cart Analytics Component
 * Displays recovery statistics and metrics for admin dashboard
 */
export default function AbandonedCartAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:6666/api/abandoned-cart/analytics?days=${timeRange}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const result = await response.json();
      
      if (result.status === 'success') {
        setAnalytics(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch analytics');
      }
    } catch (err) {
      console.error('Error fetching abandoned cart analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerDetection = async () => {
    try {
      const response = await fetch('http://localhost:6666/api/abandoned-cart/detect', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      
      if (result.status === 'success') {
        alert(`Detection completed! Processed ${result.data.processedCarts} carts.`);
        fetchAnalytics(); // Refresh analytics
      } else {
        throw new Error(result.message || 'Failed to trigger detection');
      }
    } catch (err) {
      console.error('Error triggering detection:', err);
      alert('Failed to trigger detection: ' + err.message);
    }
  };

  const cleanupOldRecords = async () => {
    if (!confirm('Are you sure you want to clean up old abandoned cart records? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('http://localhost:6666/api/abandoned-cart/cleanup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      
      if (result.status === 'success') {
        alert(`Cleanup completed! Deleted ${result.data.deletedRecords} old records.`);
        fetchAnalytics(); // Refresh analytics
      } else {
        throw new Error(result.message || 'Failed to cleanup records');
      }
    } catch (err) {
      console.error('Error cleaning up records:', err);
      alert('Failed to cleanup records: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Analytics</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Abandoned Cart Analytics</h2>
          <div className="flex space-x-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={triggerDetection}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
            >
              Trigger Detection
            </button>
            <button
              onClick={cleanupOldRecords}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700"
            >
              Cleanup Old Records
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {analytics?.total_abandoned_carts || 0}
            </div>
            <div className="text-sm text-gray-600">Total Abandoned Carts</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {analytics?.recovered_carts || 0}
            </div>
            <div className="text-sm text-gray-600">Recovered Carts</div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {analytics?.pending_recovery || 0}
            </div>
            <div className="text-sm text-gray-600">Pending Recovery</div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {analytics?.recovery_rate_percentage || 0}%
            </div>
            <div className="text-sm text-gray-600">Recovery Rate</div>
          </div>
        </div>
      </div>

      {/* Recovery by Email Sequence */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recovery by Email Sequence</h3>
        
        {analytics?.recovery_by_sequence && analytics.recovery_by_sequence.length > 0 ? (
          <div className="space-y-3">
            {analytics.recovery_by_sequence.map((sequence, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-900">{sequence.email_sequence}</span>
                <span className="text-lg font-bold text-green-600">{sequence.recovered_count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="mt-2">No recovery data available for the selected time period</p>
          </div>
        )}
      </div>

      {/* Additional Metrics */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Metrics</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">
              {analytics?.avg_emails_sent ? parseFloat(analytics.avg_emails_sent).toFixed(1) : '0.0'}
            </div>
            <div className="text-sm text-gray-600">Average Emails Sent per Cart</div>
          </div>
          
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">
              {timeRange} days
            </div>
            <div className="text-sm text-gray-600">Analysis Period</div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <span className="font-medium text-gray-900">Abandoned Cart Detection</span>
            </div>
            <span className="text-sm text-green-600">Running (every 15 minutes)</span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <span className="font-medium text-gray-900">Email Queue Processor</span>
            </div>
            <span className="text-sm text-green-600">Running (every 30 seconds)</span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
              <span className="font-medium text-gray-900">Email Sequence</span>
            </div>
            <span className="text-sm text-blue-600">1 hour → 24 hours → 3 days</span>
          </div>
        </div>
      </div>
    </div>
  );
}