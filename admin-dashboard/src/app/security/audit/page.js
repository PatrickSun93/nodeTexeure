'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LineChart, BarChart } from '@/components/charts';

// Audit API functions
const auditAPI = {
  getAuditTrail: async (params = {}) => {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`/api/admin/security/audit-trail?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  },

  getComplianceReport: async (params = {}) => {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`/api/admin/security/compliance-report?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  }
};

// Filter Component
function AuditFilters({ filters, onFiltersChange, onSearch, isLoading }) {
  const [localFilters, setLocalFilters] = useState(filters);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleSearch = () => {
    onSearch(localFilters);
  };

  return (
    <div className="admin-card mb-6">
      <h3 className="text-lg font-semibold mb-4">Audit Trail Filters</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
          <select
            value={localFilters.timeRange}
            onChange={(e) => handleFilterChange('timeRange', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Operation Type</label>
          <select
            value={localFilters.operationType}
            onChange={(e) => handleFilterChange('operationType', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Operations</option>
            <option value="USER_LOGIN">User Login</option>
            <option value="AUTH_FAILURE">Auth Failure</option>
            <option value="ADMIN_ACTION">Admin Action</option>
            <option value="PAYMENT_CONFIRM">Payment Confirm</option>
            <option value="SECURITY_VIOLATION">Security Violation</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
          <select
            value={localFilters.severity}
            onChange={(e) => handleFilterChange('severity', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Success Status</label>
          <select
            value={localFilters.success}
            onChange={(e) => handleFilterChange('success', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
          <input
            type="text"
            value={localFilters.userId}
            onChange={(e) => handleFilterChange('userId', e.target.value)}
            placeholder="Filter by user ID..."
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
          <input
            type="text"
            value={localFilters.ipAddress}
            onChange={(e) => handleFilterChange('ipAddress', e.target.value)}
            placeholder="Filter by IP address..."
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="admin-button admin-button-primary"
        >
          {isLoading ? 'Searching...' : 'Apply Filters'}
        </button>
        <button
          onClick={() => {
            const defaultFilters = {
              timeRange: '7d',
              operationType: 'all',
              severity: 'all',
              success: 'all',
              userId: '',
              ipAddress: ''
            };
            setLocalFilters(defaultFilters);
            onFiltersChange(defaultFilters);
            onSearch(defaultFilters);
          }}
          className="admin-button admin-button-secondary"
        >
          Reset Filters
        </button>
      </div>
    </div>
  );
}

// Audit Trail Table Component
function AuditTrailTable({ auditTrail, isLoading, pagination, onPageChange }) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 bg-gray-200 rounded"></div>
        ))}
      </div>
    );
  }

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="admin-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Audit Trail</h3>
        <div className="text-sm text-gray-600">
          Showing {auditTrail?.length || 0} of {pagination?.totalCount || 0} events
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Operation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Resource
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {auditTrail && auditTrail.length > 0 ? (
              auditTrail.map((event, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.operationType || event.action}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.userId || 'System'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.ipAddress || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(event.severity)}`}>
                      {event.severity || 'LOW'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      event.details?.response?.success !== false 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {event.details?.response?.success !== false ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.resourceType}
                    {event.resourceId && (
                      <div className="text-xs text-gray-500">{event.resourceId}</div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
                  No audit events found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Page {pagination.currentPage} of {pagination.totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onPageChange(pagination.currentPage - 1)}
              disabled={!pagination.hasPrev}
              className="admin-button admin-button-secondary text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNext}
              className="admin-button admin-button-secondary text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditTrailPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  // State management
  const [auditTrail, setAuditTrail] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    timeRange: '7d',
    operationType: 'all',
    severity: 'all',
    success: 'all',
    userId: '',
    ipAddress: '',
    page: 1,
    limit: 50
  });

  // Check authentication
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch audit trail data
  const fetchAuditTrail = useCallback(async (searchFilters = filters) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await auditAPI.getAuditTrail(searchFilters);

      if (response.success) {
        setAuditTrail(response.data.auditTrail || []);
        setPagination(response.data.pagination);
        setSummary(response.data.summary);
      } else {
        throw new Error(response.message || 'Failed to fetch audit trail');
      }
    } catch (err) {
      console.error('Audit trail fetch error:', err);
      setError(err.message || 'Failed to fetch audit trail');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchAuditTrail();
    }
  }, [isAuthenticated, fetchAuditTrail]);

  const handleFiltersChange = (newFilters) => {
    setFilters({ ...newFilters, page: 1 });
  };

  const handleSearch = (searchFilters) => {
    fetchAuditTrail({ ...searchFilters, page: 1 });
  };

  const handlePageChange = (newPage) => {
    const newFilters = { ...filters, page: newPage };
    setFilters(newFilters);
    fetchAuditTrail(newFilters);
  };

  const handleExportCSV = async () => {
    try {
      const response = await auditAPI.getComplianceReport({
        reportType: 'security_summary',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'csv'
      });

      // Create and download CSV file
      const blob = new Blob([response], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export audit trail');
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="admin-container">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/security')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Security
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Audit Trail
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleExportCSV}
                className="admin-button admin-button-secondary text-sm"
              >
                Export CSV
              </button>
              <button
                onClick={() => fetchAuditTrail()}
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
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="admin-card">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Events</h3>
              <p className="text-2xl font-bold text-gray-900">{summary.totalEvents}</p>
            </div>
            <div className="admin-card">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Critical Events</h3>
              <p className="text-2xl font-bold text-red-600">{summary.criticalEvents}</p>
            </div>
            <div className="admin-card">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Failed Operations</h3>
              <p className="text-2xl font-bold text-orange-600">{summary.failedOperations}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <AuditFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onSearch={handleSearch}
          isLoading={isLoading}
        />

        {/* Audit Trail Table */}
        <AuditTrailTable
          auditTrail={auditTrail}
          isLoading={isLoading}
          pagination={pagination}
          onPageChange={handlePageChange}
        />
      </main>
    </div>
  );
}