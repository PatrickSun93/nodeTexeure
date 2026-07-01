'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, GaugeChart } from '@/components/charts';

// Backup API functions
const backupAPI = {
  getBackupStatus: async () => {
    const response = await fetch('/api/admin/security/backup-status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  },

  createBackup: async (backupType, description) => {
    const response = await fetch('/api/admin/security/create-backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ backupType, description })
    });
    return response.json();
  },

  getBackupHistory: async (params = {}) => {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`/api/admin/security/backup-history?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  },

  restoreBackup: async (backupId, restoreType, confirmRestore) => {
    const response = await fetch('/api/admin/security/restore-backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ backupId, restoreType, confirmRestore })
    });
    return response.json();
  },

  getDisasterRecovery: async () => {
    const response = await fetch('/api/admin/security/disaster-recovery', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    });
    return response.json();
  }
};

// Backup Status Widget
function BackupStatusWidget({ title, value, status, isLoading, description }) {
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'completed':
      case 'ready':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
      case 'in_progress':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'failed':
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`admin-card border-l-4 ${getStatusColor(status)}`}>
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
  );
}

// Create Backup Modal
function CreateBackupModal({ isOpen, onClose, onCreateBackup, isCreating }) {
  const [backupType, setBackupType] = useState('full');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreateBackup(backupType, description);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Create New Backup</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backup Type
            </label>
            <select
              value={backupType}
              onChange={(e) => setBackupType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="full">Full Backup</option>
              <option value="incremental">Incremental Backup</option>
              <option value="database">Database Only</option>
              <option value="files">Files Only</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter backup description..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="admin-button admin-button-secondary"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-button admin-button-primary"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Backup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Restore Confirmation Modal
function RestoreConfirmationModal({ isOpen, onClose, onConfirmRestore, backup, isRestoring }) {
  const [restoreType, setRestoreType] = useState('full');
  const [confirmText, setConfirmText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (confirmText === 'RESTORE') {
      onConfirmRestore(backup.id, restoreType);
    }
  };

  if (!isOpen || !backup) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4 text-red-600">Confirm Restore Operation</h2>
        
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            <strong>Warning:</strong> This operation will overwrite existing data. 
            This action cannot be undone.
          </p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">
            <strong>Backup ID:</strong> {backup.id}<br />
            <strong>Backup Date:</strong> {new Date(backup.startTime).toLocaleString()}<br />
            <strong>Backup Size:</strong> {backup.size}
          </p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Restore Type
            </label>
            <select
              value={restoreType}
              onChange={(e) => setRestoreType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="full">Full Restore</option>
              <option value="database">Database Only</option>
              <option value="files">Files Only</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type "RESTORE" to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESTORE to confirm"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="admin-button admin-button-secondary"
              disabled={isRestoring}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-button bg-red-600 hover:bg-red-700 text-white"
              disabled={isRestoring || confirmText !== 'RESTORE'}
            >
              {isRestoring ? 'Restoring...' : 'Confirm Restore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Backup History Table
function BackupHistoryTable({ backups, isLoading, onRestore }) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 bg-gray-200 rounded"></div>
        ))}
      </div>
    );
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Backup ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Start Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Size
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Initiated By
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {backups && backups.length > 0 ? (
            backups.map((backup, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {backup.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {backup.type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(backup.status)}`}>
                    {backup.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(backup.startTime).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {backup.size}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {backup.initiatedBy}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {backup.status === 'completed' && (
                    <button
                      onClick={() => onRestore(backup)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
                No backups found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function BackupManagementPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  // State management
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupHistory, setBackupHistory] = useState([]);
  const [drStatus, setDrStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Check authentication
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch backup data
  const fetchBackupData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [statusResponse, historyResponse, drResponse] = await Promise.all([
        backupAPI.getBackupStatus(),
        backupAPI.getBackupHistory({ page: 1, limit: 20 }),
        backupAPI.getDisasterRecovery()
      ]);

      if (statusResponse.success) {
        setBackupStatus(statusResponse.data);
      }

      if (historyResponse.success) {
        setBackupHistory(historyResponse.data.backups || []);
      }

      if (drResponse.success) {
        setDrStatus(drResponse.data);
      }
    } catch (err) {
      console.error('Backup data fetch error:', err);
      setError(err.message || 'Failed to fetch backup data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchBackupData();
    }
  }, [isAuthenticated, fetchBackupData]);

  const handleCreateBackup = async (backupType, description) => {
    try {
      setIsCreating(true);
      const response = await backupAPI.createBackup(backupType, description);
      
      if (response.success) {
        setShowCreateModal(false);
        fetchBackupData(); // Refresh data
      } else {
        setError(response.message || 'Failed to create backup');
      }
    } catch (err) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreBackup = async (backupId, restoreType) => {
    try {
      setIsRestoring(true);
      const response = await backupAPI.restoreBackup(backupId, restoreType, true);
      
      if (response.success) {
        setShowRestoreModal(false);
        setSelectedBackup(null);
        fetchBackupData(); // Refresh data
      } else {
        setError(response.message || 'Failed to initiate restore');
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate restore');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreClick = (backup) => {
    setSelectedBackup(backup);
    setShowRestoreModal(true);
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
                Backup & Recovery Management
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="admin-button admin-button-primary text-sm"
              >
                Create Backup
              </button>
              <button
                onClick={fetchBackupData}
                disabled={isLoading}
                className="admin-button admin-button-secondary text-sm"
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

        {/* Backup Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <BackupStatusWidget
            title="Backup System"
            value={backupStatus?.backupSystem?.enabled ? 'Enabled' : 'Disabled'}
            status={backupStatus?.backupHealth}
            isLoading={isLoading}
            description="System status"
          />
          
          <BackupStatusWidget
            title="Last Backup"
            value={backupStatus?.backupSystem?.lastBackup 
              ? new Date(backupStatus.backupSystem.lastBackup).toLocaleDateString()
              : 'Never'
            }
            status="completed"
            isLoading={isLoading}
            description="Most recent backup"
          />
          
          <BackupStatusWidget
            title="Next Scheduled"
            value={backupStatus?.backupSystem?.nextScheduledBackup 
              ? new Date(backupStatus.backupSystem.nextScheduledBackup).toLocaleDateString()
              : 'Not scheduled'
            }
            status="ready"
            isLoading={isLoading}
            description="Automatic backup"
          />
          
          <BackupStatusWidget
            title="Storage Usage"
            value={backupStatus?.storageUsage?.used || 'N/A'}
            status="healthy"
            isLoading={isLoading}
            description={`of ${backupStatus?.storageUsage?.total || 'N/A'} total`}
          />
        </div>

        {/* Storage Usage Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Storage Usage</h2>
            <GaugeChart
              data={[{
                value: backupStatus?.storageUsage ? 
                  (parseFloat(backupStatus.storageUsage.used) / parseFloat(backupStatus.storageUsage.total)) * 100 : 0,
                name: 'Storage'
              }]}
              loading={isLoading}
              height={300}
              max={100}
              unit="%"
            />
          </div>

          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Disaster Recovery Status</h2>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">DR Plan Status:</span>
                <span className={`text-sm font-medium ${
                  drStatus?.disasterRecoveryPlan?.status === 'READY' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {drStatus?.disasterRecoveryPlan?.status || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">RTO Target:</span>
                <span className="text-sm font-medium">{drStatus?.disasterRecoveryPlan?.rtoTarget || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">RPO Target:</span>
                <span className="text-sm font-medium">{drStatus?.disasterRecoveryPlan?.rpoTarget || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Last Tested:</span>
                <span className="text-sm font-medium">
                  {drStatus?.disasterRecoveryPlan?.lastTested 
                    ? new Date(drStatus.disasterRecoveryPlan.lastTested).toLocaleDateString()
                    : 'Never'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Backups */}
        <div className="admin-card mb-8">
          <h2 className="text-lg font-semibold mb-4">Recent Backups</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {backupStatus?.recentBackups?.map((backup, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{backup.id}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    backup.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {backup.status}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  <div>Type: {backup.type}</div>
                  <div>Size: {backup.size}</div>
                  <div>Date: {new Date(backup.startTime).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Backup History */}
        <div className="admin-card">
          <h2 className="text-lg font-semibold mb-4">Backup History</h2>
          <BackupHistoryTable
            backups={backupHistory}
            isLoading={isLoading}
            onRestore={handleRestoreClick}
          />
        </div>

        {/* Modals */}
        <CreateBackupModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreateBackup={handleCreateBackup}
          isCreating={isCreating}
        />

        <RestoreConfirmationModal
          isOpen={showRestoreModal}
          onClose={() => {
            setShowRestoreModal(false);
            setSelectedBackup(null);
          }}
          onConfirmRestore={handleRestoreBackup}
          backup={selectedBackup}
          isRestoring={isRestoring}
        />
      </main>
    </div>
  );
}