'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LineChart, PieChart, BarChart, GaugeChart } from '@/components/charts';

// Security API functions
const securityAPI = {
  getDashboard: async (timeRange = '24h') => {
    const response = await fetch(`/api/admin/security/dashboard?timeRange=${timeRange}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  },

  getLoginAttempts: async (params = {}) => {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`/api/admin/security/login-attempts?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  },

  getThreats: async (params = {}) => {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`/api/admin/security/threats?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  },

  getSystemHealth: async () => {
    const response = await fetch('/api/admin/security/system-health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  }
};

// Security Metric Widget Component
function SecurityMetricWidget({ title, value, status, isLoading, icon, description }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'good':
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`admin-card border-l-4 ${getStatusColor(status)}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-20"></div>
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              {description && (
                <p className="text-xs text-gray-600 mt-1">{description}</p>
              )}
            </>
          )}
        </div>
        {icon && (
          <div className={`p-2 rounded-lg ${getStatusColor(status)}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// Alert Component
function SecurityAlert({ alert, onDismiss }) {
  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'high':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'low':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <div className={`p-3 border rounded-lg ${getSeverityColor(alert.severity)}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-white bg-opacity-50">
              {alert.severity?.toUpperCase()}
            </span>
            <span className="text-xs text-gray-600">
              {new Date(alert.timestamp).toLocaleString()}
            </span>
          </div>
          <p className="text-sm font-medium mt-1">{alert.message}</p>
          <p className="text-xs mt-1 opacity-75">{alert.type}</p>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(alert)}
            className="text-gray-400 hover:text-gray-600 ml-2"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// Time Range Selector
function TimeRangeSelector({ selectedRange, onRangeChange }) {
  const ranges = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' }
  ];

  return (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium text-gray-700">Time Range:</label>
      <select
        value={selectedRange}
        onChange={(e) => onRangeChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {ranges.map(range => (
          <option key={range.value} value={range.value}>
            {range.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Login Attempts Table
function LoginAttemptsTable({ attempts, isLoading }) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 bg-gray-200 rounded"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              IP Address
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User Agent
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {attempts && attempts.length > 0 ? (
            attempts.map((attempt, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(attempt.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {attempt.userId || 'Anonymous'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {attempt.ipAddress}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    attempt.success 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {attempt.success ? 'Success' : 'Failed'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                  {attempt.userAgent}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                No login attempts found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function SecurityDashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  // State management
  const [dashboardData, setDashboardData] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [threats, setThreats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Check authentication
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch security dashboard data
  const fetchSecurityData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [dashboardResponse, healthResponse, attemptsResponse, threatsResponse] = await Promise.all([
        securityAPI.getDashboard(selectedTimeRange),
        securityAPI.getSystemHealth(),
        securityAPI.getLoginAttempts({ 
          timeRange: selectedTimeRange, 
          limit: 20,
          page: 1 
        }),
        securityAPI.getThreats({ 
          timeRange: selectedTimeRange, 
          limit: 10,
          page: 1 
        })
      ]);

      if (dashboardResponse.success) {
        setDashboardData(dashboardResponse.data);
      }

      if (healthResponse.success) {
        setSystemHealth(healthResponse.data);
      }

      if (attemptsResponse.success) {
        setLoginAttempts(attemptsResponse.data.loginAttempts || []);
      }

      if (threatsResponse.success) {
        setThreats(threatsResponse.data.threats || []);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Security data fetch error:', err);
      setError(err.message || 'Failed to fetch security data');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTimeRange]);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchSecurityData();
    }
  }, [isAuthenticated, fetchSecurityData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      fetchSecurityData();
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchSecurityData]);

  const handleRefresh = () => {
    fetchSecurityData();
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
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Security Monitoring
              </h1>
              <button
                onClick={() => router.push('/security/audit')}
                className="admin-button admin-button-secondary text-sm"
              >
                View Audit Trail
              </button>
              <button
                onClick={() => router.push('/security/backup')}
                className="admin-button admin-button-secondary text-sm"
              >
                Backup Management
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <TimeRangeSelector 
                selectedRange={selectedTimeRange}
                onRangeChange={setSelectedTimeRange}
              />
              {lastUpdated && (
                <span className="text-sm text-gray-500">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={handleRefresh}
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

        {/* Security Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <SecurityMetricWidget
            title="Login Attempts"
            value={dashboardData?.loginMetrics?.total_attempts || 0}
            status={dashboardData?.loginMetrics?.failed_logins > dashboardData?.loginMetrics?.successful_logins ? 'warning' : 'good'}
            isLoading={isLoading}
            description={`${dashboardData?.loginMetrics?.successful_logins || 0} successful, ${dashboardData?.loginMetrics?.failed_logins || 0} failed`}
          />
          
          <SecurityMetricWidget
            title="Security Violations"
            value={dashboardData?.securityViolations?.length || 0}
            status={dashboardData?.securityViolations?.length > 5 ? 'critical' : dashboardData?.securityViolations?.length > 0 ? 'warning' : 'good'}
            isLoading={isLoading}
            description="Detected threats"
          />
          
          <SecurityMetricWidget
            title="System Health"
            value={systemHealth?.healthScores?.overall ? `${systemHealth.healthScores.overall}%` : 'N/A'}
            status={systemHealth?.healthScores?.overall > 90 ? 'good' : systemHealth?.healthScores?.overall > 70 ? 'warning' : 'critical'}
            isLoading={isLoading}
            description="Overall system health"
          />
          
          <SecurityMetricWidget
            title="Active Alerts"
            value={dashboardData?.alertsCount || 0}
            status={dashboardData?.alertsCount > 3 ? 'critical' : dashboardData?.alertsCount > 0 ? 'warning' : 'good'}
            isLoading={isLoading}
            description="Requires attention"
          />
        </div>

        {/* Active Alerts */}
        {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
          <div className="mb-8">
            <div className="admin-card">
              <h2 className="text-lg font-semibold mb-4 text-red-600">Active Security Alerts</h2>
              <div className="space-y-3">
                {dashboardData.alerts.map((alert, index) => (
                  <SecurityAlert key={index} alert={alert} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* System Health Gauges */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">System Health Metrics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Memory Usage</h3>
                <GaugeChart
                  data={[{
                    value: systemHealth?.systemMetrics?.memory?.system?.usagePercent || 0,
                    name: 'Memory'
                  }]}
                  loading={isLoading}
                  height={200}
                  max={100}
                  unit="%"
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Database Health</h3>
                <GaugeChart
                  data={[{
                    value: systemHealth?.healthScores?.database || 0,
                    name: 'Database'
                  }]}
                  loading={isLoading}
                  height={200}
                  max={100}
                  unit="%"
                />
              </div>
            </div>
          </div>

          {/* Login Success Rate */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Login Success Rate</h2>
            <PieChart
              data={[
                { 
                  name: 'Successful', 
                  value: dashboardData?.loginMetrics?.successful_logins || 0,
                  itemStyle: { color: '#10b981' }
                },
                { 
                  name: 'Failed', 
                  value: dashboardData?.loginMetrics?.failed_logins || 0,
                  itemStyle: { color: '#ef4444' }
                }
              ]}
              loading={isLoading}
              height={300}
              showLegend={true}
            />
          </div>
        </div>

        {/* Recent Login Attempts */}
        <div className="mb-8">
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Recent Login Attempts</h2>
            <LoginAttemptsTable attempts={loginAttempts} isLoading={isLoading} />
          </div>
        </div>

        {/* Security Threats */}
        {threats && threats.length > 0 && (
          <div className="mb-8">
            <div className="admin-card">
              <h2 className="text-lg font-semibold mb-4">Recent Security Threats</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Severity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IP Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {threats.map((threat, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(threat.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {threat.violationType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            threat.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                            threat.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                            threat.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {threat.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {threat.ipAddress}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                          {JSON.stringify(threat.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* System Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">System Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Platform:</span>
                <span className="text-sm font-medium">{systemHealth?.systemMetrics?.platform?.os}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Node Version:</span>
                <span className="text-sm font-medium">{systemHealth?.systemMetrics?.platform?.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Uptime:</span>
                <span className="text-sm font-medium">
                  {systemHealth?.systemMetrics?.uptime?.process 
                    ? Math.floor(systemHealth.systemMetrics.uptime.process / 3600) + 'h'
                    : 'N/A'
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Memory Usage:</span>
                <span className="text-sm font-medium">
                  {systemHealth?.systemMetrics?.memory?.system?.usagePercent}%
                </span>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Database Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Connection:</span>
                <span className={`text-sm font-medium ${
                  systemHealth?.databaseHealth?.connected ? 'text-green-600' : 'text-red-600'
                }`}>
                  {systemHealth?.databaseHealth?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Pool Connections:</span>
                <span className="text-sm font-medium">
                  {systemHealth?.databaseHealth?.connectionPool?.totalConnections || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Free Connections:</span>
                <span className="text-sm font-medium">
                  {systemHealth?.databaseHealth?.connectionPool?.freeConnections || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Database:</span>
                <span className="text-sm font-medium">
                  {systemHealth?.databaseHealth?.database || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}