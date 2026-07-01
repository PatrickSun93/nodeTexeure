'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';

// Stock Management API functions
const stockAPI = {
  async getInventory(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory?${queryString}` : 'admin/inventory';
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

  async getMovements(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory/movements?${queryString}` : 'admin/inventory/movements';
    return apiRequest(endpoint);
  }
};

// Stock Adjustment Modal Component
function StockAdjustmentModal({ isOpen, onClose, item, onSubmit }) {
  const [adjustmentData, setAdjustmentData] = useState({
    quantity_change: '',
    reason: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasons = [
    'restock',
    'damage',
    'theft',
    'correction',
    'return',
    'other'
  ];

  useEffect(() => {
    if (isOpen) {
      setAdjustmentData({
        quantity_change: '',
        reason: '',
        notes: ''
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!adjustmentData.quantity_change || !adjustmentData.reason) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        product_id: item.product_id,
        variant_id: item.variant_id,
        ...adjustmentData,
        quantity_change: parseInt(adjustmentData.quantity_change)
      });
      onClose();
    } catch (error) {
      console.error('Error submitting adjustment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const variant = item?.size || item?.color || item?.pattern ? 
    `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
    'Base Product';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Adjust Stock</h3>
        
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="font-medium">{item?.product_name}</p>
          <p className="text-sm text-gray-600">SKU: {item?.product_sku}</p>
          {variant !== 'Base Product' && (
            <p className="text-sm text-gray-600">Variant: {variant}</p>
          )}
          <p className="text-sm text-gray-600">Current Stock: {item?.quantity_available}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity Change *
            </label>
            <input
              type="number"
              value={adjustmentData.quantity_change}
              onChange={(e) => setAdjustmentData(prev => ({ ...prev, quantity_change: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter positive or negative number"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Use positive numbers to increase stock, negative to decrease
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason *
            </label>
            <select
              value={adjustmentData.reason}
              onChange={(e) => setAdjustmentData(prev => ({ ...prev, reason: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select reason</option>
              {reasons.map(reason => (
                <option key={reason} value={reason}>
                  {reason.charAt(0).toUpperCase() + reason.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={adjustmentData.notes}
              onChange={(e) => setAdjustmentData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder="Additional notes (optional)"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adjusting...' : 'Adjust Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Reorder Points Modal Component
function ReorderPointsModal({ isOpen, onClose, item, onSubmit }) {
  const [reorderData, setReorderData] = useState({
    reorder_point: '',
    reorder_quantity: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setReorderData({
        reorder_point: item.reorder_point?.toString() || '',
        reorder_quantity: item.reorder_quantity?.toString() || ''
      });
    }
  }, [isOpen, item]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reorderData.reorder_point || !reorderData.reorder_quantity) {
      alert('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        item.id,
        parseInt(reorderData.reorder_point),
        parseInt(reorderData.reorder_quantity)
      );
      onClose();
    } catch (error) {
      console.error('Error updating reorder points:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const variant = item?.size || item?.color || item?.pattern ? 
    `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
    'Base Product';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Update Reorder Points</h3>
        
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="font-medium">{item?.product_name}</p>
          <p className="text-sm text-gray-600">SKU: {item?.product_sku}</p>
          {variant !== 'Base Product' && (
            <p className="text-sm text-gray-600">Variant: {variant}</p>
          )}
          <p className="text-sm text-gray-600">Current Stock: {item?.quantity_available}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reorder Point *
            </label>
            <input
              type="number"
              min="0"
              value={reorderData.reorder_point}
              onChange={(e) => setReorderData(prev => ({ ...prev, reorder_point: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Minimum stock level"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Alert when stock falls to this level
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reorder Quantity *
            </label>
            <input
              type="number"
              min="1"
              value={reorderData.reorder_quantity}
              onChange={(e) => setReorderData(prev => ({ ...prev, reorder_quantity: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Suggested reorder quantity"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Suggested quantity to reorder
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update Points'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Bulk Adjustment Modal Component
function BulkAdjustmentModal({ isOpen, onClose, selectedItems, onSubmit }) {
  const [bulkData, setBulkData] = useState({
    quantity_change: '',
    reason: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasons = [
    'restock',
    'damage',
    'theft',
    'correction',
    'return',
    'other'
  ];

  useEffect(() => {
    if (isOpen) {
      setBulkData({
        quantity_change: '',
        reason: '',
        notes: ''
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bulkData.quantity_change || !bulkData.reason) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const adjustments = selectedItems.map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity_change: parseInt(bulkData.quantity_change)
      }));

      await onSubmit(adjustments, bulkData.reason, bulkData.notes);
      onClose();
    } catch (error) {
      console.error('Error submitting bulk adjustment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Bulk Stock Adjustment</h3>
        
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">
            Adjusting {selectedItems.length} items
          </p>
          <div className="mt-2 max-h-32 overflow-y-auto">
            {selectedItems.slice(0, 5).map((item, index) => (
              <p key={index} className="text-xs text-gray-500">
                {item.product_name} - {item.product_sku}
              </p>
            ))}
            {selectedItems.length > 5 && (
              <p className="text-xs text-gray-500">
                ... and {selectedItems.length - 5} more items
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity Change *
            </label>
            <input
              type="number"
              value={bulkData.quantity_change}
              onChange={(e) => setBulkData(prev => ({ ...prev, quantity_change: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter positive or negative number"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              This change will be applied to all selected items
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason *
            </label>
            <select
              value={bulkData.reason}
              onChange={(e) => setBulkData(prev => ({ ...prev, reason: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select reason</option>
              {reasons.map(reason => (
                <option key={reason} value={reason}>
                  {reason.charAt(0).toUpperCase() + reason.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={bulkData.notes}
              onChange={(e) => setBulkData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder="Additional notes (optional)"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adjusting...' : 'Adjust All'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StockManagement() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading…</div>}>
      <StockManagementContent />
    </Suspense>
  );
}

function StockManagementContent() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // State management
  const [inventory, setInventory] = useState([]);
  const [movements, setMovements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    stock_level: 'all',
    category_id: '',
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({});

  // Modal states
  const [adjustmentModal, setAdjustmentModal] = useState({ isOpen: false, item: null });
  const [reorderModal, setReorderModal] = useState({ isOpen: false, item: null });
  const [bulkModal, setBulkModal] = useState({ isOpen: false });
  const [showMovements, setShowMovements] = useState(false);

  // Authentication check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Check for reorder parameters from URL
  useEffect(() => {
    const reorderProductId = searchParams.get('reorder');
    const reorderVariantId = searchParams.get('variant');
    
    if (reorderProductId && inventory.length > 0) {
      const item = inventory.find(inv => 
        inv.product_id === reorderProductId && 
        (inv.variant_id === reorderVariantId || (!reorderVariantId && !inv.variant_id))
      );
      
      if (item) {
        setAdjustmentModal({ isOpen: true, item });
      }
    }
  }, [searchParams, inventory]);

  // Fetch inventory data
  const fetchInventory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await stockAPI.getInventory(filters);

      if (response.success) {
        setInventory(response.data.inventory || []);
        setPagination(response.data.pagination || {});
      } else {
        throw new Error(response.message || 'Failed to fetch inventory');
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Fetch movement history
  const fetchMovements = useCallback(async () => {
    try {
      const response = await stockAPI.getMovements({ limit: 20 });
      if (response.success) {
        setMovements(response.data.movements || []);
      }
    } catch (err) {
      console.error('Error fetching movements:', err);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchInventory();
      fetchMovements();
    }
  }, [isAuthenticated, fetchInventory, fetchMovements]);

  // Handle stock adjustment
  const handleStockAdjustment = async (adjustmentData) => {
    try {
      const response = await stockAPI.adjustStock(adjustmentData);
      if (response.success) {
        await fetchInventory();
        await fetchMovements();
        alert('Stock adjusted successfully!');
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(`Error adjusting stock: ${getErrorMessage(err)}`);
      throw err;
    }
  };

  // Handle bulk adjustment
  const handleBulkAdjustment = async (adjustments, reason, notes) => {
    try {
      const response = await stockAPI.bulkAdjust(adjustments, reason, notes);
      if (response.success) {
        await fetchInventory();
        await fetchMovements();
        setSelectedItems([]);
        alert(`Bulk adjustment completed! ${response.data.successful} items updated successfully.`);
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(`Error performing bulk adjustment: ${getErrorMessage(err)}`);
      throw err;
    }
  };

  // Handle reorder points update
  const handleReorderPointsUpdate = async (inventoryId, reorderPoint, reorderQuantity) => {
    try {
      const response = await stockAPI.updateReorderPoints(inventoryId, reorderPoint, reorderQuantity);
      if (response.success) {
        await fetchInventory();
        alert('Reorder points updated successfully!');
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(`Error updating reorder points: ${getErrorMessage(err)}`);
      throw err;
    }
  };

  // Handle item selection
  const handleItemSelection = (item, isSelected) => {
    if (isSelected) {
      setSelectedItems(prev => [...prev, item]);
    } else {
      setSelectedItems(prev => prev.filter(selected => selected.id !== item.id));
    }
  };

  // Handle select all
  const handleSelectAll = (isSelected) => {
    if (isSelected) {
      setSelectedItems(inventory);
    } else {
      setSelectedItems([]);
    }
  };

  // Get stock status color
  const getStockStatusColor = (status) => {
    switch (status) {
      case 'out_of_stock': return 'text-red-600 bg-red-50';
      case 'low_stock': return 'text-yellow-600 bg-yellow-50';
      case 'in_stock': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
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
              <h1 className="text-xl font-semibold text-gray-900">
                Stock Management
              </h1>
              <nav className="flex items-center space-x-2">
                <a 
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  Dashboard
                </a>
                <span className="text-gray-400">/</span>
                <a 
                  href="/inventory"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  Inventory
                </a>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-900">Stock Management</span>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              {selectedItems.length > 0 && (
                <button
                  onClick={() => setBulkModal({ isOpen: true })}
                  className="admin-button admin-button-secondary text-sm"
                >
                  Bulk Adjust ({selectedItems.length})
                </button>
              )}
              <button
                onClick={() => setShowMovements(!showMovements)}
                className="admin-button admin-button-secondary text-sm"
              >
                {showMovements ? 'Hide' : 'Show'} History
              </button>
              <button
                onClick={fetchInventory}
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

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Products
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search by name or SKU"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stock Level
              </label>
              <select
                value={filters.stock_level}
                onChange={(e) => setFilters(prev => ({ ...prev, stock_level: e.target.value, page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Stock Levels</option>
                <option value="in_stock">In Stock</option>
                <option value="low">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Items per Page
              </label>
              <select
                value={filters.limit}
                onChange={(e) => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: 1 }))}
                className="admin-button admin-button-primary w-full"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Inventory Items</h2>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === inventory.length && inventory.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="mr-2"
                  />
                  Select All
                </label>
                {pagination.total && (
                  <span className="text-sm text-gray-500">
                    {pagination.total} total items
                  </span>
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="admin-spinner mx-auto mb-4"></div>
              <p>Loading inventory...</p>
            </div>
          ) : inventory.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No inventory items found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Select
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stock Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Available
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reserved
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reorder Point
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventory.map((item) => {
                    const isSelected = selectedItems.some(selected => selected.id === item.id);
                    const variant = item.size || item.color || item.pattern ? 
                      `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
                      null;

                    return (
                      <tr key={item.id} className={isSelected ? 'bg-blue-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleItemSelection(item, e.target.checked)}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="font-medium text-gray-900">{item.product_name}</p>
                            <p className="text-sm text-gray-500">SKU: {item.product_sku}</p>
                            {variant && (
                              <p className="text-sm text-gray-500">Variant: {variant}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStockStatusColor(item.stock_status)}`}>
                            {item.stock_status?.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.quantity_available}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.quantity_reserved}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.reorder_point} / {item.reorder_quantity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          <button
                            onClick={() => setAdjustmentModal({ isOpen: true, item })}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => setReorderModal({ isOpen: true, item })}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            Reorder Points
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Movement History */}
        {showMovements && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Recent Inventory Movements</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      By
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(movement.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{movement.product_name}</p>
                          <p className="text-sm text-gray-500">SKU: {movement.product_sku}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                          {movement.movement_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {movement.created_by_name || 'System'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <StockAdjustmentModal
        isOpen={adjustmentModal.isOpen}
        onClose={() => setAdjustmentModal({ isOpen: false, item: null })}
        item={adjustmentModal.item}
        onSubmit={handleStockAdjustment}
      />

      <ReorderPointsModal
        isOpen={reorderModal.isOpen}
        onClose={() => setReorderModal({ isOpen: false, item: null })}
        item={reorderModal.item}
        onSubmit={handleReorderPointsUpdate}
      />

      <BulkAdjustmentModal
        isOpen={bulkModal.isOpen}
        onClose={() => setBulkModal({ isOpen: false })}
        selectedItems={selectedItems}
        onSubmit={handleBulkAdjustment}
      />
    </div>
  );
}